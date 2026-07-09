'use strict'
/**
 * Public API v1 — /api/public-api/v1/
 * Auth: Bearer <access_token> (OAuth token issued by /oauth/token)
 * All endpoints are scoped per installation.seller_id
 */
const { Router } = require('express')
const { hashSecret, timingSafeEqual } = require('../modules/app-platform/crypto')

function getDbClient() {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

// Simple in-memory rate limiter: appId+sellerId → { count, resetAt }
const _rateLimitMap = new Map()
function checkRateLimit(key, maxPerMinute) {
  const now = Date.now()
  const entry = _rateLimitMap.get(key) || { count: 0, resetAt: now + 60000 }
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60000 }
  entry.count++
  _rateLimitMap.set(key, entry)
  return entry.count <= maxPerMinute
}

async function resolveToken(req, res, next) {
  const auth = req.headers.authorization || ''
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Bearer token required' })
  const rawToken = auth.slice(7).trim()
  if (!rawToken) return res.status(401).json({ error: 'Bearer token required' })

  const client = getDbClient()
  if (!client) return res.status(503).json({ error: 'Service unavailable' })
  try {
    await client.connect()
    const h = hashSecret(rawToken)
    const r = await client.query(
      `SELECT t.id, t.scopes, t.expires_at, t.revoked_at,
              i.seller_id, i.app_id, i.id AS installation_id, i.uninstalled_at
       FROM platform_app_tokens t
       JOIN platform_app_installations i ON i.id = t.installation_id
       WHERE t.access_token_hash = $1`,
      [h]
    )
    await client.end()
    const tok = r.rows[0]
    if (!tok || tok.revoked_at || new Date(tok.expires_at) < new Date() || tok.uninstalled_at) {
      return res.status(401).json({ error: 'invalid_token', error_description: 'Token is expired, revoked, or app was uninstalled' })
    }
    req.apiToken = tok
    req.apiSellerId = tok.seller_id
    req.apiScopes = new Set(tok.scopes || [])
    req.apiAppId = tok.app_id
    next()
  } catch (e) {
    try { await client.end() } catch (_) {}
    res.status(500).json({ error: 'server_error' })
  }
}

function requireScope(scope) {
  return (req, res, next) => {
    if (!req.apiScopes?.has(scope)) {
      return res.status(403).json({ error: 'insufficient_scope', required: scope })
    }
    const key = `${req.apiAppId}:${req.apiSellerId}`
    if (!checkRateLimit(key, 500)) {
      return res.status(429).json({ error: 'rate_limit_exceeded' })
    }
    next()
  }
}

