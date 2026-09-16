'use strict'

/**
 * Amazon-style seller ledger: one row = one money movement.
 * Credits are positive, debits negative.
 *
 * Wallet / payout (affects_balance):
 *   Warenwert − Provision netto + Versand Kunde − Etikett (balance) − iade ± düzeltme
 * Commission VAT is listed (Provisionsrechnung) but does not reduce Auszahlung.
 * Card-paid labels are listed but already settled.
 */

const { enrichOrderItemRows, filterItemsForSeller, itemsSubtotalCents } = require('./order-items-seller')
const { sqlOrderOwnedBySeller } = require('./seller-scope')
const { resolvePlatformCommissionVatPercent } = require('./goods-vat')
const { allocateSellerShareOfOrder } = require('./seller-billing')

const SEQ = {
  order_received: 0,
  shipping_customer: 1,
  commission: 2,
  commission_vat: 3,
  shipping_label: 4,
  return_shipping: 5,
  refund: 6,
  commission_refund: 7,
  commission_vat_refund: 8,
  advertising: 9,
  manual_adjustment: 10,
  payout: 11,
}

function commissionInclVatCents(netCents, vatPercent) {
  const net = Math.max(0, Math.round(Number(netCents) || 0))
  const vatPct = Number(vatPercent)
  const vat = Number.isFinite(vatPct) && vatPct > 0 ? Math.round(net * vatPct / 100) : 0
  return { net, vat, total: net + vat }
}

function inPeriod(iso, periodStart, periodEnd) {
  if (!periodStart && !periodEnd) return true
  const day = String(iso || '').slice(0, 10)
  if (!day) return false
  if (periodStart && day < periodStart) return false
  if (periodEnd && day > periodEnd) return false
  return true
}

function entryDay(occurredAt) {
  if (!occurredAt) return ''
  if (typeof occurredAt === 'string') return occurredAt.slice(0, 10)
  try {
    return new Date(occurredAt).toISOString().slice(0, 10)
  } catch (_) {
    return ''
  }
}

function merchandiseBasisCents(row) {
  const sub = row.subtotal_cents != null ? Number(row.subtotal_cents) : NaN
  if (Number.isFinite(sub) && sub > 0) return Math.round(sub)
  const tot = row.total_cents != null ? Number(row.total_cents) : 0
  return Math.max(0, Math.round(tot))
}

async function sellerBasisForOrder(client, row, sellerId) {
  const headerSid = String(row.seller_id || '').trim()
  const sid = String(sellerId || '').trim()
  const ownsWholeOrder = headerSid === sid && headerSid !== 'default'
  if (ownsWholeOrder) return merchandiseBasisCents(row)
  const iRes = await client.query('SELECT * FROM store_order_items WHERE order_id = $1', [row.id])
  const enriched = await enrichOrderItemRows(client, iRes.rows || [])
  const mine = filterItemsForSeller(enriched, sid, { isSuperuser: false, orderSellerId: row.seller_id })
  return itemsSubtotalCents(mine)
}

function asParams(v) {
  if (!v) return {}
  if (typeof v === 'string') {
    try { return JSON.parse(v) } catch (_) { return {} }
  }
  return typeof v === 'object' ? v : {}
}

function emptyTotals() {
  return {
    merchandise_cents: 0,
    shipping_customer_cents: 0,
    commission_cents: 0,
    commission_vat_cents: 0,
    shipping_label_cents: 0,
    return_shipping_cents: 0,
    refunds_cents: 0,
    advertising_cents: 0,
    adjustments_cents: 0,
    payouts_cents: 0,
    net_cents: 0,
    order_count: 0,
  }
}

function summarizeLedgerEntries(entries) {
  const t = emptyTotals()
  const orderIds = new Set()
  for (const e of entries || []) {
    const amt = Math.round(Number(e.amount_cents) || 0)
    const type = String(e.type || '')
    if (type === 'order_received') {
      t.merchandise_cents += amt
      if (e.order_id) orderIds.add(String(e.order_id))
    } else if (type === 'shipping_customer') {
      t.shipping_customer_cents += amt
    } else if (type === 'commission') {
      t.commission_cents += Math.abs(amt)
    } else if (type === 'commission_vat') {
      t.commission_vat_cents += Math.abs(amt)
    } else if (type === 'shipping_label') {
      t.shipping_label_cents += Math.abs(amt)
    } else if (type === 'return_shipping') {
      t.return_shipping_cents += Math.abs(amt)
    } else if (type === 'refund') {
      t.refunds_cents += Math.abs(amt)
    } else if (type === 'advertising') {
      t.advertising_cents += Math.abs(amt)
    } else if (type === 'payout') {
      t.payouts_cents += Math.abs(amt)
    } else if (type === 'manual_adjustment' || type === 'commission_refund' || type === 'commission_vat_refund') {
      t.adjustments_cents += amt
    }
    if (type !== 'payout' && e.affects_balance !== false) t.net_cents += amt
  }
  t.order_count = orderIds.size
  return t
}

