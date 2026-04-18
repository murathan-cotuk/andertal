/**
 * Belucha Public Marketplace API
 *
 * Genel endpoint: /api/v1/
 * Billbee alias:  /api/billbee/  (aynı handler'lar)
 *
 * Auth: HTTP Basic
 *   username = belucha_zug_...  (api_key)   → store_integrations lookup
 *   password = belucha_ssk_...  (api_secret)
 *
 *   Fallback: username = seller email veya seller_id → seller_users lookup
 */

const crypto = require('crypto')

const RATE_WINDOW_MS = 60 * 1000
const RATE_MAX = 120
const rateState = new Map()

function logEvent(name, detail = {}) {
  try { console.log(JSON.stringify({ event: name, ts: new Date().toISOString(), ...detail })) } catch (_) {}
}

function parseBasicAuth(req) {
  const h = String(req.headers.authorization || '')
  if (!h.startsWith('Basic ')) return null
  try {
    const raw = Buffer.from(h.slice(6).trim(), 'base64').toString('utf8')
    const i = raw.indexOf(':')
    return { username: String(i >= 0 ? raw.slice(0, i) : raw).trim(), password: i >= 0 ? raw.slice(i + 1) : '' }
  } catch { return null }
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a), 'utf8')
  const bb = Buffer.from(String(b), 'utf8')
  if (aa.length !== bb.length) return false
  return crypto.timingSafeEqual(aa, bb)
}

function checkRateLimit(key) {
  const now = Date.now()
  const row = rateState.get(key) || { count: 0, reset: now + RATE_WINDOW_MS }
  if (now > row.reset) { row.count = 0; row.reset = now + RATE_WINDOW_MS }
  row.count += 1
  rateState.set(key, row)
  return row.count <= RATE_MAX
}

function toOrderState(orderStatus, paymentStatus, deliveryStatus) {
  const s = String(orderStatus || '').toLowerCase()
  const p = String(paymentStatus || '').toLowerCase()
  const d = String(deliveryStatus || '').toLowerCase()
  if (s === 'cancelled' || s === 'storniert') return 6
  if (d === 'delivered' || d === 'geliefert') return 5
  if (d === 'shipped' || d === 'versendet') return 4
  if (p === 'bezahlt' || p === 'paid') return 3
  if (s === 'processing' || s === 'confirmed') return 2
  return 1
}

