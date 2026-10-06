'use strict'

const { withTx, lockKey, appendLedgerEntry, auditFinance } = require('./ledger')
const { commissionCents, vatOnCents, allocateProportional, evaluateEligibility, commissionVatScheme } = require('./money')
const { resolveSellerCommissionRate, resolveProductCommissionOverride } = require('../commission-rate')
const { resolvePlatformCommissionVatPercent, EU_COUNTRIES } = require('../goods-vat')

const realSellerId = (v) => {
  const s = String(v || '').trim()
  return s && s !== 'default' ? s : null
}

/**
 * Payment snapshot (Phase 4). Upserts the single order_payments row of an order. Callers pass
 * values they VERIFIED against Stripe (checkout retrieves the PaymentIntent; the webhook carries
 * a signed event). Later calls only fill gaps (charge id, fee) — the amount is never overwritten.
 */
async function recordOrderPayment(client, p) {
  const orderId = p.orderId
  if (!orderId) throw new Error('recordOrderPayment: orderId required')
  const r = await client.query(
    `INSERT INTO order_payments
       (order_id, provider, payment_intent_id, charge_id, balance_transaction_id, currency,
        gross_amount_cents, stripe_fee_cents, stripe_net_cents, fee_bearer, status, payment_succeeded_at, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (order_id) DO UPDATE SET
       charge_id = COALESCE(order_payments.charge_id, EXCLUDED.charge_id),
       balance_transaction_id = COALESCE(order_payments.balance_transaction_id, EXCLUDED.balance_transaction_id),
       stripe_fee_cents = COALESCE(order_payments.stripe_fee_cents, EXCLUDED.stripe_fee_cents),
       stripe_net_cents = COALESCE(order_payments.stripe_net_cents, EXCLUDED.stripe_net_cents),
       fee_bearer = COALESCE(order_payments.fee_bearer, EXCLUDED.fee_bearer),
       payment_succeeded_at = COALESCE(order_payments.payment_succeeded_at, EXCLUDED.payment_succeeded_at),
       updated_at = now()
     RETURNING *`,
    [
      orderId, p.provider || 'stripe', p.paymentIntentId || null, p.chargeId || null, p.balanceTransactionId || null,
      String(p.currency || 'eur').toLowerCase(), Math.max(0, Math.round(Number(p.grossAmountCents) || 0)),
      p.stripeFeeCents != null ? Math.round(Number(p.stripeFeeCents)) : null,
      p.stripeNetCents != null ? Math.round(Number(p.stripeNetCents)) : null,
      p.feeBearer || null, p.status || 'succeeded', p.paymentSucceededAt || new Date(), p.source || 'checkout_verified',
    ],
  )
  const row = r.rows[0]
  if (Number(row.gross_amount_cents) !== Math.max(0, Math.round(Number(p.grossAmountCents) || 0))) {
    await auditFinance(client, {
      action: 'payment_amount_mismatch', entityType: 'order', entityId: orderId,
      details: { stored: Number(row.gross_amount_cents), reported: p.grossAmountCents, source: p.source },
    })
  }
  await client.query(
    `UPDATE store_orders SET payment_succeeded_at = COALESCE(payment_succeeded_at, $2),
            stripe_charge_id = COALESCE(stripe_charge_id, $3)
      WHERE id = $1::uuid`,
    [orderId, row.payment_succeeded_at, row.charge_id],
  )
  return row
}

/** Which commission rate applies to an order item, captured at checkout when available. */
async function resolveItemRates(client, items) {
  const sellerIds = [...new Set(items.map((i) => i._seller).filter(Boolean))]
  const productIds = [...new Set(items.map((i) => String(i.product_id || '')).filter(Boolean))]
  const sellerRate = new Map()
  if (sellerIds.length) {
    const r = await client.query('SELECT seller_id, commission_rate FROM seller_users WHERE seller_id = ANY($1::text[])', [sellerIds])
    for (const row of r.rows) sellerRate.set(String(row.seller_id), resolveSellerCommissionRate(row.commission_rate))
  }
  const override = new Map()
  if (productIds.length) {
    const r = await client.query(
      `SELECT id::text AS id, metadata->>'commission_rate_override' AS ov FROM admin_hub_products WHERE id::text = ANY($1::text[])`,
      [productIds],
    ).catch(() => ({ rows: [] }))
    for (const row of r.rows) {
      const ov = resolveProductCommissionOverride(row.ov)
      if (ov != null) override.set(String(row.id), ov)
    }
  }
  return items.map((it) => {
    if (it.commission_rate_snapshot != null && it.commission_rate_snapshot !== '') {
      return { rate: Number(it.commission_rate_snapshot), rateSource: 'checkout_snapshot' }
    }
    if (override.has(String(it.product_id))) return { rate: override.get(String(it.product_id)), rateSource: 'product_override_at_payable_creation' }
    return { rate: sellerRate.has(it._seller) ? sellerRate.get(it._seller) : resolveSellerCommissionRate(null), rateSource: 'seller_rate_at_payable_creation' }
  })
}

