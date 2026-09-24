'use strict'
const { Router } = require('express')

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

const num = (v, fallback = 0) => (v === null || v === undefined || Number.isNaN(Number(v)) ? fallback : Number(v))
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Weighted average that skips components whose weight was zeroed out because the underlying
// signal has no data for this listing (e.g. no reviews yet) — a missing signal must not drag
// the score toward 0, it should just not vote.
function weightedAvg(parts) {
  let sum = 0
  let wsum = 0
  for (const [value, weight] of parts) {
    if (value == null || weight <= 0) continue
    sum += value * weight
    wsum += weight
  }
  return wsum > 0 ? sum / wsum : null
}

// GET /admin-hub/v1/analytics/product-sellers — superuser only.
// One row per catalog product that has at least one seller listing, each carrying every
// competing seller's offer plus a computed buybox recommendation. Nothing here writes to
// admin_hub_seller_listings or changes the live storefront buybox (store-products.js owns
// that) — this is a read-only comparison/decision-support view for the superuser.
const productSellerAnalyticsGET = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  const q = String(req.query.q || '').trim()
  const minSellers = Math.max(1, parseInt(req.query.min_sellers, 10) || 1)
  const limit = clamp(parseInt(req.query.limit, 10) || 200, 1, 1000)
  try {
    await client.connect()

    const listingsParams = []
    let searchClause = ''
    if (q) {
      listingsParams.push(`%${q}%`)
      searchClause = `WHERE p.title ILIKE $${listingsParams.length} OR p.metadata->>'ean' ILIKE $${listingsParams.length} OR p.an_id ILIKE $${listingsParams.length}`
    }
    const listingsRes = await client.query(
      `SELECT l.id, l.product_id::text AS product_id, l.seller_id, l.price_cents, l.inventory, l.status,
              l.orders_count, l.brand_id, l.created_at,
              p.title, p.metadata->>'thumbnail' AS thumbnail, p.metadata->>'ean' AS ean, p.an_id,
              su.store_name
         FROM admin_hub_seller_listings l
         JOIN admin_hub_products p ON p.id = l.product_id
         LEFT JOIN seller_users su ON su.seller_id = l.seller_id
         ${searchClause}
        ORDER BY l.product_id, l.created_at ASC`,
      listingsParams
    )
    const listings = listingsRes.rows || []
    if (!listings.length) {
      await client.end()
      return res.json({ products: [] })
    }

    const sellerIds = [...new Set(listings.map((l) => String(l.seller_id || '').trim()).filter(Boolean))]
    const brandIds = [...new Set(listings.map((l) => l.brand_id).filter(Boolean))]
    const productIds = [...new Set(listings.map((l) => l.product_id))]

    const [healthRes, reviewsRes, ordersRes, returnsRes, shipRes, brandsRes] = await Promise.all([
      client.query(
        `SELECT DISTINCT ON (seller_id) seller_id, total_score, is_blocked
           FROM seller_health_daily WHERE seller_id = ANY($1::text[])
          ORDER BY seller_id, snapshot_date DESC`,
        [sellerIds]
      ),
      client.query(
        `SELECT seller_id, product_id::text AS product_id, ROUND(AVG(rating)::numeric, 2)::float AS avg, COUNT(*)::int AS cnt
           FROM store_product_reviews
          WHERE seller_id = ANY($1::text[]) AND product_id = ANY($2::text[])
          GROUP BY seller_id, product_id`,
        [sellerIds, productIds]
      ),
      client.query(`SELECT seller_id, COUNT(*)::int AS cnt FROM store_orders WHERE seller_id = ANY($1::text[]) GROUP BY seller_id`, [sellerIds]),
      client.query(`SELECT seller_id, COUNT(*)::int AS cnt FROM store_returns WHERE seller_id = ANY($1::text[]) GROUP BY seller_id`, [sellerIds]),
      client.query(
        `SELECT seller_id, AVG(EXTRACT(EPOCH FROM (shipped_at - created_at)))::float AS avg_seconds
           FROM store_orders WHERE seller_id = ANY($1::text[]) AND shipped_at IS NOT NULL GROUP BY seller_id`,
        [sellerIds]
      ),
      brandIds.length
        ? client.query(`SELECT id::text AS id, seller_id, status, name FROM admin_hub_brands WHERE id = ANY($1::uuid[])`, [brandIds])
        : Promise.resolve({ rows: [] }),
    ])
    await client.end()

    const healthMap = new Map(healthRes.rows.map((r) => [r.seller_id, { score: r.total_score != null ? Number(r.total_score) : null, blocked: !!r.is_blocked }]))
    const reviewMap = new Map(reviewsRes.rows.map((r) => [`${r.seller_id}|${r.product_id}`, { avg: r.avg, cnt: r.cnt }]))
    const ordersMap = new Map(ordersRes.rows.map((r) => [r.seller_id, r.cnt]))
    const returnsMap = new Map(returnsRes.rows.map((r) => [r.seller_id, r.cnt]))
    const shipMap = new Map(shipRes.rows.map((r) => [r.seller_id, r.avg_seconds]))
    const brandMap = new Map(brandsRes.rows.map((r) => [r.id, r]))

    // Return rate and shipping speed are per-seller (no product_id on store_returns/store_orders
    // line items in the current schema) — this is a real limitation, surfaced to the UI via
    // `granularity: 'seller'` rather than silently presented as product-specific.
    const sellerStats = new Map()
    for (const sid of sellerIds) {
      const orders = ordersMap.get(sid) || 0
      const returns = returnsMap.get(sid) || 0
      sellerStats.set(sid, {
        generalScore: healthMap.get(sid)?.score ?? null,
        isBlocked: healthMap.get(sid)?.blocked || false,
        returnRate: orders > 0 ? returns / orders : null,
        shipHours: shipMap.has(sid) ? shipMap.get(sid) / 3600 : null,
      })
    }

    const byProduct = new Map()
    for (const l of listings) {
      if (!byProduct.has(l.product_id)) {
        byProduct.set(l.product_id, {
          id: l.product_id, title: l.title, thumbnail: l.thumbnail || null, ean: l.ean || null, an_id: l.an_id || null,
          listings: [],
        })
      }
      byProduct.get(l.product_id).listings.push(l)
    }

    const products = []
    for (const prod of byProduct.values()) {
      if (prod.listings.length < minSellers) continue
      const prices = prod.listings.map((l) => num(l.price_cents)).filter((p) => p > 0)
      const minPrice = prices.length ? Math.min(...prices) : 0
      const maxPrice = prices.length ? Math.max(...prices) : 0
      const firstAdderId = prod.listings.reduce((best, l) => (!best || new Date(l.created_at) < new Date(best.created_at) ? l : best), null)?.id

      const rows = prod.listings.map((l) => {
        const sid = String(l.seller_id || '').trim()
        const ss = sellerStats.get(sid) || { generalScore: null, returnRate: null, shipHours: null }
        const rev = reviewMap.get(`${sid}|${l.product_id}`) || null
        const price = num(l.price_cents)

        // priceScore: cheapest offer in this product's group = 100, most expensive = 40, scaled linearly.
        const priceScore = maxPrice > minPrice ? 100 - ((price - minPrice) / (maxPrice - minPrice)) * 60 : (price > 0 ? 100 : null)
        const reviewScore = rev && rev.cnt > 0 ? (rev.avg / 5) * 100 : null
        const salesScore = l.orders_count > 0 ? clamp(Math.log1p(l.orders_count) * 22, 0, 100) : null
        const stockScore = l.inventory > 0 ? 100 : 0

        const productScore = weightedAvg([
          [priceScore, 0.35],
          [reviewScore, 0.30],
          [salesScore, 0.20],
          [stockScore, 0.15],
        ])

        const generalScoreForCombine = ss.generalScore != null ? ss.generalScore : 50
        const productScoreForCombine = productScore != null ? productScore : 50
        const combinedScore = (generalScoreForCombine + productScoreForCombine) / 2

        // Brands are a shared global catalog (any seller can reference any brand_id that's
        // still active, e.g. an unregistered 'own' claim someone else added) — authorization
        // is about whether the specific claim the listing points to is still valid (active),
        // not about who originally created that brand row. A superseded/rejected claim (see
        // brands.js supersedeUnverifiedSameNameBrands) disqualifies it regardless of seller_id.
        const brand = l.brand_id ? brandMap.get(l.brand_id) : null
        const brandAuthorized = !l.brand_id || !!(brand && brand.status === 'active')

        return {
          listing_id: l.id,
          seller_id: sid,
          store_name: l.store_name || sid,
          price_cents: l.price_cents,
          inventory: l.inventory,
          status: l.status,
          orders_count: l.orders_count || 0,
          created_at: l.created_at,
          is_first_adder: l.id === firstAdderId,
          brand_authorized: brandAuthorized,
          brand_name: brand?.name || null,
          general_score: ss.generalScore,
          general_score_blocked: ss.isBlocked,
          return_rate: ss.returnRate,
          ship_hours: ss.shipHours,
          review_avg: rev?.avg ?? null,
          review_count: rev?.cnt ?? 0,
          product_score: productScore != null ? Math.round(productScore) : null,
          combined_score: Math.round(combinedScore),
          eligible_for_buybox: brandAuthorized && l.status === 'active' && l.inventory > 0 && !ss.isBlocked,
        }
      })

      const eligible = rows.filter((r) => r.eligible_for_buybox)
      eligible.sort((a, b) => (b.combined_score - a.combined_score) || (a.price_cents - b.price_cents))
      const winnerId = eligible[0]?.listing_id || null
      for (const r of rows) r.is_buybox = r.listing_id === winnerId

      rows.sort((a, b) => (b.is_buybox ? 1 : 0) - (a.is_buybox ? 1 : 0) || (b.combined_score - a.combined_score))

      products.push({
        id: prod.id, title: prod.title, thumbnail: prod.thumbnail, ean: prod.ean, an_id: prod.an_id,
        seller_count: rows.length,
        has_buybox_winner: !!winnerId,
        listings: rows,
      })
    }

    products.sort((a, b) => b.seller_count - a.seller_count || String(a.title || '').localeCompare(String(b.title || '')))
    res.json({ products: products.slice(0, limit), total: products.length })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('product-seller-analytics GET:', e)
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

module.exports = function createProductSellerAnalyticsRouter() {
  const router = Router()
  router.get('/admin-hub/v1/analytics/product-sellers', requireSuperuser, productSellerAnalyticsGET)
  return router
}
