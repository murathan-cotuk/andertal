'use strict'
/**
 * App Store API — /admin-hub/v1/app-store/
 * Auth: requireSellerAuth (existing seller JWT)
 */
const { Router } = require('express')
const { generateId } = require('../modules/app-platform/ids')

function getDbClient() {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

function parseManifest(raw) {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return {} }
  }
  return typeof raw === 'object' ? raw : {}
}

function parseSettings(raw) {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return {} }
  }
  return typeof raw === 'object' ? raw : {}
}

function connectUrls(app, manifest) {
  const scopes = Array.isArray(manifest.scopes) ? manifest.scopes : []
  const redirectUri = (manifest.oauth?.redirect_urls || [])[0] || ''
  const configureUrl = manifest.configure_url || manifest.homepage_url || redirectUri || ''
  let authorizeUrl = null
  if (redirectUri && app.client_id) {
    const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || process.env.BACKEND_URL || 'https://api.andertal.com'
    authorizeUrl = `${backendUrl.replace(/\/$/, '')}/oauth/authorize?client_id=${encodeURIComponent(app.client_id)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes.join(' '))}&response_type=code`
  }
  return { authorize_url: authorizeUrl, configure_url: configureUrl || null }
}

function isConnected(hasToken, settings) {
  return !!hasToken || settings?.connected === true
}

