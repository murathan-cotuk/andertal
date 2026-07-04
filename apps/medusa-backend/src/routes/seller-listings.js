'use strict'
const { Router } = require('express')

module.exports = function createSellerListingsRouter() {
  const router = Router()

  router.get('/admin-hub/v1/seller-listings', async (req, res) => {
      const isSuperuser = req.sellerUser?.is_superuser || false
      const sellerId = req.sellerUser?.seller_id
      const { product_id } = req.query
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        let rows
        if (product_id) {
          // Superuser: all listings for the product; Seller: only their own
          if (isSuperuser) {
            const r = await c.query(`SELECT l.*, p.title AS product_title FROM admin_hub_seller_listings l LEFT JOIN admin_hub_products p ON p.id = l.product_id WHERE l.product_id = $1 ORDER BY l.created_at ASC`, [product_id])
            rows = r.rows
          } else {
            const r = await c.query(`SELECT l.*, p.title AS product_title FROM admin_hub_seller_listings l LEFT JOIN admin_hub_products p ON p.id = l.product_id WHERE l.product_id = $1 AND l.seller_id = $2`, [product_id, sellerId])
            rows = r.rows
          }
        } else {
          const r = await c.query(`SELECT l.*, p.title AS product_title FROM admin_hub_seller_listings l LEFT JOIN admin_hub_products p ON p.id = l.product_id WHERE l.seller_id = $1 ORDER BY l.created_at DESC`, [isSuperuser ? sellerId : sellerId])
          rows = r.rows
        }
        await c.end()
        res.json({ listings: rows || [] })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
  router.put('/admin-hub/v1/seller-listings/:id', async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const { id } = req.params
      const { price_cents, inventory, status } = req.body || {}
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const r = await c.query(
          `UPDATE admin_hub_seller_listings SET price_cents = COALESCE($1, price_cents), inventory = COALESCE($2, inventory), status = COALESCE($3, status), updated_at = now() WHERE id = $4::uuid AND seller_id = $5 RETURNING *`,
          [price_cents != null ? Number(price_cents) : null, inventory != null ? Number(inventory) : null, status || null, id, sellerId]
        )
        await c.end()
        if (!r.rows[0]) return res.status(404).json({ message: 'Listing not found' })
        res.json({ listing: r.rows[0] })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })

    // ── Product Change Requests ────────────────────────────────────────────────
  router.get('/admin-hub/v1/product-change-requests', async (req, res) => {
      const isSuperuser = req.sellerUser?.is_superuser || false
      const sellerId = req.sellerUser?.seller_id
      const { status: statusFilter, product_id } = req.query
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const conditions = []
        const params = []
        if (!isSuperuser) { params.push(sellerId); conditions.push(`cr.seller_id = $${params.length}`) }
        if (statusFilter) { params.push(statusFilter); conditions.push(`cr.status = $${params.length}`) }
        if (product_id) { params.push(product_id); conditions.push(`cr.product_id = $${params.length}::uuid`) }
        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
        const r = await c.query(
          `SELECT
             cr.*,
             p.title AS product_title,
             su.store_name AS seller_store_name,
             su.company_name AS seller_company_name,
             su.email AS seller_email,
             COALESCE(NULLIF(su.store_name, ''), NULLIF(su.company_name, ''), NULLIF(su.email, ''), cr.seller_id) AS seller_label
           FROM admin_hub_product_change_requests cr
           LEFT JOIN admin_hub_products p ON p.id = cr.product_id
           LEFT JOIN seller_users su ON su.seller_id = cr.seller_id AND su.sub_of_seller_id IS NULL
           ${where}
           ORDER BY cr.created_at DESC`,
          params
        )
        await c.end()
        res.json({ change_requests: r.rows || [] })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
  router.post('/admin-hub/v1/product-change-requests', async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const { product_id, field_name, new_value } = req.body || {}
      if (!product_id || !field_name || new_value == null) return res.status(400).json({ message: 'product_id, field_name, new_value required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const prod = await c.query('SELECT title, description, metadata FROM admin_hub_products WHERE id = $1::uuid', [product_id])
        if (!prod.rows[0]) { await c.end(); return res.status(404).json({ message: 'Product not found' }) }
        const p = prod.rows[0]
        let oldValue = null
        if (field_name === 'title') oldValue = p.title
        else if (field_name === 'description') oldValue = p.description
        else if (field_name.startsWith('metadata.')) {
          const metaKey = field_name.replace('metadata.', '')
          oldValue = p.metadata ? JSON.stringify(p.metadata[metaKey]) : null
        }
        const r = await c.query(
          `INSERT INTO admin_hub_product_change_requests (product_id, seller_id, field_name, old_value, new_value) VALUES ($1::uuid,$2,$3,$4,$5) RETURNING *`,
          [product_id, sellerId, field_name, oldValue, String(new_value)]
        )
        await c.end()
        res.status(201).json({ change_request: r.rows[0] })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
  router.post('/admin-hub/v1/product-change-requests/:id/approve', async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser only' })
      const { id } = req.params
      const { reviewer_note, new_value } = req.body || {}
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const cr = await c.query(`SELECT * FROM admin_hub_product_change_requests WHERE id = $1::uuid AND status = 'pending'`, [id])
        if (!cr.rows[0]) { await c.end(); return res.status(404).json({ message: 'Pending request not found' }) }
        const req_row = cr.rows[0]
        const appliedValue = (new_value != null) ? String(new_value) : req_row.new_value
        // Apply change to product
        if (req_row.field_name === 'title') {
          await c.query('UPDATE admin_hub_products SET title = $1, updated_at = now() WHERE id = $2::uuid', [appliedValue, req_row.product_id])
        } else if (req_row.field_name === 'description') {
          await c.query('UPDATE admin_hub_products SET description = $1, updated_at = now() WHERE id = $2::uuid', [appliedValue, req_row.product_id])
        } else if (req_row.field_name.startsWith('metadata.')) {
          const metaKey = req_row.field_name.replace('metadata.', '')
          let parsedVal
          try { parsedVal = JSON.parse(appliedValue) } catch (_) { parsedVal = appliedValue }
          await c.query(
            `UPDATE admin_hub_products SET metadata = jsonb_set(COALESCE(metadata,'{}'), $1, $2::jsonb, true), updated_at = now() WHERE id = $3::uuid`,
            ['{' + metaKey + '}', JSON.stringify(parsedVal), req_row.product_id]
          )
        }
        const p = await c.query(`SELECT id, handle FROM admin_hub_products WHERE id = $1::uuid`, [req_row.product_id]).catch(() => ({ rows: [] }))
        const productHandle = p.rows?.[0]?.handle ? String(p.rows[0].handle) : ''
        const productLink = productHandle ? `/produkt/${productHandle}` : `/products/${req_row.product_id}`
        await c.query(`UPDATE admin_hub_product_change_requests SET status = 'approved', reviewer_note = $1, new_value = $2, updated_at = now() WHERE id = $3::uuid`, [reviewer_note || null, appliedValue, id])
        if (req_row.seller_id) {
          await c.query(
            `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
             VALUES ('product_change_request_reviewed', $1, $2, $3, $4)`,
            [
              'Produkt wurde freigegeben',
              `Ihr Änderungsvorschlag wurde freigegeben. Produkt-Link: ${productLink}`,
              req_row.seller_id,
              req_row.product_id,
            ],
          ).catch(() => {})
        }
        await c.end()
        res.json({ success: true })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
  router.post('/admin-hub/v1/product-change-requests/:id/reject', async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser only' })
      const { id } = req.params
      const { reviewer_note } = req.body || {}
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const cr = await c.query(`SELECT * FROM admin_hub_product_change_requests WHERE id = $1::uuid AND status = 'pending'`, [id])
        const req_row = cr.rows?.[0]
        await c.query(`UPDATE admin_hub_product_change_requests SET status = 'rejected', reviewer_note = $1, updated_at = now() WHERE id = $2::uuid AND status = 'pending'`, [reviewer_note || null, id])
        if (req_row?.seller_id) {
          await c.query(
            `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
             VALUES ('product_change_request_reviewed', $1, $2, $3, $4)`,
            [
              'Produktänderung abgelehnt',
              `Ihr Änderungsvorschlag wurde abgelehnt.${reviewer_note ? ` Not: ${reviewer_note}` : ''}`,
              req_row.seller_id,
              req_row.product_id,
            ],
          ).catch(() => {})
        }
        await c.end()
        res.json({ success: true })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })

  return router
}
