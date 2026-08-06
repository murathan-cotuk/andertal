'use strict'
const { Router } = require('express')
const { appendBonusLedger, stripLegacyBonusLedgerVersandSuffix } = require('./store-checkout')

const adminHubCustomersGET = async (req, res) => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    const { search = '', limit = '50', offset = '0' } = req.query
    const lim = Math.min(Number(limit)||50, 200)
    const off = Number(offset)||0
    // Seller isolation: non-superusers only see customers who ordered their items
    const isSuperuser = req.sellerUser?.is_superuser === true
    const sellerSellerId = String(req.sellerUser?.seller_id || '').trim()
    let whereParts = []
    let params = []
    if (!isSuperuser) {
      if (!sellerSellerId || sellerSellerId === 'default') {
        await client.end()
        return res.status(403).json({ message: 'Forbidden' })
      }
      params.push(sellerSellerId)
      const n = params.length
      whereParts.push(`EXISTS (
        SELECT 1 FROM store_orders o
        WHERE LOWER(o.email) = LOWER(c.email) AND (
          EXISTS (
            SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
              NULLIF(TRIM(COALESCE(oi.seller_id, '')), '') = $${n}
              OR (
                NULLIF(TRIM(COALESCE(oi.seller_id, '')), '') IS NULL
                AND (
                  EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $${n})
                  OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $${n})
                )
              )
            )
          )
          OR (o.seller_id = $${n} AND o.seller_id IS DISTINCT FROM 'default')
        )
      )`)
    }
    if (search) {
      params.push(`%${search}%`)
      whereParts.push(`(c.email ILIKE $${params.length} OR c.first_name ILIKE $${params.length} OR c.last_name ILIKE $${params.length})`)
      const numSearch = search.replace(/^#/, '').trim()
      if (/^\d+$/.test(numSearch)) {
        params.push(Number(numSearch))
        whereParts.push(`c.customer_number = $${params.length}`)
      }
    }
    const where = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : ''
    // Stats must use item ownership — store_orders.seller_id is platform `default`.
    const orderStatsSeller = (!isSuperuser && sellerSellerId)
      ? `WHERE EXISTS (
           SELECT 1 FROM store_order_items oi
           WHERE oi.order_id = store_orders.id AND (
             NULLIF(TRIM(COALESCE(oi.seller_id, '')), '') = '${sellerSellerId.replace(/'/g, "''")}'
             OR (
               NULLIF(TRIM(COALESCE(oi.seller_id, '')), '') IS NULL
               AND (
                 EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = '${sellerSellerId.replace(/'/g, "''")}')
                 OR EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = '${sellerSellerId.replace(/'/g, "''")}')
               )
             )
           )
         )`
      : ''
    const q = `
      SELECT c.id, c.customer_number, c.email, c.first_name, c.last_name, c.phone, c.country,
             c.account_type, c.created_at,
             c.password_hash IS NOT NULL AS is_registered,
             COALESCE(s.order_count,0) AS order_count,
             COALESCE(s.total_spent,0) AS total_spent,
             s.first_order, s.last_order,
             (
               COALESCE(s.newsletter_opted_in, false)
               OR EXISTS (
                 SELECT 1
                 FROM store_newsletter_subscribers ns
                 WHERE LOWER(TRIM(ns.email)) = LOWER(TRIM(c.email))
                   AND ns.status = 'active'
               )
             ) AS newsletter_opted_in,
             (SELECT seller_id FROM store_orders WHERE LOWER(email) = LOWER(c.email) AND seller_id IS NOT NULL AND seller_id != 'default' ORDER BY created_at DESC LIMIT 1) AS main_seller_id
      FROM store_customers c
      LEFT JOIN (
        SELECT email, COUNT(*) AS order_count, SUM(total_cents) AS total_spent,
               MIN(created_at) AS first_order, MAX(created_at) AS last_order,
               BOOL_OR(newsletter_opted_in) AS newsletter_opted_in
        FROM store_orders ${orderStatsSeller} GROUP BY email
      ) s ON LOWER(s.email) = LOWER(c.email)
      ${where}
      ORDER BY c.created_at DESC
      LIMIT $${params.length+1} OFFSET $${params.length+2}
    `
    params.push(lim, off)
    const r = await client.query(q, params)
    await client.end()
    res.json({ customers: (r.rows || []).map(row => ({
      ...row,
      customer_number: row.customer_number ? Number(row.customer_number) : null,
      is_registered: row.is_registered === true || row.is_registered === 't',
      newsletter_opted_in: row.newsletter_opted_in === true || row.newsletter_opted_in === 't',
    })) })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.json({ customers: [] })
  }
}

