'use strict'

const { syncOrderStatusAfterReturnRefund } = require('../order-refund-status')
const { withTx, lockKey, appendLedgerEntry, auditFinance } = require('./ledger')
const { allocateRefund } = require('./money')
const { refreshEligibilityForOrder, realSellerId } = require('./payables')

/** Stripe refund.status → our status. Only 'succeeded' ever books money. */
function mapStripeRefundStatus(s) {
  switch (String(s || '')) {
    case 'succeeded': return 'succeeded'
    case 'failed': return 'failed'
    case 'canceled': return 'canceled'
    default: return 'processing' // pending, requires_action
  }
}

/** Classifies thrown Stripe errors: only definitive rejections may mark a money move failed. */
function isDefinitiveStripeError(e) {
  const t = String(e?.type || e?.rawType || '')
  return t === 'StripeInvalidRequestError' || t === 'StripeCardError' || t === 'invalid_request_error' || t === 'card_error'
    || (Number(e?.statusCode) >= 400 && Number(e?.statusCode) < 500 && Number(e?.statusCode) !== 409 && Number(e?.statusCode) !== 429)
}

async function loadPayables(client, orderId) {
  return (await client.query('SELECT * FROM seller_payables WHERE order_id = $1::uuid ORDER BY kind, created_at, id', [orderId])).rows
}

/**
 * Payables as seen by a NEW refund: amounts already reserved by refunds that are still pending /
 * processing count as refunded, so two concurrent refunds can never allocate the same euro.
 */
async function loadPayablesNetOfOpenRefunds(client, orderId) {
  const ps = await loadPayables(client, orderId)
  const open = (await client.query(
    `SELECT l.payable_id, SUM(l.gross_cents)::bigint AS g, SUM(l.shipping_cents)::bigint AS s,
            SUM(l.commission_reversal_cents)::bigint AS c, SUM(l.commission_vat_reversal_cents)::bigint AS cv, SUM(l.quantity)::int AS q
       FROM order_refund_lines l JOIN order_refunds r ON r.id = l.refund_id
      WHERE r.order_id = $1::uuid AND r.status IN ('pending', 'processing')
      GROUP BY l.payable_id`,
    [orderId],
  )).rows
  const byId = new Map(open.map((o) => [String(o.payable_id), o]))
  return ps.map((p) => {
    const o = byId.get(String(p.id))
    if (!o) return p
    return {
      ...p,
      refunded_gross_cents: Number(p.refunded_gross_cents) + Number(o.g),
      refunded_shipping_cents: Number(p.refunded_shipping_cents) + Number(o.s),
      refund_commission_reversal_cents: Number(p.refund_commission_reversal_cents) + Number(o.c),
      refund_commission_vat_reversal_cents: Number(p.refund_commission_vat_reversal_cents) + Number(o.cv),
      refunded_quantity: Number(p.refunded_quantity) + Number(o.q),
    }
  })
}

/**
 * Creates the refund record (status 'pending') with its per-seller / per-item allocation.
 * Validation happens here, before any Stripe call:
 *   - customer amount ≤ what is still refundable on the payment
 *   - allocation ≤ what is still refundable per item / per seller shipping
 *   - a non-superuser actor may only touch lines of its own seller (Phase 20)
 *   - multi-seller orders need explicit lines or a seller scope for amount-only refunds
 * Idempotent on `idempotencyKey` (e.g. `return:<id>`): a retry returns the existing refund.
 */