function classifyAdjustmentType(row) {
  const adjType = String(row.type || 'manual_adjustment')
  const key = String(row.description_key || '')
  if (adjType === 'advertising' || key === 'advertising') return 'advertising'
  if (key === 'return_shipping_label' || adjType === 'return_shipping') return 'return_shipping'
  if (adjType === 'shipping_label' || key === 'shipping_label_for_order') return 'shipping_label'
  return 'manual_adjustment'
}

function pushEntry(entries, row) {
  entries.push({
    id: row.id,
    type: row.type,
    occurred_at: row.occurred_at,
    order_id: row.order_id || null,
    order_number: row.order_number || null,
    amount_cents: Math.round(Number(row.amount_cents) || 0),
    description_key: row.description_key,
    description_params: asParams(row.description_params),
    charge_method: row.charge_method || null,
    affects_balance: row.affects_balance !== false,
    seq: SEQ[row.type] != null ? SEQ[row.type] : 50,
    seller_id: row.seller_id || null,
    store_name: row.store_name || null,
  })
}

function emptyLedger() {
  return {
    entries: [],
    balance: { current_cents: 0, period_cents: 0 },
    totals: emptyTotals(),
    count: 0,
  }
}

/**
 * @param {import('pg').Client} client
 * @param {string} sellerId
 * @param {{ periodStart?: string|null, periodEnd?: string|null, storeName?: string|null }} [opts]
 */
