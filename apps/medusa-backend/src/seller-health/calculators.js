'use strict'

const { sqlOrderOwnedBySeller } = require('../seller-scope')
const { resolveComplianceProfile, validateProductCompliance, DEFAULT_PROFILE_ID } = require('../compliance/resolve-compliance')
const { resolveCategoryComplianceProfileId } = require('../compliance/category-profile-lookup')
const { extractEanFromHubProductRow } = require('../routes/store-products')

const MS_PER_HOUR = 3600 * 1000

function hoursBetween(a, b) {
  if (!a || !b) return null
  const ms = new Date(b).getTime() - new Date(a).getTime()
  if (!Number.isFinite(ms)) return null
  return ms / MS_PER_HOUR
}

function mean(nums) {
  const list = nums.filter((n) => Number.isFinite(n))
  if (!list.length) return null
  return list.reduce((s, n) => s + n, 0) / list.length
}

function round1(n) {
  return n == null ? null : Math.round(n * 10) / 10
}
function round2(n) {
  return n == null ? null : Math.round(n * 100) / 100
}

// ── Confidence tiers (spec §22: a 20-order seller and a 10,000-order seller must not be judged
// the same way on rate-based criteria) ───────────────────────────────────────────────────────
function confidenceTier(n) {
  if (n >= 100) return 'high'
  if (n >= 20) return 'medium'
  return 'low'
}
// Below the criterion's own min_sample_size there simply isn't enough data — full marks (never
// punish a new seller for a metric it hasn't accumulated yet) and dataSufficient:false so the UI
// can show "Not enough data" instead of a real bar.
function insufficientData(maxPoints) {
  return { score: maxPoints, dataSufficient: false, sampleSize: 0, confidence: 'low' }
}

// ── Generic bucket scorers (the actual editable part of a criterion's config) ─────────────────
function bucketPct(value, { excellent, good, average, poor }, lowerIsBetter) {
  if (lowerIsBetter) {
    if (value <= excellent) return 1
    if (value <= good) return 0.8
    if (value <= average) return 0.6
    if (value <= poor) return 0.3
    return 0
  }
  if (value >= excellent) return 1
  if (value >= good) return 0.8
  if (value >= average) return 0.6
  if (value >= poor) return 0.3
  return 0
}

function scoreThreshold(value, cfg, maxPoints, lowerIsBetter, sampleSize, minSampleSize) {
  if (value == null || sampleSize < minSampleSize) return insufficientData(maxPoints)
  const pct = bucketPct(value, cfg, lowerIsBetter)
  return {
    score: round2(pct * maxPoints), dataSufficient: true, sampleSize, confidence: confidenceTier(sampleSize),
  }
}

function scoreChecklist(passed, total, maxPoints) {
  if (!total) return { ...insufficientData(maxPoints), sampleSize: 0 }
  const pct = passed / total
  return { score: round2(pct * maxPoints), dataSufficient: true, sampleSize: total, confidence: confidenceTier(total) }
}

function scoreEventPenalty(events, maxPoints, pointsPerEvent, eventTypes) {
  const relevant = events.filter((e) => !e.resolved && eventTypes.includes(e.event_type))
  const score = Math.max(0, round2(maxPoints - relevant.length * pointsPerEvent))
  return { score, dataSufficient: true, sampleSize: events.length, confidence: 'high', events: relevant }
}

