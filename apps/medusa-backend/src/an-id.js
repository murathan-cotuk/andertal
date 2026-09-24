'use strict'

/**
 * AN-ID — a short, stable, platform-assigned identifier.
 *
 * Parent products (canonical `admin_hub_products` rows) get a column `an_id`.
 * Each variation is its own sellable item, so every `variants[]` row also gets
 * its own `an_id` inside the JSON. Assigned once, never changed.
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

/** True when this product's parent column OR any variant JSON an_id equals $1. */
const AN_ID_TAKEN_SQL = `SELECT 1 FROM admin_hub_products
 WHERE an_id = $1
    OR (
      variants IS NOT NULL
      AND jsonb_typeof(COALESCE(variants::jsonb, 'null'::jsonb)) = 'array'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(variants::jsonb) AS v
        WHERE UPPER(TRIM(COALESCE(v->>'an_id', ''))) = $1
      )
    )
 LIMIT 1`

const AN_ID_FIND_SQL = `SELECT id, CASE WHEN an_id = $1 THEN 'parent' ELSE 'variant' END AS matched_on
 FROM admin_hub_products
 WHERE an_id = $1
    OR (
      variants IS NOT NULL
      AND jsonb_typeof(COALESCE(variants::jsonb, 'null'::jsonb)) = 'array'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(variants::jsonb) AS v
        WHERE UPPER(TRIM(COALESCE(v->>'an_id', ''))) = $1
      )
    )
 ORDER BY CASE WHEN an_id = $1 THEN 0 ELSE 1 END
 LIMIT 1`

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

async function anIdTaken(client, candidate, reserved) {
  if (reserved && reserved.has(candidate)) return true
  const exists = await client.query(AN_ID_TAKEN_SQL, [candidate])
  return !!(exists.rows && exists.rows.length)
}

/**
 * Generate a fresh, unused AN-ID. `client` must be a connected pg client (or
 * pool) with a `.query()` method. Pass `reserved` (a Set) when assigning several
 * IDs in one transaction so in-memory candidates aren't reused before INSERT.
 * Retries a handful of times on the astronomically unlikely collision; throws
 * if it still can't find a free one.
 */
async function assignAnId(client, reserved) {
  const used = reserved instanceof Set ? reserved : new Set()
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = formatAnId(generateAnIdSuffix())
    if (await anIdTaken(client, candidate, used)) continue
    used.add(candidate)
    return candidate
  }
  throw new Error('Could not generate a unique AN-ID after 8 attempts')
}

/**
 * Stamp a unique AN-ID onto every variant that doesn't already have a valid one.
 * Existing IDs are normalized (uppercase) but never replaced.
 * Returns `{ variants, changed }`.
 */
async function ensureVariantAnIds(client, variants, reserved) {
  const used = reserved instanceof Set ? reserved : new Set(reserved || [])
  if (!Array.isArray(variants)) return { variants: [], changed: false }
  for (const v of variants) {
    const id = v && typeof v === 'object' ? normalizeAnId(v.an_id) : ''
    if (id) used.add(id)
  }
  let changed = false
  const out = []
  for (const v of variants) {
    if (!v || typeof v !== 'object') {
      out.push(v)
      continue
    }
    const existing = normalizeAnId(v.an_id)
    if (existing) {
      if (v.an_id !== existing) changed = true
      out.push({ ...v, an_id: existing })
      continue
    }
    const anId = await assignAnId(client, used)
    changed = true
    out.push({ ...v, an_id: anId })
  }
  return { variants: out, changed }
}

/** Resolve parent or variant AN-ID to `{ id, matched_on: 'parent'|'variant', an_id }`. */
async function findProductByAnId(client, raw) {
  const anId = normalizeAnId(raw)
  if (!anId || !client) return null
  const r = await client.query(AN_ID_FIND_SQL, [anId])
  const row = r.rows && r.rows[0]
  return row ? { id: row.id, matched_on: row.matched_on === 'variant' ? 'variant' : 'parent', an_id: anId } : null
}

module.exports = {
  AN_ID_ALPHABET,
  AN_ID_PREFIX,
  AN_ID_PATTERN,
  AN_ID_TAKEN_SQL,
  generateAnIdSuffix,
  formatAnId,
  isValidAnId,
  normalizeAnId,
  assignAnId,
  ensureVariantAnIds,
  findProductByAnId,
}
