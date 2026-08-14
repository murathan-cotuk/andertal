'use strict'
const { Router } = require('express')
const {
  buildCatalogMaps,
  persistCatalogPendingScan,
  stripRejectedCatalogValues,
  scanProductCatalogPending,
} = require('../catalog-metafield-pending')

const requireSuperuser = (req, res, next) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  next()
}

const requireSellerUser = (req, res, next) => {
  if (!req.sellerUser?.seller_id) return res.status(401).json({ message: 'Unauthorized' })
  next()
}

async function dbQ(sql, params = []) {
  const { Client } = require('pg')
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
  await client.connect()
  try { return await client.query(sql, params) } finally { await client.end() }
}

// Run once at startup — idempotent CREATE IF NOT EXISTS
;(async () => {
  const tables = [
    `CREATE TABLE IF NOT EXISTS admin_hub_seller_listings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL,
      seller_id VARCHAR(255) NOT NULL,
      price_cents INTEGER NOT NULL DEFAULT 0,
      inventory INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      sku VARCHAR(255),
      shipping_group_id VARCHAR(255),
      brand_id VARCHAR(255),
      publish_date TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(product_id, seller_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_seller_listings_seller ON admin_hub_seller_listings(seller_id)`,
    `CREATE INDEX IF NOT EXISTS idx_seller_listings_product ON admin_hub_seller_listings(product_id)`,
    `CREATE TABLE IF NOT EXISTS admin_hub_product_change_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL,
      seller_id VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      field_name VARCHAR(255) NOT NULL,
      old_value TEXT,
      new_value TEXT,
      reviewer_note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pcr_product ON admin_hub_product_change_requests(product_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pcr_status ON admin_hub_product_change_requests(status)`,
    `CREATE TABLE IF NOT EXISTS admin_hub_metafield_definitions (
      key varchar(120) PRIMARY KEY,
      label varchar(255),
      values JSONB NOT NULL DEFAULT '[]',
      label_i18n JSONB,
      values_i18n JSONB,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS admin_hub_metafield_pending (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key varchar(120) NOT NULL,
      label varchar(255),
      proposed_values JSONB NOT NULL DEFAULT '[]',
      seller_id varchar(255),
      status varchar(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_metafield_pending_status ON admin_hub_metafield_pending(status)`,
  ]
  for (const sql of tables) {
    dbQ(sql).catch(() => {})
  }
  dbQ('ALTER TABLE admin_hub_metafield_definitions ADD COLUMN IF NOT EXISTS label_i18n jsonb').catch(() => {})
  dbQ('ALTER TABLE admin_hub_metafield_definitions ADD COLUMN IF NOT EXISTS values_i18n jsonb').catch(() => {})
})()

const normalizeMetaKey = (raw) =>
  (String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || '')

const metafieldProposalNormalizeValues = (arr) => {
  const out = []
  const seen = new Set()
  for (const v of Array.isArray(arr) ? arr : []) {
    const s = String(v ?? '').trim()
    if (!s || s.length > 500) continue
    if (seen.has(s.toLowerCase())) continue
    seen.add(s.toLowerCase())
    out.push(s)
  }
  return out
}

const SYSTEM_KEYS = new Set([
  'media', 'image_url', 'image', 'thumbnail', 'ean', 'sku', 'handle', 'title', 'description', 'status',
  'inventory', 'price', 'type', 'bullet_points', 'bullet1', 'bullet2', 'bullet3', 'bullet4', 'bullet5',
  'translations', 'variation_groups', 'metafields', 'shipping_group_id', 'collection_id', 'collection_ids',
  'admin_category_id', 'category_id', 'category_ids', 'category_slug', 'category',
  'seller_id', 'product_id', 'brand_id', 'brand_logo', 'brand_handle',
  'brand', 'brand_name', 'shop_name', 'store_name', 'seller_name', 'hersteller', 'hersteller_information',
  'verantwortliche_person_information', 'manufacturer', 'manufacturer_information',
  'responsible_person_information', 'seo_keywords', 'seo_meta_title', 'seo_meta_description',
  'publish_date', 'return_days', 'return_cost', 'return_kostenlos', 'related_product_ids',
  'dimensions', 'dimensions_length', 'dimensions_width', 'dimensions_height', 'weight', 'weight_grams',
  'unit_type', 'unit_value', 'unit_reference', 'sales_unit', 'packaging_unit', 'packaging_unit_plural',
  'minimum_order_quantity', 'shipping_info', 'versand', 'rabattpreis_cents',
  'uvp_cents', 'price_cents', 'compare_at_price_cents', 'sale_price_cents', 'review_count',
  'review_avg', 'sold_last_month', 'sold', 'sales_count', 'salescount', 'sold_count',
  'master_total_variants', 'master_total_variant', 'total_variants', 'variant_count', 'variants_count',
  'is_new', 'badge', 'sale', 'is_bestseller', 'view_count', 'views', 'prices', 'custom_badges',
  'eu_origin_provider', 'eu_origin_registry_id', 'eu_origin_document_url', 'eu_origin_status',
  'eu_origin_verified_at', 'eu_origin_country',
  'weee_number', 'wee_number', 'weee', 'wee', 'eprel_number', 'eprel', 'eprel_id', 'eprel_registration_number',
  'product_files', 'files',
])

