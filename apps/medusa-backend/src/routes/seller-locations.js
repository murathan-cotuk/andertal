'use strict'
const { Router } = require('express')

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

module.exports = function createSellerLocationsRouter() {
    // ── Seller Locations CRUD ─────────────────────────────────────────────────
    const adminHubLocationsGET = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const r = await client.query(
          'SELECT * FROM seller_locations WHERE seller_id = $1 ORDER BY is_primary DESC, created_at ASC',
          [sellerId]
        )
        // If no locations yet, seed from warehouse_address
        if (r.rows.length === 0) {
          const su = await client.query('SELECT warehouse_address, business_address FROM seller_users WHERE seller_id = $1 LIMIT 1', [sellerId])
          const seed = su.rows?.[0]
          const addr = seed?.warehouse_address || seed?.business_address
          if (addr) {
            const a = typeof addr === 'string' ? JSON.parse(addr) : addr
            await client.query(
              `INSERT INTO seller_locations (seller_id, name, address_line1, address_line2, city, postal_code, country, is_primary, type)
               VALUES ($1, 'Hauptstandort', $2, $3, $4, $5, $6, true, 'warehouse') ON CONFLICT DO NOTHING`,
              [sellerId, a.address_line1 || a.street || null, a.address_line2 || null, a.city || null, a.postal_code || a.zip || null, a.country || 'Deutschland']
            )
            const r2 = await client.query('SELECT * FROM seller_locations WHERE seller_id = $1 ORDER BY is_primary DESC, created_at ASC', [sellerId])
            await client.end()
            return res.json({ locations: r2.rows })
          }
        }
        await client.end()
        res.json({ locations: r.rows })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubLocationsPOST = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { name, type, address_line1, address_line2, city, postal_code, country, phone, email, is_primary } = req.body || {}
        if (!name) { await client.end(); return res.status(400).json({ message: 'Name erforderlich' }) }
        if (is_primary) await client.query('UPDATE seller_locations SET is_primary = false WHERE seller_id = $1', [sellerId])
        const r = await client.query(
          `INSERT INTO seller_locations (seller_id, name, type, address_line1, address_line2, city, postal_code, country, phone, email, is_primary)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [sellerId, name, type || 'warehouse', address_line1 || null, address_line2 || null, city || null, postal_code || null, country || 'Deutschland', phone || null, email || null, is_primary ? true : false]
        )
        await client.end()
        res.json({ location: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubLocationsPATCH = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const { id } = req.params
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const chk = await client.query('SELECT id FROM seller_locations WHERE id = $1::uuid AND seller_id = $2 LIMIT 1', [id, sellerId])
        if (!chk.rows.length) { await client.end(); return res.status(404).json({ message: 'Not found' }) }
        const { name, type, address_line1, address_line2, city, postal_code, country, phone, email, is_primary, is_active } = req.body || {}
        if (is_primary) await client.query('UPDATE seller_locations SET is_primary = false WHERE seller_id = $1', [sellerId])
        const sets = []; const params = []
        const add = (col, val) => { if (val !== undefined) { params.push(val); sets.push(`${col} = $${params.length}`) } }
        add('name', name); add('type', type); add('address_line1', address_line1); add('address_line2', address_line2)
        add('city', city); add('postal_code', postal_code); add('country', country)
        add('phone', phone); add('email', email)
        if (is_primary !== undefined) { params.push(is_primary ? true : false); sets.push(`is_primary = $${params.length}`) }
        if (is_active !== undefined) { params.push(is_active ? true : false); sets.push(`is_active = $${params.length}`) }
        if (!sets.length) { await client.end(); return res.status(400).json({ message: 'Nothing to update' }) }
        sets.push('updated_at = now()')
        params.push(id)
        const r = await client.query(`UPDATE seller_locations SET ${sets.join(', ')} WHERE id = $${params.length}::uuid RETURNING *`, params)
        await client.end()
        res.json({ location: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubLocationsDELETE = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const { id } = req.params
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        await client.query('DELETE FROM seller_locations WHERE id = $1::uuid AND seller_id = $2', [id, sellerId])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

  const router = Router()
  router.get('/admin-hub/v1/seller/locations', adminHubLocationsGET)
  router.post('/admin-hub/v1/seller/locations', adminHubLocationsPOST)
  router.patch('/admin-hub/v1/seller/locations/:id', adminHubLocationsPATCH)
  router.delete('/admin-hub/v1/seller/locations/:id', adminHubLocationsDELETE)

  return router
}
