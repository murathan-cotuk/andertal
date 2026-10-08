'use strict'

/**
 * Order cancellation money flow, shared by the customer self-cancel (/store/orders/:id/cancel) and
 * Sellercentral (POST /admin-hub/v1/orders/:id/cancel). Previously SC "Stornieren" only flipped
 * order_status for the superuser (no refund — the customer kept being charged) and was refused
 * (403) for sellers.
 *
 *   refundWholeOrderPayment  — full Stripe refund (settlement path when payables exist, legacy
 *                              charge refund otherwise); idempotency keys identical to the
 *                              customer path, so a double cancel never refunds twice.
 *   refundSellerLines        — one seller cancels its own, not yet shipped lines in a multi-seller
 *                              order: remaining lines + that seller's shipping (planReturnRefund).
 *   reverseBonusForCancel    — earned points back out, redeemed points back in (once per order).
 */

const settlement = require('./settlement')
const { planReturnRefund } = require('./settlement/return-refund')

async function hasPayables(client, orderId) {
  return (await client.query('SELECT 1 FROM seller_payables WHERE order_id = $1::uuid LIMIT 1', [orderId]).catch(() => ({ rows: [] }))).rows.length > 0
}

/**
 * @returns {Promise<{ ok: true, processing: boolean } | { ok: false, status: number, code?: string, message: string }>}
 */
async function refundWholeOrderPayment(client, { orderId, piId, totalCents, secretKey, actor, reason = 'cancellation' }) {
  if (!(Number(totalCents) > 0)) return { ok: true, processing: false }
  if (!piId) return { ok: false, status: 400, code: 'contact_support', message: 'Keine Zahlungsreferenz — bitte den Support kontaktieren.' }
  if (!secretKey) return { ok: false, status: 503, message: 'Zahlungsrückbuchung ist nicht konfiguriert.' }
  try {
    const stripe = new (require('stripe'))(secretKey)
    const pi = await stripe.paymentIntents.retrieve(piId)
    if (pi.status === 'requires_capture') {
      await stripe.paymentIntents.cancel(piId)
      return { ok: true, processing: false }
    }
    if (pi.status === 'canceled' || pi.status === 'requires_payment_method') return { ok: true, processing: false }
    if (pi.status !== 'succeeded') {
      return { ok: false, status: 400, message: `Zahlungsstatus „${pi.status}” — automatische Stornierung nicht möglich.` }
    }
    const ch = pi.latest_charge
    const chargeId = typeof ch === 'string' ? ch : ch?.id
    if (!chargeId) return { ok: false, status: 400, message: 'Keine Charge für Erstattung gefunden.' }
    if (await hasPayables(client, orderId)) {
      // Canonical path: full refund of every line + every seller's shipping, idempotent per
      // order, booked into the seller ledger only once Stripe confirms it.
      const lines = (await client.query(`SELECT order_item_id, quantity - refunded_quantity AS qty FROM seller_payables WHERE order_id = $1::uuid AND kind = 'item' AND quantity > refunded_quantity`, [orderId])).rows
        .map((l) => ({ order_item_id: l.order_item_id, quantity: Number(l.qty) }))
      const shipSellers = (await client.query(`SELECT DISTINCT seller_id FROM seller_payables WHERE order_id = $1::uuid AND kind = 'shipping'`, [orderId])).rows.map((r) => r.seller_id)
      const pay = (await client.query('SELECT gross_amount_cents FROM order_payments WHERE order_id = $1::uuid', [orderId])).rows[0]
      const { refund } = await settlement.createRefundRecord(client, {
        orderId, amountCents: Number(pay?.gross_amount_cents ?? totalCents), lines, shippingSellerIds: shipSellers,
        reason, actor, idempotencyKey: `cancel:${orderId}`,
      })
      const done = await settlement.executeRefund(client, stripe, refund.id, { actor })
      if (done.status === 'failed' || done.status === 'canceled') {
        return { ok: false, status: 502, message: `Stripe-Rückbuchung fehlgeschlagen: ${done.failure_reason || done.status}` }
      }
      return { ok: true, processing: done.status !== 'succeeded' }
    }
    // Legacy order (before settlement cutover): unchanged behaviour.
    const refundParams = { charge: chargeId }
    if (pi.transfer_data?.destination) {
      refundParams.reverse_transfer = true
      refundParams.refund_application_fee = true
    }
    await stripe.refunds.create(refundParams, { idempotencyKey: `andertal-cancel-${orderId}` })
    return { ok: true, processing: false }
  } catch (e) {
    return { ok: false, status: e?.status && e.status < 600 ? e.status : 502, message: e?.message || 'Stripe-Rückbuchung fehlgeschlagen' }
  }
}

/**
 * Seller cancels its own remaining lines (+ its shipping). Settlement orders only.
 * @returns {Promise<{ ok: true, processing: boolean, amount_cents: number, all_cancelled: boolean } | { ok: false, status: number, code?: string, message: string }>}
 */
