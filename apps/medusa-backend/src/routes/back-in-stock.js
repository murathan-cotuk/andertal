'use strict'
const { Router } = require('express')
const { sendEmail } = require('../email')

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
}

// Run once at startup — idempotent CREATE IF NOT EXISTS (same house pattern as metafields.js).
// variant_id defaults to '' (not NULL) so the UNIQUE constraint actually dedupes "whole product"
// subscriptions (no variant chosen) the same way it does per-variant ones.
;(async () => {
  const client = getDbClient()
  if (!client) return
  try {
    await client.connect()
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_back_in_stock_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL,
        product_id UUID NOT NULL,
        variant_id TEXT NOT NULL DEFAULT '',
        locale TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        notified_at TIMESTAMPTZ,
        UNIQUE(email, product_id, variant_id)
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_back_in_stock_product ON store_back_in_stock_subscriptions(product_id)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_back_in_stock_pending ON store_back_in_stock_subscriptions(product_id) WHERE notified_at IS NULL`)
    await client.end()
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('[back-in-stock] table setup failed:', e?.message || e)
  }
})()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** POST /store/back-in-stock-subscribe — public, guest-friendly (no login required). */
const storeBackInStockSubscribePOST = async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  // A product currently attributed to another seller's listing (shared-EAN "buy box" winner —
  // see mapOtherSellersFromScored in store-products.js) ships to the shop as a composite id
  // "<masterProductUuid>-listing-<sellerId>", not a real admin_hub_products.id. Strip that suffix
  // so the alert still gets stored against the real master product instead of 400ing every time
  // a sold-out product happens to currently be shown via a listing.
  const rawProductId = String(req.body?.product_id || '').trim()
  const productId = rawProductId.includes('-listing-') ? rawProductId.split('-listing-')[0] : rawProductId
  const variantId = String(req.body?.variant_id || '').trim()
  const locale = String(req.body?.locale || 'de').trim().slice(0, 5) || 'de'
  if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Invalid email' })
  if (!/^[0-9a-f-]{10,}$/i.test(productId)) return res.status(400).json({ message: 'product_id required' })

  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database unavailable' })
  try {
    await client.connect()
    const exists = await client.query('SELECT id FROM admin_hub_products WHERE id = $1::uuid', [productId])
    if (!exists.rows[0]) { await client.end(); return res.status(404).json({ message: 'Product not found' }) }
    // Re-subscribing after an earlier notification (e.g. it sold out again) re-arms the alert —
    // clear notified_at on conflict instead of silently no-op'ing.
    await client.query(
      `INSERT INTO store_back_in_stock_subscriptions (email, product_id, variant_id, locale)
       VALUES ($1, $2::uuid, $3, $4)
       ON CONFLICT (email, product_id, variant_id) DO UPDATE SET notified_at = NULL, locale = EXCLUDED.locale`,
      [email, productId, variantId, locale],
    )
    await client.end()
    res.json({ success: true })
  } catch (e) {
    try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

/**
 * GET /admin-hub/v1/back-in-stock-subscribers — superuser only.
 * Returns both views the sellercentral page needs in one call: the raw subscriber rows (Tab 1 —
 * customers) and per-product waiting counts with category info (Tab 2 — category tree).
 */
const adminHubBackInStockSubscribersGET = async (req, res) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database unavailable' })
  try {
    await client.connect()
    const subs = await client.query(`
      SELECT s.id, s.email, s.variant_id, s.locale, s.created_at, s.notified_at,
             p.id AS product_id, p.title, p.handle
        FROM store_back_in_stock_subscriptions s
        JOIN admin_hub_products p ON p.id = s.product_id
       ORDER BY s.created_at DESC
       LIMIT 2000
    `)
    const counts = await client.query(`
      SELECT p.id AS product_id, p.title, p.handle,
             (p.metadata->>'category_id') AS category_id,
             (p.metadata->>'admin_category_id') AS admin_category_id,
             COUNT(*) FILTER (WHERE s.notified_at IS NULL)::int AS waiting_count
        FROM store_back_in_stock_subscriptions s
        JOIN admin_hub_products p ON p.id = s.product_id
       GROUP BY p.id, p.title, p.handle, p.metadata
      HAVING COUNT(*) FILTER (WHERE s.notified_at IS NULL) > 0
       ORDER BY waiting_count DESC
    `)
    await client.end()
    res.json({
      subscribers: subs.rows.map((r) => ({
        id: r.id, email: r.email, variant_id: r.variant_id || null, locale: r.locale,
        created_at: r.created_at, notified_at: r.notified_at,
        product: { id: r.product_id, title: r.title, handle: r.handle },
      })),
      product_counts: counts.rows.map((r) => ({
        product_id: r.product_id, title: r.title, handle: r.handle,
        category_id: r.category_id || r.admin_category_id || null,
        waiting_count: r.waiting_count,
      })),
    })
  } catch (e) {
    try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

/**
 * Periodic watcher (mirrors flow-automation.js's runProductWishlistWatchers cadence/pattern,
 * but simpler — no snapshot table needed: a subscription with notified_at still NULL on a
 * product that currently has stock is by definition "restocked since they asked", send once,
 * stamp notified_at so it never fires twice for the same subscription.
 */
async function runBackInStockWatcher() {
  const client = getDbClient()
  if (!client) return
  try {
    await client.connect()
    const due = await client.query(`
      SELECT s.id, s.email, s.locale, p.id AS product_id, p.title, p.handle, p.metadata
        FROM store_back_in_stock_subscriptions s
        JOIN admin_hub_products p ON p.id = s.product_id
       WHERE s.notified_at IS NULL
         AND p.status = 'published'
         AND COALESCE(p.inventory, 0) > 0
       LIMIT 500
    `)
    for (const row of due.rows || []) {
      try {
        const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
        const deTitle = meta.translations?.de?.title || row.title || 'Produkt'
        const handle = meta.translations?.de?.handle || row.handle
        const base = String(process.env.STOREFRONT_PUBLIC_URL || process.env.NEXT_PUBLIC_SHOP_URL || '').trim().replace(/\/$/, '')
        const url = base && handle ? `${base}/de/de/produkt/${encodeURIComponent(handle)}` : null
        await sendEmail({
          to: row.email,
          subject: `${deTitle} ist wieder verfügbar!`,
          html: `<p>Gute Nachrichten! <strong>${deTitle}</strong> ist wieder auf Lager.</p>${url ? `<p><a href="${url}">Jetzt ansehen</a></p>` : ''}`,
          text: `${deTitle} ist wieder auf Lager.${url ? ` ${url}` : ''}`,
        })
        await client.query('UPDATE store_back_in_stock_subscriptions SET notified_at = now() WHERE id = $1', [row.id])
      } catch (e) {
        console.error('[back-in-stock] notify failed for', row.email, e?.message || e)
      }
    }
    await client.end()
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('[back-in-stock] watcher failed:', e?.message || e)
  }
}

module.exports = function createBackInStockRouter() {
  const router = Router()
  router.post('/store/back-in-stock-subscribe', storeBackInStockSubscribePOST)
  router.get('/admin-hub/v1/back-in-stock-subscribers', adminHubBackInStockSubscribersGET)
  return router
}

module.exports.runBackInStockWatcher = runBackInStockWatcher
