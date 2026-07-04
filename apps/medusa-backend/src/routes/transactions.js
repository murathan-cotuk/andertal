'use strict'
const { Router } = require('express')
const { resolveOrderPaidTotalCents } = require('../order-money')
const { renderPeriodCommissionInvoiceDocument } = require('../order-pdf-layout')

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

module.exports = function createTransactionsRouter({
  sellerOrderRevenueBasisCents,
  resolvePlatformApplicationFeeCents,
  buildOrderSettlementBreakdown,
}) {
    // ── Transactions ────────────────────────────────────────────────────────────
    // GET /admin-hub/v1/transactions — list eligible orders as transactions
    const adminHubTransactionsGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const isSuperuser = req.sellerUser?.is_superuser || false
        const callerSellerId = req.sellerUser?.seller_id
        const filterSellerId = req.query.seller_id || (!isSuperuser ? callerSellerId : null)
        const limitDays = parseInt(req.query.payout_days || '14', 10)
        const includePending = req.query.include_pending === 'true'
        const params = []
        const where = []
        // If include_pending: show all orders; otherwise only bezahlt + delivered 14+ days
        if (!includePending) {
          where.push(`o.payment_status = 'bezahlt'`)
          where.push(`o.delivery_date IS NOT NULL AND o.delivery_date <= now() - interval '${limitDays} days'`)
        }
        if (req.query.period_start) {
          params.push(req.query.period_start)
          where.push(`DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) >= $${params.length}::date`)
        }
        if (req.query.period_end) {
          params.push(req.query.period_end)
          where.push(`DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) <= $${params.length}::date`)
        }
        let sellerParamNum = null
        if (filterSellerId) {
          params.push(filterSellerId)
          sellerParamNum = params.length
          // Match orders directly assigned to this seller OR orders whose items link to this seller via listings/products
          where.push(`(
            o.seller_id = $${sellerParamNum}
            OR EXISTS (
              SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $${sellerParamNum})
                OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $${sellerParamNum})
              )
            )
          )`)
        }
        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
        // Join seller_users using the actual seller or falling back to filterSellerId for 'default' orders
        const sellerJoin = sellerParamNum
          ? `LEFT JOIN seller_users s ON s.seller_id = CASE WHEN o.seller_id IS NOT NULL AND o.seller_id != 'default' THEN o.seller_id ELSE $${sellerParamNum}::varchar END`
          : `LEFT JOIN seller_users s ON s.seller_id = o.seller_id`
        const r = await client.query(
          `SELECT o.id, o.order_number, o.seller_id, o.subtotal_cents, o.total_cents, o.shipping_cents, o.discount_cents,
                  o.payment_status, o.delivery_status, o.delivery_date, o.created_at,
                  o.stripe_transfer_status, o.stripe_transfer_id, o.stripe_transfer_error, o.stripe_transfer_at,
                  o.payment_intent_id, COALESCE(o.checkout_payment_kind, 'stripe') AS checkout_payment_kind,
                  o.stripe_application_fee_cents,
                  COALESCE(o.seller_net_after_commission_cents, 0)::bigint AS seller_net_after_commission_cents,
                  o.stripe_payout_status, o.stripe_payout_id, o.stripe_account_id,
                  o.first_name, o.last_name, o.email, o.currency,
                  s.store_name, s.commission_rate, s.iban,
                  (o.delivery_date IS NOT NULL AND o.delivery_date <= now() - interval '${limitDays} days') AS payout_eligible
           FROM store_orders o
           ${sellerJoin}
           ${whereClause}
           ORDER BY o.created_at DESC
           LIMIT 1000`,
          params
        )
        // Also fetch returns for this seller in the same time window
        const returnWhere = []
        const returnParams = []
        let returnSellerParamNum = null
        if (filterSellerId) {
          returnParams.push(filterSellerId)
          returnSellerParamNum = returnParams.length
          returnWhere.push(`(
            o.seller_id = $${returnSellerParamNum}
            OR EXISTS (
              SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $${returnSellerParamNum})
                OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $${returnSellerParamNum})
              )
            )
          )`)
        }
        if (req.query.period_start) {
          returnParams.push(req.query.period_start)
          returnWhere.push(`r.created_at >= $${returnParams.length}`)
        }
        if (req.query.period_end) {
          returnParams.push(req.query.period_end)
          returnWhere.push(`r.created_at < ($${returnParams.length}::date + interval '1 day')`)
        }
        const returnWhereClause = returnWhere.length ? `WHERE ${returnWhere.join(' AND ')}` : ''
        const returnSellerJoin = returnSellerParamNum
          ? `LEFT JOIN seller_users s ON s.seller_id = CASE WHEN o.seller_id IS NOT NULL AND o.seller_id != 'default' THEN o.seller_id ELSE $${returnSellerParamNum}::varchar END`
          : `LEFT JOIN seller_users s ON s.seller_id = o.seller_id`
        let returnRows = []
        try {
          const rr = await client.query(
            `SELECT r.id, r.return_number, r.order_id, r.status, r.created_at,
                    o.order_number, o.seller_id, o.first_name, o.last_name, o.currency,
                    s.commission_rate,
                    COALESCE((SELECT SUM(ri.refund_amount_cents) FROM return_items ri WHERE ri.return_id = r.id), 0) AS refund_cents
             FROM store_returns r
             LEFT JOIN store_orders o ON o.id = r.order_id
             ${returnSellerJoin}
             ${returnWhereClause}
             ORDER BY r.created_at DESC
             LIMIT 500`,
            returnParams
          )
          returnRows = rr.rows
        } catch (_) { /* returns table may not exist yet */ }

        const transactions = r.rows.map(row => {
          const commRate = parseFloat(row.commission_rate ?? 0.12)
          const sellerBasis = sellerOrderRevenueBasisCents(row)
          const customerPaid = resolveOrderPaidTotalCents(row)
          const commission = resolvePlatformApplicationFeeCents(row, commRate)
          const storedNet = Number(row.seller_net_after_commission_cents)
          const payout =
            Number.isFinite(storedNet) && storedNet >= 0 ? storedNet : Math.max(0, sellerBasis - commission)
          return {
            id: row.id,
            type: 'order',
            order_number: row.order_number,
            seller_id: row.seller_id,
            store_name: row.store_name || row.seller_id,
            total_cents: sellerBasis,
            customer_paid_cents: customerPaid,
            shipping_cents: row.shipping_cents || 0,
            discount_cents: row.discount_cents || 0,
            commission_rate: commRate,
            commission_cents: commission,
            payout_cents: payout,
            checkout_payment_kind: row.checkout_payment_kind || 'stripe',
            payment_intent_id: row.payment_intent_id || null,
            settlement_breakdown: buildOrderSettlementBreakdown(row, commRate),
            payout_eligible: row.payout_eligible === true || row.payout_eligible === 't',
            payment_status: row.payment_status || 'offen',
            delivery_status: row.delivery_status || null,
            iban: isSuperuser ? row.iban : undefined,
            stripe_transfer_status: row.stripe_transfer_status || null,
            stripe_transfer_id: row.stripe_transfer_id || null,
            stripe_transfer_error: row.stripe_transfer_error || null,
            stripe_transfer_at: row.stripe_transfer_at || null,
            stripe_payout_status: row.stripe_payout_status || null,
            stripe_payout_id: row.stripe_payout_id || null,
            stripe_account_id: isSuperuser ? (row.stripe_account_id || null) : undefined,
            delivery_date: row.delivery_date,
            created_at: row.created_at,
            first_name: row.first_name,
            last_name: row.last_name,
            currency: row.currency || 'EUR',
          }
        })
        // Append returns as negative transaction entries
        for (const row of returnRows) {
          const commRate = parseFloat(row.commission_rate ?? 0.12)
          const refund = Number(row.refund_cents || 0)
          transactions.push({
            id: `return-${row.id}`,
            type: 'return',
            order_number: row.order_number,
            return_number: row.return_number,
            seller_id: row.seller_id,
            total_cents: -refund,
            shipping_cents: 0,
            discount_cents: 0,
            commission_rate: commRate,
            commission_cents: refund > 0 ? -Math.round(refund * commRate) : 0,
            payout_cents: refund > 0 ? -(refund - Math.round(refund * commRate)) : 0,
            payout_eligible: false,
            payment_status: row.status || 'return',
            delivery_status: null,
            delivery_date: null,
            created_at: row.created_at,
            first_name: row.first_name,
            last_name: row.last_name,
            currency: row.currency || 'EUR',
          })
        }
        // Sort all by created_at desc
        transactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        // Group by seller if superuser
        const summary = {}
        for (const t of transactions) {
          const sid = t.seller_id
          if (!summary[sid]) summary[sid] = { seller_id: sid, store_name: t.store_name, total_cents: 0, commission_cents: 0, payout_cents: 0, order_count: 0, iban: t.iban }
          summary[sid].total_cents += t.total_cents
          summary[sid].commission_cents += t.commission_cents
          summary[sid].payout_cents += t.payout_cents
          summary[sid].order_count += 1
        }
        await client.end()
        res.json({ transactions, summary: Object.values(summary), count: transactions.length })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/commission-invoices — billing tab: lists seller_payouts as commission invoices
    const adminHubCommissionInvoicesGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const isSuperuser = req.sellerUser?.is_superuser || false
        const callerSellerId = req.sellerUser?.seller_id
        const params = []
        let where = ''
        if (!isSuperuser && callerSellerId) { params.push(callerSellerId); where = 'WHERE p.seller_id = $1' }
        const r = await client.query(
          `SELECT p.id, p.seller_id, p.period_start, p.period_end,
                  p.total_cents, p.commission_cents, p.payout_cents,
                  p.status, p.paid_at, p.created_at,
                  s.store_name
             FROM seller_payouts p
             LEFT JOIN seller_users s ON s.seller_id = p.seller_id
             ${where}
             ORDER BY p.period_start DESC LIMIT 200`,
          params
        )
        await client.end()
        const invoices = r.rows.map((row) => {
          const ps = new Date(row.period_start)
          const pe = new Date(row.period_end)
          const fmtD = (d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
          return {
            id: row.id,
            seller_id: row.seller_id,
            store_name: row.store_name || null,
            period: `${fmtD(ps)} – ${fmtD(pe)}`,
            period_label: `${ps.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}`,
            period_start: row.period_start,
            period_end: row.period_end,
            amount_cents: Number(row.commission_cents || 0),
            total_cents: Number(row.total_cents || 0),
            payout_cents: Number(row.payout_cents || 0),
            status: row.status || 'offen',
            paid_at: row.paid_at || null,
            created_at: row.created_at,
            pdf_url: `/admin-hub/v1/seller-payouts/${row.id}/pdf`,
          }
        })
        res.json({ invoices, count: invoices.length })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/seller-payouts/:id/pdf — Provisionsfaktur PDF for a payout period
    const adminHubSellerPayoutPdfGET = async (req, res) => {
      const { id } = req.params
      if (!id) return res.status(400).json({ message: 'id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
      const loggedSellerId = req.sellerUser?.seller_id
      const isSuperuser = req.sellerUser?.is_superuser || false
      let client
      try {
        const PDFDocument = require('pdfkit')
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const pRes = await client.query(
          `SELECT p.*, s.store_name, s.company_name, s.first_name, s.last_name,
                  s.vat_id, s.email, s.business_address, s.commission_rate, s.iban
             FROM seller_payouts p
             LEFT JOIN seller_users s ON s.seller_id = p.seller_id
             WHERE p.id = $1::uuid LIMIT 1`,
          [id]
        )
        const payout = pRes.rows?.[0]
        if (!payout) { await client.end(); return res.status(404).json({ message: 'Payout not found' }) }
        if (!isSuperuser && loggedSellerId && payout.seller_id !== loggedSellerId) {
          await client.end(); return res.status(403).json({ message: 'Access denied' })
        }

        // Load orders for this period
        const oRes = await client.query(
          `SELECT order_number, created_at, subtotal_cents, stripe_application_fee_cents, seller_net_after_commission_cents
             FROM store_orders
             WHERE seller_id = $1
               AND created_at >= $2::date
               AND created_at < ($3::date + interval '1 day')
               AND payment_status != 'storniert'
             ORDER BY created_at ASC LIMIT 200`,
          [payout.seller_id, payout.period_start, payout.period_end]
        )
        const orders = oRes.rows || []
        await client.end(); client = null

        const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal Marktplatz'
        const platformAddress = process.env.PLATFORM_INVOICE_ADDRESS || ''
        const platformVatId = process.env.PLATFORM_VAT_ID || ''
        const platformVatPercent = Number(process.env.PLATFORM_VAT_PERCENT || '0')

        const ps = new Date(payout.period_start)
        const pe = new Date(payout.period_end)
        const periodLabel = `${ps.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} – ${pe.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
        const invoiceNum = `PROV-${String(payout.period_start).slice(0, 7).replace('-', '')}`

        const doc = new PDFDocument({ margin: 42, size: 'A4', compress: false, pdfVersion: '1.7' })
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="Provisionsfaktur-${invoiceNum}.pdf"`)
        doc.pipe(res)
        renderPeriodCommissionInvoiceDocument(doc, {
          payout,
          orders,
          shopName,
          platformAddress,
          platformVatId,
          platformVatPercent,
          invoiceNumber: invoiceNum,
          periodLabel,
        })
        doc.end()
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        if (!res.headersSent) res.status(500).json({ message: e?.message || 'PDF error' })
      }
    }

  const router = Router()
  router.get('/admin-hub/v1/transactions', adminHubTransactionsGET)
  router.get('/admin-hub/v1/commission-invoices', adminHubCommissionInvoicesGET)
  router.get('/admin-hub/v1/seller-payouts/:id/pdf', adminHubSellerPayoutPdfGET)

  return router
}
