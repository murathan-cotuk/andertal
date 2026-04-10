/**
 * VAT Validation Adapter — mock-ready.
 *
 * Supported providers: "mock" (default), "vies" (EU VIES web service)
 *
 * Interface contract:
 *   checkVat({ vat_id, company_name, country }) → { valid: bool, format_ok: bool, score_penalty: number }
 */

const PROVIDER = (process.env.VAT_PROVIDER || 'mock').toLowerCase()

// Basic EU VAT format regex map (country code prefix + digits)
const EU_VAT_REGEX = {
  DE: /^DE\d{9}$/,
  AT: /^ATU\d{8}$/,
  FR: /^FR[A-Z0-9]{2}\d{9}$/,
  NL: /^NL\d{9}B\d{2}$/,
  BE: /^BE0\d{9}$/,
  TR: /^\d{10}$/, // Turkey is not EU but common in our market
  default: /^[A-Z]{2}[0-9A-Z]{2,12}$/,
}

function isValidFormat(vat_id) {
  if (!vat_id) return false
  const v = vat_id.trim().toUpperCase().replace(/[\s\-\.]/g, '')
  const country = v.slice(0, 2)
  const regex = EU_VAT_REGEX[country] || EU_VAT_REGEX.default
  return regex.test(v)
}

// ── Mock provider ─────────────────────────────────────────────────────────────
async function mockVat({ vat_id, company_name, country }) {
  if (!vat_id) return { valid: false, format_ok: false, score_penalty: 10 }
  const format_ok = isValidFormat(vat_id)
  // In mock mode: format valid = passes, format invalid = warning only (not blocker)
  return { valid: format_ok, format_ok, score_penalty: format_ok ? 0 : 10 }
}

// ── VIES (EU) provider (ready to wire) ────────────────────────────────────────
async function viesVat({ vat_id, company_name, country }) {
  // TODO: call https://ec.europa.eu/taxation_customs/vies/services/checkVatService
  // const soap = require('soap') — or use a lightweight VAT validation library
  throw new Error('VIES VAT validation not yet configured. Set VAT_PROVIDER=mock.')
}

// ── Public interface ──────────────────────────────────────────────────────────
async function checkVat(payload) {
  try {
    if (PROVIDER === 'vies') return await viesVat(payload)
    return await mockVat(payload)
  } catch (err) {
    console.error('[vat-adapter] error:', err.message)
    return { valid: false, format_ok: false, score_penalty: 5 }
  }
}

module.exports = { checkVat, isValidFormat }
