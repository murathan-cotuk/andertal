'use strict'
const { Router } = require('express')
const { getPooledClient } = require('../db-pool')

// /store/styles is fetched on every single page load (shop + Sellercentral branding/theme
// bootstrap) — was opening a brand-new Postgres connection per request, which is the
// dominant contributor to the multi-second/occasional-500 latency seen under concurrent
// load. Pooled client keeps the exact same connect()/query()/end() shape used below.
const getDbClient = () => getPooledClient()

const stylesGET = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query('SELECT key, value FROM admin_hub_styles')
    const data = {}
    r.rows.forEach(row => { data[row.key] = row.value })
    res.set('Cache-Control', 'no-store, max-age=0')
    res.json({ styles: data.styles || { colors: {}, buttons: {} } })
  } catch (err) {
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}
const stylesPUT = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const styles = req.body?.styles
    if (!styles || typeof styles !== 'object' || Array.isArray(styles)) {
      return res.status(400).json({ message: 'Missing or invalid styles in request body' })
    }
    await client.query(
      `INSERT INTO admin_hub_styles (key, value) VALUES ('styles', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(styles)]
    )
    res.json({ ok: true, styles })
  } catch (err) {
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}

// ── Public Trustpilot widget config (Business Unit ID is public in TrustBox embeds) ──
const storeTrustpilotConfigGET = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.json({ enabled: false, businessUnitId: null, templateId: null, evaluateUrl: null })
  try {
    await client.connect()
    const r = await client.query(
      `SELECT api_key, config FROM store_integrations WHERE LOWER(TRIM(slug)) = 'trustpilot' AND is_active = true LIMIT 1`
    )
    const row = r.rows[0]
    const bu = row && row.api_key ? String(row.api_key).trim() : ''
    if (!bu) return res.json({ enabled: false, businessUnitId: null, templateId: null, evaluateUrl: null })
    let cfg = {}
    try {
      const c = row.config
      cfg = typeof c === 'string' ? JSON.parse(c) : (c && typeof c === 'object' ? c : {})
    } catch (_) {}
    const templateId = (cfg.template_id || cfg.templateId || '').toString().trim() || '5419b732-fbfb-4c9d-8b9d-0a9952a935df'
    const evaluateUrl = (cfg.evaluate_url || cfg.evaluateUrl || '').toString().trim()
    const evaluateOut = /^https:\/\//i.test(evaluateUrl) ? evaluateUrl : null
    res.json({ enabled: true, businessUnitId: bu, templateId, evaluateUrl: evaluateOut })
  } catch (err) {
    console.error('storeTrustpilotConfigGET:', err)
    res.json({ enabled: false, businessUnitId: null, templateId: null, evaluateUrl: null })
  } finally {
    await client.end().catch(() => {})
  }
}

module.exports = function createStylesRouter() {
  const router = Router()

  router.get('/admin-hub/styles', stylesGET)
  router.put('/admin-hub/styles', stylesPUT)
  router.get('/store/styles', stylesGET) // public — no auth
  router.get('/store/trustpilot-config', storeTrustpilotConfigGET)

  return router
}
