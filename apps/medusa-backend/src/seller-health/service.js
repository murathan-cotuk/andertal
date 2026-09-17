'use strict'

const { CATEGORIES: DEFAULT_CATEGORIES, CRITERIA: DEFAULT_CRITERIA } = require('./defaults')
const { fetchSellerRawData, CALCULATORS } = require('./calculators')

// Hard-block event types that ALWAYS force status=BLOCKED regardless of score (spec §2/§13) —
// distinct from the ones that merely deduct points (compliance_violations/fraud_signals/
// policy_violation_history criteria) via the row's own `is_hard_block` flag, checked live rather
// than hardcoded here so a superuser can mark any future event type as hard-blocking.
function evaluateHardBlock(seller, events) {
  const reasons = []
  if (!seller || !['approved', 'active'].includes(String(seller.approval_status || '').toLowerCase())) {
    reasons.push({ key: 'verification_incomplete', label: 'Seller verification is not complete' })
  }
  for (const e of events) {
    if (!e.resolved && e.is_hard_block) {
      reasons.push({ key: e.event_type, label: e.details?.label || e.event_type, eventId: e.id })
    }
  }
  return { isBlocked: reasons.length > 0, reasons }
}

// Score → status bucket (spec §2). Keys are stable i18n lookup ids — the frontend owns the
// actual label strings/colors per locale, this never returns human text.
function statusForScore(score) {
  if (score == null) return 'insufficient_data'
  if (score >= 90) return 'excellent'
  if (score >= 80) return 'very_good'
  if (score >= 70) return 'good'
  if (score >= 60) return 'average'
  if (score >= 40) return 'poor'
  return 'risky'
}

async function loadConfig(client) {
  const cats = (await client.query(`SELECT * FROM seller_health_categories_config ORDER BY sort_order ASC`)).rows
  const crit = (await client.query(`SELECT * FROM seller_health_criteria_config ORDER BY sort_order ASC`)).rows
  return { categories: cats, criteria: crit }
}

/**
 * Core entry point — computes a seller's full health breakdown against LIVE data (never a
 * cached snapshot; snapshotSellerHealth() below is what persists a point-in-time copy for
 * history/trend charts). Safe to call on demand (e.g. "Recalculate now"), not just from the
 * daily job.
 */
async function calculateSellerHealth(client, sellerId, config) {
  const cfg = config || (await loadConfig(client))
  const raw = await fetchSellerRawData(client, sellerId)

  if (!raw.seller) {
    return { sellerId, notFound: true }
  }

  const overallDataSufficient = raw.products.length > 0 || raw.orders.length > 0
  const hardBlock = evaluateHardBlock(raw.seller, raw.events)

  if (!overallDataSufficient) {
    return {
      sellerId,
      seller: { seller_id: sellerId, store_name: raw.seller.store_name },
      overallDataSufficient: false,
      totalScore: null,
      status: 'insufficient_data',
      isBlocked: hardBlock.isBlocked,
      blockReasons: hardBlock.reasons,
      categories: cfg.categories.map((c) => ({
        id: c.id, label: c.label, maxPoints: Number(c.max_points), score: null, dataSufficient: false, criteria: [],
      })),
      issues: [],
      calculatedAt: new Date().toISOString(),
    }
  }

  const categories = []
  const issues = []
  let totalScore = 0
  let totalMax = 0

  for (const cat of cfg.categories) {
    if (!cat.enabled) continue
    const catCriteria = cfg.criteria.filter((c) => c.category_id === cat.id)
    const criteriaResults = []
    let catScore = 0
    let catMax = 0

    for (const crit of catCriteria) {
      if (!crit.enabled) continue
      const calculator = CALCULATORS[crit.id]
      const maxPoints = Number(crit.max_points)
      catMax += maxPoints
      if (!calculator) {
        // Config references a criterion id with no implementation (e.g. a superuser-added
        // custom row via Edit All that doesn't map to code yet) — never silently drop points
        // from the total, award them and flag it instead of crashing the whole score.
        criteriaResults.push({ id: crit.id, label: crit.label, maxPoints, score: maxPoints, dataSufficient: false, notImplemented: true })
        catScore += maxPoints
        continue
      }
      let result
      try {
        result = await calculator(raw, crit.config || {}, maxPoints, { client })
      } catch (e) {
        console.error(`seller-health calculator "${crit.id}" failed:`, e?.message || e)
        result = { score: maxPoints, dataSufficient: false, error: e?.message || 'calculation failed' }
      }
      const score = Math.max(0, Math.min(maxPoints, Number(result.score)))
      catScore += score
      const pointsLost = Math.round((maxPoints - score) * 100) / 100
      criteriaResults.push({
        id: crit.id, label: crit.label, description: crit.description, unit: crit.unit,
        maxPoints, score: Math.round(score * 100) / 100, pointsLost,
        currentValue: result.currentValue ?? null, targetValue: result.targetValue ?? null,
        dataSufficient: result.dataSufficient !== false, sampleSize: result.sampleSize ?? null,
        confidence: result.confidence || null, minSampleSize: Number(crit.min_sample_size || 0),
        issues: result.issues || [], totalProducts: result.totalProducts, totalOrders: result.totalOrders,
      })
      if (pointsLost > 0.05) {
        issues.push({
          criterionId: crit.id, categoryId: cat.id, label: crit.label, pointsLost,
          issueSummary: (result.issues || [])[0] || null, issueCount: (result.issues || []).length,
        })
      }
    }

    catScore = Math.round(catScore * 100) / 100
    categories.push({
      id: cat.id, label: cat.label, maxPoints: catMax, score: catScore,
      dataSufficient: criteriaResults.some((c) => c.dataSufficient),
      criteria: criteriaResults,
    })
    totalScore += catScore
    totalMax += catMax
  }

  totalScore = Math.round(totalScore * 100) / 100
  // Normalize to a 0-100 scale even if some categories/criteria are disabled and totalMax < 100,
  // so "Edit all" turning a criterion off never silently caps the visible score below 100.
  const normalizedScore = totalMax > 0 ? Math.round((totalScore / totalMax) * 100 * 100) / 100 : null

  issues.sort((a, b) => b.pointsLost - a.pointsLost)

  return {
    sellerId,
    seller: { seller_id: sellerId, store_name: raw.seller.store_name },
    overallDataSufficient: true,
    totalScore: normalizedScore,
    rawScore: totalScore, rawMax: totalMax,
    status: hardBlock.isBlocked ? 'blocked' : statusForScore(normalizedScore),
    isBlocked: hardBlock.isBlocked,
    blockReasons: hardBlock.reasons,
    categories,
    issues: issues.slice(0, 20),
    dataCounts: {
      products: raw.products.length, orders: raw.orders.length, returns: raw.returns.length,
      reviews: raw.reviews.length, supportCases: raw.supportCases.length,
    },
    calculatedAt: new Date().toISOString(),
  }
}