/**
 * Creates the immutable payables of a paid order: one per order item (seller = the item's own
 * seller, never the order header) and one shipping payable per seller that charged shipping.
 * Books SALE / COMMISSION / SHIPPING ledger entries. Fully idempotent — safe to call from the
 * checkout, the webhook and the hourly sweeper for the same order.
 */
async function createPayablesForOrder(client, orderId, { source = 'checkout', actor = 'system' } = {}) {
  return withTx(client, async () => {
    await lockKey(client, `order:${orderId}`)
    const oRes = await client.query('SELECT * FROM store_orders WHERE id = $1::uuid', [orderId])
    const order = oRes.rows[0]
    if (!order) return { created: 0, reason: 'order_not_found' }
    if (String(order.payment_status || '') !== 'bezahlt') return { created: 0, reason: 'order_not_paid' }
    const iRes = await client.query('SELECT * FROM store_order_items WHERE order_id = $1::uuid ORDER BY created_at, id', [orderId])
    const items = iRes.rows || []
    // Resolve the merchant of every line; header seller_id is the platform ('default') for carts.
    const unresolved = []
    for (const it of items) {
      let sid = realSellerId(it.seller_id)
      if (!sid && it.product_id) {
        const pr = await client.query('SELECT seller_id FROM admin_hub_products WHERE id::text = $1 LIMIT 1', [String(it.product_id)]).catch(() => ({ rows: [] }))
        sid = realSellerId(pr.rows[0]?.seller_id)
      }
      if (!sid) sid = realSellerId(order.seller_id)
      it._seller = sid
      if (!sid) unresolved.push(it.id)
    }
    if (unresolved.length) {
      await auditFinance(client, {
        actor, action: 'payable_seller_unresolved', entityType: 'order', entityId: orderId,
        details: { order_item_ids: unresolved },
      })
    }
    const payItems = items.filter((it) => it._seller)
    const rates = await resolveItemRates(client, payItems)
    const domesticVat = resolvePlatformCommissionVatPercent()
    const vatBySeller = new Map()
    const sellerIdsForVat = [...new Set(payItems.map((it) => it._seller))]
    if (sellerIdsForVat.length) {
      const sv = await client.query(
        `SELECT seller_id, vat_id, business_address, vat_id_vies_valid, vat_id_vies_checked_value FROM seller_users WHERE seller_id = ANY($1::text[]) AND sub_of_seller_id IS NULL`,
        [sellerIdsForVat],
      )
      for (const row of sv.rows) vatBySeller.set(String(row.seller_id), commissionVatScheme(row, { domesticPercent: domesticVat, euCountries: EU_COUNTRIES }))
    }
    const vatFor = (sid) => vatBySeller.get(sid) || { scheme: 'domestic', percent: domesticVat }
    const currency = String(order.currency || 'eur').toLowerCase()
    let created = 0

    for (let i = 0; i < payItems.length; i++) {
      const it = payItems[i]
      const qty = Math.max(1, Number(it.quantity) || 1)
      const gross = Math.max(0, Math.round(Number(it.unit_price_cents) || 0) * qty)
      const { rate, rateSource } = rates[i]
      const comm = commissionCents(gross, rate)
      const vat = vatFor(it._seller)
      const ins = await client.query(
        `INSERT INTO seller_payables
           (seller_id, order_id, order_item_id, kind, quantity, currency, gross_cents, shipping_cents,
            commission_rate_snapshot, commission_cents, commission_vat_rate_snapshot, commission_vat_cents, commission_vat_scheme, source)
         VALUES ($1, $2::uuid, $3::uuid, 'item', $4, $5, $6, 0, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (order_item_id) WHERE kind = 'item' DO NOTHING
         RETURNING id`,
        [it._seller, orderId, it.id, qty, currency, gross, rate, comm, vat.percent, vatOnCents(comm, vat.percent), vat.scheme, `${source}:${rateSource}`],
      )
      if (ins.rows[0]) created += 1
    }

    // Shipping: each seller gets exactly the shipping they charged (shipping_by_seller, written
    // at checkout). Legacy orders without the breakdown split by merchandise share — flagged.
    const sellers = [...new Set(payItems.map((it) => it._seller))]
    const shipTotal = Math.max(0, Math.round(Number(order.shipping_cents) || 0))
    let bySeller = order.shipping_by_seller
    if (typeof bySeller === 'string') { try { bySeller = JSON.parse(bySeller) } catch (_) { bySeller = null } }
    const shipFor = new Map()
    let shipSource = 'shipping_by_seller'
    if (bySeller && typeof bySeller === 'object' && !Array.isArray(bySeller)) {
      for (const sid of sellers) shipFor.set(sid, Math.max(0, Math.round(Number(bySeller[sid]) || 0)))
    } else if (shipTotal > 0 && sellers.length) {
      shipSource = sellers.length === 1 ? 'single_seller_order' : 'legacy_merchandise_ratio'
      const weights = sellers.map((sid) => payItems.filter((it) => it._seller === sid)
        .reduce((s, it) => s + Math.round(Number(it.unit_price_cents) || 0) * Math.max(1, Number(it.quantity) || 1), 0))
      const parts = allocateProportional(shipTotal, weights)
      sellers.forEach((sid, i) => shipFor.set(sid, parts[i]))
    }
    for (const [sid, cents] of shipFor) {
      if (cents <= 0) continue
      const ins = await client.query(
        `INSERT INTO seller_payables
           (seller_id, order_id, order_item_id, kind, quantity, currency, gross_cents, shipping_cents,
            commission_rate_snapshot, commission_cents, commission_vat_rate_snapshot, commission_vat_cents, source)
         VALUES ($1, $2::uuid, NULL, 'shipping', 0, $3, 0, $4, 0, 0, 0, 0, $5)
         ON CONFLICT (order_id, seller_id) WHERE kind = 'shipping' DO NOTHING
         RETURNING id`,
        [sid, orderId, currency, cents, `${source}:${shipSource}`],
      )
      if (ins.rows[0]) created += 1
    }

    // Ledger entries for every payable of the order (also repairs a half-written earlier attempt).
    const all = await client.query('SELECT * FROM seller_payables WHERE order_id = $1::uuid', [orderId])
    for (const p of all.rows) {
      const base = { sellerId: p.seller_id, orderId, orderItemId: p.order_item_id, payableId: p.id, currency: p.currency }
      if (Number(p.gross_cents) > 0) {
        await appendLedgerEntry(client, { ...base, eventType: 'SALE', amountCents: Number(p.gross_cents), idempotencyKey: `SALE:${p.id}` })
      }
      if (Number(p.commission_cents) > 0) {
        await appendLedgerEntry(client, {
          ...base, eventType: 'COMMISSION', amountCents: -Number(p.commission_cents), idempotencyKey: `COMMISSION:${p.id}`,
          metadata: { rate: Number(p.commission_rate_snapshot) },
        })
      }
      if (Number(p.commission_vat_cents) > 0) {
        await appendLedgerEntry(client, {
          ...base, eventType: 'COMMISSION', amountCents: -Number(p.commission_vat_cents), idempotencyKey: `COMMISSION_VAT:${p.id}`,
          metadata: { vat: true, vat_rate: Number(p.commission_vat_rate_snapshot), scheme: p.commission_vat_scheme },
        })
      }
      if (Number(p.shipping_cents) > 0) {
        await appendLedgerEntry(client, { ...base, eventType: 'SHIPPING', amountCents: Number(p.shipping_cents), idempotencyKey: `SHIPPING:${p.id}` })
      }
    }
    await refreshEligibilityForOrder(client, orderId)
    return { created, unresolved: unresolved.length }
  })
}