async function refundSellerLines(client, { orderId, sellerId, secretKey, actor, stripe: stripeOverride = null }) {
  if (!(await hasPayables(client, orderId))) {
    return { ok: false, status: 409, code: 'contact_support', message: 'Ältere Bestellung — Stornierung bitte über den Support.' }
  }
  const { loadPayablesNetOfOpenRefunds } = require('./settlement/refunds')
  const payables = await loadPayablesNetOfOpenRefunds(client, orderId)
  const mine = payables.filter((p) => p.kind === 'item' && String(p.seller_id) === String(sellerId) && Number(p.quantity) > Number(p.refunded_quantity))
  if (!mine.length) return { ok: false, status: 409, code: 'nothing_to_cancel', message: 'Keine stornierbaren Positionen.' }
  const lines = mine.map((p) => ({ order_item_id: p.order_item_id, quantity: Number(p.quantity) - Number(p.refunded_quantity) }))
  const zeroPay = String((await client.query('SELECT checkout_payment_kind FROM store_orders WHERE id = $1::uuid', [orderId])).rows[0]?.checkout_payment_kind || '') === 'platform_loyalty'
  const pay = zeroPay ? null : (await client.query('SELECT gross_amount_cents FROM order_payments WHERE order_id = $1::uuid', [orderId])).rows[0]
  const plan = planReturnRefund(payables, { lines, paymentGrossCents: pay ? pay.gross_amount_cents : null })
  const stripe = stripeOverride || (secretKey ? new (require('stripe'))(secretKey) : null)
  if (!stripe && plan.amount_cents > 0) return { ok: false, status: 503, message: 'Zahlungsrückbuchung ist nicht konfiguriert.' }
  try {
    const { refund } = await settlement.createRefundRecord(client, {
      orderId, amountCents: plan.amount_cents, lines, shippingSellerIds: plan.shipping_seller_ids,
      actorSellerId: sellerId, reason: 'seller_cancellation', actor, idempotencyKey: `cancel:${orderId}:${sellerId}`,
    })
    const done = await settlement.executeRefund(client, stripe, refund.id, { actor })
    if (done.status === 'failed' || done.status === 'canceled') {
      return { ok: false, status: 502, message: `Stripe-Rückbuchung fehlgeschlagen: ${done.failure_reason || done.status}` }
    }
    const left = (await client.query(
      `SELECT 1 FROM seller_payables WHERE order_id = $1::uuid AND kind = 'item' AND quantity > refunded_quantity LIMIT 1`, [orderId],
    )).rows.length
    return { ok: true, processing: done.status !== 'succeeded', amount_cents: plan.amount_cents, all_cancelled: !left }
  } catch (e) {
    return { ok: false, status: e?.status && e.status < 600 ? e.status : 500, message: e?.message || 'Refund failed' }
  }
}

async function reverseBonusForCancel(client, { orderId, customerId, orderNumber, bonusPointsRedeemed = 0, appendBonusLedger }) {
  if (!customerId || typeof appendBonusLedger !== 'function') return
  try {
    const one = async (sql) => (await client.query(sql, [orderId])).rows
    const doneEarn = await one(`SELECT id FROM store_customer_bonus_ledger WHERE order_id = $1::uuid AND source = 'order_cancel_earn' LIMIT 1`)
    const doneRedeem = await one(`SELECT id FROM store_customer_bonus_ledger WHERE order_id = $1::uuid AND source = 'order_cancel_redeem' LIMIT 1`)
    const earnedPts = Number((await one(`SELECT COALESCE(SUM(points_delta), 0)::int AS total FROM store_customer_bonus_ledger WHERE order_id = $1::uuid AND source = 'order_earn'`))[0]?.total || 0)
    const redeemedPts = Number((await one(`SELECT COALESCE(SUM(points_delta), 0)::int AS total FROM store_customer_bonus_ledger WHERE order_id = $1::uuid AND source = 'order_redeem'`))[0]?.total || 0)
    if (earnedPts > 0 && !doneEarn.length) {
      await appendBonusLedger(client, {
        customerId,
        pointsDelta: -earnedPts,
        description: `Storno Bestellung #${orderNumber} — Punkte zurückgebucht (−${earnedPts})`,
        source: 'order_cancel_earn',
        orderId,
      })
    }
    const pointsToGiveBack = redeemedPts < 0 ? -redeemedPts : Number(bonusPointsRedeemed || 0)
    if (pointsToGiveBack > 0 && !doneRedeem.length) {
      await appendBonusLedger(client, {
        customerId,
        pointsDelta: pointsToGiveBack,
        description: `Storno Bestellung #${orderNumber} — eingelöste Punkte zurück (+${pointsToGiveBack})`,
        source: 'order_cancel_redeem',
        orderId,
      })
    }
  } catch (be) {
    console.warn('bonus reversal cancel:', be?.message || be)
  }
}

module.exports = { refundWholeOrderPayment, refundSellerLines, reverseBonusForCancel }