const isSystemCatalogKey = (raw) => {
  const key = normalizeMetaKey(raw)
  if (!key || key.startsWith('_')) return true
  if (SYSTEM_KEYS.has(key)) return true
  if (key.endsWith('_id') || key.endsWith('_ids')) return true
  if (/(^|_)(weee?|eprel|bullet|hersteller|manufacturer|gpsr)(_|$)/i.test(key)) return true
  if (key.includes('bullet_point')) return true
  return false
}

dbQ(
  `DELETE FROM admin_hub_metafield_definitions
   WHERE key = ANY($1::text[])
      OR key ~ '(_id|_ids)$'
      OR key ~* '(^|_)(weee?|eprel|bullet|hersteller|manufacturer|gpsr)(_|$)'
      OR key ILIKE '%bullet_point%'`,
  [Array.from(SYSTEM_KEYS)]
).catch(() => {})

const parseI18nObject = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw
}

const metafieldI18nJsonbOrNull = (raw) => {
  const obj = parseI18nObject(raw)
  if (!obj || Object.keys(obj).length === 0) return null
  return JSON.stringify(obj)
}

const refreshCatalogPendingOnProducts = async () => {
  const defRes = await dbQ('SELECT key, label, values, label_i18n FROM admin_hub_metafield_definitions')
  const maps = buildCatalogMaps(defRes.rows)
  await persistCatalogPendingScan(dbQ, maps)
}

