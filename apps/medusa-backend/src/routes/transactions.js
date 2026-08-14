'use strict'
const { Router } = require('express')
const { resolveOrderPaidTotalCents, orderBonusDiscountCents } = require('../order-money')
const { renderPeriodCommissionInvoiceDocument } = require('../order-pdf-layout')
const { enrichOrderItemRows, filterItemsForSeller, itemsSubtotalCents } = require('../order-items-seller')
const { resolveSellerScope, sqlOrderOwnedBySeller } = require('../seller-scope')
const { salesInvoiceVat } = require('../goods-vat')

const PLATFORM_VAT_PERCENT = Number(process.env.PLATFORM_VAT_PERCENT || '0')

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
        const scope = resolveSellerScope(req.sellerUser)
        if (!scope) {
          await client.end()
          return res.status(403).json({ message: 'Forbidden' })
        }
        const isSuperuser = scope.isSuperuser
        const filterSellerId = isSuperuser
          ? (String(req.query.seller_id || '').trim() || null)
          : scope.sellerId
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
          where.push(sqlOrderOwnedBySeller('o', `$${sellerParamNum}`))
        } else if (!isSuperuser) {
          await client.end()
          return res.status(403).json({ message: 'Forbidden' })
        }
        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
        // Join seller_users using the actual seller or falling back to filterSellerId for 'default' orders
        const sellerJoin = sellerParamNum
          ? `LEFT JOIN seller_users s ON s.seller_id = CASE WHEN o.seller_id IS NOT NULL AND o.seller_id != 'default' THEN o.seller_id ELSE $${sellerParamNum}::varchar END`
          : `LEFT JOIN seller_users s ON s.seller_id = o.seller_id`
        const r = await client.query(
          `SELECT o.id, o.order_number, o.seller_id, o.customer_id, o.subtotal_cents, o.total_cents, o.shipping_cents, o.discount_cents,
                  o.coupon_discount_cents, o.country, o.bonus_points_redeemed, o.customer_vat_id,
                  COALESCE(o.platform_bonus_funding_cents, 0)::bigint AS platform_bonus_funding_cents,
                  o.payment_status, o.delivery_status, o.delivery_date, o.created_at,
                  o.stripe_transfer_status, o.stripe_transfer_id, o.stripe_transfer_error, o.stripe_transfer_at,
                  o.payment_intent_id, COALESCE(o.checkout_payment_kind, 'stripe') AS checkout_payment_kind,
                  o.stripe_application_fee_cents,
                  COALESCE(o.seller_net_after_commission_cents, 0)::bigint AS seller_net_after_commission_cents,
                  o.stripe_payout_status, o.stripe_payout_id, o.stripe_account_id,
                  o.first_name, o.last_name, o.email, o.currency,
                  s.store_name, s.commission_rate, s.iban, s.vat_id,
                  COALESCE((SELECT SUM(rr.refund_amount_cents) FROM store_returns rr WHERE rr.order_id = o.id), 0)::bigint AS refund_cents,
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
          returnWhere.push(sqlOrderOwnedBySeller('o', `$${returnSellerParamNum}`))
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

        const transactions = await Promise.all(r.rows.map(async (row) => {
          const commRate = parseFloat(row.commission_rate ?? 0.12)
          // A shared (multi-seller) order's basis must come from only THIS seller's own line
          // items — sellerOrderRevenueBasisCents() operates on the whole order and would
          // otherwise attribute another seller's revenue to this seller too.
          const isSharedForeignOrder = !!filterSellerId && String(row.seller_id || '').trim() !== String(filterSellerId).trim()
          let sellerBasis = sellerOrderRevenueBasisCents(row)
          if (isSharedForeignOrder) {
            const iRes = await client.query(`SELECT * FROM store_order_items WHERE order_id = $1`, [row.id])
            const enriched = await enrichOrderItemRows(client, iRes.rows || [])
            const mine = filterItemsForSeller(enriched, filterSellerId, { isSuperuser: false, orderSellerId: row.seller_id })
            sellerBasis = itemsSubtotalCents(mine)
          }
          const customerPaid = resolveOrderPaidTotalCents(row)
          const commission = isSharedForeignOrder
            ? Math.round(sellerBasis * commRate)
            : resolvePlatformApplicationFeeCents(row, commRate)
          const storedNet = Number(row.seller_net_after_commission_cents)
          const payout = isSharedForeignOrder
            ? Math.max(0, sellerBasis - commission)
            : (Number.isFinite(storedNet) && storedNet >= 0 ? storedNet : Math.max(0, sellerBasis - commission))
          // Bonus points are platform-funded, not a seller price cut — the real (legal) order
          // value is the paid amount plus the bonus-funded portion (BonusPunkte.md §3.5/§3.6).
          const bonusRedeemedCents = orderBonusDiscountCents(row)
          const orderValueCents = Math.max(0, customerPaid + bonusRedeemedCents)
          const sellerVatId = row.vat_id ? String(row.vat_id).trim() : ''
          const customerVatId = row.customer_vat_id ? String(row.customer_vat_id).trim() : ''
          const goodsVat = salesInvoiceVat(row, { sellerHasVatId: !!sellerVatId, taxableGrossCents: orderValueCents, customerVatId })
          const commissionVatCents = PLATFORM_VAT_PERCENT > 0 ? Math.round(commission * PLATFORM_VAT_PERCENT / 100) : 0
          return {
            id: row.id,
            order_id: row.id,
            type: 'order',
            order_number: row.order_number,
            seller_id: row.seller_id,
            customer_id: row.customer_id || null,
            store_name: row.store_name || row.seller_id,
            total_cents: sellerBasis,
            customer_paid_cents: customerPaid,
            shipping_cents: row.shipping_cents || 0,
            discount_cents: row.discount_cents || 0,
            commission_rate: commRate,
            commission_cents: commission,
            commission_vat_cents: commissionVatCents,
            payout_cents: payout,
            checkout_payment_kind: row.checkout_payment_kind || 'stripe',
            payment_intent_id: row.payment_intent_id || null,
            stripe_transfer_or_payout_id: row.stripe_transfer_id || row.stripe_payout_id || null,
            settlement_breakdown: buildOrderSettlementBreakdown(row, commRate),
            gross_sale_cents: sellerBasis,
            bonus_earned_points: Math.ceil(Number(customerPaid || 0) / 100),
            bonus_redeemed_cents: bonusRedeemedCents,
            platform_bonus_funding_cents: Number(row.platform_bonus_funding_cents || 0),
            refund_cents: Number(row.refund_cents || 0),
            destination_country: row.country ? String(row.country).trim().toUpperCase() : null,
            vat_scheme: goodsVat.scheme,
            goods_vat_rate_percent: goodsVat.exempt ? 0 : goodsVat.ratePercent,
            goods_net_cents: goodsVat.netCents,
            goods_vat_cents: goodsVat.vatCents,
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
        }))
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
        // Append seller ledger adjustments (e.g. shipping label charges) as their own entries —
        // description_key/description_params travel as-is so the frontend can render them
        // localized via the same lt()/copy pattern used for every other Transactions string.
        try {
          const ledgerParams = []
          let ledgerWhere = ''
          if (filterSellerId) {
            ledgerParams.push(filterSellerId)
            ledgerWhere = 'WHERE la.seller_id = $1'
          }
          const lr = await client.query(
            `SELECT la.id, la.seller_id, la.type, la.amount_cents, la.description_key, la.description_params,
                    la.order_id, la.charge_method, la.created_at, o.order_number, s.store_name
             FROM seller_ledger_adjustments la
             LEFT JOIN store_orders o ON o.id = la.order_id
             LEFT JOIN seller_users s ON s.seller_id = la.seller_id
             ${ledgerWhere}
             ORDER BY la.created_at DESC LIMIT 500`,
            ledgerParams,
          )
          for (const row of lr.rows || []) {
            transactions.push({
              id: `ledger-${row.id}`,
              type: 'ledger_adjustment',
              adjustment_type: row.type,
              order_number: row.order_number,
              seller_id: row.seller_id,
              store_name: row.store_name || row.seller_id,
              total_cents: Number(row.amount_cents || 0),
              shipping_cents: 0,
              discount_cents: 0,
              commission_rate: 0,
              commission_cents: 0,
              payout_cents: Number(row.amount_cents || 0),
              payout_eligible: false,
              payment_status: null,
              delivery_status: null,
              delivery_date: null,
              created_at: row.created_at,
              charge_method: row.charge_method,
              description_key: row.description_key,
              description_params: row.description_params,
              currency: 'EUR',
            })
          }
        } catch (_) { /* seller_ledger_adjustments may not exist yet on an older DB */ }
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

    // POST /admin-hub/v1/transactions/manual-adjustment — superuser adds a manual credit/debit
    // entry to a seller's ledger (e.g. a goodwill credit or a manual correction) — reuses the
    // same seller_ledger_adjustments table as shipping-label charges, shown alongside them.
    const adminHubManualAdjustmentPOST = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const { seller_id, amount_cents, note } = req.body || {}
      const sellerId = String(seller_id || '').trim()
      const amountCents = Math.round(Number(amount_cents))
      if (!sellerId) return res.status(400).json({ message: 'seller_id required' })
      if (!Number.isFinite(amountCents) || amountCents === 0) return res.status(400).json({ message: 'amount_cents must be a non-zero number' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const r = await client.query(
          `INSERT INTO seller_ledger_adjustments (seller_id, type, amount_cents, description_key, description_params)
           VALUES ($1, 'manual_adjustment', $2, 'manual_note', $3::jsonb)
           RETURNING *`,
          [sellerId, amountCents, JSON.stringify({ note: String(note || '').trim(), by: req.sellerUser?.email || null })],
        )
        await client.end()
        res.status(201).json({ adjustment: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // DELETE /admin-hub/v1/transactions/manual-adjustment/:id — superuser removes a manual entry
    // they added. Restricted to type='manual_adjustment' so this can never delete a real
    // shipping-label charge record (those must stay for the seller's own billing history).
    const adminHubManualAdjustmentDELETE = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const r = await client.query(
          `DELETE FROM seller_ledger_adjustments WHERE id = $1::uuid AND type = 'manual_adjustment' RETURNING id`,
          [req.params.id],
        )
        await client.end()
        if (!r.rows[0]) return res.status(404).json({ message: 'Not found (or not a manual adjustment)' })
        res.json({ deleted: true })
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
  router.post('/admin-hub/v1/transactions/manual-adjustment', adminHubManualAdjustmentPOST)
  router.delete('/admin-hub/v1/transactions/manual-adjustment/:id', adminHubManualAdjustmentDELETE)
  router.get('/admin-hub/v1/commission-invoices', adminHubCommissionInvoicesGET)
  router.get('/admin-hub/v1/seller-payouts/:id/pdf', adminHubSellerPayoutPdfGET)

  return router
}
