'use strict'

/**
 * Seller label prices from Sendcloud /shipping_methods — the ONE place the charge is derived.
 * The purchase endpoint re-quotes with this instead of trusting the browser's price_eur
 * (previously a seller could send any price and the platform's Sendcloud account paid the rest).
 * DHL only for now (platform carrier); weight brackets and destination price per method.
 */
function leadTimeText(leadHours) {
  if (leadHours == null) return null
  if (leadHours <= 24) return 'Lieferung am nächsten Werktag'
  if (leadHours <= 48) return 'Lieferung in 1–2 Werktagen'
  if (leadHours <= 72) return 'Lieferung in 2–3 Werktagen'
  return `Lieferung in ca. ${Math.ceil(leadHours / 24)} Werktagen`
}

function computeLabelRates(methods, { toCountry = 'DE', weightKg = 1, markupPct = 5 } = {}) {
  const cc = String(toCountry || 'DE').trim().toUpperCase().slice(0, 2)
  const markup = 1 + (Number(markupPct) || 5) / 100
  const rates = []
  for (const method of Array.isArray(methods) ? methods : []) {
    const carrierKey = String(method.carrier || method.name || '').toLowerCase()
    if (!carrierKey.includes('dhl')) continue
    const minW = method.min_weight != null && method.min_weight !== '' ? Number(method.min_weight) : null
    const maxW = method.max_weight != null && method.max_weight !== '' ? Number(method.max_weight) : null
    if (minW != null && !Number.isNaN(minW) && minW > 0 && weightKg < minW) continue
    if (maxW != null && !Number.isNaN(maxW) && maxW > 0 && weightKg > maxW) continue
    const countryEntry = (method.countries || []).find((c) => (c.iso_2 || '').toUpperCase() === cc)
    if (!countryEntry || countryEntry.price == null) continue
    const price = Number(countryEntry.price)
    if (!Number.isFinite(price) || price <= 0) continue
    rates.push({
      service_id: method.id,
      name: method.name,
      carrier: method.carrier || (method.name || '').toLowerCase(),
      price_eur: Math.round(price * markup * 100) / 100,
      price_base: Math.round(price * 100) / 100,
      min_weight: method.min_weight,
      max_weight: method.max_weight,
      delivery_days: leadTimeText(countryEntry.lead_time_hours != null ? Number(countryEntry.lead_time_hours) : null),
      tracking: true,
    })
  }
  rates.sort((a, b) => a.price_eur - b.price_eur)
  return rates
}

/** Weight as quoted (grams rounded, 1 kg default) — rates and purchase must use the same value. */
function normalizeWeightKg(weightKg) {
  return (Math.round(Number(weightKg) * 1000) || 1000) / 1000
}

module.exports = { computeLabelRates, normalizeWeightKg }
