'use strict'
const { Router } = require('express')
const { getCategoriesPgClient } = require('../categories-helpers')

const slugifyTitle = (str) => {
  if (!str || typeof str !== 'string') return ''
  const map = { ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ı: 'i', I: 'i', İ: 'i', ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ä: 'ae', Ä: 'ae', ß: 'ss' }
  let s = str.trim()
  for (const [from, to] of Object.entries(map)) s = s.split(from).join(to)
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

const requireSuperuser = (req, res, next) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  next()
}

// ── Brands ───────────────────────────────────────────────────────────────────

const adminBrandsGET = async (req, res) => {
  const client = getCategoriesPgClient()
  if (!client) return res.status(500).json({ message: 'Database unavailable' })
  try {
    await client.connect()
    const r = await client.query('SELECT id, name, handle, logo_image, banner_image, address, seller_id, created_at FROM admin_hub_brands ORDER BY name')
    await client.end()
    res.json({
      brands: (r.rows || []).map((row) => ({
        id: row.id,
        name: row.name,
        handle: row.handle,
        logo_image: row.logo_image || null,
        banner_image: row.banner_image || null,
        address: row.address || null,
        seller_id: row.seller_id || null,
        created_at: row.created_at,
      })),
    })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('Brands GET:', e)
    res.status(500).json({ message: (e && e.message) || 'Internal server error' })
  }
}

const adminBrandsPOST = async (req, res) => {
  const body = req.body || {}
  const name = (body.name || '').trim()
  if (!name) return res.status(400).json({ message: 'name is required' })
  const baseHandle = slugifyTitle((body.handle || '').trim()) || slugifyTitle(name) || ('brand-' + Date.now())
  const logo_image = (body.logo_image || body.logo || '').trim() || null
  const banner_image = (body.banner_image || '').trim() || null
  const address = (body.address || '').trim() || null
  const callerSellerId = req.sellerUser?.seller_id || null
  const client = getCategoriesPgClient()
  if (!client) return res.status(500).json({ message: 'Database unavailable' })
  try {
    await client.connect()
    let handle = baseHandle
    for (let i = 0; i < 100; i++) {
      const ex = await client.query(
        'SELECT id FROM admin_hub_brands WHERE LOWER(TRIM(handle)) = LOWER(TRIM($1)) LIMIT 1',
        [handle]
      )
      if (!ex.rows || !ex.rows.length) break
      handle = `${baseHandle}-${i + 1}`
    }
    const r = await client.query(
      'INSERT INTO admin_hub_brands (name, handle, logo_image, banner_image, address, seller_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, handle, logo_image, banner_image, address, seller_id, created_at',
      [name, handle, logo_image, banner_image, address, callerSellerId]
    )
    await client.end()
    const row = r.rows && r.rows[0]
    res.status(201).json({ brand: row })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('Brands POST:', e)
    res.status(500).json({ message: (e && e.message) || 'Internal server error' })
  }
}

const adminBrandsPatchDelete = async (req, res, isPatch) => {
  const id = (req.params.id || '').trim()
  if (!id) return res.status(400).json({ message: 'id required' })
  const isSuperuserReq = req.sellerUser?.is_superuser === true
  const callerSellerId = req.sellerUser?.seller_id || null
  const client = getCategoriesPgClient()
  if (!client) return res.status(500).json({ message: 'Database unavailable' })
  try {
    await client.connect()
    const existing = await client.query('SELECT id, seller_id FROM admin_hub_brands WHERE id = $1', [id])
    if (!existing.rows || !existing.rows[0]) {
      await client.end()
      return res.status(404).json({ message: 'Brand not found' })
    }
    const brandOwnerId = existing.rows[0].seller_id
    const isOwner = callerSellerId && brandOwnerId === callerSellerId
    if (!isSuperuserReq && !isOwner) {
      await client.end()
      return res.status(403).json({ message: 'You can only edit your own brands' })
    }
    if (isPatch) {
      const body = req.body || {}
      const updates = []
      const params = []
      let n = 1
      if (isSuperuserReq) {
        const name = (body.name || '').trim()
        const handle = (body.handle || '').trim()
        if (name) { updates.push('name = $' + n); params.push(name); n++ }
        if (handle) { updates.push('handle = $' + n); params.push(handle); n++ }
      }
      const logo_image = body.logo_image !== undefined ? (typeof body.logo_image === 'string' ? body.logo_image.trim() : null) : undefined
      const banner_image = body.banner_image !== undefined ? (typeof body.banner_image === 'string' ? body.banner_image.trim() : null) : undefined
      const address = body.address !== undefined ? (typeof body.address === 'string' ? body.address.trim() : null) : undefined
      if (logo_image !== undefined) { updates.push('logo_image = $' + n); params.push(logo_image || null); n++ }
      if (banner_image !== undefined) { updates.push('banner_image = $' + n); params.push(banner_image || null); n++ }
      if (address !== undefined) { updates.push('address = $' + n); params.push(address || null); n++ }
      if (updates.length === 0) {
        const r = await client.query('SELECT id, name, handle, logo_image, banner_image, address, seller_id, created_at FROM admin_hub_brands WHERE id = $1', [id])
        await client.end()
        return res.json({ brand: r.rows[0] })
      }
      updates.push('updated_at = now()')
      params.push(id)
      const r = await client.query(
        'UPDATE admin_hub_brands SET ' + updates.join(', ') + ' WHERE id = $' + n + ' RETURNING id, name, handle, logo_image, banner_image, address, seller_id, created_at',
        params
      )
      await client.end()
      if (!r.rows || !r.rows[0]) return res.status(404).json({ message: 'Brand not found' })
      res.json({ brand: r.rows[0] })
    } else {
      const r = await client.query('DELETE FROM admin_hub_brands WHERE id = $1 RETURNING id', [id])
      await client.end()
      if (!r.rows || !r.rows[0]) return res.status(404).json({ message: 'Brand not found' })
      res.status(200).json({ deleted: true })
    }
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('Brands PATCH/DELETE:', e)
    res.status(500).json({ message: (e && e.message) || 'Internal server error' })
  }
}

