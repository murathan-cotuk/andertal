'use strict'
const { Router } = require('express')

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

/** Map free-text country names to ISO-2 for return_address / carrier APIs. */
function countryToIso2(raw) {
  const s = String(raw || '').trim()
  if (!s) return 'DE'
  if (/^[a-z]{2}$/i.test(s)) return s.toUpperCase()
  const lower = s.toLowerCase()
  const map = {
    deutschland: 'DE', germany: 'DE', almanya: 'DE', allemagne: 'DE', alemania: 'DE', germania: 'DE',
    osterreich: 'AT', österreich: 'AT', austria: 'AT',
    schweiz: 'CH', switzerland: 'CH', suisse: 'CH', svizzera: 'CH',
    niederlande: 'NL', netherlands: 'NL', holland: 'NL', paysbas: 'NL', 'pays-bas': 'NL',
    frankreich: 'FR', france: 'FR', fransa: 'FR', francia: 'FR',
    italien: 'IT', italy: 'IT', italya: 'IT', italia: 'IT',
    spanien: 'ES', spain: 'ES', ispanya: 'ES', espana: 'ES', españa: 'ES',
    belgien: 'BE', belgium: 'BE',
    polen: 'PL', poland: 'PL',
    tschechien: 'CZ', 'czech republic': 'CZ',
    turkei: 'TR', türkei: 'TR', turkey: 'TR', turkiye: 'TR', türkiye: 'TR',
  }
  return map[lower] || 'DE'
}

function locToWarehouseJson(loc) {
  return {
    street: String(loc.address_line1 || '').trim(),
    address_line1: String(loc.address_line1 || '').trim(),
    address_line2: String(loc.address_line2 || '').trim() || null,
    city: String(loc.city || '').trim(),
    postal_code: String(loc.postal_code || '').trim(),
    zip: String(loc.postal_code || '').trim(),
    country: String(loc.country || 'Deutschland').trim() || 'Deutschland',
  }
}

function locToReturnAddressJson(loc) {
  return {
    name: String(loc.name || '').trim(),
    street: [loc.address_line1, loc.address_line2].filter(Boolean).map((x) => String(x).trim()).join(', '),
    zip: String(loc.postal_code || '').trim(),
    city: String(loc.city || '').trim(),
    country: countryToIso2(loc.country),
  }
}

/**
 * Keep legacy single-field stores in sync so emails / general settings / shipping
 * still see the purpose addresses after a location save.
 */
