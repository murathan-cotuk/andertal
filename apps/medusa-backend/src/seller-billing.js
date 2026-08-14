'use strict'

const { sellerOrderRevenueBasisCents } = require('./routes/store-checkout')
const { enrichOrderItemRows, filterItemsForSeller, itemsSubtotalCents } = require('./order-items-seller')
const { sqlOrderOwnedBySeller } = require('./seller-scope')
const { resolveOrderPaidTotalCents } = require('./order-money')

/**
 * Seller's currently available (unpaid) revenue basis minus any ledger adjustments not yet
 * folded into a payout — this is the "balance" a label purchase can be deducted from. It is
 * allowed to go negative once a charge is applied; there is no floor check on purchase.
 */
async function getSellerAvailableCents(client, sellerId) {
  const oRes = await client.query(
    `SELECT id, seller_id, subtotal_cents, total_cents FROM store_orders o
     WHERE o.payment_status = 'bezahlt' AND (
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
     )`,
    [sellerId],
  )
  let revenueCents = 0
  for (const row of oRes.rows) {
    const ownsWholeOrder = String(row.seller_id || '').trim() === String(sellerId).trim()
    if (ownsWholeOrder) {
      revenueCents += sellerOrderRevenueBasisCents(row)
      continue
    }
    const iRes = await client.query('SELECT * FROM store_order_items WHERE order_id = $1', [row.id])
    const enriched = await enrichOrderItemRows(client, iRes.rows || [])
    const mine = filterItemsForSeller(enriched, sellerId, { isSuperuser: false, orderSellerId: row.seller_id })
    revenueCents += itemsSubtotalCents(mine)
  }

  const adjR = await client.query(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total FROM seller_ledger_adjustments WHERE seller_id = $1 AND settled_payout_id IS NULL`,
    [sellerId],
  )
  const adjustmentsCents = Number(adjR.rows[0]?.total || 0)

  return revenueCents + adjustmentsCents
}

/**
 * Charges a seller for a shipping label: deducts from their available (unpaid revenue) balance
 * if positive, letting it go negative; otherwise charges their saved card off-session via Stripe.
 * Throws with a user-facing message on failure (no card, decline, etc.) — the caller must not
 * create the label/parcel unless this resolves successfully.
 */
async function chargeSellerForLabel(client, { sellerId, orderId, amountCents, orderNumber, stripe }) {
  const sid = String(sellerId || '').trim()
  if (!sid) throw new Error('Seller not resolved for this order')
  const amount = Math.round(Number(amountCents) || 0)
  if (amount <= 0) throw new Error('Invalid label amount')

  const descriptionParams = { order_number: orderNumber != null ? String(orderNumber) : '' }
  const available = await getSellerAvailableCents(client, sid)

  if (available > 0) {
    const r = await client.query(
      `INSERT INTO seller_ledger_adjustments (seller_id, type, amount_cents, description_key, description_params, order_id, charge_method)
       VALUES ($1, 'shipping_label', $2, 'shipping_label_for_order', $3::jsonb, $4, 'balance') RETURNING id`,
      [sid, -amount, JSON.stringify(descriptionParams), orderId || null],
    )
    return { charge_method: 'balance', ledger_id: r.rows[0].id }
  }

  const cardR = await client.query(
    `SELECT stripe_customer_id, stripe_payment_method_id FROM seller_users
     WHERE seller_id = $1 AND sub_of_seller_id IS NULL ORDER BY created_at ASC LIMIT 1`,
    [sid],
  )
  const customerId = cardR.rows[0]?.stripe_customer_id
  const paymentMethodId = cardR.rows[0]?.stripe_payment_method_id
  if (!customerId || !paymentMethodId) {
    throw new Error('No card on file — add a card under Settings → Payments before buying a label.')
  }

  let paymentIntent
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'eur',
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description: `Shipping label — order #${orderNumber || ''}`.trim(),
    })
  } catch (e) {
    const declineMsg = e?.raw?.message || e?.message || 'Card payment failed'
    throw new Error(`Payment failed: ${declineMsg}`)
  }

  const r = await client.query(
    `INSERT INTO seller_ledger_adjustments (seller_id, type, amount_cents, description_key, description_params, order_id, charge_method, stripe_payment_intent_id)
     VALUES ($1, 'shipping_label', $2, 'shipping_label_for_order', $3::jsonb, $4, 'card', $5) RETURNING id`,
    [sid, -amount, JSON.stringify(descriptionParams), orderId || null, paymentIntent.id],
  )
  return { charge_method: 'card', ledger_id: r.rows[0].id, stripe_payment_intent_id: paymentIntent.id }
}

/**
 * Period GMV for one seller (line-item ownership — store_orders.seller_id is often `default`).
 * Bruttoumsatz = merchandise subtotal, bonus is platform-funded and listed separately.
 */