/** Order-level facts that gate payout (Phase 6), evaluated per payable. */
async function loadEligibilityContext(client, orderId) {
  const o = (await client.query(
    `SELECT o.id, o.payment_status, o.checkout_payment_kind, o.delivery_confirmed_at,
            EXISTS (SELECT 1 FROM order_payments op WHERE op.order_id = o.id) AS has_payment
       FROM store_orders o WHERE o.id = $1::uuid`,
    [orderId],
  )).rows[0]
  if (!o) return null
  const disputes = (await client.query('SELECT outcome FROM order_disputes WHERE order_id = $1::uuid', [orderId])).rows
  const returns = (await client.query(
    `SELECT seller_id FROM store_returns
      WHERE order_id = $1::uuid AND COALESCE(status, '') NOT IN ('abgelehnt', 'abgeschlossen')`,
    [orderId],
  ).catch(() => ({ rows: [] }))).rows
  const pendingRefund = (await client.query(
    `SELECT 1 FROM order_refunds WHERE order_id = $1::uuid AND status IN ('pending', 'processing') LIMIT 1`,
    [orderId],
  )).rows.length > 0
  const zeroPay = String(o.checkout_payment_kind || '') === 'platform_loyalty'
  return {
    paymentOk: String(o.payment_status) === 'bezahlt' && (o.has_payment || zeroPay),
    openDispute: disputes.some((d) => d.outcome === 'open'),
    lostDispute: disputes.some((d) => d.outcome === 'lost'),
    returnSellers: returns.map((r) => realSellerId(r.seller_id)),
    pendingRefund,
    deliveryConfirmedAt: o.delivery_confirmed_at,
  }
}

