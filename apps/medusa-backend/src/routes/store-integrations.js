'use strict'
const { Router } = require('express')
const { requireSuperuser } = require('./seller-auth')

// ── Sendcloud Platform Config ─────────────────────────────────────────────
const adminHubSendcloudGET = async (req, res) => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    const r = await client.query(
      `SELECT api_key, api_secret, config, is_active FROM store_integrations WHERE LOWER(TRIM(slug)) = 'sendcloud' AND seller_scope_key = 'platform' LIMIT 1`
    )
    await client.end()
    const row = r.rows[0]
    if (!row) return res.json({ configured: false, public_key: '', secret_key: '', markup_pct: 5, is_active: false })
    let cfg = {}
    try { const c = row.config; cfg = typeof c === 'string' ? JSON.parse(c) : (c && typeof c === 'object' ? c : {}) } catch (_) {}
    res.json({
      configured: !!(row.api_key && row.api_secret),
      public_key: row.api_key ? String(row.api_key).trim() : '',
      secret_key: row.api_secret ? String(row.api_secret).trim() : '',
      markup_pct: cfg.markup_pct != null ? Number(cfg.markup_pct) : 5,
      is_active: row.is_active !== false,
    })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubSendcloudPUT = async (req, res) => {
  const body = req.body || {}
  const public_key = String(body.public_key ?? '').trim()
  const secret_key = String(body.secret_key ?? '').trim()
  const markup_pct = body.markup_pct != null ? Number(body.markup_pct) : 5
  const is_active = body.is_active !== false && body.is_active !== 'false'
  if (!public_key || !secret_key) return res.status(400).json({ message: 'public_key and secret_key required' })
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    const cfg = JSON.stringify({ markup_pct })
    await client.query(
      `INSERT INTO store_integrations (name, slug, api_key, api_secret, config, is_active, category, seller_scope_key)
       VALUES ('Sendcloud','sendcloud',$1,$2,$3,$4,'shipping','platform')
       ON CONFLICT (slug, seller_scope_key) DO UPDATE
         SET api_key=$1, api_secret=$2, config=$3, is_active=$4, updated_at=now()`,
      [public_key, secret_key, cfg, is_active]
    ).catch(async () => {
      // fallback if unique constraint not on (slug, seller_scope_key)
      const exists = await client.query(`SELECT id FROM store_integrations WHERE LOWER(TRIM(slug))='sendcloud' AND seller_scope_key='platform' LIMIT 1`)
      if (exists.rows[0]) {
        await client.query(`UPDATE store_integrations SET api_key=$1,api_secret=$2,config=$3,is_active=$4,updated_at=now() WHERE id=$5`, [public_key, secret_key, cfg, is_active, exists.rows[0].id])
      } else {
        await client.query(`INSERT INTO store_integrations (name,slug,api_key,api_secret,config,is_active,category,seller_scope_key) VALUES ('Sendcloud','sendcloud',$1,$2,$3,$4,'shipping','platform')`, [public_key, secret_key, cfg, is_active])
      }
    })
    await client.end()
    res.json({ ok: true })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

// Test Sendcloud connection by calling /api/v2/user endpoint
const adminHubSendcloudTestPOST = async (req, res) => {
  const body = req.body || {}
  const public_key = String(body.public_key ?? '').trim()
  const secret_key = String(body.secret_key ?? '').trim()
  if (!public_key || !secret_key) return res.status(400).json({ message: 'public_key and secret_key required' })
  try {
    const https = require('https')
    const auth = Buffer.from(`${public_key}:${secret_key}`).toString('base64')
    const data = await new Promise((resolve, reject) => {
      const r = https.request(
        { hostname: 'panel.sendcloud.sc', path: '/api/v2/user', method: 'GET', headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } },
        (resp) => {
          let body = ''; resp.on('data', d => { body += d }); resp.on('end', () => { try { resolve({ status: resp.statusCode, body: JSON.parse(body) }) } catch { resolve({ status: resp.statusCode, body: {} }) } })
        }
      )
      r.on('error', reject); r.end()
    })
    if (data.status === 200) {
      const user = data.body?.user || {}
      res.json({ ok: true, company: user.company_name || user.username || 'OK' })
    } else {
      res.status(400).json({ ok: false, message: `Sendcloud API (${data.status}): Ungültige Zugangsdaten` })
    }
  } catch (e) {
    res.status(500).json({ ok: false, message: e?.message || 'Verbindung fehlgeschlagen' })
  }
}