async function aggregateSellerPeriodSales(client, sellerId, periodStart, periodEnd) {
  const sid = String(sellerId || '').trim()
  const r = await client.query(
    `SELECT o.id, o.seller_id, o.subtotal_cents, o.total_cents, o.shipping_cents, o.discount_cents,
            o.coupon_discount_cents, o.bonus_points_redeemed,
            COALESCE(o.platform_bonus_funding_cents, 0) AS platform_bonus_funding_cents
       FROM store_orders o
      WHERE o.payment_status = 'bezahlt'
        AND o.created_at >= $2::date
        AND o.created_at < ($3::date + interval '1 day')
        AND ${sqlOrderOwnedBySeller('o', '$1')}`,
    [sid, periodStart, periodEnd],
  )
  let grossCents = 0
  let bonusFundingCents = 0
  let customerPaidCents = 0
  let orderCount = 0
  for (const row of r.rows || []) {
    orderCount += 1
    bonusFundingCents += Number(row.platform_bonus_funding_cents || 0)
    customerPaidCents += resolveOrderPaidTotalCents(row)
    const headerSid = String(row.seller_id || '').trim()
    const ownsWholeOrder = headerSid === sid && headerSid !== 'default'
    if (ownsWholeOrder) {
      grossCents += sellerOrderRevenueBasisCents(row)
      continue
    }
    const iRes = await client.query('SELECT * FROM store_order_items WHERE order_id = $1', [row.id])
    const enriched = await enrichOrderItemRows(client, iRes.rows || [])
    const mine = filterItemsForSeller(enriched, sid, { isSuperuser: false, orderSellerId: row.seller_id })
    grossCents += itemsSubtotalCents(mine)
  }

  let refundCents = 0
  try {
    const refundR = await client.query(
      `SELECT COALESCE(SUM(rr.refund_amount_cents), 0)::bigint AS refund_cents
         FROM store_returns rr
         JOIN store_orders o ON o.id = rr.order_id
        WHERE rr.created_at >= $2::date
          AND rr.created_at < ($3::date + interval '1 day')
          AND ${sqlOrderOwnedBySeller('o', '$1')}`,
      [sid, periodStart, periodEnd],
    )
    refundCents = Number(refundR.rows[0]?.refund_cents || 0)
  } catch (_) {}

  return {
    grossCents,
    bonusFundingCents,
    customerPaidCents,
    orderCount,
    refundCents,
  }
}

/**
 * Platform-level GMV for a period: each paid order counted once (no per-seller double count).
 * Bruttoumsatz = merchandise. Customer paid includes shipping — they are not a "Davon" split.
 */
async function aggregateMarketplacePeriodSales(client, periodStart, periodEnd) {
  const where = [`o.payment_status = 'bezahlt'`]
  const params = []
  if (periodStart) {
    params.push(periodStart)
    where.push(`o.created_at >= $${params.length}::date`)
  }
  if (periodEnd) {
    params.push(periodEnd)
    where.push(`o.created_at < ($${params.length}::date + interval '1 day')`)
  }
  const r = await client.query(
    `SELECT o.subtotal_cents, o.total_cents, o.shipping_cents, o.discount_cents, o.coupon_discount_cents,
            COALESCE(o.platform_bonus_funding_cents, 0) AS platform_bonus_funding_cents,
            o.stripe_application_fee_cents
       FROM store_orders o
      WHERE ${where.join(' AND ')}`,
    params,
  )
  let grossCents = 0
  let shippingCents = 0
  let bonusFundingCents = 0
  let customerPaidCents = 0
  let commissionCents = 0
  let orderCount = 0
  for (const row of r.rows || []) {
    orderCount += 1
    const g = sellerOrderRevenueBasisCents(row)
    grossCents += g
    shippingCents += Math.max(0, Number(row.shipping_cents || 0))
    bonusFundingCents += Number(row.platform_bonus_funding_cents || 0)
    customerPaidCents += resolveOrderPaidTotalCents(row)
    const storedFee = Number(row.stripe_application_fee_cents)
    commissionCents += Number.isFinite(storedFee) && storedFee > 0 ? storedFee : Math.round(g * 0.12)
  }

  let refundCents = 0
  try {
    const refundWhere = []
    const refundParams = []
    if (periodStart) {
      refundParams.push(periodStart)
      refundWhere.push(`rr.created_at >= $${refundParams.length}::date`)
    }
    if (periodEnd) {
      refundParams.push(periodEnd)
      refundWhere.push(`rr.created_at < ($${refundParams.length}::date + interval '1 day')`)
    }
    const refundSql = refundWhere.length ? `WHERE ${refundWhere.join(' AND ')}` : ''
    const refundR = await client.query(
      `SELECT COALESCE(SUM(rr.refund_amount_cents), 0)::bigint AS refund_cents FROM store_returns rr ${refundSql}`,
      refundParams,
    )
    refundCents = Number(refundR.rows[0]?.refund_cents || 0)
  } catch (_) {}

  let sellerCount = 0
  try {
    const sidWhere = [`o.payment_status = 'bezahlt'`]
    const sidParams = []
    if (periodStart) {
      sidParams.push(periodStart)
      sidWhere.push(`o.created_at >= $${sidParams.length}::date`)
    }
    if (periodEnd) {
      sidParams.push(periodEnd)
      sidWhere.push(`o.created_at < ($${sidParams.length}::date + interval '1 day')`)
    }
    const sRes = await client.query(
      `SELECT COUNT(DISTINCT sid)::int AS n FROM (
         SELECT NULLIF(oi.seller_id, 'default') AS sid
           FROM store_order_items oi
           JOIN store_orders o ON o.id = oi.order_id
          WHERE ${sidWhere.join(' AND ')}
         UNION
         SELECT NULLIF(o.seller_id, 'default')
           FROM store_orders o
          WHERE ${sidWhere.join(' AND ')}
       ) x WHERE sid IS NOT NULL`,
      sidParams,
    )
    sellerCount = Number(sRes.rows[0]?.n || 0)
  } catch (_) {}

  return {
    grossCents,
    shippingCents,
    bonusFundingCents,
    customerPaidCents,
    commissionCents,
    orderCount,
    refundCents,
    sellerCount,
  }
}

module.exports = { chargeSellerForLabel, getSellerAvailableCents, aggregateSellerPeriodSales, aggregateMarketplacePeriodSales }