// ── Banners ──────────────────────────────────────────────────────────────────

const getBannersDb = async () => {
  const client = getCategoriesPgClient()
  if (!client) return []
  try {
    await client.connect()
    const r = await client.query('SELECT id, title, subtitle, image_url, video_url, link_url, button_text, is_active, position, created_at FROM admin_hub_banners ORDER BY position ASC, created_at ASC')
    await client.end()
    return r.rows || []
  } catch (e) {
    try { await client.end() } catch (_) {}
    return []
  }
}

const adminBannersGET = async (req, res) => {
  res.json({ banners: await getBannersDb() })
}

const adminBannersPOST = async (req, res) => {
  const b = req.body || {}
  const title = (b.title || '').trim()
  if (!title) return res.status(400).json({ message: 'Title is required' })
  const client = getCategoriesPgClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query(
      `INSERT INTO admin_hub_banners (title, subtitle, image_url, video_url, link_url, button_text, is_active, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title, b.subtitle || null, b.image_url || null, b.video_url || null, b.link_url || null, b.button_text || null, b.is_active !== false, Number(b.position) || 0]
    )
    await client.end()
    res.status(201).json({ banner: r.rows[0] })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('Banners POST:', e)
    res.status(500).json({ message: (e && e.message) || 'Internal server error' })
  }
}

const adminBannersPUT = async (req, res) => {
  const { id } = req.params
  const b = req.body || {}
  const client = getCategoriesPgClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query(
      `UPDATE admin_hub_banners SET title=$1, subtitle=$2, image_url=$3, video_url=$4, link_url=$5, button_text=$6, is_active=$7, position=$8, updated_at=now() WHERE id=$9 RETURNING *`,
      [(b.title || '').trim() || null, b.subtitle || null, b.image_url || null, b.video_url || null, b.link_url || null, b.button_text || null, b.is_active !== false, Number(b.position) || 0, id]
    )
    await client.end()
    if (!r.rows[0]) return res.status(404).json({ message: 'Not found' })
    res.json({ banner: r.rows[0] })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('Banners PUT:', e)
    res.status(500).json({ message: (e && e.message) || 'Internal server error' })
  }
}

const adminBannersDELETE = async (req, res) => {
  const client = getCategoriesPgClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    await client.query('DELETE FROM admin_hub_banners WHERE id=$1', [req.params.id])
    await client.end()
    res.json({ ok: true })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('Banners DELETE:', e)
    res.status(500).json({ message: (e && e.message) || 'Internal server error' })
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

module.exports = function createBrandsRouter() {
  const router = Router()

  router.get('/admin-hub/brands', adminBrandsGET)
  router.post('/admin-hub/brands', adminBrandsPOST)
  router.patch('/admin-hub/brands/:id', (req, res) => adminBrandsPatchDelete(req, res, true))
  router.delete('/admin-hub/brands/:id', (req, res) => adminBrandsPatchDelete(req, res, false))

  router.get('/admin-hub/v1/banners', requireSuperuser, adminBannersGET)
  router.post('/admin-hub/v1/banners', requireSuperuser, adminBannersPOST)
  router.put('/admin-hub/v1/banners/:id', requireSuperuser, adminBannersPUT)
  router.delete('/admin-hub/v1/banners/:id', requireSuperuser, adminBannersDELETE)

  return router
}
