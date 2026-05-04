/**
 * Resolve customer-paid total (after bonus + coupon) for display (API, PDF, emails).
 * Some legacy rows stored total_cents equal to subtotal or subtotal+shipping while discount_cents > 0.
 */

function num(v, d = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

function resolveOrderPaidTotalCents(row) {
  if (!row) return 0
  const subtotal = Math.max(0, num(row.subtotal_cents))
  const shipping = Math.max(0, num(row.shipping_cents))
  const discount = Math.max(0, num(row.discount_cents))
  const merchandiseShipping = subtotal + shipping
  const computed = Math.max(0, merchandiseShipping - discount)

  const raw = row.total_cents
  if (raw == null || raw === '') return computed

  const storedTotal = num(raw)

  if (discount > 0 && computed < storedTotal) {
    if (storedTotal === merchandiseShipping) return computed
    if (storedTotal === subtotal) return computed
  }

  return storedTotal
}

function orderCouponDiscountCents(row) {
  return Math.max(0, num(row?.coupon_discount_cents))
}

/** Bonus (loyalty) portion of discount_cents; remainder is coupon or other. */
function orderBonusDiscountCents(row) {
  const discount = Math.max(0, num(row?.discount_cents))
  const coupon = orderCouponDiscountCents(row)
  return Math.max(0, discount - coupon)
}

module.exports = {
  resolveOrderPaidTotalCents,
  orderCouponDiscountCents,
  orderBonusDiscountCents,
}
