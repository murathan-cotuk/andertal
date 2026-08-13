'use strict'
const { Router } = require('express')
const { resolveSellerScope } = require('../seller-scope')
const { resolveOrderPaidTotalCents } = require('../order-money')

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

const { enrichOrderItemRows, filterItemsForSeller, itemsSubtotalCents } = require('../order-items-seller')

module.exports = function createPayoutsRouter({
  getSellerDbClient,
  loadPlatformCheckoutRow,
  resolveStripeSecretKeyFromPlatform,
}) {
    // GET /admin-hub/v1/payouts — list payout records
    const adminHubPayoutsGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const scope = resolveSellerScope(req.sellerUser)
        if (!scope) {
          await client.end()
          return res.status(403).json({ message: 'Forbidden' })
        }
        const isSuperuser = scope.isSuperuser
        const filterSellerId = isSuperuser
          ? (String(req.query.seller_id || '').trim() || null)
          : scope.sellerId
        const params = []
        let where = ''
        if (filterSellerId) { params.push(filterSellerId); where = `WHERE p.seller_id = $1` }
        else if (!isSuperuser) {
          await client.end()
          return res.status(403).json({ message: 'Forbidden' })
        }
        const r = await client.query(
          `SELECT p.*, s.store_name FROM seller_payouts p LEFT JOIN seller_users s ON s.seller_id = p.seller_id ${where} ORDER BY p.period_start DESC LIMIT 200`,
          params
        )
        await client.end()
        res.json({ payouts: r.rows, count: r.rows.length })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // POST /admin-hub/v1/payouts — create payout (superuser only)
    const adminHubPayoutsPOST = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { seller_id, period_start, period_end, total_cents, commission_cents, payout_cents, iban, notes } = req.body || {}
        if (!seller_id || !period_start || !period_end) return res.status(400).json({ message: 'seller_id, period_start, period_end required' })
        const r = await client.query(
          `INSERT INTO seller_payouts (seller_id, period_start, period_end, total_cents, commission_cents, payout_cents, iban, notes, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'offen') RETURNING *`,
          [seller_id, period_start, period_end, total_cents || 0, commission_cents || 0, payout_cents || 0, iban || null, notes || null]
        )
        await client.end()
        res.json({ payout: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // PATCH /admin-hub/v1/payouts/:id — update payout status / proof (superuser only)
    const adminHubPayoutsPATCH = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const { id } = req.params
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { status, proof_url, notes, paid_at } = req.body || {}
        const sets = ['updated_at = now()']
        const params = []
        if (status !== undefined) { params.push(status); sets.push(`status = $${params.length}`) }
        if (proof_url !== undefined) { params.push(proof_url); sets.push(`proof_url = $${params.length}`) }
        if (notes !== undefined) { params.push(notes); sets.push(`notes = $${params.length}`) }
        if (paid_at !== undefined || status === 'bezahlt') { params.push(paid_at || new Date().toISOString()); sets.push(`paid_at = $${params.length}`) }
        params.push(id)
        const r = await client.query(`UPDATE seller_payouts SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params)
        await client.end()
        if (!r.rows.length) return res.status(404).json({ message: 'Payout not found' })
        res.json({ payout: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // POST /admin-hub/v1/payouts/mark-paid — superuser marks a seller period as paid
    const adminHubPayoutsMarkPaidPOST = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { seller_id, period_start, period_end, amount_cents, reference } = req.body || {}
        if (!seller_id || !period_start || !period_end) { await client.end(); return res.status(400).json({ message: 'seller_id, period_start, period_end required' }) }
        // Upsert: if a payout record exists for this seller+period, update it; otherwise create it
        const existing = await client.query(
          `SELECT id FROM seller_payouts WHERE seller_id = $1 AND period_start = $2 AND period_end = $3 LIMIT 1`,
          [seller_id, period_start, period_end]
        )
        let row
        if (existing.rows.length) {
          const r = await client.query(
            `UPDATE seller_payouts SET status = 'bezahlt', payout_cents = $1, notes = COALESCE($2, notes), paid_at = now(), updated_at = now() WHERE id = $3 RETURNING *`,
            [amount_cents || 0, reference || null, existing.rows[0].id]
          )
          row = r.rows[0]
        } else {
          const r = await client.query(
            `INSERT INTO seller_payouts (seller_id, period_start, period_end, payout_cents, notes, status, paid_at)
             VALUES ($1, $2, $3, $4, $5, 'bezahlt', now()) RETURNING *`,
            [seller_id, period_start, period_end, amount_cents || 0, reference || null]
          )
          row = r.rows[0]
        }
        await client.end()
        res.json({ payout: row })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // POST /admin-hub/v1/payouts/backfill — superuser generates missing payout records for all past
    // months. BonusPunkte.md §3.8: every approved seller gets a row per month — even 0 € (period proof)
    // — not just sellers who happened to have orders; plus the per-period breakdown columns the Billing
    // "Finanzamt" tab sums (customer_paid/bonus_funding/commission_vat/refund/order_count).
    const adminHubPayoutsBackfillPOST = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const monthsR = await client.query(
          `SELECT DISTINCT date_trunc('month', o.created_at)::date AS month_start
           FROM store_orders o
           WHERE o.payment_status = 'bezahlt' AND date_trunc('month', o.created_at) < date_trunc('month', now())
           ORDER BY month_start ASC`
        )
        const approvedR = await client.query(
          `SELECT seller_id, commission_rate FROM seller_users
           WHERE LOWER(COALESCE(approval_status, 'approved')) = 'approved' AND seller_id IS NOT NULL`
        )
        const approvedSellers = approvedR.rows || []
        const platformVatPercent = Number(process.env.PLATFORM_VAT_PERCENT || '0')
        let created = 0
        let skipped = 0
        for (const { month_start: monthStart } of monthsR.rows || []) {
          const monthEndR = await client.query(`SELECT (($1::date) + interval '1 month' - interval '1 day')::date AS month_end`, [monthStart])
          const monthEnd = monthEndR.rows[0].month_end
          const ordersR = await client.query(
            `SELECT o.seller_id, o.subtotal_cents, o.shipping_cents, o.discount_cents, o.coupon_discount_cents, o.total_cents,
                    COALESCE(o.platform_bonus_funding_cents, 0) AS platform_bonus_funding_cents
             FROM store_orders o
             WHERE o.payment_status = 'bezahlt'
               AND o.created_at >= $1::date AND o.created_at < ($1::date + interval '1 month')
               AND o.seller_id IS NOT NULL`,
            [monthStart],
          )
          const bySeller = new Map()
          for (const o of ordersR.rows || []) {
            const sid = String(o.seller_id || '').trim()
            if (!sid) continue
            if (!bySeller.has(sid)) bySeller.set(sid, { subtotal: 0, customerPaid: 0, bonusFunding: 0, orderCount: 0 })
            const agg = bySeller.get(sid)
            agg.subtotal += Math.max(0, Number(o.subtotal_cents || 0))
            agg.customerPaid += resolveOrderPaidTotalCents(o)
            agg.bonusFunding += Number(o.platform_bonus_funding_cents || 0)
            agg.orderCount += 1
          }
          const refundR = await client.query(
            `SELECT o.seller_id, COALESCE(SUM(rr.refund_amount_cents), 0)::bigint AS refund_cents
             FROM store_returns rr JOIN store_orders o ON o.id = rr.order_id
             WHERE rr.created_at >= $1::date AND rr.created_at < ($1::date + interval '1 month') AND o.seller_id IS NOT NULL
             GROUP BY o.seller_id`,
            [monthStart],
          )
          const refundBySeller = new Map((refundR.rows || []).map((rr) => [String(rr.seller_id).trim(), Number(rr.refund_cents || 0)]))

          for (const s of approvedSellers) {
            const sellerId = String(s.seller_id || '').trim()
            if (!sellerId) continue
            const ex = await client.query(
              `SELECT id FROM seller_payouts WHERE seller_id = $1 AND period_start = $2::date AND period_end = $3::date LIMIT 1`,
              [sellerId, monthStart, monthEnd],
            )
            if (ex.rows.length) { skipped++; continue }
            const agg = bySeller.get(sellerId) || { subtotal: 0, customerPaid: 0, bonusFunding: 0, orderCount: 0 }
            const rate = Number(s.commission_rate) >= 0 ? Number(s.commission_rate) : 0.12
            const commissionCents = Math.round(agg.subtotal * rate)
            const payoutCents = Math.max(0, agg.subtotal - commissionCents)
            const commissionVatCents = platformVatPercent > 0 ? Math.round(commissionCents * platformVatPercent / 100) : 0
            const refundCents = refundBySeller.get(sellerId) || 0
            await client.query(
              `INSERT INTO seller_payouts
               (seller_id, period_start, period_end, total_cents, commission_cents, payout_cents,
                customer_paid_cents, bonus_funding_cents, commission_vat_cents, refund_cents, order_count, notes, status)
               VALUES ($1, $2::date, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, 'Rückwirkend automatisch erstellt', 'offen')`,
              [sellerId, monthStart, monthEnd, agg.subtotal, commissionCents, payoutCents,
                agg.customerPaid, agg.bonusFunding, commissionVatCents, refundCents, agg.orderCount],
            )
            created++
          }
        }
        await client.end()
        res.json({ message: `Backfill abgeschlossen: ${created} erstellt, ${skipped} übersprungen`, created, skipped })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/billing/finanzamt — superuser-only period totals across ALL sellers, built by
    // summing seller_payouts rows (BonusPunkte.md §3.8: Tab 3 = Σ of Tab 2's per-seller Provisionsrechnungen,
    // never an independently recomputed number).
    const adminHubBillingFinanzamtGET = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { period_start, period_end, seller_id } = req.query
        const where = []
        const params = []
        if (period_start) { params.push(period_start); where.push(`p.period_start >= $${params.length}::date`) }
        if (period_end) { params.push(period_end); where.push(`p.period_end <= $${params.length}::date`) }
        if (seller_id) { params.push(seller_id); where.push(`p.seller_id = $${params.length}`) }
        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
        const r = await client.query(
          `SELECT p.id, p.seller_id, p.period_start, p.period_end, p.status,
                  p.total_cents, p.commission_cents, p.payout_cents,
                  p.customer_paid_cents, p.bonus_funding_cents, p.commission_vat_cents, p.refund_cents, p.order_count,
                  s.store_name
             FROM seller_payouts p
             LEFT JOIN seller_users s ON s.seller_id = p.seller_id
             ${whereClause}
             ORDER BY p.period_start DESC, s.store_name ASC
             LIMIT 2000`,
          params,
        )
        await client.end()
        const rows = r.rows || []
        const totals = rows.reduce((acc, row) => {
          acc.gross_sale_cents += Number(row.total_cents || 0)
          acc.customer_paid_cents += Number(row.customer_paid_cents || 0)
          acc.bonus_funding_cents += Number(row.bonus_funding_cents || 0)
          acc.commission_net_cents += Number(row.commission_cents || 0)
          acc.commission_vat_cents += Number(row.commission_vat_cents || 0)
          acc.seller_payout_cents += Number(row.payout_cents || 0)
          acc.refund_cents += Number(row.refund_cents || 0)
          acc.order_count += Number(row.order_count || 0)
          return acc
        }, {
          gross_sale_cents: 0, customer_paid_cents: 0, bonus_funding_cents: 0, commission_net_cents: 0,
          commission_vat_cents: 0, seller_payout_cents: 0, refund_cents: 0, order_count: 0,
        })
        totals.seller_count = new Set(rows.map((row) => row.seller_id)).size
        totals.invoice_count = rows.length
        res.json({
          totals,
          sellers: rows.map((row) => ({
            payout_id: row.id,
            seller_id: row.seller_id,
            store_name: row.store_name || row.seller_id,
            period_start: row.period_start,
            period_end: row.period_end,
            status: row.status,
            gross_sale_cents: Number(row.total_cents || 0),
            customer_paid_cents: Number(row.customer_paid_cents || 0),
            bonus_funding_cents: Number(row.bonus_funding_cents || 0),
            commission_net_cents: Number(row.commission_cents || 0),
            commission_vat_cents: Number(row.commission_vat_cents || 0),
            seller_payout_cents: Number(row.payout_cents || 0),
            refund_cents: Number(row.refund_cents || 0),
            order_count: Number(row.order_count || 0),
            pdf_url: `/admin-hub/v1/seller-payouts/${row.id}/pdf`,
          })),
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/payout-summary — seller's own summary for a period
    /** Settlement attribution: DATE(COALESCE(delivery_date, created_at)) ∈ [period_start, period_end] (same as transactions list). */
    const adminHubPayoutSummaryGET = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { period_start, period_end } = req.query
        const params = [sellerId]
        const dateFilter = period_start && period_end
          ? `AND DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) >= $2::date
             AND DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) <= $3::date`
          : ''
        if (period_start) params.push(period_start)
        if (period_end) params.push(period_end)
        const commRateR = await client.query(`SELECT commission_rate FROM seller_users WHERE seller_id = $1 LIMIT 1`, [sellerId])
        const commissionRate = commRateR.rows[0]?.commission_rate != null ? Number(commRateR.rows[0].commission_rate) : 0.12

        // Fetch matching orders un-aggregated — a shared (multi-seller) order's basis must come
        // from only THIS seller's own line items, not the whole order's subtotal (see order-items-seller.js).
        const r = await client.query(
          `SELECT o.id, o.seller_id, o.subtotal_cents, o.total_cents, o.shipping_cents, o.order_status
           FROM store_orders o
           WHERE (
             o.seller_id = $1
             OR EXISTS (
               SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                 EXISTS (
                   SELECT 1 FROM admin_hub_seller_listings sl
                   WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $1
                     AND (SELECT COUNT(*) FROM admin_hub_seller_listings sl2 WHERE sl2.product_id::text = oi.product_id::text) = 1
                 )
                 OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $1)
               )
             )
           ) AND o.payment_status = 'bezahlt' ${dateFilter}`,
          params
        )

        let basis = 0
        let commission = 0
        let shipping = 0
        let refunds = 0
        let paidCount = 0
        for (const o of r.rows) {
          const ownsWholeOrder = String(o.seller_id || '').trim() === String(sellerId).trim()
          let orderBasis
          if (ownsWholeOrder) {
            orderBasis = Number(o.subtotal_cents) > 0 ? Number(o.subtotal_cents) : Math.max(0, Number(o.total_cents) || 0)
          } else {
            const iRes = await client.query(`SELECT * FROM store_order_items WHERE order_id = $1`, [o.id])
            const enriched = await enrichOrderItemRows(client, iRes.rows || [])
            const mine = filterItemsForSeller(enriched, sellerId, { isSuperuser: false, orderSellerId: o.seller_id })
            orderBasis = itemsSubtotalCents(mine)
          }
          basis += orderBasis
          commission += Math.round(orderBasis * commissionRate)
          if (ownsWholeOrder) shipping += Number(o.shipping_cents) || 0
          paidCount += 1
          if (String(o.order_status || '').trim().toLowerCase() === 'refunded') refunds += orderBasis
        }
        // Also get payout status for this period
        let payoutStatus = null
        if (period_start && period_end) {
          const po = await client.query(
            `SELECT status FROM seller_payouts WHERE seller_id = $1 AND period_start <= $3::date AND period_end >= $2::date ORDER BY created_at DESC LIMIT 1`,
            [sellerId, period_start, period_end]
          )
          payoutStatus = po.rows[0]?.status || null
        }
        await client.end()
        res.json({
          summary: {
            total_cents: basis,
            commission_cents: commission,
            shipping_cents: shipping,
            refund_cents: refunds,
            paid_count: paidCount,
            status: payoutStatus,
            ad_spend_cents: 0,
          },
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/analytics/marketing — impressions, clicks, conversions for reports
    const adminHubAnalyticsMarketingGET = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const isSuperuser = req.sellerUser?.is_superuser
      if (!sellerId && !isSuperuser) return res.status(401).json({ message: 'Unauthorized' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const from = String(req.query.from || '').slice(0, 10)
      const to = String(req.query.to || '').slice(0, 10)
      if (!from || !to) return res.status(400).json({ message: 'from and to required (YYYY-MM-DD)' })
      try {
        await client.connect()
        const sellerFilter = isSuperuser ? '' : 'AND seller_id = $1'
        const evParams = isSuperuser ? [from, to] : [sellerId, from, to]
        const evR = await client.query(
          `SELECT event_type, COUNT(*)::int AS cnt
           FROM product_events
           WHERE created_at >= $${isSuperuser ? 1 : 2}::date
             AND created_at < ($${isSuperuser ? 2 : 3}::date + interval '1 day')
             AND event_type IN ('impression', 'click', 'add_to_cart')
             ${sellerFilter}
           GROUP BY event_type`,
          evParams,
        )
        const dailyEvR = await client.query(
          `SELECT DATE(created_at) AS day, event_type, COUNT(*)::int AS cnt
           FROM product_events
           WHERE created_at >= $${isSuperuser ? 1 : 2}::date
             AND created_at < ($${isSuperuser ? 2 : 3}::date + interval '1 day')
             AND event_type IN ('impression', 'click')
             ${sellerFilter}
           GROUP BY DATE(created_at), event_type
           ORDER BY day`,
          evParams,
        )
        const orderParams = isSuperuser ? [from, to] : [sellerId, from, to]
        const orderSellerFilter = isSuperuser ? '' : 'AND o.seller_id = $1'
        const ordersR = await client.query(
          `SELECT
             DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) AS day,
             COUNT(*)::int AS orders,
             COALESCE(SUM(
               CASE WHEN COALESCE(o.subtotal_cents, 0) > 0 THEN o.subtotal_cents::bigint
                    ELSE GREATEST(0, COALESCE(o.total_cents, 0))::bigint END
             ), 0)::bigint AS revenue_cents
           FROM store_orders o
           WHERE o.payment_status = 'bezahlt'
             AND o.order_status NOT IN ('storniert', 'cancelled')
             AND DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) >= $${isSuperuser ? 1 : 2}::date
             AND DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) <= $${isSuperuser ? 2 : 3}::date
             ${orderSellerFilter}
           GROUP BY DATE(COALESCE(o.delivery_date::timestamp, o.created_at))
           ORDER BY day`,
          orderParams,
        )
        const spendR = await client.query(
          `SELECT COALESCE(SUM(budget_daily_cents), 0)::bigint AS daily_budget
           FROM seller_campaigns
           WHERE campaign_type = 'ppc'
             AND ad_status IN ('active', 'running', 'approved', 'live', 'paused')
             ${isSuperuser ? '' : 'AND seller_id = $1'}`,
          isSuperuser ? [] : [sellerId],
        )
        await client.end()

        const totals = { impressions: 0, clicks: 0, add_to_cart: 0, orders: 0, revenue_cents: 0, spend_cents: 0 }
        for (const row of evR.rows || []) {
          if (row.event_type === 'impression') totals.impressions = row.cnt
          if (row.event_type === 'click') totals.clicks = row.cnt
          if (row.event_type === 'add_to_cart') totals.add_to_cart = row.cnt
        }
        for (const row of ordersR.rows || []) {
          totals.orders += row.orders
          totals.revenue_cents += Number(row.revenue_cents) || 0
        }
        const dayMs = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1)
        totals.spend_cents = (Number(spendR.rows[0]?.daily_budget) || 0) * dayMs

        const dailyMap = new Map()
        const ensureDay = (dayKey) => {
          const k = String(dayKey).slice(0, 10)
          if (!dailyMap.has(k)) {
            dailyMap.set(k, { date: k, impressions: 0, clicks: 0, orders: 0, revenue_cents: 0 })
          }
          return dailyMap.get(k)
        }
        for (const row of dailyEvR.rows || []) {
          const d = ensureDay(row.day)
          if (row.event_type === 'impression') d.impressions = row.cnt
          if (row.event_type === 'click') d.clicks = row.cnt
        }
        for (const row of ordersR.rows || []) {
          const d = ensureDay(row.day)
          d.orders = row.orders
          d.revenue_cents = Number(row.revenue_cents) || 0
        }

        const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : null
        const conversion_rate = totals.clicks > 0 ? totals.orders / totals.clicks : null
        const roas = totals.spend_cents > 0 ? totals.revenue_cents / totals.spend_cents : null

        res.json({
          totals,
          derived: { ctr, conversion_rate, roas },
          daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/payout-overview — superuser: all sellers summary for a period
    const adminHubPayoutOverviewGET = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { period_start, period_end } = req.query
        const params = []
        const dateFilter = period_start && period_end
          ? `AND DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) >= $1::date
             AND DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) <= $2::date`
          : ''
        if (period_start) params.push(period_start)
        if (period_end) params.push(period_end)
        const r = await client.query(
          `SELECT
             o.seller_id,
             s.store_name,
             s.email,
             COALESCE(SUM(
               CASE WHEN COALESCE(o.subtotal_cents, 0) > 0 THEN o.subtotal_cents::bigint ELSE GREATEST(0, COALESCE(o.total_cents, 0))::bigint END
             ), 0)::bigint AS total_cents,
             COUNT(*) AS order_count,
             COALESCE(SUM(
               ROUND(
                 (CASE WHEN COALESCE(o.subtotal_cents, 0) > 0 THEN o.subtotal_cents::numeric ELSE GREATEST(0, COALESCE(o.total_cents, 0))::numeric END)
                 * COALESCE(s.commission_rate::numeric, 0.12)
               )
             ), 0)::bigint AS commission_cents,
             COALESCE(SUM(
               (CASE WHEN COALESCE(o.subtotal_cents, 0) > 0 THEN o.subtotal_cents::bigint ELSE GREATEST(0, COALESCE(o.total_cents, 0))::bigint END)
               - ROUND(
                 (CASE WHEN COALESCE(o.subtotal_cents, 0) > 0 THEN o.subtotal_cents::numeric ELSE GREATEST(0, COALESCE(o.total_cents, 0))::numeric END)
                 * COALESCE(s.commission_rate::numeric, 0.12)
               )
             ), 0)::bigint AS payout_cents
           FROM store_orders o
           LEFT JOIN seller_users s ON s.seller_id = o.seller_id
           WHERE o.payment_status = 'bezahlt'
             AND o.delivery_date IS NOT NULL
             AND o.delivery_date <= now() - interval '14 days'
             ${dateFilter}
           GROUP BY o.seller_id, s.store_name, s.email
           ORDER BY total_cents DESC`,
          params
        )
        // Fetch payout statuses for this period
        const sellerIds = r.rows.map(row => row.seller_id)
        let payoutMap = {}
        if (sellerIds.length && period_start && period_end) {
          const po = await client.query(
            `SELECT DISTINCT ON (seller_id) seller_id, status, paid_at
             FROM seller_payouts
             WHERE seller_id = ANY($1) AND period_start <= $3 AND period_end >= $2
             ORDER BY seller_id, created_at DESC`,
            [sellerIds, period_start, period_end]
          )
          po.rows.forEach(p => { payoutMap[p.seller_id] = p })
        }
        await client.end()
        const sellers = r.rows.map(row => ({
          seller_id: row.seller_id,
          store_name: row.store_name || row.seller_id,
          email: row.email,
          total_cents: parseInt(row.total_cents) || 0,
          order_count: parseInt(row.order_count) || 0,
          commission_cents: parseInt(row.commission_cents) || 0,
          payout_cents: parseInt(row.payout_cents) || 0,
          status: payoutMap[row.seller_id]?.status || 'ausstehend',
          paid_at: payoutMap[row.seller_id]?.paid_at || null,
        }))
        res.json({ sellers })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // Gregorian weekday (0=Sun … 5=Fri) for Y-M-D — timezone-independent.
    const utcWeekday = (year, month0, day) => new Date(Date.UTC(year, month0, day)).getUTCDay()

    // Day-of-month (1-based) of the nth Friday in year/month (month 0-indexed).
    const nthFridayOfMonth = (year, month, n) => {
      const dow = utcWeekday(year, month, 1)
      const offset = (5 - dow + 7) % 7
      return 1 + offset + (n - 1) * 7
    }

    /** Civil date (Y-M-D) in Europe/Berlin — drives payout calendar regardless of server TZ. */
    const civilDatePartsBerlin = (instant = new Date()) => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(instant)
      let y
      let mo
      let da
      for (const p of parts) {
        if (p.type === 'year') y = Number(p.value)
        if (p.type === 'month') mo = Number(p.value) - 1
        if (p.type === 'day') da = Number(p.value)
      }
      return { y, m: mo, d: da }
    }

    // Returns { is: true, n: 2|4 } when today (Berlin) is the 2nd or 4th Friday, else { is: false }.
    const isPayoutFridayToday = () => {
      const { y, m, d } = civilDatePartsBerlin()
      if (utcWeekday(y, m, d) !== 5) return { is: false }
      if (d === nthFridayOfMonth(y, m, 2)) return { is: true, n: 2 }
      if (d === nthFridayOfMonth(y, m, 4)) return { is: true, n: 4 }
      return { is: false }
    }

    /** Orders eligible for seller payout: paid, delivered 14d+, no refund flow / open return. */
    const payoutEligibleOrderSql = `o.payment_status = 'bezahlt'
             AND o.delivery_date IS NOT NULL
             AND o.delivery_date <= now() - interval '14 days'
             AND COALESCE(o.order_status, '') NOT IN ('storniert', 'refunded', 'retoure', 'retoure_anfrage')
             AND NOT EXISTS (
               SELECT 1 FROM store_returns r
               WHERE r.order_id = o.id
                 AND COALESCE(r.status, '') NOT IN ('abgelehnt', 'abgeschlossen')
             )`

    /** ISO 13616 MOD-97 IBAN check — SEPA-capable accounts use standard IBAN. */
    const validateSepaIbanChecksum = (raw) => {
      const iban = String(raw || '').replace(/\s/g, '').toUpperCase()
      if (!iban) return { ok: false, message: 'IBAN erforderlich' }
      if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) return { ok: false, message: 'Ungültiges IBAN-Format' }
      if (iban.length < 15 || iban.length > 34) return { ok: false, message: 'IBAN-Länge ungültig' }
      const rearranged = iban.slice(4) + iban.slice(0, 4)
      let expanded = ''
      for (let i = 0; i < rearranged.length; i++) {
        const c = rearranged[i]
        if (c >= 'A' && c <= 'Z') expanded += String(c.charCodeAt(0) - 55)
        else expanded += c
      }
      let rem = 0
      for (let i = 0; i < expanded.length; i++) {
        const d = expanded.charCodeAt(i) - 48
        if (d < 0 || d > 9) return { ok: false, message: 'Ungültiges IBAN-Format' }
        rem = (rem * 10 + d) % 97
      }
      if (rem !== 1) return { ok: false, message: 'IBAN-Prüfziffer ungültig' }
      return { ok: true, iban }
    }

    const autoPayoutPeriodForDate = () => {
      const fri = isPayoutFridayToday()
      if (!fri.is) return null
      const { y, m, day } = civilDatePartsBerlin()

      const mm = String(m + 1).padStart(2, '0')
      const pad = (n) => String(n).padStart(2, '0')
      const iso = (yr, mo, da) => `${yr}-${String(mo + 1).padStart(2, '0')}-${pad(da)}`

      if (fri.n === 2) {
        // Period: (4th Friday of previous month + 1) → 2nd Friday of this month
        const prevM = m === 0 ? 11 : m - 1
        const prevY = m === 0 ? y - 1 : y
        const f4prev = nthFridayOfMonth(prevY, prevM, 4)
        const sd = new Date(Date.UTC(prevY, prevM, f4prev + 1))
        const periodStart = iso(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate())
        const periodEnd = iso(y, m, day)
        return { runKey: `AUTO-${y}-${mm}-F2`, periodStart, periodEnd }
      }
      // fri.n === 4
      // Period: (2nd Friday of this month + 1) → 4th Friday of this month
      const f2 = nthFridayOfMonth(y, m, 2)
      const sd = new Date(Date.UTC(y, m, f2 + 1))
      const periodStart = iso(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate())
      const periodEnd = iso(y, m, day)
      return { runKey: `AUTO-${y}-${mm}-F4`, periodStart, periodEnd }
    }

    const runAutomaticPayoutsIfDue = async () => {
      const period = autoPayoutPeriodForDate()
      if (!period) return
      const client = getDbClient()
      if (!client) return
      try {
        await client.connect()
        const already = await client.query('SELECT run_key FROM seller_payout_auto_runs WHERE run_key = $1 LIMIT 1', [period.runKey])
        if (already.rows.length) { await client.end(); return }
        const su = await client.query(
          `SELECT iban FROM seller_users
           WHERE is_superuser = true
             AND iban IS NOT NULL
             AND LENGTH(TRIM(iban)) > 0
           ORDER BY created_at ASC
           LIMIT 1`
        )
        const sourceIban = su.rows[0]?.iban ? String(su.rows[0].iban).trim() : null
        if (!sourceIban) { await client.end(); return }
        const summary = await client.query(
          `SELECT
             o.seller_id,
             ROUND(COALESCE(SUM(o.subtotal_cents), 0)) AS total_cents,
             ROUND((COALESCE(SUM(o.subtotal_cents), 0)::numeric * COALESCE(MAX(s.commission_rate), 0.12)))::bigint AS commission_cents,
             ROUND((COALESCE(SUM(o.subtotal_cents), 0)::numeric * (1 - COALESCE(MAX(s.commission_rate), 0.12))))::bigint AS payout_cents
           FROM store_orders o
           LEFT JOIN seller_users s ON s.seller_id = o.seller_id
           WHERE ${payoutEligibleOrderSql}
             AND o.created_at >= $1::date
             AND o.created_at < ($2::date + interval '1 day')
             AND LOWER(COALESCE(s.approval_status, '')) = 'approved'
           GROUP BY o.seller_id`,
          [period.periodStart, period.periodEnd]
        )
        let createdCount = 0
        for (const row of summary.rows || []) {
          const sellerId = String(row.seller_id || '').trim()
          if (!sellerId) continue
          const existing = await client.query(
            `SELECT id, status FROM seller_payouts
             WHERE seller_id = $1 AND period_start = $2::date AND period_end = $3::date
             ORDER BY created_at DESC LIMIT 1`,
            [sellerId, period.periodStart, period.periodEnd]
          )
          if (existing.rows.length) {
            const keepPaid = ['bezahlt', 'paid'].includes(String(existing.rows[0].status || '').toLowerCase())
            await client.query(
              `UPDATE seller_payouts
               SET total_cents = $1, commission_cents = $2, payout_cents = $3,
                   iban = COALESCE(iban, $4),
                   notes = COALESCE(notes, $5),
                   status = $6,
                   updated_at = now()
               WHERE id = $7`,
              [
                parseInt(row.total_cents) || 0,
                parseInt(row.commission_cents) || 0,
                parseInt(row.payout_cents) || 0,
                sourceIban,
                `AUTO-PAYOUT ${period.periodStart}..${period.periodEnd}`,
                keepPaid ? existing.rows[0].status : 'processing',
                existing.rows[0].id,
              ]
            )
          } else {
            await client.query(
              `INSERT INTO seller_payouts
               (seller_id, period_start, period_end, total_cents, commission_cents, payout_cents, iban, notes, status)
               VALUES ($1, $2::date, $3::date, $4, $5, $6, $7, $8, 'processing')`,
              [
                sellerId,
                period.periodStart,
                period.periodEnd,
                parseInt(row.total_cents) || 0,
                parseInt(row.commission_cents) || 0,
                parseInt(row.payout_cents) || 0,
                sourceIban,
                `AUTO-PAYOUT ${period.periodStart}..${period.periodEnd}`,
              ]
            )
          }
          createdCount += 1
        }
        await client.query(
          `INSERT INTO seller_payout_auto_runs (run_key, period_start, period_end, source_iban, created_count)
           VALUES ($1, $2::date, $3::date, $4, $5)`,
          [period.runKey, period.periodStart, period.periodEnd, sourceIban, createdCount]
        )
        await client.end()
      } catch (e) {
        try { await client.end() } catch (_) {}
        console.error('runAutomaticPayoutsIfDue:', e?.message || e)
      }
    }

    // Stripe Connect transfers to seller Connect accounts are disabled — all settlements use Sellercentral IBAN (SEPA)
    // via runSellerIbanPayoutsIfDue (platform → Stripe Custom recipient → bank payout).
    const runStripeConnectTransfersIfDue = async () => {}

    const runStripePayoutsIfDue = async () => {}

    // IBAN / SEPA payout — Sellercentral bank account (seller_users.iban). Platform PI funds settle here.
    // Eligible: stripe_payout_status pending, order stripe_account_id NULL (all store orders today), 14d + no open return.
    const runSellerIbanPayoutsIfDue = async () => {
      if (!isPayoutFridayToday().is) return   // 2nd / 4th Friday (Europe/Berlin)
      const client = getDbClient()
      if (!client) return
      try {
        await client.connect()

        const { y: by, m: bm, d: bd } = civilDatePartsBerlin()
        const berlinIso = `${by}-${String(bm + 1).padStart(2, '0')}-${String(bd).padStart(2, '0')}`
        // Idempotency: one batch per payout calendar day (Berlin)
        const todayKey = `IBAN-${berlinIso}`
        const alreadyRan = await client.query('SELECT run_key FROM seller_payout_auto_runs WHERE run_key = $1 LIMIT 1', [todayKey])
        if (alreadyRan.rows.length) { await client.end(); return }

        const platformRow = await loadPlatformCheckoutRow(client)
        const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
        if (!secretKey) { await client.end(); return }
        const stripeInst = new (require('stripe'))(secretKey)

        // Per-order seller net (stored at checkout); fallback = merchandise × (1 − commission).
        const due = await client.query(
          `SELECT o.seller_id,
                  SUM(
                    GREATEST(0,
                      COALESCE(o.seller_net_after_commission_cents::bigint,
                        FLOOR(o.subtotal_cents::numeric * (1 - COALESCE(s.commission_rate, 0.12)))::bigint)
                    )
                  )::bigint AS payout_cents_sum,
                  s.commission_rate, s.iban, s.payment_account_holder, s.stripe_custom_account_id, s.email
           FROM store_orders o
           JOIN seller_users s ON s.seller_id = o.seller_id
           WHERE o.stripe_payout_status = 'pending'
             AND o.stripe_account_id IS NULL
             AND ${payoutEligibleOrderSql}
           GROUP BY o.seller_id, s.commission_rate, s.iban, s.payment_account_holder, s.stripe_custom_account_id, s.email`
        )

        for (const row of due.rows || []) {
          const { seller_id, iban, payment_account_holder, email } = row
          let customAccountId = row.stripe_custom_account_id

          if (!iban) {
            console.warn(`runSellerIbanPayoutsIfDue: seller ${seller_id} has no IBAN, skipping`)
            continue
          }
          const ibChk = validateSepaIbanChecksum(iban)
          if (!ibChk.ok) {
            console.warn(`runSellerIbanPayoutsIfDue: seller ${seller_id} invalid IBAN — ${ibChk.message}`)
            continue
          }

          const payoutCents = Math.floor(Number(row.payout_cents_sum || 0))
          if (payoutCents <= 50) continue // Stripe minimum payout

          // Idempotency: mark all eligible orders as processing first
          const guard = await client.query(
            `UPDATE store_orders SET stripe_payout_status = 'processing', updated_at = now()
             WHERE seller_id = $1 AND stripe_payout_status = 'pending' AND stripe_account_id IS NULL
               AND ${payoutEligibleOrderSql.replace(/\bo\./g, 'store_orders.')}`,
            [seller_id]
          )
          if (!guard.rowCount) continue

          try {
            // Create Stripe Custom account if missing
            if (!customAccountId) {
              const acct = await stripeInst.accounts.create({
                type: 'custom',
                country: 'DE',
                email,
                capabilities: { transfers: { requested: true } },
                tos_acceptance: { service_agreement: 'full', date: Math.floor(Date.now() / 1000), ip: '127.0.0.1' },
              })
              customAccountId = acct.id
              const sellerClient = getSellerDbClient()
              if (sellerClient) {
                await sellerClient.connect()
                await sellerClient.query('UPDATE seller_users SET stripe_custom_account_id = $1 WHERE seller_id = $2', [customAccountId, seller_id])
                await sellerClient.end()
              }
              // Add IBAN as external account
              const cleanIban = iban.replace(/\s/g, '').toUpperCase()
              await stripeInst.accounts.createExternalAccount(customAccountId, {
                external_account: {
                  object: 'bank_account', country: 'DE', currency: 'eur',
                  account_number: cleanIban,
                  account_holder_name: payment_account_holder || 'Account Holder',
                  account_holder_type: 'individual',
                },
              })
            }

            // Transfer from platform to custom account
            const transfer = await stripeInst.transfers.create({
              amount: payoutCents,
              currency: 'eur',
              destination: customAccountId,
            })

            // Payout from custom account to IBAN
            const payout = await stripeInst.payouts.create(
              { amount: payoutCents, currency: 'eur' },
              { stripeAccount: customAccountId }
            )

            await client.query(
              `UPDATE store_orders SET stripe_payout_status = 'paid', stripe_payout_id = $1, updated_at = now()
               WHERE seller_id = $2 AND stripe_payout_status = 'processing' AND stripe_account_id IS NULL`,
              [payout.id, seller_id]
            )
            console.log(`runSellerIbanPayoutsIfDue: paid seller ${seller_id} ${payoutCents} EUR → ${customAccountId} (payout ${payout.id})`)
          } catch (e) {
            // Reset to pending so next run retries
            await client.query(
              `UPDATE store_orders SET stripe_payout_status = 'pending', updated_at = now()
               WHERE seller_id = $1 AND stripe_payout_status = 'processing' AND stripe_account_id IS NULL`,
              [seller_id]
            ).catch(() => {})
            console.error(`runSellerIbanPayoutsIfDue: seller ${seller_id} failed:`, e?.message)
          }
        }
        // Record that we ran this Friday so subsequent hourly ticks skip it
        await client.query(
          `INSERT INTO seller_payout_auto_runs (run_key, period_start, period_end, source_iban, created_count)
           VALUES ($1, $2::date, $3::date, '', 0) ON CONFLICT (run_key) DO NOTHING`,
          [todayKey, berlinIso, berlinIso]
        ).catch(() => {})
        await client.end()
      } catch (e) {
        console.error('runSellerIbanPayoutsIfDue:', e?.message || e)
      }
    }

    // Fire once on boot and then every hour
    runAutomaticPayoutsIfDue().catch(() => {})
    runStripeConnectTransfersIfDue().catch(() => {})
    runStripePayoutsIfDue().catch(() => {})
    runSellerIbanPayoutsIfDue().catch(() => {})
    setInterval(() => {
      runAutomaticPayoutsIfDue().catch(() => {})
      runStripeConnectTransfersIfDue().catch(() => {})
      runStripePayoutsIfDue().catch(() => {})
      runSellerIbanPayoutsIfDue().catch(() => {})
    }, 60 * 60 * 1000)

  const router = Router()
  router.get('/admin-hub/v1/payouts', adminHubPayoutsGET)
  router.post('/admin-hub/v1/payouts', adminHubPayoutsPOST)
  router.patch('/admin-hub/v1/payouts/:id', adminHubPayoutsPATCH)
  router.post('/admin-hub/v1/payouts/mark-paid', adminHubPayoutsMarkPaidPOST)
  router.post('/admin-hub/v1/payouts/backfill', adminHubPayoutsBackfillPOST)
  router.get('/admin-hub/v1/billing/finanzamt', adminHubBillingFinanzamtGET)
  router.get('/admin-hub/v1/payout-summary', adminHubPayoutSummaryGET)
  router.get('/admin-hub/v1/analytics/marketing', adminHubAnalyticsMarketingGET)
  router.get('/admin-hub/v1/payout-overview', adminHubPayoutOverviewGET)

  return router
}
