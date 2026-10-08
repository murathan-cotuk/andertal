'use strict'
const { Router } = require('express')
const settlement = require('../settlement')
const { resolveSellerScope } = require('../seller-scope')

/**
 * Canonical settlement API (Payment → Payable → Ledger → Refund/Dispute → Settlement → Payout).
 * Sellers only ever see their own data; every money-moving endpoint is superuser-only except a
 * seller refunding its OWN lines (checked in the domain layer, Phase 20).
 */
module.exports = function createSettlementRouter({ loadPlatformCheckoutRow, resolveStripeSecretKeyFromPlatform }) {
  const getDbClient = () => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    if (!dbUrl || !dbUrl.startsWith('postgres')) return null
    const { Client } = require('pg')
    return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
  }
  const stripeFor = async (client) => {
    const key = resolveStripeSecretKeyFromPlatform(await loadPlatformCheckoutRow(client))
    return key ? new (require('stripe'))(key) : null
  }
  const actorOf = (req) => `${req.sellerUser?.is_superuser ? 'superuser' : 'seller'}:${req.sellerUser?.email || req.sellerUser?.seller_id || '?'}`

  /** Wraps a handler with a connected client + uniform error mapping. */
  const handler = (fn) => async (req, res) => {
    const scope = resolveSellerScope(req.sellerUser)
    if (!scope) return res.status(403).json({ message: 'Forbidden' })
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      await fn(req, res, client, scope)
    } catch (e) {
      if (!res.headersSent) res.status(e?.status || 500).json({ message: e?.message || 'Error', ...(e?.missing ? { missing: e.missing } : {}) })
    } finally {
      try { await client.end() } catch (_) {}
    }
  }
  const superOnly = (fn) => handler(async (req, res, client, scope) => {
    if (!scope.isSuperuser) return res.status(403).json({ message: 'Superuser access required' })
    return fn(req, res, client, scope)
  })
  const sellerParam = (req, scope) => (scope.isSuperuser ? String(req.query.seller_id || req.body?.seller_id || '').trim() : scope.sellerId)

  const router = Router()

  router.get('/admin-hub/v1/settlement/summary', handler(async (req, res, client, scope) => {
    const sellerId = sellerParam(req, scope)
    if (!sellerId) return res.status(400).json({ message: 'seller_id required' })
    const summary = await settlement.sellerSettlementSummary(client, sellerId)
    const readiness = await settlement.sellerAccountReadiness(client, sellerId)
    res.json({ seller_id: sellerId, ...summary, payout_account: readiness })
  }))

  router.get('/admin-hub/v1/settlement/payables', handler(async (req, res, client, scope) => {
    const sellerId = sellerParam(req, scope)
    const params = []
    const where = []
    if (sellerId) { params.push(sellerId); where.push(`p.seller_id = $${params.length}`) } else if (!scope.isSuperuser) return res.status(403).json({ message: 'Forbidden' })
    if (req.query.status) { params.push(String(req.query.status)); where.push(`p.status = $${params.length}`) }
    if (req.query.order_id) { params.push(String(req.query.order_id)); where.push(`p.order_id::text = $${params.length}`) }
    const r = await client.query(
      `SELECT p.*, o.order_number FROM seller_payables p LEFT JOIN store_orders o ON o.id = p.order_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.created_at DESC LIMIT 500`,
      params,
    )
    res.json({ payables: r.rows })
  }))

  router.get('/admin-hub/v1/settlement/ledger', handler(async (req, res, client, scope) => {
    const sellerId = sellerParam(req, scope)
    if (!sellerId) return res.status(400).json({ message: 'seller_id required' })
    const r = await client.query(
      `SELECT e.*, o.order_number,
              (SELECT i.payout_id FROM seller_payout_items i WHERE i.ledger_entry_id = e.id AND i.released_at IS NULL LIMIT 1) AS settled_by_payout_id
         FROM seller_ledger_entries e LEFT JOIN store_orders o ON o.id = e.order_id
        WHERE e.seller_id = $1 ORDER BY e.created_at DESC, e.id LIMIT 1000`,
      [sellerId],
    )
    res.json({ entries: r.rows, balance_cents: await settlement.sellerLedgerBalanceCents(client, sellerId) })
  }))

  router.get('/admin-hub/v1/settlement/payouts', handler(async (req, res, client, scope) => {
    const sellerId = sellerParam(req, scope)
    if (!sellerId && !scope.isSuperuser) return res.status(403).json({ message: 'Forbidden' })
    const r = await client.query(
      `SELECT p.*, s.store_name FROM seller_settlement_payouts p LEFT JOIN seller_users s ON s.seller_id = p.seller_id AND s.sub_of_seller_id IS NULL
        ${sellerId ? 'WHERE p.seller_id = $1' : ''} ORDER BY p.created_at DESC LIMIT 300`,
      sellerId ? [sellerId] : [],
    )
    res.json({ payouts: r.rows })
  }))

  // Manual bank transfer done outside Stripe: superuser + real reference + exact amount (Phase 1).
  router.post('/admin-hub/v1/settlement/payouts/manual', superOnly(async (req, res, client) => {
    const { seller_id: sellerId, transfer_reference: ref, confirm_amount_cents: amount } = req.body || {}
    const r = await settlement.createSettlementPayout(client, {
      sellerId: String(sellerId || '').trim(), method: 'manual_bank_transfer',
      businessKey: `MANUAL:${String(sellerId || '').trim()}:${String(ref || '').trim()}`,
      externalReference: ref, expectedAmountCents: amount != null ? Number(amount) : null, actor: actorOf(req),
    })
    if (!r.payout) return res.status(409).json({ message: `Nothing to settle (${r.skipped})`, ...r })
    res.json(r)
  }))

  // Immediate Stripe payout for one seller (replaces the old "seller-iban-now" money path).
  router.post('/admin-hub/v1/settlement/payouts/run', superOnly(async (req, res, client) => {
    const sellerId = String(req.body?.seller_id || '').trim()
    if (!sellerId || sellerId === 'default') return res.status(400).json({ message: 'seller_id required' })
    const stripe = await stripeFor(client)
    if (!stripe) return res.status(503).json({ message: 'Stripe not configured' })
    const day = new Date().toISOString().slice(0, 10)
    const [result] = await settlement.runScheduledPayouts(client, stripe, {
      runKey: `MANUAL-RUN:${day}:${req.body?.request_id || Date.now()}`, onlySellerId: sellerId, actor: actorOf(req),
    })
    if (!result?.payoutId) return res.status(422).json({ message: `Keine Auszahlung: ${result?.skipped || result?.error || 'unbekannt'}`, ...result })
    res.json(result)
  }))

  router.post('/admin-hub/v1/settlement/payouts/:id/retry', superOnly(async (req, res, client) => {
    const stripe = await stripeFor(client)
    if (!stripe) return res.status(503).json({ message: 'Stripe not configured' })
    res.json(await settlement.retryBankPayout(client, stripe, req.params.id, { actor: actorOf(req) }))
  }))

  router.post('/admin-hub/v1/settlement/orders/:id/confirm-delivery', superOnly(async (req, res, client) => {
    const at = req.body?.delivered_at ? new Date(req.body.delivered_at) : new Date()
    if (Number.isNaN(at.getTime()) || at.getTime() > Date.now()) return res.status(400).json({ message: 'invalid delivered_at' })
    res.json(await settlement.confirmDelivery(client, req.params.id, { source: 'superuser', at, actor: actorOf(req) }))
  }))

  // Refund (real Stripe refund + allocation). Sellers may only refund their own lines.
  router.post('/admin-hub/v1/settlement/orders/:id/refunds', handler(async (req, res, client, scope) => {
    const b = req.body || {}
    if (!b.request_id) return res.status(400).json({ message: 'request_id required (idempotency)' })
    const { refund } = await settlement.createRefundRecord(client, {
      orderId: req.params.id,
      amountCents: Number(b.amount_cents),
      lines: Array.isArray(b.lines) ? b.lines : null,
      shippingSellerIds: Array.isArray(b.shipping_seller_ids) ? b.shipping_seller_ids : [],
      sellerScope: scope.isSuperuser ? (b.seller_id || null) : null,
      actorSellerId: scope.isSuperuser ? null : scope.sellerId,
      reason: b.reason || null,
      actor: actorOf(req),
      idempotencyKey: `api:${req.params.id}:${b.request_id}`,
    })
    const stripe = await stripeFor(client)
    res.json({ refund: await settlement.executeRefund(client, stripe, refund.id, { actor: actorOf(req) }) })
  }))

  router.get('/admin-hub/v1/settlement/orders/:id', handler(async (req, res, client, scope) => {
    const id = req.params.id
    const own = scope.isSuperuser ? null : scope.sellerId
    const pay = (await client.query('SELECT * FROM order_payments WHERE order_id::text = $1', [id])).rows[0] || null
    const payables = (await client.query(`SELECT * FROM seller_payables WHERE order_id::text = $1 ${own ? 'AND seller_id = $2' : ''} ORDER BY kind, seller_id`, own ? [id, own] : [id])).rows
    if (own && !payables.length) return res.status(404).json({ message: 'Not found' })
    const refunds = (await client.query('SELECT * FROM order_refunds WHERE order_id::text = $1 ORDER BY created_at', [id])).rows
    const disputes = (await client.query('SELECT * FROM order_disputes WHERE order_id::text = $1', [id])).rows
    res.json({ payment: scope.isSuperuser ? pay : (pay ? { status: pay.status, payment_succeeded_at: pay.payment_succeeded_at } : null), payables, refunds, disputes })
  }))

  router.get('/admin-hub/v1/settlement/webhook-events', superOnly(async (req, res, client) => {
    const st = String(req.query.status || '').trim()
    const r = await client.query(
      `SELECT stripe_event_id, type, account, status, attempts, last_error, received_at, processed_at
         FROM stripe_webhook_events ${st ? 'WHERE status = $1' : ''} ORDER BY received_at DESC LIMIT 300`,
      st ? [st] : [],
    )
    res.json({ events: r.rows })
  }))

  // ── Superuser review queue: everything that needs a human decision, in one place ──
  router.get('/admin-hub/v1/settlement/review', superOnly(async (req, res, client) => {
    const q = async (sql, p = []) => (await client.query(sql, p).catch(() => ({ rows: [] }))).rows
    const payouts = await q(
      `SELECT p.id, p.seller_id, s.store_name, p.status, p.amount_cents, p.failure_code, p.failure_message,
              p.attempt_count, p.created_at, p.updated_at, p.stripe_payout_id
         FROM seller_settlement_payouts p LEFT JOIN seller_users s ON s.seller_id = p.seller_id AND s.sub_of_seller_id IS NULL
        WHERE p.status IN ('transfer_review', 'payout_failed')
           OR (p.status = 'failed' AND p.updated_at > now() - interval '30 days')
           OR (p.status IN ('transferred', 'transfer_pending', 'created') AND p.updated_at < now() - interval '48 hours')
        ORDER BY p.updated_at DESC LIMIT 200`,
    )
    const refunds = await q(
      `SELECT r.id, r.order_id, o.order_number, r.amount_cents, r.status, r.reason, r.failure_reason, r.stripe_refund_id,
              r.requested_by, r.created_at,
              NOT EXISTS (SELECT 1 FROM order_refund_lines l WHERE l.refund_id = r.id) AS unallocated
         FROM order_refunds r LEFT JOIN store_orders o ON o.id = r.order_id
        WHERE (r.status = 'pending' AND r.stripe_refund_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM order_refund_lines l WHERE l.refund_id = r.id))
           OR (r.status IN ('pending', 'processing') AND r.updated_at < now() - interval '24 hours')
           OR (r.status = 'failed' AND r.updated_at > now() - interval '30 days')
        ORDER BY r.created_at DESC LIMIT 200`,
    )
    const webhooks = await q(
      `SELECT stripe_event_id, type, status, attempts, last_error, received_at FROM stripe_webhook_events
        WHERE status = 'failed' OR (status IN ('received', 'processing') AND received_at < now() - interval '1 hour')
        ORDER BY received_at DESC LIMIT 200`,
    )
    // Paid at Stripe but no order created (checkout crashed between payment and order insert).
    const orphanPayments = await q(
      `SELECT e.stripe_event_id, e.payload->'data'->'object'->>'id' AS payment_intent_id,
              (e.payload->'data'->'object'->>'amount_received')::bigint AS amount_cents, e.received_at
         FROM stripe_webhook_events e
        WHERE e.type = 'payment_intent.succeeded' AND e.received_at < now() - interval '1 hour'
          AND NOT EXISTS (SELECT 1 FROM store_orders o WHERE o.payment_intent_id = e.payload->'data'->'object'->>'id')
          AND COALESCE(e.payload->'data'->'object'->'metadata'->>'type', '') <> 'campaign_budget'
        ORDER BY e.received_at DESC LIMIT 200`,
    )
    const sellers = await q(
      `SELECT seller_id, store_name, payout_blocked, payout_block_reason, stripe_service_agreement,
              stripe_custom_account_id, stripe_payouts_enabled, stripe_disabled_reason, bank_holder_matches_legal_entity
         FROM seller_users
        WHERE sub_of_seller_id IS NULL AND COALESCE(is_superuser, false) = false
          AND (COALESCE(payout_blocked, false)
               OR (stripe_custom_account_id IS NOT NULL AND COALESCE(stripe_service_agreement, '') <> 'recipient')
               OR bank_holder_matches_legal_entity = false
               OR (stripe_custom_account_id IS NOT NULL AND stripe_payouts_enabled IS DISTINCT FROM true))
        ORDER BY store_name LIMIT 300`,
    )
    const unresolved = await q(
      `SELECT entity_id AS order_id, details, created_at FROM finance_audit_log
        WHERE action = 'payable_seller_unresolved' ORDER BY created_at DESC LIMIT 100`,
    )
    const awaitingDelivery = await q(
      `SELECT o.id, o.order_number, o.created_at, o.delivery_status, o.seller_reported_delivered_at, o.tracking_number
         FROM store_orders o
        WHERE o.delivery_confirmed_at IS NULL AND o.payment_status = 'bezahlt'
          AND EXISTS (SELECT 1 FROM seller_payables p WHERE p.order_id = o.id AND p.status IN ('pending', 'blocked'))
          AND (o.seller_reported_delivered_at IS NOT NULL OR o.created_at < now() - interval '21 days')
        ORDER BY o.created_at ASC LIMIT 200`,
    )
    res.json({ payouts, refunds, webhooks, orphan_payments: orphanPayments, sellers, unresolved_payables: unresolved, awaiting_delivery_confirmation: awaitingDelivery })
  }))

  router.post('/admin-hub/v1/settlement/refunds/:id/allocate', superOnly(async (req, res, client) => {
    const b = req.body || {}
    const r = await settlement.allocateExternalRefund(client, req.params.id, {
      lines: Array.isArray(b.lines) ? b.lines : null, sellerId: b.seller_id || null,
      shippingSellerIds: Array.isArray(b.shipping_seller_ids) ? b.shipping_seller_ids : [], actor: actorOf(req),
    })
    res.json({ applied: r.applied })
  }))

  router.post('/admin-hub/v1/settlement/sellers/:sellerId/payout-block', superOnly(async (req, res, client) => {
    const blocked = req.body?.blocked === true
    const reason = String(req.body?.reason || '').trim()
    if (reason.length < 5) return res.status(400).json({ message: 'reason required (min. 5 Zeichen) — wird dem Verkäufer mitgeteilt (Vertrag §11)' })
    await client.query(
      `UPDATE seller_users SET payout_blocked = $2, payout_block_reason = $3 WHERE seller_id = $1 AND sub_of_seller_id IS NULL`,
      [req.params.sellerId, blocked, blocked ? reason : null],
    )
    await settlement.auditFinance(client, { actor: actorOf(req), action: blocked ? 'seller_payout_blocked' : 'seller_payout_unblocked', entityType: 'seller', entityId: req.params.sellerId, sellerId: req.params.sellerId, details: { reason } })
    await settlement.refreshEligibilityForSeller(client, req.params.sellerId)
    // Vertrag §11: reason of a retention is communicated to the seller on a durable medium.
    try {
      const { insertAdminHubNotificationSafe } = require('../admin-hub-notify')
      await insertAdminHubNotificationSafe({
        type: blocked ? 'payout_blocked' : 'payout_unblocked',
        title: blocked ? 'Auszahlungen vorübergehend zurückbehalten' : 'Auszahlungen wieder freigegeben',
        body: blocked ? `Grund: ${reason}` : `Hinweis: ${reason}`,
        sellerId: req.params.sellerId,
        referenceId: req.params.sellerId,
        client,
      })
    } catch (_) {}
    res.json({ success: true })
  }))

  // Re-process a stored Stripe event (failed / stuck) from its verified payload.
  router.post('/admin-hub/v1/settlement/webhook-events/:id/replay', superOnly(async (req, res, client) => {
    const ev = (await client.query('SELECT payload, status FROM stripe_webhook_events WHERE stripe_event_id = $1', [req.params.id])).rows[0]
    if (!ev) return res.status(404).json({ message: 'event not found' })
    if (ev.status === 'processed' || ev.status === 'ignored') return res.status(409).json({ message: `event already ${ev.status}` })
    await client.query(`UPDATE stripe_webhook_events SET status = 'received' WHERE stripe_event_id = $1`, [req.params.id])
    const out = await settlement.processStripeEvent(client, await stripeFor(client), ev.payload)
    await settlement.auditFinance(client, { actor: actorOf(req), action: 'webhook_replayed', entityType: 'stripe_event', entityId: req.params.id, details: { result: out } })
    res.json(out)
  }))

  router.get('/admin-hub/v1/settlement/audit', superOnly(async (req, res, client) => {
    const params = []
    const where = []
    if (req.query.entity_id) { params.push(String(req.query.entity_id)); where.push(`entity_id = $${params.length}`) }
    if (req.query.seller_id) { params.push(String(req.query.seller_id)); where.push(`seller_id = $${params.length}`) }
    const r = await client.query(`SELECT * FROM finance_audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 500`, params)
    res.json({ entries: r.rows })
  }))

  // ── Seller payout account (Stripe Custom) — KYC data is the seller's own, never fabricated ──
  router.get('/admin-hub/v1/seller/payout-account', handler(async (req, res, client, scope) => {
    const sellerId = sellerParam(req, scope)
    const s = (await client.query(
      `SELECT stripe_custom_account_id, stripe_payouts_enabled, stripe_transfers_capability, stripe_requirements,
              stripe_disabled_reason, stripe_account_synced_at, stripe_tos_accepted_at,
              stripe_external_account_status, stripe_external_account_last4, bank_holder_matches_legal_entity,
              legal_entity_type, legal_name, date_of_birth, tax_id, tax_id_country, business_registration_number,
              business_registration_country, payout_blocked, payout_block_reason, vat_id, business_address,
              stripe_service_agreement
         FROM seller_users WHERE seller_id = $1 AND sub_of_seller_id IS NULL ORDER BY created_at ASC LIMIT 1`,
      [sellerId],
    )).rows[0]
    if (!s) return res.status(404).json({ message: 'Seller not found' })
    res.json({ account: s, readiness: await settlement.sellerAccountReadiness(client, sellerId) })
  }))

  router.patch('/admin-hub/v1/seller/legal-profile', require('../seller-permission').requireSellerPage('/settings/payments'), handler(async (req, res, client, scope) => {
    const sellerId = sellerParam(req, scope)
    const b = req.body || {}
    const type = b.legal_entity_type != null ? String(b.legal_entity_type).toLowerCase() : undefined
    if (type !== undefined && !['individual', 'company'].includes(type)) return res.status(400).json({ message: 'legal_entity_type must be individual or company' })
    const cc = (v) => (v == null ? undefined : String(v).trim().toUpperCase().slice(0, 2) || null)
    const fields = {
      legal_entity_type: type,
      legal_name: b.legal_name != null ? String(b.legal_name).trim() || null : undefined,
      date_of_birth: b.date_of_birth != null ? (String(b.date_of_birth).trim() || null) : undefined,
      tax_id_country: cc(b.tax_id_country),
      business_registration_number: b.business_registration_number != null ? String(b.business_registration_number).trim() || null : undefined,
      business_registration_country: cc(b.business_registration_country),
      tax_id: b.tax_id != null ? String(b.tax_id).trim() || null : undefined,
    }
    const sets = []
    const params = [sellerId]
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue
      params.push(v)
      sets.push(`${k} = $${params.length}`)
    }
    if (!sets.length) return res.status(400).json({ message: 'Nothing to update' })
    await client.query(`UPDATE seller_users SET ${sets.join(', ')}, updated_at = now() WHERE seller_id = $1 AND sub_of_seller_id IS NULL`, params)
    await settlement.auditFinance(client, { actor: actorOf(req), action: 'legal_profile_updated', entityType: 'seller', entityId: sellerId, sellerId, details: { fields: Object.keys(fields).filter((k) => fields[k] !== undefined) } })
    res.json({ success: true })
  }))

  // Creates / updates the Custom account. Terms acceptance is recorded only with accept_stripe_tos.
  router.post('/admin-hub/v1/seller/payout-account', require('../seller-permission').requireSellerPage('/settings/payments'), handler(async (req, res, client, scope) => {
    if (scope.isSuperuser && !req.body?.seller_id) return res.status(400).json({ message: 'seller_id required' })
    const sellerId = sellerParam(req, scope)
    const stripe = await stripeFor(client)
    if (!stripe) return res.status(503).json({ message: 'Stripe not configured' })
    let tos = null
    if (req.body?.accept_stripe_tos === true) {
      if (scope.isSuperuser) return res.status(403).json({ message: 'Only the seller can accept the Stripe terms' })
      // Only the account owner (not an invited sub-user) may accept on behalf of the business.
      const me = (await client.query('SELECT sub_of_seller_id FROM seller_users WHERE id::text = $1', [String(req.sellerUser?.id || '')])).rows[0]
      if (!me || me.sub_of_seller_id) return res.status(403).json({ message: 'Only the account owner can accept the Stripe terms' })
      const ip = settlement.clientIpFromRequest(req)
      if (!ip) return res.status(400).json({ message: 'Client IP could not be determined — terms acceptance not recorded' })
      tos = { ip, userAgent: req.headers['user-agent'] || null, date: new Date() }
    }
    const account = await settlement.ensureCustomAccount(client, stripe, sellerId, { tos, actor: actorOf(req) })
    res.json({ account_id: account.id, payouts_enabled: account.payouts_enabled, requirements: account.requirements || null })
  }))

  router.post('/admin-hub/v1/seller/payout-account/onboarding-link', require('../seller-permission').requireSellerPage('/settings/payments'), handler(async (req, res, client, scope) => {
    const sellerId = sellerParam(req, scope)
    const stripe = await stripeFor(client)
    if (!stripe) return res.status(503).json({ message: 'Stripe not configured' })
    const s = (await client.query('SELECT stripe_custom_account_id FROM seller_users WHERE seller_id = $1 AND sub_of_seller_id IS NULL LIMIT 1', [sellerId])).rows[0]
    if (!s?.stripe_custom_account_id) return res.status(409).json({ message: 'Zuerst Auszahlungskonto anlegen' })
    const base = String(process.env.SELLERCENTRAL_PUBLIC_URL || req.headers.origin || '').replace(/\/$/, '')
    if (!base) return res.status(400).json({ message: 'SELLERCENTRAL_PUBLIC_URL not configured' })
    const link = await settlement.createOnboardingLink(stripe, s.stripe_custom_account_id, {
      refreshUrl: `${base}/settings/payments?stripe=refresh`, returnUrl: `${base}/settings/payments?stripe=return`,
    })
    res.json({ url: link.url, expires_at: link.expires_at })
  }))

  return router
}
