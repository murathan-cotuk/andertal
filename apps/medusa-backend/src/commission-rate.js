'use strict'

/** Default only when the seller has no valid rate stored. Never override 0 %. */
const DEFAULT_SELLER_COMMISSION_RATE = 0.12

/**
 * seller_users.commission_rate is a fraction (0.12 = 12 %).
 * Accepts accidental percent input (12 → 0.12). 0 % is valid.
 */
function resolveSellerCommissionRate(raw) {
  if (raw == null || raw === '') return DEFAULT_SELLER_COMMISSION_RATE
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_SELLER_COMMISSION_RATE
  if (n <= 1) return n
  if (n <= 100) return n / 100
  return DEFAULT_SELLER_COMMISSION_RATE
}

/** Display percent with one decimal (15, 10.5, 0). */
function sellerCommissionRatePct(raw) {
  return Math.round(resolveSellerCommissionRate(raw) * 1000) / 10
}

/** `commissionRatePct` on PDFs is already a 0–100 number. Keep 0 %; only invalid → 12. */
function displayCommissionRatePct(pct) {
  const n = Number(pct)
  if (Number.isFinite(n) && n >= 0 && n <= 100) return Math.round(n * 10) / 10
  return 12
}

module.exports = {
  DEFAULT_SELLER_COMMISSION_RATE,
  resolveSellerCommissionRate,
  sellerCommissionRatePct,
  displayCommissionRatePct,
}