// ── Raw data fetch: one pass per seller, reused by every criterion below ──────────────────────
async function fetchSellerRawData(client, sellerId) {
  const sellerRes = await client.query(`SELECT * FROM seller_users WHERE seller_id = $1 LIMIT 1`, [sellerId])
  const seller = sellerRes.rows[0] || null

  const products = (await client.query(
    `SELECT id, title, description, sku, status, metadata, variants, created_at, updated_at
       FROM admin_hub_products WHERE seller_id = $1`,
    [sellerId],
  )).rows

  const orders = (await client.query(
    `SELECT o.id, o.order_number, o.order_status, o.payment_status, o.delivery_status,
            o.created_at, o.shipped_at, o.delivery_date, o.tracking_number, o.carrier_name
       FROM store_orders o WHERE ${sqlOrderOwnedBySeller('o', '$1')}`,
    [sellerId],
  )).rows

  // store_returns.seller_id is not reliably populated (verified against live data) — always
  // resolve ownership through the order, the same way the rest of this codebase does.
  const returns = (await client.query(
    `SELECT r.id, r.order_id, r.status, r.reason, r.refund_status, r.created_at, r.approved_at
       FROM store_returns r
       JOIN store_orders o ON o.id = r.order_id
      WHERE ${sqlOrderOwnedBySeller('o', '$1')}`,
    [sellerId],
  )).rows

  const reviews = (await client.query(
    `SELECT id, rating, created_at FROM store_product_reviews WHERE seller_id = $1`,
    [sellerId],
  )).rows

  const supportCases = (await client.query(
    `SELECT id, status, created_at, closed_at FROM support_cases WHERE seller_id = $1`,
    [sellerId],
  )).rows
  const caseIds = supportCases.map((c) => c.id)
  const supportMessages = caseIds.length
    ? (await client.query(
        `SELECT case_id, sender_role, created_at FROM support_case_messages WHERE case_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
        [caseIds],
      )).rows
    : []

  const events = (await client.query(
    `SELECT id, event_type, severity, is_hard_block, resolved, details, created_at
       FROM seller_health_events WHERE seller_id = $1`,
    [sellerId],
  )).rows

  return { seller, products, orders, returns, reviews, supportCases, supportMessages, events }
}

// ── Compliance helpers (reuses this session's own compliance engine — never reimplemented) ────
async function resolveProductComplianceIssues(client, products) {
  const categoryIds = [...new Set(products.map((p) => p.metadata?.category_id || p.metadata?.admin_category_id).filter(Boolean))]
  const profileByCategory = new Map()
  for (const catId of categoryIds) {
    const profileId = await resolveCategoryComplianceProfileId(client, catId).catch(() => null)
    profileByCategory.set(catId, profileId || DEFAULT_PROFILE_ID)
  }
  const perProduct = products.map((p) => {
    const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {}
    const catId = meta.category_id || meta.admin_category_id || null
    const profileId = catId ? (profileByCategory.get(catId) || DEFAULT_PROFILE_ID) : DEFAULT_PROFILE_ID
    const result = validateProductCompliance(meta, profileId, 'DE')
    return { product: p, profileId, ...result }
  })
  return perProduct
}

// ── Per-criterion calculators. Each returns the generic score shape plus `details`/`issues` for
// the accordion UI. `raw` = fetchSellerRawData() result, `cfg` = the criterion's config JSONB
// (superuser-editable), `maxPoints` = the criterion's own max_points (also editable). ─────────
const CALCULATORS = {
  // ── Product & Content Quality ────────────────────────────────────────────────
  async content_completeness(raw, cfg, maxPoints) {
    const products = raw.products.filter((p) => p.status !== 'archived')
    const issues = { missing_title: [], missing_description: [], missing_bullets: [], missing_brand: [], missing_manufacturer: [], missing_ean: [], missing_sku: [], missing_images: [] }
    let passed = 0
    const checksPerProduct = 8
    let totalChecks = 0
    for (const p of products) {
      const m = p.metadata || {}
      const title = m.translations?.de?.title || p.title
      const description = m.translations?.de?.description || p.description
      const media = Array.isArray(m.media) ? m.media : []
      const checks = [
        [!!String(title || '').trim(), 'missing_title'],
        [!!String(description || '').trim(), 'missing_description'],
        [Array.isArray(m.bullet_points) && m.bullet_points.length > 0, 'missing_bullets'],
        [!!m.brand_id, 'missing_brand'],
        [!!String(m.hersteller || '').trim(), 'missing_manufacturer'],
        [!!extractEanFromHubProductRow(p), 'missing_ean'],
        [!!String(p.sku || '').trim(), 'missing_sku'],
        [media.length > 0, 'missing_images'],
      ]
      totalChecks += checksPerProduct
      for (const [ok, key] of checks) {
        if (ok) passed += 1
        else issues[key].push(p.id)
      }
    }
    const result = scoreChecklist(passed, totalChecks, maxPoints)
    return {
      ...result,
      currentValue: totalChecks ? round1((passed / totalChecks) * 100) : null,
      targetValue: 100,
      unit: 'percent_complete',
      totalProducts: products.length,
      issues: Object.entries(issues).filter(([, ids]) => ids.length).map(([key, ids]) => ({ key, count: ids.length, productIds: ids.slice(0, 50) })),
    }
  },

  async content_quality(raw, cfg, maxPoints) {
    const products = raw.products.filter((p) => p.status !== 'archived')
    const minLen = cfg.minDescriptionLength || 40
    const titleCounts = new Map()
    for (const p of products) {
      const t = String(p.metadata?.translations?.de?.title || p.title || '').trim().toLowerCase()
      if (t) titleCounts.set(t, (titleCounts.get(t) || 0) + 1)
    }
    let passed = 0
    const shortDescription = [], duplicateTitle = [], noImages = []
    const checksPerProduct = 3
    let total = 0
    for (const p of products) {
      const m = p.metadata || {}
      const description = String(m.translations?.de?.description || p.description || '').replace(/<[^>]*>/g, '').trim()
      const title = String(m.translations?.de?.title || p.title || '').trim().toLowerCase()
      const media = Array.isArray(m.media) ? m.media : []
      total += checksPerProduct
      if (description.length >= minLen) passed += 1; else shortDescription.push(p.id)
      if (!title || (titleCounts.get(title) || 0) <= 1) passed += 1; else duplicateTitle.push(p.id)
      if (media.length > 0) passed += 1; else noImages.push(p.id)
    }
    const result = scoreChecklist(passed, total, maxPoints)
    return {
      ...result,
      currentValue: total ? round1((passed / total) * 100) : null,
      targetValue: 100,
      unit: 'percent_complete',
      totalProducts: products.length,
      issues: [
        shortDescription.length && { key: 'short_description', count: shortDescription.length, productIds: shortDescription.slice(0, 50) },
        duplicateTitle.length && { key: 'duplicate_title', count: duplicateTitle.length, productIds: duplicateTitle.slice(0, 50) },
        noImages.length && { key: 'no_images', count: noImages.length, productIds: noImages.slice(0, 50) },
      ].filter(Boolean),
    }
  },

  async data_accuracy(raw, cfg, maxPoints) {
    const products = raw.products.filter((p) => p.status !== 'archived')
    let passed = 0
    const missingCategory = [], missingPrice = []
    const checksPerProduct = 2
    let total = 0
    for (const p of products) {
      const m = p.metadata || {}
      total += checksPerProduct
      if (m.category_id || m.admin_category_id) passed += 1; else missingCategory.push(p.id)
      if (Number(p.price_cents) > 0 || Number(m.price_cents) > 0) passed += 1; else missingPrice.push(p.id)
    }
    const result = scoreChecklist(passed, total, maxPoints)
    return {
      ...result,
      currentValue: total ? round1((passed / total) * 100) : null,
      targetValue: 100,
      unit: 'percent_complete',
      totalProducts: products.length,
      issues: [
        missingCategory.length && { key: 'missing_category', count: missingCategory.length, productIds: missingCategory.slice(0, 50) },
        missingPrice.length && { key: 'missing_price', count: missingPrice.length, productIds: missingPrice.slice(0, 50) },
      ].filter(Boolean),
    }
  },

  async legal_product_data(raw, cfg, maxPoints, ctx) {
    const products = raw.products.filter((p) => p.status !== 'archived')
    if (!products.length) return { ...insufficientData(maxPoints), currentValue: null, targetValue: 100, totalProducts: 0, issues: [] }
    const perProduct = await resolveProductComplianceIssues(ctx.client, products)
    const fieldCounts = new Map()
    for (const { missing } of perProduct) {
      for (const key of missing) fieldCounts.set(key, (fieldCounts.get(key) || 0) + 1)
    }
    // Score by "products with zero missing fields" ratio (harsher, and simpler to reason about
    // than counting field-slots, which double-counts products missing many fields at once).
    const cleanCount = perProduct.filter((r) => r.missing.length === 0).length
    const result = scoreChecklist(cleanCount, perProduct.length, maxPoints)
    return {
      ...result,
      currentValue: perProduct.length ? round1((cleanCount / perProduct.length) * 100) : null,
      targetValue: 100,
      unit: 'percent_complete',
      totalProducts: perProduct.length,
      issues: [...fieldCounts.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count })),
    }
  },

  async catalog_quality_signals(raw, cfg, maxPoints) {
    const products = raw.products.filter((p) => p.status !== 'archived')
    const eanCounts = new Map()
    for (const p of products) {
      const ean = extractEanFromHubProductRow(p)
      if (ean) eanCounts.set(ean, (eanCounts.get(ean) || 0) + 1)
    }
    let passed = 0
    const duplicateEan = [], malformedSku = [], missingCategory = []
    const checksPerProduct = 3
    let total = 0
    for (const p of products) {
      const ean = extractEanFromHubProductRow(p)
      const sku = String(p.sku || '').trim()
      const m = p.metadata || {}
      total += checksPerProduct
      if (!ean || (eanCounts.get(ean) || 0) <= 1) passed += 1; else duplicateEan.push(p.id)
      if (sku && !/\s/.test(sku)) passed += 1; else if (!sku) { passed += 1 } else malformedSku.push(p.id)
      if (m.category_id || m.admin_category_id) passed += 1; else missingCategory.push(p.id)
    }
    const result = scoreChecklist(passed, total, maxPoints)
    return {
      ...result,
      currentValue: total ? round1((passed / total) * 100) : null,
      targetValue: 100,
      unit: 'percent_complete',
      totalProducts: products.length,
      issues: [
        duplicateEan.length && { key: 'duplicate_ean', count: duplicateEan.length, productIds: duplicateEan.slice(0, 50) },
        malformedSku.length && { key: 'malformed_sku', count: malformedSku.length, productIds: malformedSku.slice(0, 50) },
        missingCategory.length && { key: 'missing_category', count: missingCategory.length, productIds: missingCategory.slice(0, 50) },
      ].filter(Boolean),
    }
  },

  // ── Legal & Compliance ────────────────────────────────────────────────────────
  async seller_verification(raw, cfg, maxPoints) {
    const s = raw.seller || {}
    const checks = [
      ['approved', ['approved', 'active'].includes(String(s.approval_status || '').toLowerCase())],
      ['company_name', !!String(s.company_name || '').trim()],
      ['tax_id', !!String(s.tax_id || '').trim()],
      ['vat_id', !!String(s.vat_id || '').trim()],
      ['iban', !!String(s.iban || '').trim()],
      ['business_address', !!(s.business_address && (s.business_address.street || s.business_address.city))],
    ]
    const passed = checks.filter(([, ok]) => ok).length
    const result = scoreChecklist(passed, checks.length, maxPoints)
    return {
      ...result,
      currentValue: round1((passed / checks.length) * 100), targetValue: 100, unit: 'percent_complete',
      issues: checks.filter(([, ok]) => !ok).map(([key]) => ({ key, count: 1 })),
    }
  },

  async marketplace_compliance(raw, cfg, maxPoints) {
    const s = raw.seller || {}
    const docs = Array.isArray(s.documents) ? s.documents : []
    const checks = [
      ['agreement_accepted', !!s.agreement_accepted],
      ['documents_submitted', docs.length > 0],
      ['lucid_number', !!String(s.lucid_number || '').trim()],
    ]
    const passed = checks.filter(([, ok]) => ok).length
    const result = scoreChecklist(passed, checks.length, maxPoints)
    return {
      ...result,
      currentValue: round1((passed / checks.length) * 100), targetValue: 100, unit: 'percent_complete',
      issues: checks.filter(([, ok]) => !ok).map(([key]) => ({ key, count: 1 })),
    }
  },

  async product_compliance(raw, cfg, maxPoints, ctx) {
    const products = raw.products.filter((p) => p.status !== 'archived')
    if (!products.length) return { ...insufficientData(maxPoints), currentValue: null, targetValue: 100, totalProducts: 0, issues: [] }
    const perProduct = await resolveProductComplianceIssues(ctx.client, products)
    const cleanCount = perProduct.filter((r) => r.missing.length === 0 && r.invalid.length === 0).length
    const result = scoreChecklist(cleanCount, perProduct.length, maxPoints)
    const dirty = perProduct.filter((r) => r.missing.length > 0 || r.invalid.length > 0)
    return {
      ...result,
      currentValue: round1((cleanCount / perProduct.length) * 100), targetValue: 100, unit: 'percent_compliant',
      totalProducts: perProduct.length,
      issues: [{ key: 'non_compliant_products', count: dirty.length, productIds: dirty.map((r) => r.product.id).slice(0, 50) }].filter((i) => i.count),
    }
  },

  async legal_document_completeness(raw, cfg, maxPoints) {
    const s = raw.seller || {}
    const docs = Array.isArray(s.documents) ? s.documents : []
    const docTypes = new Set(docs.map((d) => d?.doc_type))
    const checks = [
      ['trade_register', docTypes.has('trade_register')],
      ['id_passport', docTypes.has('id_passport')],
      ['lucid_number', !!String(s.lucid_number || '').trim()],
    ]
    const passed = checks.filter(([, ok]) => ok).length
    const result = scoreChecklist(passed, checks.length, maxPoints)
    return {
      ...result,
      currentValue: round1((passed / checks.length) * 100), targetValue: 100, unit: 'percent_complete',
      issues: checks.filter(([, ok]) => !ok).map(([key]) => ({ key, count: 1 })),
    }
  },

  async compliance_violations(raw, cfg, maxPoints) {
    const r = scoreEventPenalty(raw.events, maxPoints, cfg.pointsPerEvent ?? 1, cfg.eventTypes || [])
    return { ...r, currentValue: r.events.length, targetValue: 0, unit: 'count', issues: r.events.map((e) => ({ key: e.event_type, count: 1, eventId: e.id, details: e.details })) }
  },

  // ── Order Fulfillment ─────────────────────────────────────────────────────────
  async order_processing_time(raw, cfg, maxPoints) {
    const shipped = raw.orders.filter((o) => o.shipped_at)
    const hours = shipped.map((o) => hoursBetween(o.created_at, o.shipped_at)).filter((h) => h != null && h >= 0)
    const avg = mean(hours)
    const r = scoreThreshold(avg, cfg, maxPoints, true, hours.length, 5)
    return { ...r, currentValue: round1(avg), targetValue: cfg.excellent, unit: 'hours', issues: [] }
  },

  async cancellation_rate(raw, cfg, maxPoints) {
    const total = raw.orders.length
    const cancelled = raw.orders.filter((o) => o.order_status === 'storniert')
    const rate = total ? cancelled.length / total : null
    const r = scoreThreshold(rate, cfg, maxPoints, true, total, 5)
    return {
      ...r, currentValue: rate != null ? round2(rate) : null, targetValue: cfg.excellent, unit: 'ratio',
      totalOrders: total,
      issues: cancelled.length ? [{ key: 'cancelled_orders', count: cancelled.length, orderIds: cancelled.map((o) => o.id).slice(0, 50) }] : [],
    }
  },

  async order_defect_rate(raw, cfg, maxPoints) {
    const total = raw.orders.length
    const defectKeywords = ['defekt', 'beschädigt', 'falsch', 'nicht wie beschrieben', 'wrong', 'damaged']
    const defectOrderIds = new Set(
      raw.returns.filter((r) => defectKeywords.some((k) => String(r.reason || '').toLowerCase().includes(k))).map((r) => r.order_id),
    )
    const rate = total ? defectOrderIds.size / total : null
    const r = scoreThreshold(rate, cfg, maxPoints, true, total, 5)
    return {
      ...r, currentValue: rate != null ? round2(rate) : null, targetValue: cfg.excellent, unit: 'ratio',
      totalOrders: total,
      issues: defectOrderIds.size ? [{ key: 'defect_orders', count: defectOrderIds.size, orderIds: [...defectOrderIds].slice(0, 50) }] : [],
    }
  },

  async order_confirmation_accuracy(raw, cfg, maxPoints) {
    const total = raw.orders.length
    const stallHours = cfg.stallHours || 48
    const now = Date.now()
    const stalled = raw.orders.filter((o) => {
      if (o.delivery_status !== 'offen' && o.order_status !== 'offen') return false
      const ageHours = (now - new Date(o.created_at).getTime()) / MS_PER_HOUR
      return ageHours > stallHours
    })
    const rate = total ? (total - stalled.length) / total : null
    const r = scoreThreshold(rate, cfg, maxPoints, false, total, 5)
    return {
      ...r, currentValue: rate != null ? round2(rate) : null, targetValue: cfg.excellent, unit: 'ratio',
      totalOrders: total,
      issues: stalled.length ? [{ key: 'stalled_orders', count: stalled.length, orderIds: stalled.map((o) => o.id).slice(0, 50) }] : [],
    }
  },

  async sla_compliance(raw, cfg, maxPoints) {
    const shipped = raw.orders.filter((o) => o.shipped_at)
    if (!shipped.length) return { ...insufficientData(maxPoints), currentValue: null, targetValue: cfg.excellent, unit: 'ratio' }
    const defectKeywords = ['defekt', 'beschädigt', 'falsch', 'nicht wie beschrieben', 'wrong', 'damaged']
    const defectOrderIds = new Set(
      raw.returns.filter((r) => defectKeywords.some((k) => String(r.reason || '').toLowerCase().includes(k))).map((r) => r.order_id),
    )
    const target = 48 // hours — a fixed, documented "shipped within 48h" bar independent of the processing-time criterion's own editable thresholds
    const compliant = shipped.filter((o) => {
      const h = hoursBetween(o.created_at, o.shipped_at)
      return h != null && h <= target && !defectOrderIds.has(o.id)
    })
    const rate = compliant.length / shipped.length
    const r = scoreThreshold(rate, cfg, maxPoints, false, shipped.length, 5)
    return { ...r, currentValue: round2(rate), targetValue: cfg.excellent, unit: 'ratio', issues: [] }
  },

  // ── Shipping Performance ──────────────────────────────────────────────────────
  async dispatch_time(raw, cfg, maxPoints) {
    const shipped = raw.orders.filter((o) => o.shipped_at)
    const hours = shipped.map((o) => hoursBetween(o.created_at, o.shipped_at)).filter((h) => h != null && h >= 0)
    const avg = mean(hours)
    const r = scoreThreshold(avg, cfg, maxPoints, true, hours.length, 5)
    return { ...r, currentValue: round1(avg), targetValue: cfg.excellent, unit: 'hours', issues: [] }
  },

  async delivery_time(raw, cfg, maxPoints) {
    const delivered = raw.orders.filter((o) => o.shipped_at && o.delivery_date)
    const hours = delivered.map((o) => hoursBetween(o.shipped_at, o.delivery_date)).filter((h) => h != null && h >= 0)
    const avg = mean(hours)
    const r = scoreThreshold(avg, cfg, maxPoints, true, hours.length, 5)
    return { ...r, currentValue: round1(avg), targetValue: cfg.excellent, unit: 'hours', issues: [] }
  },

  async on_time_delivery_rate(raw, cfg, maxPoints) {
    const delivered = raw.orders.filter((o) => o.shipped_at && o.delivery_date)
    if (!delivered.length) return { ...insufficientData(maxPoints), currentValue: null, targetValue: cfg.excellent, unit: 'ratio' }
    const targetDays = cfg.targetDays || 5
    const onTime = delivered.filter((o) => hoursBetween(o.shipped_at, o.delivery_date) <= targetDays * 24)
    const rate = onTime.length / delivered.length
    const r = scoreThreshold(rate, cfg, maxPoints, false, delivered.length, 5)
    return { ...r, currentValue: round2(rate), targetValue: cfg.excellent, unit: 'ratio', issues: [] }
  },

  async tracking_quality(raw, cfg, maxPoints) {
    const shipped = raw.orders.filter((o) => o.shipped_at)
    if (!shipped.length) return { ...insufficientData(maxPoints), currentValue: null, targetValue: cfg.excellent, unit: 'ratio' }
    const withTracking = shipped.filter((o) => String(o.tracking_number || '').trim() && String(o.carrier_name || '').trim())
    const rate = withTracking.length / shipped.length
    const r = scoreThreshold(rate, cfg, maxPoints, false, shipped.length, 5)
    const missing = shipped.filter((o) => !(String(o.tracking_number || '').trim() && String(o.carrier_name || '').trim()))
    return {
      ...r, currentValue: round2(rate), targetValue: cfg.excellent, unit: 'ratio',
      issues: missing.length ? [{ key: 'missing_tracking', count: missing.length, orderIds: missing.map((o) => o.id).slice(0, 50) }] : [],
    }
  },

  async shipping_incident_rate(raw, cfg, maxPoints) {
    const shipped = raw.orders.filter((o) => o.shipped_at)
    const incidentKeywords = ['verloren', 'lost', 'transit', 'kaputt']
    const incidentOrderIds = new Set(
      raw.returns.filter((r) => incidentKeywords.some((k) => String(r.reason || '').toLowerCase().includes(k))).map((r) => r.order_id),
    )
    const rate = shipped.length ? incidentOrderIds.size / shipped.length : null
    const r = scoreThreshold(rate, cfg, maxPoints, true, shipped.length, 5)
    return {
      ...r, currentValue: rate != null ? round2(rate) : null, targetValue: cfg.excellent, unit: 'ratio',
      issues: incidentOrderIds.size ? [{ key: 'shipping_incidents', count: incidentOrderIds.size, orderIds: [...incidentOrderIds].slice(0, 50) }] : [],
    }
  },

  // ── Returns & Refunds ─────────────────────────────────────────────────────────
  async return_rate(raw, cfg, maxPoints) {
    const total = raw.orders.length
    if (!total) return { ...insufficientData(maxPoints), currentValue: null, targetValue: cfg.excellent, unit: 'ratio' }
    const sellerFaultKeywords = ['defekt', 'beschädigt', 'falsch', 'nicht wie beschrieben', 'wrong', 'damaged']
    const weight = cfg.sellerFaultWeight || 2
    let weightedCount = 0
    for (const r of raw.returns) {
      const isSellerFault = sellerFaultKeywords.some((k) => String(r.reason || '').toLowerCase().includes(k))
      weightedCount += isSellerFault ? weight : 1
    }
    const rate = weightedCount / total
    const res = scoreThreshold(rate, cfg, maxPoints, true, total, 5)
    return {
      ...res, currentValue: round2(raw.returns.length / total), targetValue: cfg.excellent, unit: 'ratio',
      totalReturns: raw.returns.length, totalOrders: total,
      issues: [],
    }
  },

  async return_processing_time(raw, cfg, maxPoints) {
    const closed = raw.returns.filter((r) => r.approved_at)
    const hours = closed.map((r) => hoursBetween(r.created_at, r.approved_at)).filter((h) => h != null && h >= 0)
    const avg = mean(hours)
    const r = scoreThreshold(avg, cfg, maxPoints, true, hours.length, 3)
    return { ...r, currentValue: round1(avg), targetValue: cfg.excellent, unit: 'hours', issues: [] }
  },

  async refund_sla_compliance(raw, cfg, maxPoints) {
    const closed = raw.returns.filter((r) => r.approved_at)
    if (!closed.length) return { ...insufficientData(maxPoints), currentValue: null, targetValue: cfg.excellent, unit: 'ratio' }
    const targetHours = cfg.targetHours || 72
    const compliant = closed.filter((r) => hoursBetween(r.created_at, r.approved_at) <= targetHours)
    const rate = compliant.length / closed.length
    const r = scoreThreshold(rate, cfg, maxPoints, false, closed.length, 3)
    return { ...r, currentValue: round2(rate), targetValue: cfg.excellent, unit: 'ratio', issues: [] }
  },

  async refund_error_rate(raw, cfg, maxPoints) {
    return { score: maxPoints, dataSufficient: true, sampleSize: 0, confidence: 'high', currentValue: null, targetValue: null, unit: 'not_automated', issues: [] }
  },

  // ── Customer Satisfaction ─────────────────────────────────────────────────────
  async product_rating(raw, cfg, maxPoints) {
    const n = raw.reviews.length
    if (!n) return { ...insufficientData(maxPoints), currentValue: null, targetValue: cfg.excellent, unit: 'stars' }
    const avg = mean(raw.reviews.map((r) => Number(r.rating)))
    const pct = bucketPct(avg, cfg, false)
    // Confidence dampening (spec §9.1): a 4.9 from 10 reviews shouldn't score like a 4.9 from
    // 10,000 — blend toward a neutral 70% until the sample is large enough to trust fully.
    const confidenceFactor = n >= 100 ? 1 : n >= 20 ? 0.85 : 0.65
    const blendedPct = pct * confidenceFactor + 0.7 * (1 - confidenceFactor)
    return {
      score: round2(blendedPct * maxPoints), dataSufficient: true, sampleSize: n, confidence: confidenceTier(n),
      currentValue: round2(avg), targetValue: cfg.excellent, unit: 'stars', issues: [],
    }
  },

  async negative_review_rate(raw, cfg, maxPoints) {
    const n = raw.reviews.length
    if (!n) return { ...insufficientData(maxPoints), currentValue: null, targetValue: cfg.excellent, unit: 'ratio' }
    const negative = raw.reviews.filter((r) => Number(r.rating) <= 2)
    const rate = negative.length / n
    const r = scoreThreshold(rate, cfg, maxPoints, true, n, 5)
    return { ...r, currentValue: round2(rate), targetValue: cfg.excellent, unit: 'ratio', issues: [] }
  },

  async complaint_rate(raw, cfg, maxPoints) {
    const totalOrders = raw.orders.length
    if (!totalOrders) return { ...insufficientData(maxPoints), currentValue: null, targetValue: cfg.excellent, unit: 'ratio' }
    const rate = raw.supportCases.length / totalOrders
    const r = scoreThreshold(rate, cfg, maxPoints, true, totalOrders, 5)
    return { ...r, currentValue: round2(rate), targetValue: cfg.excellent, unit: 'ratio', issues: [] }
  },

  async satisfaction_trend(raw, cfg, maxPoints) {
    const now = Date.now()
    const d30 = now - 30 * 24 * MS_PER_HOUR
    const d60 = now - 60 * 24 * MS_PER_HOUR
    const recent = raw.reviews.filter((r) => new Date(r.created_at).getTime() >= d30)
    const prior = raw.reviews.filter((r) => new Date(r.created_at).getTime() >= d60 && new Date(r.created_at).getTime() < d30)
    if (recent.length < 3 || prior.length < 3) return { ...insufficientData(maxPoints), currentValue: null, targetValue: cfg.excellent, unit: 'stars_delta' }
    const delta = mean(recent.map((r) => Number(r.rating))) - mean(prior.map((r) => Number(r.rating)))
    const r = scoreThreshold(delta, cfg, maxPoints, false, Math.min(recent.length, prior.length), 3)
    return { ...r, currentValue: round2(delta), targetValue: cfg.excellent, unit: 'stars_delta', issues: [] }
  },

  // ── Seller Reliability & Communication ───────────────────────────────────────
  async response_time(raw, cfg, maxPoints) {
    const firstReplyHours = []
    const byCase = new Map()
    for (const m of raw.supportMessages) {
      if (!byCase.has(m.case_id)) byCase.set(m.case_id, [])
      byCase.get(m.case_id).push(m)
    }
    for (const c of raw.supportCases) {
      const msgs = byCase.get(c.id) || []
      const firstSellerMsg = msgs.find((m) => m.sender_role === 'seller')
      if (firstSellerMsg) {
        const h = hoursBetween(c.created_at, firstSellerMsg.created_at)
        if (h != null && h >= 0) firstReplyHours.push(h)
      }
    }
    const avg = mean(firstReplyHours)
    const r = scoreThreshold(avg, cfg, maxPoints, true, firstReplyHours.length, 2)
    return { ...r, currentValue: round1(avg), targetValue: cfg.excellent, unit: 'hours', issues: [] }
  },

  async response_rate(raw, cfg, maxPoints) {
    const total = raw.supportCases.length
    if (!total) return { ...insufficientData(maxPoints), currentValue: null, targetValue: cfg.excellent, unit: 'ratio' }
    const repliedCaseIds = new Set(raw.supportMessages.filter((m) => m.sender_role === 'seller').map((m) => m.case_id))
    const rate = repliedCaseIds.size / total
    const r = scoreThreshold(rate, cfg, maxPoints, false, total, 2)
    return { ...r, currentValue: round2(rate), targetValue: cfg.excellent, unit: 'ratio', issues: [] }
  },

  async issue_resolution_time(raw, cfg, maxPoints) {
    const closed = raw.supportCases.filter((c) => c.closed_at)
    const hours = closed.map((c) => hoursBetween(c.created_at, c.closed_at)).filter((h) => h != null && h >= 0)
    const avg = mean(hours)
    const r = scoreThreshold(avg, cfg, maxPoints, true, hours.length, 2)
    return { ...r, currentValue: round1(avg), targetValue: cfg.excellent, unit: 'hours', issues: [] }
  },

  async seller_activity(raw, cfg, maxPoints) {
    const windowMs = (cfg.activeWindowDays || 30) * 24 * MS_PER_HOUR
    const cutoff = Date.now() - windowMs
    const recentOrder = raw.orders.some((o) => new Date(o.created_at).getTime() >= cutoff)
    const recentProductUpdate = raw.products.some((p) => p.updated_at && new Date(p.updated_at).getTime() >= cutoff)
    const active = recentOrder || recentProductUpdate
    return {
      score: active ? maxPoints : 0, dataSufficient: true, sampleSize: raw.orders.length + raw.products.length, confidence: 'high',
      currentValue: active ? 1 : 0, targetValue: 1, unit: 'boolean', issues: active ? [] : [{ key: 'inactive_seller', count: 1 }],
    }
  },

  // ── Risk & Trust ──────────────────────────────────────────────────────────────
  async fraud_signals(raw, cfg, maxPoints) {
    const r = scoreEventPenalty(raw.events, maxPoints, cfg.pointsPerEvent ?? 1, cfg.eventTypes || [])
    return { ...r, currentValue: r.events.length, targetValue: 0, unit: 'count', issues: r.events.map((e) => ({ key: e.event_type, count: 1, eventId: e.id, details: e.details })) }
  },

  async chargeback_rate(raw, cfg, maxPoints) {
    return { score: maxPoints, dataSufficient: true, sampleSize: 0, confidence: 'high', currentValue: null, targetValue: null, unit: 'not_automated', issues: [] }
  },

  async policy_violation_history(raw, cfg, maxPoints) {
    const r = scoreEventPenalty(raw.events, maxPoints, cfg.pointsPerEvent ?? 0.5, cfg.eventTypes || [])
    return { ...r, currentValue: r.events.length, targetValue: 0, unit: 'count', issues: r.events.map((e) => ({ key: e.event_type, count: 1, eventId: e.id, details: e.details })) }
  },

  async trust_signals(raw, cfg, maxPoints) {
    const s = raw.seller || {}
    const tenureMonths = s.created_at ? (Date.now() - new Date(s.created_at).getTime()) / (30 * 24 * MS_PER_HOUR) : 0
    const orderCount = raw.orders.length
    const verified = ['approved', 'active'].includes(String(s.approval_status || '').toLowerCase())
    const tenurePct = Math.min(1, tenureMonths / (cfg.tenureMonthsForFull || 12))
    const volumePct = Math.min(1, orderCount / (cfg.orderCountForFull || 100))
    const pct = (tenurePct * 0.4 + volumePct * 0.4 + (verified ? 1 : 0) * 0.2)
    return {
      score: round2(pct * maxPoints), dataSufficient: true, sampleSize: orderCount, confidence: confidenceTier(orderCount),
      currentValue: round1(pct * 100), targetValue: 100, unit: 'percent_complete', issues: [],
    }
  },
}

module.exports = { fetchSellerRawData, CALCULATORS, hoursBetween, mean, round1, round2, confidenceTier }
