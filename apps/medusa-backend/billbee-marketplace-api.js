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

    const { Client } = require('pg')
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')

    // ── Path A: username looks like a belucha_zug_ api_key → direct store_integrations lookup ──
    if (basic.username.startsWith('belucha_zug_') && dbUrl) {
      let integClient
      try {
        integClient = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await integClient.connect()
        const ir = await integClient.query(
          `SELECT id, api_key, api_secret, seller_scope_key FROM store_integrations
           WHERE api_key = $1 AND is_active = true AND api_secret IS NOT NULL
           LIMIT 1`,
          [basic.username],
        )
        await integClient.end()
        integClient = null
        const integ = ir.rows && ir.rows[0]
        if (!integ || !integ.api_secret || !timingSafeEqualString(basic.password, integ.api_secret)) {
          logBillbeeEvent('billbee.auth.failed', { reason: 'bad_api_credentials' })
          res.setHeader('WWW-Authenticate', 'Basic realm="Belucha Billbee API"')
          return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' })
        }
        const sellerId = String(integ.seller_scope_key || '').trim()
        if (!sellerId) return res.status(403).json({ error: 'Forbidden', message: 'No seller scope' })
        if (!checkRateLimit(sellerId)) {
          return res.status(429).json({ error: 'Too Many Requests' })
        }
        req.beluchaBillbeeSeller = { seller_id: sellerId }
        logBillbeeEvent('billbee.auth.success', { seller_id: sellerId, via: 'api_key' })
        return next()
      } catch (e) {
        if (integClient) try { await integClient.end() } catch (__) {}
        logBillbeeEvent('billbee.auth.failed', { reason: 'exception', message: e?.message })
        return res.status(500).json({ error: 'Internal Server Error' })
      }
    }

    // ── Path B: username is email or seller_id → seller_users lookup ──
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

      // Check seller_users dedicated Billbee keys
      const primaryOk = row.belucha_billbee_api_key && row.belucha_billbee_api_secret &&
        timingSafeEqualString(basic.password, row.belucha_billbee_api_secret) &&
        (!apiKeyHeader || apiKeyHeader === row.belucha_billbee_api_key)

      if (!primaryOk) {
        // Fallback: check store_integrations by seller_scope_key
        const effectiveScopeKey = row.sub_of_seller_id
          ? String(row.sub_of_seller_id).trim()
          : String(row.seller_id || `billbee_user_${row.id}`).trim()

        let integClient
        let integOk = false
        if (dbUrl) {
          try {
            integClient = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
            await integClient.connect()
            const ir = await integClient.query(
              `SELECT api_key, api_secret FROM store_integrations
               WHERE seller_scope_key = $1 AND is_active = true AND api_secret IS NOT NULL
               LIMIT 20`,
              [effectiveScopeKey],
            )
            await integClient.end()
            integClient = null
            for (const integ of (ir.rows || [])) {
              const secretOk = integ.api_secret && timingSafeEqualString(basic.password, integ.api_secret)
              const keyOk = !apiKeyHeader || (integ.api_key && apiKeyHeader === integ.api_key)
              if (secretOk && keyOk) { integOk = true; break }
            }
          } catch (_) {
            if (integClient) try { await integClient.end() } catch (__) {}
          }
        }

        if (!integOk) {
          logBillbeeEvent('billbee.auth.failed', { reason: 'bad_password' })
          res.setHeader('WWW-Authenticate', 'Basic realm="Belucha Billbee API"')
          return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' })
        }
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
      logBillbeeEvent('billbee.auth.success', { seller_id: effectiveSellerId, via: 'email' })
      next()
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      logBillbeeEvent('billbee.auth.failed', { reason: 'exception', message: e?.message })
      return res.status(500).json({ error: 'Internal Server Error' })
    }
  }

  // Map internal order status → Billbee OrderState integer
  function toBillbeeOrderState(orderStatus, paymentStatus, deliveryStatus) {
    const s = String(orderStatus || '').toLowerCase()
    const p = String(paymentStatus || '').toLowerCase()
    const d = String(deliveryStatus || '').toLowerCase()
    if (s === 'cancelled' || s === 'storniert') return 6
    if (d === 'delivered' || d === 'geliefert') return 5
    if (d === 'shipped' || d === 'versendet') return 4
    if (p === 'bezahlt' || p === 'paid') return 3
    if (s === 'processing' || s === 'confirmed') return 2
    return 1 // open
  }

  async function handleOrders(req, res) {
    const sid = req.beluchaBillbeeSeller.seller_id
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

      const countRes = await client.query(
        `SELECT COUNT(*) FROM store_orders WHERE ${where.join(' AND ')}`, params)
      const totalRows = parseInt(countRes.rows[0]?.count || '0', 10)
      const totalPages = Math.ceil(totalRows / pageSize) || 1

      params.push(pageSize); params.push((page - 1) * pageSize)
      const oRes = await client.query(
        `SELECT id, order_number, email, first_name, last_name, phone, status, order_status, payment_status, delivery_status,
                total_cents, currency, subtotal_cents, shipping_cents, discount_cents,
                shipping_first_name, shipping_last_name, shipping_address1, shipping_address2,
                shipping_city, shipping_zip, shipping_country_code, shipping_phone,
                billing_first_name, billing_last_name, billing_address1, billing_address2,
                billing_city, billing_zip, billing_country_code,
                created_at, updated_at
         FROM store_orders
         WHERE ${where.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      )
      const orders = oRes.rows || []
      const ids = orders.map((o) => o.id)
      let itemsByOrder = {}
      if (ids.length) {
        const iRes = await client.query(
          `SELECT order_id, product_id, variant_id, quantity, unit_price_cents, title, sku
           FROM store_order_items
           WHERE order_id = ANY($1::uuid[])`,
          [ids],
        )
        for (const it of iRes.rows || []) {
          if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = []
          itemsByOrder[it.order_id].push(it)
        }
      }
      await client.end()
      client = null

      const data = orders.map((o) => {
        const cur = String(o.currency || 'EUR').toUpperCase()
        const toEur = (cents) => cents != null ? Math.round(Number(cents)) / 100 : 0
        const addr = (fn, ln, a1, a2, city, zip, cc, phone, email) => ({
          FirstName: fn || '',
          LastName: ln || '',
          Street: a1 || '',
          Street2: a2 || '',
          City: city || '',
          Zip: zip || '',
          CountryISO2: cc || 'DE',
          Phone: phone || '',
          Email: email || '',
        })
        return {
          BillbeeId: null,
          ExternalId: String(o.id),
          OrderNumber: o.order_number || String(o.id),
          State: toBillbeeOrderState(o.order_status || o.status, o.payment_status, o.delivery_status),
          Currency: cur,
          TotalCost: toEur(o.total_cents),
          ShippingCost: toEur(o.shipping_cents),
          CreatedAt: o.created_at,
          UpdatedAt: o.updated_at,
          InvoiceAddress: addr(
            o.billing_first_name || o.first_name,
            o.billing_last_name || o.last_name,
            o.billing_address1, o.billing_address2,
            o.billing_city, o.billing_zip, o.billing_country_code,
            o.phone, o.email,
          ),
          ShippingAddress: addr(
            o.shipping_first_name || o.first_name,
            o.shipping_last_name || o.last_name,
            o.shipping_address1, o.shipping_address2,
            o.shipping_city, o.shipping_zip, o.shipping_country_code,
            o.shipping_phone || o.phone, o.email,
          ),
          OrderItems: (itemsByOrder[o.id] || []).map((it) => ({
            BillbeeId: null,
            ExternalId: String(it.product_id || ''),
            Quantity: Number(it.quantity) || 1,
            UnitPrice: toEur(it.unit_price_cents),
            TotalPrice: toEur(it.unit_price_cents) * (Number(it.quantity) || 1),
            Title: it.title || '',
            SKU: it.sku || '',
            ProductId: String(it.product_id || ''),
          })),
        }
      })

      logBillbeeEvent('billbee.orders.fetch', { seller_id: sid, count: data.length })
      res.json({ Paging: { Page: page, TotalPages: totalPages, TotalRows: totalRows, PageSize: pageSize }, Data: data })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      logBillbeeEvent('billbee.error', { route: 'orders', message: e?.message })
      res.status(500).json({ error: 'Internal Server Error' })
    }
  }

  async function handleProducts(req, res) {
    const sid = req.beluchaBillbeeSeller.seller_id
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
         FROM admin_hub_products
         WHERE seller_id = $1
         ORDER BY updated_at DESC
         LIMIT $2 OFFSET $3`,
        [sid, pageSize, (page - 1) * pageSize],
      )
      await client.end()
      client = null

      const data = (r.rows || []).map((p) => ({
        BillbeeId: null,
        Id: String(p.id),
        Title: p.title || '',
        SKU: p.sku || '',
        EAN: null,
        ShortDescription: p.description || '',
        Price: p.price_cents != null ? Math.round(Number(p.price_cents)) / 100 : 0,
        Quantity: Number(p.inventory) || 0,
        IsActive: String(p.status || '').toLowerCase() === 'active' || String(p.status || '').toLowerCase() === 'published',
        MainImage: p.metadata?.thumbnail || p.metadata?.image_url || null,
        CreatedAt: p.created_at,
        LastModifiedAt: p.updated_at,
      }))

      logBillbeeEvent('billbee.products.fetch', { seller_id: sid, count: data.length })
      res.json({ Paging: { Page: page, TotalPages: totalPages, TotalRows: totalRows, PageSize: pageSize }, Data: data })
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

  httpApp.get('/api/billbee', (req, res) => {
    res.json({ ok: true, name: 'Belucha Marketplace API', version: '1.0' })
  })

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