// ── Resend Platform Config (flow-automation outbound email) ──────────────
const adminHubResendGET = async (req, res) => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    const r = await client.query(
      `SELECT api_key, is_active FROM store_integrations WHERE LOWER(TRIM(slug)) = 'resend' AND seller_scope_key = 'platform' LIMIT 1`
    )
    await client.end()
    const row = r.rows[0]
    if (!row) return res.json({ configured: false, api_key: '', is_active: false })
    res.json({
      configured: !!row.api_key,
      api_key: row.api_key ? String(row.api_key).trim() : '',
      is_active: row.is_active !== false,
    })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubResendPUT = async (req, res) => {
  const body = req.body || {}
  const api_key = String(body.api_key ?? '').trim()
  const is_active = body.is_active !== false && body.is_active !== 'false'
  if (!api_key) return res.status(400).json({ message: 'api_key required' })
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  let client
  try {
    const { Client } = require('pg')
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    await client.query(
      `INSERT INTO store_integrations (name, slug, api_key, is_active, category, seller_scope_key)
       VALUES ('Resend','resend',$1,$2,'email','platform')
       ON CONFLICT (slug, seller_scope_key) DO UPDATE
         SET api_key=$1, is_active=$2, updated_at=now()`,
      [api_key, is_active]
    ).catch(async () => {
      const exists = await client.query(`SELECT id FROM store_integrations WHERE LOWER(TRIM(slug))='resend' AND seller_scope_key='platform' LIMIT 1`)
      if (exists.rows[0]) {
        await client.query(`UPDATE store_integrations SET api_key=$1,is_active=$2,updated_at=now() WHERE id=$3`, [api_key, is_active, exists.rows[0].id])
      } else {
        await client.query(`INSERT INTO store_integrations (name,slug,api_key,is_active,category,seller_scope_key) VALUES ('Resend','resend',$1,$2,'email','platform')`, [api_key, is_active])
      }
    })
    await client.end()
    res.json({ ok: true })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

// Test Resend connection by listing verified domains — also surfaces exactly which sender
// domains are usable, since Resend silently rejects a send if the "from" domain isn't verified.
const adminHubResendTestPOST = async (req, res) => {
  const body = req.body || {}
  const api_key = String(body.api_key ?? '').trim()
  if (!api_key) return res.status(400).json({ message: 'api_key required' })
  try {
    const https = require('https')
    const data = await new Promise((resolve, reject) => {
      const r = https.request(
        { hostname: 'api.resend.com', path: '/domains', method: 'GET', headers: { Authorization: `Bearer ${api_key}`, Accept: 'application/json' } },
        (resp) => {
          let body = ''; resp.on('data', d => { body += d }); resp.on('end', () => { try { resolve({ status: resp.statusCode, body: JSON.parse(body) }) } catch { resolve({ status: resp.statusCode, body: {} }) } })
        }
      )
      r.on('error', reject); r.end()
    })
    if (data.status === 200) {
      const domains = Array.isArray(data.body?.data) ? data.body.data.map((d) => ({ name: d.name, status: d.status })) : []
      res.json({ ok: true, domains })
    } else {
      res.status(400).json({ ok: false, message: `Resend API (${data.status}): invalid API key` })
    }
  } catch (e) {
    res.status(500).json({ ok: false, message: e?.message || 'Connection failed' })
  }
}

module.exports = function createStoreIntegrationsRouter() {
  const router = Router()

  router.get('/admin-hub/v1/integrations/sendcloud', requireSuperuser, adminHubSendcloudGET)
  router.put('/admin-hub/v1/integrations/sendcloud', requireSuperuser, adminHubSendcloudPUT)
  router.post('/admin-hub/v1/integrations/sendcloud/test', requireSuperuser, adminHubSendcloudTestPOST)

  router.get('/admin-hub/v1/integrations/resend', requireSuperuser, adminHubResendGET)
  router.put('/admin-hub/v1/integrations/resend', requireSuperuser, adminHubResendPUT)
  router.post('/admin-hub/v1/integrations/resend/test', requireSuperuser, adminHubResendTestPOST)

  return router
}
