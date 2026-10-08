'use strict'

/**
 * One invoice per seller (§14 UStG: the invoice is issued by the supplier). A marketplace order
 * with lines of several sellers used to produce ONE invoice under the first seller's name that
 * listed every seller's goods. Here the order is split into per-seller invoice rows:
 *   - items: that seller's lines; subtotal = their sum
 *   - shipping: that seller's share (store_orders.shipping_by_seller), else the order shipping
 *     for a single-seller order
 *   - coupon: a seller-specific coupon goes wholly to that seller, a platform coupon and the
 *     bonus (loyalty) discount are split by merchandise share
 *   - every amount sums back exactly to the order (rounding remainder on the last part)
 * A single-seller order returns the original row unchanged.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

function parseShippingBySeller(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch (_) { return null }
}

/** Splits `total` by `weights` (integers, exact sum). */
function allocate(total, weights) {
  const t = Math.round(num(total))
  const sum = weights.reduce((a, w) => a + Math.max(0, num(w)), 0)
  if (!t || !sum) return weights.map(() => 0)
  let used = 0
  return weights.map((w, i) => {
    if (i === weights.length - 1) return t - used
    const part = Math.floor((t * Math.max(0, num(w))) / sum)
    used += part
    return part
  })
}

/**
 * @param {object} row  store_orders row
 * @param {Array} items order item rows with resolved seller_id
 * @param {{ couponSellerId?: string|null }} opts
 * @returns {Array<{ sellerId: string|null, row: object, items: Array }>}
 */
function splitOrderForInvoices(row, items, { couponSellerId = null } = {}) {
  const sellerOf = (it) => {
    const s = String(it?.seller_id || '').trim()
    return s && s !== 'default' ? s : null
  }
  const sellers = [...new Set((items || []).map(sellerOf).filter(Boolean))]
  if (sellers.length <= 1) return [{ sellerId: sellers[0] || null, row, items }]

  const groups = sellers.map((sid) => {
    const its = items.filter((it) => sellerOf(it) === sid)
    return { sid, items: its, subtotal: its.reduce((a, it) => a + num(it.unit_price_cents) * Math.max(1, num(it.quantity) || 1), 0) }
  })
  // Lines without a resolvable seller ride with the first seller (should not happen after enrich).
  const orphan = items.filter((it) => !sellerOf(it))
  if (orphan.length) {
    groups[0].items = [...groups[0].items, ...orphan]
    groups[0].subtotal += orphan.reduce((a, it) => a + num(it.unit_price_cents) * Math.max(1, num(it.quantity) || 1), 0)
  }

  const shipMap = parseShippingBySeller(row.shipping_by_seller)
  const shipping = shipMap
    ? groups.map((g) => Math.max(0, Math.round(num(shipMap[g.sid]))))
    : allocate(num(row.shipping_cents), groups.map((g) => g.subtotal))
  // Keep the order total exact even if the map does not add up to shipping_cents.
  const shipDiff = Math.round(num(row.shipping_cents)) - shipping.reduce((a, b) => a + b, 0)
  if (shipDiff) shipping[shipping.length - 1] += shipDiff

  const coupon = Math.max(0, Math.round(num(row.coupon_discount_cents)))
  const discount = Math.max(0, Math.round(num(row.discount_cents)))
  const bonus = Math.max(0, discount - coupon)
  const weights = groups.map((g) => g.subtotal)
  const couponIdx = couponSellerId ? groups.findIndex((g) => g.sid === couponSellerId) : -1
  const couponParts = couponIdx >= 0 ? groups.map((_, i) => (i === couponIdx ? coupon : 0)) : allocate(coupon, weights)
  const bonusParts = allocate(bonus, weights)
  const bonusPoints = allocate(num(row.bonus_points_redeemed), weights)
  const platformFunding = allocate(num(row.platform_bonus_funding_cents), weights)

  return groups.map((g, i) => {
    const disc = couponParts[i] + bonusParts[i]
    return {
      sellerId: g.sid,
      items: g.items,
      row: {
        ...row,
        subtotal_cents: g.subtotal,
        shipping_cents: shipping[i],
        coupon_discount_cents: couponParts[i],
        discount_cents: disc,
        bonus_points_redeemed: bonusPoints[i],
        platform_bonus_funding_cents: platformFunding[i],
        total_cents: Math.max(0, g.subtotal + shipping[i] - disc),
        coupon_code: couponParts[i] > 0 ? row.coupon_code : null,
      },
    }
  })
}

module.exports = { splitOrderForInvoices, allocate }
