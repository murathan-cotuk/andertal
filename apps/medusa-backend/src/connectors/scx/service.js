'use strict'

/**
 * JTL SCX channel service: seller events → Andertal, Andertal orders → SCX, stock cursor.
 * Dependencies are injected (ctx) so the logic is testable without the network:
 *   ctx.client   pg client
 *   ctx.scx      ScxClient (client.js)
 *   ctx.products { create(body), update(id, body) } — admin-products.js DB functions (all gates)
 *   ctx.ingestImage(url, sellerId) → hosted URL | null (JTL media links expire after 7 days)
 *   ctx.stripeSecretKey() → Stripe secret key | null (refunds / cancellations)
 *   ctx.shopBaseUrl, ctx.now()
 * Money always goes through the existing settlement / order-cancel paths (actor = seller).
 */

const { offerEventToUnits, buildScxOrder, GLOBAL_ATTRIBUTES, PRICE_TYPE_ID } = require('./mapper')

const ERP = 'jtl_scx'
const EVENT_TYPES = [
  'System:Test', 'System:Notification',
  'Seller:Offer.New', 'Seller:Offer.Update', 'Seller:Offer.End', 'Seller:Offer.PriceUpdate', 'Seller:Offer.StockUpdate',
  'Seller:Order.Shipping', 'Seller:Order.Payment', 'Seller:Order.Cancellation.Request', 'Seller:Order.Refund',
  'Seller:Channel.Unlinked',
]

const dispatchFlow = (ctx, trigger, orderId) =>
  (ctx.dispatchFlow || require('../../order-flow-dispatch').dispatchOrderFlowEvent)(trigger, orderId)
const nowIso = (ctx) => new Date(ctx.now ? ctx.now() : Date.now()).toISOString()

async function getConnection(client, sellerId, { activeOnly = true } = {}) {
  const r = await client.query(
    `SELECT * FROM erp_connections WHERE erp_type = $1 AND external_seller_id = $2 ${activeOnly ? `AND status = 'active'` : ''} LIMIT 1`,
    [ERP, String(sellerId || '')],
  )
  return r.rows[0] || null
}

// ── Offers ──────────────────────────────────────────────────────────────────

async function hostImages(ctx, urls, sellerId) {
  const out = []
  for (const u of urls) {
    try {
      const hosted = ctx.ingestImage ? await ctx.ingestImage(u, sellerId) : null
      if (hosted) out.push(hosted)
    } catch (_) { /* one broken image must not block the listing */ }
  }
  return out
}

/** Why a saved product is not live (readiness / compliance gates) — for listing-failed. */
function notLiveReason(row) {
  if (!row) return 'Produkt konnte nicht gespeichert werden.'
  if (row.__error) return String(row.__error)
  const parts = []
  if (Array.isArray(row.publish_missing) && row.publish_missing.length) parts.push(`Fehlt: ${row.publish_missing.join(', ')}`)
  if (row.compliance_warning) parts.push(String(row.compliance_warning))
  return parts.join(' · ') || null
}

