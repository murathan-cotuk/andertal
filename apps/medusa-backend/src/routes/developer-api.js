'use strict'
/**
 * Developer Portal API — /developer-api/v1/
 * Auth: developer JWT (dev_token), separate from seller JWT.
 * Public: POST /auth/signup, POST /auth/login
 */
const { Router } = require('express')
const {
  generateId, hashSecret, generateSecret,
  validateManifest, validateTierTypeMatch,
  signDeveloperToken, verifyDeveloperToken,
} = require('../modules/app-platform/service')

const _c = require('crypto')

function getDbClient() {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

function hashPassword(pw) {
  return _c.createHash('sha256').update(pw + (process.env.DEVELOPER_JWT_SECRET || 'devpwsalt')).digest('hex')
}

function requireDevAuth(req, res, next) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return res.status(401).json({ message: 'Developer token required' })
  const payload = verifyDeveloperToken(token)
  if (!payload) return res.status(401).json({ message: 'Invalid or expired developer token' })
  req.developer = payload
  next()
}

const AUTO_APPROVE = process.env.APP_PLATFORM_AUTO_APPROVE === 'true'

module.exports = function createDeveloperApiRouter() {
  const router = Router()

  // ── POST /auth/signup ───────────────────────────────────────────────────────
  router.post('/auth/signup', async (req, res) => {
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const { email, password, company_name, country, vat_number, dpa_accepted } = req.body || {}
      if (!email || !password) return res.status(400).json({ message: 'email and password are required' })
      if (password.length < 8) return res.status(400).json({ message: 'password must be at least 8 characters' })
      if (!dpa_accepted) return res.status(400).json({ message: 'You must accept the DPA to register' })
      const norm = String(email).toLowerCase().trim()
      const existing = await client.query('SELECT id FROM developers WHERE email = $1', [norm])
      if (existing.rows.length) { await client.end(); return res.status(409).json({ message: 'Email already registered' }) }
      const id = generateId('developer')
      const pw_hash = hashPassword(password)
      // Auto-grant superuser developer if email matches SUPERUSER_EMAILS
      const superuserEmails = (process.env.SUPERUSER_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
      const is_superuser_developer = superuserEmails.includes(norm)
      await client.query(
        `INSERT INTO developers (id, email, password_hash, company_name, country, vat_number, is_superuser_developer, dpa_accepted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
        [id, norm, pw_hash, company_name || null, country || null, vat_number || null, is_superuser_developer]
      )
      await client.end()
      const token = signDeveloperToken({ id, email: norm, is_superuser_developer })
      res.status(201).json({ token, developer: { id, email: norm, company_name, is_superuser_developer } })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Registration failed' })
    }
  })

  // ── POST /auth/login ────────────────────────────────────────────────────────
  router.post('/auth/login', async (req, res) => {
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const { email, password } = req.body || {}
      if (!email || !password) return res.status(400).json({ message: 'email and password are required' })
      const norm = String(email).toLowerCase().trim()
      const r = await client.query('SELECT id, email, password_hash, company_name, is_superuser_developer FROM developers WHERE email = $1', [norm])
      const dev = r.rows[0]
      await client.end()
      if (!dev || dev.password_hash !== hashPassword(password)) return res.status(401).json({ message: 'Invalid email or password' })
      const token = signDeveloperToken({ id: dev.id, email: dev.email, is_superuser_developer: dev.is_superuser_developer })
      res.json({ token, developer: { id: dev.id, email: dev.email, company_name: dev.company_name, is_superuser_developer: dev.is_superuser_developer } })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Login failed' })
    }
  })

  // ── GET /auth/me ────────────────────────────────────────────────────────────
  router.get('/auth/me', requireDevAuth, async (req, res) => {
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const r = await client.query('SELECT id, email, company_name, country, is_superuser_developer, created_at FROM developers WHERE id = $1', [req.developer.id])
      await client.end()
      if (!r.rows[0]) return res.status(404).json({ message: 'Developer not found' })
      res.json({ developer: r.rows[0] })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  // ── GET /apps ───────────────────────────────────────────────────────────────
  router.get('/apps', requireDevAuth, async (req, res) => {
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const r = await client.query(
        `SELECT a.id, a.handle, a.type, a.client_id, a.status, a.install_count, a.created_at,
                v.version, v.manifest
         FROM platform_apps a
         LEFT JOIN platform_app_versions v ON v.id = a.current_version_id
         WHERE a.developer_id = $1
         ORDER BY a.created_at DESC`,
        [req.developer.id]
      )
      await client.end()
      res.json({ apps: r.rows })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  // ── POST /apps ──────────────────────────────────────────────────────────────
  router.post('/apps', requireDevAuth, async (req, res) => {
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const body = req.body || {}
      const manifest = body.manifest || {}

      const errors = validateManifest({ ...manifest, developer_id: req.developer.id })
      if (errors.length) { await client.end(); return res.status(400).json({ message: errors[0], errors }) }

      const tierErr = validateTierTypeMatch(manifest, { is_superuser_developer: req.developer.is_superuser_developer })
      if (tierErr) { await client.end(); return res.status(403).json({ message: tierErr }) }

      const existing = await client.query('SELECT id FROM platform_apps WHERE handle = $1', [manifest.handle])
      if (existing.rows.length) { await client.end(); return res.status(409).json({ message: `Handle "${manifest.handle}" is already taken` }) }

      const appId = generateId('app')
      const clientId = generateId('app')
      const secret = generateSecret()
      const secretHash = hashSecret(secret)
      const versionId = generateId('version')

      await client.query(
        `INSERT INTO platform_apps (id, developer_id, handle, type, client_id, client_secret_hash, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [appId, req.developer.id, manifest.handle, manifest.type, clientId, secretHash, AUTO_APPROVE ? 'published' : 'draft']
      )
      await client.query(
        `INSERT INTO platform_app_versions (id, app_id, version, manifest, submitted_at, approved_at)
         VALUES ($1,$2,$3,$4,now(),$5)`,
        [versionId, appId, manifest.version, JSON.stringify(manifest), AUTO_APPROVE ? 'now()' : null]
      )
      await client.query('UPDATE platform_apps SET current_version_id = $1 WHERE id = $2', [versionId, appId])
      await client.end()

      res.status(201).json({
        app: { id: appId, handle: manifest.handle, type: manifest.type, client_id: clientId, status: AUTO_APPROVE ? 'published' : 'draft' },
        client_secret: secret,
        warning: 'Save client_secret now — it will not be shown again.',
      })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  // ── GET /apps/:id ───────────────────────────────────────────────────────────
  router.get('/apps/:id', requireDevAuth, async (req, res) => {
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const r = await client.query(
        `SELECT a.id, a.handle, a.type, a.client_id, a.status, a.install_count, a.created_at,
                v.id AS version_id, v.version, v.manifest
         FROM platform_apps a
         LEFT JOIN platform_app_versions v ON v.id = a.current_version_id
         WHERE a.id = $1 AND a.developer_id = $2`,
        [req.params.id, req.developer.id]
      )
      await client.end()
      if (!r.rows[0]) return res.status(404).json({ message: 'App not found' })
      res.json({ app: r.rows[0] })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  // ── PATCH /apps/:id ─────────────────────────────────────────────────────────
  router.patch('/apps/:id', requireDevAuth, async (req, res) => {
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const own = await client.query('SELECT id FROM platform_apps WHERE id = $1 AND developer_id = $2', [req.params.id, req.developer.id])
      if (!own.rows.length) { await client.end(); return res.status(404).json({ message: 'App not found' }) }
      const body = req.body || {}
      if (body.manifest) {
        const errors = validateManifest({ ...body.manifest, developer_id: req.developer.id })
        if (errors.length) { await client.end(); return res.status(400).json({ message: errors[0], errors }) }
        const tierErr = validateTierTypeMatch(body.manifest, { is_superuser_developer: req.developer.is_superuser_developer })
        if (tierErr) { await client.end(); return res.status(403).json({ message: tierErr }) }
        await client.query('UPDATE platform_app_versions SET manifest = $1 WHERE id = (SELECT current_version_id FROM platform_apps WHERE id = $2)', [JSON.stringify(body.manifest), req.params.id])
      }
      await client.query('UPDATE platform_apps SET updated_at = now() WHERE id = $1', [req.params.id])
      await client.end()
      res.json({ ok: true })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  // ── POST /apps/:id/rotate-secret ────────────────────────────────────────────
  router.post('/apps/:id/rotate-secret', requireDevAuth, async (req, res) => {
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const own = await client.query('SELECT id FROM platform_apps WHERE id = $1 AND developer_id = $2', [req.params.id, req.developer.id])
      if (!own.rows.length) { await client.end(); return res.status(404).json({ message: 'App not found' }) }
      const newSecret = generateSecret()
      await client.query('UPDATE platform_apps SET client_secret_hash = $1, updated_at = now() WHERE id = $2', [hashSecret(newSecret), req.params.id])
      await client.end()
      res.json({ client_secret: newSecret, warning: 'Save client_secret now — it will not be shown again. All existing tokens are invalidated.' })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  // ── POST /apps/:id/submit ────────────────────────────────────────────────────
  router.post('/apps/:id/submit', requireDevAuth, async (req, res) => {
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const r = await client.query('SELECT id, status FROM platform_apps WHERE id = $1 AND developer_id = $2', [req.params.id, req.developer.id])
      if (!r.rows[0]) { await client.end(); return res.status(404).json({ message: 'App not found' }) }
      const newStatus = AUTO_APPROVE ? 'published' : 'pending_review'
      await client.query('UPDATE platform_apps SET status = $1, updated_at = now() WHERE id = $2', [newStatus, req.params.id])
      await client.query('UPDATE platform_app_versions SET submitted_at = now() WHERE id = (SELECT current_version_id FROM platform_apps WHERE id = $1)', [req.params.id])
      if (AUTO_APPROVE) {
        await client.query('UPDATE platform_app_versions SET approved_at = now() WHERE id = (SELECT current_version_id FROM platform_apps WHERE id = $1)', [req.params.id])
      }
      await client.end()
      res.json({ status: newStatus })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  return router
}
