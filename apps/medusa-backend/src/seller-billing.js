'use strict'

const { sellerOrderRevenueBasisCents } = require('./routes/store-checkout')
const { enrichOrderItemRows, filterItemsForSeller, itemsSubtotalCents } = require('./order-items-seller')

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
           EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $1)
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

module.exports = { chargeSellerForLabel, getSellerAvailableCents }