const adminHubCustomerPOST = async (req, res) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    const { email, first_name, last_name, phone, account_type, address_line1, address_line2, zip_code, city, country, company_name, vat_number } = req.body || {}
    if (!email) return res.status(400).json({ message: 'email required' })
    const r = await client.query(
      `INSERT INTO store_customers (email, first_name, last_name, phone, account_type, address_line1, address_line2, zip_code, city, country, company_name, vat_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, customer_number, email, first_name, last_name, phone, account_type, address_line1, address_line2, zip_code, city, country, company_name, vat_number, created_at`,
      [email, first_name||null, last_name||null, phone||null, account_type||'privat', address_line1||null, address_line2||null, zip_code||null, city||null, country||null, company_name||null, vat_number||null]
    )
    await client.end()
    const row = r.rows[0]
    res.json({ customer: { ...row, customer_number: row.customer_number ? Number(row.customer_number) : null } })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubCustomerPATCH = async (req, res) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const id = (req.params.id || '').trim()
  if (!id) return res.status(400).json({ message: 'id required' })
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    const allowed = ['email','first_name','last_name','phone','account_type','address_line1','address_line2','zip_code','city','country','company_name','vat_number','billing_address_line1','billing_address_line2','billing_zip_code','billing_city','billing_country','gender','birth_date','notes','email_marketing_consent','bonus_points']
    const body = req.body || {}
    const sets = []
    const vals = []
    for (const key of allowed) {
      if (key in body) { vals.push(body[key]); sets.push(`${key} = $${vals.length}`) }
    }
    if (sets.length === 0) return res.status(400).json({ message: 'no fields to update' })
    vals.push(id)
    const r = await client.query(
      `UPDATE store_customers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}::uuid
       RETURNING id, customer_number, email, first_name, last_name, phone, account_type, address_line1, address_line2, zip_code, city, country, company_name, vat_number, created_at, updated_at`,
      vals
    )
    await client.end()
    if (!r.rows[0]) return res.status(404).json({ message: 'Customer not found' })
    const row = r.rows[0]
    res.json({ customer: { ...row, customer_number: row.customer_number ? Number(row.customer_number) : null } })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubCustomerDELETE = async (req, res) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const id = (req.params.id || '').trim()
  if (!id) return res.status(400).json({ message: 'id required' })
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    const found = await client.query('SELECT email FROM store_customers WHERE id = $1::uuid', [id])
    const emailRow = found.rows[0]
    if (!emailRow) {
      await client.end()
      return res.status(404).json({ message: 'Customer not found' })
    }
    // UNIQUE(email) is case-sensitive in PostgreSQL; remove every row for this address so shop register works again
    const del = await client.query(
      'DELETE FROM store_customers WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) RETURNING id',
      [emailRow.email],
    )
    await client.end()
    res.json({ success: true, deleted: (del.rows || []).length })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubCustomerDiscountPOST = async (req, res) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const customerId = (req.params.id || '').trim()
  if (!customerId) return res.status(400).json({ message: 'id required' })
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    const { code, type = 'percentage', value = 0, min_order_cents = 0, max_uses = 1, expires_at, notes } = req.body || {}
    if (!code) return res.status(400).json({ message: 'code required' })
    const r = await client.query(
      `INSERT INTO store_customer_discounts (customer_id, code, type, value, min_order_cents, max_uses, expires_at, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, code, type, value, min_order_cents, max_uses, used_count, expires_at, notes, created_at`,
      [customerId, code.toUpperCase(), type, Number(value), Number(min_order_cents||0), Number(max_uses||1), expires_at||null, notes||null]
    )
    await client.end()
    res.json({ discount: r.rows[0] })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubCustomerDiscountDELETE = async (req, res) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const { customerId, discountId } = req.params
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    await client.query('DELETE FROM store_customer_discounts WHERE id = $1::uuid AND customer_id = $2::uuid', [discountId, customerId])
    await client.end()
    res.json({ success: true })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubCustomerBonusLedgerPOST = async (req, res) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const customerId = (req.params.id || '').trim()
  if (!customerId) return res.status(400).json({ message: 'id required' })
  const body = req.body || {}
  const description = (body.description || '').toString().trim()
  const delta = parseInt(body.points_delta, 10)
  if (!description) return res.status(400).json({ message: 'description required' })
  if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ message: 'points_delta must be non-zero integer' })
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    const ex = await client.query('SELECT id FROM store_customers WHERE id = $1::uuid', [customerId])
    if (!ex.rows?.[0]) {
      await client.end()
      return res.status(404).json({ message: 'Customer not found' })
    }
    const occurredAt = body.occurred_at ? new Date(body.occurred_at).toISOString() : null
    await appendBonusLedger(client, {
      customerId,
      pointsDelta: delta,
      description,
      source: 'manual',
      occurredAt,
      skipBalanceUpdate: false,
    })
    const insR = await client.query(
      `SELECT id, occurred_at, points_delta, description, source, order_id, created_at, updated_at
       FROM store_customer_bonus_ledger WHERE customer_id = $1::uuid ORDER BY id DESC LIMIT 1`,
      [customerId],
    )
    const row = insR.rows?.[0]
    const balR = await client.query('SELECT COALESCE(bonus_points,0) AS bp FROM store_customers WHERE id = $1::uuid', [customerId])
    await client.end()
    res.status(201).json({
      entry: row
        ? {
            id: row.id,
            occurred_at: row.occurred_at,
            points_delta: Number(row.points_delta),
            description: row.description,
            source: row.source,
            order_id: row.order_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
          }
        : null,
      bonus_points: Number(balR.rows?.[0]?.bp || 0),
    })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubCustomerBonusLedgerPATCH = async (req, res) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const customerId = (req.params.customerId || '').trim()
  const entryId = (req.params.entryId || '').trim()
  if (!customerId || !entryId) return res.status(400).json({ message: 'customerId and entryId required' })
  const body = req.body || {}
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    const curR = await client.query(
      'SELECT id, points_delta, description, occurred_at FROM store_customer_bonus_ledger WHERE id = $1::uuid AND customer_id = $2::uuid',
      [entryId, customerId],
    )
    const cur = curR.rows?.[0]
    if (!cur) {
      await client.end()
      return res.status(404).json({ message: 'Entry not found' })
    }
    const oldDelta = Number(cur.points_delta)
    let newDelta = oldDelta
    if (body.points_delta !== undefined && body.points_delta !== null) {
      newDelta = parseInt(body.points_delta, 10)
      if (!Number.isFinite(newDelta) || newDelta === 0) {
        await client.end()
        return res.status(400).json({ message: 'points_delta must be non-zero integer' })
      }
    }
    const newDesc = body.description != null ? String(body.description).trim() : cur.description
    if (!newDesc) {
      await client.end()
      return res.status(400).json({ message: 'description required' })
    }
    let newOccurred = cur.occurred_at
    if (body.occurred_at != null && body.occurred_at !== '') {
      newOccurred = new Date(body.occurred_at).toISOString()
    }
    const diff = newDelta - oldDelta
    await client.query(
      `UPDATE store_customer_bonus_ledger SET description = $1, points_delta = $2, occurred_at = $3::timestamptz, updated_at = NOW()
       WHERE id = $4::uuid AND customer_id = $5::uuid`,
      [newDesc, newDelta, newOccurred, entryId, customerId],
    )
    if (diff !== 0) {
      await client.query(
        `UPDATE store_customers SET bonus_points = COALESCE(bonus_points, 0) + $1, updated_at = NOW() WHERE id = $2::uuid`,
        [diff, customerId],
      )
    }
    const outR = await client.query(
      'SELECT id, occurred_at, points_delta, description, source, order_id, created_at, updated_at FROM store_customer_bonus_ledger WHERE id = $1::uuid',
      [entryId],
    )
    const balR = await client.query('SELECT COALESCE(bonus_points,0) AS bp FROM store_customers WHERE id = $1::uuid', [customerId])
    await client.end()
    const row = outR.rows?.[0]
    res.json({
      entry: row
        ? {
            id: row.id,
            occurred_at: row.occurred_at,
            points_delta: Number(row.points_delta),
            description: row.description,
            source: row.source,
            order_id: row.order_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
          }
        : null,
      bonus_points: Number(balR.rows?.[0]?.bp || 0),
    })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubCustomerBonusLedgerDELETE = async (req, res) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const customerId = (req.params.customerId || '').trim()
  const entryId = (req.params.entryId || '').trim()
  if (!customerId || !entryId) return res.status(400).json({ message: 'customerId and entryId required' })
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    const curR = await client.query(
      'SELECT points_delta FROM store_customer_bonus_ledger WHERE id = $1::uuid AND customer_id = $2::uuid',
      [entryId, customerId],
    )
    const cur = curR.rows?.[0]
    if (!cur) {
      await client.end()
      return res.status(404).json({ message: 'Entry not found' })
    }
    const oldDelta = Number(cur.points_delta)
    await client.query('DELETE FROM store_customer_bonus_ledger WHERE id = $1::uuid AND customer_id = $2::uuid', [entryId, customerId])
    await client.query(
      `UPDATE store_customers SET bonus_points = COALESCE(bonus_points, 0) - $1, updated_at = NOW() WHERE id = $2::uuid`,
      [oldDelta, customerId],
    )
    const balR = await client.query('SELECT COALESCE(bonus_points,0) AS bp FROM store_customers WHERE id = $1::uuid', [customerId])
    await client.end()
    res.json({ success: true, bonus_points: Number(balR.rows?.[0]?.bp || 0) })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubCustomerByIdGET = async (req, res) => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const id = (req.params.id || '').trim()
  if (!id) return res.status(400).json({ message: 'id required' })
  const isSuperuser = req.sellerUser?.is_superuser || false
  const sellerSellerId = req.sellerUser?.seller_id || null
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    const custR = await client.query(
      `SELECT id, customer_number, email, first_name, last_name, phone, account_type,
              address_line1, address_line2, zip_code, city, country, company_name, vat_number,
              billing_address_line1, billing_address_line2, billing_zip_code, billing_city, billing_country,
              password_hash IS NOT NULL AS is_registered,
              gender, birth_date, notes, email_marketing_consent,
              COALESCE(bonus_points, 0) AS bonus_points,
              created_at, updated_at
       FROM store_customers WHERE id = $1::uuid`,
      [id]
    )
    if (!custR.rows || !custR.rows[0]) { await client.end(); return res.status(404).json({ message: 'Customer not found' }) }
    const row = custR.rows[0]
    if (!isSuperuser && sellerSellerId) {
      const acc = await client.query(
        `SELECT 1 FROM store_customers c
         WHERE c.id = $1::uuid AND EXISTS (
           SELECT 1 FROM store_orders o WHERE LOWER(o.email) = LOWER(c.email) AND o.seller_id = $2
         )`,
        [id, sellerSellerId],
      )
      if (!acc.rows?.[0]) {
        await client.end()
        return res.status(404).json({ message: 'Customer not found' })
      }
    }
    let ordersQ = `SELECT id, order_number, order_status, payment_status, delivery_status,
              total_cents, currency, newsletter_opted_in, created_at
       FROM store_orders WHERE LOWER(email) = LOWER($1)`
    const ordersParams = [row.email]
    if (!isSuperuser && sellerSellerId) {
      ordersParams.push(sellerSellerId)
      ordersQ += ` AND seller_id = $2`
    }
    ordersQ += ' ORDER BY created_at DESC'
    const ordersR = await client.query(ordersQ, ordersParams)
    const orders = (ordersR.rows || []).map(r => ({ ...r, order_number: r.order_number ? Number(r.order_number) : null }))
    const subR = await client.query(
      `SELECT 1
       FROM store_newsletter_subscribers
       WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
         AND status = 'active'
       LIMIT 1`,
      [row.email]
    )
    const newsletterOptedIn = orders.some(o => o.newsletter_opted_in) || !!subR.rows?.[0]
    const discountsR = await client.query(
      `SELECT id, code, type, value, min_order_cents, max_uses, used_count, expires_at, notes, created_at
       FROM store_customer_discounts WHERE customer_id = $1 ORDER BY created_at DESC`,
      [id]
    )
    const discounts = discountsR.rows || []
    let bonus_ledger = []
    if (isSuperuser) {
      try {
        const ledR = await client.query(
          `SELECT id, occurred_at, points_delta, description, source, order_id, created_at, updated_at
           FROM store_customer_bonus_ledger WHERE customer_id = $1::uuid
           ORDER BY occurred_at DESC NULLS LAST, created_at DESC`,
          [id],
        )
        bonus_ledger = (ledR.rows || []).map((e) => ({
          id: e.id,
          occurred_at: e.occurred_at,
          points_delta: Number(e.points_delta),
          description: stripLegacyBonusLedgerVersandSuffix(e.description),
          source: e.source,
          order_id: e.order_id,
          created_at: e.created_at,
          updated_at: e.updated_at,
        }))
      } catch (_) {
        bonus_ledger = []
      }
    }
    await client.end()
    const { bonus_points: _rowBonus, ...rowWithoutBonus } = row
    const customerBase = {
      ...rowWithoutBonus,
      customer_number: row.customer_number ? Number(row.customer_number) : null,
      is_registered: row.is_registered === true || row.is_registered === 't',
      newsletter_opted_in: newsletterOptedIn,
      birth_date: row.birth_date || null,
      orders,
      discounts,
    }
    if (isSuperuser) {
      customerBase.bonus_points = Number(row.bonus_points || 0)
      customerBase.bonus_ledger = bonus_ledger
    }
    res.json({ customer: customerBase })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubCarriersGET = async (req, res) => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const isSuperuser = req.sellerUser?.is_superuser === true
  const callerSellerId = req.sellerUser?.seller_id || null
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    let r
    if (isSuperuser) {
      r = await client.query('SELECT * FROM store_shipping_carriers ORDER BY sort_order ASC, created_at ASC')
    } else {
      r = await client.query(
        `SELECT * FROM store_shipping_carriers
         WHERE seller_id = $1
         ORDER BY sort_order ASC, created_at ASC`,
        [callerSellerId]
      )
    }
    await client.end()
    res.json({ carriers: r.rows || [] })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.json({ carriers: [] })
  }
}