async function syncPurposeAddresses(client, sellerId, loc) {
  if (!loc || !sellerId) return
  if (loc.is_returns_to) {
    const return_address = locToReturnAddressJson(loc)
    await client.query(
      `INSERT INTO admin_hub_seller_settings (seller_id, return_address, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (seller_id) DO UPDATE SET
         return_address = $2::jsonb,
         updated_at = now()`,
      [sellerId, JSON.stringify(return_address)],
    )
  }
  if (loc.is_shipping_from) {
    const warehouse_address = locToWarehouseJson(loc)
    await client.query(
      `UPDATE seller_users SET warehouse_address = $1::jsonb, updated_at = now()
       WHERE seller_id = $2`,
      [JSON.stringify(warehouse_address), sellerId],
    ).catch(() => {})
  }
  if (loc.is_billing) {
    const business_address = locToWarehouseJson(loc)
    await client.query(
      `UPDATE seller_users SET business_address = $1::jsonb, updated_at = now()
       WHERE seller_id = $2`,
      [JSON.stringify(business_address), sellerId],
    ).catch(() => {})
  }
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
        // If no locations yet, seed from warehouse_address / return_address / business_address
        if (r.rows.length === 0) {
          const su = await client.query('SELECT warehouse_address, business_address FROM seller_users WHERE seller_id = $1 LIMIT 1', [sellerId])
          const seed = su.rows?.[0]
          const addr = seed?.warehouse_address || seed?.business_address
          if (addr) {
            const a = typeof addr === 'string' ? JSON.parse(addr) : addr
            await client.query(
              `INSERT INTO seller_locations (seller_id, name, address_line1, address_line2, city, postal_code, country, is_primary, type, is_shipping_from, is_returns_to, is_billing)
               VALUES ($1, 'Hauptstandort', $2, $3, $4, $5, $6, true, 'warehouse', true, true, true) ON CONFLICT DO NOTHING`,
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
        const { name, type, address_line1, address_line2, city, postal_code, country, phone, email, is_primary, is_shipping_from, is_returns_to, is_billing } = req.body || {}
        if (!name) { await client.end(); return res.status(400).json({ message: 'Name erforderlich' }) }
        const needsAddress = !!(is_shipping_from || is_returns_to || is_billing)
        if (needsAddress && !String(address_line1 || '').trim()) {
          await client.end()
          return res.status(400).json({ message: 'Adresse (Straße) erforderlich für Lager / Retoure / Rechnung' })
        }
        if (needsAddress && !String(city || '').trim()) {
          await client.end()
          return res.status(400).json({ message: 'Stadt erforderlich für Lager / Retoure / Rechnung' })
        }
        if (needsAddress && !String(postal_code || '').trim()) {
          await client.end()
          return res.status(400).json({ message: 'PLZ erforderlich für Lager / Retoure / Rechnung' })
        }
        if (is_primary) await client.query('UPDATE seller_locations SET is_primary = false WHERE seller_id = $1', [sellerId])
        if (is_shipping_from) await client.query('UPDATE seller_locations SET is_shipping_from = false WHERE seller_id = $1', [sellerId])
        if (is_returns_to) await client.query('UPDATE seller_locations SET is_returns_to = false WHERE seller_id = $1', [sellerId])
        if (is_billing) await client.query('UPDATE seller_locations SET is_billing = false WHERE seller_id = $1', [sellerId])
        const r = await client.query(
          `INSERT INTO seller_locations (seller_id, name, type, address_line1, address_line2, city, postal_code, country, phone, email, is_primary, is_shipping_from, is_returns_to, is_billing)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [sellerId, name, type || 'warehouse', address_line1 || null, address_line2 || null, city || null, postal_code || null, country || 'Deutschland', phone || null, email || null, is_primary ? true : false, is_shipping_from ? true : false, is_returns_to ? true : false, is_billing ? true : false]
        )
        await syncPurposeAddresses(client, sellerId, r.rows[0])
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
        const chk = await client.query('SELECT * FROM seller_locations WHERE id = $1::uuid AND seller_id = $2 LIMIT 1', [id, sellerId])
        if (!chk.rows.length) { await client.end(); return res.status(404).json({ message: 'Not found' }) }
        const existing = chk.rows[0]
        const { name, type, address_line1, address_line2, city, postal_code, country, phone, email, is_primary, is_active, is_shipping_from, is_returns_to, is_billing } = req.body || {}
        const merged = {
          ...existing,
          ...(name !== undefined ? { name } : {}),
          ...(address_line1 !== undefined ? { address_line1 } : {}),
          ...(address_line2 !== undefined ? { address_line2 } : {}),
          ...(city !== undefined ? { city } : {}),
          ...(postal_code !== undefined ? { postal_code } : {}),
          ...(country !== undefined ? { country } : {}),
          is_shipping_from: is_shipping_from !== undefined ? !!is_shipping_from : !!existing.is_shipping_from,
          is_returns_to: is_returns_to !== undefined ? !!is_returns_to : !!existing.is_returns_to,
          is_billing: is_billing !== undefined ? !!is_billing : !!existing.is_billing,
        }
        const needsAddress = !!(merged.is_shipping_from || merged.is_returns_to || merged.is_billing)
        if (needsAddress && !String(merged.address_line1 || '').trim()) {
          await client.end()
          return res.status(400).json({ message: 'Adresse (Straße) erforderlich für Lager / Retoure / Rechnung' })
        }
        if (needsAddress && !String(merged.city || '').trim()) {
          await client.end()
          return res.status(400).json({ message: 'Stadt erforderlich für Lager / Retoure / Rechnung' })
        }
        if (needsAddress && !String(merged.postal_code || '').trim()) {
          await client.end()
          return res.status(400).json({ message: 'PLZ erforderlich für Lager / Retoure / Rechnung' })
        }
        if (is_primary) await client.query('UPDATE seller_locations SET is_primary = false WHERE seller_id = $1', [sellerId])
        if (is_shipping_from) await client.query('UPDATE seller_locations SET is_shipping_from = false WHERE seller_id = $1', [sellerId])
        if (is_returns_to) await client.query('UPDATE seller_locations SET is_returns_to = false WHERE seller_id = $1', [sellerId])
        if (is_billing) await client.query('UPDATE seller_locations SET is_billing = false WHERE seller_id = $1', [sellerId])
        const sets = []; const params = []
        const add = (col, val) => { if (val !== undefined) { params.push(val); sets.push(`${col} = $${params.length}`) } }
        add('name', name); add('type', type); add('address_line1', address_line1); add('address_line2', address_line2)
        add('city', city); add('postal_code', postal_code); add('country', country)
        add('phone', phone); add('email', email)
        if (is_primary !== undefined) { params.push(is_primary ? true : false); sets.push(`is_primary = $${params.length}`) }
        if (is_active !== undefined) { params.push(is_active ? true : false); sets.push(`is_active = $${params.length}`) }
        if (is_shipping_from !== undefined) { params.push(is_shipping_from ? true : false); sets.push(`is_shipping_from = $${params.length}`) }
        if (is_returns_to !== undefined) { params.push(is_returns_to ? true : false); sets.push(`is_returns_to = $${params.length}`) }
        if (is_billing !== undefined) { params.push(is_billing ? true : false); sets.push(`is_billing = $${params.length}`) }
        if (!sets.length) { await client.end(); return res.status(400).json({ message: 'Nothing to update' }) }
        sets.push('updated_at = now()')
        params.push(id)
        const r = await client.query(`UPDATE seller_locations SET ${sets.join(', ')} WHERE id = $${params.length}::uuid RETURNING *`, params)
        await syncPurposeAddresses(client, sellerId, r.rows[0])
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
