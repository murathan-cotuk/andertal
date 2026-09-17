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

/**
 * Per-product commission override (admin_hub_products.metadata.commission_rate_override) —
 * superuser-set, applies instead of the seller's own commission_rate for that one product's
 * line items. `null` means "no override, use the seller's rate" — distinct from 0 (a real 0%
 * override), so this must NOT fall back to a default the way resolveSellerCommissionRate does.
 * Same accidental-percent-input tolerance (8 → 0.08).
 */
function resolveProductCommissionOverride(raw) {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  if (n <= 1) return n
  if (n <= 100) return n / 100
  return null
}

/** Display percent with one decimal, or null if no override is set. */
function productCommissionOverridePct(raw) {
  const rate = resolveProductCommissionOverride(raw)
  return rate == null ? null : Math.round(rate * 1000) / 10
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
  resolveProductCommissionOverride,
  productCommissionOverridePct,
}
