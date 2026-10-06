'use strict'

/**
 * Read models built ONLY from payables + ledger (Phase 19/21): Provisionsrechnung figures and
 * DAC7 data. They never recompute commission from today's rates.
 */

/**
 * Seller figures for a statement period. Sales = payables of orders paid in the period
 * (commission from the snapshot); refunds / chargebacks = ledger entries booked in the period.
 * Returns null when the seller has no payable-era data for the period (caller may fall back to
 * the legacy order-based aggregation for pre-cutover periods).
 */
async function aggregateSellerPeriodFromPayables(client, sellerId, periodStart, periodEnd) {
  const sales = (await client.query(
    `SELECT COALESCE(SUM(p.gross_cents), 0)::bigint AS gross,
            COALESCE(SUM(p.shipping_cents), 0)::bigint AS shipping,
            COALESCE(SUM(p.commission_cents), 0)::bigint AS commission,
            COALESCE(SUM(p.commission_vat_cents), 0)::bigint AS commission_vat,
            COUNT(DISTINCT p.order_id)::int AS orders,
            COUNT(*)::int AS n
       FROM seller_payables p
       JOIN store_orders o ON o.id = p.order_id
      WHERE p.seller_id = $1
        AND COALESCE(o.payment_succeeded_at, o.created_at) >= $2::date
        AND COALESCE(o.payment_succeeded_at, o.created_at) < ($3::date + interval '1 day')`,
    [sellerId, periodStart, periodEnd],
  )).rows[0]
  const moves = (await client.query(
    `SELECT event_type, COALESCE((metadata->>'vat')::boolean, false) AS vat,
            COALESCE(SUM(amount_cents), 0)::bigint AS cents, COUNT(*)::int AS n
       FROM seller_ledger_entries
      WHERE seller_id = $1 AND event_type IN ('REFUND', 'COMMISSION_REFUND', 'CHARGEBACK', 'CHARGEBACK_RELEASE', 'ADJUSTMENT')
        AND created_at >= $2::date AND created_at < ($3::date + interval '1 day')
      GROUP BY event_type, 2`,
    [sellerId, periodStart, periodEnd],
  )).rows
  if (!Number(sales.n) && !moves.length) return null
  const sum = (type, vat = null) => moves
    .filter((r) => r.event_type === type && (vat == null || r.vat === vat))
    .reduce((a, r) => a + Number(r.cents), 0)
  const gross = Number(sales.gross)
  const commission = Number(sales.commission)
  const commissionVat = Number(sales.commission_vat)
  const refundCents = -sum('REFUND')
  const commissionRefundCents = sum('COMMISSION_REFUND', false)
  const commissionVatRefundCents = sum('COMMISSION_REFUND', true)
  const chargebackCents = -sum('CHARGEBACK') - sum('CHARGEBACK_RELEASE')
  const adjustmentsCents = sum('ADJUSTMENT')
  return {
    grossCents: gross,
    shippingCents: Number(sales.shipping),
    commissionCents: commission,
    commissionVatCents: commissionVat,
    orderCount: Number(sales.orders),
    refundCents,
    commissionRefundCents,
    commissionVatRefundCents,
    chargebackCents,
    adjustmentsCents,
    // Period net as booked in the ledger (informational — what is PAID is settlement payouts).
    // Commission is withheld including its VAT (reverse-charge sellers: VAT = 0).
    netCents: gross + Number(sales.shipping) - commission - commissionVat - refundCents
      + commissionRefundCents + commissionVatRefundCents - chargebackCents + adjustmentsCents,
  }
}

const quarterOf = (d) => Math.floor(new Date(d).getUTCMonth() / 3) + 1

/**
 * DAC7 figures per seller and quarter (Phase 19). PStTG / DAC7 (Anhang V Abschnitt I C Nr. 9 der
 * Richtlinie 2011/16/EU): "Vergütung" is compensation paid or credited to the seller NET of any
 * fees, commissions or taxes withheld or charged by the platform; those fees are reported
 * separately. Hence consideration = goods + shipping − refunds/chargebacks − (commission + its
 * VAT, net of commission refunds). gross_cents is kept for internal reconciliation only.
 */
