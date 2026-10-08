'use strict'

/**
 * Shared field helpers for the product feeds (Google Merchant, idealo).
 */

/** First product image URL — metadata.media holds strings or { url } objects (bulk import). */
function firstImageUrl(meta) {
  const m = meta && typeof meta === 'object' ? meta : {}
  const media = Array.isArray(m.media) ? m.media : []
  for (const it of media) {
    const u = typeof it === 'string' ? it : (it && typeof it === 'object' ? (it.url || it.src) : null)
    if (u && String(u).trim()) return String(u).trim()
  }
  const thumb = typeof m.thumbnail === 'string' ? m.thumbnail.trim() : ''
  return thumb || null
}

/**
 * Google unit pricing (PAngV Grundpreis in Shopping ads): unit_pricing_measure = the product's
 * content, unit_pricing_base_measure = 1 kg / 1 l (PAngV 2022) or the piece reference.
 * Same unit fields as the shop (apps/shop/src/lib/grundpreis.js). null when not set.
 */
function unitPricing(meta) {
  const m = meta && typeof meta === 'object' ? meta : {}
  const type = String(m.unit_type || '').trim().toLowerCase()
  const value = parseFloat(String(m.unit_value ?? '').replace(',', '.'))
  if (!type || !(value > 0)) return null
  const num = (n) => String(Math.round(n * 1000) / 1000)
  if (type === 'g' || type === 'kg') return { measure: `${num(value)}${type}`, base: '1kg' }
  if (type === 'ml' || type === 'l') return { measure: `${num(value)}${type}`, base: '1l' }
  if (type === 'stück' || type === 'piece' || type === 'ct') {
    const ref = parseFloat(String(m.unit_reference ?? '').replace(',', '.'))
    return { measure: `${num(value)}ct`, base: `${ref > 0 ? num(ref) : '1'}ct` }
  }
  return null // other units are not in Google's list
}

module.exports = { firstImageUrl, unitPricing }