module.exports = function createPublicApiV1Router() {
  const router = Router()
  router.use(resolveToken)

  // ── GET /orders ──────────────────────────────────────────────────────────────
  router.get('/orders', requireScope('read_orders'), async (req, res) => {
    const client = getDbClient()
    if (!client) return res.status(503).json({ error: 'Service unavailable' })
    try {
      await client.connect()
      const limit = Math.min(Number(req.query.limit || 50), 250)
      const offset = Number(req.query.offset || 0)
      const status = req.query.status
      const params = [req.apiSellerId]
      let where = 'WHERE o.seller_id = $1'
      if (status) { params.push(status); where += ` AND o.status = $${params.length}` }
      const r = await client.query(
        `SELECT o.id, o.status, o.created_at, o.updated_at, o.total_cents, o.currency,
                o.customer_email, o.delivery_status, o.tracking_number, o.carrier_name
         FROM store_orders o ${where}
         ORDER BY o.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
        params
      )
      const count = await client.query(`SELECT COUNT(*) FROM store_orders o ${where}`, params)
      await client.end()
      res.json({ orders: r.rows, count: Number(count.rows[0].count), limit, offset })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ error: 'server_error', message: e?.message })
    }
  })

  // ── GET /orders/:id ──────────────────────────────────────────────────────────
  router.get('/orders/:id', requireScope('read_orders'), async (req, res) => {
    const client = getDbClient()
    if (!client) return res.status(503).json({ error: 'Service unavailable' })
    try {
      await client.connect()
      const r = await client.query(
        `SELECT o.*, json_agg(json_build_object(
           'id', oi.id, 'variant_id', oi.variant_id, 'title', oi.title,
           'quantity', oi.quantity, 'unit_price_cents', oi.unit_price_cents
         )) AS items
         FROM store_orders o
         LEFT JOIN store_order_items oi ON oi.order_id = o.id
         WHERE o.id = $1 AND o.seller_id = $2
         GROUP BY o.id`,
        [req.params.id, req.apiSellerId]
      )
      await client.end()
      if (!r.rows[0]) return res.status(404).json({ error: 'order_not_found' })
      res.json({ order: r.rows[0] })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ error: 'server_error', message: e?.message })
    }
  })

  // ── POST /orders/:id/fulfillments ────────────────────────────────────────────
  router.post('/orders/:id/fulfillments', requireScope('write_fulfillments'), async (req, res) => {
    const { tracking_number, carrier_name, shipped_at } = req.body || {}
    if (!tracking_number || !carrier_name) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'tracking_number and carrier_name are required' })
    }
    const client = getDbClient()
    if (!client) return res.status(503).json({ error: 'Service unavailable' })
    try {
      await client.connect()
      const r = await client.query(
        `UPDATE store_orders
         SET tracking_number = $1, carrier_name = $2, delivery_status = 'versendet',
             shipped_at = $3, updated_at = now()
         WHERE id = $4 AND seller_id = $5
         RETURNING id, tracking_number, carrier_name, delivery_status, shipped_at`,
        [tracking_number, carrier_name, shipped_at ? new Date(shipped_at) : new Date(), req.params.id, req.apiSellerId]
      )
      if (!r.rows[0]) { await client.end(); return res.status(404).json({ error: 'order_not_found' }) }
      // Record shipment event
      await client.query(
        `INSERT INTO store_shipment_events (id, order_id, event_type, carrier_name, tracking_number, created_at)
         VALUES (gen_random_uuid(), $1, 'shipped', $2, $3, now())`,
        [req.params.id, carrier_name, tracking_number]
      ).catch(() => {})
      await client.end()
      res.json({ fulfillment: r.rows[0] })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ error: 'server_error', message: e?.message })
    }
  })

  // ── GET /products ────────────────────────────────────────────────────────────
  router.get('/products', requireScope('read_products'), async (req, res) => {
    const client = getDbClient()
    if (!client) return res.status(503).json({ error: 'Service unavailable' })
    try {
      await client.connect()
      const limit = Math.min(Number(req.query.limit || 50), 250)
      const offset = Number(req.query.offset || 0)
      const r = await client.query(
        `SELECT id, title, handle, status, created_at, updated_at, metadata
         FROM products WHERE metadata->>'seller_id' = $1
         ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
        [req.apiSellerId]
      )
      await client.end()
      res.json({ products: r.rows, limit, offset })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ error: 'server_error', message: e?.message })
    }
  })

  // ── PUT /inventory/:sku ──────────────────────────────────────────────────────
  router.put('/inventory/:sku', requireScope('write_inventory'), async (req, res) => {
    const { quantity } = req.body || {}
    if (quantity == null || !Number.isFinite(Number(quantity)) || Number(quantity) < 0) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'quantity must be a non-negative number' })
    }
    const client = getDbClient()
    if (!client) return res.status(503).json({ error: 'Service unavailable' })
    try {
      await client.connect()
      const r = await client.query(
        `UPDATE product_variants SET inventory_quantity = $1, updated_at = now()
         WHERE sku = $2 AND id IN (
           SELECT pv.id FROM product_variants pv JOIN products p ON p.id = pv.product_id
           WHERE p.metadata->>'seller_id' = $3
         )
         RETURNING id, sku, inventory_quantity`,
        [Math.round(Number(quantity)), req.params.sku, req.apiSellerId]
      )
      await client.end()
      if (!r.rows[0]) return res.status(404).json({ error: 'variant_not_found' })
      res.json({ variant: r.rows[0] })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ error: 'server_error', message: e?.message })
    }
  })

  return router
}
