'use strict'
/**
 * OAuth 2.0 Authorization Code Flow
 * GET  /oauth/authorize      — seller consent screen
 * POST /oauth/token          — exchange code → tokens
 * POST /oauth/revoke         — revoke token
 */
const { Router } = require('express')
const { generateId } = require('../modules/app-platform/ids')
const { hashSecret, generateSecret, generateCode, timingSafeEqual } = require('../modules/app-platform/crypto')
const { getScopeDescription } = require('../modules/app-platform/scope-registry')
const { ACCESS_TTL, REFRESH_TTL, CODE_TTL } = require('../modules/app-platform/service')

function getDbClient() {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

module.exports = function createAppOAuthRouter({ verifySellerToken }) {
  const router = Router()

  // ── GET /oauth/authorize ─────────────────────────────────────────────────────
  // Seller must be authenticated (sc_token cookie or Authorization: Bearer)
  router.get('/authorize', async (req, res) => {
    const { client_id, redirect_uri, scope, state, response_type } = req.query

    if (response_type !== 'code') return res.status(400).send('response_type must be "code"')
    if (!client_id || !redirect_uri) return res.status(400).send('client_id and redirect_uri are required')

    // Verify seller JWT
    const scToken = req.cookies?.sc_token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null)
    const seller = verifySellerToken(scToken)
    if (!seller) {
      const returnUrl = encodeURIComponent(req.originalUrl)
      return res.redirect(`/admin-hub/auth/login?return=${returnUrl}`)
    }

    const client = getDbClient()
    if (!client) return res.status(503).send('Service unavailable')
    try {
      await client.connect()
      const appRow = await client.query(
        `SELECT a.id, a.handle, a.status, a.type, v.manifest
         FROM platform_apps a
         LEFT JOIN platform_app_versions v ON v.id = a.current_version_id
         WHERE a.client_id = $1`,
        [client_id]
      )
      const app = appRow.rows[0]
      await client.end()

      if (!app || app.status !== 'published') {
        return res.status(404).send('App not found or not published')
      }

      const manifest = typeof app.manifest === 'string' ? JSON.parse(app.manifest) : (app.manifest || {})
      const allowedRedirects = (manifest.oauth?.redirect_urls || [])
      if (!allowedRedirects.some(u => redirect_uri.startsWith(u))) {
        return res.status(400).send('redirect_uri not allowed for this app')
      }

      const requestedScopes = (scope || '').split(/[\s,]+/).filter(Boolean)
      const scopeDescriptions = requestedScopes.map(s => ({ key: s, label: getScopeDescription(s) }))
      const appName = typeof manifest.name === 'string' ? manifest.name : (manifest.name?.en || app.handle)

      // Simple HTML consent screen
      const formAction = `/oauth/authorize/confirm`
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize ${appName} — Andertal</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f6f7;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
    .card{background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.1);max-width:440px;width:100%;padding:32px}
    .logo{font-size:13px;font-weight:700;color:#6d7175;letter-spacing:.08em;text-transform:uppercase;margin-bottom:24px}
    h1{font-size:20px;font-weight:700;margin-bottom:8px;color:#202223}
    .sub{color:#6d7175;font-size:14px;margin-bottom:24px}
    .scopes{border:1px solid #e1e3e5;border-radius:8px;overflow:hidden;margin-bottom:24px}
    .scope-item{padding:12px 16px;font-size:14px;color:#202223;border-bottom:1px solid #e1e3e5;display:flex;align-items:center;gap:10px}
    .scope-item:last-child{border-bottom:none}
    .scope-item::before{content:"✓";color:#007a5a;font-weight:700;font-size:12px;flex-shrink:0}
    .actions{display:flex;gap:12px}
    .btn{flex:1;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;border:none;transition:opacity .15s}
    .btn-approve{background:#008060;color:#fff}
    .btn-approve:hover{opacity:.85}
    .btn-deny{background:#e4e5e7;color:#202223}
    .btn-deny:hover{background:#c9cccf}
    .seller{font-size:12px;color:#8c9196;margin-bottom:16px}
  </style>
</head>
<body>
<div class="card">
  <div class="logo">Andertal App Authorization</div>
  <h1>${appName}</h1>
  <p class="sub">wants access to your seller account</p>
  <p class="seller">Signed in as <strong>${seller.email || seller.id}</strong></p>
  <div class="scopes">
    ${scopeDescriptions.map(s => `<div class="scope-item">${s.label}</div>`).join('')}
  </div>
  <form method="POST" action="${formAction}">
    <input type="hidden" name="client_id" value="${client_id}">
    <input type="hidden" name="redirect_uri" value="${redirect_uri}">
    <input type="hidden" name="scope" value="${scope || ''}">
    <input type="hidden" name="state" value="${state || ''}">
    <input type="hidden" name="seller_id" value="${seller.seller_id || seller.id}">
    <input type="hidden" name="seller_token_id" value="${seller.id}">
    <div class="actions">
      <button type="submit" name="action" value="approve" class="btn btn-approve">Authorize</button>
      <button type="submit" name="action" value="deny" class="btn btn-deny">Cancel</button>
    </div>
  </form>
</div>
</body>
</html>`)
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).send('Internal error')
    }
  })

  // ── POST /oauth/authorize/confirm ──────────────────────────────────────────
  router.post('/authorize/confirm', async (req, res) => {
    const { client_id, redirect_uri, scope, state, seller_id, action } = req.body || {}
    if (action !== 'approve') {
      const deny = new URL(redirect_uri)
      deny.searchParams.set('error', 'access_denied')
      if (state) deny.searchParams.set('state', state)
      return res.redirect(deny.toString())
    }

    const client = getDbClient()
    if (!client) return res.status(503).send('Service unavailable')
    try {
      await client.connect()
      const appRow = await client.query('SELECT id FROM platform_apps WHERE client_id = $1 AND status = $2', [client_id, 'published'])
      if (!appRow.rows[0]) { await client.end(); return res.status(404).send('App not found') }
      const appId = appRow.rows[0].id

      const code = generateCode()
      const codeHash = hashSecret(code)
      const codeId = generateId('code')
      const requestedScopes = (scope || '').split(/[\s,]+/).filter(Boolean)
      const expiresAt = new Date(Date.now() + CODE_TTL * 1000)

      await client.query(
        `INSERT INTO platform_oauth_codes (id, code_hash, app_id, seller_id, scopes, redirect_uri, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [codeId, codeHash, appId, seller_id, requestedScopes, redirect_uri, expiresAt]
      )
      await client.end()

      const callbackUrl = new URL(redirect_uri)
      callbackUrl.searchParams.set('code', code)
      if (state) callbackUrl.searchParams.set('state', state)
      res.redirect(callbackUrl.toString())
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).send('Internal error')
    }
  })

  // ── POST /oauth/token ────────────────────────────────────────────────────────
  router.post('/token', async (req, res) => {
    const body = req.body || {}
    const grantType = body.grant_type
    const client = getDbClient()
    if (!client) return res.status(503).json({ error: 'server_error' })
    try {
      await client.connect()

      if (grantType === 'authorization_code') {
        const { code, client_id, client_secret, redirect_uri } = body
        if (!code || !client_id || !client_secret) {
          await client.end()
          return res.status(400).json({ error: 'invalid_request', error_description: 'code, client_id, client_secret are required' })
        }

        const appRow = await client.query('SELECT id, client_secret_hash FROM platform_apps WHERE client_id = $1', [client_id])
        const app = appRow.rows[0]
        if (!app || !timingSafeEqual(hashSecret(client_secret), app.client_secret_hash)) {
          await client.end()
          return res.status(401).json({ error: 'invalid_client' })
        }

        const codeHash = hashSecret(code)
        const codeRow = await client.query(
          `SELECT id, seller_id, scopes, app_id, redirect_uri, expires_at, used_at
           FROM platform_oauth_codes WHERE code_hash = $1`,
          [codeHash]
        )
        const codeRecord = codeRow.rows[0]
        if (!codeRecord || codeRecord.used_at || codeRecord.app_id !== app.id || codeRecord.redirect_uri !== redirect_uri || new Date(codeRecord.expires_at) < new Date()) {
          await client.end()
          return res.status(400).json({ error: 'invalid_grant' })
        }

        await client.query('UPDATE platform_oauth_codes SET used_at = now() WHERE id = $1', [codeRecord.id])

        // Upsert installation
        const instId = generateId('installation')
        const instRow = await client.query(
          `INSERT INTO platform_app_installations (id, app_id, seller_id, scopes, version_id)
           VALUES ($1,$2,$3,$4,(SELECT current_version_id FROM platform_apps WHERE id = $2))
           ON CONFLICT (app_id, seller_id) DO UPDATE SET scopes = EXCLUDED.scopes, uninstalled_at = NULL
           RETURNING id`,
          [instId, app.id, codeRecord.seller_id, codeRecord.scopes]
        )
        const installationId = instRow.rows[0].id
        await client.query('UPDATE platform_apps SET install_count = (SELECT COUNT(*) FROM platform_app_installations WHERE app_id = $1 AND uninstalled_at IS NULL) WHERE id = $1', [app.id])

        const accessToken = generateSecret()
        const refreshToken = generateSecret()
        const tokenId = generateId('token')
        const expiresAt = new Date(Date.now() + ACCESS_TTL * 1000)

        await client.query(
          `INSERT INTO platform_app_tokens (id, installation_id, access_token_hash, refresh_token_hash, scopes, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [tokenId, installationId, hashSecret(accessToken), hashSecret(refreshToken), codeRecord.scopes, expiresAt]
        )
        await client.end()

        return res.json({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: ACCESS_TTL,
          refresh_token: refreshToken,
          scope: codeRecord.scopes.join(' '),
        })
      }

      if (grantType === 'refresh_token') {
        const { refresh_token, client_id, client_secret } = body
        if (!refresh_token || !client_id || !client_secret) {
          await client.end()
          return res.status(400).json({ error: 'invalid_request' })
        }
        const appRow = await client.query('SELECT id, client_secret_hash FROM platform_apps WHERE client_id = $1', [client_id])
        const app = appRow.rows[0]
        if (!app || !timingSafeEqual(hashSecret(client_secret), app.client_secret_hash)) {
          await client.end()
          return res.status(401).json({ error: 'invalid_client' })
        }
        const oldRow = await client.query(
          `SELECT t.id, t.installation_id, t.scopes, t.revoked_at, t.expires_at
           FROM platform_app_tokens t
           JOIN platform_app_installations i ON i.id = t.installation_id
           WHERE t.refresh_token_hash = $1 AND i.app_id = $2`,
          [hashSecret(refresh_token), app.id]
        )
        const old = oldRow.rows[0]
        if (!old || old.revoked_at) { await client.end(); return res.status(400).json({ error: 'invalid_grant' }) }

        // Rotate: revoke old, issue new
        await client.query('UPDATE platform_app_tokens SET revoked_at = now() WHERE id = $1', [old.id])
        const newAccess = generateSecret()
        const newRefresh = generateSecret()
        const newId = generateId('token')
        const newExpires = new Date(Date.now() + ACCESS_TTL * 1000)
        await client.query(
          `INSERT INTO platform_app_tokens (id, installation_id, access_token_hash, refresh_token_hash, scopes, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [newId, old.installation_id, hashSecret(newAccess), hashSecret(newRefresh), old.scopes, newExpires]
        )
        await client.end()
        return res.json({ access_token: newAccess, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token: newRefresh, scope: old.scopes.join(' ') })
      }

      await client.end()
      res.status(400).json({ error: 'unsupported_grant_type' })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ error: 'server_error', error_description: e?.message })
    }
  })

  // ── POST /oauth/revoke ───────────────────────────────────────────────────────
  router.post('/revoke', async (req, res) => {
    const { token, client_id, client_secret } = req.body || {}
    if (!token || !client_id || !client_secret) return res.status(400).json({ error: 'invalid_request' })
    const client = getDbClient()
    if (!client) return res.status(503).json({ error: 'server_error' })
    try {
      await client.connect()
      const appRow = await client.query('SELECT id, client_secret_hash FROM platform_apps WHERE client_id = $1', [client_id])
      const app = appRow.rows[0]
      if (!app || !timingSafeEqual(hashSecret(client_secret), app.client_secret_hash)) {
        await client.end()
        return res.status(401).json({ error: 'invalid_client' })
      }
      const h = hashSecret(token)
      await client.query('UPDATE platform_app_tokens SET revoked_at = now() WHERE (access_token_hash = $1 OR refresh_token_hash = $1) AND revoked_at IS NULL', [h])
      await client.end()
      res.json({ ok: true })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ error: 'server_error' })
    }
  })

  return router
}
