'use strict'

const { withTx, lockKey, appendLedgerEntry, auditFinance } = require('./ledger')
const { allocateProportional, remainingGross, remainingShipping } = require('./money')
const { refreshEligibilityForOrder } = require('./payables')

/**
 * Whether a LOST chargeback also returns the platform commission (+ its VAT) to the seller.
 * The seller agreement (§12) is silent on chargebacks; under §305c Abs. 2 BGB an ambiguity in
 * standard terms is resolved against the drafter (Andertal), and a lost chargeback economically
 * rescinds the sale like a full refund — so the commission is reversed pro rata by default.
 * SETTLEMENT_CHARGEBACK_COMMISSION_REVERSAL=none keeps it (only after a §23 contract change).
 */
const chargebackReversesCommission = () =>
  String(process.env.SETTLEMENT_CHARGEBACK_COMMISSION_REVERSAL || 'proportional').trim().toLowerCase() !== 'none'

const disputeFeeBearer = () =>
  (String(process.env.SETTLEMENT_DISPUTE_FEE_BEARER || 'platform').trim().toLowerCase() === 'seller' ? 'seller' : 'platform')

async function findOrderForDispute(client, d) {
  const pi = typeof d.payment_intent === 'string' ? d.payment_intent : d.payment_intent?.id
  const charge = typeof d.charge === 'string' ? d.charge : d.charge?.id
  if (pi) {
    const r = await client.query('SELECT order_id FROM order_payments WHERE payment_intent_id = $1', [pi])
    if (r.rows[0]) return r.rows[0].order_id
    const o = await client.query('SELECT id FROM store_orders WHERE payment_intent_id = $1 LIMIT 1', [pi])
    if (o.rows[0]) return o.rows[0].id
  }
  if (charge) {
    const r = await client.query('SELECT order_id FROM order_payments WHERE charge_id = $1', [charge])
    if (r.rows[0]) return r.rows[0].order_id
    const o = await client.query('SELECT id FROM store_orders WHERE stripe_charge_id = $1 LIMIT 1', [charge])
    if (o.rows[0]) return o.rows[0].id
  }
  return null
}

/**
 * Handles charge.dispute.* (Phase 11). On open: blocks the order's payables and books CHARGEBACK
 * debits per seller (also when the payable was already paid → receivable). Won: books the exact
 * CHARGEBACK_RELEASE counter-entries. Lost: final, payables become 'charged_back'. Every booking
 * carries a per-dispute/per-payable idempotency key, so replays are harmless.
 */