async function buildSellerLedger(client, sellerId, opts = {}) {
  const sid = String(sellerId || '').trim()
  if (!sid || sid === 'default') return emptyLedger()
  const periodStart = opts.periodStart ? String(opts.periodStart).slice(0, 10) : null
  const periodEnd = opts.periodEnd ? String(opts.periodEnd).slice(0, 10) : null
  const storeName = opts.storeName != null ? String(opts.storeName) : null
  const vatPercent = resolvePlatformCommissionVatPercent()

  const rateR = await client.query(
    'SELECT commission_rate, store_name FROM seller_users WHERE seller_id = $1 LIMIT 1',
    [sid],
  )
  const rateRaw = Number(rateR.rows[0]?.commission_rate)
  const commissionRate = Number.isFinite(rateRaw) && rateRaw >= 0 ? rateRaw : 0.12
  const ratePct = Math.round(commissionRate * 1000) / 10
  const resolvedStore = storeName || rateR.rows[0]?.store_name || null

  const periodOnly = !!opts.periodOnly && !!(periodStart || periodEnd)
  const datesFor = (alias) => {
    const params = [sid]
    const parts = []
    if (periodOnly && periodStart) {
      params.push(periodStart)
      parts.push(`AND ${alias}.created_at >= $${params.length}::date`)
    }
    if (periodOnly && periodEnd) {
      params.push(periodEnd)
      parts.push(`AND ${alias}.created_at < ($${params.length}::date + interval '1 day')`)
    }
    return { sql: parts.join(' '), params }
  }

  const all = []
  const tag = (row) => ({ ...row, seller_id: sid, store_name: resolvedStore })

  const oDates = datesFor('o')
  const oRes = await client.query(
    `SELECT o.id, o.seller_id, o.order_number, o.created_at, o.subtotal_cents, o.total_cents,
            o.shipping_cents, o.discount_cents, o.coupon_discount_cents, o.bonus_points_redeemed,
            COALESCE(o.platform_bonus_funding_cents, 0)::bigint AS platform_bonus_funding_cents
       FROM store_orders o
      WHERE o.payment_status = 'bezahlt'
        AND ${sqlOrderOwnedBySeller('o', '$1')}
        ${oDates.sql}
      ORDER BY o.created_at DESC
      LIMIT 4000`,
    oDates.params,
  )
  for (const row of oRes.rows || []) {
    const basis = await sellerBasisForOrder(client, row, sid)
    if (basis <= 0) continue
    pushEntry(all, tag({
      id: `sale-${row.id}`,
      type: 'order_received',
      occurred_at: row.created_at,
      order_id: row.id,
      order_number: row.order_number,
      amount_cents: basis,
      description_key: 'order_received',
    }))
    const share = allocateSellerShareOfOrder(row, basis)
    if (share.shippingCents > 0) {
      pushEntry(all, tag({
        id: `ship-customer-${row.id}`,
        type: 'shipping_customer',
        occurred_at: row.created_at,
        order_id: row.id,
        order_number: row.order_number,
        amount_cents: share.shippingCents,
        description_key: 'shipping_customer',
      }))
    }
    const fee = commissionInclVatCents(Math.round(basis * commissionRate), vatPercent)
    if (fee.net > 0) {
      pushEntry(all, tag({
        id: `commission-${row.id}`,
        type: 'commission',
        occurred_at: row.created_at,
        order_id: row.id,
        order_number: row.order_number,
        amount_cents: -fee.net,
        description_key: 'commission',
        description_params: { rate_pct: ratePct, vat_pct: vatPercent },
      }))
    }
    if (fee.vat > 0) {
      pushEntry(all, tag({
        id: `commission-vat-${row.id}`,
        type: 'commission_vat',
        occurred_at: row.created_at,
        order_id: row.id,
        order_number: row.order_number,
        amount_cents: -fee.vat,
        description_key: 'commission_vat',
        description_params: { vat_pct: vatPercent },
        affects_balance: false,
      }))
    }
  }

  try {
    const rDates = datesFor('r')
    const rRes = await client.query(
      `SELECT r.id, r.created_at, r.order_id,
              GREATEST(
                COALESCE(r.refund_amount_cents, 0),
                COALESCE((SELECT SUM(ri.refund_amount_cents) FROM return_items ri WHERE ri.return_id = r.id), 0)
              )::bigint AS refund_cents,
              o.order_number
         FROM store_returns r
         JOIN store_orders o ON o.id = r.order_id
        WHERE ${sqlOrderOwnedBySeller('o', '$1')}
          AND COALESCE(r.status, '') NOT IN ('abgelehnt', 'cancelled', 'storniert')
          ${rDates.sql}
        ORDER BY r.created_at DESC
        LIMIT 2000`,
      rDates.params,
    )
    for (const row of rRes.rows || []) {
      const refund = Math.max(0, Number(row.refund_cents || 0))
      if (refund <= 0) continue
      pushEntry(all, tag({
        id: `refund-${row.id}`,
        type: 'refund',
        occurred_at: row.created_at,
        order_id: row.order_id,
        order_number: row.order_number,
        amount_cents: -refund,
        description_key: 'refund',
      }))
      const fee = commissionInclVatCents(Math.round(refund * commissionRate), vatPercent)
      if (fee.net > 0) {
        pushEntry(all, tag({
          id: `commission-refund-${row.id}`,
          type: 'commission_refund',
          occurred_at: row.created_at,
          order_id: row.order_id,
          order_number: row.order_number,
          amount_cents: fee.net,
          description_key: 'commission_refund',
          description_params: { rate_pct: ratePct, vat_pct: vatPercent },
        }))
      }
      if (fee.vat > 0) {
        pushEntry(all, tag({
          id: `commission-vat-refund-${row.id}`,
          type: 'commission_vat_refund',
          occurred_at: row.created_at,
          order_id: row.order_id,
          order_number: row.order_number,
          amount_cents: fee.vat,
          description_key: 'commission_vat_refund',
          description_params: { vat_pct: vatPercent },
          affects_balance: false,
        }))
      }
    }
  } catch (_) { /* store_returns may be missing on older DBs */ }

  try {
    const aDates = datesFor('la')
    const aRes = await client.query(
      `SELECT la.id, la.type, la.amount_cents, la.description_key, la.description_params,
              la.order_id, la.charge_method, la.created_at, o.order_number
         FROM seller_ledger_adjustments la
         LEFT JOIN store_orders o ON o.id = la.order_id
        WHERE la.seller_id = $1
          ${aDates.sql}
        ORDER BY la.created_at DESC
        LIMIT 2000`,
      aDates.params,
    )
    for (const row of aRes.rows || []) {
      const ledgerType = classifyAdjustmentType(row)
      const chargedOnCard = String(row.charge_method || '') === 'card'
      const params = asParams(row.description_params)
      pushEntry(all, tag({
        id: `adj-${row.id}`,
        type: ledgerType,
        occurred_at: row.created_at,
        order_id: row.order_id,
        order_number: row.order_number || params.order_number || null,
        amount_cents: Number(row.amount_cents || 0),
        description_key: row.description_key || ledgerType,
        description_params: params,
        charge_method: row.charge_method || null,
        affects_balance: !chargedOnCard,
      }))
    }
  } catch (_) { /* seller_ledger_adjustments may be missing */ }

  try {
    const pParams = [sid]
    const pParts = []
    if (periodOnly && periodStart) {
      pParams.push(periodStart)
      pParts.push(`AND COALESCE(paid_at, created_at) >= $${pParams.length}::date`)
    }
    if (periodOnly && periodEnd) {
      pParams.push(periodEnd)
      pParts.push(`AND COALESCE(paid_at, created_at) < ($${pParams.length}::date + interval '1 day')`)
    }
    const pRes = await client.query(
      `SELECT id, period_start, period_end, payout_cents, paid_at, created_at, status
         FROM seller_payouts
        WHERE seller_id = $1
          AND LOWER(COALESCE(status, '')) IN ('bezahlt', 'paid')
          AND COALESCE(payout_cents, 0) > 0
          ${pParts.join(' ')}
        ORDER BY COALESCE(paid_at, created_at) DESC
        LIMIT 500`,
      pParams,
    )
    for (const row of pRes.rows || []) {
      const when = row.paid_at || row.created_at || row.period_end
      pushEntry(all, tag({
        id: `payout-${row.id}`,
        type: 'payout',
        occurred_at: when,
        amount_cents: -Math.abs(Number(row.payout_cents || 0)),
        description_key: 'payout',
        description_params: {
          period_start: row.period_start,
          period_end: row.period_end,
        },
      }))
    }
  } catch (_) { /* seller_payouts */ }

  all.sort((a, b) => {
    const dt = new Date(b.occurred_at || 0).getTime() - new Date(a.occurred_at || 0).getTime()
    if (dt !== 0) return dt
    return (a.seq || 0) - (b.seq || 0)
  })

  let current = 0
  let periodSum = 0
  const entries = []
  for (const e of all) {
    if (e.affects_balance) current += e.amount_cents
    const inSel = inPeriod(entryDay(e.occurred_at), periodStart, periodEnd)
    if (inSel) {
      entries.push(e)
      if (e.affects_balance) periodSum += e.amount_cents
    }
  }

  return {
    entries,
    balance: {
      current_cents: current,
      period_cents: periodSum,
    },
    totals: summarizeLedgerEntries(entries),
    count: entries.length,
    commission_rate: commissionRate,
    seller_id: sid,
    store_name: resolvedStore,
  }
}

