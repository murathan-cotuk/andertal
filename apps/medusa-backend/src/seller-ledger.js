'use strict'

/**
 * Amazon-style seller ledger: one row = one money movement.
 * Credits are positive, debits negative. Current balance = sum of rows that
 * affect the marketplace wallet (card-paid labels are listed but already settled).
 */

const { enrichOrderItemRows, filterItemsForSeller, itemsSubtotalCents } = require('./order-items-seller')
const { sqlOrderOwnedBySeller } = require('./seller-scope')
const { resolvePlatformCommissionVatPercent } = require('./goods-vat')

const SEQ = {
  order_received: 0,
  commission: 1,
  shipping_label: 2,
  refund: 3,
  commission_refund: 4,
  advertising: 5,
  manual_adjustment: 6,
  payout: 7,
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
  })
}

/**
 * @param {import('pg').Client} client
 * @param {string} sellerId
 * @param {{ periodStart?: string|null, periodEnd?: string|null }} [opts]
 */
async function buildSellerLedger(client, sellerId, opts = {}) {
  const sid = String(sellerId || '').trim()
  if (!sid || sid === 'default') {
    return { entries: [], balance: { current_cents: 0, period_cents: 0 }, count: 0 }
  }
  const periodStart = opts.periodStart ? String(opts.periodStart).slice(0, 10) : null
  const periodEnd = opts.periodEnd ? String(opts.periodEnd).slice(0, 10) : null
  const vatPercent = resolvePlatformCommissionVatPercent()

  const rateR = await client.query(
    'SELECT commission_rate FROM seller_users WHERE seller_id = $1 LIMIT 1',
    [sid],
  )
  const rateRaw = Number(rateR.rows[0]?.commission_rate)
  const commissionRate = Number.isFinite(rateRaw) && rateRaw >= 0 ? rateRaw : 0.12
  const ratePct = Math.round(commissionRate * 1000) / 10

  const all = []

  const oRes = await client.query(
    `SELECT o.id, o.seller_id, o.order_number, o.created_at, o.subtotal_cents, o.total_cents
       FROM store_orders o
      WHERE o.payment_status = 'bezahlt'
        AND ${sqlOrderOwnedBySeller('o', '$1')}
      ORDER BY o.created_at DESC
      LIMIT 4000`,
    [sid],
  )
  for (const row of oRes.rows || []) {
    const basis = await sellerBasisForOrder(client, row, sid)
    if (basis <= 0) continue
    pushEntry(all, {
      id: `sale-${row.id}`,
      type: 'order_received',
      occurred_at: row.created_at,
      order_id: row.id,
      order_number: row.order_number,
      amount_cents: basis,
      description_key: 'order_received',
    })
    const fee = commissionInclVatCents(Math.round(basis * commissionRate), vatPercent)
    if (fee.total > 0) {
      pushEntry(all, {
        id: `commission-${row.id}`,
        type: 'commission',
        occurred_at: row.created_at,
        order_id: row.id,
        order_number: row.order_number,
        amount_cents: -fee.total,
        description_key: 'commission',
        description_params: { rate_pct: ratePct, vat_pct: vatPercent },
      })
    }
  }

  try {
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
        ORDER BY r.created_at DESC
        LIMIT 2000`,
      [sid],
    )
    for (const row of rRes.rows || []) {
      const refund = Math.max(0, Number(row.refund_cents || 0))
      if (refund <= 0) continue
      pushEntry(all, {
        id: `refund-${row.id}`,
        type: 'refund',
        occurred_at: row.created_at,
        order_id: row.order_id,
        order_number: row.order_number,
        amount_cents: -refund,
        description_key: 'refund',
      })
      const fee = commissionInclVatCents(Math.round(refund * commissionRate), vatPercent)
      if (fee.total > 0) {
        pushEntry(all, {
          id: `commission-refund-${row.id}`,
          type: 'commission_refund',
          occurred_at: row.created_at,
          order_id: row.order_id,
          order_number: row.order_number,
          amount_cents: fee.total,
          description_key: 'commission_refund',
          description_params: { rate_pct: ratePct, vat_pct: vatPercent },
        })
      }
    }
  } catch (_) { /* store_returns may be missing on older DBs */ }

  try {
    const aRes = await client.query(
      `SELECT la.id, la.type, la.amount_cents, la.description_key, la.description_params,
              la.order_id, la.charge_method, la.created_at, o.order_number
         FROM seller_ledger_adjustments la
         LEFT JOIN store_orders o ON o.id = la.order_id
        WHERE la.seller_id = $1
        ORDER BY la.created_at DESC
        LIMIT 2000`,
      [sid],
    )
    for (const row of aRes.rows || []) {
      const adjType = String(row.type || 'manual_adjustment')
      const ledgerType = adjType === 'shipping_label' ? 'shipping_label'
        : adjType === 'advertising' ? 'advertising'
        : 'manual_adjustment'
      const chargedOnCard = String(row.charge_method || '') === 'card'
      pushEntry(all, {
        id: `adj-${row.id}`,
        type: ledgerType,
        occurred_at: row.created_at,
        order_id: row.order_id,
        order_number: row.order_number || (row.description_params && row.description_params.order_number) || null,
        amount_cents: Number(row.amount_cents || 0),
        description_key: row.description_key || ledgerType,
        description_params: asParams(row.description_params),
        charge_method: row.charge_method || null,
        affects_balance: !chargedOnCard,
      })
    }
  } catch (_) { /* seller_ledger_adjustments may be missing */ }

  try {
    const pRes = await client.query(
      `SELECT id, period_start, period_end, payout_cents, paid_at, created_at, status
         FROM seller_payouts
        WHERE seller_id = $1
          AND LOWER(COALESCE(status, '')) IN ('bezahlt', 'paid')
          AND COALESCE(payout_cents, 0) > 0
        ORDER BY COALESCE(paid_at, created_at) DESC
        LIMIT 500`,
      [sid],
    )
    for (const row of pRes.rows || []) {
      const when = row.paid_at || row.created_at || row.period_end
      pushEntry(all, {
        id: `payout-${row.id}`,
        type: 'payout',
        occurred_at: when,
        amount_cents: -Math.abs(Number(row.payout_cents || 0)),
        description_key: 'payout',
        description_params: {
          period_start: row.period_start,
          period_end: row.period_end,
        },
      })
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
    count: entries.length,
    commission_rate: commissionRate,
  }
}

module.exports = {
  buildSellerLedger,
  commissionInclVatCents,
}
