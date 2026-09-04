'use strict'

/**
 * Live EU VIES VAT-ID lookup (https://ec.europa.eu/taxation_customs/vies/), used to enrich the
 * format-only B2B reverse-charge check in goods-vat.js with a real verification result.
 *
 * Deliberately does NOT replace the format-only check anywhere in the tax-calculation path
 * (goods-vat.js isIntraCommunityB2B/salesInvoiceVat stay untouched, still synchronous, still
 * tested by bonus-settlement.test.js) — VIES is a third-party service that can be slow, rate
 * limited, or down, and the reverse-charge decision must never block checkout or invoicing on
 * it. Instead this is called once, at data-entry time (account/register VAT-ID save), and the
 * boolean result is snapshotted for display (invoice note, account page badge) only.
 */

const VIES_REST_URL = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // re-checking the same VAT-ID within a day is pointless
const cache = new Map() // `${cc}${number}` -> { result, expiresAt }

function cacheGet(key) {
  const hit = cache.get(key)
  if (!hit) return null
  if (hit.expiresAt < Date.now()) { cache.delete(key); return null }
  return hit.result
}

function cacheSet(key, result) {
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS })
  if (cache.size > 5000) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) cache.delete(oldestKey)
  }
}

/**
 * @returns {Promise<{ok: true, valid: boolean, name: string|null, address: string|null} | {ok: false, error: string}>}
 * Never throws — network errors, timeouts, and VIES-side outages all resolve to `{ ok: false }`
 * so callers can fall back to the format-only check without special-casing exceptions.
 */
async function checkVatIdViaVies({ countryCode, vatNumber, timeoutMs = 6000 } = {}) {
  const cc = String(countryCode || '').trim().toUpperCase()
  const num = String(vatNumber || '').trim().toUpperCase().replace(/[\s-]/g, '')
  if (!/^[A-Z]{2}$/.test(cc) || !/^[A-Z0-9]{2,12}$/.test(num)) {
    return { ok: false, error: 'invalid_format' }
  }
  const cacheKey = `${cc}${num}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  if (typeof fetch !== 'function') return { ok: false, error: 'fetch_unavailable' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(VIES_REST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryCode: cc, vatNumber: num }),
      signal: controller.signal,
    })
    if (!res.ok) return { ok: false, error: `vies_http_${res.status}` }
    const data = await res.json().catch(() => null)
    if (!data || typeof data.valid !== 'boolean') return { ok: false, error: 'vies_bad_response' }
    const result = {
      ok: true,
      valid: data.valid,
      name: data.name && data.name !== '---' ? String(data.name).trim() : null,
      address: data.address && data.address !== '---' ? String(data.address).trim() : null,
    }
    cacheSet(cacheKey, result)
    return result
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? 'vies_timeout' : (e?.message || 'vies_network_error') }
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { checkVatIdViaVies }