async function createRefundRecord(client, {
  orderId, returnId = null, amountCents, lines = null, shippingSellerIds = [], sellerScope = null,
  reason = null, actor = 'system', actorSellerId = null, idempotencyKey,
}) {
  if (!idempotencyKey) throw Object.assign(new Error('idempotencyKey required'), { status: 400 })
  return withTx(client, async () => {
    await lockKey(client, `order:${orderId}`)
    const existing = await client.query('SELECT * FROM order_refunds WHERE idempotency_key = $1', [idempotencyKey])
    if (existing.rows[0]) return { refund: existing.rows[0], existing: true }

    const order = (await client.query('SELECT * FROM store_orders WHERE id = $1::uuid', [orderId])).rows[0]
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 })
    const payment = (await client.query('SELECT * FROM order_payments WHERE order_id = $1::uuid', [orderId])).rows[0]
    const payables = await loadPayablesNetOfOpenRefunds(client, orderId)
    if (!payables.length) throw Object.assign(new Error('Order has no seller payables — refund allocation impossible'), { status: 409 })

    const scope = realSellerId(sellerScope)
    let scoped = payables
    if (scope) scoped = payables.filter((p) => p.seller_id === scope)
    if (actorSellerId) {
      // Seller-initiated: every line must belong to the acting seller.
      const own = realSellerId(actorSellerId)
      const foreign = (lines || []).some((l) => {
        const p = payables.find((x) => x.kind === 'item' && String(x.order_item_id) === String(l.order_item_id))
        return !p || p.seller_id !== own
      })
      if (foreign || (scope && scope !== own) || (shippingSellerIds || []).some((s) => s !== own)) {
        throw Object.assign(new Error('Forbidden: refund touches another seller'), { status: 403 })
      }
      scoped = payables.filter((p) => p.seller_id === own)
    }
    const sellersOnOrder = new Set(payables.map((p) => p.seller_id))
    if ((!lines || !lines.length) && sellersOnOrder.size > 1 && !scope && !actorSellerId) {
      throw Object.assign(new Error('Multi-seller order: refund lines or seller scope required'), { status: 400 })
    }

    const customerAmount = Math.max(0, Math.round(Number(amountCents) || 0))
    const zeroPay = String(order.checkout_payment_kind || '') === 'platform_loyalty'
    let allocation
    try {
      allocation = lines && lines.length
        ? allocateRefund(payables, { lines, shippingSellerIds })
        : allocateRefund(scoped, { amountCents })
      // Lines refunded for LESS than the customer paid for them (e.g. Wertersatz deduction): the
      // seller is debited pro rata, not the full line value. "Customer paid for them" accounts
      // for platform-funded discounts (payment / credited value), so a full refund of a
      // coupon-discounted item still reverses the seller's full credit.
      if (lines && lines.length && !zeroPay && payment) {
        const credited = payables.reduce((s, p) => s + Number(p.gross_cents) + Number(p.shipping_cents), 0)
        const ratio = credited > 0 ? Math.min(1, Number(payment.gross_amount_cents) / credited) : 1
        const linesValue = allocation.reduce((s, l) => s + l.gross_cents + l.shipping_cents, 0)
        const customerEquivalent = Math.round(linesValue * ratio)
        if (customerAmount < customerEquivalent) {
          const sellerSide = customerEquivalent > 0 ? Math.round(linesValue * customerAmount / customerEquivalent) : 0
          const touched = new Set(allocation.filter((l) => l.kind === 'item').map((l) => String(l.payable_id)))
          allocation = allocateRefund(payables.filter((p) => touched.has(String(p.id))), { amountCents: Math.max(1, sellerSide) })
        }
      }
    } catch (e) {
      throw Object.assign(new Error(e.message), { status: 400 })
    }
    if (!zeroPay) {
      if (!payment) throw Object.assign(new Error('No verified payment snapshot for this order'), { status: 409 })
      const used = (await client.query(
        `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS c FROM order_refunds
          WHERE order_id = $1::uuid AND status IN ('pending', 'processing', 'succeeded')`,
        [orderId],
      )).rows[0].c
      const left = Number(payment.gross_amount_cents) - Number(used)
      if (customerAmount <= 0) throw Object.assign(new Error('Refund amount must be positive'), { status: 400 })
      if (customerAmount > left) {
        throw Object.assign(new Error(`Refund ${customerAmount} exceeds refundable payment amount ${left}`), { status: 400 })
      }
    }
    const sellerSide = allocation.reduce((s, l) => s + l.gross_cents + l.shipping_cents, 0)

    const ins = await client.query(
      `INSERT INTO order_refunds
         (order_id, return_id, amount_cents, currency, status, payment_intent_id, reason, idempotency_key,
          requested_by, seller_scope, platform_borne_cents)
       VALUES ($1::uuid, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [orderId, returnId, zeroPay ? 0 : customerAmount, payment?.currency || order.currency || 'eur',
        payment?.payment_intent_id || null, reason, idempotencyKey, actor, scope || realSellerId(actorSellerId),
        Math.max(0, (zeroPay ? 0 : customerAmount) - sellerSide)],
    )
    const refund = ins.rows[0]
    for (const l of allocation) {
      await client.query(
        `INSERT INTO order_refund_lines
           (refund_id, payable_id, seller_id, order_item_id, kind, quantity, gross_cents, shipping_cents, commission_reversal_cents, commission_vat_reversal_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [refund.id, l.payable_id, l.seller_id, l.order_item_id, l.kind, l.quantity, l.gross_cents, l.shipping_cents, l.commission_reversal_cents, l.commission_vat_reversal_cents || 0],
      )
    }
    await auditFinance(client, {
      actor, action: 'refund_requested', entityType: 'refund', entityId: refund.id,
      details: { order_id: orderId, return_id: returnId, amount_cents: refund.amount_cents, allocation },
    })
    await refreshEligibilityForOrder(client, orderId) // pending refund blocks payout
    return { refund, existing: false }
  })
}

