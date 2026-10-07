'use strict'

/**
 * Withdrawal (Widerruf) rules for customer return requests.
 *
 * - §355 Abs. 2 / §356 Abs. 2 BGB: 14 days, starting with receipt of the goods. Under §§187/188
 *   BGB the delivery day itself does not count and the period ends at the END of the last day
 *   (local time, Europe/Berlin) — not 14×24 h after the delivery timestamp.
 * - A longer return period shown on the product page (metadata.return_days) is a binding
 *   promise, so the longest applicable period wins; it is never shorter than 14 days.
 * - Before delivery the customer can always withdraw (no deadline yet).
 * - Several returns per order are allowed; only quantities already requested in a return that
 *   was not rejected are subtracted.
 */

const STATUTORY_DAYS = 14
const POLICY_TZ = () => String(process.env.STORE_POLICY_TIMEZONE || 'Europe/Berlin').trim() || 'Europe/Berlin'

/** Offset (ms) of `tz` at instant `date`: local wall time − UTC. */
const tzOffsetMs = (date, tz) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  )
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** Local calendar date (y, m, d) of an instant in `tz`. */
const localDate = (date, tz) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).map((p) => [p.type, p.value]),
  )
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) }
}

/** Last instant (inclusive) at which a withdrawal is still in time. */
function withdrawalDeadline(deliveredAt, days = STATUTORY_DAYS, tz = POLICY_TZ()) {
  const at = deliveredAt instanceof Date ? deliveredAt : new Date(deliveredAt)
  if (!deliveredAt || Number.isNaN(at.getTime())) return null
  const period = Math.max(STATUTORY_DAYS, Math.round(Number(days) || 0))
  const { y, m, d } = localDate(at, tz)
  // Local midnight starting the day AFTER the last day of the period, minus 1 ms.
  const guess = new Date(Date.UTC(y, m - 1, d + period + 1, 0, 0, 0))
  const startNext = guess.getTime() - tzOffsetMs(guess, tz)
  return new Date(startNext - 1)
}

/** Latest known delivery instant (carrier-confirmed or seller-reported), or null. */
function deliveryInstant(order) {
  const ts = [order && order.delivery_confirmed_at, order && order.delivery_date]
    .filter(Boolean).map((v) => new Date(v)).filter((d) => !Number.isNaN(d.getTime()))
  if (!ts.length) return null
  return new Date(Math.max(...ts.map((d) => d.getTime())))
}

/** Longest return period promised for the given products (never below 14 days). */
function returnPeriodDays(productMetas) {
  let days = STATUTORY_DAYS
  for (const m of productMetas || []) {
    const n = Math.round(Number(m && m.return_days))
    if (Number.isFinite(n) && n > days && n <= 365) days = n
  }
  return days
}

/**
 * Quantity still returnable per order item.
 * @param {Array<{id, quantity}>} orderItems
 * @param {Array<{status, items}>} returns existing returns of the order
 */
function remainingReturnable(orderItems, returns) {
  const left = new Map((orderItems || []).map((oi) => [String(oi.id), Math.max(0, Math.round(Number(oi.quantity) || 0))]))
  for (const r of returns || []) {
    if (String(r.status || '') === 'abgelehnt') continue
    let items = r.items
    if (typeof items === 'string') { try { items = JSON.parse(items) } catch (_) { items = [] } }
    for (const it of Array.isArray(items) ? items : []) {
      const k = String(it && it.order_item_id || '')
      if (!left.has(k)) continue
      left.set(k, Math.max(0, left.get(k) - Math.max(1, Math.round(Number(it.quantity) || 1))))
    }
  }
  return left
}

module.exports = { STATUTORY_DAYS, withdrawalDeadline, deliveryInstant, returnPeriodDays, remainingReturnable }

/**
 * What the shop needs to show the return button honestly: deadline, period and the quantity
 * still returnable per order item.
 * @param {{ order, items, returns, returnDaysByProduct: Map<string, number>, now?: Date }} args
 */
function buildReturnWindow({ order, items, returns, returnDaysByProduct = new Map(), now = new Date() }) {
  const deliveredAt = deliveryInstant(order)
  const days = returnPeriodDays((items || []).map((it) => ({ return_days: returnDaysByProduct.get(String(it.product_id || '')) })))
  const deadline = deliveredAt ? withdrawalDeadline(deliveredAt, days) : null
  const left = remainingReturnable(items, returns)
  const remaining = Object.fromEntries(left)
  const remainingTotal = [...left.values()].reduce((s, n) => s + n, 0)
  return {
    delivered_at: deliveredAt ? deliveredAt.toISOString() : null,
    days,
    deadline: deadline ? deadline.toISOString() : null,
    open: !deadline || now.getTime() <= deadline.getTime(),
    remaining,
    remaining_total: remainingTotal,
  }
}

module.exports.buildReturnWindow = buildReturnWindow
