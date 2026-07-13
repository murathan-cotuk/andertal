'use strict'
const { Router } = require('express')
const { resolveOrderPaidTotalCents } = require('../order-money')
const { renderInvoicePdfDocument, renderLieferscheinPdfDocument, renderProvisionsfakturPdfDocument, getOrderPdfFilename } = require('../order-pdf-buffers')
const { runAutomationFlowsForOrder } = require('../flow-automation')
const { enqueueFlowEvent } = require('../flow-queue')

function getClientIpFromRequest(req) {
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim()
  }
  const xri = req.headers['x-real-ip']
  if (typeof xri === 'string' && xri.trim()) return xri.trim()
  return req.socket?.remoteAddress || req.connection?.remoteAddress || req.ip || ''
}

function detectDeviceType(userAgent) {
  const ua = String(userAgent || '').toLowerCase()
  if (!ua) return 'unknown'
  if (/mobile|android|iphone|ipod|blackberry|windows phone/.test(ua)) return 'mobile'
  if (/ipad|tablet/.test(ua)) return 'tablet'
  return 'desktop'
}

// Dispatches order-related automation flow triggers via the queue, falling back to immediate execution.
    const dispatchOrderFlowEvent = async (triggerKey, orderId) => {
      const tk = String(triggerKey || '').trim()
      const oid = String(orderId || '').trim()
      if (!tk || !oid) return
      try {
        const queued = await enqueueFlowEvent('order-flow-event', { triggerKey: tk, orderId: oid })
        if (queued) return
      } catch (qe) {
        console.warn('[flow-queue] enqueue order event failed, fallback immediate:', qe?.message || qe)
      }
      setImmediate(() => {
        runAutomationFlowsForOrder({ triggerKey: tk, orderId: oid }).catch((fe) => {
          console.warn(`runAutomationFlowsForOrder ${tk}:`, fe?.message || fe)
        })
      })
    }

