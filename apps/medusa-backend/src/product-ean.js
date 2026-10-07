'use strict'

/**
 * EAN / GTIN validation for catalog products.
 *
 * - GTIN-8/12/13/14 with a valid GS1 check digit is the international standard (Amazon, Otto,
 *   Google Merchant reject anything else). Only NEW codes are checked, so products saved before
 *   this rule keep working until their code is changed.
 * - Uniqueness is checked in the database instead of loading every product into memory.
 */

const { normalizeStoreEan } = require('./product-identity')

const GTIN_LENGTHS = new Set([8, 12, 13, 14])

const isValidGtin = (raw) => {
  const d = String(raw == null ? '' : raw).trim()
  if (!/^\d+$/.test(d) || !GTIN_LENGTHS.has(d.length)) return false
  let sum = 0
  for (let i = d.length - 2, w = 3; i >= 0; i -= 1, w = w === 3 ? 1 : 3) sum += Number(d[i]) * w
  return (10 - (sum % 10)) % 10 === Number(d[d.length - 1])
}

/** Digits when the value looks like a GTIN (≥ 8 digits), otherwise the trimmed raw text. */
const normalizeEanValue = (v) => {
  if (v == null) return ''
  const s = String(v).trim()
  return normalizeStoreEan(s) || s
}

const collectVariantEans = (variants) => {
  const out = []
  if (!Array.isArray(variants)) return out
  for (const v of variants) { const e = normalizeEanValue(v && v.ean); if (e) out.push(e) }
  return out
}

const collectProductRowEans = (row) => {
  const out = new Set()
  const meta = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const pe = normalizeEanValue(meta.ean)
  if (pe) out.add(pe)
  for (const ve of collectVariantEans(row && Array.isArray(row.variants) ? row.variants : [])) out.add(ve)
  return out
}

// Same normalization as normalizeEanValue, in SQL.
const NORM_SQL = (expr) => `CASE WHEN length(regexp_replace(${expr}, '\\D', '', 'g')) >= 8
  THEN regexp_replace(${expr}, '\\D', '', 'g') ELSE btrim(${expr}) END`

/** EANs from `values` already used by another (non-merged) product, parent or variant. */
const findTakenEans = async (client, values, excludeIds) => {
  if (!values.length) return new Set()
  const res = await client.query(
    `WITH candidates AS (
       SELECT p.metadata->>'ean' AS raw
         FROM admin_hub_products p
        WHERE p.status IS DISTINCT FROM 'merged' AND NOT (p.id::text = ANY($2::text[]))
       UNION ALL
       SELECT v->>'ean' AS raw
         FROM admin_hub_products p
         CROSS JOIN LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(p.variants) = 'array' THEN p.variants ELSE '[]'::jsonb END) v
        WHERE p.status IS DISTINCT FROM 'merged' AND NOT (p.id::text = ANY($2::text[]))
     )
     SELECT DISTINCT norm FROM (
       SELECT ${NORM_SQL('raw')} AS norm FROM candidates WHERE raw IS NOT NULL AND btrim(raw) <> ''
     ) x WHERE norm = ANY($1::text[])`,
    [values, [...excludeIds]],
  )
  return new Set((res.rows || []).map((r) => r.norm))
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.requireValidGtin] reject codes that are not a valid GTIN
 * @param {Iterable<string>} [opts.grandfathered] codes already stored on this product (exempt from the GTIN rule)
 */
const validateProductEansDb = async (client, parentEan, variantEans, excludeProductIdOrIds, opts = {}) => {
  const values = []
  const seen = new Set()
  const p = normalizeEanValue(parentEan)
  if (p) { seen.add(p); values.push(p) }
  for (const ve of variantEans || []) {
    const e = normalizeEanValue(ve)
    if (!e) continue
    if (p && e === p) return { ok: false, message: 'Variant EAN must be different from parent EAN' }
    if (seen.has(e)) return { ok: false, message: `Duplicate EAN in request payload: ${e}` }
    seen.add(e); values.push(e)
  }
  if (!values.length) return { ok: true }
  const excludeIds = new Set(
    (Array.isArray(excludeProductIdOrIds) ? excludeProductIdOrIds : [excludeProductIdOrIds])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )
  const taken = await findTakenEans(client, values, excludeIds)
  for (const e of values) {
    if (taken.has(e)) return { ok: false, message: `EAN already exists: ${e}` }
  }
  if (opts.requireValidGtin) {
    const old = new Set([...(opts.grandfathered || [])].map(normalizeEanValue))
    for (const e of values) {
      if (old.has(e) || isValidGtin(e)) continue
      return {
        ok: false,
        code: 'invalid_gtin',
        message: `Invalid EAN/GTIN: ${e} — use a GTIN-8, -12, -13 or -14 with a correct check digit (leave empty if the product has none)`,
      }
    }
  }
  return { ok: true }
}

module.exports = {
  isValidGtin,
  normalizeEanValue,
  collectVariantEans,
  collectProductRowEans,
  findTakenEans,
  validateProductEansDb,
}