async function chargePaidApp(client, { sellerId, amountEur, appName }) {
  const amountCents = Math.round(Number(amountEur) * 100)
  if (!(amountCents > 0)) return { charged: false }
  const secretKey = (process.env.STRIPE_SECRET_KEY || '').toString().trim()
  if (!secretKey) return { charged: false, skipped: true }
  const cardR = await client.query(
    `SELECT stripe_customer_id, stripe_payment_method_id FROM seller_users
     WHERE seller_id = $1 AND COALESCE(stripe_payment_method_id, '') <> ''
     ORDER BY created_at ASC LIMIT 1`,
    [sellerId]
  )
  const customerId = cardR.rows[0]?.stripe_customer_id
  const paymentMethodId = cardR.rows[0]?.stripe_payment_method_id
  if (!customerId || !paymentMethodId) {
    const err = new Error('A credit card is required to install paid apps.')
    err.statusCode = 402
    err.needs_card = true
    throw err
  }
  const stripe = new (require('stripe'))(secretKey)
  const pi = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'eur',
    customer: customerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
    description: `Andertal App Store — ${appName || 'app'} (monthly)`,
  })
  return { charged: true, stripe_payment_intent_id: pi.id }
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
      const sellerId = req.sellerUser?.seller_id || null
      const params = []
      const conditions = ["a.status = 'published'"]
      if (q) {
        params.push(q)
        conditions.push(`(v.manifest->>'name' ILIKE $${params.length} OR a.handle ILIKE $${params.length} OR COALESCE(v.manifest->>'description','') ILIKE $${params.length} OR COALESCE(d.company_name,'') ILIKE $${params.length})`)
      }
      if (category && category !== 'all') { params.push(category); conditions.push(`v.manifest->>'category' = $${params.length}`) }
      let sellerJoin = 'LEFT JOIN platform_app_installations inst ON FALSE'
      if (sellerId) {
        params.push(sellerId)
        sellerJoin = `LEFT JOIN platform_app_installations inst ON inst.app_id = a.id AND inst.seller_id = $${params.length} AND inst.uninstalled_at IS NULL`
      }
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
      const r = await client.query(
        `SELECT a.id, a.handle, a.type, a.client_id, a.install_count, a.status,
                v.manifest, v.version, d.company_name AS developer_name,
                (inst.id IS NOT NULL) AS installed
         FROM platform_apps a
         LEFT JOIN platform_app_versions v ON v.id = a.current_version_id
         LEFT JOIN developers d ON d.id = a.developer_id
         ${sellerJoin}
         ${where}
         ORDER BY a.install_count DESC, a.created_at DESC
         LIMIT 100`,
        params
      )
      await client.end()
      res.json({
        apps: r.rows.map((row) => ({
          ...row,
          installed: !!row.installed,
          manifest: parseManifest(row.manifest),
        })),
      })
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
      const sellerId = req.sellerUser?.seller_id || null
      const r = await client.query(
        `SELECT a.id, a.handle, a.type, a.client_id, a.install_count, a.status,
                v.manifest, v.version, d.company_name AS developer_name,
                CASE WHEN $2::text IS NULL THEN FALSE ELSE EXISTS (
                  SELECT 1 FROM platform_app_installations inst
                  WHERE inst.app_id = a.id AND inst.seller_id = $2 AND inst.uninstalled_at IS NULL
                ) END AS installed
         FROM platform_apps a
         LEFT JOIN platform_app_versions v ON v.id = a.current_version_id
         LEFT JOIN developers d ON d.id = a.developer_id
         WHERE a.handle = $1 AND a.status = 'published'`,
        [req.params.handle, sellerId]
      )
      await client.end()
      if (!r.rows[0]) return res.status(404).json({ message: 'App not found' })
      const row = r.rows[0]
      res.json({
        app: {
          ...row,
          installed: !!row.installed,
          manifest: parseManifest(row.manifest),
        },
      })
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
                a.handle, a.type, a.client_id, v.manifest, d.company_name AS developer_name,
                EXISTS (
                  SELECT 1 FROM platform_app_tokens t
                  WHERE t.installation_id = i.id AND t.revoked_at IS NULL
                ) AS has_token
         FROM platform_app_installations i
         JOIN platform_apps a ON a.id = i.app_id
         LEFT JOIN platform_app_versions v ON v.id = a.current_version_id
         LEFT JOIN developers d ON d.id = a.developer_id
         WHERE i.seller_id = $1 AND i.uninstalled_at IS NULL
         ORDER BY i.installed_at DESC`,
        [sellerId]
      )
      await client.end()
      const installations = r.rows.map((row) => {
        const manifest = parseManifest(row.manifest)
        const settings = parseSettings(row.settings)
        const urls = connectUrls(row, manifest)
        return {
          ...row,
          manifest,
          settings,
          connected: isConnected(row.has_token, settings),
          api_key: settings.api_key || row.client_id || null,
          authorize_url: urls.authorize_url,
          configure_url: urls.configure_url,
        }
      })
      res.json({ installations })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  // ── POST /apps/:handle/install — add app for this seller ─────────────────────
  router.post('/apps/:handle/install', async (req, res) => {
    const sellerId = req.sellerUser?.seller_id
    if (!sellerId) return res.status(401).json({ message: 'Seller auth required' })
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const r = await client.query(
        `SELECT a.id, a.client_id, a.status, v.manifest, v.id AS version_id
         FROM platform_apps a
         LEFT JOIN platform_app_versions v ON v.id = a.current_version_id
         WHERE a.handle = $1`,
        [req.params.handle]
      )
      const app = r.rows[0]
      if (!app || app.status !== 'published') {
        await client.end()
        return res.status(404).json({ message: 'App not found' })
      }
      const manifest = parseManifest(app.manifest)
      const pricing = manifest.pricing && typeof manifest.pricing === 'object' ? manifest.pricing : { model: 'free' }
      const isPaid = !!(pricing.model && pricing.model !== 'free')
      const existing = await client.query(
        `SELECT id, uninstalled_at, settings FROM platform_app_installations WHERE app_id = $1 AND seller_id = $2`,
        [app.id, sellerId]
      )
      const alreadyActive = existing.rows[0] && !existing.rows[0].uninstalled_at
      if (alreadyActive) {
        const urls = connectUrls(app, manifest)
        await client.end()
        return res.json({
          ok: true,
          already_installed: true,
          installation_id: existing.rows[0].id,
          authorize_url: urls.authorize_url,
          configure_url: urls.configure_url,
          paid: isPaid,
        })
      }

      if (isPaid) {
        const cardR = await client.query(
          `SELECT stripe_payment_method_id FROM seller_users
           WHERE seller_id = $1 AND COALESCE(stripe_payment_method_id, '') <> ''
           LIMIT 1`,
          [sellerId]
        )
        if (!cardR.rows[0]) {
          await client.end()
          return res.status(402).json({
            needs_card: true,
            message: 'A credit card is required to install paid apps.',
          })
        }
        try {
          await chargePaidApp(client, {
            sellerId,
            amountEur: pricing.amount_eur,
            appName: manifest.name || req.params.handle,
          })
        } catch (chargeErr) {
          await client.end()
          const status = chargeErr.statusCode || 402
          return res.status(status).json({
            needs_card: !!chargeErr.needs_card || status === 402,
            message: chargeErr.message || 'Payment failed.',
          })
        }
      }

      const scopes = Array.isArray(manifest.scopes) ? manifest.scopes : []
      const nextCharge = new Date()
      nextCharge.setUTCMonth(nextCharge.getUTCMonth() + 1)
      const settings = {
        billing: isPaid
          ? {
              model: pricing.model,
              amount_eur: pricing.amount_eur,
              status: 'active',
              next_charge_at: nextCharge.toISOString(),
            }
          : { model: 'free' },
        connected: false,
      }
      let installationId
      if (existing.rows[0]) {
        installationId = existing.rows[0].id
        await client.query(
          `UPDATE platform_app_installations
           SET uninstalled_at = NULL, installed_at = now(), scopes = $1, version_id = $2, settings = $3
           WHERE id = $4`,
          [scopes, app.version_id || null, JSON.stringify(settings), installationId]
        )
      } else {
        installationId = generateId('installation')
        await client.query(
          `INSERT INTO platform_app_installations (id, app_id, seller_id, scopes, version_id, settings)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [installationId, app.id, sellerId, scopes, app.version_id || null, JSON.stringify(settings)]
        )
      }
      await client.query(
        `UPDATE platform_apps SET install_count = (SELECT COUNT(*) FROM platform_app_installations WHERE app_id = $1 AND uninstalled_at IS NULL) WHERE id = $1`,
        [app.id]
      )

      const urls = connectUrls(app, manifest)
      await client.end()
      res.json({
        ok: true,
        installation_id: installationId,
        authorize_url: urls.authorize_url,
        configure_url: urls.configure_url,
        paid: isPaid,
      })
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
      const existing = await client.query(
        'SELECT settings FROM platform_app_installations WHERE id = $1 AND seller_id = $2 AND uninstalled_at IS NULL',
        [req.params.id, sellerId]
      )
      if (!existing.rows[0]) {
        await client.end()
        return res.status(404).json({ message: 'Installation not found' })
      }
      const prev = parseSettings(existing.rows[0].settings)
      const patch = req.body && typeof req.body === 'object' ? req.body : {}
      const merged = { ...prev, ...patch }
      if (patch.api_key || patch.api_secret || patch.api_url || patch.connected === true) {
        merged.connected = true
      }
      if (patch.api_secret) merged.has_secret = true
      const secretEcho = patch.api_secret ? String(patch.api_secret) : null
      delete merged.api_secret
      const r = await client.query(
        `UPDATE platform_app_installations SET settings = $1 WHERE id = $2 AND seller_id = $3 AND uninstalled_at IS NULL RETURNING id, settings`,
        [JSON.stringify(merged), req.params.id, sellerId]
      )
      await client.end()
      if (!r.rows[0]) return res.status(404).json({ message: 'Installation not found' })
      res.json({ ok: true, settings: r.rows[0].settings, api_secret: secretEcho })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  return router
}