const stripRejectedThenRefresh = async (rejectKey, rejectValues) => {
  const key = String(rejectKey || '').trim()
  if (!key) return
  let prodRes
  try {
    prodRes = await dbQ(
      `SELECT id, metadata, variants FROM admin_hub_products
       WHERE (metadata ? '_catalog_approval_pending')
          OR (metadata ? '_pending_catalog_metafields')`
    )
  } catch (_) {
    return
  }
  const defRes = await dbQ('SELECT key, label, values, label_i18n FROM admin_hub_metafield_definitions')
  const maps = buildCatalogMaps(defRes.rows)
  for (const row of (prodRes.rows || [])) {
    const stripped = stripRejectedCatalogValues(row.metadata, row.variants, key, rejectValues)
    const scanned = scanProductCatalogPending(stripped.metadata, stripped.variants, maps)
    try {
      await dbQ(
        `UPDATE admin_hub_products SET metadata = $1::jsonb, variants = $2::jsonb, updated_at = NOW() WHERE id = $3`,
        [JSON.stringify(scanned.metadata), JSON.stringify(scanned.variants == null ? (row.variants || []) : scanned.variants), row.id]
      )
    } catch (_) {}
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

const metafieldDefinitionsGET = async (req, res) => {
  try {
    const storedRes = await dbQ(
      'SELECT key, label, values, label_i18n, values_i18n FROM admin_hub_metafield_definitions ORDER BY key'
    )
    const stored = {}
    for (const row of storedRes.rows) {
      if (isSystemCatalogKey(row.key)) continue
      stored[row.key] = {
        label: row.label || row.key,
        values: Array.isArray(row.values) ? row.values : [],
        label_i18n: parseI18nObject(row.label_i18n),
        values_i18n: parseI18nObject(row.values_i18n),
      }
    }

    const definitions = {}
    for (const key of Object.keys(stored)) {
      if (isSystemCatalogKey(key)) continue
      definitions[key] = stored[key]
    }

    res.json({ definitions })
  } catch (err) {
    console.error('metafield-definitions GET:', err)
    res.status(500).json({ error: err.message })
  }
}

/** Public storefront catalog facet labels (no product scrape — stored defs only). */
const storeMetafieldDefinitionsGET = async (req, res) => {
  try {
    const storedRes = await dbQ(
      'SELECT key, label, values, label_i18n, values_i18n FROM admin_hub_metafield_definitions ORDER BY key'
    )
    const definitions = {}
    for (const row of storedRes.rows) {
      if (isSystemCatalogKey(row.key)) continue
      definitions[row.key] = {
        label: row.label || row.key,
        values: Array.isArray(row.values) ? row.values : [],
        label_i18n: parseI18nObject(row.label_i18n),
        values_i18n: parseI18nObject(row.values_i18n),
      }
    }
    res.json({ definitions })
  } catch (err) {
    console.error('store metafield-definitions GET:', err)
    res.status(500).json({ error: err.message })
  }
}

const metafieldDefinitionsPUT = async (req, res) => {
  try {
    let key = (req.params.key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    if (!key) return res.status(400).json({ error: 'key required' })
    if (isSystemCatalogKey(key)) {
      const remapped = normalizeMetaKey(`attr_${key}`)
      if (!remapped || isSystemCatalogKey(remapped)) {
        return res.status(400).json({ error: `system key not allowed: ${key}` })
      }
      key = remapped
    }
    const { label, values, label_i18n, values_i18n } = req.body || {}
    const safeValues = (Array.isArray(values) ? values : []).map((v) => String(v).trim()).filter(Boolean)
    const safeLabel = (label || key).toString().trim()
    const labelI18nJson = metafieldI18nJsonbOrNull(label_i18n)
    const valuesI18nJson = metafieldI18nJsonbOrNull(values_i18n)
    await dbQ(
      `INSERT INTO admin_hub_metafield_definitions (key, label, values, label_i18n, values_i18n, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET
         label = $2,
         values = $3::jsonb,
         label_i18n = $4::jsonb,
         values_i18n = $5::jsonb,
         updated_at = NOW()`,
      [key, safeLabel, JSON.stringify(safeValues), labelI18nJson, valuesI18nJson]
    )
    refreshCatalogPendingOnProducts().catch(() => {})
    res.json({
      ok: true,
      key,
      label: safeLabel,
      values: safeValues,
      label_i18n: parseI18nObject(label_i18n),
      values_i18n: parseI18nObject(values_i18n),
    })
  } catch (err) {
    console.error('metafield-definitions PUT:', err)
    res.status(500).json({ error: err.message })
  }
}

const metafieldDefinitionsDELETE = async (req, res) => {
  try {
    await dbQ('DELETE FROM admin_hub_metafield_definitions WHERE key = $1', [req.params.key])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const metafieldPendingGET = async (req, res) => {
  try {
    const r = await dbQ(
      `SELECT id, key, label, proposed_values, seller_id, status, created_at
       FROM admin_hub_metafield_pending WHERE status = 'pending' ORDER BY created_at ASC`
    )
    const rows = (r.rows || []).map((row) => ({
      id: row.id,
      key: row.key,
      label: row.label,
      proposed_values: Array.isArray(row.proposed_values) ? row.proposed_values : [],
      seller_id: row.seller_id,
      status: row.status,
      created_at: row.created_at,
    })).filter((row) => !isSystemCatalogKey(row.key))
    res.json({ pending: rows })
  } catch (err) {
    console.error('metafield-definitions pending GET:', err)
    res.status(500).json({ error: err.message })
  }
}

const metafieldProposalsPOST = async (req, res) => {
  try {
    const sellerUser = req.sellerUser
    const body = req.body || {}
    let key = normalizeMetaKey(body.key)
    const labelIn = (body.label != null ? String(body.label) : '').trim()
    if (!labelIn) return res.status(400).json({ message: 'label required' })
    if (!key) key = normalizeMetaKey(labelIn.replace(/\s+/g, '_'))
    if (!key) return res.status(400).json({ message: 'could not derive key' })
    if (isSystemCatalogKey(key)) {
      const remapped = normalizeMetaKey(`attr_${key}`)
      if (!remapped || isSystemCatalogKey(remapped)) {
        return res.status(400).json({ message: `system key not allowed: ${key}` })
      }
      key = remapped
    }
    const proposed = metafieldProposalNormalizeValues(body.values)
    if (proposed.length === 0) return res.status(400).json({ message: 'values required' })

    if (sellerUser.is_superuser) {
      const exist = await dbQ('SELECT label, values FROM admin_hub_metafield_definitions WHERE key = $1', [key])
      const prev = exist.rows[0]
      const prevVals = Array.isArray(prev?.values) ? prev.values : []
      const mergedVals = [...new Set([...prevVals.map(String), ...proposed])].sort()
      const safeLabel = labelIn || prev?.label || key
      await dbQ(
        `INSERT INTO admin_hub_metafield_definitions (key, label, values, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET label = $2, values = $3, updated_at = NOW()`,
        [key, safeLabel, JSON.stringify(mergedVals)]
      )
      await refreshCatalogPendingOnProducts().catch(() => {})
      return res.json({ ok: true, applied: true, key, label: safeLabel, values: mergedVals })
    }

    const ins = await dbQ(
      `INSERT INTO admin_hub_metafield_pending (key, label, proposed_values, seller_id, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, key, label, proposed_values, seller_id, status, created_at`,
      [key, labelIn, JSON.stringify(proposed), String(sellerUser.seller_id).trim()]
    )
    const row = ins.rows[0]
    res.status(201).json({
      ok: true,
      applied: false,
      proposal: {
        id: row.id,
        key: row.key,
        label: row.label,
        proposed_values: Array.isArray(row.proposed_values) ? row.proposed_values : proposed,
        seller_id: row.seller_id,
        status: row.status,
        created_at: row.created_at,
      },
    })
  } catch (err) {
    console.error('metafield-definitions proposals POST:', err)
    res.status(500).json({ error: err.message })
  }
}

const metafieldPendingApprovePOST = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ message: 'id required' })
    const pr = await dbQ(`SELECT * FROM admin_hub_metafield_pending WHERE id = $1::uuid AND status = 'pending'`, [id])
    const pending = pr.rows[0]
    if (!pending) return res.status(404).json({ message: 'Proposal not found' })
    const key = pending.key
    const overrideValues = Array.isArray(req.body?.values) ? req.body.values.map((v) => String(v || '').trim()).filter(Boolean) : null
    const proposed = (overrideValues && overrideValues.length)
      ? metafieldProposalNormalizeValues(overrideValues)
      : (Array.isArray(pending.proposed_values) ? pending.proposed_values.map(String) : [])
    const exist = await dbQ('SELECT label, values FROM admin_hub_metafield_definitions WHERE key = $1', [key])
    const prev = exist.rows[0]
    const prevVals = Array.isArray(prev?.values) ? prev.values.map(String) : []
    const mergedVals = [...new Set([...prevVals, ...proposed])].sort()
    const safeLabel = (req.body?.label && String(req.body.label).trim()) || (pending.label && String(pending.label).trim()) || prev?.label || key
    await dbQ(
      `INSERT INTO admin_hub_metafield_definitions (key, label, values, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET label = $2, values = $3, updated_at = NOW()`,
      [key, safeLabel, JSON.stringify(mergedVals)]
    )
    await dbQ(`DELETE FROM admin_hub_metafield_pending WHERE id = $1::uuid`, [id])
    await refreshCatalogPendingOnProducts().catch(() => {})
    if (pending.seller_id) {
      await dbQ(
        `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
         VALUES ('metafield_proposal_reviewed', $1, $2, $3, $4)`,
        [
          'Metafield-Vorschlag genehmigt',
          `Ihr Vorschlag für "${safeLabel}" wurde genehmigt: ${mergedVals.join(', ')}`,
          pending.seller_id,
          pending.id,
        ],
      ).catch(() => {})
    }
    res.json({ ok: true, key, label: safeLabel, values: mergedVals })
  } catch (err) {
    console.error('metafield pending approve:', err)
    res.status(500).json({ error: err.message })
  }
}

const metafieldPendingRejectPOST = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ message: 'id required' })
    const pr = await dbQ(`SELECT id, key, label, proposed_values, seller_id FROM admin_hub_metafield_pending WHERE id = $1::uuid AND status = 'pending'`, [id])
    const pending = pr.rows?.[0]
    const del = await dbQ(`DELETE FROM admin_hub_metafield_pending WHERE id = $1::uuid AND status = 'pending'`, [id])
    if (!del.rowCount) return res.status(404).json({ message: 'Proposal not found' })
    const rejectedValues = Array.isArray(pending?.proposed_values) ? pending.proposed_values.map(String) : []
    if (pending?.key && rejectedValues.length) {
      await stripRejectedThenRefresh(pending.key, rejectedValues).catch(() => {})
    }
    if (pending?.seller_id) {
      await dbQ(
        `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
         VALUES ('metafield_proposal_reviewed', $1, $2, $3, $4)`,
        [
          'Metafield-Vorschlag abgelehnt',
          `Ihr Vorschlag für "${pending.label || pending.key}" wurde abgelehnt.`,
          pending.seller_id,
          pending.id,
        ],
      ).catch(() => {})
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('metafield pending reject:', err)
    res.status(500).json({ error: err.message })
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

module.exports = function createMetafieldsRouter() {
  const router = Router()

  router.get('/admin-hub/metafield-definitions', metafieldDefinitionsGET)
  router.get('/store/metafield-definitions', storeMetafieldDefinitionsGET)
  router.get('/admin-hub/metafield-definitions/pending', requireSuperuser, metafieldPendingGET)
  router.put('/admin-hub/metafield-definitions/:key', requireSuperuser, metafieldDefinitionsPUT)
  router.delete('/admin-hub/metafield-definitions/:key', requireSuperuser, metafieldDefinitionsDELETE)
  router.post('/admin-hub/metafield-definitions/proposals', requireSellerUser, metafieldProposalsPOST)
  router.post('/admin-hub/metafield-definitions/pending/:id/approve', requireSuperuser, metafieldPendingApprovePOST)
  router.post('/admin-hub/metafield-definitions/pending/:id/reject', requireSuperuser, metafieldPendingRejectPOST)

  return router
}
