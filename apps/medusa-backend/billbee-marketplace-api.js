/**
 * Public Billbee ↔ Belucha marketplace API (/api/billbee/*).
 * Auth: HTTP Basic (username = seller email or seller_id, password = belucha_billbee_api_secret)
 *       + optional header X-Belucha-Api-Key: belucha_billbee_api_key (recommended).
 */

const crypto = require('crypto')

const RATE_WINDOW_MS = 60 * 1000
const RATE_MAX = 120
const rateState = new Map()

function logBillbeeEvent(name, detail = {}) {
  try {
    console.log(JSON.stringify({ event: name, ts: new Date().toISOString(), ...detail }))
  } catch (_) {}
}

function parseBasicAuth(req) {
  const h = String(req.headers.authorization || '')
  if (!h.startsWith('Basic ')) return null
  try {
    const raw = Buffer.from(h.slice(6).trim(), 'base64').toString('utf8')
    const i = raw.indexOf(':')
    const username = i >= 0 ? raw.slice(0, i) : raw
    const password = i >= 0 ? raw.slice(i + 1) : ''
    return { username: String(username).trim(), password: String(password) }
  } catch {
    return null
  }
}

function timingSafeEqualString(a, b) {
  const aa = Buffer.from(String(a), 'utf8')
  const bb = Buffer.from(String(b), 'utf8')
  if (aa.length !== bb.length) return false
  return crypto.timingSafeEqual(aa, bb)
}

function checkRateLimit(sellerId) {
  const now = Date.now()
  const row = rateState.get(sellerId) || { count: 0, reset: now + RATE_WINDOW_MS }
  if (now > row.reset) {
    row.count = 0
    row.reset = now + RATE_WINDOW_MS
  }
  row.count += 1
  rateState.set(sellerId, row)
  return row.count <= RATE_MAX
}