async function sellerFlags(client, sellerIds) {
  const out = new Map()
  if (!sellerIds.length) return out
  const r = await client.query(
    `SELECT seller_id, COALESCE(payout_blocked, false) AS payout_blocked, approval_status
       FROM seller_users WHERE seller_id = ANY($1::text[]) AND sub_of_seller_id IS NULL`,
    [sellerIds],
  )
  for (const row of r.rows) {
    out.set(String(row.seller_id), {
      blocked: !!row.payout_blocked,
      compliance: String(row.approval_status || 'approved').toLowerCase() !== 'approved',
    })
  }
  return out
}

/** Recomputes and PERSISTS status / eligible_at / block_reasons for one order's payables. */
async function refreshEligibilityForOrder(client, orderId, now = new Date()) {
  const ctx = await loadEligibilityContext(client, orderId)
  if (!ctx) return
  const ps = (await client.query('SELECT * FROM seller_payables WHERE order_id = $1::uuid', [orderId])).rows
  const flags = await sellerFlags(client, [...new Set(ps.map((p) => p.seller_id))])
  for (const p of ps) {
    const f = flags.get(String(p.seller_id)) || { blocked: false, compliance: true }
    const ev = evaluateEligibility(p, {
      ...ctx,
      openReturn: ctx.returnSellers.some((s) => s == null || s === p.seller_id),
      sellerPayoutBlocked: f.blocked,
      sellerComplianceBlocked: f.compliance,
    }, now)
    const reasons = ev.reasons
    const same = ev.status === p.status
      && String(ev.eligibleAt ? new Date(ev.eligibleAt).toISOString() : '') === String(p.eligible_at ? new Date(p.eligible_at).toISOString() : '')
      && JSON.stringify(reasons) === JSON.stringify(p.block_reasons || [])
    if (same) continue
    await client.query(
      `UPDATE seller_payables SET status = $2, eligible_at = $3, block_reasons = $4::text[],
              delivered_at = COALESCE(delivered_at, $5)
        WHERE id = $1 AND status NOT IN ('paid', 'in_payout')`,
      [p.id, ev.status, ev.eligibleAt, reasons, ctx.deliveryConfirmedAt || null],
    )
  }
}

async function refreshEligibilityForSeller(client, sellerId, now = new Date()) {
  const r = await client.query(
    `SELECT DISTINCT order_id FROM seller_payables
      WHERE seller_id = $1 AND status IN ('pending', 'eligible', 'blocked', 'refunded')`,
    [sellerId],
  )
  for (const row of r.rows) await refreshEligibilityForOrder(client, row.order_id, now)
}

/**
 * Delivery confirmation that counts for payout (Phase 6/7). Only trusted sources may call this:
 * 'carrier_webhook' (Sendcloud), 'carrier_api' (tracking refresh) and 'superuser'.
 */
const TRUSTED_DELIVERY_SOURCES = new Set(['carrier_webhook', 'carrier_api', 'superuser'])

async function confirmDelivery(client, orderId, { source, at = new Date(), actor = 'system' } = {}) {
  if (!TRUSTED_DELIVERY_SOURCES.has(source)) throw new Error(`untrusted delivery source: ${source}`)
  return withTx(client, async () => {
    await lockKey(client, `order:${orderId}`)
    const r = await client.query(
      `UPDATE store_orders SET delivery_confirmed_at = $2, delivery_confirmed_source = $3, updated_at = now()
        WHERE id = $1::uuid AND delivery_confirmed_at IS NULL
        RETURNING id`,
      [orderId, at, source],
    )
    if (r.rows[0]) {
      await auditFinance(client, { actor, action: 'delivery_confirmed', entityType: 'order', entityId: orderId, details: { source, at } })
    }
    await refreshEligibilityForOrder(client, orderId)
    return { changed: !!r.rows[0] }
  })
}

module.exports = {
  recordOrderPayment,
  createPayablesForOrder,
  refreshEligibilityForOrder,
  refreshEligibilityForSeller,
  confirmDelivery,
  TRUSTED_DELIVERY_SOURCES,
  realSellerId,
}