async function dac7Figures(client, year) {
  const rows = (await client.query(
    `SELECT e.seller_id, e.event_type, e.amount_cents, e.order_id, e.created_at,
            COALESCE(o.payment_succeeded_at, o.created_at) AS paid_at
       FROM seller_ledger_entries e
       LEFT JOIN store_orders o ON o.id = e.order_id
      WHERE e.event_type IN ('SALE', 'SHIPPING', 'COMMISSION', 'COMMISSION_REFUND', 'REFUND', 'CHARGEBACK', 'CHARGEBACK_RELEASE')
        AND EXTRACT(YEAR FROM e.created_at) = $1`,
    [year],
  )).rows
  const bySeller = new Map()
  const get = (sid) => {
    if (!bySeller.has(sid)) {
      bySeller.set(sid, {
        seller_id: sid,
        quarters: [1, 2, 3, 4].map((q) => ({ quarter: q, gross_cents: 0, refunds_cents: 0, fees_cents: 0, consideration_cents: 0, transaction_count: 0 })),
        orders: new Set(),
      })
    }
    return bySeller.get(sid)
  }
  for (const r of rows) {
    const s = get(r.seller_id)
    const q = s.quarters[quarterOf(r.created_at) - 1]
    const a = Number(r.amount_cents)
    if (r.event_type === 'SALE' || r.event_type === 'SHIPPING') q.gross_cents += a
    else if (r.event_type === 'REFUND' || r.event_type === 'CHARGEBACK' || r.event_type === 'CHARGEBACK_RELEASE') q.refunds_cents += -a
    else if (r.event_type === 'COMMISSION' || r.event_type === 'COMMISSION_REFUND') q.fees_cents += -a
    if (r.event_type === 'SALE' && r.order_id && !s.orders.has(`${r.order_id}`)) {
      s.orders.add(`${r.order_id}`)
      q.transaction_count += 1
    }
  }
  const out = []
  for (const s of bySeller.values()) {
    for (const q of s.quarters) q.consideration_cents = q.gross_cents - q.refunds_cents - q.fees_cents
    const total = s.quarters.reduce((acc, q) => ({
      gross_cents: acc.gross_cents + q.gross_cents,
      refunds_cents: acc.refunds_cents + q.refunds_cents,
      fees_cents: acc.fees_cents + q.fees_cents,
      consideration_cents: acc.consideration_cents + q.consideration_cents,
      transaction_count: acc.transaction_count + q.transaction_count,
    }), { gross_cents: 0, refunds_cents: 0, fees_cents: 0, consideration_cents: 0, transaction_count: 0 })
    out.push({ seller_id: s.seller_id, quarters: s.quarters, ...total })
  }
  return out
}

/**
 * Pre-cutover part of a DAC7 year (orders paid before the settlement ledger existed): rebuilt
 * from order lines, refunds from Stripe-confirmed return refunds only, fees ESTIMATED with the
 * seller's current rate (+ domestic VAT for German sellers). Always flagged as an estimate so
 * nobody files it unchecked.
 */
