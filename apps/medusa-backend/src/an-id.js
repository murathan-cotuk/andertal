'use strict'

/**
 * AN-ID — a short, stable, platform-assigned identifier for a canonical catalog
 * product (one per EAN-deduplicated "master" row in admin_hub_products; every
 * seller listing the same product via admin_hub_seller_listings shares it).
 *
 * Unlike EAN (seller-entered, can be wrong/duplicate/missing) or `handle` (can
 * change when a title is edited), an AN-ID never changes once assigned — it's
 * the stable reference for support, seller-central display, and affiliate links.
 *
 * Format: "AN-" + 7 chars from a 32-symbol alphabet that excludes visually
 * ambiguous characters (0/O, 1/I/L) so it's easy to read/type/say aloud.
 * 7 chars * log2(32) ≈ 35 bits of entropy — collisions are negligible even at
 * catalog scale, and assignAnId() still retries against the DB to be certain.
 */

const AN_ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0, O, 1, I, L
const AN_ID_PREFIX = 'AN-'
const AN_ID_SUFFIX_LEN = 7
const AN_ID_PATTERN = /^AN-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{7}$/

function generateAnIdSuffix(len = AN_ID_SUFFIX_LEN) {
  const crypto = require('crypto')
  const bytes = crypto.randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += AN_ID_ALPHABET[bytes[i] % AN_ID_ALPHABET.length]
  return out
}

function formatAnId(suffix) {
  return `${AN_ID_PREFIX}${suffix}`
}

function isValidAnId(value) {
  return AN_ID_PATTERN.test(String(value || '').trim().toUpperCase())
}

/** Normalize user/URL input: trims, uppercases, tolerates a missing "AN-" prefix. */
function normalizeAnId(value) {
  let s = String(value || '').trim().toUpperCase()
  if (!s) return ''
  if (!s.startsWith(AN_ID_PREFIX) && /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{7}$/.test(s)) s = AN_ID_PREFIX + s
  return isValidAnId(s) ? s : ''
}

/**
 * Generate a fresh, unused AN-ID. `client` must be a connected pg client (or
 * pool) with a `.query()` method. Retries a handful of times on the astronomically
 * unlikely collision; throws if it still can't find a free one.
 */
async function assignAnId(client) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = formatAnId(generateAnIdSuffix())
    const exists = await client.query('SELECT 1 FROM admin_hub_products WHERE an_id = $1', [candidate])
    if (!exists.rows || !exists.rows.length) return candidate
  }
  throw new Error('Could not generate a unique AN-ID after 8 attempts')
}

module.exports = {
  AN_ID_ALPHABET,
  AN_ID_PREFIX,
  AN_ID_PATTERN,
  generateAnIdSuffix,
  formatAnId,
  isValidAnId,
  normalizeAnId,
  assignAnId,
}
