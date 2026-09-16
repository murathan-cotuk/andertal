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
async function chargeSellerForLabel(client, { sellerId, orderId, amountCents, orderNumber, stripe, descriptionKey }) {
  const sid = String(sellerId || '').trim()
  if (!sid) throw new Error('Seller not resolved for this order')
  const amount = Math.round(Number(amountCents) || 0)
  if (amount <= 0) throw new Error('Invalid label amount')

  const descKey = String(descriptionKey || 'shipping_label_for_order')
  const descriptionParams = { order_number: orderNumber != null ? String(orderNumber) : '' }
  const available = await getSellerAvailableCents(client, sid)

  if (available > 0) {
    const r = await client.query(
      `INSERT INTO seller_ledger_adjustments (seller_id, type, amount_cents, description_key, description_params, order_id, charge_method)
       VALUES ($1, 'shipping_label', $2, $5, $3::jsonb, $4, 'balance') RETURNING id`,
      [sid, -amount, JSON.stringify(descriptionParams), orderId || null, descKey],
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
     VALUES ($1, 'shipping_label', $2, $6, $3::jsonb, $4, 'card', $5) RETURNING id`,
    [sid, -amount, JSON.stringify(descriptionParams), orderId || null, paymentIntent.id, descKey],
  )
  return { charge_method: 'card', ledger_id: r.rows[0].id, stripe_payment_intent_id: paymentIntent.id }
}

/** Payout = Warenwert − Provision netto + Kundenversand (nur ohne Plattformetikett) − Etikett-Verrechnung. */
function sellerPeriodPayoutCents({
  grossCents = 0,
  commissionCents = 0,
  shippingPayoutCents = 0,
  labelBalanceCents = 0,
} = {}) {
  return Math.max(
    0,
    Math.round(Number(grossCents) || 0)
      - Math.round(Number(commissionCents) || 0)
      + Math.round(Number(shippingPayoutCents) || 0)
      - Math.round(Number(labelBalanceCents) || 0),
  )
}

async function sumUnsettledBalanceLabelCents(client, sellerId, periodEnd) {
  try {
    const r = await client.query(
      `SELECT COALESCE(SUM(-amount_cents), 0)::bigint AS cents
         FROM seller_ledger_adjustments
        WHERE seller_id = $1
          AND type = 'shipping_label'
          AND settled_payout_id IS NULL
          AND COALESCE(charge_method, 'balance') = 'balance'
          AND amount_cents < 0
          AND created_at < ($2::date + interval '1 day')`,
      [sellerId, periodEnd],
    )
    return Math.max(0, Number(r.rows[0]?.cents || 0))
  } catch (_) {
    return 0
  }
}

async function labeledOrderMeta(client, sellerId, periodEnd) {
  const anyIds = new Set()
  const balanceIds = new Set()
  const cardIds = new Set()
  try {
    const r = await client.query(
      `SELECT order_id::text AS id, COALESCE(charge_method, 'balance') AS charge_method
         FROM seller_ledger_adjustments
        WHERE seller_id = $1
          AND type = 'shipping_label'
          AND order_id IS NOT NULL
          AND created_at < ($2::date + interval '1 day')`,
      [sellerId, periodEnd],
    )
    for (const row of r.rows || []) {
      if (!row.id) continue
      const id = String(row.id)
      anyIds.add(id)
      if (String(row.charge_method || 'balance') === 'card') cardIds.add(id)
      else balanceIds.add(id)
    }
  } catch (_) { /* table may be missing */ }
  return { anyIds, balanceIds, cardIds }
}

async function labeledOrderIdSet(client, sellerId, periodEnd) {
  const meta = await labeledOrderMeta(client, sellerId, periodEnd)
  return meta.anyIds
}

async function settleBalanceLabelsForPayout(client, { sellerId, payoutId, periodEnd }) {
  if (!sellerId || !payoutId || !periodEnd) return
  try {
    await client.query(
      `UPDATE seller_ledger_adjustments
          SET settled_payout_id = $1
        WHERE seller_id = $2
          AND type = 'shipping_label'
          AND settled_payout_id IS NULL
          AND COALESCE(charge_method, 'balance') = 'balance'
          AND created_at < ($3::date + interval '1 day')`,
      [payoutId, sellerId, periodEnd],
    )
  } catch (_) { /* older DB */ }
}

/** Prorate customer shipping / paid / bonus onto one seller's merchandise share. */
function allocateSellerShareOfOrder(row, sellerMerchandiseCents) {
  const orderMerch = sellerOrderRevenueBasisCents(row)
  const orderPaid = resolveOrderPaidTotalCents(row)
  const orderShip = Math.max(0, Number(row.shipping_cents || 0))
  const orderBonus = Math.max(0, Number(row.platform_bonus_funding_cents || 0))
  const mine = Math.max(0, Math.round(Number(sellerMerchandiseCents) || 0))
  if (mine <= 0) return { shippingCents: 0, customerPaidCents: 0, bonusFundingCents: 0 }
  if (orderMerch <= 0 || mine >= orderMerch) {
    return { shippingCents: orderShip, customerPaidCents: orderPaid, bonusFundingCents: orderBonus }
  }
  const ratio = mine / orderMerch
  return {
    shippingCents: Math.round(orderShip * ratio),
    customerPaidCents: Math.round(orderPaid * ratio),
    bonusFundingCents: Math.round(orderBonus * ratio),
  }
}

/**
 * Period GMV for one seller (line-item ownership — store_orders.seller_id is often `default`).
 * Warenwert = merchandise subtotal (commission basis). `shippingCents` is only what the customer
 * paid (never the Sendcloud label). Platform labels are withheld from payout.
 */
async function querySellerPeriodOrders(client, sellerId, periodStart, periodEnd) {
  const params = [sellerId, periodStart, periodEnd]
  const where = `o.payment_status = 'bezahlt'
        AND o.created_at >= $2::date
        AND o.created_at < ($3::date + interval '1 day')
        AND ${sqlOrderOwnedBySeller('o', '$1')}`
  try {
    return await client.query(
      `SELECT o.id, o.seller_id, o.subtotal_cents, o.total_cents, o.shipping_cents, o.discount_cents,
              o.coupon_discount_cents, o.bonus_points_redeemed,
              COALESCE(o.platform_bonus_funding_cents, 0) AS platform_bonus_funding_cents,
              o.sendcloud_label_url
         FROM store_orders o
        WHERE ${where}`,
      params,
    )
  } catch (_) {
    return client.query(
      `SELECT o.id, o.seller_id, o.subtotal_cents, o.total_cents, o.shipping_cents, o.discount_cents,
              o.coupon_discount_cents, o.bonus_points_redeemed,
              COALESCE(o.platform_bonus_funding_cents, 0) AS platform_bonus_funding_cents,
              NULL::text AS sendcloud_label_url
         FROM store_orders o
        WHERE ${where}`,
      params,
    )
  }
}

async function aggregateSellerPeriodSales(client, sellerId, periodStart, periodEnd) {
  const sid = String(sellerId || '').trim()
  const labeled = await labeledOrderMeta(client, sid, periodEnd)
  const r = await querySellerPeriodOrders(client, sid, periodStart, periodEnd)
  let grossCents = 0
  let shippingCents = 0
  let shippingPayoutCents = 0
  let withheldShippingCents = 0
  let bonusFundingCents = 0
  let customerPaidCents = 0
  let orderCount = 0
  for (const row of r.rows || []) {
    orderCount += 1
    const headerSid = String(row.seller_id || '').trim()
    const ownsWholeOrder = headerSid === sid && headerSid !== 'default'
    let sellerMerch = 0
    if (ownsWholeOrder) {
      sellerMerch = sellerOrderRevenueBasisCents(row)
    } else {
      const iRes = await client.query('SELECT * FROM store_order_items WHERE order_id = $1', [row.id])
      const enriched = await enrichOrderItemRows(client, iRes.rows || [])
      const mine = filterItemsForSeller(enriched, sid, { isSuperuser: false, orderSellerId: row.seller_id })
      sellerMerch = itemsSubtotalCents(mine)
    }
    if (sellerMerch <= 0) continue
    grossCents += sellerMerch
    const share = allocateSellerShareOfOrder(row, sellerMerch)
    shippingCents += share.shippingCents
    const oid = String(row.id)
    const paidByCard = labeled.cardIds.has(oid)
    const platformPaidLabel = labeled.balanceIds.has(oid) || String(row.sendcloud_label_url || '').trim() !== ''
    // Card labels were already charged: seller keeps customer shipping.
    // Platform-paid labels: keep customer shipping at Andertal (do not pay it out).
    if (paidByCard || !platformPaidLabel) shippingPayoutCents += share.shippingCents
    else withheldShippingCents += share.shippingCents
    customerPaidCents += share.customerPaidCents
    bonusFundingCents += share.bonusFundingCents
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

  const rawLabelCents = await sumUnsettledBalanceLabelCents(client, sid, periodEnd)
  // Withheld customer shipping already covers that order's platform label — do not deduct twice
  // (that was the 16€ Versand: 8€ Kundenversand + 8€ Etikett).
  const labelBalanceCents = Math.max(0, rawLabelCents - withheldShippingCents)
  const labelCents = withheldShippingCents + labelBalanceCents

  return {
    grossCents,
    shippingCents,
    shippingPayoutCents,
    withheldShippingCents,
    labelBalanceCents,
    labelCents,
    bonusFundingCents,
    customerPaidCents,
    orderCount,
    refundCents,
  }
}

function applySellerPeriodLiveFields(target, live, rate) {
  const commissionCents = Math.round(Number(live.grossCents || 0) * (Number(rate) >= 0 ? Number(rate) : 0.12))
  target.total_cents = live.grossCents
  target.commission_cents = commissionCents
  target.payout_cents = sellerPeriodPayoutCents({
    grossCents: live.grossCents,
    commissionCents,
    shippingPayoutCents: live.shippingPayoutCents,
    labelBalanceCents: live.labelBalanceCents,
  })
  target.bonus_funding_cents = live.bonusFundingCents
  target.customer_paid_cents = live.customerPaidCents
  target.shipping_cents = live.shippingCents
  target.shipping_payout_cents = live.shippingPayoutCents
  target.label_cents = live.labelCents
  target.refund_cents = live.refundCents
  target.order_count = live.orderCount
  return target
}

/**
 * Platform-level GMV for a period: each paid order counted once (no per-seller double count).
 * Warenwert = merchandise (seller GMV / commission basis). Not Andertal revenue.
 */
async function marketplaceLabeledMeta(client, periodEnd) {
  const balanceIds = new Set()
  const cardIds = new Set()
  try {
    const r = await client.query(
      `SELECT order_id::text AS id, COALESCE(charge_method, 'balance') AS charge_method
         FROM seller_ledger_adjustments
        WHERE type = 'shipping_label'
          AND order_id IS NOT NULL
          AND created_at < ($1::date + interval '1 day')`,
      [periodEnd || '9999-12-31'],
    )
    for (const row of r.rows || []) {
      if (!row.id) continue
      const id = String(row.id)
      if (String(row.charge_method || 'balance') === 'card') cardIds.add(id)
      else balanceIds.add(id)
    }
  } catch (_) {}
  return { balanceIds, cardIds }
}

async function sumMarketplaceUnsettledBalanceLabelCents(client, periodEnd) {
  try {
    const r = await client.query(
      `SELECT COALESCE(SUM(-amount_cents), 0)::bigint AS cents
         FROM seller_ledger_adjustments
        WHERE type = 'shipping_label'
          AND settled_payout_id IS NULL
          AND COALESCE(charge_method, 'balance') = 'balance'
          AND amount_cents < 0
          AND created_at < ($1::date + interval '1 day')`,
      [periodEnd || '9999-12-31'],
    )
    return Math.max(0, Number(r.rows[0]?.cents || 0))
  } catch (_) {
    return 0
  }
}

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
  const labeled = await marketplaceLabeledMeta(client, periodEnd)
  const r = await client.query(
    `SELECT o.id, o.subtotal_cents, o.total_cents, o.shipping_cents, o.discount_cents, o.coupon_discount_cents,
            COALESCE(o.platform_bonus_funding_cents, 0) AS platform_bonus_funding_cents,
            o.stripe_application_fee_cents,
            o.sendcloud_label_url
       FROM store_orders o
      WHERE ${where.join(' AND ')}`,
    params,
  ).catch(() => client.query(
    `SELECT o.id, o.subtotal_cents, o.total_cents, o.shipping_cents, o.discount_cents, o.coupon_discount_cents,
            COALESCE(o.platform_bonus_funding_cents, 0) AS platform_bonus_funding_cents,
            o.stripe_application_fee_cents,
            NULL::text AS sendcloud_label_url
       FROM store_orders o
      WHERE ${where.join(' AND ')}`,
    params,
  ))
  let grossCents = 0
  let shippingCents = 0
  let shippingPayoutCents = 0
  let withheldShippingCents = 0
  let bonusFundingCents = 0
  let customerPaidCents = 0
  let commissionCents = 0
  let orderCount = 0
  for (const row of r.rows || []) {
    orderCount += 1
    const g = sellerOrderRevenueBasisCents(row)
    grossCents += g
    const ship = Math.max(0, Number(row.shipping_cents || 0))
    shippingCents += ship
    const oid = String(row.id)
    const paidByCard = labeled.cardIds.has(oid)
    const platformPaidLabel = labeled.balanceIds.has(oid) || String(row.sendcloud_label_url || '').trim() !== ''
    if (paidByCard || !platformPaidLabel) shippingPayoutCents += ship
    else withheldShippingCents += ship
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

  const rawLabelCents = await sumMarketplaceUnsettledBalanceLabelCents(client, periodEnd)
  const labelBalanceCents = Math.max(0, rawLabelCents - withheldShippingCents)
  const labelCents = withheldShippingCents + labelBalanceCents

  return {
    grossCents,
    shippingCents,
    shippingPayoutCents,
    withheldShippingCents,
    labelBalanceCents,
    labelCents,
    bonusFundingCents,
    customerPaidCents,
    commissionCents,
    orderCount,
    refundCents,
    sellerCount,
  }
}

module.exports = {
  chargeSellerForLabel,
  getSellerAvailableCents,
  sellerPeriodPayoutCents,
  aggregateSellerPeriodSales,
  aggregateMarketplacePeriodSales,
  allocateSellerShareOfOrder,
  applySellerPeriodLiveFields,
  settleBalanceLabelsForPayout,
  labeledOrderMeta,
}