function mountBillbeeMarketplaceApi(httpApp, deps) {
  const { getSellerDbClient, getProductsDbClient } = deps
  if (!getSellerDbClient || !getProductsDbClient) {
    console.warn('marketplace-api: missing deps; routes not mounted')
    return
  }

  async function authenticate(req, res, next) {
    const basic = parseBasicAuth(req)
    if (!basic || !basic.username) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Belucha API"')
      return res.status(401).json({ error: 'Unauthorized', message: 'Basic authentication required' })
    }

    const { Client } = require('pg')
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')

    // ── Path A: username = belucha_zug_ api_key ──────────────────────────────
    if (basic.username.startsWith('belucha_zug_') && dbUrl) {
      let c
      try {
        c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await c.connect()
        const r = await c.query(
          `SELECT api_key, api_secret, seller_scope_key FROM store_integrations
           WHERE api_key = $1 AND is_active = true AND api_secret IS NOT NULL LIMIT 1`,
          [basic.username],
        )
        await c.end(); c = null
        const row = r.rows[0]
        if (!row || !row.api_secret || !safeEqual(basic.password, row.api_secret)) {
          logEvent('api.auth.failed', { reason: 'bad_api_credentials' })
          res.setHeader('WWW-Authenticate', 'Basic realm="Belucha API"')
          return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' })
        }
        const sellerId = String(row.seller_scope_key || '').trim()
        if (!sellerId) return res.status(403).json({ error: 'Forbidden', message: 'No seller scope' })
        if (!checkRateLimit(sellerId)) return res.status(429).json({ error: 'Too Many Requests' })
        req.apiSeller = { seller_id: sellerId }
        logEvent('api.auth.success', { seller_id: sellerId, via: 'api_key' })
        return next()
      } catch (e) {
        if (c) try { await c.end() } catch (_) {}
        logEvent('api.auth.failed', { reason: 'exception', message: e?.message })
        return res.status(500).json({ error: 'Internal Server Error' })
      }
    }

    // ── Path B: username = email or seller_id ─────────────────────────────────
    let client
    try {
      client = getSellerDbClient()
      if (!client) return res.status(503).json({ error: 'Service unavailable' })
      await client.connect()
      const r = await client.query(
        `SELECT id, email, seller_id, sub_of_seller_id, approval_status, belucha_billbee_api_key, belucha_billbee_api_secret
         FROM seller_users
         WHERE (LOWER(TRIM(email)) = LOWER(TRIM($1)) OR TRIM(seller_id) = TRIM($1)) LIMIT 2`,
        [basic.username],
      )
      await client.end(); client = null

      if (!r.rows || r.rows.length !== 1) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Belucha API"')
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' })
      }
      const row = r.rows[0]
      const st = String(row.approval_status || '').toLowerCase()
      if (st === 'rejected' || st === 'suspended') return res.status(403).json({ error: 'Forbidden', message: 'Account inactive' })

      const primaryOk = row.belucha_billbee_api_key && row.belucha_billbee_api_secret &&
        safeEqual(basic.password, row.belucha_billbee_api_secret)

      if (!primaryOk) {
        const scopeKey = row.sub_of_seller_id
          ? String(row.sub_of_seller_id).trim()
          : String(row.seller_id || `user_${row.id}`).trim()
        let integOk = false
        if (dbUrl) {
          let c
          try {
            c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
            await c.connect()
            const ir = await c.query(
              `SELECT api_secret FROM store_integrations WHERE seller_scope_key = $1 AND is_active = true AND api_secret IS NOT NULL LIMIT 20`,
              [scopeKey],
            )
            await c.end(); c = null
            integOk = (ir.rows || []).some((i) => i.api_secret && safeEqual(basic.password, i.api_secret))
          } catch (_) { if (c) try { await c.end() } catch (__) {} }
        }
        if (!integOk) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Belucha API"')
          return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' })
        }
      }

      const sellerId = row.sub_of_seller_id ? String(row.sub_of_seller_id).trim() : String(row.seller_id).trim()
      if (!sellerId) return res.status(403).json({ error: 'Forbidden', message: 'No seller scope' })
      if (!checkRateLimit(sellerId)) return res.status(429).json({ error: 'Too Many Requests' })
      req.apiSeller = { user_id: row.id, email: row.email, seller_id: sellerId }
      logEvent('api.auth.success', { seller_id: sellerId, via: 'email' })
      next()
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      return res.status(500).json({ error: 'Internal Server Error' })
    }
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  async function handleOrders(req, res) {
    const sid = req.apiSeller.seller_id
    const page = Math.max(1, parseInt(req.query.page || '1', 10))
    const pageSize = Math.min(250, Math.max(1, parseInt(req.query.pageSize || '50', 10)))
    const minDate = req.query.minDate || req.query.mindate || null
    let client
    try {
      client = getProductsDbClient()
      await client.connect()

      const where = ['seller_id = $1']
      const params = [sid]
      if (minDate) { params.push(minDate); where.push(`created_at >= $${params.length}`) }

      const countRes = await client.query(`SELECT COUNT(*) FROM store_orders WHERE ${where.join(' AND ')}`, params)
      const totalRows = parseInt(countRes.rows[0]?.count || '0', 10)
      const totalPages = Math.ceil(totalRows / pageSize) || 1

      params.push(pageSize); params.push((page - 1) * pageSize)
      const oRes = await client.query(
        `SELECT id, order_number, email, first_name, last_name, phone,
                status, order_status, payment_status, delivery_status,
                total_cents, currency, subtotal_cents, shipping_cents, discount_cents,
                created_at, updated_at
         FROM store_orders
         WHERE ${where.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      )
      const orders = oRes.rows || []
      const ids = orders.map((o) => o.id)
      const itemsByOrder = {}
      if (ids.length) {
        const iRes = await client.query(
          `SELECT order_id, product_id, variant_id, quantity, unit_price_cents, title, product_handle
           FROM store_order_items WHERE order_id = ANY($1::uuid[])`,
          [ids],
        )
        for (const it of iRes.rows || []) {
          if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = []
          itemsByOrder[it.order_id].push(it)
        }
      }
      await client.end(); client = null

      const toEur = (cents) => cents != null ? Math.round(Number(cents)) / 100 : 0
      const data = orders.map((o) => ({
        BillbeeId: null,
        ExternalId: String(o.id),
        OrderNumber: o.order_number || String(o.id),
        State: toOrderState(o.order_status || o.status, o.payment_status, o.delivery_status),
        Currency: String(o.currency || 'EUR').toUpperCase(),
        TotalCost: toEur(o.total_cents),
        ShippingCost: toEur(o.shipping_cents),
        CreatedAt: o.created_at,
        UpdatedAt: o.updated_at,
        InvoiceAddress: {
          FirstName: o.first_name || '', LastName: o.last_name || '',
          Email: o.email || '', Phone: o.phone || '',
        },
        ShippingAddress: {
          FirstName: o.first_name || '', LastName: o.last_name || '',
          Email: o.email || '', Phone: o.phone || '',
        },
        OrderItems: (itemsByOrder[o.id] || []).map((it) => ({
          BillbeeId: null,
          ExternalId: String(it.product_id || ''),
          Quantity: Number(it.quantity) || 1,
          UnitPrice: toEur(it.unit_price_cents),
          TotalPrice: toEur(it.unit_price_cents) * (Number(it.quantity) || 1),
          Title: it.title || '',
          ProductId: String(it.product_id || ''),
        })),
      }))

      logEvent('api.orders.fetch', { seller_id: sid, count: data.length })
      res.json({ Paging: { Page: page, TotalPages: totalPages, TotalRows: totalRows, PageSize: pageSize }, Data: data })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      logEvent('api.error', { route: 'orders', message: e?.message })
      res.status(500).json({ error: 'Internal Server Error', detail: e?.message })
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────
  async function handleProducts(req, res) {
    const sid = req.apiSeller.seller_id
    const page = Math.max(1, parseInt(req.query.page || '1', 10))
    const pageSize = Math.min(250, Math.max(1, parseInt(req.query.pageSize || '50', 10)))
    let client
    try {
      client = getProductsDbClient()
      await client.connect()
      const countRes = await client.query(`SELECT COUNT(*) FROM admin_hub_products WHERE seller_id = $1`, [sid])
      const totalRows = parseInt(countRes.rows[0]?.count || '0', 10)
      const totalPages = Math.ceil(totalRows / pageSize) || 1
      const r = await client.query(
        `SELECT id, title, handle, sku, description, status, price_cents, inventory, metadata, created_at, updated_at
         FROM admin_hub_products WHERE seller_id = $1
         ORDER BY updated_at DESC LIMIT $2 OFFSET $3`,
        [sid, pageSize, (page - 1) * pageSize],
      )
      await client.end(); client = null

      const data = (r.rows || []).map((p) => ({
        BillbeeId: null,
        Id: String(p.id),
        Title: p.title || '',
        SKU: p.sku || '',
        EAN: null,
        ShortDescription: p.description || '',
        Price: p.price_cents != null ? Math.round(Number(p.price_cents)) / 100 : 0,
        Quantity: Number(p.inventory) || 0,
        IsActive: ['active', 'published'].includes(String(p.status || '').toLowerCase()),
        MainImage: p.metadata?.thumbnail || p.metadata?.image_url || null,
        CreatedAt: p.created_at,
        LastModifiedAt: p.updated_at,
      }))

      logEvent('api.products.fetch', { seller_id: sid, count: data.length })
      res.json({ Paging: { Page: page, TotalPages: totalPages, TotalRows: totalRows, PageSize: pageSize }, Data: data })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      logEvent('api.error', { route: 'products', message: e?.message })
      res.status(500).json({ error: 'Internal Server Error', detail: e?.message })
    }
  }

  // ── Stock ─────────────────────────────────────────────────────────────────
  async function handleStock(req, res) {
    const sid = req.apiSeller.seller_id
    let client
    try {
      client = getProductsDbClient()
      await client.connect()
      const r = await client.query(
        `SELECT id::text AS product_id, COALESCE(inventory, 0)::integer AS stock_quantity
         FROM admin_hub_products WHERE seller_id = $1`, [sid])
      await client.end(); client = null
      res.json({ stock: (r.rows || []).map((row) => ({ product_id: row.product_id, stock_quantity: row.stock_quantity })) })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      res.status(500).json({ error: 'Internal Server Error', detail: e?.message })
    }
  }

  const ping = (_req, res) => res.json({ ok: true, name: 'Belucha Marketplace API', version: '1.0' })

  // ── /api/v1/ — genel endpoint ─────────────────────────────────────────────
  httpApp.get('/api/v1', ping)
  httpApp.get('/api/v1/orders', authenticate, handleOrders)
  httpApp.get('/api/v1/products', authenticate, handleProducts)
  httpApp.get('/api/v1/stock', authenticate, handleStock)
  httpApp.post('/api/v1/webhook/order-update', authenticate, (req, res) => res.status(204).end())

  // ── /api/billbee/ — Billbee alias ─────────────────────────────────────────
  httpApp.get('/api/billbee', ping)
  httpApp.get('/api/billbee/orders', authenticate, handleOrders)
  httpApp.get('/api/billbee/products', authenticate, handleProducts)
  httpApp.get('/api/billbee/stock', authenticate, handleStock)
  httpApp.post('/api/billbee/webhook/order-update', authenticate, (req, res) => res.status(204).end())

  console.log('Marketplace API mounted: /api/v1/ and /api/billbee/ (alias)')
}

module.exports = { mountBillbeeMarketplaceApi }
