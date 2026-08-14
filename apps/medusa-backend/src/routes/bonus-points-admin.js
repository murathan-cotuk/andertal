'use strict'
/**
 * Superuser bonus-points operations & Finanzamt reporting.
 * Not a product-guide: customer balances, redemptions, Andertal cash funding, ledger, exports.
 */
const { Router } = require('express')
const { resolveOrderPaidTotalCents, orderBonusDiscountCents, orderCouponDiscountCents } = require('../order-money')

const BONUS_POINTS_PER_EURO = 50

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  return new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false,
  })
}

const requireSu = (req, res) => {
  if (req.sellerUser?.is_superuser === true) return true
  res.status(403).json({ message: 'Superuser access required' })
  return false
}

const num = (v, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

const pointsToCents = (points) => Math.floor((Math.max(0, num(points)) / BONUS_POINTS_PER_EURO) * 100)

const fundingCentsFromOrder = (row) => {
  const stored = Math.max(0, num(row.platform_bonus_funding_cents))
  if (stored > 0) return stored
  const fromDiscount = orderBonusDiscountCents(row)
  if (fromDiscount > 0) return fromDiscount
  return pointsToCents(row.bonus_points_redeemed)
}

const orderValueCents = (row) => {
  const paid = resolveOrderPaidTotalCents(row)
  const bonus = fundingCentsFromOrder(row)
  const coupon = orderCouponDiscountCents(row)
  const computed = Math.max(0, num(row.subtotal_cents) + num(row.shipping_cents) - coupon)
  return Math.max(computed, paid + bonus)
}

const normalizePaymentKey = (row) => {
  const kind = String(row.checkout_payment_kind || '').trim().toLowerCase()
  if (kind === 'platform_loyalty') return 'platform_loyalty'
  const pm = String(row.payment_method || '').trim().toLowerCase()
  if (!pm) return 'card'
  if (pm.includes('paypal')) return 'paypal'
  if (pm.includes('klarna')) return 'klarna'
  if (pm.includes('sepa')) return 'sepa_debit'
  if (pm.includes('ideal')) return 'ideal'
  if (pm.includes('bancontact')) return 'bancontact'
  if (pm.includes('sofort') || pm.includes('giropay')) return 'sofort'
  if (pm.includes('apple')) return 'apple_pay'
  if (pm.includes('google')) return 'google_pay'
  if (pm === 'card' || pm === 'stripe' || pm.includes('card')) return 'card'
  return pm.slice(0, 40)
}

const PAYMENT_LABELS = {
  all: 'Alle',
  card: 'Karte / Stripe',
  paypal: 'PayPal',
  platform_loyalty: 'Nur Bonuspunkte (0 € Kartenzahlung)',
  klarna: 'Klarna',
  sepa_debit: 'SEPA',
  ideal: 'iDEAL',
  bancontact: 'Bancontact',
  sofort: 'Sofort',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
}

const SOURCE_LABELS = {
  order_earn: 'Verdient (Bestellung)',
  order_redeem: 'Eingelöst (Bestellung)',
  order_cancel_earn: 'Storno — Verdiente Punkte zurück',
  order_cancel_redeem: 'Storno — Eingelöste Punkte zurück',
  order_return_earn: 'Retoure — Verdiente Punkte zurück',
  order_return_redeem: 'Retoure — Eingelöste Punkte zurück',
  manual: 'Manuelle Buchung',
  signup: 'Registrierungsbonus',
  registration: 'Registrierungsbonus',
}

const applyDateRange = (parts, params, from, to, col) => {
  if (from) {
    params.push(from)
    parts.push(`${col} >= $${params.length}::date`)
  }
  if (to) {
    params.push(to)
    parts.push(`${col} < ($${params.length}::date + interval '1 day')`)
  }
}

/** Order created in range, or bonus was redeemed on that order in range. */
const applyOrderOrRedeemDateRange = (parts, params, from, to) => {
  if (!from && !to) return
  const created = []
  const led = []
  if (from) {
    params.push(from)
    const n = params.length
    created.push(`o.created_at >= $${n}::date`)
    led.push(`l2.occurred_at >= $${n}::date`)
  }
  if (to) {
    params.push(to)
    const n = params.length
    created.push(`o.created_at < ($${n}::date + interval '1 day')`)
    led.push(`l2.occurred_at < ($${n}::date + interval '1 day')`)
  }
  parts.push(`(
    (${created.join(' AND ')})
    OR EXISTS (
      SELECT 1 FROM store_customer_bonus_ledger l2
      WHERE l2.order_id = o.id AND l2.source = 'order_redeem'
        AND ${led.join(' AND ')}
    )
  )`)
}

const applyPaymentMethodFilter = (parts, params, pmRaw) => {
  const v = String(pmRaw || '').trim().toLowerCase()
  if (!v || v === 'all') return
  if (v === 'platform_loyalty') {
    parts.push(`o.checkout_payment_kind = 'platform_loyalty'`)
    return
  }
  if (v === 'card') {
    parts.push(`(
      o.checkout_payment_kind IS DISTINCT FROM 'platform_loyalty'
      AND (
        LOWER(COALESCE(o.payment_method, '')) IN ('', 'card', 'stripe')
        OR LOWER(COALESCE(o.payment_method, '')) LIKE '%card%'
      )
    )`)
    return
  }
  params.push(v)
  parts.push(`LOWER(COALESCE(o.payment_method, '')) LIKE '%' || $${params.length} || '%'`)
}

const applySearch = (parts, params, search, { includeOrder = true, includeCustomer = true } = {}) => {
  const q = String(search || '').trim()
  if (!q) return
  params.push(`%${q}%`)
  const n = params.length
  const bits = []
  if (includeCustomer) {
    bits.push(`c.email ILIKE $${n}`, `c.first_name ILIKE $${n}`, `c.last_name ILIKE $${n}`)
    bits.push(`CONCAT(COALESCE(o.first_name,''), ' ', COALESCE(o.last_name,'')) ILIKE $${n}`)
    bits.push(`o.email ILIKE $${n}`)
  }
  if (includeOrder) {
    bits.push(`o.order_number::text ILIKE $${n}`)
    bits.push(`o.payment_intent_id ILIKE $${n}`)
  }
  const numSearch = q.replace(/^#/, '').trim()
  if (/^\d+$/.test(numSearch)) {
    params.push(Number(numSearch))
    bits.push(`c.customer_number = $${params.length}`)
    bits.push(`o.order_number = $${params.length}`)
  }
  if (bits.length) parts.push(`(${bits.join(' OR ')})`)
}

const mapOrderRow = (row) => {
  const customerPaid = resolveOrderPaidTotalCents(row)
  const funding = fundingCentsFromOrder(row)
  const coupon = orderCouponDiscountCents(row)
  const value = orderValueCents(row)
  const sellerNet = Math.max(0, num(row.seller_net_after_commission_cents))
  const commission = Math.max(0, num(row.stripe_application_fee_cents))
  const paymentKey = normalizePaymentKey(row)
  return {
    id: row.id,
    order_number: row.order_number,
    created_at: row.created_at,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    customer_id: row.customer_id,
    customer_number: row.customer_number || null,
    customer_balance_points: row.customer_balance_points != null ? num(row.customer_balance_points) : null,
    payment_method: row.payment_method || null,
    payment_method_key: paymentKey,
    payment_method_label: PAYMENT_LABELS[paymentKey] || row.payment_method || paymentKey,
    checkout_payment_kind: row.checkout_payment_kind || null,
    payment_status: row.payment_status || null,
    order_status: row.order_status || null,
    country: row.country || null,
    store_name: row.store_name || null,
    seller_id: row.seller_id || null,
    subtotal_cents: num(row.subtotal_cents),
    shipping_cents: num(row.shipping_cents),
    coupon_discount_cents: coupon,
    coupon_code: row.coupon_code || null,
    bonus_points_redeemed: num(row.bonus_points_redeemed),
    bonus_funding_cents: funding,
    customer_paid_cents: customerPaid,
    order_value_cents: value,
    seller_net_cents: sellerNet,
    commission_cents: commission,
    platform_cash_cents: customerPaid - sellerNet,
    payment_intent_id: row.payment_intent_id || null,
    currency: row.currency || 'eur',
    andertal_paid_from_own_cash: funding > 0,
  }
}

const ORDER_SELECT = `
  o.id, o.order_number, o.created_at, o.email, o.first_name, o.last_name, o.customer_id,
  o.payment_method, o.checkout_payment_kind, o.payment_status, o.order_status, o.country,
  o.subtotal_cents, COALESCE(o.shipping_cents,0) AS shipping_cents,
  COALESCE(o.discount_cents,0) AS discount_cents,
  COALESCE(o.coupon_discount_cents,0) AS coupon_discount_cents, o.coupon_code,
  GREATEST(
    COALESCE(o.bonus_points_redeemed,0),
    COALESCE(ABS(led.redeem_points),0)
  )::int AS bonus_points_redeemed,
  GREATEST(
    COALESCE(o.platform_bonus_funding_cents,0),
    GREATEST(0, COALESCE(o.discount_cents,0) - COALESCE(o.coupon_discount_cents,0)),
    FLOOR(GREATEST(COALESCE(o.bonus_points_redeemed,0), COALESCE(ABS(led.redeem_points),0))::numeric / 50 * 100)
  )::int AS platform_bonus_funding_cents,
  o.total_cents, COALESCE(o.seller_net_after_commission_cents,0) AS seller_net_after_commission_cents,
  COALESCE(o.stripe_application_fee_cents,0) AS stripe_application_fee_cents,
  o.payment_intent_id, o.currency, o.seller_id,
  c.customer_number, COALESCE(c.bonus_points,0) AS customer_balance_points,
  s.store_name
`

const ORDER_FROM = `
  FROM store_orders o
  LEFT JOIN store_customers c ON c.id = o.customer_id
  LEFT JOIN LATERAL (
    SELECT store_name FROM seller_users su WHERE su.seller_id = o.seller_id LIMIT 1
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(points_delta),0)::int AS redeem_points
    FROM store_customer_bonus_ledger l
    WHERE l.order_id = o.id AND l.source = 'order_redeem'
  ) led ON true
`

const ANDERTAL_CASH_WHERE = `(
  COALESCE(o.bonus_points_redeemed,0) > 0
  OR COALESCE(o.platform_bonus_funding_cents,0) > 0
  OR GREATEST(0, COALESCE(o.discount_cents,0) - COALESCE(o.coupon_discount_cents,0)) > 0
  OR EXISTS (
    SELECT 1 FROM store_customer_bonus_ledger l
    WHERE l.order_id = o.id AND l.source = 'order_redeem' AND l.points_delta <> 0
  )
)`

const DERIVED_FUNDING_CENTS = `GREATEST(
  COALESCE(o.platform_bonus_funding_cents,0),
  GREATEST(0, COALESCE(o.discount_cents,0) - COALESCE(o.coupon_discount_cents,0)),
  FLOOR(GREATEST(
    COALESCE(o.bonus_points_redeemed,0),
    COALESCE((SELECT ABS(SUM(l.points_delta)) FROM store_customer_bonus_ledger l WHERE l.order_id = o.id AND l.source = 'order_redeem'), 0)
  )::numeric / 50 * 100)
)`

async function fetchRedemptions(client, q, { limit, offset, ids } = {}) {
  const parts = [ANDERTAL_CASH_WHERE]
  const params = []
  applyOrderOrRedeemDateRange(parts, params, q.from, q.to)
  applyPaymentMethodFilter(parts, params, q.payment_method)
  applySearch(parts, params, q.search)
  if (q.customer_id) {
    params.push(q.customer_id)
    parts.push(`o.customer_id = $${params.length}::uuid`)
  }
  if (q.order_id) {
    params.push(q.order_id)
    parts.push(`o.id = $${params.length}::uuid`)
  }
  if (Array.isArray(ids) && ids.length) {
    params.push(ids)
    parts.push(`o.id = ANY($${params.length}::uuid[])`)
  }
  const where = `WHERE ${parts.join(' AND ')}`
  const countR = await client.query(`SELECT COUNT(*)::int AS n ${ORDER_FROM} ${where}`, params)
  const lim = Math.min(Math.max(1, num(limit, 50)), 5000)
  const off = Math.max(0, num(offset, 0))
  params.push(lim, off)
  const r = await client.query(
    `SELECT ${ORDER_SELECT} ${ORDER_FROM} ${where} ORDER BY o.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  const rows = (r.rows || []).map(mapOrderRow)
  const totals = rows.reduce(
    (acc, row) => {
      acc.bonus_funding_cents += row.bonus_funding_cents
      acc.customer_paid_cents += row.customer_paid_cents
      acc.order_value_cents += row.order_value_cents
      acc.points_redeemed += row.bonus_points_redeemed
      acc.seller_net_cents += row.seller_net_cents
      return acc
    },
    { bonus_funding_cents: 0, customer_paid_cents: 0, order_value_cents: 0, points_redeemed: 0, seller_net_cents: 0 },
  )
  return { rows, count: countR.rows?.[0]?.n || 0, page_totals: totals }
}

async function fetchOverview(client, q) {
  const dateParts = []
  const dateParams = []
  applyOrderOrRedeemDateRange(dateParts, dateParams, q.from, q.to)
  applyPaymentMethodFilter(dateParts, dateParams, q.payment_method)
  const orderWhere = dateParts.length ? `WHERE ${dateParts.join(' AND ')}` : ''

  const liability = await client.query(`
    SELECT
      COUNT(*)::int AS customers_total,
      COUNT(*) FILTER (WHERE COALESCE(bonus_points,0) > 0)::int AS customers_with_balance,
      COALESCE(SUM(COALESCE(bonus_points,0)),0)::int AS outstanding_points
    FROM store_customers
  `)

  const periodOrders = await client.query(
    `SELECT
       COUNT(*)::int AS orders_total,
       COUNT(*) FILTER (WHERE ${ANDERTAL_CASH_WHERE})::int AS orders_with_bonus,
       COUNT(*) FILTER (WHERE o.checkout_payment_kind = 'platform_loyalty')::int AS orders_zero_pay,
       COALESCE(SUM(CASE WHEN ${ANDERTAL_CASH_WHERE} THEN GREATEST(
         COALESCE(o.bonus_points_redeemed,0),
         COALESCE((SELECT ABS(SUM(l.points_delta)) FROM store_customer_bonus_ledger l WHERE l.order_id = o.id AND l.source = 'order_redeem'), 0)
       ) ELSE 0 END),0)::bigint AS points_redeemed,
       COALESCE(SUM(CASE WHEN ${ANDERTAL_CASH_WHERE} THEN ${DERIVED_FUNDING_CENTS} ELSE 0 END),0)::bigint AS funding_cents
     FROM store_orders o
     ${orderWhere}`,
    dateParams,
  )

  const ledParts = []
  const ledParams = []
  applyDateRange(ledParts, ledParams, q.from, q.to, 'l.occurred_at')
  const ledWhere = ledParts.length ? `WHERE ${ledParts.join(' AND ')}` : ''
  const ledger = await client.query(
    `SELECT source, COALESCE(SUM(points_delta),0)::bigint AS points, COUNT(*)::int AS n
     FROM store_customer_bonus_ledger l
     ${ledWhere}
     GROUP BY source`,
    ledParams,
  )

  const bySource = {}
  for (const row of ledger.rows || []) {
    bySource[row.source] = { points: num(row.points), count: num(row.n) }
  }

  const liab = liability.rows?.[0] || {}
  const po = periodOrders.rows?.[0] || {}
  const outstandingPoints = num(liab.outstanding_points)
  return {
    rates: {
      points_per_euro_discount: BONUS_POINTS_PER_EURO,
      signup_points: 100,
      earn_rule: '1 Punkt je 1,00 € tatsächlich gezahltem Betrag (aufgerundet)',
    },
    liability: {
      customers_total: num(liab.customers_total),
      customers_with_balance: num(liab.customers_with_balance),
      outstanding_points: outstandingPoints,
      outstanding_eur_cents: pointsToCents(outstandingPoints),
    },
    period: {
      from: q.from || null,
      to: q.to || null,
      payment_method: q.payment_method || 'all',
      orders_total: num(po.orders_total),
      orders_with_bonus: num(po.orders_with_bonus),
      orders_zero_pay: num(po.orders_zero_pay),
      points_redeemed: num(po.points_redeemed),
      andertal_funding_cents: num(po.funding_cents),
      points_earned: Math.max(0, num(bySource.order_earn?.points)),
      earn_count: num(bySource.order_earn?.count),
      redeem_count: num(bySource.order_redeem?.count),
      reversed_points: num(bySource.order_cancel_earn?.points)
        + num(bySource.order_cancel_redeem?.points)
        + num(bySource.order_return_earn?.points)
        + num(bySource.order_return_redeem?.points),
      manual_points: num(bySource.manual?.points),
      signup_points: num(bySource.registration?.points) + num(bySource.signup?.points),
      by_source: bySource,
    },
  }
}

async function fetchBalances(client, q, { limit, offset } = {}) {
  const parts = []
  const params = []
  const search = String(q.search || '').trim()
  if (search) {
    params.push(`%${search}%`)
    const n = params.length
    const bits = [`c.email ILIKE $${n}`, `c.first_name ILIKE $${n}`, `c.last_name ILIKE $${n}`]
    const numSearch = search.replace(/^#/, '').trim()
    if (/^\d+$/.test(numSearch)) {
      params.push(Number(numSearch))
      bits.push(`c.customer_number = $${params.length}`)
    }
    parts.push(`(${bits.join(' OR ')})`)
  }
  if (q.only_with_balance === '1' || q.only_with_balance === 'true') {
    parts.push(`COALESCE(c.bonus_points,0) > 0`)
  }
  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : ''
  const countR = await client.query(`SELECT COUNT(*)::int AS n FROM store_customers c ${where}`, params)
  const lim = Math.min(Math.max(1, num(limit, 50)), 5000)
  const off = Math.max(0, num(offset, 0))
  params.push(lim, off)
  const r = await client.query(
    `SELECT c.id, c.customer_number, c.email, c.first_name, c.last_name, c.phone, c.country,
            c.created_at, COALESCE(c.bonus_points,0)::int AS bonus_points,
            COALESCE(agg.earned_points,0)::int AS earned_points,
            COALESCE(agg.redeemed_points,0)::int AS redeemed_points,
            COALESCE(agg.reversed_points,0)::int AS reversed_points,
            COALESCE(agg.manual_points,0)::int AS manual_points,
            agg.last_ledger_at
     FROM store_customers c
     LEFT JOIN (
       SELECT customer_id,
              SUM(CASE WHEN source = 'order_earn' THEN points_delta ELSE 0 END) AS earned_points,
              SUM(CASE WHEN source = 'order_redeem' THEN -points_delta ELSE 0 END) AS redeemed_points,
              SUM(CASE WHEN source IN ('order_cancel_earn','order_cancel_redeem','order_return_earn','order_return_redeem') THEN points_delta ELSE 0 END) AS reversed_points,
              SUM(CASE WHEN source IN ('manual','registration','signup') THEN points_delta ELSE 0 END) AS manual_points,
              MAX(occurred_at) AS last_ledger_at
       FROM store_customer_bonus_ledger
       GROUP BY customer_id
     ) agg ON agg.customer_id = c.id
     ${where}
     ORDER BY c.bonus_points DESC NULLS LAST, c.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  const rows = (r.rows || []).map((row) => {
    const pts = num(row.bonus_points)
    return {
      id: row.id,
      customer_number: row.customer_number,
      email: row.email,
      first_name: row.first_name,
      last_name: row.last_name,
      phone: row.phone,
      country: row.country,
      created_at: row.created_at,
      bonus_points: pts,
      balance_eur_cents: pointsToCents(pts),
      earned_points: Math.max(0, num(row.earned_points)),
      redeemed_points: Math.max(0, num(row.redeemed_points)),
      reversed_points: num(row.reversed_points),
      manual_points: num(row.manual_points),
      last_ledger_at: row.last_ledger_at,
    }
  })
  return { rows, count: countR.rows?.[0]?.n || 0 }
}

async function fetchLedger(client, q, { limit, offset, sources } = {}) {
  const parts = []
  const params = []
  applyDateRange(parts, params, q.from, q.to, 'l.occurred_at')
  if (q.customer_id) {
    params.push(q.customer_id)
    parts.push(`l.customer_id = $${params.length}::uuid`)
  }
  if (q.order_id) {
    params.push(q.order_id)
    parts.push(`l.order_id = $${params.length}::uuid`)
  }
  const srcList = Array.isArray(sources) ? sources : (q.source ? String(q.source).split(',').map((s) => s.trim()).filter(Boolean) : [])
  if (srcList.length) {
    params.push(srcList)
    parts.push(`l.source = ANY($${params.length}::text[])`)
  }
  const search = String(q.search || '').trim()
  if (search) {
    params.push(`%${search}%`)
    const n = params.length
    parts.push(`(c.email ILIKE $${n} OR c.first_name ILIKE $${n} OR c.last_name ILIKE $${n} OR l.description ILIKE $${n} OR o.order_number::text ILIKE $${n})`)
  }
  if (q.payment_method && q.payment_method !== 'all') {
    parts.push(`l.order_id IS NOT NULL`)
    applyPaymentMethodFilter(parts, params, q.payment_method)
  }
  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : ''
  const countR = await client.query(
    `SELECT COUNT(*)::int AS n
     FROM store_customer_bonus_ledger l
     LEFT JOIN store_customers c ON c.id = l.customer_id
     LEFT JOIN store_orders o ON o.id = l.order_id
     ${where}`,
    params,
  )
  const lim = Math.min(Math.max(1, num(limit, 50)), 5000)
  const off = Math.max(0, num(offset, 0))
  params.push(lim, off)
  const r = await client.query(
    `SELECT l.id, l.customer_id, l.occurred_at, l.points_delta, l.description, l.source,
            l.order_id, l.created_at,
            c.email, c.first_name, c.last_name, c.customer_number,
            o.order_number, o.payment_method, o.checkout_payment_kind
     FROM store_customer_bonus_ledger l
     LEFT JOIN store_customers c ON c.id = l.customer_id
     LEFT JOIN store_orders o ON o.id = l.order_id
     ${where}
     ORDER BY l.occurred_at DESC, l.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  const rows = (r.rows || []).map((row) => ({
    id: row.id,
    customer_id: row.customer_id,
    customer_number: row.customer_number,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    occurred_at: row.occurred_at,
    points_delta: num(row.points_delta),
    eur_cents: row.points_delta < 0
      ? -pointsToCents(-row.points_delta)
      : pointsToCents(row.points_delta),
    description: row.description,
    source: row.source,
    source_label: SOURCE_LABELS[row.source] || row.source,
    order_id: row.order_id,
    order_number: row.order_number,
    payment_method: row.payment_method,
    checkout_payment_kind: row.checkout_payment_kind,
    created_at: row.created_at,
  }))
  return { rows, count: countR.rows?.[0]?.n || 0 }
}

async function fetchPaymentMethods(client) {
  const r = await client.query(`
    SELECT
      COALESCE(NULLIF(LOWER(TRIM(payment_method)), ''), checkout_payment_kind, 'card') AS raw,
      checkout_payment_kind,
      COUNT(*)::int AS n
    FROM store_orders
    GROUP BY 1, 2
    ORDER BY n DESC
    LIMIT 40
  `)
  const seen = new Set()
  const items = [{ key: 'all', label: PAYMENT_LABELS.all, count: null }]
  for (const row of r.rows || []) {
    const key = normalizePaymentKey({ payment_method: row.raw, checkout_payment_kind: row.checkout_payment_kind })
    if (seen.has(key)) continue
    seen.add(key)
    items.push({ key, label: PAYMENT_LABELS[key] || key, count: num(row.n) })
  }
  if (!seen.has('platform_loyalty')) {
    items.push({ key: 'platform_loyalty', label: PAYMENT_LABELS.platform_loyalty, count: 0 })
  }
  return items
}

async function fetchOrderDetail(client, orderId) {
  const r = await client.query(
    `SELECT ${ORDER_SELECT} ${ORDER_FROM} WHERE o.id = $1::uuid LIMIT 1`,
    [orderId],
  )
  const row = r.rows?.[0]
  if (!row) return null
  const mapped = mapOrderRow(row)
  const led = await fetchLedger(client, { order_id: orderId }, { limit: 200, offset: 0 })
  return { order: mapped, ledger: led.rows }
}

function parseQuery(req) {
  const q = req.query || {}
  return {
    from: String(q.from || q.period_start || '').trim() || null,
    to: String(q.to || q.period_end || '').trim() || null,
    payment_method: String(q.payment_method || 'all').trim() || 'all',
    search: String(q.search || '').trim(),
    customer_id: String(q.customer_id || '').trim() || null,
    order_id: String(q.order_id || '').trim() || null,
    source: String(q.source || '').trim() || null,
    only_with_balance: q.only_with_balance,
    ids: String(q.ids || '').trim(),
  }
}

function fmtEur(cents) {
  const n = num(cents) / 100
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function drawPdfHeader(doc, { title, subtitle, from, to, paymentLabel }) {
  doc.fontSize(16).fillColor('#111827').font('Helvetica-Bold').text(title, { continued: false })
  doc.moveDown(0.2)
  doc.fontSize(9).fillColor('#4b5563').font('Helvetica').text('Andertal Marktplatz — Bonuspunkte / Plattformfinanzierung')
  if (subtitle) doc.fontSize(9).fillColor('#111827').text(subtitle)
  const period = [from ? `von ${fmtDate(from)}` : null, to ? `bis ${fmtDate(to)}` : null].filter(Boolean).join(' ')
  if (period) doc.fontSize(9).fillColor('#4b5563').text(`Zeitraum: ${period}`)
  if (paymentLabel && paymentLabel !== 'Alle') doc.fontSize(9).text(`Zahlungsart: ${paymentLabel}`)
  doc.fontSize(8).fillColor('#6b7280').text(`Erstellt am ${fmtDate(new Date())} ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`)
  doc.moveDown(0.6)
}

function drawDisclaimer(doc) {
  doc.moveDown(0.8)
  doc.fontSize(8).fillColor('#111827').font('Helvetica-Bold').text('Erläuterung für die Buchhaltung / Finanzamt')
  doc.font('Helvetica').fillColor('#374151').text(
    'Andertal gewährt Kunden einen Treuevorteil in Bonuspunkten (50 Punkte = 1,00 €). '
    + 'Bei Einlösung mindert der Vorteil den vom Kunden per Karte/PayPal gezahlten Betrag. '
    + 'Die Differenz (Andertal-Finanzierung) wird aus eigenen Mitteln der Plattform getragen — '
    + 'nicht vom Verkäufer und nicht als Händler-Rabatt. Der Verkäufer erhält den Nettobetrag nach Provision auf den Listenpreis. '
    + 'Es handelt sich um eine plattformfinanzierte Zahlung auf den Bestellwert, kein zusätzlicher Umsatz. '
    + '50 Punkte = 1,00 €; verdiente Punkte bemessen sich nach dem tatsächlich gezahlten Betrag.',
    { align: 'justify' },
  )
}

function drawKeyValueTable(doc, pairs) {
  const startX = doc.x
  let y = doc.y
  for (const [k, v] of pairs) {
    doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text(k, startX, y, { width: 280, continued: false })
    doc.font('Helvetica-Bold').fillColor('#111827').text(String(v), startX + 290, y, { width: 240 })
    y += 16
  }
  doc.y = y
  doc.x = startX
}

function drawTable(doc, headers, rows, colWidths) {
  const startX = 36
  const pageBottom = doc.page.height - 40
  const drawHeader = () => {
    let x = startX
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff')
    const hY = doc.y
    doc.rect(startX, hY - 2, colWidths.reduce((a, b) => a + b, 0), 16).fill('#111827')
    doc.fillColor('#ffffff')
    headers.forEach((h, i) => {
      doc.text(h, x + 2, hY + 2, { width: colWidths[i] - 4, ellipsis: true })
      x += colWidths[i]
    })
    doc.y = hY + 16
  }
  drawHeader()
  doc.font('Helvetica').fontSize(7).fillColor('#111827')
  for (let i = 0; i < rows.length; i++) {
    if (doc.y + 14 > pageBottom) {
      doc.addPage()
      drawHeader()
      doc.font('Helvetica').fontSize(7).fillColor('#111827')
    }
    const y = doc.y
    if (i % 2 === 0) {
      doc.rect(startX, y - 1, colWidths.reduce((a, b) => a + b, 0), 13).fill('#f9fafb')
    }
    let x = startX
    rows[i].forEach((cell, j) => {
      doc.fillColor('#111827').text(String(cell ?? ''), x + 2, y, { width: colWidths[j] - 4, ellipsis: true, lineBreak: false })
      x += colWidths[j]
    })
    doc.y = y + 13
  }
}

async function buildReportPayload(client, q, { forExport = false } = {}) {
  const lim = forExport ? 5000 : 50
  const overview = await fetchOverview(client, q)
  const idList = q.ids ? q.ids.split(',').map((s) => s.trim()).filter(Boolean) : null
  const redemptions = await fetchRedemptions(client, q, { limit: lim, offset: 0, ids: idList })
  const balances = await fetchBalances(client, { search: q.search, only_with_balance: q.only_with_balance }, { limit: lim, offset: 0 })
  const ledger = await fetchLedger(client, q, { limit: lim, offset: 0 })
  const earnings = await fetchLedger(client, q, { limit: lim, offset: 0, sources: ['order_earn'] })
  const reversals = await fetchLedger(client, q, {
    limit: lim,
    offset: 0,
    sources: ['order_cancel_earn', 'order_cancel_redeem', 'order_return_earn', 'order_return_redeem'],
  })
  const manual = await fetchLedger(client, q, { limit: lim, offset: 0, sources: ['manual', 'signup', 'registration'] })
  return { overview, redemptions, balances, ledger, earnings, reversals, manual }
}

function pipePdf(res, filename, build) {
  const PDFDocument = require('pdfkit')
  const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape', compress: false, pdfVersion: '1.7' })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  doc.pipe(res)
  build(doc)
  doc.end()
}

module.exports = function createBonusPointsAdminRouter() {
  const router = Router()

  const withDb = (handler) => async (req, res) => {
    if (!requireSu(req, res)) return
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      await handler(req, res, client)
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ message: e?.message || 'Error' })
    } finally {
      try { await client.end() } catch (_) {}
    }
  }

  router.get('/admin-hub/v1/bonus-points/overview', withDb(async (req, res, client) => {
    const data = await fetchOverview(client, parseQuery(req))
    res.json(data)
  }))

  router.get('/admin-hub/v1/bonus-points/payment-methods', withDb(async (req, res, client) => {
    const items = await fetchPaymentMethods(client)
    res.json({ payment_methods: items })
  }))

  router.get('/admin-hub/v1/bonus-points/customers', withDb(async (req, res, client) => {
    const q = parseQuery(req)
    const data = await fetchBalances(client, q, { limit: req.query.limit, offset: req.query.offset })
    res.json({ customers: data.rows, count: data.count })
  }))

  router.get('/admin-hub/v1/bonus-points/redemptions', withDb(async (req, res, client) => {
    const q = parseQuery(req)
    let ids = null
    if (q.ids) ids = q.ids.split(',').map((s) => s.trim()).filter(Boolean)
    const data = await fetchRedemptions(client, q, { limit: req.query.limit, offset: req.query.offset, ids })
    res.json({ orders: data.rows, count: data.count, page_totals: data.page_totals })
  }))

  router.get('/admin-hub/v1/bonus-points/ledger', withDb(async (req, res, client) => {
    const q = parseQuery(req)
    const data = await fetchLedger(client, q, { limit: req.query.limit, offset: req.query.offset })
    res.json({ entries: data.rows, count: data.count })
  }))

  router.get('/admin-hub/v1/bonus-points/earnings', withDb(async (req, res, client) => {
    const q = parseQuery(req)
    const data = await fetchLedger(client, q, { limit: req.query.limit, offset: req.query.offset, sources: ['order_earn'] })
    res.json({ entries: data.rows, count: data.count })
  }))

  router.get('/admin-hub/v1/bonus-points/reversals', withDb(async (req, res, client) => {
    const q = parseQuery(req)
    const data = await fetchLedger(client, q, {
      limit: req.query.limit,
      offset: req.query.offset,
      sources: ['order_cancel_earn', 'order_cancel_redeem', 'order_return_earn', 'order_return_redeem'],
    })
    res.json({ entries: data.rows, count: data.count })
  }))

  router.get('/admin-hub/v1/bonus-points/manual', withDb(async (req, res, client) => {
    const q = parseQuery(req)
    const data = await fetchLedger(client, q, { limit: req.query.limit, offset: req.query.offset, sources: ['manual', 'signup', 'registration'] })
    res.json({ entries: data.rows, count: data.count })
  }))

  router.get('/admin-hub/v1/bonus-points/orders/:id', withDb(async (req, res, client) => {
    const detail = await fetchOrderDetail(client, req.params.id)
    if (!detail) return res.status(404).json({ message: 'Order not found' })
    res.json(detail)
  }))

  router.get('/admin-hub/v1/bonus-points/report', withDb(async (req, res, client) => {
    const q = parseQuery(req)
    const payload = await buildReportPayload(client, q, { forExport: String(req.query.export || '') === '1' })
    payload.payment_methods = await fetchPaymentMethods(client)
    res.json(payload)
  }))

  router.get('/admin-hub/v1/bonus-points/report.pdf', withDb(async (req, res, client) => {
    const q = parseQuery(req)
    const paymentLabel = PAYMENT_LABELS[q.payment_method] || q.payment_method
    const scope = String(req.query.scope || 'redemptions')
    const stamp = new Date().toISOString().slice(0, 10)

    if (scope === 'order' && q.order_id) {
      const detail = await fetchOrderDetail(client, q.order_id)
      if (!detail) return res.status(404).json({ message: 'Order not found' })
      const o = detail.order
      pipePdf(res, `andertal-bonus-bestellung-${o.order_number || o.id}.pdf`, (doc) => {
        drawPdfHeader(doc, {
          title: `Einzelbeleg Bonuspunkte — Bestellung ${o.order_number || ''}`,
          subtitle: `${[o.first_name, o.last_name].filter(Boolean).join(' ') || o.email || ''} · ${o.email || ''}`,
          from: q.from,
          to: q.to,
          paymentLabel: o.payment_method_label,
        })
        drawKeyValueTable(doc, [
          ['Bestellnummer', o.order_number || o.id],
          ['Datum', fmtDate(o.created_at)],
          ['Kunde', `${[o.first_name, o.last_name].filter(Boolean).join(' ') || '—'} (${o.customer_number || '—'})`],
          ['E-Mail', o.email || '—'],
          ['Zahlungsart', o.payment_method_label],
          ['Zielland', o.country || '—'],
          ['Stripe Payment Intent', o.payment_intent_id || '— (keine Kartenzahlung)'],
          ['Listenpreis (Ware)', fmtEur(o.subtotal_cents)],
          ['Versand', fmtEur(o.shipping_cents)],
          ['Gutschein', fmtEur(o.coupon_discount_cents)],
          ['Bestellwert', fmtEur(o.order_value_cents)],
          ['Vom Kunden gezahlt (Karte/PayPal)', fmtEur(o.customer_paid_cents)],
          ['Von Andertal aus eigenen Mitteln (Bonus)', fmtEur(o.bonus_funding_cents)],
          ['Eingelöste Punkte', `${o.bonus_points_redeemed} Pkt. (= ${fmtEur(o.bonus_funding_cents)})`],
          ['Provision (netto)', fmtEur(o.commission_cents)],
          ['Auszahlung Verkäufer', fmtEur(o.seller_net_cents)],
        ])
        drawDisclaimer(doc)
        if (detail.ledger.length) {
          doc.addPage()
          drawPdfHeader(doc, { title: `Ledger zur Bestellung ${o.order_number || ''}` })
          drawTable(
            doc,
            ['Datum', 'Quelle', 'Punkte', 'EUR', 'Beschreibung'],
            detail.ledger.map((e) => [fmtDate(e.occurred_at), e.source_label, e.points_delta, fmtEur(e.eur_cents), e.description || '']),
            [80, 180, 60, 80, 350],
          )
        }
      })
      return
    }

    const payload = await buildReportPayload(client, q, { forExport: true })
    const ov = payload.overview
    pipePdf(res, `andertal-bonuspunkte-${scope}-${stamp}.pdf`, (doc) => {
      drawPdfHeader(doc, {
        title: 'Sammelbericht Bonuspunkte / Andertal-Finanzierung',
        subtitle: 'Nachweis: Kundenrabatte wurden aus eigenen Mitteln der Plattform ausgeglichen.',
        from: q.from,
        to: q.to,
        paymentLabel,
      })
      if (q.ids) {
        doc.fontSize(9).fillColor('#b45309').font('Helvetica-Bold')
          .text(`Teilbericht — Auswahl von ${payload.redemptions.rows.length} Bestellung(en).`)
        doc.moveDown(0.3)
      }
      drawKeyValueTable(doc, [
        ['Offene Kundenpunkte (aktuell)', `${ov.liability.outstanding_points} Pkt. = ${fmtEur(ov.liability.outstanding_eur_cents)}`],
        ['Kunden mit Guthaben', String(ov.liability.customers_with_balance)],
        ['Bestellungen im Zeitraum', String(ov.period.orders_total)],
        ['Davon mit Bonus-Einlösung', String(ov.period.orders_with_bonus)],
        ['Andertal-Finanzierung (Zeitraum)', fmtEur(ov.period.andertal_funding_cents)],
        ['Eingelöste Punkte (Zeitraum)', String(ov.period.points_redeemed)],
        ['Verdiente Punkte (Zeitraum)', String(ov.period.points_earned)],
        ['0-€-Zahlungen (nur Bonus)', String(ov.period.orders_zero_pay)],
      ])
      drawDisclaimer(doc)

      const redemptionRows = payload.redemptions.rows
      if (scope !== 'balances' && redemptionRows.length) {
        doc.addPage()
        drawPdfHeader(doc, { title: 'Bestellungen mit Andertal-Finanzierung', from: q.from, to: q.to, paymentLabel })
        drawTable(
          doc,
          ['Nr.', 'Datum', 'Kunde', 'Zahlart', 'Wert', 'Kunde zahlte', 'Andertal', 'Punkte', 'Verkäufer'],
          redemptionRows.map((o) => [
            o.order_number || '',
            fmtDate(o.created_at),
            [o.first_name, o.last_name].filter(Boolean).join(' ') || o.email || '',
            o.payment_method_label,
            fmtEur(o.order_value_cents),
            fmtEur(o.customer_paid_cents),
            fmtEur(o.bonus_funding_cents),
            o.bonus_points_redeemed,
            o.store_name || '',
          ]),
          [70, 70, 130, 90, 70, 80, 70, 50, 140],
        )
        doc.moveDown(0.5)
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text(
          `Summe Andertal-Finanzierung (diese Liste): ${fmtEur(payload.redemptions.page_totals.bonus_funding_cents)}  ·  `
          + `Kunde zahlte: ${fmtEur(payload.redemptions.page_totals.customer_paid_cents)}  ·  `
          + `Bestellwert: ${fmtEur(payload.redemptions.page_totals.order_value_cents)}`,
        )
      }

      if (scope === 'balances' || scope === 'all') {
        doc.addPage()
        drawPdfHeader(doc, { title: 'Kunden-Bonusguthaben (offene Verbindlichkeit)' })
        drawTable(
          doc,
          ['Kd-Nr.', 'Name', 'E-Mail', 'Punkte', 'EUR', 'Verdient', 'Eingelöst'],
          payload.balances.rows.map((c) => [
            c.customer_number || '',
            [c.first_name, c.last_name].filter(Boolean).join(' ') || '—',
            c.email || '',
            c.bonus_points,
            fmtEur(c.balance_eur_cents),
            c.earned_points,
            c.redeemed_points,
          ]),
          [70, 140, 220, 70, 80, 80, 80],
        )
      }

      if (scope === 'ledger' || scope === 'all') {
        doc.addPage()
        drawPdfHeader(doc, { title: 'Bonus-Ledger (Bewegungen)', from: q.from, to: q.to })
        drawTable(
          doc,
          ['Datum', 'Kunde', 'Quelle', 'Punkte', 'EUR', 'Bestellung', 'Beschreibung'],
          payload.ledger.rows.map((e) => [
            fmtDate(e.occurred_at),
            [e.first_name, e.last_name].filter(Boolean).join(' ') || e.email || '',
            e.source_label,
            e.points_delta,
            fmtEur(e.eur_cents),
            e.order_number || '',
            (e.description || '').slice(0, 80),
          ]),
          [70, 120, 150, 50, 70, 70, 240],
        )
      }
    })
  }))

  return router
}

module.exports.pointsToCents = pointsToCents
module.exports.fundingCentsFromOrder = fundingCentsFromOrder
module.exports.normalizePaymentKey = normalizePaymentKey