async function linkFamily(ctx, { sellerId, parentOfferId, title, members }) {
  const { client } = ctx
  if (members.length < 2) return null
  let familyId = (await client.query(
    `SELECT family_id FROM erp_offer_links WHERE erp_type = $1 AND external_seller_id = $2 AND parent_offer_id = $3 AND family_id IS NOT NULL LIMIT 1`,
    [ERP, sellerId, parentOfferId],
  )).rows[0]?.family_id || null
  const groups = [{ name: 'Variante', options: members.map((m) => ({ value: m.optionValue })) }]
  if (!familyId) {
    familyId = (await client.query(
      `INSERT INTO admin_hub_product_families (title, handle, metadata) VALUES ($1, $2, $3::jsonb) RETURNING id`,
      [title || 'Family', `jtl-${sellerId}-${parentOfferId}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'), JSON.stringify({ variation_groups: groups })],
    )).rows[0].id
  } else {
    await client.query(`UPDATE admin_hub_product_families SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1`, [familyId, JSON.stringify({ variation_groups: groups })])
  }
  for (const m of members) {
    await client.query(
      `UPDATE admin_hub_products SET family_id = $1, product_role = 'product',
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = now() WHERE id = $3`,
      [familyId, JSON.stringify({ family_option_value: m.optionValue, variation_groups: groups }), m.productId],
    )
    await client.query(`UPDATE erp_offer_links SET family_id = $1 WHERE erp_type = $2 AND external_seller_id = $3 AND offer_id = $4`, [familyId, ERP, sellerId, m.offerId])
  }
  return familyId
}

/** The product update merges metadata shallowly — keep the other markets' prices. */
async function mergedPrices(client, productId, prices) {
  const cur = (await client.query(`SELECT metadata->'prices' AS p FROM admin_hub_products WHERE id = $1`, [productId])).rows[0]?.p
  return { ...(cur && typeof cur === 'object' ? cur : {}), ...prices }
}

async function handleOffer(ctx, ev) {
  const { client, scx } = ctx
  const sellerId = String(ev.sellerId)
  const units = offerEventToUnits(ev, sellerId)
  const listed = []
  const failed = []
  const members = []
  for (const u of units) {
    const link = (await client.query(
      `SELECT * FROM erp_offer_links WHERE erp_type = $1 AND external_seller_id = $2 AND offer_id = $3`, [ERP, sellerId, u.offerId],
    )).rows[0]
    const media = await hostImages(ctx, u.imageUrls, sellerId)
    const body = {
      ...u.product,
      seller: sellerId,
      status: 'published', // the product gates (readiness, GPSR, EAN, SKU) decide whether it really goes live
      auto_translate: !link,
      metadata: { ...u.product.metadata, ...(media.length ? { media } : {}) },
    }
    let row = null
    try {
      if (link?.product_id && body.metadata.prices) body.metadata.prices = await mergedPrices(client, link.product_id, body.metadata.prices)
      row = link?.product_id ? await ctx.products.update(link.product_id, body) : await ctx.products.create(body)
    } catch (e) {
      row = { __error: e?.message || 'save failed' }
    }
    const productId = row && !row.__error ? row.id : (link?.product_id || null)
    const reason = notLiveReason(row)
    const live = row && !row.__error && String(row.status) === 'published' && !reason
    await client.query(
      `INSERT INTO erp_offer_links (erp_type, external_seller_id, offer_id, product_id, parent_offer_id, status, last_error, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (erp_type, external_seller_id, offer_id) DO UPDATE SET product_id = COALESCE(EXCLUDED.product_id, erp_offer_links.product_id),
         parent_offer_id = EXCLUDED.parent_offer_id, status = EXCLUDED.status, last_error = EXCLUDED.last_error, updated_at = now()`,
      [ERP, sellerId, u.offerId, productId, u.product.metadata.erp.parent_offer_id, live ? 'listed' : 'failed', live ? null : reason],
    )
    if (live) {
      listed.push({ sellerId, offerId: u.offerId, listedAt: nowIso(ctx), ...(row.handle && ctx.shopBaseUrl ? { listingUrl: `${ctx.shopBaseUrl}/de/${row.handle}` } : {}), channelOfferId: String(productId) })
    } else {
      failed.push({ sellerId, offerId: u.offerId, failedAt: nowIso(ctx), errorList: [{ code: 'AND100', message: String(reason || 'Nicht gelistet').slice(0, 250), longMessage: String(reason || '').slice(0, 1000) }] })
    }
    if (productId && u.optionValue) members.push({ productId, offerId: u.offerId, optionValue: u.optionValue })
  }
  if (members.length > 1) await linkFamily(ctx, { sellerId, parentOfferId: Number(ev.offerId), title: ev.title, members })
  if (listed.length) await scx.offerListed(listed)
  if (failed.length) await scx.offerListingFailed(failed)
  return { listed: listed.length, failed: failed.length }
}

async function linkedProductId(client, sellerId, offerId) {
  return (await client.query(
    `SELECT product_id FROM erp_offer_links WHERE erp_type = $1 AND external_seller_id = $2 AND offer_id = $3`, [ERP, String(sellerId), Number(offerId)],
  )).rows[0]?.product_id || null
}

async function handleOfferEnd(ctx, ev) {
  const pid = await linkedProductId(ctx.client, ev.sellerId, ev.offerId)
  if (!pid) return { skipped: true }
  await ctx.client.query(`UPDATE admin_hub_products SET status = 'draft', updated_at = now() WHERE id = $1`, [pid])
  await ctx.client.query(`UPDATE erp_offer_links SET status = 'ended', updated_at = now() WHERE erp_type = $1 AND external_seller_id = $2 AND offer_id = $3`, [ERP, String(ev.sellerId), Number(ev.offerId)])
  return { ended: pid }
}

async function handlePriceUpdate(ctx, ev) {
  const pid = await linkedProductId(ctx.client, ev.sellerId, ev.offerId)
  const { pickPrice } = require('./mapper')
  const price = pickPrice(ev.priceList, PRICE_TYPE_ID)
  if (!pid || price == null) return { skipped: true }
  await ctx.products.update(pid, { price, metadata: { prices: await mergedPrices(ctx.client, pid, { DE: { brutto_cents: Math.round(price * 100) } }) } })
  return { price }
}

async function setStock(client, sellerId, offerId, quantity) {
  const pid = await linkedProductId(client, sellerId, offerId)
  if (!pid) return false
  const q = Math.max(0, Math.floor(Number(String(quantity ?? 0).replace(',', '.')) || 0))
  await client.query(`UPDATE admin_hub_products SET inventory = $1, updated_at = now() WHERE id = $2`, [q, pid])
  await client.query(`UPDATE admin_hub_seller_listings SET inventory = $1 WHERE product_id = $2 AND seller_id = $3`, [q, pid, String(sellerId)]).catch(() => {})
  return true
}

// ── Orders ──────────────────────────────────────────────────────────────────

async function orderFromScxId(client, scxOrderId) {
  const m = String(scxOrderId || '').match(/^A(\d+)$/)
  if (!m) return null
  return (await client.query('SELECT * FROM store_orders WHERE order_number = $1::bigint', [m[1]])).rows[0] || null
}

async function handleShipping(ctx, ev) {
  const { client } = ctx
  const order = await orderFromScxId(client, ev.orderId)
  if (!order) return { skipped: 'unknown order' }
  const items = Array.isArray(ev.shippingItems) ? ev.shippingItems : []
  const first = items.find((i) => i && i.trackingNumber) || items[0] || {}
  const { recordShipment, orderSellerIds } = require('../../settlement/shipments')
  await recordShipment(client, {
    orderId: order.id, sellerId: String(ev.sellerId), carrierName: first.carrier || null,
    trackingNumber: first.trackingNumber || null, deliveryStatus: 'versendet', shippedAt: first.shippedAt || null,
  })
  const sellers = await orderSellerIds(client, order.id).catch(() => [])
  if (sellers.length <= 1) {
    await client.query(
      `UPDATE store_orders SET tracking_number = COALESCE(NULLIF($2, ''), tracking_number), carrier_name = COALESCE(NULLIF($3, ''), carrier_name),
         delivery_status = CASE WHEN delivery_status = 'zugestellt' THEN delivery_status ELSE 'versendet' END,
         shipped_at = COALESCE(shipped_at, now()), updated_at = now() WHERE id = $1`,
      [order.id, first.trackingNumber || '', first.carrier || ''],
    )
  }
  if (String(order.delivery_status || '') !== 'versendet' && String(order.delivery_status || '') !== 'zugestellt') {
    void dispatchFlow(ctx, 'order_shipped', order.id)
  }
  return { shipped: order.id }
}

/** Seller cancels (part of) its order in JTL-Wawi → refund those lines, report back. */
async function handleSellerCancellation(ctx, ev) {
  const { client, scx } = ctx
  const order = await orderFromScxId(client, ev.orderId)
  if (!order) return { skipped: 'unknown order' }
  const sellerId = String(ev.sellerId)
  const reqItems = (Array.isArray(ev.orderItem) ? ev.orderItem : []).filter((i) => i && i.orderItemId && !String(i.orderItemId).startsWith('SHIP-'))
  const sellerLines = (await client.query(
    `SELECT order_item_id, quantity - refunded_quantity AS left FROM seller_payables
      WHERE order_id = $1 AND seller_id = $2 AND kind = 'item' AND quantity > refunded_quantity`, [order.id, sellerId],
  )).rows
  const secretKey = ctx.stripeSecretKey ? await ctx.stripeSecretKey() : null
  const coversAll = sellerLines.length > 0 && sellerLines.every((l) => reqItems.some((r) => String(r.orderItemId) === String(l.order_item_id) && Number(r.quantity || l.left) >= Number(l.left)))
  if (coversAll) {
    const r = await require('../../order-cancel').refundSellerLines(client, { orderId: order.id, sellerId, secretKey, actor: `jtl:${sellerId}`, stripe: ctx.stripe || null })
    if (!r.ok && r.code !== 'nothing_to_cancel') throw new Error(r.message)
    await require('../../inventory').restoreOrderStock(client, order.id, { sellerId }).catch(() => {})
    if (r.ok && r.all_cancelled) {
      await client.query(`UPDATE store_orders SET order_status = 'storniert', payment_status = CASE WHEN $2::boolean THEN 'refunded' ELSE payment_status END, updated_at = now() WHERE id = $1`, [order.id, !r.processing])
      void dispatchFlow(ctx, 'order_cancelled', order.id)
    }
  } else if (reqItems.length) {
    const settlement = require('../../settlement')
    const { planReturnRefund } = require('../../settlement/return-refund')
    const { loadPayablesNetOfOpenRefunds } = require('../../settlement/refunds')
    const lines = reqItems.map((i) => ({ order_item_id: String(i.orderItemId), quantity: Math.max(1, Math.round(Number(i.quantity) || 1)) }))
    const payables = await loadPayablesNetOfOpenRefunds(client, order.id)
    const pay = (await client.query('SELECT gross_amount_cents FROM order_payments WHERE order_id = $1', [order.id])).rows[0]
    const plan = planReturnRefund(payables, { lines, paymentGrossCents: pay ? pay.gross_amount_cents : null })
    const stripe = ctx.stripe || (secretKey ? new (require('stripe'))(secretKey) : null)
    const { refund } = await settlement.createRefundRecord(client, {
      orderId: order.id, amountCents: plan.amount_cents, lines, shippingSellerIds: plan.shipping_seller_ids,
      actorSellerId: sellerId, reason: 'seller_cancellation', actor: `jtl:${sellerId}`, idempotencyKey: `scx-cancel:${ev.orderCancellationRequestId || ev.orderId}`,
    })
    const done = await settlement.executeRefund(client, stripe, refund.id, { actor: `jtl:${sellerId}` })
    if (done.status === 'failed' || done.status === 'canceled') throw new Error(`refund failed: ${done.failure_reason || done.status}`)
  }
  if (reqItems.length) {
    await scx.updateOrderStatus([{
      sellerId, orderId: String(ev.orderId), orderStatus: 'ACCEPTED',
      orderItems: reqItems.map((i) => ({ orderItemId: String(i.orderItemId), itemStatus: 'CANCELED_BY_SELLER', paymentStatus: 'PAID' })),
    }])
  }
  await client.query(`UPDATE erp_order_exports SET cancel_sent_at = COALESCE(cancel_sent_at, now()) WHERE order_id = $1 AND seller_id = $2 AND erp_type = $3`, [order.id, sellerId, ERP]).catch(() => {})
  return { cancelled: order.id, all: coversAll }
}

/** Seller refunds in JTL-Wawi → Stripe refund of those lines (settlement), result back to SCX. */
async function handleRefund(ctx, ev) {
  const { client, scx } = ctx
  const sellerId = String(ev.sellerId)
  const order = await orderFromScxId(client, ev.orderId)
  const reply = (isAccepted, message) => scx.refundProcessingResult({
    refundId: ev.refundId, sellerId, isAccepted, ...(message ? { processingErrorList: [{ message: String(message).slice(0, 1024) }] } : {}),
  })
  if (!order) { await reply(false, 'Unknown order'); return { rejected: 'unknown order' } }
  const items = (Array.isArray(ev.orderItem) ? ev.orderItem : []).filter((i) => i && i.orderItemId && !String(i.orderItemId).startsWith('SHIP-'))
  const amountCents = Math.round((Array.isArray(ev.orderItem) ? ev.orderItem : []).reduce((a, i) => a + (Number(String(i?.refund ?? 0).replace(',', '.')) || 0), 0) * 100)
  if (!(amountCents > 0)) { await reply(false, 'Refund amount missing'); return { rejected: 'amount' } }
  try {
    const settlement = require('../../settlement')
    const secretKey = ctx.stripeSecretKey ? await ctx.stripeSecretKey() : null
    const stripe = ctx.stripe || (secretKey ? new (require('stripe'))(secretKey) : null)
    const { refund } = await settlement.createRefundRecord(client, {
      orderId: order.id, amountCents,
      lines: items.length ? items.map((i) => ({ order_item_id: String(i.orderItemId), quantity: Math.max(1, Math.round(Number(i.quantity) || 1)) })) : null,
      sellerScope: items.length ? null : sellerId,
      actorSellerId: sellerId, reason: 'seller_refund', actor: `jtl:${sellerId}`, idempotencyKey: `scx-refund:${ev.refundId}`,
    })
    const done = await settlement.executeRefund(client, stripe, refund.id, { actor: `jtl:${sellerId}` })
    if (done.status === 'failed' || done.status === 'canceled') { await reply(false, done.failure_reason || done.status); return { rejected: done.status } }
    await reply(true)
    return { refunded: amountCents, processing: done.status !== 'succeeded' }
  } catch (e) {
    await reply(false, e?.message || 'Refund failed')
    return { rejected: e?.message }
  }
}

async function handleUnlinked(ctx, ev) {
  const sellerId = String(ev.sellerId)
  const permanently = ev.permanentlyRemoved === true
  await ctx.client.query(
    `UPDATE erp_connections SET status = $3, unlinked_at = now(), unlink_reason = $4, updated_at = now()
      WHERE erp_type = $1 AND external_seller_id = $2`,
    [ERP, sellerId, permanently ? 'removed' : 'unlinked', String(ev.reason || '').slice(0, 500)],
  )
  // JTL partnership: no partner commission accrues after the connection ended (§4.5).
  try { await require('../../jtl-partner').endJtlAttribution(ctx.client, { sellerId, actor: 'jtl_scx_unlinked' }) } catch (_) {}
  return { unlinked: sellerId, permanently }
}

// ── Event loop ──────────────────────────────────────────────────────────────

/** @returns {Promise<{ ack: boolean, result?: any, error?: string }>} */
async function processEvent(ctx, item) {
  const type = String(item?.type || '')
  const ev = item?.event || {}
  if (type.startsWith('System:')) return { ack: true, result: 'system' }
  const conn = await getConnection(ctx.client, ev.sellerId)
  if (!conn) return { ack: true, result: 'unknown or inactive seller' }
  switch (type) {
    case 'Seller:Offer.New':
    case 'Seller:Offer.Update': return { ack: true, result: await handleOffer(ctx, ev) }
    case 'Seller:Offer.End': return { ack: true, result: await handleOfferEnd(ctx, ev) }
    case 'Seller:Offer.PriceUpdate': return { ack: true, result: await handlePriceUpdate(ctx, ev) }
    case 'Seller:Offer.StockUpdate': return { ack: true, result: await setStock(ctx.client, ev.sellerId, ev.offerId, ev.quantity) }
    case 'Seller:Order.Shipping': return { ack: true, result: await handleShipping(ctx, ev) }
    case 'Seller:Order.Payment': return { ack: true, result: 'prepaid marketplace' }
    case 'Seller:Order.Cancellation.Request': return { ack: true, result: await handleSellerCancellation(ctx, ev) }
    case 'Seller:Order.Refund': return { ack: true, result: await handleRefund(ctx, ev) }
    case 'Seller:Channel.Unlinked': return { ack: true, result: await handleUnlinked(ctx, ev) }
    default: return { ack: true, result: `not handled: ${type}` }
  }
}

/**
 * One poll: fetch events, process each once (erp_event_log), acknowledge handled ones.
 * A failing event is NOT acknowledged → SCX redelivers it (max 10x, then dead letter).
 */
async function pollEventsOnce(ctx) {
  const { client, scx } = ctx
  const data = await scx.getEvents({ eventTypeFilter: EVENT_TYPES })
  const list = Array.isArray(data?.eventList) ? data.eventList : []
  const ack = []
  let failed = 0
  for (const item of list) {
    const id = String(item?.id || '')
    if (!id) continue
    const seen = (await client.query('SELECT processed_at FROM erp_event_log WHERE event_id = $1', [id])).rows[0]
    if (seen?.processed_at) { ack.push(id); continue } // processed before, ack got lost
    await client.query(
      `INSERT INTO erp_event_log (event_id, erp_type, event_type, external_seller_id, attempts) VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (event_id) DO UPDATE SET attempts = erp_event_log.attempts + 1`,
      [id, ERP, String(item.type || ''), item?.event?.sellerId != null ? String(item.event.sellerId) : null],
    )
    try {
      const r = await processEvent(ctx, item)
      await client.query(`UPDATE erp_event_log SET processed_at = now(), error = NULL WHERE event_id = $1`, [id])
      if (r.ack) ack.push(id)
    } catch (e) {
      failed++
      await client.query(`UPDATE erp_event_log SET error = $2 WHERE event_id = $1`, [id, String(e?.message || e).slice(0, 2000)])
    }
  }
  if (ack.length) await scx.ackEvents(ack)
  return { received: list.length, acknowledged: ack.length, failed }
}

/** Paid orders with lines of a connected seller → SCX (one order per seller part). */
async function exportOrdersOnce(ctx, { limit = 50 } = {}) {
  const { client, scx } = ctx
  const pending = (await client.query(
    `SELECT DISTINCT o.id AS order_id, i.seller_id
       FROM store_orders o
       JOIN store_order_items i ON i.order_id = o.id
       JOIN erp_connections c ON c.erp_type = $1 AND c.seller_id = i.seller_id AND c.status = 'active' AND o.created_at >= c.connected_at
       LEFT JOIN erp_order_exports x ON x.order_id = o.id AND x.seller_id = i.seller_id AND x.erp_type = $1
      WHERE o.payment_status = 'bezahlt' AND COALESCE(o.order_status, '') NOT IN ('storniert', 'refunded')
        AND (x.order_id IS NULL OR (x.exported_at IS NULL AND x.attempts < 10))
      ORDER BY 1 LIMIT $2`,
    [ERP, limit],
  )).rows
  let exported = 0
  for (const p of pending) {
    const order = (await client.query('SELECT * FROM store_orders WHERE id = $1', [p.order_id])).rows[0]
    const items = (await client.query(
      `SELECT i.*, ap.sku, l.offer_id FROM store_order_items i
         LEFT JOIN admin_hub_products ap ON ap.id::text = i.product_id::text
         LEFT JOIN erp_offer_links l ON l.erp_type = $3 AND l.product_id::text = i.product_id::text
        WHERE i.order_id = $1 AND i.seller_id = $2 ORDER BY i.created_at, i.id`,
      [p.order_id, p.seller_id, ERP],
    )).rows
    let ship = 0
    try {
      const m = typeof order.shipping_by_seller === 'string' ? JSON.parse(order.shipping_by_seller) : order.shipping_by_seller
      ship = m && m[p.seller_id] != null ? Number(m[p.seller_id]) : 0
    } catch (_) { ship = 0 }
    const { getGoodsVatRatePercent } = require('../../goods-vat')
    const scxOrder = buildScxOrder({ order, items, sellerId: p.seller_id, shippingCents: ship, vatPercent: getGoodsVatRatePercent(order.country || 'DE') })
    try {
      await scx.createOrders([scxOrder])
      await client.query(
        `INSERT INTO erp_order_exports (order_id, seller_id, erp_type, external_order_id, status, exported_at, attempts, updated_at)
         VALUES ($1, $2, $3, $4, 'exported', now(), 1, now())
         ON CONFLICT (order_id, seller_id, erp_type) DO UPDATE SET external_order_id = EXCLUDED.external_order_id, status = 'exported',
           exported_at = now(), last_error = NULL, attempts = erp_order_exports.attempts + 1, updated_at = now()`,
        [p.order_id, p.seller_id, ERP, scxOrder.orderId],
      )
      exported++
    } catch (e) {
      await client.query(
        `INSERT INTO erp_order_exports (order_id, seller_id, erp_type, status, attempts, last_error, updated_at)
         VALUES ($1, $2, $3, 'failed', 1, $4, now())
         ON CONFLICT (order_id, seller_id, erp_type) DO UPDATE SET status = 'failed', attempts = erp_order_exports.attempts + 1, last_error = EXCLUDED.last_error, updated_at = now()`,
        [p.order_id, p.seller_id, ERP, String(e?.message || e).slice(0, 2000)],
      )
    }
  }
  // Cancellations done on Andertal (customer / Sellercentral) after the export → tell the ERP.
  const cancels = (await client.query(
    `SELECT x.order_id, x.seller_id, x.external_order_id FROM erp_order_exports x
       JOIN store_orders o ON o.id = x.order_id
      WHERE x.erp_type = $1 AND x.exported_at IS NOT NULL AND x.cancel_sent_at IS NULL
        AND (o.order_status = 'storniert' OR EXISTS (SELECT 1 FROM store_order_items i WHERE i.order_id = x.order_id AND i.seller_id = x.seller_id AND i.stock_restored_at IS NOT NULL))
      LIMIT $2`,
    [ERP, limit],
  ).catch(() => ({ rows: [] }))).rows
  for (const c of cancels) {
    const its = (await client.query('SELECT id FROM store_order_items WHERE order_id = $1 AND seller_id = $2', [c.order_id, c.seller_id])).rows
    try {
      await scx.updateOrderStatus([{
        sellerId: c.seller_id, orderId: c.external_order_id, orderStatus: 'ACCEPTED',
        orderItems: its.map((i) => ({ orderItemId: String(i.id), itemStatus: 'CANCELED_BY_BUYER', paymentStatus: 'PAID' })),
      }])
      await client.query(`UPDATE erp_order_exports SET cancel_sent_at = now(), updated_at = now() WHERE order_id = $1 AND seller_id = $2 AND erp_type = $3`, [c.order_id, c.seller_id, ERP])
    } catch (e) {
      await client.query(`UPDATE erp_order_exports SET last_error = $4, updated_at = now() WHERE order_id = $1 AND seller_id = $2 AND erp_type = $3`, [c.order_id, c.seller_id, ERP, String(e?.message || e).slice(0, 2000)])
    }
  }
  return { exported, pending: pending.length, cancellations: cancels.length }
}

/** Stock from JTL-Wawi (cursor-based, all sellers). */
async function syncStockOnce(ctx) {
  const { client, scx } = ctx
  const key = 'jtl_scx.stock_cursor'
  const cur = (await client.query('SELECT value FROM erp_sync_state WHERE key = $1', [key])).rows[0]?.value
    || new Date((ctx.now ? ctx.now() : Date.now()) - 24 * 3600 * 1000).toISOString()
  const data = await scx.stockUpdatesAll(cur)
  let n = 0
  for (const s of Array.isArray(data?.stockUpdateList) ? data.stockUpdateList : []) {
    if (await setStock(client, s.sellerId, s.offerId, s.quantity)) n++
  }
  if (data?.lastUpdatedAt) {
    await client.query(
      `INSERT INTO erp_sync_state (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, String(data.lastUpdatedAt)],
    )
  }
  return { updated: n }
}

// ── Seller sign-up / update (called from Sellercentral pages) ───────────────

async function signupSeller(ctx, { session, sellerId, companyName }) {
  const { client, scx } = ctx
  const sess = await scx.readSignupSession(session) // validates the one-time session
  await scx.createSeller({ session, sellerId, companyName })
  await client.query(
    `INSERT INTO erp_connections (seller_id, erp_type, external_seller_id, status, company_name, external_account_id)
     VALUES ($1, $2, $5, 'active', $3, $4)
     ON CONFLICT (erp_type, seller_id) DO UPDATE SET status = 'active', company_name = EXCLUDED.company_name,
       external_account_id = EXCLUDED.external_account_id, unlinked_at = NULL, unlink_reason = NULL, updated_at = now()`,
    [sellerId, ERP, companyName || null, sess?.jtlAccountId != null ? String(sess.jtlAccountId) : null, sellerId],
  )
  // JTL partnership (docs/jtl.md Faz A): sellers that come via the SCX sign-up are attributed.
  let attribution = null
  try {
    attribution = await require('../../jtl-partner').attributeJtlSeller(client, {
      sellerId, source: 'jtl_scx_signup', externalId: sess?.jtlAccountId != null ? String(sess.jtlAccountId) : null, actor: 'jtl_scx_signup',
    })
  } catch (e) { console.warn('[jtl-scx] attribution:', e?.message || e) }
  return { connected: true, jtlAccountId: sess?.jtlAccountId ?? null, attribution: attribution?.attribution || null }
}

async function updateSellerConnection(ctx, { session, sellerId, companyName }) {
  const { client, scx } = ctx
  const s = await scx.readUpdateSession(session)
  if (String(s?.sellerId || '') !== String(sellerId)) {
    const e = new Error('This JTL update session belongs to another seller account.')
    e.status = 403
    throw e
  }
  await scx.updateSeller({ sessionId: session, isActive: true, companyName })
  await client.query(
    `UPDATE erp_connections SET status = 'active', company_name = COALESCE($3, company_name), unlinked_at = NULL, unlink_reason = NULL, updated_at = now()
      WHERE erp_type = $1 AND seller_id = $2`,
    [ERP, sellerId, companyName || null],
  )
  return { updated: true }
}

/** Superuser: price type + global attributes (+ optionally the category tree) on the channel. */
async function setupChannel(ctx, { includeCategories = false } = {}) {
  const { client, scx } = ctx
  const out = {}
  out.priceType = await scx.putPriceType({ priceTypeId: PRICE_TYPE_ID, displayName: 'Andertal Preis (brutto)', description: 'Verkaufspreis auf Andertal inkl. MwSt.' }).then(() => 'ok', (e) => e.message)
  out.attributes = await scx.putGlobalAttributes(GLOBAL_ATTRIBUTES.map((a) => ({
    attributeId: a.attributeId, displayName: a.displayName, type: a.type, ...(a.required ? { required: true } : {}), ...(a.values ? { values: a.values } : {}),
  }))).then(() => 'ok', (e) => e.message)
  if (includeCategories) {
    const rows = (await client.query(
      `SELECT c.id::text AS id, c.name, c.parent_id::text AS parent_id,
              NOT EXISTS (SELECT 1 FROM admin_hub_categories k WHERE k.parent_id = c.id AND COALESCE(k.active, true)) AS leaf
         FROM admin_hub_categories c WHERE COALESCE(c.active, true)`,
    )).rows
    out.categories = await scx.putCategories(rows.map((r) => ({
      categoryId: r.id, displayName: String(r.name || r.id).slice(0, 255), parentCategoryId: r.parent_id || '0', listingAllowed: r.leaf === true, isLeaf: r.leaf === true,
    }))).then(() => `ok (${rows.length})`, (e) => e.message)
  }
  return out
}

module.exports = {
  ERP, EVENT_TYPES, processEvent, pollEventsOnce, exportOrdersOnce, syncStockOnce, signupSeller, updateSellerConnection, setupChannel,
  handleOffer, handleShipping, handleRefund, handleUnlinked, notLiveReason,
}
