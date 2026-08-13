'use strict'

/**
 * Destination-country VAT on the seller's charged brutto (sales invoice).
 * Does not rewrite the seller's price. Commission USt is PLATFORM_VAT_PERCENT — not here.
 *
 * Override rates: GOODS_VAT_RATES_JSON='{"FR":20,"BE":21}'
 * Unknown ISO-2: GOODS_VAT_DEFAULT_PERCENT (default 19).
 */

const DEFAULT_STANDARD_RATES = {
  AT: 20, BE: 21, BG: 20, CY: 19, CZ: 21, DE: 19, DK: 25, EE: 24, ES: 21,
  FI: 25.5, FR: 20, GR: 24, HR: 25, HU: 27, IE: 23, IT: 22, LT: 21, LU: 17,
  LV: 21, MT: 18, NL: 21, PL: 23, PT: 23, RO: 21, SE: 25, SI: 22, SK: 23,
  CH: 8.1, GB: 20, TR: 20, NO: 25, US: 0,
}

function parseRateMap(raw) {
  if (!raw || typeof raw !== 'string') return {}
  try {
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    const out = {}
    for (const [k, v] of Object.entries(o)) {
      const cc = String(k || '').trim().toUpperCase().slice(0, 2)
      const n = Number(v)
      if (cc.length === 2 && Number.isFinite(n) && n >= 0 && n <= 100) out[cc] = n
    }
    return out
  } catch (_) {
    return {}
  }
}

function defaultRatePercent() {
  const n = Number(process.env.GOODS_VAT_DEFAULT_PERCENT)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 19
}

function rateTable() {
  return { ...DEFAULT_STANDARD_RATES, ...parseRateMap(process.env.GOODS_VAT_RATES_JSON) }
}

function normalizeCountryCode(country) {
  const s = String(country || '').trim().toUpperCase()
  if (s.length >= 2 && /^[A-Z]{2}/.test(s)) return s.slice(0, 2)
  return ''
}

function getGoodsVatRatePercent(country) {
  const cc = normalizeCountryCode(country)
  const table = rateTable()
  if (cc && Object.prototype.hasOwnProperty.call(table, cc)) return Number(table[cc])
  return defaultRatePercent()
}

function formatVatPercent(rate) {
  const n = Number(rate)
  if (!Number.isFinite(n)) return '0'
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n))
  return String(n)
}

/** Brutto → net + VAT (integer cents). rate 0 → all net. */
function splitInclusiveVat(grossCents, ratePercent) {
  const gross = Math.max(0, Math.round(Number(grossCents) || 0))
  const rate = Number(ratePercent)
  if (!Number.isFinite(rate) || rate <= 0) {
    return { grossCents: gross, netCents: gross, vatCents: 0, ratePercent: 0 }
  }
  const vatCents = Math.round(gross * rate / (100 + rate))
  return {
    grossCents: gross,
    netCents: gross - vatCents,
    vatCents,
    ratePercent: rate,
  }
}

function destinationCountryFromOrder(row) {
  return normalizeCountryCode((row && (row.country || row.billing_country)) || '') || 'DE'
}

/**
 * Seller's list price for a country. No VAT remapping.
 * Missing country → DE / EUR. sale_cents wins over brutto when > 0.
 */
function pickCountryMerchandiseCents(prices, country, opts = {}) {
  const fallbackDe = opts.fallbackDe !== false
  if (!prices || typeof prices !== 'object') return null
  const cc = normalizeCountryCode(country)
  const keys = []
  if (cc) keys.push(cc)
  if (fallbackDe) {
    if (cc !== 'DE') keys.push('DE')
    keys.push('EUR')
  }
  const seen = new Set()
  for (const key of keys) {
    if (!key || seen.has(key)) continue
    seen.add(key)
    const entry = prices[key]
    if (!entry || typeof entry !== 'object') continue
    const sale = Number(entry.sale_cents)
    if (Number.isFinite(sale) && sale > 0) return Math.round(sale)
    const brut = Number(entry.brutto_cents)
    if (Number.isFinite(brut) && brut > 0) return Math.round(brut)
  }
  return null
}

function salesInvoiceVat(row, { sellerHasVatId, taxableGrossCents } = {}) {
  if (!sellerHasVatId) {
    return { ...splitInclusiveVat(taxableGrossCents, 0), ratePercent: 0, exempt: true }
  }
  const dest = destinationCountryFromOrder(row)
  const rate = getGoodsVatRatePercent(dest)
  return { ...splitInclusiveVat(taxableGrossCents, rate), exempt: false, destination: dest }
}

module.exports = {
  DEFAULT_STANDARD_RATES,
  normalizeCountryCode,
  getGoodsVatRatePercent,
  formatVatPercent,
  splitInclusiveVat,
  destinationCountryFromOrder,
  pickCountryMerchandiseCents,
  salesInvoiceVat,
}
