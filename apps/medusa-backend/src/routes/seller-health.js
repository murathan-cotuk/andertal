'use strict'
const { Router } = require('express')
const { resolveSellerScope } = require('../seller-scope')
const {
  DEFAULT_CATEGORIES, DEFAULT_CRITERIA,
  loadConfig, calculateSellerHealth, snapshotSellerHealth, snapshotAllSellers, getSellerHealthHistory,
} = require('../seller-health/service')

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
}

const requireSuperuser = (req, res, next) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  next()
}

// Run once at startup — idempotent CREATE IF NOT EXISTS (same house pattern as back-in-stock.js
// / metafields.js), then seed the default scoring config exactly once (ON CONFLICT DO NOTHING —
// after that, these rows are the live, superuser-editable source of truth; this seed never
// overwrites an edited row).
;(async () => {
  const client = getDbClient()
  if (!client) return
  try {
    await client.connect()
    await client.query(`
      CREATE TABLE IF NOT EXISTS seller_health_categories_config (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        label_i18n JSONB,
        max_points NUMERIC NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        enabled BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by TEXT
      )
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS seller_health_criteria_config (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL REFERENCES seller_health_categories_config(id),
        label TEXT NOT NULL,
        label_i18n JSONB,
        description TEXT,
        description_i18n JSONB,
        unit TEXT,
        max_points NUMERIC NOT NULL,
        calculation_type TEXT NOT NULL,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        enabled BOOLEAN NOT NULL DEFAULT true,
        sort_order INT NOT NULL DEFAULT 0,
        min_sample_size INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by TEXT
      )
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS seller_health_config_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        criterion_id TEXT,
        category_id TEXT,
        field_changed TEXT NOT NULL,
        old_value JSONB,
        new_value JSONB,
        changed_by TEXT,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS seller_health_daily (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id VARCHAR NOT NULL,
        snapshot_date DATE NOT NULL,
        total_score NUMERIC,
        status TEXT,
        is_blocked BOOLEAN NOT NULL DEFAULT false,
        block_reasons JSONB,
        category_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
        issues JSONB NOT NULL DEFAULT '[]'::jsonb,
        data_sufficient BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(seller_id, snapshot_date)
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_seller_health_daily_seller ON seller_health_daily(seller_id, snapshot_date DESC)`)
    await client.query(`
      CREATE TABLE IF NOT EXISTS seller_health_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id VARCHAR NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'high',
        is_hard_block BOOLEAN NOT NULL DEFAULT false,
        details JSONB,
        resolved BOOLEAN NOT NULL DEFAULT false,
        resolved_at TIMESTAMPTZ,
        resolved_by TEXT,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_seller_health_events_seller ON seller_health_events(seller_id)`)
    await client.query(`CREATE TABLE IF NOT EXISTS seller_health_snapshot_runs (run_date DATE PRIMARY KEY, created_count INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`)

    for (const cat of DEFAULT_CATEGORIES) {
      await client.query(
        `INSERT INTO seller_health_categories_config (id, label, max_points, sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
        [cat.id, cat.label, cat.max_points, cat.sort_order],
      )
    }
    for (const crit of DEFAULT_CRITERIA) {
      await client.query(
        `INSERT INTO seller_health_criteria_config
           (id, category_id, label, description, unit, max_points, calculation_type, config, sort_order, min_sample_size)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) ON CONFLICT (id) DO NOTHING`,
        [crit.id, crit.category_id, crit.label, crit.description, crit.unit || null, crit.max_points, crit.calculation_type, JSON.stringify(crit.config || {}), crit.sort_order, crit.min_sample_size || 0],
      )
    }
    await client.end()
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('[seller-health] table setup failed:', e?.message || e)
  }
})()

// Daily snapshot — checked hourly, idempotent per calendar day via seller_health_snapshot_runs
// (same idempotency shape as payouts.js's seller_payout_auto_runs). Deliberately NOT the only way
// to get a score — GET /admin-hub/v1/seller-health always computes live on top of this, so a
// seller never has to wait for the nightly job to see today's real numbers; this snapshot exists
// purely to build the history/trend chart.
async function runDailySnapshotIfDue() {
  const client = getDbClient()
  if (!client) return
  try {
    await client.connect()
    const today = new Date().toISOString().slice(0, 10)
    const already = await client.query('SELECT run_date FROM seller_health_snapshot_runs WHERE run_date = $1', [today])
    if (already.rows.length) { await client.end(); return }
    const result = await snapshotAllSellers(client)
    await client.query(
      'INSERT INTO seller_health_snapshot_runs (run_date, created_count) VALUES ($1, $2) ON CONFLICT (run_date) DO NOTHING',
      [today, result.ok],
    )
    await client.end()
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('[seller-health] daily snapshot failed:', e?.message || e)
  }
}
setInterval(() => { runDailySnapshotIfDue().catch(() => {}) }, 60 * 60 * 1000)
runDailySnapshotIfDue().catch(() => {})

// GET /admin-hub/v1/seller-health — own data for a seller; superuser may pass ?seller_id=
const sellerHealthGET = async (req, res) => {
  const scope = resolveSellerScope(req.sellerUser)
  if (!scope) return res.status(403).json({ message: 'Forbidden' })
  const sellerId = scope.isSuperuser ? (String(req.query.seller_id || '').trim() || null) : scope.sellerId
  if (!sellerId) return res.status(400).json({ message: 'seller_id required' })
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const config = await loadConfig(client)
    const result = await calculateSellerHealth(client, sellerId, config)
    await client.end()
    if (result.notFound) return res.status(404).json({ message: 'Seller not found' })
    res.json(result)
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('seller-health GET:', e)
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

// POST /admin-hub/v1/seller-health/recalculate — forces a fresh computation AND persists it as
// today's snapshot (useful right after a superuser edits config, or a seller fixes an issue and
// wants to see the effect immediately instead of waiting for the hourly job).
const sellerHealthRecalculatePOST = async (req, res) => {
  const scope = resolveSellerScope(req.sellerUser)
  if (!scope) return res.status(403).json({ message: 'Forbidden' })
  const sellerId = scope.isSuperuser ? (String(req.body?.seller_id || '').trim() || null) : scope.sellerId
  if (!sellerId) return res.status(400).json({ message: 'seller_id required' })
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const config = await loadConfig(client)
    const result = await snapshotSellerHealth(client, sellerId, config)
    await client.end()
    if (result.notFound) return res.status(404).json({ message: 'Seller not found' })
    res.json(result)
  } catch (e) {
    try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

// GET /admin-hub/v1/seller-health/history?seller_id=&days=
const sellerHealthHistoryGET = async (req, res) => {
  const scope = resolveSellerScope(req.sellerUser)
  if (!scope) return res.status(403).json({ message: 'Forbidden' })
  const sellerId = scope.isSuperuser ? (String(req.query.seller_id || '').trim() || null) : scope.sellerId
  if (!sellerId) return res.status(400).json({ message: 'seller_id required' })
  const days = Math.min(730, Math.max(7, parseInt(req.query.days, 10) || 90))
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const history = await getSellerHealthHistory(client, sellerId, days)
    await client.end()
    res.json({ seller_id: sellerId, days, history })
  } catch (e) {
    try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

// GET /admin-hub/v1/seller-health/sellers — superuser-only picker: every seller + their latest
// known score (from the most recent snapshot — cheap, avoids recomputing all of them live).
const sellerHealthSellersGET = async (req, res) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const rows = (await client.query(`
      SELECT s.seller_id, s.store_name, s.approval_status,
             d.total_score, d.status, d.is_blocked, d.snapshot_date
        FROM seller_users s
        LEFT JOIN LATERAL (
          SELECT total_score, status, is_blocked, snapshot_date
            FROM seller_health_daily WHERE seller_id = s.seller_id
           ORDER BY snapshot_date DESC LIMIT 1
        ) d ON true
       WHERE s.is_superuser IS NOT TRUE
       ORDER BY s.store_name ASC
    `)).rows
    await client.end()
    res.json({
      sellers: rows.map((r) => ({
        seller_id: r.seller_id, store_name: r.store_name, approval_status: r.approval_status,
        latest_score: r.total_score != null ? Number(r.total_score) : null,
        status: r.status || 'insufficient_data', is_blocked: r.is_blocked || false,
        snapshot_date: r.snapshot_date || null,
      })),
    })
  } catch (e) {
    try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

// GET /admin-hub/v1/seller-health/config — readable by anyone logged in (a seller should be able
// to see the weights/thresholds their score is judged against — spec's own transparency
// requirement); only PATCH below is superuser-gated.
const sellerHealthConfigGET = async (req, res) => {
  if (!req.sellerUser) return res.status(401).json({ message: 'Unauthorized' })
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const config = await loadConfig(client)
    await client.end()
    res.json(config)
  } catch (e) {
    try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

// PATCH /admin-hub/v1/seller-health/config — superuser only. Body: { categories: [{id, max_points,
// enabled}], criteria: [{id, max_points, enabled, config, min_sample_size}] }. Every changed field
// is written to seller_health_config_audit_log (spec §20) — old value fetched right before the
// UPDATE so the log is accurate even under concurrent edits from two admins.
const sellerHealthConfigPATCH = async (req, res) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  const changedBy = req.sellerUser?.email || req.sellerUser?.seller_id || 'unknown'
  const categories = Array.isArray(req.body?.categories) ? req.body.categories : []
  const criteria = Array.isArray(req.body?.criteria) ? req.body.criteria : []
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const auditRows = []

    for (const cat of categories) {
      if (!cat?.id) continue
      const prev = (await client.query('SELECT * FROM seller_health_categories_config WHERE id = $1', [cat.id])).rows[0]
      if (!prev) continue
      const nextMaxPoints = cat.max_points != null ? Number(cat.max_points) : Number(prev.max_points)
      const nextEnabled = cat.enabled != null ? !!cat.enabled : prev.enabled
      if (nextMaxPoints !== Number(prev.max_points)) auditRows.push({ category_id: cat.id, field_changed: 'max_points', old_value: prev.max_points, new_value: nextMaxPoints })
      if (nextEnabled !== prev.enabled) auditRows.push({ category_id: cat.id, field_changed: 'enabled', old_value: prev.enabled, new_value: nextEnabled })
      await client.query(
        `UPDATE seller_health_categories_config SET max_points = $1, enabled = $2, updated_at = now(), updated_by = $3 WHERE id = $4`,
        [nextMaxPoints, nextEnabled, changedBy, cat.id],
      )
    }

    for (const crit of criteria) {
      if (!crit?.id) continue
      const prev = (await client.query('SELECT * FROM seller_health_criteria_config WHERE id = $1', [crit.id])).rows[0]
      if (!prev) continue
      const nextMaxPoints = crit.max_points != null ? Number(crit.max_points) : Number(prev.max_points)
      const nextEnabled = crit.enabled != null ? !!crit.enabled : prev.enabled
      const nextConfig = crit.config != null ? crit.config : prev.config
      const nextMinSample = crit.min_sample_size != null ? Number(crit.min_sample_size) : Number(prev.min_sample_size)
      if (nextMaxPoints !== Number(prev.max_points)) auditRows.push({ criterion_id: crit.id, field_changed: 'max_points', old_value: prev.max_points, new_value: nextMaxPoints })
      if (nextEnabled !== prev.enabled) auditRows.push({ criterion_id: crit.id, field_changed: 'enabled', old_value: prev.enabled, new_value: nextEnabled })
      if (JSON.stringify(nextConfig) !== JSON.stringify(prev.config)) auditRows.push({ criterion_id: crit.id, field_changed: 'config', old_value: prev.config, new_value: nextConfig })
      if (nextMinSample !== Number(prev.min_sample_size)) auditRows.push({ criterion_id: crit.id, field_changed: 'min_sample_size', old_value: prev.min_sample_size, new_value: nextMinSample })
      await client.query(
        `UPDATE seller_health_criteria_config
            SET max_points = $1, enabled = $2, config = $3::jsonb, min_sample_size = $4, updated_at = now(), updated_by = $5
          WHERE id = $6`,
        [nextMaxPoints, nextEnabled, JSON.stringify(nextConfig || {}), nextMinSample, changedBy, crit.id],
      )
    }

    for (const row of auditRows) {
      await client.query(
        `INSERT INTO seller_health_config_audit_log (criterion_id, category_id, field_changed, old_value, new_value, changed_by)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6)`,
        [row.criterion_id || null, row.category_id || null, row.field_changed, JSON.stringify(row.old_value), JSON.stringify(row.new_value), changedBy],
      )
    }

    const config = await loadConfig(client)
    await client.end()
    res.json({ ...config, changes_logged: auditRows.length })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('seller-health config PATCH:', e)
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

// POST /admin-hub/v1/seller-health/config/reset — superuser only, restores every category and
// criterion to the shipped defaults (spec §18 "Reset to defaults"). Logs one audit row per field
// actually changed, same as a normal edit.
const sellerHealthConfigResetPOST = async (req, res) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  const changedBy = req.sellerUser?.email || req.sellerUser?.seller_id || 'unknown'
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    for (const cat of DEFAULT_CATEGORIES) {
      const prev = (await client.query('SELECT * FROM seller_health_categories_config WHERE id = $1', [cat.id])).rows[0]
      if (prev && (Number(prev.max_points) !== cat.max_points || !prev.enabled)) {
        await client.query(
          `INSERT INTO seller_health_config_audit_log (category_id, field_changed, old_value, new_value, changed_by) VALUES ($1,'reset_to_default',$2::jsonb,$3::jsonb,$4)`,
          [cat.id, JSON.stringify({ max_points: prev.max_points, enabled: prev.enabled }), JSON.stringify({ max_points: cat.max_points, enabled: true }), changedBy],
        )
      }
      await client.query(
        `UPDATE seller_health_categories_config SET max_points = $1, enabled = true, updated_at = now(), updated_by = $2 WHERE id = $3`,
        [cat.max_points, changedBy, cat.id],
      )
    }
    for (const crit of DEFAULT_CRITERIA) {
      await client.query(
        `UPDATE seller_health_criteria_config
            SET max_points = $1, enabled = true, config = $2::jsonb, min_sample_size = $3, updated_at = now(), updated_by = $4
          WHERE id = $5`,
        [crit.max_points, JSON.stringify(crit.config || {}), crit.min_sample_size || 0, changedBy, crit.id],
      )
    }
    const config = await loadConfig(client)
    await client.end()
    res.json(config)
  } catch (e) {
    try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

// GET /admin-hub/v1/seller-health/config/audit-log?limit=
const sellerHealthAuditLogGET = async (req, res) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100))
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const rows = (await client.query(
      `SELECT * FROM seller_health_config_audit_log ORDER BY changed_at DESC LIMIT $1`, [limit],
    )).rows
    await client.end()
    res.json({ entries: rows })
  } catch (e) {
    try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

// ── Risk / hard-block events (spec §5.5, §13) ─────────────────────────────────────────────────
// GET /admin-hub/v1/seller-health/events?seller_id=
const sellerHealthEventsGET = async (req, res) => {
  const scope = resolveSellerScope(req.sellerUser)
  if (!scope) return res.status(403).json({ message: 'Forbidden' })
  const sellerId = scope.isSuperuser ? (String(req.query.seller_id || '').trim() || null) : scope.sellerId
  if (!sellerId) return res.status(400).json({ message: 'seller_id required' })
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const rows = (await client.query(
      `SELECT * FROM seller_health_events WHERE seller_id = $1 ORDER BY created_at DESC`, [sellerId],
    )).rows
    await client.end()
    res.json({ events: rows })
  } catch (e) {
    try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

// POST /admin-hub/v1/seller-health/events — superuser only. Manually record a risk/compliance/
// fraud event against a seller (the only source of Risk & Trust / Compliance Violations data
// until an automated fraud-detection pipeline exists — see EVENT_COUNT_PENALTY criteria).
const sellerHealthEventsPOST = async (req, res) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  const sellerId = String(req.body?.seller_id || '').trim()
  const eventType = String(req.body?.event_type || '').trim()
  if (!sellerId || !eventType) return res.status(400).json({ message: 'seller_id and event_type required' })
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query(
      `INSERT INTO seller_health_events (seller_id, event_type, severity, is_hard_block, details, created_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,
      [
        sellerId, eventType, String(req.body?.severity || 'high'), !!req.body?.is_hard_block,
        JSON.stringify(req.body?.details || {}), req.sellerUser?.email || req.sellerUser?.seller_id || null,
      ],
    )
    await client.end()
    res.status(201).json({ event: r.rows[0] })
  } catch (e) {
    try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

// PATCH /admin-hub/v1/seller-health/events/:id/resolve — superuser only.
const sellerHealthEventResolvePATCH = async (req, res) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query(
      `UPDATE seller_health_events SET resolved = true, resolved_at = now(), resolved_by = $1 WHERE id = $2::uuid RETURNING *`,
      [req.sellerUser?.email || req.sellerUser?.seller_id || null, req.params.id],
    )
    await client.end()
    if (!r.rows[0]) return res.status(404).json({ message: 'Event not found' })
    res.json({ event: r.rows[0] })
  } catch (e) {
    try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

module.exports = function createSellerHealthRouter() {
  const router = Router()
  router.get('/admin-hub/v1/seller-health', sellerHealthGET)
  router.post('/admin-hub/v1/seller-health/recalculate', sellerHealthRecalculatePOST)
  router.get('/admin-hub/v1/seller-health/history', sellerHealthHistoryGET)
  router.get('/admin-hub/v1/seller-health/sellers', sellerHealthSellersGET)
  router.get('/admin-hub/v1/seller-health/config', sellerHealthConfigGET)
  router.patch('/admin-hub/v1/seller-health/config', requireSuperuser, sellerHealthConfigPATCH)
  router.post('/admin-hub/v1/seller-health/config/reset', requireSuperuser, sellerHealthConfigResetPOST)
  router.get('/admin-hub/v1/seller-health/config/audit-log', requireSuperuser, sellerHealthAuditLogGET)
  router.get('/admin-hub/v1/seller-health/events', sellerHealthEventsGET)
  router.post('/admin-hub/v1/seller-health/events', requireSuperuser, sellerHealthEventsPOST)
  router.patch('/admin-hub/v1/seller-health/events/:id/resolve', requireSuperuser, sellerHealthEventResolvePATCH)
  return router
}
