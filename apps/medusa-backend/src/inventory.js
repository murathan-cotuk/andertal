'use strict'

/**
 * Stock for checkout (decision 2026-10-08: deduct + check). Before this, nothing in the order
 * flow read or wrote stock: a product with stock 1 sold without limit and stock never went down.
 *
 * Where a cart line's stock lives (mirrors what the shop shows):
 *   - line seller = product owner (or the product has no owner): the variant at the line's index
 *     (variant ids are "<pid>-variant-<i>", "<pid>-v-<i>", "<pid>-listing-<seller>-variant-<i>")
 *     when the product has variants, else admin_hub_products.inventory
 *   - another seller's offer (admin_hub_seller_listings row for that seller, not a same-seller
 *     shadow row): that listing's inventory
 * A variant without an inventory field is "not tracked" → never blocks, never deducted.
 * Deduction never goes below 0; cancelled (unshipped) lines give their stock back once.
 */

function parseVariantIndex(variantId) {
  const m = String(variantId || '').match(/-(?:variant|v)-(\d+)$/)
  return m ? Number(m[1]) : null
}

const toInt = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

/** @returns {{ kind: 'variant'|'product'|'listing', productId, sellerId, idx, available: number|null } | null} */
function resolveStockTarget({ line, product, listing }) {
  if (!product) return null
  const lineSeller = String(line.seller_id || '').trim()
  const owner = String(product.seller_id || '').trim()
  if (listing && lineSeller && lineSeller !== owner) {
    return { kind: 'listing', productId: product.id, sellerId: lineSeller, idx: null, available: toInt(listing.inventory) }
  }
  const variants = Array.isArray(product.variants) ? product.variants : []
  const idx = parseVariantIndex(line.variant_id)
  if (variants.length && idx != null && variants[idx]) {
    const v = variants[idx]
    const raw = v.inventory != null ? v.inventory : v.inventory_quantity
    return { kind: 'variant', productId: product.id, sellerId: owner || null, idx, available: toInt(raw) }
  }
  return { kind: 'product', productId: product.id, sellerId: owner || null, idx: null, available: toInt(product.inventory) }
}

const targetKey = (t) => `${t.kind}:${t.productId}:${t.sellerId || ''}:${t.idx == null ? '' : t.idx}`

async function loadTargets(client, lines) {
  const pids = [...new Set(lines.map((l) => String(l.product_id || '')).filter(Boolean))]
  if (!pids.length) return new Map()
  const products = new Map((await client.query(
    'SELECT id::text AS id, seller_id, inventory, variants FROM admin_hub_products WHERE id::text = ANY($1::text[])', [pids],
  )).rows.map((r) => [r.id, { ...r, variants: typeof r.variants === 'string' ? JSON.parse(r.variants || '[]') : r.variants }]))
  const listings = new Map((await client.query(
    `SELECT product_id::text AS product_id, seller_id, inventory FROM admin_hub_seller_listings
      WHERE product_id::text = ANY($1::text[]) AND status IN ('active', 'published')`, [pids],
  ).catch(() => ({ rows: [] }))).rows.map((r) => [`${r.product_id}:${r.seller_id}`, r]))
  const out = new Map()
  for (const line of lines) {
    const product = products.get(String(line.product_id || ''))
    const listing = listings.get(`${line.product_id}:${String(line.seller_id || '').trim()}`) || null
    const t = resolveStockTarget({ line, product, listing })
    if (t) out.set(line, t)
  }
  return out
}

/** Pure: requested quantity per stock target vs available. */
function findShortages(lines, targetsByLine) {
  const need = new Map()
  for (const line of lines) {
    const t = targetsByLine.get(line)
    if (!t || t.available == null) continue
    const k = targetKey(t)
    const cur = need.get(k) || { target: t, requested: 0, lineIds: [] }
    cur.requested += Math.max(1, Number(line.quantity) || 1)
    if (line.id) cur.lineIds.push(line.id)
    need.set(k, cur)
  }
  return [...need.values()].filter((n) => n.requested > Math.max(0, n.target.available))
    .map((n) => ({ line_item_ids: n.lineIds, available: Math.max(0, n.target.available), requested: n.requested }))
}

async function checkCartStock(client, lines) {
  const targets = await loadTargets(client, lines)
  return findShortages(lines, targets)
}

async function applyDelta(client, t, delta) {
  if (t.available == null) return
  if (t.kind === 'listing') {
    await client.query(
      `UPDATE admin_hub_seller_listings SET inventory = GREATEST(0, COALESCE(inventory, 0) + $3), updated_at = now()
        WHERE product_id::text = $1 AND seller_id = $2`,
      [String(t.productId), t.sellerId, delta],
    )
  } else if (t.kind === 'variant') {
    await client.query(
      `UPDATE admin_hub_products
          SET variants = jsonb_set(variants, ARRAY[$2::text, 'inventory'],
                to_jsonb(GREATEST(0, COALESCE(NULLIF(variants->$2::int->>'inventory', '')::numeric::int, 0) + $3))),
              updated_at = now()
        WHERE id::text = $1 AND jsonb_typeof(variants) = 'array' AND variants->$2::int ? 'inventory'`,
      [String(t.productId), String(t.idx), delta],
    )
  } else {
    await client.query(
      'UPDATE admin_hub_products SET inventory = GREATEST(0, COALESCE(inventory, 0) + $2), updated_at = now() WHERE id::text = $1',
      [String(t.productId), delta],
    )
  }
}

/** After the order is created: deduct each line once (store_orders.stock_deducted_at). */
async function deductOrderStock(client, orderId) {
  const claim = await client.query(
    'UPDATE store_orders SET stock_deducted_at = now() WHERE id = $1::uuid AND stock_deducted_at IS NULL RETURNING id', [orderId],
  )
  if (!claim.rows.length) return { deducted: 0 }
  const lines = (await client.query('SELECT id, product_id, variant_id, seller_id, quantity FROM store_order_items WHERE order_id = $1::uuid', [orderId])).rows
  const targets = await loadTargets(client, lines)
  let n = 0
  for (const line of lines) {
    const t = targets.get(line)
    if (!t || t.available == null) continue
    await applyDelta(client, t, -Math.max(1, Number(line.quantity) || 1))
    n++
  }
  return { deducted: n }
}

/** Cancellation before shipping: give stock back (optionally only one seller's lines), once per line. */
async function restoreOrderStock(client, orderId, { sellerId = null } = {}) {
  const ord = (await client.query('SELECT stock_deducted_at FROM store_orders WHERE id = $1::uuid', [orderId])).rows[0]
  if (!ord || !ord.stock_deducted_at) return { restored: 0 }
  const lines = (await client.query(
    `UPDATE store_order_items SET stock_restored_at = now()
      WHERE order_id = $1::uuid AND stock_restored_at IS NULL AND ($2::text IS NULL OR seller_id = $2)
      RETURNING id, product_id, variant_id, seller_id, quantity`,
    [orderId, sellerId],
  )).rows
  const targets = await loadTargets(client, lines)
  let n = 0
  for (const line of lines) {
    const t = targets.get(line)
    if (!t || t.available == null) continue
    await applyDelta(client, t, Math.max(1, Number(line.quantity) || 1))
    n++
  }
  return { restored: n }
}

async function ensureInventorySchema(client) {
  await client.query('ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS stock_deducted_at timestamptz')
  await client.query('ALTER TABLE store_order_items ADD COLUMN IF NOT EXISTS stock_restored_at timestamptz')
}

module.exports = {
  parseVariantIndex, resolveStockTarget, findShortages, checkCartStock, deductOrderStock, restoreOrderStock, ensureInventorySchema,
}
