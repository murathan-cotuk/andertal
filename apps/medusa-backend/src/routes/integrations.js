'use strict'
const { Router } = require('express')

/** Row key in admin_hub_seller_settings for Billbee: real seller_id, or billbee_user_<seller_users.id> if missing. Never "default". */
function getBillbeeAdminHubSellerSettingsKey(userPayload) {
  if (!userPayload || typeof userPayload !== 'object') return null
  const sid = userPayload.seller_id != null ? String(userPayload.seller_id).trim() : ''
  if (sid) return sid
  const uid = userPayload.id != null ? String(userPayload.id).trim() : ''
  if (uid) return `billbee_user_${uid}`
  return null
}

const getBillbeePublicBaseUrl = () =>
  (process.env.PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || '').replace(/\/$/, '') ||
  'https://api.andertal.com'

const publicAndertalBillbeeApiBase = () =>
  (process.env.PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || '').replace(/\/$/, '') ||
  'https://api.andertal.com'

const getBillbeeAuthFromReq = (req) => {
  // Billbee fields:
  // - "Schlüssel" -> API key (we accept X-Billbee-Api-Key header)
  // - Basic Auth Benutzername/Passwort -> HTTP Basic auth
  const apiKey =
    String(req.headers['x-billbee-api-key'] || req.headers['x-billbee-apikey'] || req.query?.api_key || '').trim()
  const authHeader = String(req.headers.authorization || '')
  if (!authHeader.startsWith('Basic ')) {
    return { apiKey, username: '', password: '', basicOk: false }
  }
  try {
    const raw = Buffer.from(authHeader.slice('Basic '.length), 'base64').toString('utf8')
    const idx = raw.indexOf(':')
    const username = idx >= 0 ? raw.slice(0, idx) : raw
    const password = idx >= 0 ? raw.slice(idx + 1) : ''
    return { apiKey, username: String(username).trim(), password: String(password), basicOk: true }
  } catch {
    return { apiKey, username: '', password: '', basicOk: false }
  }
}

