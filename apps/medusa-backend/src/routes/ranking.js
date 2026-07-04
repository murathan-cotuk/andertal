'use strict'
const { Router } = require('express')

module.exports = function createRankingRouter({ storePublishedStatusSql }) {
  // Core compute function — re-usable, called by scheduler + manual trigger
  async function computeRankingFeatures() {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    const { Client } = require('pg')
    const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    try {
      await client.connect()
      const now = new Date()

      // 1. Aggregate raw signals from orders + events
      await client.query(`
        INSERT INTO product_ranking_features (
          product_id, seller_id, collection_id,
          sales_7d, sales_30d, sales_90d, gmv_30d_cents,
          impressions_30d, clicks_30d, add_to_cart_30d,
          review_avg, review_count, return_count_30d,
          price_cents, compare_at_price_cents, discount_pct,
          inventory, content_score, published_at,
          updated_at
        )
        SELECT
          p.id::text AS product_id,
          p.seller_id,
          p.collection_id::text,
          COALESCE(s7.cnt, 0) AS sales_7d,
          COALESCE(s30.cnt, 0) AS sales_30d,
          COALESCE(s90.cnt, 0) AS sales_90d,
          COALESCE(s30.gmv, 0) AS gmv_30d_cents,
          COALESCE(ev_imp.cnt, 0) AS impressions_30d,
          COALESCE(ev_clk.cnt, 0) AS clicks_30d,
          COALESCE(ev_atc.cnt, 0) AS add_to_cart_30d,
          COALESCE(rv.avg_rating, 0) AS review_avg,
          COALESCE(rv.cnt, 0) AS review_count,
          COALESCE(ret30.cnt, 0) AS return_count_30d,
          COALESCE(p.price_cents, 0) AS price_cents,
          COALESCE((p.metadata->>'compare_at_price_cents')::int, 0) AS compare_at_price_cents,
          CASE
            WHEN COALESCE((p.metadata->>'compare_at_price_cents')::int, 0) > COALESCE(p.price_cents, 0)
            THEN ROUND(((COALESCE((p.metadata->>'compare_at_price_cents')::int, 0) - COALESCE(p.price_cents, 0))::numeric
                 / NULLIF((p.metadata->>'compare_at_price_cents')::int, 0)::numeric) * 100, 2)
            ELSE 0
          END AS discount_pct,
          COALESCE(p.inventory, 0) AS inventory,
          -- Content score: title(0.25) + description(0.25) + price(0.25) + image(0.25)
          (
            CASE WHEN p.title IS NOT NULL AND p.title != '' THEN 0.25 ELSE 0 END +
            CASE WHEN p.description IS NOT NULL AND LENGTH(p.description) > 20 THEN 0.25 ELSE 0 END +
            CASE WHEN COALESCE(p.price_cents, 0) > 0 THEN 0.25 ELSE 0 END +
            CASE WHEN p.metadata->>'images' IS NOT NULL OR p.metadata->>'thumbnail' IS NOT NULL THEN 0.25 ELSE 0 END
          ) AS content_score,
          p.created_at AS published_at,
          NOW() AS updated_at
        FROM admin_hub_products p
        LEFT JOIN LATERAL (
          SELECT SUM(oi.quantity)::int AS cnt
          FROM store_order_items oi
          JOIN store_orders o ON o.id = oi.order_id
          WHERE oi.product_id = p.id::text
            AND o.created_at >= NOW() - INTERVAL '7 days'
            AND o.order_status NOT IN ('cancelled')
        ) s7 ON true
        LEFT JOIN LATERAL (
          SELECT SUM(oi.quantity)::int AS cnt, SUM(oi.quantity * oi.unit_price_cents)::bigint AS gmv
          FROM store_order_items oi
          JOIN store_orders o ON o.id = oi.order_id
          WHERE oi.product_id = p.id::text
            AND o.created_at >= NOW() - INTERVAL '30 days'
            AND o.order_status NOT IN ('cancelled')
        ) s30 ON true
        LEFT JOIN LATERAL (
          SELECT SUM(oi.quantity)::int AS cnt
          FROM store_order_items oi
          JOIN store_orders o ON o.id = oi.order_id
          WHERE oi.product_id = p.id::text
            AND o.created_at >= NOW() - INTERVAL '90 days'
            AND o.order_status NOT IN ('cancelled')
        ) s90 ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS cnt FROM product_events
          WHERE product_id = p.id::text AND event_type = 'impression'
            AND created_at >= NOW() - INTERVAL '30 days'
        ) ev_imp ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS cnt FROM product_events
          WHERE product_id = p.id::text AND event_type = 'click'
            AND created_at >= NOW() - INTERVAL '30 days'
        ) ev_clk ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS cnt FROM product_events
          WHERE product_id = p.id::text AND event_type = 'add_to_cart'
            AND created_at >= NOW() - INTERVAL '30 days'
        ) ev_atc ON true
        LEFT JOIN LATERAL (
          SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating, COUNT(*)::int AS cnt
          FROM store_product_reviews WHERE product_id = p.id::text
        ) rv ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS cnt
          FROM store_returns sr
          JOIN store_order_items oi ON oi.order_id = sr.order_id
          WHERE oi.product_id = p.id::text
            AND sr.created_at >= NOW() - INTERVAL '30 days'
        ) ret30 ON true
        WHERE ${storePublishedStatusSql('p.status')}
        ON CONFLICT (product_id) DO UPDATE SET
          seller_id           = EXCLUDED.seller_id,
          collection_id       = EXCLUDED.collection_id,
          sales_7d            = EXCLUDED.sales_7d,
          sales_30d           = EXCLUDED.sales_30d,
          sales_90d           = EXCLUDED.sales_90d,
          gmv_30d_cents       = EXCLUDED.gmv_30d_cents,
          impressions_30d     = EXCLUDED.impressions_30d,
          clicks_30d          = EXCLUDED.clicks_30d,
          add_to_cart_30d     = EXCLUDED.add_to_cart_30d,
          review_avg          = EXCLUDED.review_avg,
          review_count        = EXCLUDED.review_count,
          return_count_30d    = EXCLUDED.return_count_30d,
          price_cents         = EXCLUDED.price_cents,
          compare_at_price_cents = EXCLUDED.compare_at_price_cents,
          discount_pct        = EXCLUDED.discount_pct,
          inventory           = EXCLUDED.inventory,
          content_score       = EXCLUDED.content_score,
          published_at        = EXCLUDED.published_at,
          updated_at          = EXCLUDED.updated_at
      `)

      // 2. Normalize signals and compute scores
      // Get max values for normalization
      const maxR = await client.query(`
        SELECT
          GREATEST(MAX(sales_30d), 1)   AS max_sales,
          GREATEST(MAX(gmv_30d_cents), 1) AS max_gmv,
          GREATEST(MAX(clicks_30d), 1)  AS max_clicks,
          GREATEST(MAX(review_avg * LN(1 + review_count)), 0.001) AS max_review,
          GREATEST(MAX(sales_7d), 1)    AS max_sales_7d
        FROM product_ranking_features
      `)
      const mx = maxR.rows[0]

      await client.query(`
        UPDATE product_ranking_features SET
          -- CTR (avoid div/0)
          ctr_30d = CASE WHEN impressions_30d > 0 THEN ROUND((clicks_30d::numeric / impressions_30d), 4) ELSE 0 END,
          -- Popularity: weighted combination of normalized signals
          popularity_score = ROUND((
            0.40 * (LN(1 + sales_30d) / LN(1 + $1)) +
            0.30 * (LN(1 + gmv_30d_cents) / LN(1 + $2)) +
            0.20 * (LN(1 + clicks_30d) / LN(1 + $3)) +
            0.10 * (review_avg * LN(1 + review_count) / $4)
          )::numeric, 6),
          -- Freshness: exponential decay, half-life = 30d (overridden per strategy at query time)
          freshness_score = ROUND(EXP(-0.693 * GREATEST(0, EXTRACT(EPOCH FROM (NOW() - published_at)) / 86400) / 30.0)::numeric, 6),
          -- Velocity: recent 7d acceleration vs 30d baseline (trend signal)
          velocity_score = ROUND(CASE
            WHEN sales_30d > 0 THEN LEAST((sales_7d::numeric / sales_30d) / (7.0/30.0), 3.0) / 3.0
            WHEN sales_7d > 0 THEN 1.0
            ELSE 0.0
          END::numeric, 6),
          updated_at = NOW()
        WHERE true
      `, [mx.max_sales, mx.max_gmv, mx.max_clicks, mx.max_review])

      await client.end()
      console.log('[Ranking] Features computed for', (await (async () => {
        const c2 = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await c2.connect()
        const r = await c2.query('SELECT COUNT(*) FROM product_ranking_features')
        await c2.end()
        return r.rows[0].count
      })()), 'products at', new Date().toISOString())
    } catch (e) {
      console.error('[Ranking] Compute error:', e.message)
      try { await client.end() } catch (_) {}
    }
  }

  // GET /store/products/ranked — used by storefront to get sorted product IDs
  const storeProductsRankedGET = async (req, res) => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    let client
    try {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      const strategy = (req.query.strategy || 'default').replace(/[^a-z_]/g, '')
      const category_id = req.query.category_id || null
      const seller_id = req.query.seller_id || null
      const limit = Math.min(parseInt(req.query.limit) || 50, 200)
      const offset = parseInt(req.query.offset) || 0

      // Load strategy config
      const cfgR = await client.query(`SELECT config FROM ranking_config WHERE strategy = $1`, [strategy])
      const cfg = cfgR.rows[0]?.config || {}
      const w_pop     = parseFloat(cfg.w_popularity  ?? 0.45)
      const w_fresh   = parseFloat(cfg.w_freshness   ?? 0.15)
      const w_content = parseFloat(cfg.w_content     ?? 0.10)
      const w_disc    = parseFloat(cfg.w_discount    ?? 0.15)
      const w_seller  = parseFloat(cfg.w_seller      ?? 0.10)
      const w_vel     = parseFloat(cfg.w_velocity    ?? 0.05)
      const hl        = parseFloat(cfg.freshness_halflife_days ?? 30)
      const expl_k    = parseFloat(cfg.exploration_k ?? 0.25)
      const urgency_t = parseInt(cfg.urgency_threshold ?? 5)
      const diversity = parseInt(cfg.diversity_max_consecutive ?? 3)

      // Seller performance index (avg rating across their products)
      const sellerPerfR = await client.query(`
        SELECT seller_id,
          ROUND(AVG(review_avg) / 5.0, 4) AS perf
        FROM product_ranking_features
        WHERE review_count > 0
        GROUP BY seller_id
      `)
      const sellerPerf = {}
      for (const row of sellerPerfR.rows) sellerPerf[row.seller_id] = parseFloat(row.perf)

      // Build conditions
      const conditions = [`f.product_id IS NOT NULL`]
      const params = []
      if (category_id) { params.push(category_id); conditions.push(`f.collection_id = $${params.length}`) }
      if (seller_id)   { params.push(seller_id);   conditions.push(`f.seller_id = $${params.length}`) }
      // Strategy-specific filter: sales = must have discount
      if (strategy === 'sales') conditions.push(`f.discount_pct > 0`)

      const whereClause = conditions.join(' AND ')

      // Compute final score inline with strategy weights + freshness half-life override
      params.push(hl); const hlIdx = params.length
      params.push(expl_k); const exklIdx = params.length
      params.push(urgency_t); const urgIdx = params.length

      const r = await client.query(`
        SELECT
          f.product_id,
          f.seller_id,
          f.collection_id,
          f.sales_30d,
          f.gmv_30d_cents,
          f.review_avg,
          f.review_count,
          f.price_cents,
          f.discount_pct,
          f.inventory,
          f.content_score,
          f.published_at,
          f.popularity_score,
          f.velocity_score,
          -- Recompute freshness with strategy half-life
          ROUND(EXP(-0.693 * GREATEST(0, EXTRACT(EPOCH FROM (NOW() - f.published_at)) / 86400) / $${hlIdx})::numeric, 6) AS freshness,
          -- Exploration bonus: decays exponentially, stronger for newer products
          ROUND(($${exklIdx} * EXP(-0.693 * GREATEST(0, EXTRACT(EPOCH FROM (NOW() - f.published_at)) / 86400) / ($${hlIdx} * 0.5)))::numeric, 6) AS exploration_bonus,
          -- Low-stock urgency: tiny boost when near-selling-out
          CASE WHEN f.inventory > 0 AND f.inventory <= $${urgIdx} THEN 0.03 ELSE 0 END AS urgency_bonus,
          -- Return penalty
          CASE WHEN f.sales_30d > 0 THEN LEAST(f.return_count_30d::numeric / f.sales_30d, 0.5) * 0.15 ELSE 0 END AS return_penalty
        FROM product_ranking_features f
        JOIN admin_hub_products p ON p.id::text = f.product_id AND ${storePublishedStatusSql('p.status')}
        WHERE ${whereClause}
      `, params)

      // Score, apply seller performance, then diversity re-rank
      const rows = r.rows.map((row) => {
        const sp = sellerPerf[row.seller_id] ?? 0.5
        const score =
          w_pop     * parseFloat(row.popularity_score) +
          w_fresh   * parseFloat(row.freshness) +
          w_content * parseFloat(row.content_score) +
          w_disc    * Math.min(parseFloat(row.discount_pct) / 60.0, 1.0) +
          w_seller  * sp +
          w_vel     * parseFloat(row.velocity_score) +
          parseFloat(row.exploration_bonus) +
          parseFloat(row.urgency_bonus) -
          parseFloat(row.return_penalty)
        return { ...row, _score: score }
      })
      rows.sort((a, b) => b._score - a._score)

      // Diversity pass: smooth seller tax (not hard cap)
      const ranked = []
      const sellerConsec = {}
      for (const row of rows) {
        const sid = row.seller_id || '__none__'
        const consec = sellerConsec[sid] || 0
        // Apply diversity penalty: each additional consecutive slot from same seller = 15% score reduction
        const diversityPenalty = Math.max(0, consec - (diversity - 1)) * 0.15
        ranked.push({ ...row, _final_score: row._score - diversityPenalty })
        sellerConsec[sid] = consec + 1
        // Reset other sellers' consecutive count
        for (const k of Object.keys(sellerConsec)) {
          if (k !== sid) sellerConsec[k] = 0
        }
      }
      // Re-sort after diversity pass
      ranked.sort((a, b) => b._final_score - a._final_score)

      const paged = ranked.slice(offset, offset + limit)
      await client.end()
      res.json({
        strategy,
        total: ranked.length,
        offset,
        limit,
        products: paged.map((r) => ({
          product_id: r.product_id,
          seller_id: r.seller_id,
          score: parseFloat(r._final_score.toFixed(6)),
        })),
      })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  }

  // GET /admin-hub/v1/ranking/products — ranked list with full breakdown (admin only)
  const adminRankingProductsGET = async (req, res) => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    let client
    try {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      const strategy = (req.query.strategy || 'default').replace(/[^a-z_]/g, '')
      const sellerId = req.sellerUser?.seller_id
      const isSuperuser = req.sellerUser?.is_superuser

      const cfgR = await client.query(`SELECT config FROM ranking_config WHERE strategy = $1`, [strategy])
      const cfg = cfgR.rows[0]?.config || {}
      const hl = parseFloat(cfg.freshness_halflife_days ?? 30)
      const expl_k = parseFloat(cfg.exploration_k ?? 0.25)

      const conditions = [storePublishedStatusSql('p.status')]
      const params = [hl, expl_k]
      if (!isSuperuser && sellerId) { params.push(sellerId); conditions.push(`f.seller_id = $${params.length}`) }

      const r = await client.query(`
        SELECT
          f.*,
          p.title,
          p.handle,
          p.status,
          ROUND(EXP(-0.693 * GREATEST(0, EXTRACT(EPOCH FROM (NOW() - f.published_at)) / 86400) / $1)::numeric, 6) AS freshness_override,
          ROUND(($2 * EXP(-0.693 * GREATEST(0, EXTRACT(EPOCH FROM (NOW() - f.published_at)) / 86400) / ($1 * 0.5)))::numeric, 6) AS exploration_bonus,
          CASE WHEN f.inventory > 0 AND f.inventory <= 5 THEN 0.03 ELSE 0 END AS urgency_bonus,
          CASE WHEN f.sales_30d > 0 THEN LEAST(f.return_count_30d::numeric / f.sales_30d, 0.5) * 0.15 ELSE 0 END AS return_penalty
        FROM product_ranking_features f
        JOIN admin_hub_products p ON p.id::text = f.product_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY f.final_score DESC
        LIMIT 500
      `, params)

      await client.end()
      res.json({ strategy, config: cfg, products: r.rows })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  }

  // GET /admin-hub/v1/ranking/products/:id/breakdown — why is this product at this rank?
  const adminRankingBreakdownGET = async (req, res) => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    let client
    try {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      const productId = req.params.id
      const strategy = (req.query.strategy || 'default').replace(/[^a-z_]/g, '')

      const cfgR = await client.query(`SELECT config FROM ranking_config WHERE strategy = $1`, [strategy])
      const cfg = cfgR.rows[0]?.config || {}

      const r = await client.query(`
        SELECT f.*, p.title, p.handle
        FROM product_ranking_features f
        JOIN admin_hub_products p ON p.id::text = f.product_id
        WHERE f.product_id = $1
      `, [productId])
      if (!r.rows.length) { await client.end(); return res.status(404).json({ message: 'Product not found in ranking features. Compute first.' }) }
      const f = r.rows[0]

      // Rank position: how many products score higher?
      const hl = parseFloat(cfg.freshness_halflife_days ?? 30)
      const expl_k = parseFloat(cfg.exploration_k ?? 0.25)
      const w_pop = parseFloat(cfg.w_popularity ?? 0.45)
      const w_fresh = parseFloat(cfg.w_freshness ?? 0.15)
      const w_content = parseFloat(cfg.w_content ?? 0.10)
      const w_disc = parseFloat(cfg.w_discount ?? 0.15)
      const w_seller = parseFloat(cfg.w_seller ?? 0.10)
      const w_vel = parseFloat(cfg.w_velocity ?? 0.05)

      const daysSince = Math.max(0, (Date.now() - new Date(f.published_at)) / 86400000)
      const freshness = Math.exp(-0.693 * daysSince / hl)
      const exploration_bonus = expl_k * Math.exp(-0.693 * daysSince / (hl * 0.5))
      const urgency_bonus = (f.inventory > 0 && f.inventory <= 5) ? 0.03 : 0
      const return_penalty = f.sales_30d > 0 ? Math.min(f.return_count_30d / f.sales_30d, 0.5) * 0.15 : 0
      const discount_score = Math.min(parseFloat(f.discount_pct) / 60.0, 1.0)

      // Seller perf
      const spR = await client.query(`SELECT ROUND(AVG(review_avg)/5.0,4) AS perf FROM product_ranking_features WHERE seller_id=$1 AND review_count>0`, [f.seller_id])
      const seller_perf = parseFloat(spR.rows[0]?.perf ?? 0.5)

      const rankR = await client.query(`
        SELECT COUNT(*)::int AS rank
        FROM product_ranking_features f2
        JOIN admin_hub_products p2 ON p2.id::text = f2.product_id AND ${storePublishedStatusSql('p2.status')}
        WHERE f2.final_score > (SELECT final_score FROM product_ranking_features WHERE product_id = $1)
      `, [productId])

      await client.end()
      res.json({
        product_id: productId,
        title: f.title,
        strategy,
        config: cfg,
        rank_position: (rankR.rows[0]?.rank ?? 0) + 1,
        signals: {
          sales_7d: f.sales_7d,
          sales_30d: f.sales_30d,
          sales_90d: f.sales_90d,
          gmv_30d_cents: f.gmv_30d_cents,
          impressions_30d: f.impressions_30d,
          clicks_30d: f.clicks_30d,
          ctr_30d: f.ctr_30d,
          add_to_cart_30d: f.add_to_cart_30d,
          review_avg: f.review_avg,
          review_count: f.review_count,
          return_count_30d: f.return_count_30d,
          discount_pct: f.discount_pct,
          inventory: f.inventory,
          days_since_published: parseFloat(daysSince.toFixed(1)),
        },
        scores: {
          popularity: parseFloat(f.popularity_score),
          freshness: parseFloat(freshness.toFixed(6)),
          content: parseFloat(f.content_score),
          velocity: parseFloat(f.velocity_score),
          seller_performance: parseFloat(seller_perf),
          discount: parseFloat(discount_score.toFixed(4)),
        },
        bonuses: {
          exploration_bonus: parseFloat(exploration_bonus.toFixed(6)),
          urgency_bonus,
        },
        penalties: {
          return_penalty: parseFloat(return_penalty.toFixed(6)),
        },
        weighted_contributions: {
          popularity: parseFloat((w_pop * parseFloat(f.popularity_score)).toFixed(6)),
          freshness: parseFloat((w_fresh * freshness).toFixed(6)),
          content: parseFloat((w_content * parseFloat(f.content_score)).toFixed(6)),
          discount: parseFloat((w_disc * discount_score).toFixed(6)),
          seller: parseFloat((w_seller * seller_perf).toFixed(6)),
          velocity: parseFloat((w_vel * parseFloat(f.velocity_score)).toFixed(6)),
          exploration_bonus: parseFloat(exploration_bonus.toFixed(6)),
          urgency_bonus,
          return_penalty: parseFloat((-return_penalty).toFixed(6)),
        },
        final_score: parseFloat(f.final_score),
      })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  }

  // POST /admin-hub/v1/ranking/compute — manual trigger (superuser only)
  const adminRankingComputePOST = async (req, res) => {
    if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser required' })
    res.json({ ok: true, message: 'Computation started in background' })
    computeRankingFeatures().catch((e) => console.error('[Ranking] Manual compute error:', e.message))
  }

  // GET/PATCH /admin-hub/v1/ranking/config
  const adminRankingConfigGET = async (req, res) => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    let client
    try {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      const r = await client.query(`SELECT strategy, config, updated_at FROM ranking_config ORDER BY strategy`)
      await client.end()
      res.json({ configs: r.rows })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  }
  const adminRankingConfigPATCH = async (req, res) => {
    if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser required' })
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    let client
    try {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      const { strategy, config } = req.body || {}
      if (!strategy || !config) { await client.end(); return res.status(400).json({ message: 'strategy and config required' }) }
      await client.query(`
        INSERT INTO ranking_config (strategy, config, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (strategy) DO UPDATE SET config = $2::jsonb, updated_at = NOW()
      `, [strategy, JSON.stringify(config)])
      await client.end()
      res.json({ ok: true })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  }

  // POST /store/events — storefront event logging (impression, click, add_to_cart)
  const storeEventsPOST = async (req, res) => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    let client
    try {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      const events = Array.isArray(req.body) ? req.body : [req.body]
      const allowed = ['impression', 'click', 'add_to_cart']
      for (const ev of events) {
        const { event_type, product_id, seller_id, category_id, strategy, session_id, position } = ev || {}
        if (!event_type || !product_id || !allowed.includes(event_type)) continue
        await client.query(
          `INSERT INTO product_events (event_type, product_id, seller_id, category_id, strategy, session_id, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [event_type, product_id, seller_id || null, category_id || null, strategy || 'default', session_id || null, position ?? null]
        )
      }
      await client.end()
      res.json({ ok: true })
    } catch (e) {
      if (client) try { await client.end() } catch (_) {}
      res.status(200).json({ ok: true }) // never fail event logging
    }
  }

  const router = Router()
  router.get('/store/products/ranked', storeProductsRankedGET)
  router.post('/store/events', storeEventsPOST)
  router.get('/admin-hub/v1/ranking/config', adminRankingConfigGET)
  router.patch('/admin-hub/v1/ranking/config', adminRankingConfigPATCH)
  router.get('/admin-hub/v1/ranking/products', adminRankingProductsGET)
  router.post('/admin-hub/v1/ranking/compute', adminRankingComputePOST)
  router.get('/admin-hub/v1/ranking/products/:id/breakdown', adminRankingBreakdownGET)

  return { router, computeRankingFeatures }
}