function mountBillbeeMarketplaceApi(httpApp, deps) {
  const { getSellerDbClient, getProductsDbClient } = deps
  if (!getSellerDbClient || !getProductsDbClient) {
    console.warn('billbee-marketplace-api: missing getSellerDbClient/getProductsDbClient; routes not mounted')
    return
  }

  async function authenticateBeluchaBillbee(req, res, next) {
    const basic = parseBasicAuth(req)
    if (!basic || !basic.username) {
      logBillbeeEvent('billbee.auth.failed', { reason: 'missing_basic' })
      res.setHeader('WWW-Authenticate', 'Basic realm="Belucha Billbee API"')
      return res.status(401).json({ error: 'Unauthorized', message: 'Basic authentication required' })
    }

    const apiKeyHeader = String(
      req.headers['x-belucha-api-key'] || req.headers['x-api-key'] || '',
    ).trim()

    let client
    try {
      client = getSellerDbClient()
      if (!client) return res.status(503).json({ error: 'Service unavailable' })
      await client.connect()
      const r = await client.query(
        `SELECT id, email, seller_id, sub_of_seller_id, approval_status, belucha_billbee_api_key, belucha_billbee_api_secret
         FROM seller_users
         WHERE (LOWER(TRIM(email)) = LOWER(TRIM($1)) OR TRIM(seller_id) = TRIM($1))
         LIMIT 2`,
        [basic.username],
      )
      await client.end()
      client = null

      if (!r.rows || r.rows.length !== 1) {
        logBillbeeEvent('billbee.auth.failed', { reason: 'user_not_found' })
        res.setHeader('WWW-Authenticate', 'Basic realm="Belucha Billbee API"')
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' })
      }

      const row = r.rows[0]
      const st = String(row.approval_status || '').toLowerCase()
      if (st === 'rejected' || st === 'suspended') {
        logBillbeeEvent('billbee.auth.failed', { reason: 'seller_inactive', approval_status: row.approval_status })
        return res.status(403).json({ error: 'Forbidden', message: 'Seller account is not active' })
      }

      if (!row.belucha_billbee_api_key || !row.belucha_billbee_api_secret) {
        logBillbeeEvent('billbee.auth.failed', { reason: 'keys_not_provisioned' })
        return res.status(403).json({ error: 'Forbidden', message: 'Billbee API keys not provisioned for this account' })
      }

      if (!timingSafeEqualString(basic.password, row.belucha_billbee_api_secret)) {
        logBillbeeEvent('billbee.auth.failed', { reason: 'bad_password' })
        res.setHeader('WWW-Authenticate', 'Basic realm="Belucha Billbee API"')
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' })
      }

      if (apiKeyHeader && apiKeyHeader !== row.belucha_billbee_api_key) {
        logBillbeeEvent('billbee.auth.failed', { reason: 'api_key_mismatch' })
        return res.status(401).json({ error: 'Unauthorized', message: 'X-Belucha-Api-Key does not match' })
      }

      const effectiveSellerId = row.sub_of_seller_id ? String(row.sub_of_seller_id).trim() : String(row.seller_id).trim()
      if (!effectiveSellerId) {
        return res.status(403).json({ error: 'Forbidden', message: 'No seller scope' })
      }

      if (!checkRateLimit(effectiveSellerId)) {
        logBillbeeEvent('billbee.auth.failed', { reason: 'rate_limit', seller_id: effectiveSellerId })
        return res.status(429).json({ error: 'Too Many Requests' })
      }

      req.beluchaBillbeeSeller = {
        user_id: row.id,
        email: row.email,
        seller_id: effectiveSellerId,
      }
      logBillbeeEvent('billbee.auth.success', { seller_id: effectiveSellerId })
      next()
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      logBillbeeEvent('billbee.auth.failed', { reason: 'exception', message: e?.message })
      return res.status(500).json({ error: 'Internal Server Error' })
    }
  }

  async function handleOrders(req, res) {
    const sid = req.beluchaBillbeeSeller.seller_id
    let client
    try {
      client = getProductsDbClient()
      await client.connect()
      const oRes = await client.query(
        `SELECT id, order_number, email, first_name, last_name, phone, status, order_status, payment_status, delivery_status,
                total_cents, currency, subtotal_cents, shipping_cents, discount_cents, created_at, updated_at, seller_id
         FROM store_orders
         WHERE seller_id = $1
         ORDER BY created_at DESC
         LIMIT 200`,
        [sid],
      )
      const orders = oRes.rows || []
      const ids = orders.map((o) => o.id)
      let itemsByOrder = {}
      if (ids.length) {
        const iRes = await client.query(
          `SELECT order_id, product_id, variant_id, quantity, unit_price_cents, title, product_handle, thumbnail
           FROM store_order_items
           WHERE order_id = ANY($1::uuid[])`,
          [ids],
        )
        for (const it of iRes.rows || []) {
          const oid = it.order_id
          if (!itemsByOrder[oid]) itemsByOrder[oid] = []
          itemsByOrder[oid].push({
            product_id: it.product_id,
            variant_id: it.variant_id,
            quantity: it.quantity,
            unit_price_cents: it.unit_price_cents,
            title: it.title,
            product_handle: it.product_handle,
            thumbnail: it.thumbnail,
          })
        }
      }
      await client.end()
      client = null

      const body = {
        orders: orders.map((o) => ({
          order_id: o.id,
          order_number: o.order_number,
          customer: {
            email: o.email,
            name: [o.first_name, o.last_name].filter(Boolean).join(' ').trim() || null,
            phone: o.phone,
          },
          items: itemsByOrder[o.id] || [],
          total_cents: o.total_cents,
          subtotal_cents: o.subtotal_cents,
          shipping_cents: o.shipping_cents,
          discount_cents: o.discount_cents,
          currency: o.currency || 'eur',
          status: o.order_status || o.status,
          payment_status: o.payment_status,
          delivery_status: o.delivery_status,
          created_at: o.created_at,
          updated_at: o.updated_at,
        })),
      }
      logBillbeeEvent('billbee.orders.fetch', { seller_id: sid, count: body.orders.length })
      res.json(body)
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      logBillbeeEvent('billbee.error', { route: 'orders', message: e?.message })
      res.status(500).json({ error: 'Internal Server Error' })
    }
  }

  async function handleProducts(req, res) {
    const sid = req.beluchaBillbeeSeller.seller_id
    let client
    try {
      client = getProductsDbClient()
      await client.connect()
      const r = await client.query(
        `SELECT id, title, handle, sku, description, status, seller_id, price_cents, inventory, metadata, variants, created_at, updated_at
         FROM admin_hub_products
         WHERE seller_id = $1
         ORDER BY updated_at DESC
         LIMIT 2000`,
        [sid],
      )
      await client.end()
      client = null
      const products = (r.rows || []).map((p) => ({
        id: p.id,
        title: p.title,
        handle: p.handle,
        sku: p.sku,
        description: p.description,
        status: p.status,
        price_cents: p.price_cents,
        inventory: p.inventory,
        metadata: p.metadata,
        variants: p.variants,
        created_at: p.created_at,
        updated_at: p.updated_at,
      }))
      logBillbeeEvent('billbee.products.fetch', { seller_id: sid, count: products.length })
      res.json({ products })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      logBillbeeEvent('billbee.error', { route: 'products', message: e?.message })
      res.status(500).json({ error: 'Internal Server Error' })
    }
  }

  async function handleStock(req, res) {
    const sid = req.beluchaBillbeeSeller.seller_id
    let client
    try {
      client = getProductsDbClient()
      await client.connect()
      const r = await client.query(
        `SELECT id::text AS product_id, COALESCE(inventory, 0)::integer AS stock_quantity
         FROM admin_hub_products
         WHERE seller_id = $1`,
        [sid],
      )
      await client.end()
      client = null
      const stock = (r.rows || []).map((row) => ({
        product_id: row.product_id,
        stock_quantity: row.stock_quantity,
      }))
      logBillbeeEvent('billbee.stock.fetch', { seller_id: sid, count: stock.length })
      res.json({ stock })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      logBillbeeEvent('billbee.error', { route: 'stock', message: e?.message })
      res.status(500).json({ error: 'Internal Server Error' })
    }
  }

  httpApp.get('/api/billbee/orders', authenticateBeluchaBillbee, handleOrders)
  httpApp.get('/api/billbee/products', authenticateBeluchaBillbee, handleProducts)
  httpApp.get('/api/billbee/stock', authenticateBeluchaBillbee, handleStock)
  httpApp.post('/api/billbee/webhook/order-update', authenticateBeluchaBillbee, (req, res) => {
    logBillbeeEvent('billbee.webhook.order_update', { seller_id: req.beluchaBillbeeSeller?.seller_id })
    res.status(204).end()
  })

  console.log('Billbee marketplace API: GET /api/billbee/orders|products|stock, POST /api/billbee/webhook/order-update')
}

module.exports = { mountBillbeeMarketplaceApi }