module.exports = function createIntegrationsRouter({ verifySellerToken, requireSuperuser, getSellerDbClient }) {
  const adminHubIntegrationsGET = async (req, res) => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    const auth = req.headers['authorization'] || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    const payload = token ? verifySellerToken(token) : null
    const scope = payload ? getBillbeeAdminHubSellerSettingsKey(payload) : null
    if (!scope) return res.json({ integrations: [] })
    let client
    try {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      const r = await client.query(
        `SELECT id, name, slug, logo_url, api_key, is_active, category, created_at, updated_at
         FROM store_integrations
         WHERE seller_scope_key = $1
         ORDER BY name ASC`,
        [scope],
      )
      await client.end()
      res.json({ integrations: r.rows || [] })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      res.json({ integrations: [] })
    }
  }

  const adminHubIntegrationPOST = async (req, res) => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    const settingsKey = getBillbeeAdminHubSellerSettingsKey(req.sellerUser)
    if (!settingsKey) return res.status(401).json({ message: 'Invalid session' })
    const _c = require('crypto')
    let client
    try {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      const { name, logo_url, webhook_url, config, is_active = true, category = 'custom' } = req.body || {}
      if (!name || !String(name).trim()) return res.status(400).json({ message: 'name required' })
      const genSlug = `int_${_c.randomBytes(16).toString('hex')}`
      const genKey = `andertal_zug_${_c.randomBytes(12).toString('hex')}`
      const genSec = `andertal_ssk_${_c.randomBytes(18).toString('hex')}`
      const r = await client.query(
        `INSERT INTO store_integrations (name, slug, logo_url, api_key, api_secret, webhook_url, config, is_active, category, seller_scope_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
         RETURNING id, name, slug, logo_url, api_key, api_secret, is_active, category, created_at, updated_at`,
        [
          String(name).trim(),
          genSlug,
          logo_url || null,
          genKey,
          genSec,
          webhook_url || null,
          config ? JSON.stringify(config) : '{}',
          is_active !== false,
          category || 'custom',
          settingsKey,
        ],
      )
      const integration = r.rows && r.rows[0] ? r.rows[0] : null

      await client.end()
      res.json({ integration })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  }

  const adminHubIntegrationPATCH = async (req, res) => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    const settingsKey = getBillbeeAdminHubSellerSettingsKey(req.sellerUser)
    if (!settingsKey) return res.status(401).json({ message: 'Invalid session' })
    const id = (req.params.id || '').trim()
    const _c = require('crypto')
    let client
    try {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      const slugRow = await client.query(
        'SELECT slug, seller_scope_key FROM store_integrations WHERE id = $1::uuid',
        [id],
      )
      if (!slugRow.rows[0]) { await client.end(); return res.status(404).json({ message: 'Not found' }) }
      const rowSlug = slugRow.rows[0]
      const isBillbee = String(rowSlug.slug || '').toLowerCase() === 'billbee'
      if (!isBillbee && rowSlug.seller_scope_key !== settingsKey) {
        await client.end()
        return res.status(403).json({ message: 'Forbidden' })
      }
      const body = { ...(req.body || {}) }
      if (body.regenerate_secret === true || body.regenerate_secret === 'true') {
        const newSec = `andertal_ssk_${_c.randomBytes(18).toString('hex')}`
        const ur = await client.query(
          `UPDATE store_integrations SET api_secret = $2, updated_at = NOW() WHERE id = $1::uuid RETURNING id, name, slug, logo_url, api_key, api_secret, is_active, category, created_at, updated_at`,
          [id, newSec],
        )
        await client.end()
        if (!ur.rows[0]) return res.status(404).json({ message: 'Not found' })
        return res.json({ integration: ur.rows[0] })
      }
      if (isBillbee) {
        delete body.api_key
        delete body.api_secret
        delete body.webhook_url
      } else {
        delete body.api_key
        delete body.api_secret
      }
      delete body.regenerate_secret
      const allowed = ['name','logo_url','api_key','api_secret','webhook_url','config','is_active','category']
      const sets = []; const vals = []
      for (const key of allowed) { if (key in body) { vals.push(key === 'config' ? JSON.stringify(body[key]) : body[key]); sets.push(`${key} = $${vals.length}`) } }
      if (sets.length === 0) { await client.end(); return res.status(400).json({ message: 'no fields to update' }) }
      vals.push(id)
      const r = await client.query(
        `UPDATE store_integrations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}::uuid RETURNING id, name, slug, logo_url, is_active, category, updated_at`, vals
      )
      if (!r.rows[0]) { await client.end(); return res.status(404).json({ message: 'Not found' }) }
      const integration = r.rows[0]

      if (integration?.slug && String(integration.slug).toLowerCase() === 'billbee') {
        const cfg = body.config && typeof body.config === 'object' ? body.config : {}
        const basicUsername = cfg.basic_auth_username || cfg.username || ''
        const basicPassword = cfg.basic_auth_password || cfg.password || ''
        const billbeeApiKey = (req.body || {}).api_key || ''
        const billbeeConnName = (cfg.connection_name != null ? String(cfg.connection_name) : '').trim().slice(0, 200)

        if (billbeeApiKey && basicUsername && basicPassword) {
          await client.query(
            `INSERT INTO admin_hub_seller_settings (seller_id, billbee_api_key, billbee_basic_username, billbee_basic_password, billbee_connection_name, billbee_updated_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, now(), now())
             ON CONFLICT (seller_id) DO UPDATE SET
               billbee_api_key = EXCLUDED.billbee_api_key,
               billbee_basic_username = EXCLUDED.billbee_basic_username,
               billbee_basic_password = EXCLUDED.billbee_basic_password,
               billbee_connection_name = COALESCE(NULLIF(EXCLUDED.billbee_connection_name, ''), admin_hub_seller_settings.billbee_connection_name),
               billbee_updated_at = now(),
               updated_at = now()`,
            [settingsKey, billbeeApiKey, basicUsername, basicPassword, billbeeConnName || null],
          )
        } else if (billbeeConnName) {
          await client.query(
            `INSERT INTO admin_hub_seller_settings (seller_id, billbee_connection_name, updated_at)
             VALUES ($1, $2, now())
             ON CONFLICT (seller_id) DO UPDATE SET
               billbee_connection_name = EXCLUDED.billbee_connection_name,
               updated_at = now()`,
            [settingsKey, billbeeConnName],
          )
        }
      }

      await client.end()
      res.json({ integration })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  }

  const adminHubIntegrationDELETE = async (req, res) => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    const settingsKey = getBillbeeAdminHubSellerSettingsKey(req.sellerUser)
    if (!settingsKey) return res.status(401).json({ message: 'Invalid session' })
    const id = (req.params.id || '').trim()
    let client
    try {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      const slugRow = await client.query(
        'SELECT slug, seller_scope_key FROM store_integrations WHERE id = $1::uuid',
        [id],
      )
      if (!slugRow.rows[0]) { await client.end(); return res.status(404).json({ message: 'Not found' }) }
      const isBillbee = String(slugRow.rows[0].slug || '').toLowerCase() === 'billbee'
      if (!isBillbee && slugRow.rows[0].seller_scope_key !== settingsKey) {
        await client.end()
        return res.status(403).json({ message: 'Forbidden' })
      }
      if (isBillbee) {
        await client.query(
          `UPDATE admin_hub_seller_settings SET
             billbee_api_key = NULL,
             billbee_basic_username = NULL,
             billbee_basic_password = NULL,
             billbee_connection_name = NULL,
             billbee_updated_at = NULL,
             updated_at = now()
           WHERE seller_id = $1`,
          [settingsKey],
        )
        await client.end()
        return res.json({ success: true })
      }
      await client.query('DELETE FROM store_integrations WHERE id = $1::uuid', [id])
      await client.end()
      res.json({ success: true })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  }

  /** Shop TrustBox: slug `trustpilot`, api_key = Business Unit ID (public in embeds). Superuser only. */
  const TRUSTPILOT_PLATFORM_SCOPE = 'platform'

  const adminHubTrustpilotGET = async (req, res) => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    let client
    try {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      const r = await client.query(
        `SELECT api_key, config, is_active FROM store_integrations WHERE LOWER(TRIM(slug)) = 'trustpilot' LIMIT 1`,
      )
      await client.end()
      const row = r.rows[0]
      if (!row) {
        return res.json({ configured: false, business_unit_id: '', template_id: '', evaluate_url: '', is_active: false })
      }
      let cfg = {}
      try {
        const c = row.config
        cfg = typeof c === 'string' ? JSON.parse(c) : (c && typeof c === 'object' ? c : {})
      } catch (_) {}
      const tid = (cfg.template_id || cfg.templateId || '').toString().trim()
      const evaluateUrl = (cfg.evaluate_url || cfg.evaluateUrl || '').toString().trim()
      res.json({
        configured: true,
        business_unit_id: row.api_key ? String(row.api_key).trim() : '',
        template_id: tid,
        evaluate_url: evaluateUrl,
        is_active: row.is_active !== false,
      })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  }

  const adminHubTrustpilotPUT = async (req, res) => {
    const body = req.body || {}
    const bu = String(body.business_unit_id ?? body.businessUnitId ?? '').trim()
    const is_active = body.is_active !== false && body.is_active !== 'false'
    if (!bu) return res.status(400).json({ message: 'business_unit_id required' })
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    let client
    try {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      const prev = await client.query(
        `SELECT config FROM store_integrations WHERE LOWER(TRIM(slug)) = 'trustpilot' LIMIT 1`,
      )
      let cfg = {}
      try {
        const c = prev.rows[0] && prev.rows[0].config
        cfg = typeof c === 'string' ? JSON.parse(c) : c && typeof c === 'object' ? { ...c } : {}
      } catch (_) {
        cfg = {}
      }
      if (Object.prototype.hasOwnProperty.call(body, 'template_id') || Object.prototype.hasOwnProperty.call(body, 'templateId')) {
        const templateRaw = body.template_id ?? body.templateId
        const t = templateRaw != null ? String(templateRaw).trim() : ''
        if (t) cfg.template_id = t
        else delete cfg.template_id
      }
      if (Object.prototype.hasOwnProperty.call(body, 'evaluate_url') || Object.prototype.hasOwnProperty.call(body, 'evaluateUrl')) {
        const evaluateRaw = body.evaluate_url ?? body.evaluateUrl
        const u = evaluateRaw != null ? String(evaluateRaw).trim() : ''
        if (u) {
          const ok = /^https:\/\//i.test(u)
          if (!ok) {
            await client.end()
            return res.status(400).json({ message: 'evaluate_url must be an https URL' })
          }
          cfg.evaluate_url = u
        } else delete cfg.evaluate_url
      }
      const configJson = JSON.stringify(cfg)
      const r = await client.query(
        `INSERT INTO store_integrations (name, slug, logo_url, api_key, api_secret, webhook_url, config, is_active, category, seller_scope_key)
         VALUES ('Trustpilot', 'trustpilot', NULL, $1, NULL, NULL, $2::jsonb, $3, 'reviews', $4)
         ON CONFLICT (slug) DO UPDATE SET
           api_key = EXCLUDED.api_key,
           config = EXCLUDED.config,
           is_active = EXCLUDED.is_active,
           updated_at = NOW()
         RETURNING id, name, slug, is_active, updated_at`,
        [bu, configJson, is_active, TRUSTPILOT_PLATFORM_SCOPE],
      )
      await client.end()
      res.json({ success: true, integration: r.rows[0] })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  }

  const ensureSellerBillbeeCredentials = async (client, sellerId, forceRegenerate = false) => {
    const existing = await client.query(
      'SELECT billbee_api_key, billbee_basic_username, billbee_basic_password FROM admin_hub_seller_settings WHERE seller_id = $1 LIMIT 1',
      [sellerId],
    )
    const row = existing.rows && existing.rows[0]
    const hasAll = row && row.billbee_api_key && row.billbee_basic_username && row.billbee_basic_password
    if (hasAll && !forceRegenerate) {
      return {
        api_key: String(row.billbee_api_key),
        basic_auth_username: String(row.billbee_basic_username),
        basic_auth_password: String(row.billbee_basic_password),
      }
    }
    // We cannot invent Billbee credentials. They must come from the Billbee integration UI.
    // If credentials are missing, return empty values so the user can enter them manually.
    if (!hasAll) {
      if (forceRegenerate) {
        throw new Error('Billbee credentials are missing. Please enter the credentials from Billbee (Schlüssel + Basic Auth username/password) and save.');
      }
      return { api_key: '', basic_auth_username: '', basic_auth_password: '' }
    }

    // If only regenerate was requested but we already have values, keep them.
    if (hasAll && forceRegenerate) {
      return {
        api_key: String(row.billbee_api_key),
        basic_auth_username: String(row.billbee_basic_username),
        basic_auth_password: String(row.billbee_basic_password),
      }
    }
  }

  const adminHubBillbeeCredentialsGET = async (req, res) => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    const settingsKey = getBillbeeAdminHubSellerSettingsKey(req.sellerUser)
    if (!settingsKey) return res.status(401).json({ message: 'Invalid session' })
    let client
    try {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      const r = await client.query(
        `SELECT billbee_api_key, billbee_basic_username, billbee_basic_password, store_name, billbee_connection_name
         FROM admin_hub_seller_settings WHERE seller_id = $1 LIMIT 1`,
        [settingsKey],
      )
      const row = r.rows && r.rows[0]
      await client.end()
      const creds =
        row && row.billbee_api_key && row.billbee_basic_username && row.billbee_basic_password
          ? {
              api_key: String(row.billbee_api_key),
              basic_auth_username: String(row.billbee_basic_username),
              basic_auth_password: String(row.billbee_basic_password),
            }
          : { api_key: '', basic_auth_username: '', basic_auth_password: '' }
      const store_name = row && row.store_name != null ? String(row.store_name).trim() : ''
      const connection_name = row && row.billbee_connection_name != null ? String(row.billbee_connection_name).trim() : ''
      const name_for_billbee = connection_name || store_name || 'Andertal'
      const base = getBillbeePublicBaseUrl()
      const webhook_url = `${base}/admin-hub/v1/integrations/billbee/webhook`
      const has_credentials = !!(creds.api_key && creds.basic_auth_username && creds.basic_auth_password)
      return res.json({
        credentials: creds,
        seller_id: settingsKey,
        generated: has_credentials,
        webhook_url,
        connection_name,
        name_for_billbee,
        store_name,
      })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      return res.status(500).json({ message: e?.message || 'Billbee credentials unavailable' })
    }
  }

  const adminHubBillbeeCredentialsPATCH = async (req, res) => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    const settingsKey = getBillbeeAdminHubSellerSettingsKey(req.sellerUser)
    if (!settingsKey) return res.status(401).json({ message: 'Invalid session' })
    const body = req.body || {}
    let client
    try {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      const r = await client.query(
        `SELECT billbee_api_key, billbee_basic_username, billbee_basic_password, store_name, billbee_connection_name
         FROM admin_hub_seller_settings WHERE seller_id = $1 LIMIT 1`,
        [settingsKey],
      )
      const row = r.rows && r.rows[0] ? r.rows[0] : {}
      let api = row.billbee_api_key != null ? String(row.billbee_api_key).trim() : ''
      let user = row.billbee_basic_username != null ? String(row.billbee_basic_username).trim() : ''
      let pass = row.billbee_basic_password != null ? String(row.billbee_basic_password) : ''
      let conn = row.billbee_connection_name != null ? String(row.billbee_connection_name).trim() : ''

      if ('api_key' in body) api = String(body.api_key ?? '').trim()
      if ('basic_auth_username' in body) user = String(body.basic_auth_username ?? '').trim()
      if ('basic_auth_password' in body && String(body.basic_auth_password ?? '').length > 0) {
        pass = String(body.basic_auth_password)
      }
      if ('connection_name' in body) conn = String(body.connection_name ?? '').trim().slice(0, 200)

      const credPresentInBody =
        'api_key' in body ||
        'basic_auth_username' in body ||
        ('basic_auth_password' in body && String(body.basic_auth_password ?? '').length > 0)
      if (credPresentInBody && (!api || !user || !pass)) {
        await client.end()
        return res.status(400).json({
          message:
            'Schlüssel, Basic-Auth Benutzername und Basic-Auth Passwort sind vollständig erforderlich, sobald du eines dieser Felder mitsendest.',
        })
      }

      const billbeeUpdatedAt =
        api && user && pass ? new Date() : null
      await client.query(
        `INSERT INTO admin_hub_seller_settings (
           seller_id, billbee_api_key, billbee_basic_username, billbee_basic_password, billbee_connection_name, billbee_updated_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (seller_id) DO UPDATE SET
           billbee_api_key = $2::text,
           billbee_basic_username = $3::text,
           billbee_basic_password = $4::text,
           billbee_connection_name = NULLIF($5::text, ''),
           billbee_updated_at = CASE
             WHEN $2::text <> '' AND $3::text <> '' AND $4::text <> '' THEN COALESCE($6::timestamp, now())
             ELSE admin_hub_seller_settings.billbee_updated_at
           END,
           updated_at = now()`,
        [settingsKey, api || null, user || null, pass || null, conn || null, billbeeUpdatedAt],
      )
      await client.end()

      const base = getBillbeePublicBaseUrl()
      const webhook_url = `${base}/admin-hub/v1/integrations/billbee/webhook`
      const store_name = row.store_name != null ? String(row.store_name).trim() : ''
      const name_for_billbee = conn || store_name || 'Andertal'
      const has_credentials = !!(api && user && pass)
      return res.json({
        credentials: {
          api_key: api,
          basic_auth_username: user,
          basic_auth_password: pass,
        },
        seller_id: settingsKey,
        generated: has_credentials,
        webhook_url,
        connection_name: conn,
        name_for_billbee,
        store_name,
      })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      return res.status(500).json({ message: e?.message || 'Billbee settings could not be saved' })
    }
  }

  const adminHubBillbeeCredentialsPOST = async (req, res) => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    const settingsKey = getBillbeeAdminHubSellerSettingsKey(req.sellerUser)
    if (!settingsKey) return res.status(401).json({ message: 'Invalid session' })
    let client
    try {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      const creds = await ensureSellerBillbeeCredentials(client, settingsKey, true)
      await client.end()
      return res.json({ credentials: creds, seller_id: settingsKey, regenerated: true })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      return res.status(500).json({ message: e?.message || 'Billbee credentials could not be regenerated' })
    }
  }

  const adminHubBillbeeIntegrationTestPOST = async (req, res) => {
    try {
      const body = req.body || {}
      const apiKey = String(body.api_key || '').trim()
      const username = String(body.basic_auth_username || '').trim()
      const password = String(body.basic_auth_password || '').trim()
      if (!apiKey || !username || !password) {
        return res.status(400).json({ message: 'api_key, basic_auth_username and basic_auth_password are required' })
      }

      const authBase64 = Buffer.from(`${username}:${password}`).toString('base64')
      const response = await fetch('https://app.billbee.io/api/v1/orders?top=1', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Billbee-Api-Key': apiKey,
          Authorization: `Basic ${authBase64}`,
        },
      })

      if (!response.ok) {
        const raw = await response.text().catch(() => '')
        const detail = raw ? ` — ${String(raw).slice(0, 180)}` : ''
        return res.status(400).json({ message: `Billbee connection failed (HTTP ${response.status})${detail}` })
      }

      return res.json({ ok: true, message: 'Billbee connection successful.' })
    } catch (e) {
      return res.status(500).json({ message: e?.message || 'Billbee test failed' })
    }
  }

  const adminHubBillbeeWebhookGET = async (req, res) => {
    // Connection test / health-check endpoint.
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
    let client
    try {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      try {
        const { apiKey, username, password, basicOk } = getBillbeeAuthFromReq(req)
        if (!basicOk || !username || !password) {
          return res.status(401).json({ message: 'Unauthorized' })
        }

        let q
        if (apiKey) {
          q = await client.query(
            `SELECT seller_id, billbee_basic_username, billbee_basic_password
             FROM admin_hub_seller_settings
             WHERE billbee_api_key = $1::text
             LIMIT 1`,
            [apiKey],
          )
        } else {
          q = await client.query(
            `SELECT seller_id, billbee_basic_username, billbee_basic_password
             FROM admin_hub_seller_settings
             WHERE billbee_basic_username = $1::text AND billbee_basic_password = $2::text
             LIMIT 1`,
            [username, password],
          )
        }
        const row = q.rows && q.rows[0]
        if (!row) return res.status(401).json({ message: 'Unauthorized' })
        const ok = String(row.billbee_basic_username || '') === username && String(row.billbee_basic_password || '') === password
        if (!ok) return res.status(401).json({ message: 'Unauthorized' })
        res.json({ ok: true, type: 'billbee_webhook', message: 'Billbee connection ok.' })
      } finally {
        await client.end().catch(() => {})
      }
    } catch (e) {
      res.status(500).json({ message: e?.message || 'Billbee webhook error' })
    }
  }

  const adminHubBillbeeWebhookPOST = async (req, res) => {
    // For now we only accept & acknowledge events.
    // Later we can map payload -> orders/labels in admin-hub tables.
    return adminHubBillbeeWebhookGET(req, res)
  }

  const adminHubBillbeeWebhookUrlGET = async (req, res) => {
    const base = getBillbeePublicBaseUrl()
    return res.json({
      url: `${base}/admin-hub/v1/integrations/billbee/webhook`,
      method: 'POST (Billbee may also call GET)',
    })
  }

  const ensureAndertalBillbeeApiKeys = async (client, userId) => {
    const _c = require('crypto')
    const r = await client.query(
      `SELECT id, email, seller_id, andertal_billbee_api_key, andertal_billbee_api_secret FROM seller_users WHERE id = $1`,
      [userId],
    )
    const row = r.rows && r.rows[0]
    if (!row) return null
    if (row.andertal_billbee_api_key && row.andertal_billbee_api_secret) return row
    const k = `andertal_seller_${_c.randomBytes(12).toString('hex')}`
    const sec = _c.randomBytes(24).toString('hex')
    const u = await client.query(
      `UPDATE seller_users SET andertal_billbee_api_key = $2, andertal_billbee_api_secret = $3, updated_at = now()
       WHERE id = $1 AND (andertal_billbee_api_key IS NULL OR andertal_billbee_api_secret IS NULL)
       RETURNING id, email, seller_id, andertal_billbee_api_key, andertal_billbee_api_secret`,
      [userId, k, sec],
    )
    if (u.rows[0]) return u.rows[0]
    const again = await client.query(
      `SELECT id, email, seller_id, andertal_billbee_api_key, andertal_billbee_api_secret FROM seller_users WHERE id = $1`,
      [userId],
    )
    return again.rows[0]
  }

  const adminHubBillbeeMarketplaceConnectionGET = async (req, res) => {
    const userId = req.sellerUser?.id
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })
    let client
    try {
      client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database unavailable' })
      await client.connect()
      const row = await ensureAndertalBillbeeApiKeys(client, userId)
      await client.end()
      client = null
      if (!row) return res.status(404).json({ message: 'User not found' })
      const base = publicAndertalBillbeeApiBase()
      const apiBase = `${base}/api/billbee`
      res.json({
        name: 'Andertal Marketplace',
        api_base_url: apiBase,
        orders_url: `${base}/api/billbee/orders`,
        products_url: `${base}/api/billbee/products`,
        stock_url: `${base}/api/billbee/stock`,
        webhook_url: `${base}/api/billbee/webhook/order-update`,
        api_key: row.andertal_billbee_api_key,
        basic_auth_username: row.email,
        basic_auth_password: row.andertal_billbee_api_secret,
        billbee_integration_enabled: true,
        hint:
          'Billbee: Einstellungen → Kanäle → Shop hinzufügen → „Eigener Webshop (Billbee API)“. Shop-URL = api_base_url. Basic-Benutzername entweder den Schlüssel (andertal_seller_…) ODER die angezeigte E-Mail; Basic-Passwort = das angezeigte Secret (beides aus Sellercentral kopieren). Kein separates Billbee.io API-Token nötig — Andertal ist der aufgerufene Server.',
      })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  }

  const adminHubBillbeeMarketplaceConnectionRotatePOST = async (req, res) => {
    const userId = req.sellerUser?.id
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })
    const _c = require('crypto')
    let client
    try {
      client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database unavailable' })
      await client.connect()
      const sec = _c.randomBytes(24).toString('hex')
      const r = await client.query(
        `UPDATE seller_users SET andertal_billbee_api_secret = $2, updated_at = now() WHERE id = $1 RETURNING andertal_billbee_api_secret`,
        [userId, sec],
      )
      await client.end()
      client = null
      if (!r.rows[0]) return res.status(404).json({ message: 'Not found' })
      res.json({ ok: true, basic_auth_password: r.rows[0].andertal_billbee_api_secret })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  }

  const router = Router()

  router.get('/admin-hub/v1/integrations/trustpilot', requireSuperuser, adminHubTrustpilotGET)
  router.put('/admin-hub/v1/integrations/trustpilot', requireSuperuser, adminHubTrustpilotPUT)
  router.get('/admin-hub/v1/integrations', adminHubIntegrationsGET)
  router.post('/admin-hub/v1/integrations', adminHubIntegrationPOST)
  router.patch('/admin-hub/v1/integrations/:id', adminHubIntegrationPATCH)
  router.delete('/admin-hub/v1/integrations/:id', adminHubIntegrationDELETE)
  router.get('/admin-hub/v1/integrations/billbee/credentials', adminHubBillbeeCredentialsGET)
  router.patch('/admin-hub/v1/integrations/billbee/credentials', adminHubBillbeeCredentialsPATCH)
  router.post('/admin-hub/v1/integrations/billbee/credentials', adminHubBillbeeCredentialsPOST)
  router.post('/admin-hub/v1/integrations/billbee/test', adminHubBillbeeIntegrationTestPOST)
  // Billbee calls this URL to verify/authenticate the integration.
  // Must be reachable from the Billbee backend.
  router.get('/admin-hub/v1/integrations/billbee/webhook-url', adminHubBillbeeWebhookUrlGET)
  router.get('/admin-hub/v1/integrations/billbee/webhook', adminHubBillbeeWebhookGET)
  router.post('/admin-hub/v1/integrations/billbee/webhook', adminHubBillbeeWebhookPOST)
  router.get('/admin-hub/v1/billbee/connection', adminHubBillbeeMarketplaceConnectionGET)
  router.post('/admin-hub/v1/billbee/connection/rotate-secret', adminHubBillbeeMarketplaceConnectionRotatePOST)

  return router
}