/**
 * Books a succeeded refund into payables + ledger exactly once (ledger_applied_at guard plus
 * per-line idempotency keys). Works the same whether the payable is unpaid (reduces the next
 * payout) or already paid (entries become a receivable that offsets the next payout, Phase 10).
 */
async function applyRefundSucceeded(client, refundId, { stripeRefundId = null, actor = 'system' } = {}) {
  return withTx(client, async () => {
    const r0 = (await client.query('SELECT order_id FROM order_refunds WHERE id = $1', [refundId])).rows[0]
    if (!r0) throw new Error(`refund ${refundId} not found`)
    await lockKey(client, `order:${r0.order_id}`)
    const refund = (await client.query('SELECT * FROM order_refunds WHERE id = $1 FOR UPDATE', [refundId])).rows[0]
    if (refund.ledger_applied_at) return { applied: false, refund }
    const lines = (await client.query('SELECT * FROM order_refund_lines WHERE refund_id = $1 ORDER BY created_at, id', [refundId])).rows
    for (const l of lines) {
      const upd = await client.query(
        `UPDATE seller_payables
            SET refunded_gross_cents = refunded_gross_cents + $2,
                refunded_shipping_cents = refunded_shipping_cents + $3,
                refund_commission_reversal_cents = refund_commission_reversal_cents + $4,
                refunded_quantity = refunded_quantity + $5,
                refund_commission_vat_reversal_cents = refund_commission_vat_reversal_cents + $6
          WHERE id = $1
          RETURNING *`,
        [l.payable_id, Number(l.gross_cents), Number(l.shipping_cents), Number(l.commission_reversal_cents), Number(l.quantity), Number(l.commission_vat_reversal_cents || 0)],
      )
      const p = upd.rows[0]
      const base = { sellerId: l.seller_id, orderId: refund.order_id, orderItemId: l.order_item_id, payableId: l.payable_id, refundId, currency: refund.currency, referenceId: stripeRefundId || refund.stripe_refund_id }
      const debit = Number(l.gross_cents) + Number(l.shipping_cents)
      if (debit > 0) {
        await appendLedgerEntry(client, { ...base, eventType: 'REFUND', amountCents: -debit, idempotencyKey: `REFUND:${l.id}`, metadata: { payable_status_at_refund: p.status } })
      }
      if (Number(l.commission_reversal_cents) > 0) {
        await appendLedgerEntry(client, { ...base, eventType: 'COMMISSION_REFUND', amountCents: Number(l.commission_reversal_cents), idempotencyKey: `COMMISSION_REFUND:${l.id}` })
      }
      if (Number(l.commission_vat_reversal_cents) > 0) {
        await appendLedgerEntry(client, { ...base, eventType: 'COMMISSION_REFUND', amountCents: Number(l.commission_vat_reversal_cents), idempotencyKey: `COMMISSION_VAT_REFUND:${l.id}`, metadata: { vat: true } })
      }
    }
    await client.query(
      `UPDATE order_refunds SET status = 'succeeded', ledger_applied_at = now(), succeeded_at = COALESCE(succeeded_at, now()),
              stripe_refund_id = COALESCE(stripe_refund_id, $2), updated_at = now()
        WHERE id = $1`,
      [refundId, stripeRefundId],
    )
    if (refund.return_id) {
      await client.query(
        `UPDATE store_returns SET refund_status = 'erstattet', refund_failure_reason = NULL, updated_at = now() WHERE id = $1::uuid`,
        [refund.return_id],
      ).catch(() => {})
    }
    // Order header reflects money reality only after Stripe confirmed it.
    const totals = (await client.query(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE status = 'succeeded'), 0)::bigint AS refunded,
              (SELECT gross_amount_cents FROM order_payments WHERE order_id = $1::uuid) AS paid
         FROM order_refunds WHERE order_id = $1::uuid`,
      [refund.order_id],
    )).rows[0]
    if (totals.paid != null && Number(totals.refunded) >= Number(totals.paid) && Number(totals.paid) > 0) {
      await client.query(`UPDATE order_payments SET status = 'refunded', updated_at = now() WHERE order_id = $1::uuid`, [refund.order_id])
      await client.query(
        `UPDATE store_orders SET payment_status = 'refunded',
                order_status = CASE WHEN order_status = 'storniert' THEN order_status ELSE 'refunded' END,
                updated_at = now()
          WHERE id = $1::uuid`,
        [refund.order_id],
      )
    } else if (Number(totals.refunded) > 0) {
      await client.query(`UPDATE order_payments SET status = 'partially_refunded', updated_at = now() WHERE order_id = $1::uuid`, [refund.order_id])
      if (refund.return_id) await syncOrderStatusAfterReturnRefund(client, refund.order_id)
    }
    await auditFinance(client, { actor, action: 'refund_succeeded', entityType: 'refund', entityId: refundId, details: { stripe_refund_id: stripeRefundId } })
    await refreshEligibilityForOrder(client, refund.order_id)
    return { applied: true, refund }
  })
}

async function markRefundFailed(client, refundId, { reason, status = 'failed', actor = 'system' } = {}) {
  return withTx(client, async () => {
    const refund = (await client.query('SELECT * FROM order_refunds WHERE id = $1 FOR UPDATE', [refundId])).rows[0]
    if (!refund) return null
    if (refund.status === 'succeeded') {
      // A succeeded refund never flips back silently — Stripe reports reversals as new events.
      await auditFinance(client, { actor, action: 'refund_failure_after_success_ignored', entityType: 'refund', entityId: refundId, details: { reason } })
      return refund
    }
    await client.query(
      `UPDATE order_refunds SET status = $2, failure_reason = $3, updated_at = now() WHERE id = $1`,
      [refundId, status, reason || null],
    )
    if (refund.return_id) {
      await client.query(
        `UPDATE store_returns SET refund_status = 'fehlgeschlagen', refund_failure_reason = $2, updated_at = now() WHERE id = $1::uuid`,
        [refund.return_id, reason || status],
      ).catch(() => {})
    }
    await auditFinance(client, { actor, action: `refund_${status}`, entityType: 'refund', entityId: refundId, details: { reason } })
    await refreshEligibilityForOrder(client, refund.order_id)
    return { ...refund, status }
  })
}

/**
 * Sends a pending refund to Stripe (idempotency key = refund id, so a retried request can never
 * create a second Stripe refund) and records the outcome. Zero-pay orders (bonus/coupon only)
 * move no card money: the seller-side allocation is booked directly.
 */
async function executeRefund(client, stripe, refundId, { actor = 'system' } = {}) {
  const refund = (await client.query('SELECT * FROM order_refunds WHERE id = $1', [refundId])).rows[0]
  if (!refund) throw new Error('refund not found')
  if (refund.status === 'succeeded' || refund.status === 'failed' || refund.status === 'canceled') return refund
  if (refund.stripe_refund_id && refund.status === 'processing') return refund // webhook will finish it
  if (Number(refund.amount_cents) === 0) {
    await applyRefundSucceeded(client, refundId, { actor })
    return (await client.query('SELECT * FROM order_refunds WHERE id = $1', [refundId])).rows[0]
  }
  if (!stripe) throw new Error('Stripe not configured')
  if (!refund.payment_intent_id) {
    await markRefundFailed(client, refundId, { reason: 'no_payment_intent', actor })
    return (await client.query('SELECT * FROM order_refunds WHERE id = $1', [refundId])).rows[0]
  }
  let sr
  try {
    sr = await stripe.refunds.create(
      {
        payment_intent: refund.payment_intent_id,
        amount: Number(refund.amount_cents),
        metadata: { refund_id: refund.id, order_id: refund.order_id, return_id: refund.return_id || '' },
      },
      { idempotencyKey: `andertal-refund-${refund.id}` },
    )
  } catch (e) {
    if (isDefinitiveStripeError(e)) {
      await markRefundFailed(client, refundId, { reason: e?.message || 'stripe_rejected', actor })
    } else {
      // Unknown outcome (network / 5xx): keep 'pending' — a retry reuses the same idempotency key.
      await auditFinance(client, { actor, action: 'refund_stripe_unknown_outcome', entityType: 'refund', entityId: refundId, details: { error: e?.message } })
    }
    return (await client.query('SELECT * FROM order_refunds WHERE id = $1', [refundId])).rows[0]
  }
  await client.query(
    `UPDATE order_refunds SET stripe_refund_id = $2, status = CASE WHEN status = 'pending' THEN 'processing' ELSE status END, updated_at = now()
      WHERE id = $1`,
    [refundId, sr.id],
  )
  await syncStripeRefund(client, sr, { actor })
  return (await client.query('SELECT * FROM order_refunds WHERE id = $1', [refundId])).rows[0]
}

/**
 * Applies a Stripe Refund object (from the API response or a webhook) to our record. Refunds
 * created outside Andertal (Stripe Dashboard) are recorded too; they are allocated only when the
 * order has a single seller — otherwise the order is blocked for manual allocation.
 */
async function syncStripeRefund(client, sr, { actor = 'stripe_webhook' } = {}) {
  let refund = (await client.query('SELECT * FROM order_refunds WHERE stripe_refund_id = $1', [sr.id])).rows[0]
  if (!refund && sr.metadata?.refund_id) {
    refund = (await client.query('SELECT * FROM order_refunds WHERE id::text = $1', [String(sr.metadata.refund_id)])).rows[0]
    if (refund && !refund.stripe_refund_id) {
      await client.query('UPDATE order_refunds SET stripe_refund_id = $2, updated_at = now() WHERE id = $1', [refund.id, sr.id])
    }
  }
  if (!refund) refund = await adoptExternalRefund(client, sr)
  if (!refund) return null
  const status = mapStripeRefundStatus(sr.status)
  if (status === 'succeeded') await applyRefundSucceeded(client, refund.id, { stripeRefundId: sr.id, actor })
  else if (status === 'failed' || status === 'canceled') await markRefundFailed(client, refund.id, { reason: sr.failure_reason || status, status, actor })
  else if (refund.status === 'pending') {
    await client.query(`UPDATE order_refunds SET status = 'processing', updated_at = now() WHERE id = $1`, [refund.id])
  }
  return (await client.query('SELECT * FROM order_refunds WHERE id = $1', [refund.id])).rows[0]
}

async function adoptExternalRefund(client, sr) {
  const pi = typeof sr.payment_intent === 'string' ? sr.payment_intent : sr.payment_intent?.id
  if (!pi) return null
  const pay = (await client.query('SELECT * FROM order_payments WHERE payment_intent_id = $1', [pi])).rows[0]
  const orderId = pay?.order_id || (await client.query('SELECT id FROM store_orders WHERE payment_intent_id = $1 LIMIT 1', [pi])).rows[0]?.id
  if (!orderId) return null
  const payables = await loadPayables(client, orderId)
  const sellers = [...new Set(payables.map((p) => p.seller_id))]
  if (sellers.length === 1) {
    const r = await createRefundRecord(client, {
      orderId, amountCents: Number(sr.amount), sellerScope: sellers[0], reason: 'stripe_dashboard_refund',
      actor: 'stripe_dashboard', idempotencyKey: `stripe_refund:${sr.id}`,
    }).catch(async (e) => {
      await auditFinance(client, { action: 'external_refund_unallocatable', entityType: 'order', entityId: orderId, details: { stripe_refund_id: sr.id, error: e.message } })
      return null
    })
    if (!r) return null
    await client.query('UPDATE order_refunds SET stripe_refund_id = $2, updated_at = now() WHERE id = $1', [r.refund.id, sr.id])
    return { ...r.refund, stripe_refund_id: sr.id }
  }
  // Multi-seller order refunded in the Dashboard: never guess the split. Block payout instead.
  await withTx(client, async () => {
    await client.query(
      `INSERT INTO order_refunds (order_id, amount_cents, currency, status, payment_intent_id, stripe_refund_id, reason, idempotency_key, requested_by)
       VALUES ($1::uuid, $2, $3, 'pending', $4, $5, 'stripe_dashboard_refund_unallocated', $6, 'stripe_dashboard')
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [orderId, Number(sr.amount), sr.currency || 'eur', pi, sr.id, `stripe_refund:${sr.id}`],
    )
    await auditFinance(client, { action: 'external_refund_needs_allocation', entityType: 'order', entityId: orderId, details: { stripe_refund_id: sr.id, amount: sr.amount } })
    await refreshEligibilityForOrder(client, orderId)
  })
  return null // stays 'pending' (blocks payout) until a superuser allocates it
}

