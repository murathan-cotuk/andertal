'use strict'

/**
 * Unit price of a catalog line (owner's offer) — the ONE place checkout derives it.
 *
 * The variant is the real product (handoff Faz 2), so its own price always wins over the
 * parent's:
 *   1. variant metadata.prices[country]          (product-form style, per market)
 *   2. variant root price fields                  (variant page / variation matrix: sale_price_cents
 *                                                  if lower, else price_cents)
 *   3. parent metadata.prices[country]
 *   4. variant / parent metadata.prices DE/EUR fallback
 *   5. parent price_cents
 * Previously step 2 was overwritten by step 3, so a variant priced 28,00 € was charged at the
 * parent's 28,90 €. A second seller's listing price is handled by the caller and never replaced.
 */

const { pickCountryMerchandiseCents } = require('./goods-vat')

const positive = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.round(Number(n)) : null)

function variantOwnRootCents(variant) {
  if (!variant || typeof variant !== 'object') return null
  const price = positive(variant.price_cents) ?? (variant.price != null ? positive(Number(variant.price) * 100) : null)
  const sale = positive(variant.sale_price_cents)
  if (sale != null && (price == null || sale < price)) return sale
  return price
}

function resolveCatalogUnitPriceCents({ variant = null, meta = {}, productPriceCents = 0, country = 'DE' }) {
  const vm = variant && variant.metadata && typeof variant.metadata === 'object' ? variant.metadata : {}
  const pm = meta && typeof meta === 'object' ? meta : {}
  return pickCountryMerchandiseCents(vm.prices, country, { fallbackDe: false })
    ?? variantOwnRootCents(variant)
    ?? pickCountryMerchandiseCents(pm.prices, country, { fallbackDe: false })
    ?? pickCountryMerchandiseCents(vm.prices, country, { fallbackDe: true })
    ?? pickCountryMerchandiseCents(pm.prices, country, { fallbackDe: true })
    ?? (positive(productPriceCents) || 0)
}

module.exports = { resolveCatalogUnitPriceCents, variantOwnRootCents }
