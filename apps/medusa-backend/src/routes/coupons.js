'use strict'
const { Router } = require('express')

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

module.exports = function createCouponsRouter({ normalizeCouponCode }) {
    // ── Coupons ────────────────────────────────────────────────────────────────
    const adminHubCouponsGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const isSuperuser = req.sellerUser?.is_superuser || false
        const callerSellerId = req.sellerUser?.seller_id
        const sellerId = req.query.seller_id || (!isSuperuser ? callerSellerId : null)
        const params = []
        let where = ''
        if (sellerId) { params.push(sellerId); where = `WHERE seller_id = $1` }
        const r = await client.query(
          `SELECT id, seller_id, code, discount_type, discount_value, min_subtotal_cents, usage_limit, per_customer_limit, used_count, active, starts_at, expires_at, created_at, updated_at
           FROM admin_hub_coupons ${where}
           ORDER BY created_at DESC
           LIMIT 500`,
          params,
        )
        await client.end()
        res.json({ coupons: r.rows || [], count: r.rows?.length || 0 })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCouponsPOST = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const isSuperuser = req.sellerUser?.is_superuser || false
        const callerSellerId = req.sellerUser?.seller_id
        const body = req.body || {}
        // Superuser without explicit seller_id → 'default' (platform-wide coupon)
        // Superuser with explicit seller_id → coupon for that specific seller
        // Normal seller → always their own seller_id
        const sellerId = (isSuperuser
          ? String(body.seller_id || 'default')
          : String(callerSellerId || 'default')).trim() || 'default'
        if (!isSuperuser && sellerId !== callerSellerId) {
          await client.end()
          return res.status(403).json({ message: 'Forbidden' })
        }
        const code = normalizeCouponCode(body.code)
        if (!code) {
          await client.end()
          return res.status(400).json({ message: 'Coupon code required' })
        }
        const discountType = String(body.discount_type || 'percent').toLowerCase() === 'fixed' ? 'fixed' : 'percent'
        const discountValue = Math.max(0, parseInt(body.discount_value, 10) || 0)
        const minSubtotalCents = Math.max(0, parseInt(body.min_subtotal_cents, 10) || 0)
        const usageLimitRaw = body.usage_limit == null || body.usage_limit === '' ? null : Math.max(0, parseInt(body.usage_limit, 10) || 0)
        const perCustomerLimitRaw = body.per_customer_limit == null || body.per_customer_limit === '' ? null : Math.max(1, parseInt(body.per_customer_limit, 10) || 1)
        const active = body.active !== false
        const startsAt = body.starts_at ? new Date(body.starts_at) : null
        const expiresAt = body.expires_at ? new Date(body.expires_at) : null
        if (discountValue <= 0) {
          await client.end()
          return res.status(400).json({ message: 'discount_value must be > 0' })
        }
        const r = await client.query(
          `INSERT INTO admin_hub_coupons
           (seller_id, code, discount_type, discount_value, min_subtotal_cents, usage_limit, per_customer_limit, active, starts_at, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING *`,
          [sellerId, code, discountType, discountValue, minSubtotalCents, usageLimitRaw, perCustomerLimitRaw, active, startsAt, expiresAt],
        )
        await client.end()
        res.json({ coupon: r.rows?.[0] || null })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCouponsPATCH = async (req, res) => {
      const id = String(req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const isSuperuser = req.sellerUser?.is_superuser || false
        const callerSellerId = req.sellerUser?.seller_id
        const own = await client.query('SELECT seller_id FROM admin_hub_coupons WHERE id = $1', [id])
        const ownerSellerId = own.rows?.[0]?.seller_id
        if (!ownerSellerId) {
          await client.end()
          return res.status(404).json({ message: 'Coupon not found' })
        }
        if (!isSuperuser && ownerSellerId !== callerSellerId) {
          await client.end()
          return res.status(403).json({ message: 'Forbidden' })
        }
        const body = req.body || {}
        const sets = []
        const vals = []
        const put = (k, v) => { vals.push(v); sets.push(`${k} = $${vals.length}`) }
        if (body.code !== undefined) put('code', normalizeCouponCode(body.code))
        if (body.discount_type !== undefined) put('discount_type', String(body.discount_type || 'percent').toLowerCase() === 'fixed' ? 'fixed' : 'percent')
        if (body.discount_value !== undefined) put('discount_value', Math.max(0, parseInt(body.discount_value, 10) || 0))
        if (body.min_subtotal_cents !== undefined) put('min_subtotal_cents', Math.max(0, parseInt(body.min_subtotal_cents, 10) || 0))
        if (body.usage_limit !== undefined) put('usage_limit', body.usage_limit == null || body.usage_limit === '' ? null : Math.max(0, parseInt(body.usage_limit, 10) || 0))
        if (body.per_customer_limit !== undefined) put('per_customer_limit', body.per_customer_limit == null || body.per_customer_limit === '' ? null : Math.max(1, parseInt(body.per_customer_limit, 10) || 1))
        if (body.active !== undefined) put('active', body.active !== false)
        if (body.starts_at !== undefined) put('starts_at', body.starts_at ? new Date(body.starts_at) : null)
        if (body.expires_at !== undefined) put('expires_at', body.expires_at ? new Date(body.expires_at) : null)
        if (!sets.length) {
          await client.end()
          return res.status(400).json({ message: 'No fields to update' })
        }
        sets.push('updated_at = now()')
        vals.push(id)
        const r = await client.query(`UPDATE admin_hub_coupons SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals)
        await client.end()
        res.json({ coupon: r.rows?.[0] || null })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCouponsDELETE = async (req, res) => {
      const id = String(req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const isSuperuser = req.sellerUser?.is_superuser || false
        const callerSellerId = req.sellerUser?.seller_id
        const own = await client.query('SELECT seller_id FROM admin_hub_coupons WHERE id = $1', [id])
        const ownerSellerId = own.rows?.[0]?.seller_id
        if (!ownerSellerId) {
          await client.end()
          return res.status(404).json({ message: 'Coupon not found' })
        }
        if (!isSuperuser && ownerSellerId !== callerSellerId) {
          await client.end()
          return res.status(403).json({ message: 'Forbidden' })
        }
        await client.query('DELETE FROM admin_hub_coupons WHERE id = $1', [id])
        await client.end()
        res.json({ ok: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }


  const router = Router()
  router.get('/admin-hub/v1/coupons', adminHubCouponsGET)
  router.post('/admin-hub/v1/coupons', adminHubCouponsPOST)
  router.patch('/admin-hub/v1/coupons/:id', adminHubCouponsPATCH)
  router.delete('/admin-hub/v1/coupons/:id', adminHubCouponsDELETE)

  return router
}