async function listLedgerSellers(client) {
  try {
    const r = await client.query(
      `SELECT seller_id, store_name
         FROM seller_users
        WHERE COALESCE(sub_of_seller_id, '') = ''
          AND seller_id IS NOT NULL
          AND seller_id NOT IN ('default', '')
        ORDER BY LOWER(COALESCE(store_name, seller_id)) ASC
        LIMIT 400`,
    )
    return r.rows || []
  } catch (_) {
    return []
  }
}

async function buildMarketplaceLedger(client, opts = {}) {
  const sellers = await listLedgerSellers(client)
  const all = []
  const perSeller = []
  for (const s of sellers) {
    const result = await buildSellerLedger(client, s.seller_id, {
      periodStart: opts.periodStart,
      periodEnd: opts.periodEnd,
      storeName: s.store_name,
      periodOnly: true,
    })
    if (!result.count) continue
    perSeller.push({
      seller_id: s.seller_id,
      store_name: s.store_name || s.seller_id,
      totals: result.totals,
      count: result.count,
    })
    for (const e of result.entries) all.push(e)
  }
  all.sort((a, b) => {
    const dt = new Date(b.occurred_at || 0).getTime() - new Date(a.occurred_at || 0).getTime()
    if (dt !== 0) return dt
    return (a.seq || 0) - (b.seq || 0)
  })
  return {
    entries: all,
    totals: summarizeLedgerEntries(all),
    balance: {
      current_cents: 0,
      period_cents: all.filter((e) => e.affects_balance !== false).reduce((s, e) => s + Number(e.amount_cents || 0), 0),
    },
    count: all.length,
    sellers,
    seller_summaries: perSeller,
  }
}

module.exports = {
  buildSellerLedger,
  buildMarketplaceLedger,
  listLedgerSellers,
  commissionInclVatCents,
  summarizeLedgerEntries,
  classifyAdjustmentType,
}
