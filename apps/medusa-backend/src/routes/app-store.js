'use strict'
/**
 * App Store API — /admin-hub/v1/app-store/
 * Auth: requireSellerAuth (existing seller JWT)
 */
const { Router } = require('express')

function getDbClient() {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

module.exports = function createAppStoreRouter() {
  const router = Router()

  // ── GET /apps  — published app catalog ──────────────────────────────────────
  router.get('/apps', async (req, res) => {
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const category = req.query.category
      const q = req.query.q ? `%${req.query.q}%` : null
      const params = []
      const conditions = ["a.status = 'published'"]
      if (q) { params.push(q); conditions.push(`(v.manifest->>'name' ILIKE $${params.length} OR a.handle ILIKE $${params.length})`) }
      if (category && category !== 'all') { params.push(category); conditions.push(`v.manifest->>'category' = $${params.length}`) }
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
      const r = await client.query(
        `SELECT a.id, a.handle, a.type, a.client_id, a.install_count, a.status,
                v.manifest, v.version
         FROM platform_apps a
         LEFT JOIN platform_app_versions v ON v.id = a.current_version_id
         ${where}
         ORDER BY a.install_count DESC, a.created_at DESC
         LIMIT 100`,
        params
      )
      await client.end()
      res.json({ apps: r.rows })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  // ── GET /apps/:handle ─────────────────────────────────────────────────────────
  router.get('/apps/:handle', async (req, res) => {
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const r = await client.query(
        `SELECT a.id, a.handle, a.type, a.client_id, a.install_count, a.status,
                v.manifest, v.version, d.company_name AS developer_name
         FROM platform_apps a
         LEFT JOIN platform_app_versions v ON v.id = a.current_version_id
         LEFT JOIN developers d ON d.id = a.developer_id
         WHERE a.handle = $1 AND a.status = 'published'`,
        [req.params.handle]
      )
      await client.end()
      if (!r.rows[0]) return res.status(404).json({ message: 'App not found' })
      res.json({ app: r.rows[0] })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  // ── GET /installations — seller's installed apps ─────────────────────────────
  router.get('/installations', async (req, res) => {
    const sellerId = req.sellerUser?.seller_id
    if (!sellerId) return res.status(401).json({ message: 'Seller auth required' })
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const r = await client.query(
        `SELECT i.id, i.app_id, i.scopes, i.installed_at, i.settings,
                a.handle, a.type, v.manifest
         FROM platform_app_installations i
         JOIN platform_apps a ON a.id = i.app_id
         LEFT JOIN platform_app_versions v ON v.id = a.current_version_id
         WHERE i.seller_id = $1 AND i.uninstalled_at IS NULL
         ORDER BY i.installed_at DESC`,
        [sellerId]
      )
      await client.end()
      res.json({ installations: r.rows })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  // ── POST /apps/:handle/install — initiate OAuth install ──────────────────────
  // Returns the OAuth authorize URL to redirect the seller to
  router.post('/apps/:handle/install', async (req, res) => {
    const sellerId = req.sellerUser?.seller_id
    if (!sellerId) return res.status(401).json({ message: 'Seller auth required' })
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const r = await client.query(
        `SELECT a.id, a.client_id, a.status, v.manifest
         FROM platform_apps a
         LEFT JOIN platform_app_versions v ON v.id = a.current_version_id
         WHERE a.handle = $1`,
        [req.params.handle]
      )
      const app = r.rows[0]
      await client.end()
      if (!app || app.status !== 'published') return res.status(404).json({ message: 'App not found' })
      const manifest = typeof app.manifest === 'string' ? JSON.parse(app.manifest) : (app.manifest || {})
      const scopes = (manifest.scopes || []).join(' ')
      const redirectUri = (manifest.oauth?.redirect_urls || [])[0] || ''
      const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || process.env.BACKEND_URL || 'https://api.andertal.com'
      const authorizeUrl = `${backendUrl}/oauth/authorize?client_id=${encodeURIComponent(app.client_id)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code`
      res.json({ authorize_url: authorizeUrl, client_id: app.client_id, scopes })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  // ── DELETE /installations/:id — uninstall app ─────────────────────────────────
  router.delete('/installations/:id', async (req, res) => {
    const sellerId = req.sellerUser?.seller_id
    if (!sellerId) return res.status(401).json({ message: 'Seller auth required' })
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const r = await client.query(
        `UPDATE platform_app_installations SET uninstalled_at = now()
         WHERE id = $1 AND seller_id = $2 AND uninstalled_at IS NULL
         RETURNING id, app_id`,
        [req.params.id, sellerId]
      )
      if (!r.rows[0]) { await client.end(); return res.status(404).json({ message: 'Installation not found' }) }
      // Revoke all tokens for this installation
      await client.query('UPDATE platform_app_tokens SET revoked_at = now() WHERE installation_id = $1 AND revoked_at IS NULL', [req.params.id])
      // Update install count
      await client.query('UPDATE platform_apps SET install_count = GREATEST(0, install_count - 1) WHERE id = $1', [r.rows[0].app_id])
      await client.end()
      res.json({ ok: true })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  // ── GET /installations/:id/settings ──────────────────────────────────────────
  router.get('/installations/:id/settings', async (req, res) => {
    const sellerId = req.sellerUser?.seller_id
    if (!sellerId) return res.status(401).json({ message: 'Seller auth required' })
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const r = await client.query('SELECT settings FROM platform_app_installations WHERE id = $1 AND seller_id = $2 AND uninstalled_at IS NULL', [req.params.id, sellerId])
      await client.end()
      if (!r.rows[0]) return res.status(404).json({ message: 'Installation not found' })
      res.json({ settings: r.rows[0].settings })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  // ── PATCH /installations/:id/settings ────────────────────────────────────────
  router.patch('/installations/:id/settings', async (req, res) => {
    const sellerId = req.sellerUser?.seller_id
    if (!sellerId) return res.status(401).json({ message: 'Seller auth required' })
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const r = await client.query(
        `UPDATE platform_app_installations SET settings = $1 WHERE id = $2 AND seller_id = $3 AND uninstalled_at IS NULL RETURNING id`,
        [JSON.stringify(req.body || {}), req.params.id, sellerId]
      )
      await client.end()
      if (!r.rows[0]) return res.status(404).json({ message: 'Installation not found' })
      res.json({ ok: true })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  return router
}