async function dac7LegacyEstimate(client, year) {
  const rows = (await client.query(
    `SELECT oi.seller_id, o.id AS order_id, COALESCE(o.payment_succeeded_at, o.created_at) AS paid_at,
            (oi.unit_price_cents * oi.quantity)::bigint AS gross, su.commission_rate, su.vat_id, su.business_address, su.vat_id_vies_valid, su.vat_id_vies_checked_value
       FROM store_order_items oi
       JOIN store_orders o ON o.id = oi.order_id
       LEFT JOIN seller_users su ON su.seller_id = oi.seller_id AND su.sub_of_seller_id IS NULL
      WHERE o.payment_status IN ('bezahlt', 'refunded')
        AND EXTRACT(YEAR FROM o.created_at) = $1
        AND o.created_at < (SELECT value::timestamptz FROM settlement_settings WHERE key = 'cutover_at')
        AND NULLIF(NULLIF(oi.seller_id, ''), 'default') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM seller_payables p WHERE p.order_id = o.id)`,
    [year],
  ).catch(() => ({ rows: [] }))).rows
  const { resolveSellerCommissionRate } = require('../commission-rate')
  const { resolvePlatformCommissionVatPercent, EU_COUNTRIES } = require('../goods-vat')
  const { commissionVatScheme } = require('./money')
  const by = new Map()
  for (const r of rows) {
    if (!by.has(r.seller_id)) {
      by.set(r.seller_id, { seller_id: r.seller_id, orders: new Set(), quarters: [1, 2, 3, 4].map((q) => ({ quarter: q, gross_cents: 0, refunds_cents: 0, fees_cents: 0, consideration_cents: 0, transaction_count: 0 })) })
    }
    const s = by.get(r.seller_id)
    const q = s.quarters[quarterOf(r.paid_at) - 1]
    const gross = Number(r.gross)
    const comm = Math.round(gross * resolveSellerCommissionRate(r.commission_rate))
    const vat = commissionVatScheme(r, { domesticPercent: resolvePlatformCommissionVatPercent(), euCountries: EU_COUNTRIES })
    q.gross_cents += gross
    q.fees_cents += comm + Math.round(comm * vat.percent / 100)
    if (!s.orders.has(r.order_id)) { s.orders.add(r.order_id); q.transaction_count += 1 }
  }
  return [...by.values()].map((s) => {
    for (const q of s.quarters) q.consideration_cents = q.gross_cents - q.refunds_cents - q.fees_cents
    const sum = (k) => s.quarters.reduce((a, q) => a + q[k], 0)
    return {
      seller_id: s.seller_id, quarters: s.quarters, estimate: true,
      gross_cents: sum('gross_cents'), refunds_cents: sum('refunds_cents'), fees_cents: sum('fees_cents'),
      consideration_cents: sum('consideration_cents'), transaction_count: sum('transaction_count'),
    }
  })
}

/** Ledger figures + pre-cutover estimate merged per seller (estimate flag carried through). */
async function dac7FiguresWithLegacy(client, year) {
  const ledger = await dac7Figures(client, year)
  const legacy = await dac7LegacyEstimate(client, year)
  const out = new Map(ledger.map((f) => [f.seller_id, { ...f, includes_estimate: false }]))
  for (const l of legacy) {
    const cur = out.get(l.seller_id)
    if (!cur) { out.set(l.seller_id, { ...l, includes_estimate: true }); continue }
    for (let i = 0; i < 4; i++) {
      for (const k of ['gross_cents', 'refunds_cents', 'fees_cents', 'consideration_cents', 'transaction_count']) cur.quarters[i][k] += l.quarters[i][k]
    }
    for (const k of ['gross_cents', 'refunds_cents', 'fees_cents', 'consideration_cents', 'transaction_count']) cur[k] += l[k]
    cur.includes_estimate = true
  }
  return [...out.values()]
}

/** DAC7 data points a report needs; lists what is missing per seller instead of filling it in. */
function dac7MissingFields(seller) {
  const missing = []
  const type = String(seller.legal_entity_type || '').toLowerCase()
  if (!type) missing.push('legal_entity_type')
  if (!(seller.legal_name || seller.company_name || (seller.first_name && seller.last_name))) missing.push('legal_name')
  const a = seller.business_address && typeof seller.business_address === 'object' ? seller.business_address : {}
  if (!a.street && !a.line1 && !a.address_line1) missing.push('address')
  if (!a.country) missing.push('address.country')
  if (!seller.tax_id) missing.push('tax_id (TIN)')
  if (!seller.tax_id_country) missing.push('tax_id_country')
  if (type === 'individual' && !seller.date_of_birth) missing.push('date_of_birth')
  if (type === 'company' && !seller.business_registration_number) missing.push('business_registration_number')
  if (!seller.iban) missing.push('financial_account (IBAN)')
  return missing
}

module.exports = { aggregateSellerPeriodFromPayables, dac7Figures, dac7LegacyEstimate, dac7FiguresWithLegacy, dac7MissingFields }
