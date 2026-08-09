'use strict'
const { Router } = require('express')
const crypto = require('crypto')

/**
 * Real product/customer personalization engine — replaces the shop's old
 * apps/shop/src/app/api/personalized-products/route.js, which queried Medusa's native
 * (empty) `order`/`product` tables instead of this project's real catalog/order tables
 * (admin_hub_products, store_orders, store_customer_wishlist). Every algorithm here reads
 * from the tables the rest of the platform actually writes to.
 *
 * Auth: same customer JWT scheme as store-checkout.js (kept local/duplicated on purpose —
 * that file doesn't export its verify function, and this is a small, self-contained check).
 */
const _rawCustomerSecret = process.env.CUSTOMER_JWT_SECRET || process.env.JWT_SECRET || ''
// Same guard as store-checkout.js's CUSTOMER_JWT_SECRET (this file is required into the same
// process, so that guard already protects real deployments — duplicated here for defense in
// depth in case this module is ever loaded independently).
if (!_rawCustomerSecret && (process.env.NODE_ENV === 'production' || /render\.com/i.test(process.env.DATABASE_URL || ''))) {
  console.error('[SECURITY] CUSTOMER_JWT_SECRET env var is not set — refusing to start with a guessable fallback secret against a real database.')
  process.exit(1)
}
const CUSTOMER_JWT_SECRET = _rawCustomerSecret || 'dev-only-customer-secret-do-not-use-in-prod'
const _CUSTOMER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function verifyCustomerToken(token) {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const expected = crypto.createHmac('sha256', CUSTOMER_JWT_SECRET).update(`${header}.${body}`).digest('base64url')
    if (sig !== expected) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

function customerIdFromRequest(req) {
  const auth = String(req.headers.authorization || '')
  if (!auth.startsWith('Bearer ')) return null
  const payload = verifyCustomerToken(auth.slice(7))
  const raw = payload?.id ? String(payload.id).trim() : ''
  return _CUSTOMER_UUID_RE.test(raw) ? raw : null
}

const CACHE_TTL_MS = 48 * 60 * 60 * 1000 // "2 günde bir güncellenir" — lazy refresh-on-read, not a proactive per-customer sweep

async function ensureTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS store_customer_product_views (
      customer_id uuid NOT NULL,
      product_id uuid NOT NULL,
      view_count integer NOT NULL DEFAULT 1,
      last_viewed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (customer_id, product_id)
    )
  `)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_customer_product_views_customer ON store_customer_product_views (customer_id, last_viewed_at DESC)`)
  await client.query(`
    CREATE TABLE IF NOT EXISTS store_personalized_products_cache (
      cache_key text PRIMARY KEY,
      product_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      computed_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

/** Root category ids a customer has interacted with, from an arbitrary product-id source query. */
async function categoryIdsFromProductQuery(client, sql, params) {
  const r = await client.query(sql, params)
  const ids = new Set()
  for (const row of r.rows) {
    const cats = Array.isArray(row.category_ids) ? row.category_ids : (row.category_id ? [row.category_id] : [])
    cats.forEach((c) => c && ids.add(String(c)))
  }
  return [...ids]
}

async function productsByIds(client, ids, limit) {
  if (!ids.length) return []
  // Must include variants + full row so ProductCard can resolve first-variant cover images
  // (parent umbrella rows often have no own media). Map through the same storefront mapper
  // as /store/products so carousels/cards get thumbnail + variants[].images.
  const { mapAdminHubToStoreProduct } = require('./store-products')
  const r = await client.query(
    `SELECT id, title, handle, sku, description, status, seller_id, collection_id,
            price_cents, inventory, metadata, variants, created_at, updated_at
       FROM admin_hub_products
      WHERE id = ANY($1::uuid[]) AND status = 'published'`,
    [ids],
  )
  // Preserve caller's ordering (ANY() doesn't guarantee it)
  const byId = new Map(r.rows.map((p) => [String(p.id), p]))
  return ids
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .slice(0, limit)
    .map((p) => mapAdminHubToStoreProduct(p, 'DE'))
}

const SALES_SCORE_SQL = `COALESCE((metadata->>'sold_last_month')::int, 0)`
const DISCOUNT_WHERE_SQL = `(
  (metadata->'prices'->'DE'->>'sale_cents') IS NOT NULL
    AND (metadata->'prices'->'DE'->>'sale_cents')::int > 0
    AND (metadata->'prices'->'DE'->>'sale_cents')::int < COALESCE((metadata->'prices'->'DE'->>'brutto_cents')::int, price_cents)
  OR (
    (metadata->>'rabattpreis_cents') IS NOT NULL
    AND (metadata->>'rabattpreis_cents')::int > 0
    AND (metadata->>'rabattpreis_cents')::int < price_cents
  )
)`

// Legacy landing-page blocks (PersonalizedProductRow, seeded before this rewrite) already
// store these older key names — keep them working rather than force a data migration.
const LEGACY_ALGORITHM_ALIASES = {
  top_picks: 'bestsellers',
  trending_for_you: 'trending_in_your_categories',
}

async function computeAlgorithm(client, algorithm, customerId, limit) {
  const key = LEGACY_ALGORITHM_ALIASES[algorithm] || algorithm
  switch (key) {
    case 'bestsellers': {
      const r = await client.query(
        `SELECT id FROM admin_hub_products WHERE status='published' ORDER BY ${SALES_SCORE_SQL} DESC, updated_at DESC LIMIT $1`,
        [limit],
      )
      return r.rows.map((x) => x.id)
    }
    case 'new_arrivals': {
      const r = await client.query(
        `SELECT id FROM admin_hub_products WHERE status='published' ORDER BY created_at DESC LIMIT $1`,
        [limit],
      )
      return r.rows.map((x) => x.id)
    }
    case 'on_sale': {
      const r = await client.query(
        `SELECT id FROM admin_hub_products WHERE status='published' AND ${DISCOUNT_WHERE_SQL} ORDER BY ${SALES_SCORE_SQL} DESC LIMIT $1`,
        [limit],
      )
      return r.rows.map((x) => x.id)
    }
    case 'reorder': {
      if (!customerId) return []
      const r = await client.query(
        `SELECT oi.product_id, MAX(o.created_at) as last_bought
         FROM store_order_items oi
         JOIN store_orders o ON o.id = oi.order_id
         WHERE o.customer_id = $1::uuid AND o.order_status != 'storniert' AND oi.product_id IS NOT NULL
         GROUP BY oi.product_id
         HAVING MAX(o.created_at) <= now() - interval '30 days'
         ORDER BY last_bought DESC LIMIT $2`,
        [customerId, limit],
      )
      return r.rows.map((x) => x.product_id).filter(Boolean)
    }
    case 'favorited': {
      if (!customerId) return []
      const r = await client.query(
        `SELECT w.product_id FROM store_customer_wishlist w
         JOIN admin_hub_products p ON p.id = w.product_id
         WHERE w.customer_id = $1::uuid AND p.status = 'published'
         ORDER BY w.created_at DESC LIMIT $2`,
        [customerId, limit],
      )
      return r.rows.map((x) => x.product_id)
    }
    case 'favorited_low_stock': {
      if (!customerId) return []
      const r = await client.query(
        `SELECT w.product_id FROM store_customer_wishlist w
         JOIN admin_hub_products p ON p.id = w.product_id
         WHERE w.customer_id = $1::uuid AND p.status = 'published' AND p.inventory IS NOT NULL AND p.inventory <= 10
         ORDER BY p.inventory ASC LIMIT $2`,
        [customerId, limit],
      )
      return r.rows.map((x) => x.product_id)
    }
    case 'favorited_price_drop': {
      if (!customerId) return []
      const r = await client.query(
        `SELECT w.product_id FROM store_customer_wishlist w
         JOIN admin_hub_products p ON p.id = w.product_id
         JOIN store_product_watch_state s ON s.product_id = p.id
         WHERE w.customer_id = $1::uuid AND p.status = 'published'
           AND s.last_price_cents IS NOT NULL AND p.price_cents < s.last_price_cents
         ORDER BY w.created_at DESC LIMIT $2`,
        [customerId, limit],
      )
      return r.rows.map((x) => x.product_id)
    }
    case 'category_bestsellers_from_purchases':
    case 'category_similar_from_favorites':
    case 'others_in_your_category':
    case 'trending_in_your_categories':
    case 'new_in_viewed_categories': {
      if (!customerId) return []
      let catIds = []
      if (algorithm === 'category_bestsellers_from_purchases') {
        catIds = await categoryIdsFromProductQuery(
          client,
          `SELECT p.metadata->'category_ids' AS category_ids FROM store_order_items oi
           JOIN store_orders o ON o.id = oi.order_id
           JOIN admin_hub_products p ON p.id::text = oi.product_id
           WHERE o.customer_id = $1::uuid AND o.order_status != 'storniert'`,
          [customerId],
        )
      } else if (algorithm === 'category_similar_from_favorites') {
        catIds = await categoryIdsFromProductQuery(
          client,
          `SELECT p.metadata->'category_ids' AS category_ids FROM store_customer_wishlist w
           JOIN admin_hub_products p ON p.id = w.product_id WHERE w.customer_id = $1::uuid`,
          [customerId],
        )
      } else {
        // view-based: trending_in_your_categories / others_in_your_category / new_in_viewed_categories
        catIds = await categoryIdsFromProductQuery(
          client,
          `SELECT p.metadata->'category_ids' AS category_ids FROM store_customer_product_views v
           JOIN admin_hub_products p ON p.id = v.product_id
           WHERE v.customer_id = $1::uuid AND v.last_viewed_at > now() - interval '30 days'`,
          [customerId],
        )
      }
      if (!catIds.length) return []
      const orderCol = algorithm === 'new_in_viewed_categories' ? 'created_at' : SALES_SCORE_SQL
      const r = await client.query(
        `SELECT id FROM admin_hub_products
         WHERE status='published' AND metadata->'category_ids' ?| $1::text[]
         ORDER BY ${orderCol} DESC LIMIT $2`,
        [catIds, limit],
      )
      return r.rows.map((x) => x.id)
    }
    case 'also_bought': {
      if (!customerId) return []
      const r = await client.query(
        `WITH mine AS (
           SELECT DISTINCT oi.product_id FROM store_order_items oi
           JOIN store_orders o ON o.id = oi.order_id
           WHERE o.customer_id = $1::uuid AND oi.product_id IS NOT NULL
         )
         SELECT oi2.product_id, COUNT(*)::int AS co_purchases
         FROM store_order_items oi1
         JOIN mine m ON m.product_id = oi1.product_id
         JOIN store_order_items oi2 ON oi2.order_id = oi1.order_id AND oi2.product_id != oi1.product_id
         WHERE oi2.product_id NOT IN (SELECT product_id FROM mine) AND oi2.product_id IS NOT NULL
         GROUP BY oi2.product_id
         ORDER BY co_purchases DESC LIMIT $2`,
        [customerId, limit],
      )
      return r.rows.map((x) => x.product_id)
    }
    case 'recently_viewed': {
      if (!customerId) return []
      const r = await client.query(
        `SELECT product_id FROM store_customer_product_views WHERE customer_id = $1::uuid ORDER BY last_viewed_at DESC LIMIT $2`,
        [customerId, limit],
      )
      return r.rows.map((x) => x.product_id)
    }
    case 'abandoned_cart_items': {
      if (!customerId) return []
      const r = await client.query(
        `SELECT ci.product_id FROM store_carts c
         JOIN store_cart_items ci ON ci.cart_id = c.id
         JOIN store_customers cust ON LOWER(TRIM(cust.email)) = LOWER(TRIM(c.email))
         LEFT JOIN store_orders o ON o.cart_id = c.id
         WHERE cust.id = $1::uuid AND o.id IS NULL AND ci.removed_at IS NULL AND ci.product_id IS NOT NULL
         ORDER BY ci.created_at DESC LIMIT $2`,
        [customerId, limit],
      )
      return r.rows.map((x) => x.product_id)
    }
    default:
      return []
  }
}

const GUEST_SAFE_ALGORITHMS = new Set(['bestsellers', 'new_arrivals', 'on_sale', 'top_picks'])

function createPersonalizationRouter() {
  const getDbClient = () => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    if (!dbUrl || !dbUrl.startsWith('postgres')) return null
    const { Client } = require('pg')
    return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
  }

  const storePersonalizationView = async (req, res) => {
    const customerId = customerIdFromRequest(req)
    if (!customerId) return res.status(401).json({ message: 'Login required' })
    const productId = String(req.body?.product_id || '').trim()
    if (!_CUSTOMER_UUID_RE.test(productId)) return res.status(400).json({ message: 'product_id required' })
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      await ensureTables(client)
      await client.query(
        `INSERT INTO store_customer_product_views (customer_id, product_id, view_count, last_viewed_at)
         VALUES ($1::uuid, $2::uuid, 1, now())
         ON CONFLICT (customer_id, product_id)
         DO UPDATE SET view_count = store_customer_product_views.view_count + 1, last_viewed_at = now()`,
        [customerId, productId],
      )
      await client.end()
      res.json({ ok: true })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  }

  const storePersonalizationProducts = async (req, res) => {
    const algorithm = String(req.query.algorithm || 'bestsellers').trim()
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 8))
    const customerId = customerIdFromRequest(req)
    if (!customerId && !GUEST_SAFE_ALGORITHMS.has(algorithm)) {
      return res.json({ products: [], reason: 'login_required' })
    }
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      await ensureTables(client)
      const cacheKey = `${algorithm}:${customerId || 'guest'}`
      const cached = await client.query(
        `SELECT product_ids, computed_at FROM store_personalized_products_cache WHERE cache_key = $1`,
        [cacheKey],
      )
      const row = cached.rows[0]
      const isFresh = row && Date.now() - new Date(row.computed_at).getTime() < CACHE_TTL_MS
      let productIds
      if (isFresh) {
        productIds = Array.isArray(row.product_ids) ? row.product_ids : []
      } else {
        productIds = await computeAlgorithm(client, algorithm, customerId, limit)
        await client.query(
          `INSERT INTO store_personalized_products_cache (cache_key, product_ids, computed_at)
           VALUES ($1, $2::jsonb, now())
           ON CONFLICT (cache_key) DO UPDATE SET product_ids = $2::jsonb, computed_at = now()`,
          [cacheKey, JSON.stringify(productIds)],
        )
      }
      const products = await productsByIds(client, productIds, limit)
      await client.end()
      res.json({ products, algorithm, cached: isFresh })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error', products: [] })
    }
  }

  const router = Router()
  router.post('/store/personalization/view', storePersonalizationView)
  router.get('/store/personalization/products', storePersonalizationProducts)
  return router
}

module.exports = { createPersonalizationRouter, ALGORITHM_KEYS: [
  'bestsellers', 'new_arrivals', 'on_sale',
  'reorder', 'favorited', 'favorited_low_stock', 'favorited_price_drop',
  'category_bestsellers_from_purchases', 'category_similar_from_favorites',
  'also_bought', 'recently_viewed', 'trending_in_your_categories',
  'others_in_your_category', 'new_in_viewed_categories', 'abandoned_cart_items',
] }
