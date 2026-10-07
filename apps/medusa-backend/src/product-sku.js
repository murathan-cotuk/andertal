'use strict'

/**
 * Seller SKU uniqueness: a SKU identifies exactly one sellable unit within a seller's account
 * (orders, ERP sync, stock imports match on it). Comparison is trimmed and case-insensitive.
 * Only NEW codes are checked, so SKUs saved before this rule keep working.
 */

const normSku = (v) => String(v == null ? '' : v).trim().toLowerCase()

const collectVariantSkus = (variants) =>
  (Array.isArray(variants) ? variants : []).map((v) => normSku(v && v.sku)).filter(Boolean)

const collectProductRowSkus = (row) => {
  const out = new Set()
  const p = normSku(row && row.sku)
  if (p) out.add(p)
  for (const s of collectVariantSkus(row && row.variants)) out.add(s)
  return out
}

/** SKUs from `values` the seller already uses on another product (parent or variant) or listing. */
const findTakenSkus = async (client, sellerId, values, excludeProductId) => {
  if (!values.length) return new Set()
  const res = await client.query(
    `WITH candidates AS (
       SELECT p.sku AS raw FROM admin_hub_products p
        WHERE p.seller_id = $1 AND p.status IS DISTINCT FROM 'merged' AND p.id::text <> $3
       UNION ALL
       SELECT v->>'sku' FROM admin_hub_products p
         CROSS JOIN LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(p.variants) = 'array' THEN p.variants ELSE '[]'::jsonb END) v
        WHERE p.seller_id = $1 AND p.status IS DISTINCT FROM 'merged' AND p.id::text <> $3
       UNION ALL
       SELECT l.sku FROM admin_hub_seller_listings l
        WHERE l.seller_id = $1 AND l.product_id::text <> $3
     )
     SELECT DISTINCT lower(btrim(raw)) AS norm FROM candidates
      WHERE raw IS NOT NULL AND lower(btrim(raw)) = ANY($2::text[])`,
    [sellerId, values, String(excludeProductId || '')],
  )
  return new Set((res.rows || []).map((r) => r.norm))
}

/**
 * @param {object} args
 * @param {string|null} args.sellerId  products without a seller (platform-owned) are not checked
 * @param {string} [args.parentSku]
 * @param {Array} [args.variants]
 * @param {string|null} [args.excludeProductId]
 * @param {Iterable<string>} [args.grandfathered] SKUs already stored on this product
 */
const validateSellerSkusDb = async (client, { sellerId, parentSku, variants, excludeProductId = null, grandfathered = [] }) => {
  const sid = String(sellerId || '').trim()
  if (!sid) return { ok: true }
  const old = new Set([...grandfathered].map(normSku))
  const variantSkus = collectVariantSkus(variants)
  const seen = new Set()
  for (const s of variantSkus) {
    if (seen.has(s) && !old.has(s)) return { ok: false, code: 'duplicate_sku', message: `Duplicate SKU in variants: ${s}` }
    seen.add(s)
  }
  const fresh = [...new Set([normSku(parentSku), ...variantSkus])].filter((s) => s && !old.has(s))
  if (!fresh.length) return { ok: true }
  let taken
  try {
    taken = await findTakenSkus(client, sid, fresh, excludeProductId)
  } catch (e) {
    // Listings table missing on a fresh database must not block product saves.
    if (e && e.code === '42P01') return { ok: true }
    throw e
  }
  for (const s of fresh) {
    if (taken.has(s)) return { ok: false, code: 'duplicate_sku', message: `SKU already used by another of your products: ${s}` }
  }
  return { ok: true }
}

module.exports = { normSku, collectProductRowSkus, findTakenSkus, validateSellerSkusDb }