/**
 * Superuser allocation of a refund that Stripe already executed but that could not be split
 * automatically (Dashboard refund on a multi-seller order). Writes the lines and books the ledger
 * exactly like any other succeeded refund.
 */
async function allocateExternalRefund(client, refundId, { lines = null, sellerId = null, shippingSellerIds = [], actor = 'superuser' } = {}) {
  return withTx(client, async () => {
    const r0 = (await client.query('SELECT order_id FROM order_refunds WHERE id = $1', [refundId])).rows[0]
    if (!r0) throw Object.assign(new Error('refund not found'), { status: 404 })
    await lockKey(client, `order:${r0.order_id}`)
    const refund = (await client.query('SELECT * FROM order_refunds WHERE id = $1 FOR UPDATE', [refundId])).rows[0]
    if (refund.ledger_applied_at) throw Object.assign(new Error('refund already booked'), { status: 409 })
    if (!refund.stripe_refund_id) throw Object.assign(new Error('only Stripe-executed refunds can be allocated here'), { status: 409 })
    const has = (await client.query('SELECT 1 FROM order_refund_lines WHERE refund_id = $1 LIMIT 1', [refundId])).rows.length
    if (has) throw Object.assign(new Error('refund already has an allocation'), { status: 409 })
    const others = (await loadPayablesNetOfOpenRefunds(client, refund.order_id))
    let allocation
    try {
      if (Array.isArray(lines) && lines.length) allocation = allocateRefund(others, { lines, shippingSellerIds })
      else {
        const sid = realSellerId(sellerId)
        if (!sid) throw new Error('lines or seller_id required')
        allocation = allocateRefund(others.filter((p) => p.seller_id === sid), { amountCents: Number(refund.amount_cents) })
      }
    } catch (e) {
      throw Object.assign(new Error(e.message), { status: 400 })
    }
    for (const l of allocation) {
      await client.query(
        `INSERT INTO order_refund_lines
           (refund_id, payable_id, seller_id, order_item_id, kind, quantity, gross_cents, shipping_cents, commission_reversal_cents, commission_vat_reversal_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [refundId, l.payable_id, l.seller_id, l.order_item_id, l.kind, l.quantity, l.gross_cents, l.shipping_cents, l.commission_reversal_cents, l.commission_vat_reversal_cents || 0],
      )
    }
    const sellerSide = allocation.reduce((s, l) => s + l.gross_cents + l.shipping_cents, 0)
    await client.query('UPDATE order_refunds SET platform_borne_cents = $2, updated_at = now() WHERE id = $1', [refundId, Math.max(0, Number(refund.amount_cents) - sellerSide)])
    await auditFinance(client, { actor, action: 'refund_allocated_manually', entityType: 'refund', entityId: refundId, details: { allocation } })
    return applyRefundSucceeded(client, refundId, { stripeRefundId: refund.stripe_refund_id, actor })
  })
}

module.exports = {
  loadPayablesNetOfOpenRefunds,
  allocateExternalRefund,
  createRefundRecord,
  executeRefund,
  applyRefundSucceeded,
  markRefundFailed,
  syncStripeRefund,
  mapStripeRefundStatus,
  isDefinitiveStripeError,
}
