'use strict'

/**
 * Refund amount for a return (Widerruf), computed by the backend — never by the browser.
 *
 * §357 Abs. 2 BGB: on withdrawal the trader refunds the goods AND the original standard
 * delivery cost. On a partial withdrawal the outbound shipping stays with the trader only while
 * some of the seller's goods remain with the customer — so shipping is added exactly when this
 * return completes the withdrawal of all items of that seller in the order.
 *
 * Amounts follow the same customer-equivalent rule as createRefundRecord: platform-funded
 * discounts (coupon / bonus points) scale the value the customer actually paid.
 */

const { allocateRefund } = require('./money')

const toInt = (v) => Math.round(Number(v) || 0)

/**
 * @param {Array} payables  seller_payables of the order, net of refunds still pending/processing
 * @param {{ lines: Array<{order_item_id, quantity}>, paymentGrossCents?: number|null }} opts
 */
function planReturnRefund(payables, { lines, paymentGrossCents = null }) {
  if (!Array.isArray(lines) || !lines.length) throw new Error('return has no item lines')
  const itemsOnly = allocateRefund(payables, { lines })
  const returnedQty = new Map(payables.map((p) => [String(p.id), toInt(p.refunded_quantity)]))
  for (const l of itemsOnly) returnedQty.set(String(l.payable_id), returnedQty.get(String(l.payable_id)) + toInt(l.quantity))

  const sellers = [...new Set(itemsOnly.map((l) => String(l.seller_id)))]
  const shippingSellerIds = sellers.filter((sid) =>
    payables
      .filter((p) => p.kind === 'item' && String(p.seller_id) === sid)
      .every((p) => returnedQty.get(String(p.id)) >= toInt(p.quantity)))

  const allocation = allocateRefund(payables, { lines, shippingSellerIds })
  const goods = allocation.reduce((s, l) => s + toInt(l.gross_cents), 0)
  const shipping = allocation.reduce((s, l) => s + toInt(l.shipping_cents), 0)
  const credited = payables.reduce((s, p) => s + toInt(p.gross_cents) + toInt(p.shipping_cents), 0)
  const ratio = paymentGrossCents != null && credited > 0 ? Math.min(1, toInt(paymentGrossCents) / credited) : 1
  const amount = Math.round((goods + shipping) * ratio)
  const goodsCustomer = Math.round(goods * ratio)
  return {
    amount_cents: amount,
    goods_cents: goodsCustomer,
    shipping_cents: amount - goodsCustomer,
    shipping_seller_ids: shippingSellerIds.filter((sid) => allocation.some((l) => l.kind === 'shipping' && String(l.seller_id) === sid)),
  }
}

/** Return row → its item lines (store_returns.items jsonb). */
function returnLines(ret) {
  let items = ret && ret.items
  if (typeof items === 'string') { try { items = JSON.parse(items) } catch (_) { items = null } }
  return Array.isArray(items)
    ? items.filter((it) => it && it.order_item_id).map((it) => ({ order_item_id: it.order_item_id, quantity: Math.max(1, toInt(it.quantity) || 1) }))
    : []
}

/**
 * Suggested refund for a return, or null for legacy orders (no payables) / returns without lines.
 * Read-only. Uses the same "net of open refunds" view as a new refund would.
 */
async function suggestReturnRefund(client, ret) {
  const lines = returnLines(ret)
  if (!ret || !ret.order_id || !lines.length) return null
  const { loadPayablesNetOfOpenRefunds } = require('./refunds')
  const payables = await loadPayablesNetOfOpenRefunds(client, ret.order_id)
  if (!payables.length) return null
  const order = (await client.query('SELECT checkout_payment_kind FROM store_orders WHERE id = $1::uuid', [ret.order_id])).rows[0]
  const zeroPay = String(order && order.checkout_payment_kind || '') === 'platform_loyalty'
  const payment = zeroPay ? null : (await client.query('SELECT gross_amount_cents FROM order_payments WHERE order_id = $1::uuid', [ret.order_id])).rows[0]
  try {
    return planReturnRefund(payables, { lines, paymentGrossCents: payment ? payment.gross_amount_cents : null })
  } catch (_) {
    return null // e.g. items already fully refunded
  }
}

module.exports = { planReturnRefund, returnLines, suggestReturnRefund }