const adminHubCarrierPOST = async (req, res) => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const isSuperuser = req.sellerUser?.is_superuser === true
  const callerSellerId = req.sellerUser?.seller_id || null
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    const { name, tracking_url_template, api_key, api_secret, is_active = true, sort_order = 0 } = req.body || {}
    if (!name) return res.status(400).json({ message: 'name required' })
    const r = await client.query(
      `INSERT INTO store_shipping_carriers (name, tracking_url_template, api_key, api_secret, seller_id, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, tracking_url_template||null, api_key||null, api_secret||null, isSuperuser ? null : callerSellerId, is_active, Number(sort_order||0)]
    )
    await client.end()
    res.json({ carrier: r.rows[0] })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubCarrierPATCH = async (req, res) => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const id = (req.params.id || '').trim()
  const isSuperuser = req.sellerUser?.is_superuser === true
  const callerSellerId = req.sellerUser?.seller_id || null
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    if (!isSuperuser) {
      const own = await client.query('SELECT id FROM store_shipping_carriers WHERE id = $1::uuid AND seller_id = $2', [id, callerSellerId])
      if (!own.rows[0]) {
        await client.end()
        return res.status(403).json({ message: 'Forbidden' })
      }
    }
    const allowed = ['name','tracking_url_template','api_key','api_secret','is_active','sort_order']
    const body = req.body || {}
    const sets = []; const vals = []
    for (const key of allowed) { if (key in body) { vals.push(body[key]); sets.push(`${key} = $${vals.length}`) } }
    if (sets.length === 0) return res.status(400).json({ message: 'no fields to update' })
    vals.push(id)
    const r = await client.query(
      `UPDATE store_shipping_carriers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}::uuid RETURNING *`, vals
    )
    await client.end()
    if (!r.rows[0]) return res.status(404).json({ message: 'Not found' })
    res.json({ carrier: r.rows[0] })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubCarrierDELETE = async (req, res) => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const id = (req.params.id || '').trim()
  const isSuperuser = req.sellerUser?.is_superuser === true
  const callerSellerId = req.sellerUser?.seller_id || null
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    if (!isSuperuser) {
      const own = await client.query('SELECT id FROM store_shipping_carriers WHERE id = $1::uuid AND seller_id = $2', [id, callerSellerId])
      if (!own.rows[0]) {
        await client.end()
        return res.status(403).json({ message: 'Forbidden' })
      }
    }
    await client.query('DELETE FROM store_shipping_carriers WHERE id = $1::uuid', [id])
    await client.end()
    res.json({ success: true })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

module.exports = function createCustomersRouter() {
  const router = Router()

  router.get('/admin-hub/v1/customers', adminHubCustomersGET)
  router.post('/admin-hub/v1/customers', adminHubCustomerPOST)
  router.patch('/admin-hub/v1/customers/:id', adminHubCustomerPATCH)
  router.delete('/admin-hub/v1/customers/:id', adminHubCustomerDELETE)
  router.get('/admin-hub/v1/customers/:id', adminHubCustomerByIdGET)
  router.post('/admin-hub/v1/customers/:id/discounts', adminHubCustomerDiscountPOST)
  router.delete('/admin-hub/v1/customers/:customerId/discounts/:discountId', adminHubCustomerDiscountDELETE)
  router.post('/admin-hub/v1/customers/:id/bonus-ledger', adminHubCustomerBonusLedgerPOST)
  router.patch('/admin-hub/v1/customers/:customerId/bonus-ledger/:entryId', adminHubCustomerBonusLedgerPATCH)
  router.delete('/admin-hub/v1/customers/:customerId/bonus-ledger/:entryId', adminHubCustomerBonusLedgerDELETE)

  router.get('/admin-hub/v1/shipping-carriers', adminHubCarriersGET)
  router.post('/admin-hub/v1/shipping-carriers', adminHubCarrierPOST)
  router.patch('/admin-hub/v1/shipping-carriers/:id', adminHubCarrierPATCH)
  router.delete('/admin-hub/v1/shipping-carriers/:id', adminHubCarrierDELETE)

  return router
}