async function handleDispute(client, d, { eventType, actor = 'stripe_webhook' } = {}) {
  const orderId = await findOrderForDispute(client, d)
  return withTx(client, async () => {
    if (orderId) await lockKey(client, `order:${orderId}`)
    const charge = typeof d.charge === 'string' ? d.charge : d.charge?.id
    const pi = typeof d.payment_intent === 'string' ? d.payment_intent : d.payment_intent?.id
    const up = await client.query(
      `INSERT INTO order_disputes (stripe_dispute_id, order_id, charge_id, payment_intent_id, amount_cents, currency, reason, stripe_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (stripe_dispute_id) DO UPDATE SET
         stripe_status = EXCLUDED.stripe_status, amount_cents = EXCLUDED.amount_cents,
         order_id = COALESCE(order_disputes.order_id, EXCLUDED.order_id), updated_at = now()
       RETURNING *`,
      [d.id, orderId, charge || null, pi || null, Number(d.amount) || 0, d.currency || 'eur', d.reason || null, d.status || null],
    )
    const dispute = up.rows[0]
    if (!orderId) {
      await auditFinance(client, { actor, action: 'dispute_without_order', entityType: 'dispute', entityId: d.id, details: { charge, pi } })
      return { dispute, orderId: null }
    }
    const fee = Array.isArray(d.balance_transactions)
      ? d.balance_transactions.reduce((s, bt) => s + Math.max(0, Number(bt.fee) || 0), 0)
      : null
    if (fee != null) await client.query('UPDATE order_disputes SET fee_cents = $2 WHERE id = $1', [dispute.id, fee])

    const closedWon = d.status === 'won' || d.status === 'warning_closed'
    const closedLost = d.status === 'lost'
    const payables = (await client.query('SELECT * FROM seller_payables WHERE order_id = $1::uuid ORDER BY kind, created_at, id', [orderId])).rows

    // Book the chargeback debits once per dispute (on its first sighting, whatever event that is).
    const already = (await client.query(
      `SELECT payable_id, -amount_cents AS cents FROM seller_ledger_entries WHERE dispute_id = $1 AND event_type = 'CHARGEBACK'`,
      [dispute.id],
    )).rows
    if (!already.length && !closedWon) {
      const pay = (await client.query('SELECT gross_amount_cents FROM order_payments WHERE order_id = $1::uuid', [orderId])).rows[0]
      const refundedCust = Number((await client.query(
        `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS c FROM order_refunds WHERE order_id = $1::uuid AND status = 'succeeded'`,
        [orderId],
      )).rows[0].c)
      const remaining = payables.map((p) => remainingGross(p) + remainingShipping(p))
      const remainingTotal = remaining.reduce((a, b) => a + b, 0)
      const disputable = pay ? Math.max(0, Number(pay.gross_amount_cents) - refundedCust) : remainingTotal
      // Full dispute of what is left → reverse each seller's full remaining credit; partial → pro rata.
      const total = disputable > 0
        ? Math.min(remainingTotal, Math.round(remainingTotal * Math.min(1, (Number(d.amount) || 0) / disputable)))
        : 0
      const parts = allocateProportional(total, remaining)
      for (let i = 0; i < payables.length; i++) {
        const p = payables[i]
        const cents = parts[i]
        if (cents <= 0) continue
        const ins = await appendLedgerEntry(client, {
          sellerId: p.seller_id, orderId, orderItemId: p.order_item_id, payableId: p.id, disputeId: dispute.id,
          eventType: 'CHARGEBACK', amountCents: -cents, currency: p.currency, referenceId: d.id,
          idempotencyKey: `CHARGEBACK:${d.id}:${p.id}`, metadata: { payable_status_at_dispute: p.status },
        })
        if (ins.inserted) {
          await client.query('UPDATE seller_payables SET chargeback_cents = chargeback_cents + $2 WHERE id = $1', [p.id, cents])
        }
      }
      await auditFinance(client, { actor, action: 'chargeback_booked', entityType: 'dispute', entityId: d.id, details: { order_id: orderId, total, event: eventType } })
    }

    if (closedWon) {
      const booked = (await client.query(
        `SELECT e.payable_id, -e.amount_cents AS cents, p.seller_id, p.order_item_id, p.currency
           FROM seller_ledger_entries e JOIN seller_payables p ON p.id = e.payable_id
          WHERE e.dispute_id = $1 AND e.event_type = 'CHARGEBACK'`,
        [dispute.id],
      )).rows
      for (const b of booked) {
        const ins = await appendLedgerEntry(client, {
          sellerId: b.seller_id, orderId, orderItemId: b.order_item_id, payableId: b.payable_id, disputeId: dispute.id,
          eventType: 'CHARGEBACK_RELEASE', amountCents: Number(b.cents), currency: b.currency, referenceId: d.id,
          idempotencyKey: `CHARGEBACK_RELEASE:${d.id}:${b.payable_id}`,
        })
        if (ins.inserted) {
          await client.query('UPDATE seller_payables SET chargeback_cents = chargeback_cents - $2 WHERE id = $1', [b.payable_id, Number(b.cents)])
        }
      }
      await client.query(`UPDATE order_disputes SET outcome = 'won', closed_at = COALESCE(closed_at, now()), updated_at = now() WHERE id = $1`, [dispute.id])
      await auditFinance(client, { actor, action: 'dispute_won', entityType: 'dispute', entityId: d.id, details: { order_id: orderId } })
    } else if (closedLost) {
      if (chargebackReversesCommission()) {
        const booked = (await client.query(
          `SELECT e.payable_id, -e.amount_cents AS cents FROM seller_ledger_entries e WHERE e.dispute_id = $1 AND e.event_type = 'CHARGEBACK'`,
          [dispute.id],
        )).rows
        for (const b of booked) {
          const p = payables.find((x) => String(x.id) === String(b.payable_id))
          if (!p || Number(p.commission_cents) <= 0 || Number(p.gross_cents) <= 0) continue
          const rev = Math.min(
            Number(p.commission_cents) - Number(p.refund_commission_reversal_cents),
            Math.round(Number(p.commission_cents) * Math.min(Number(b.cents), Number(p.gross_cents)) / Number(p.gross_cents)),
          )
          if (rev > 0) {
            await appendLedgerEntry(client, {
              sellerId: p.seller_id, orderId, orderItemId: p.order_item_id, payableId: p.id, disputeId: dispute.id,
              eventType: 'COMMISSION_REFUND', amountCents: rev, currency: p.currency, referenceId: d.id,
              idempotencyKey: `CHARGEBACK_COMMISSION_REFUND:${d.id}:${p.id}`,
            })
          }
          const vatRev = Math.min(
            Number(p.commission_vat_cents) - Number(p.refund_commission_vat_reversal_cents),
            Math.round(Number(p.commission_vat_cents) * Math.min(Number(b.cents), Number(p.gross_cents)) / Number(p.gross_cents)),
          )
          if (vatRev > 0) {
            await appendLedgerEntry(client, {
              sellerId: p.seller_id, orderId, orderItemId: p.order_item_id, payableId: p.id, disputeId: dispute.id,
              eventType: 'COMMISSION_REFUND', amountCents: vatRev, currency: p.currency, referenceId: d.id,
              idempotencyKey: `CHARGEBACK_COMMISSION_VAT_REFUND:${d.id}:${p.id}`, metadata: { vat: true },
            })
          }
        }
      }
      // Stripe debits dispute amount + fee from the platform. Recovering the FEE from the seller
      // is a commercial decision (Preisliste) → SETTLEMENT_DISPUTE_FEE_BEARER=seller, default platform.
      const feeCents = Number((await client.query('SELECT fee_cents FROM order_disputes WHERE id = $1', [dispute.id])).rows[0]?.fee_cents || 0)
      if (disputeFeeBearer() === 'seller' && feeCents > 0) {
        const shares = (await client.query(
          `SELECT seller_id, SUM(-amount_cents)::bigint AS cents FROM seller_ledger_entries WHERE dispute_id = $1 AND event_type = 'CHARGEBACK' GROUP BY seller_id ORDER BY seller_id`,
          [dispute.id],
        )).rows
        const parts = allocateProportional(feeCents, shares.map((x) => Number(x.cents)))
        for (let i = 0; i < shares.length; i++) {
          if (parts[i] <= 0) continue
          await appendLedgerEntry(client, {
            sellerId: shares[i].seller_id, orderId, disputeId: dispute.id, eventType: 'ADJUSTMENT', amountCents: -parts[i],
            referenceId: d.id, idempotencyKey: `DISPUTE_FEE:${d.id}:${shares[i].seller_id}`, metadata: { type: 'stripe_dispute_fee' },
          })
        }
      }
      await client.query(`UPDATE order_disputes SET outcome = 'lost', closed_at = COALESCE(closed_at, now()), updated_at = now() WHERE id = $1`, [dispute.id])
      await auditFinance(client, { actor, action: 'dispute_lost', entityType: 'dispute', entityId: d.id, details: { order_id: orderId } })
    }
    await refreshEligibilityForOrder(client, orderId)
    return { dispute, orderId }
  })
}

module.exports = { handleDispute, chargebackReversesCommission, disputeFeeBearer }