module.exports = function createOrdersRouter({ requireSuperuser }) {
    // ── Admin Hub Orders ──────────────────────────────────────────
    const adminHubOrdersGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return res.json({ orders: [], count: 0 })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { search = '', order_status = '', payment_status = '', delivery_status = '', seller_id = '', sort = 'created_at_desc', limit = '50', offset = '0' } = req.query
        const conditions = []
        const params = []
        if (search) {
          params.push(`%${search}%`)
          conditions.push(`(o.email ILIKE $${params.length} OR o.first_name ILIKE $${params.length} OR o.last_name ILIKE $${params.length} OR CAST(o.order_number AS TEXT) ILIKE $${params.length})`)
        }
        if (order_status) { params.push(order_status); conditions.push(`o.order_status = $${params.length}`) }
        if (payment_status) { params.push(payment_status); conditions.push(`o.payment_status = $${params.length}`) }
        if (delivery_status) { params.push(delivery_status); conditions.push(`o.delivery_status = $${params.length}`) }
        if (seller_id) { params.push(seller_id); conditions.push(`o.seller_id = $${params.length}`) }
        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
        const sortMap = {
          created_at_desc: 'o.created_at DESC', created_at_asc: 'o.created_at ASC',
          order_number_desc: 'o.order_number DESC', order_number_asc: 'o.order_number ASC',
          total_desc: 'o.total_cents DESC', total_asc: 'o.total_cents ASC',
          name_asc: 'o.last_name ASC, o.first_name ASC', name_desc: 'o.last_name DESC, o.first_name DESC',
          status_asc: 'o.order_status ASC', status_desc: 'o.order_status DESC',
          country_asc: 'o.country ASC', country_desc: 'o.country DESC',
        }
        const orderBy = sortMap[sort] || 'o.created_at DESC'
        const lim = Math.min(Number(limit) || 50, 200)
        const off = Number(offset) || 0
        const r = await client.query(`SELECT o.id, o.order_number, o.order_status, o.payment_status, o.delivery_status, o.seller_id, o.email, o.first_name, o.last_name, o.phone, o.address_line1, o.address_line2, o.city, o.postal_code, o.country, o.subtotal_cents, o.total_cents, o.shipping_cents, o.discount_cents, o.currency, o.payment_intent_id, o.cart_id, o.created_at, o.is_guest, o.tracking_number, o.carrier_name, o.shipped_at, o.sendcloud_label_url, c.customer_number, c.id AS customer_id, (c.password_hash IS NOT NULL) AS c_is_registered FROM store_orders o LEFT JOIN store_customers c ON LOWER(c.email) = LOWER(o.email) ${where} ORDER BY ${orderBy} LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, lim, off])
        const countR = await client.query(`SELECT COUNT(*) FROM store_orders o ${where}`, params)
        const orders = (r.rows || []).map(row => ({
          id: row.id, order_number: row.order_number ? Number(row.order_number) : null,
          order_status: row.order_status || 'offen', payment_status: row.payment_status || 'bezahlt',
          delivery_status: row.delivery_status || 'offen',
          seller_id: row.seller_id || 'default',
          email: row.email, first_name: row.first_name, last_name: row.last_name, phone: row.phone,
          address_line1: row.address_line1, address_line2: row.address_line2, city: row.city,
          postal_code: row.postal_code, country: row.country,
          subtotal_cents: row.subtotal_cents,
          shipping_cents: Number(row.shipping_cents || 0),
          discount_cents: Number(row.discount_cents || 0),
          total_cents: resolveOrderPaidTotalCents(row),
          currency: row.currency,
          payment_intent_id: row.payment_intent_id, created_at: row.created_at,
          tracking_number: row.tracking_number || null,
          carrier_name: row.carrier_name || null,
          shipped_at: row.shipped_at || null,
          sendcloud_label_url: row.sendcloud_label_url || null,
          customer_number: row.customer_number ? Number(row.customer_number) : null,
          customer_id: row.customer_id || null,
          is_guest: !(row.c_is_registered === true || row.c_is_registered === 't'),
        }))
        await client.end()
        res.json({ orders, count: Number(countR.rows[0]?.count || 0) })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.json({ orders: [], count: 0 })
      }
    }

    const adminHubOrderByIdGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const oRes = await client.query('SELECT * FROM store_orders WHERE id = $1::uuid', [id])
        const row = oRes.rows && oRes.rows[0]
        if (!row) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const iRes = await client.query('SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY created_at', [id])
        const items = (iRes.rows || []).map(r => ({ id: r.id, variant_id: r.variant_id, product_id: r.product_id, quantity: r.quantity, unit_price_cents: r.unit_price_cents, title: r.title, thumbnail: r.thumbnail, product_handle: r.product_handle }))
        // Look up customer info by email
        let customerNumber = null
        let isFirstOrder = false
        let isRegistered = false
        if (row.email) {
          try {
            const custR = await client.query('SELECT id, customer_number FROM store_customers WHERE email = $1', [row.email])
            if (custR.rows && custR.rows[0]) { customerNumber = Number(custR.rows[0].customer_number); isRegistered = true }
            const prevR = await client.query('SELECT COUNT(*) AS cnt FROM store_orders WHERE email = $1 AND created_at < $2', [row.email, row.created_at])
            isFirstOrder = Number(prevR.rows[0]?.cnt || 0) === 0
          } catch (_) {}
        }
        await client.end()
        res.json({
          order: {
            ...row,
            total_cents: resolveOrderPaidTotalCents(row),
            order_number: row.order_number ? Number(row.order_number) : null,
            items,
            customer_number: customerNumber,
            is_registered: isRegistered,
            is_first_order: isFirstOrder,
          },
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const pdfDeLatin = (s) => {
      if (s == null || s === undefined) return ''
      return String(s)
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
        .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
        .replace(/ß/g, 'ss')
    }
    const pdfFmtDate = (d) => {
      if (!d) return '—'
      try {
        return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      } catch (_) {
        return '—'
      }
    }
    const adminHubOrderPdfInvoiceGET = async (req, res) => {
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
      let client
      try {
        const PDFDocument = require('pdfkit')
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const oRes = await client.query('SELECT * FROM store_orders WHERE id = $1::uuid', [id])
        const row = oRes.rows && oRes.rows[0]
        if (!row) {
          await client.end()
          return res.status(404).json({ message: 'Order not found' })
        }
        const iRes = await client.query('SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY created_at', [id])
        const itemRows = iRes.rows || []
        let sellerInfoHub = null
        let shopLogoUrl = ''
        try {
          if (row.seller_id && row.seller_id !== 'default') {
            const sr = await client.query(
              `SELECT store_name, company_name, first_name, last_name, vat_id, email, business_address
                 FROM seller_users WHERE seller_id = $1 LIMIT 1`,
              [row.seller_id],
            )
            sellerInfoHub = sr.rows?.[0] || null
          }
          const lr = await client.query("SELECT shop_logo_url FROM admin_hub_seller_settings WHERE seller_id='default' LIMIT 1")
          shopLogoUrl = lr.rows?.[0]?.shop_logo_url || ''
        } catch (_) {}
        await client.end()
        client = null
        let shopLogoBuffer = null
        if (shopLogoUrl) {
          try {
            shopLogoBuffer = await new Promise((resolve) => {
              const mod = shopLogoUrl.startsWith('https') ? require('https') : require('http')
              const req = mod.get(shopLogoUrl, { timeout: 5000 }, (r) => {
                if (r.statusCode !== 200) { r.resume(); return resolve(null) }
                const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => resolve(Buffer.concat(chunks))); r.on('error', () => resolve(null))
              })
              req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null) })
            })
          } catch (_) {}
        }
        const on = row.order_number != null ? String(row.order_number) : String(id).slice(0, 8)
        const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal'
        const pdfLocale = String(req.query?.locale || 'de').slice(0, 2).toLowerCase()
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="${getOrderPdfFilename('invoice', on, pdfLocale)}"`)
        const doc = new PDFDocument({ margin: 42, size: 'A4', compress: false, pdfVersion: '1.7' })
        doc.pipe(res)
        renderInvoicePdfDocument(doc, {
          row,
          itemRows,
          orderId: id,
          invoiceNumber: on,
          shopName,
          sellerInfo: sellerInfoHub,
          shopLogoBuffer,
          locale: pdfLocale,
        })
        doc.end()
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        if (!res.headersSent) res.status(500).json({ message: e?.message || 'PDF error' })
      }
    }

    const adminHubOrderPdfLieferscheinGET = async (req, res) => {
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
      let client
      try {
        const PDFDocument = require('pdfkit')
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const oRes = await client.query('SELECT * FROM store_orders WHERE id = $1::uuid', [id])
        const row = oRes.rows && oRes.rows[0]
        if (!row) {
          await client.end()
          return res.status(404).json({ message: 'Order not found' })
        }
        const iRes = await client.query('SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY created_at', [id])
        const itemRows = iRes.rows || []
        let lieferscheinLogoUrl = ''
        try {
          const lr = await client.query("SELECT shop_logo_url FROM admin_hub_seller_settings WHERE seller_id='default' LIMIT 1")
          lieferscheinLogoUrl = lr.rows?.[0]?.shop_logo_url || ''
        } catch (_) {}
        await client.end()
        client = null
        let lieferscheinLogoBuffer = null
        if (lieferscheinLogoUrl) {
          try {
            lieferscheinLogoBuffer = await new Promise((resolve) => {
              const mod = lieferscheinLogoUrl.startsWith('https') ? require('https') : require('http')
              const req = mod.get(lieferscheinLogoUrl, { timeout: 5000 }, (r) => {
                if (r.statusCode !== 200) { r.resume(); return resolve(null) }
                const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => resolve(Buffer.concat(chunks))); r.on('error', () => resolve(null))
              })
              req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null) })
            })
          } catch (_) {}
        }
        const on = row.order_number != null ? String(row.order_number) : String(id).slice(0, 8)
        const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal'
        const pdfLocale = String(req.query?.locale || 'de').slice(0, 2).toLowerCase()
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="${getOrderPdfFilename('lieferschein', on, pdfLocale)}"`)
        const doc = new PDFDocument({ margin: 42, size: 'A4', compress: false, pdfVersion: '1.7' })
        doc.pipe(res)
        renderLieferscheinPdfDocument(doc, {
          row,
          itemRows,
          invoiceNumber: on,
          shopName,
          shopLogoBuffer: lieferscheinLogoBuffer,
          locale: pdfLocale,
        })
        doc.end()
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        if (!res.headersSent) res.status(500).json({ message: e?.message || 'PDF error' })
      }
    }

    /**
     * GET /admin-hub/v1/orders/:id/pdf/provisionsfaktur
     * Generates a commission invoice (Provisionsfaktur) from the platform to the seller.
     * Accessible by the seller who owns the order or by platform admins.
     */
    const adminHubOrderPdfProvisionsfakturGET = async (req, res) => {
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
      const loggedSellerId = req.sellerUser?.seller_id || null
      let client
      try {
        const PDFDocument = require('pdfkit')
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const oRes = await client.query(
          `SELECT id, order_number, seller_id, created_at, subtotal_cents, total_cents,
                  stripe_application_fee_cents, seller_net_after_commission_cents
             FROM store_orders WHERE id = $1::uuid`,
          [id],
        )
        const order = oRes.rows?.[0]
        if (!order) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        if (loggedSellerId && order.seller_id !== loggedSellerId) {
          await client.end()
          return res.status(403).json({ message: 'Access denied' })
        }

        let sellerInfo = null
        try {
          if (order.seller_id && order.seller_id !== 'default') {
            const sr = await client.query(
              `SELECT store_name, company_name, first_name, last_name, vat_id, email, business_address
                 FROM seller_users WHERE seller_id = $1 LIMIT 1`,
              [order.seller_id],
            )
            sellerInfo = sr.rows?.[0] || null
          }
        } catch (_) {}

        await client.end(); client = null

        const storedFee = Number(order.stripe_application_fee_cents)
        const subtotal = Number(order.subtotal_cents || order.total_cents || 0)
        const commissionCents = Number.isFinite(storedFee) && storedFee > 0
          ? storedFee
          : Math.round(subtotal * 0.12)
        let commissionRatePct = null
        if (subtotal > 0 && commissionCents > 0) {
          commissionRatePct = Math.round((commissionCents / subtotal) * 100 * 10) / 10
        }

        const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal Marktplatz'
        const platformAddress = process.env.PLATFORM_INVOICE_ADDRESS || ''
        const platformVatId = process.env.PLATFORM_VAT_ID || ''
        const platformVatPercent = Number(process.env.PLATFORM_VAT_PERCENT || '0')
        const on = order.order_number != null ? String(order.order_number) : String(id).slice(0, 8)

        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="Provisionsfaktur-${on}.pdf"`)
        const doc = new PDFDocument({ margin: 42, size: 'A4', compress: false, pdfVersion: '1.7' })
        doc.pipe(res)
        renderProvisionsfakturPdfDocument(doc, {
          order,
          sellerInfo,
          shopName,
          commissionCents,
          commissionRatePct,
          platformAddress,
          platformVatId,
          platformVatPercent,
        })
        doc.end()
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        if (!res.headersSent) res.status(500).json({ message: e?.message || 'PDF error' })
      }
    }

    const adminHubOrderPATCH = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const { order_status, payment_status, delivery_status, notes, tracking_number, carrier_name, shipped_at, delivery_date } = req.body || {}
      const sets = []; const params = []
      if (order_status) { params.push(order_status); sets.push(`order_status = $${params.length}`) }
      if (payment_status) { params.push(payment_status); sets.push(`payment_status = $${params.length}`) }
      if (delivery_status) { params.push(delivery_status); sets.push(`delivery_status = $${params.length}`) }
      if (notes !== undefined) { params.push(notes); sets.push(`notes = $${params.length}`) }
      if (tracking_number !== undefined) { params.push(tracking_number); sets.push(`tracking_number = $${params.length}`) }
      if (carrier_name !== undefined) { params.push(carrier_name); sets.push(`carrier_name = $${params.length}`) }
      if (shipped_at !== undefined) { params.push(shipped_at); sets.push(`shipped_at = $${params.length}`) }
      if (delivery_date !== undefined) { params.push(delivery_date); sets.push(`delivery_date = $${params.length}`) }
      if (!sets.length) return res.status(400).json({ message: 'Nothing to update' })
      sets.push('updated_at = now()')
      params.push(id)
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        // Fetch previous state to detect tracking_number changes
        const prevRes = await client.query('SELECT tracking_number, carrier_name, delivery_status FROM store_orders WHERE id = $1::uuid', [id])
        const prevRow = prevRes.rows[0] || {}
        await client.query(`UPDATE store_orders SET ${sets.join(', ')} WHERE id = $${params.length}::uuid`, params)
        // Auto-set delivery_date when marking as delivered (triggers 14-day Stripe payout window)
        if (delivery_status === 'zugestellt' && delivery_date === undefined) {
          await client.query(`UPDATE store_orders SET delivery_date = COALESCE(delivery_date, now()), updated_at = now() WHERE id = $1::uuid`, [id])
        }
        // Auto-complete: paid + delivered → abgeschlossen (never when only versendet)
        await client.query(
          `UPDATE store_orders SET order_status = 'abgeschlossen', updated_at = now()
           WHERE id = $1::uuid AND payment_status = 'bezahlt' AND delivery_status = 'zugestellt'
           AND order_status NOT IN ('abgeschlossen','retoure','retoure_anfrage','refunded','storniert')`,
          [id]
        )
        // Guard: abgeschlossen only valid when zugestellt — revert stale state after versendet/offen
        await client.query(
          `UPDATE store_orders SET order_status = 'in_bearbeitung', updated_at = now()
           WHERE id = $1::uuid AND order_status = 'abgeschlossen' AND delivery_status != 'zugestellt'
           AND order_status NOT IN ('retoure','retoure_anfrage','refunded','storniert')`,
          [id]
        )
        // Auto-create shipment events for status transitions
        const newTracking = tracking_number !== undefined ? String(tracking_number || '').trim() : (prevRow.tracking_number || '')
        const newCarrier = carrier_name !== undefined ? String(carrier_name || '').trim() : (prevRow.carrier_name || '')
        const effectiveDeliveryStatus = delivery_status || prevRow.delivery_status
        // Create "versendet" event if tracking number newly set or delivery_status newly set to versendet
        const trackingChanged = tracking_number !== undefined && String(tracking_number || '').trim() && String(tracking_number || '').trim() !== String(prevRow.tracking_number || '').trim()
        const deliveryStatusChangedToVersendet = delivery_status === 'versendet' && prevRow.delivery_status !== 'versendet'
        const deliveryStatusChangedToZugestellt = delivery_status === 'zugestellt' && prevRow.delivery_status !== 'zugestellt'
        // Auto-set delivery_status to versendet when tracking number is first added
        if (trackingChanged && !['versendet', 'zugestellt', 'shipped', 'delivered'].includes(prevRow.delivery_status)) {
          await client.query(
            `UPDATE store_orders SET delivery_status='versendet', updated_at=now() WHERE id=$1::uuid AND delivery_status NOT IN ('versendet','zugestellt','shipped','delivered')`,
            [id]
          )
        }
        if (trackingChanged || deliveryStatusChangedToVersendet) {
          const existingVersendet = await client.query(`SELECT id FROM store_shipment_events WHERE order_id=$1::uuid AND status='versendet' LIMIT 1`, [id])
          if (!existingVersendet.rows.length) {
            const desc = newCarrier ? `Paket bei ${newCarrier} aufgegeben${newTracking ? ` (${newTracking})` : ''}` : 'Paket wurde versendet'
            await client.query(
              `INSERT INTO store_shipment_events (order_id, status, description, source, event_time) VALUES ($1::uuid, 'versendet', $2, 'auto', now())`,
              [id, desc]
            )
          }
        }
        if (deliveryStatusChangedToZugestellt) {
          const existingZugestellt = await client.query(`SELECT id FROM store_shipment_events WHERE order_id=$1::uuid AND status='zugestellt' LIMIT 1`, [id])
          if (!existingZugestellt.rows.length) {
            await client.query(
              `INSERT INTO store_shipment_events (order_id, status, description, source, event_time) VALUES ($1::uuid, 'zugestellt', 'Paket wurde zugestellt', 'auto', now())`,
              [id]
            )
          }
        }
        const fireOrderShipped = trackingChanged || deliveryStatusChangedToVersendet
        const oRes = await client.query('SELECT * FROM store_orders WHERE id = $1::uuid', [id])
        const row = oRes.rows && oRes.rows[0]
        const iRes = await client.query('SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY created_at', [id])
        const items = (iRes.rows || []).map(r => ({ id: r.id, variant_id: r.variant_id, product_id: r.product_id, quantity: r.quantity, unit_price_cents: r.unit_price_cents, title: r.title, thumbnail: r.thumbnail, product_handle: r.product_handle }))
        await client.end()
        res.json({
          order: {
            ...row,
            total_cents: resolveOrderPaidTotalCents(row),
            order_number: row.order_number ? Number(row.order_number) : null,
            items,
          },
        })
        if (fireOrderShipped) {
          void dispatchOrderFlowEvent('order_shipped', id)
        }
        if (deliveryStatusChangedToZugestellt) {
          void dispatchOrderFlowEvent('order_delivered', id)
        }
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubOrderDELETE = async (req, res) => {
      if (!req.sellerUser?.is_superuser) {
        return res.status(403).json({ message: 'Superuser access required' })
      }
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        await client.query('DELETE FROM store_orders WHERE id = $1::uuid', [id])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storePresenceHeartbeatPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl.startsWith('postgres')) return res.status(503).json({ message: 'Database unavailable' })
      const body = req.body || {}
      const sessionId = String(body.session_id || '').trim().slice(0, 64)
      if (!sessionId || sessionId.length < 8) return res.status(400).json({ message: 'session_id required' })
      const pagePath = String(body.path || body.page_path || '/').trim().slice(0, 2000)
      const pageTitle = String(body.title || body.page_title || '').trim().slice(0, 500)
      const referrer = String(body.referrer || '').trim().slice(0, 2000)
      const userAgent = String(req.headers['user-agent'] || body.user_agent || '').trim().slice(0, 500)
      const ip = getClientIpFromRequest(req).slice(0, 45)
      const countryCode = String(
        req.headers['cf-ipcountry'] ||
        req.headers['x-vercel-ip-country'] ||
        body.country_code ||
        '',
      ).trim().toUpperCase().slice(0, 8) || null
      const city = String(req.headers['cf-ipcity'] || req.headers['x-vercel-ip-city'] || body.city || '').trim().slice(0, 120) || null
      const region = String(req.headers['cf-region'] || req.headers['x-vercel-ip-country-region'] || body.region || '').trim().slice(0, 120) || null
      const deviceType = detectDeviceType(userAgent)
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        await client.query(`DELETE FROM shop_live_presence WHERE last_seen_at < now() - interval '3 minutes'`)
        await client.query(
          `INSERT INTO shop_live_presence (
            session_id, ip_address, country_code, city, region, page_path, page_title, referrer, user_agent, device_type, first_seen_at, last_seen_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())
          ON CONFLICT (session_id) DO UPDATE SET
            ip_address = EXCLUDED.ip_address,
            country_code = COALESCE(EXCLUDED.country_code, shop_live_presence.country_code),
            city = COALESCE(EXCLUDED.city, shop_live_presence.city),
            region = COALESCE(EXCLUDED.region, shop_live_presence.region),
            page_path = EXCLUDED.page_path,
            page_title = EXCLUDED.page_title,
            referrer = EXCLUDED.referrer,
            user_agent = EXCLUDED.user_agent,
            device_type = EXCLUDED.device_type,
            last_seen_at = now()`,
          [sessionId, ip || null, countryCode, city, region, pagePath, pageTitle || null, referrer || null, userAgent || null, deviceType],
        )
        await client.end()
        res.json({ ok: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubLiveVisitorsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl.startsWith('postgres')) return res.status(503).json({ message: 'Database unavailable' })
      const sort = String(req.query.sort || 'last_seen_desc')
      const country = String(req.query.country || '').trim().toUpperCase()
      const q = String(req.query.q || '').trim().toLowerCase()
      let orderBy = 'last_seen_at DESC'
      if (sort === 'last_seen_asc') orderBy = 'last_seen_at ASC'
      else if (sort === 'country_asc') orderBy = 'country_code ASC NULLS LAST, last_seen_at DESC'
      else if (sort === 'page_asc') orderBy = 'page_path ASC NULLS LAST, last_seen_at DESC'
      else if (sort === 'ip_asc') orderBy = 'ip_address ASC NULLS LAST, last_seen_at DESC'
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        await client.query(`DELETE FROM shop_live_presence WHERE last_seen_at < now() - interval '3 minutes'`)
        const params = []
        const where = ["last_seen_at >= now() - interval '3 minutes'"]
        if (country) {
          params.push(country)
          where.push(`UPPER(COALESCE(country_code, '')) = $${params.length}`)
        }
        if (q) {
          params.push(`%${q}%`)
          const i = params.length
          where.push(`(
            LOWER(COALESCE(ip_address, '')) LIKE $${i}
            OR LOWER(COALESCE(city, '')) LIKE $${i}
            OR LOWER(COALESCE(page_path, '')) LIKE $${i}
            OR LOWER(COALESCE(page_title, '')) LIKE $${i}
            OR LOWER(COALESCE(region, '')) LIKE $${i}
          )`)
        }
        const sql = `SELECT session_id, ip_address, country_code, city, region, page_path, page_title, referrer, user_agent, device_type, first_seen_at, last_seen_at
          FROM shop_live_presence
          WHERE ${where.join(' AND ')}
          ORDER BY ${orderBy}`
        const { rows } = await client.query(sql, params)
        await client.end()
        res.json({ count: rows.length, visitors: rows })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubOrderPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const {
          email, first_name, last_name, phone, country,
          address_line1, address_line2, zip_code, city,
          items = [], shipping_cents = 0, discount_cents = 0,
          order_status = 'offen', payment_status = 'offen', delivery_status = 'offen',
          payment_method = '', currency = 'EUR', notes = '',
          newsletter_opted_in = false,
        } = req.body || {}
        if (!email) return res.status(400).json({ message: 'email required' })
        // Auto-complete: if both paid and delivered, set completed
        const effectiveOrderStatus = (payment_status === 'bezahlt' && delivery_status === 'zugestellt') ? 'abgeschlossen' : order_status
        // Calculate total
        const itemsTotal = items.reduce((s, it) => s + (Number(it.unit_price_cents||0) * Number(it.quantity||1)), 0)
        const total_cents = itemsTotal + Number(shipping_cents||0) - Number(discount_cents||0)
        const subtotal_cents = itemsTotal
        // Insert order
        const orderR = await client.query(
          `INSERT INTO store_orders (email, first_name, last_name, phone, country, address_line1, address_line2, zip_code, city,
            total_cents, subtotal_cents, shipping_cents, discount_cents,
            order_status, payment_status, delivery_status, payment_method, currency, notes, newsletter_opted_in)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           RETURNING id, order_number`,
          [email, first_name||null, last_name||null, phone||null, country||null,
           address_line1||null, address_line2||null, zip_code||null, city||null,
           total_cents, subtotal_cents, Number(shipping_cents||0), Number(discount_cents||0),
           effectiveOrderStatus, payment_status, delivery_status, payment_method||null, currency, notes||null, newsletter_opted_in]
        )
        const order = orderR.rows[0]
        // Insert items
        for (const it of items) {
          await client.query(
            `INSERT INTO store_order_items (order_id, title, quantity, unit_price_cents, product_handle, thumbnail)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [order.id, it.title||'', Number(it.quantity||1), Number(it.unit_price_cents||0), it.product_handle||null, it.thumbnail||null]
          )
        }
        // Upsert customer
        if (email) {
          await client.query(
            `INSERT INTO store_customers (email, first_name, last_name, phone, country, address_line1, address_line2, zip_code, city, account_type)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'gastkunde')
             ON CONFLICT (email) DO UPDATE SET
               first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
               phone = COALESCE(EXCLUDED.phone, store_customers.phone),
               country = COALESCE(EXCLUDED.country, store_customers.country),
               address_line1 = COALESCE(EXCLUDED.address_line1, store_customers.address_line1),
               zip_code = COALESCE(EXCLUDED.zip_code, store_customers.zip_code),
               city = COALESCE(EXCLUDED.city, store_customers.city),
               updated_at = NOW()`,
            [email, first_name||null, last_name||null, phone||null, country||null, address_line1||null, address_line2||null, zip_code||null, city||null]
          )
        }
        await client.end()
        res.json({ order: { id: order.id, order_number: order.order_number ? Number(order.order_number) : null } })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

  const router = Router()
  // Storefront live presence ping (used by apps/shop ShopPresenceHeartbeat)
  router.post('/store/presence/heartbeat', storePresenceHeartbeatPOST)

  router.get('/admin-hub/v1/orders', adminHubOrdersGET)
  router.post('/admin-hub/v1/orders', adminHubOrderPOST)
  router.get('/admin-hub/v1/orders/:id/pdf/invoice', adminHubOrderPdfInvoiceGET)
  router.get('/admin-hub/v1/orders/:id/pdf/lieferschein', adminHubOrderPdfLieferscheinGET)
  router.get('/admin-hub/v1/orders/:id/pdf/provisionsfaktur', adminHubOrderPdfProvisionsfakturGET)
  router.get('/admin-hub/v1/orders/:id/pdf/versandlabel', async (req, res) => {
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query('SELECT sendcloud_label_url, tracking_number FROM store_orders WHERE id=$1::uuid', [id])
        await client.end(); client = null
        const row = r.rows?.[0]
        if (!row) return res.status(404).json({ message: 'Order not found' })
        const labelUrl = row.sendcloud_label_url
        if (!labelUrl) return res.status(404).json({ message: 'Kein Versandlabel für diese Bestellung vorhanden.' })
        return res.redirect(302, labelUrl)
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        if (!res.headersSent) res.status(500).json({ message: e?.message || 'Error' })
      }
    })
  router.get('/admin-hub/v1/orders/:id/pdf/retoure', async (req, res) => {
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
      let client
      try {
        const PDFDocument = require('pdfkit')
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const oRes = await client.query('SELECT * FROM store_orders WHERE id=$1::uuid', [id])
        const row = oRes.rows?.[0]
        if (!row) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const rRes = await client.query('SELECT * FROM store_returns WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1', [id])
        const returnRow = rRes.rows?.[0] || null
        await client.end(); client = null
        const on = row.order_number != null ? String(row.order_number) : String(id).slice(0, 8)
        const rn = returnRow?.return_number || `R-${on}`
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="Retoure-${on}.pdf"`)
        const doc = new PDFDocument({ margin: 48, size: 'A4' })
        doc.pipe(res)
        doc.fontSize(20).fillColor('#111').text(pdfDeLatin('Retourenschein'), { align: 'center' })
        doc.moveDown(0.4)
        doc.fontSize(11).fillColor('#374151').text(pdfDeLatin(`Retoure-Nr.: ${rn}   ·   Bestellung: #${on}`), { align: 'center' })
        doc.moveDown(1.2)
        const boxTop = doc.y
        doc.rect(72, boxTop, 450, 60).fill('#f3f4f6')
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text(pdfDeLatin('Retoure-Nummer (gut sichtbar aufs Paket kleben)'), 80, boxTop + 8, { width: 434, align: 'center' })
        doc.fontSize(30).font('Helvetica-Bold').text(rn, 72, boxTop + 18, { width: 450, align: 'center' })
        doc.y = boxTop + 70
        doc.font('Helvetica').fontSize(10).fillColor('#374151')
        doc.moveDown(1)
        const custName = [row.first_name, row.last_name].filter(Boolean).join(' ')
        doc.font('Helvetica-Bold').text(pdfDeLatin('Absender (Kunde)'))
        doc.font('Helvetica')
        ;[custName, row.address_line1, row.address_line2, [row.postal_code, row.city].filter(Boolean).join(' '), row.country].filter(Boolean).forEach((l) => doc.text(pdfDeLatin(l)))
        doc.moveDown(0.8)
        if (returnRow?.items && Array.isArray(returnRow.items)) {
          doc.font('Helvetica-Bold').text(pdfDeLatin('Zurückgesendete Artikel'))
          doc.font('Helvetica')
          returnRow.items.forEach((it) => {
            doc.text(pdfDeLatin(`- ${it.title || 'Artikel'} (Menge: ${it.quantity || 1})`))
          })
          doc.moveDown(0.6)
        }
        doc.font('Helvetica').fontSize(8.5).fillColor('#6b7280')
        doc.text(pdfDeLatin('Bitte legen Sie diesen Retourenschein gut sichtbar in das Paket. Vielen Dank!'), { width: 450 })
        doc.end()
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        if (!res.headersSent) res.status(500).json({ message: e?.message || 'PDF error' })
      }
    })
  router.get('/admin-hub/v1/orders/:id', adminHubOrderByIdGET)
  router.patch('/admin-hub/v1/orders/:id', adminHubOrderPATCH)
  router.delete('/admin-hub/v1/orders/:id', adminHubOrderDELETE)
  router.get('/admin-hub/v1/live-visitors', requireSuperuser, adminHubLiveVisitorsGET)

  return router
}