async function snapshotSellerHealth(client, sellerId, config) {
  const result = await calculateSellerHealth(client, sellerId, config)
  if (result.notFound) return result
  await client.query(
    `INSERT INTO seller_health_daily (seller_id, snapshot_date, total_score, status, is_blocked, block_reasons, category_scores, issues, data_sufficient)
     VALUES ($1, CURRENT_DATE, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
     ON CONFLICT (seller_id, snapshot_date) DO UPDATE SET
       total_score = EXCLUDED.total_score, status = EXCLUDED.status, is_blocked = EXCLUDED.is_blocked,
       block_reasons = EXCLUDED.block_reasons, category_scores = EXCLUDED.category_scores,
       issues = EXCLUDED.issues, data_sufficient = EXCLUDED.data_sufficient, created_at = now()`,
    [
      sellerId, result.totalScore, result.status, result.isBlocked,
      JSON.stringify(result.blockReasons || []), JSON.stringify(result.categories || []),
      JSON.stringify(result.issues || []), result.overallDataSufficient,
    ],
  )
  return result
}

async function snapshotAllSellers(client) {
  const config = await loadConfig(client)
  const sellers = (await client.query(`SELECT seller_id FROM seller_users WHERE is_superuser IS NOT TRUE`)).rows
  let ok = 0, failed = 0
  for (const row of sellers) {
    try {
      await snapshotSellerHealth(client, row.seller_id, config)
      ok += 1
    } catch (e) {
      failed += 1
      console.error('seller-health snapshotAllSellers failed for', row.seller_id, e?.message || e)
    }
  }
  return { ok, failed, total: sellers.length }
}

async function getSellerHealthHistory(client, sellerId, days = 90) {
  const rows = (await client.query(
    `SELECT snapshot_date, total_score, status, is_blocked, data_sufficient
       FROM seller_health_daily
      WHERE seller_id = $1 AND snapshot_date >= CURRENT_DATE - $2::int
      ORDER BY snapshot_date ASC`,
    [sellerId, days],
  )).rows
  return rows.map((r) => ({
    date: r.snapshot_date, score: r.total_score != null ? Number(r.total_score) : null,
    status: r.status, isBlocked: r.is_blocked, dataSufficient: r.data_sufficient,
  }))
}

module.exports = {
  DEFAULT_CATEGORIES, DEFAULT_CRITERIA,
  loadConfig, evaluateHardBlock, statusForScore,
  calculateSellerHealth, snapshotSellerHealth, snapshotAllSellers, getSellerHealthHistory,
}
