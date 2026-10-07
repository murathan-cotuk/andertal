'use strict'

/**
 * Per-seller shipments for multi-seller orders (one row per order × seller in order_shipments).
 *
 * - recordShipment: a seller ships / reports status (label purchase, tracking number, PATCH).
 *   Status only moves forward (offen → versendet → zugestellt). A seller-reported "zugestellt" is
 *   display only — it never starts the payout clock (same rule as the order level).
 * - confirmShipmentDelivery: trusted sources only (carrier webhook / carrier API / superuser).
 *   Starts THAT seller's payout hold (refreshEligibilityForOrder reads order_shipments). When
 *   every seller of the order is confirmed, the order-level delivery_confirmed_at is set too.
 * Orders without shipment rows keep working exactly as before (order-level confirmation).
 */

const { withTx, lockKey, auditFinance } = require('./ledger')
const { refreshEligibilityForOrder, TRUSTED_DELIVERY_SOURCES, realSellerId } = require('./payables')

const RANK = { offen: 0, versendet: 1, zugestellt: 2 }
const normStatus = (s) => {
  const v = String(s || '').toLowerCase()
  if (v === 'shipped' || v === 'in_transit') return 'versendet'
  if (v === 'delivered') return 'zugestellt'
  return RANK[v] != null ? v : null
}

/** Real sellers on an order (line items; falls back to the order's seller). */
async function orderSellerIds(client, orderId) {
  const r = await client.query(
    `SELECT DISTINCT COALESCE(NULLIF(btrim(i.seller_id), ''), NULLIF(btrim(o.seller_id), '')) AS sid
       FROM store_orders o LEFT JOIN store_order_items i ON i.order_id = o.id
      WHERE o.id = $1::uuid`,
    [orderId],
  )
  return [...new Set(r.rows.map((x) => realSellerId(x.sid)).filter(Boolean))]
}

async function listShipments(client, orderId) {
  return (await client.query('SELECT * FROM order_shipments WHERE order_id = $1::uuid ORDER BY created_at', [orderId])).rows
}

async function findShipmentByTracking(client, trackingNumber) {
  const t = String(trackingNumber || '').trim()
  if (!t) return null
  return (await client.query(
    'SELECT * FROM order_shipments WHERE lower(tracking_number) = lower($1) ORDER BY updated_at DESC LIMIT 1', [t],
  )).rows[0] || null
}

async function recordShipment(client, { orderId, sellerId, carrierName = null, trackingNumber = null, deliveryStatus = null, shippedAt = null, sellerReportedDelivered = false }) {
  const sid = realSellerId(sellerId)
  if (!orderId || !sid) return null
  const status = normStatus(deliveryStatus) || (trackingNumber ? 'versendet' : 'offen')
  const r = await client.query(
    `INSERT INTO order_shipments (order_id, seller_id, carrier_name, tracking_number, delivery_status, shipped_at, seller_reported_delivered_at)
     VALUES ($1::uuid, $2::varchar, NULLIF($3::text, ''), NULLIF($4::text, ''), $5::varchar, CASE WHEN $5::varchar IN ('versendet', 'zugestellt') THEN COALESCE($6::timestamptz, now()) END,
             CASE WHEN $7::boolean THEN now() END)
     ON CONFLICT (order_id, seller_id) DO UPDATE SET
       carrier_name = COALESCE(EXCLUDED.carrier_name, order_shipments.carrier_name),
       tracking_number = COALESCE(EXCLUDED.tracking_number, order_shipments.tracking_number),
       delivery_status = CASE
         WHEN (CASE order_shipments.delivery_status WHEN 'zugestellt' THEN 2 WHEN 'versendet' THEN 1 ELSE 0 END)
            >= (CASE EXCLUDED.delivery_status WHEN 'zugestellt' THEN 2 WHEN 'versendet' THEN 1 ELSE 0 END)
         THEN order_shipments.delivery_status ELSE EXCLUDED.delivery_status END,
       shipped_at = COALESCE(order_shipments.shipped_at, EXCLUDED.shipped_at),
       seller_reported_delivered_at = COALESCE(order_shipments.seller_reported_delivered_at, EXCLUDED.seller_reported_delivered_at),
       updated_at = now()
     RETURNING *`,
    [orderId, sid, carrierName ? String(carrierName) : '', trackingNumber ? String(trackingNumber).trim() : '', status, shippedAt, !!sellerReportedDelivered],
  )
  return r.rows[0]
}

async function confirmShipmentDelivery(client, { orderId, sellerId, source, at = new Date(), actor = 'system' }) {
  if (!TRUSTED_DELIVERY_SOURCES.has(source)) throw new Error(`untrusted delivery source: ${source}`)
  const sid = realSellerId(sellerId)
  if (!sid) throw new Error('seller required')
  return withTx(client, async () => {
    await lockKey(client, `order:${orderId}`)
    await client.query(
      `INSERT INTO order_shipments (order_id, seller_id, delivery_status) VALUES ($1::uuid, $2, 'zugestellt')
       ON CONFLICT (order_id, seller_id) DO NOTHING`,
      [orderId, sid],
    )
    const r = await client.query(
      `UPDATE order_shipments SET delivery_status = 'zugestellt', delivery_confirmed_at = $3, delivery_confirmed_source = $4, updated_at = now()
        WHERE order_id = $1::uuid AND seller_id = $2 AND delivery_confirmed_at IS NULL
        RETURNING id`,
      [orderId, sid, at, source],
    )
    if (r.rows[0]) {
      await auditFinance(client, { actor, action: 'shipment_delivery_confirmed', entityType: 'order', entityId: orderId, details: { seller_id: sid, source, at } })
    }
    // All sellers delivered → the order counts as delivered (latest confirmation time).
    const sellers = await orderSellerIds(client, orderId)
    const confirmed = (await client.query(
      `SELECT seller_id, delivery_confirmed_at FROM order_shipments WHERE order_id = $1::uuid AND delivery_confirmed_at IS NOT NULL`, [orderId],
    )).rows
    const bySeller = new Map(confirmed.map((x) => [String(x.seller_id), new Date(x.delivery_confirmed_at)]))
    let orderDelivered = false
    if (sellers.length && sellers.every((s) => bySeller.has(s))) {
      const latest = new Date(Math.max(...sellers.map((s) => bySeller.get(s).getTime())))
      const o = await client.query(
        `UPDATE store_orders SET delivery_confirmed_at = $2::timestamptz, delivery_confirmed_source = $3,
                delivery_status = 'zugestellt', delivery_date = COALESCE(delivery_date, $2::timestamptz), updated_at = now()
          WHERE id = $1::uuid AND delivery_confirmed_at IS NULL RETURNING id`,
        [orderId, latest, source],
      )
      orderDelivered = !!o.rows[0]
    }
    await refreshEligibilityForOrder(client, orderId)
    return { changed: !!r.rows[0], orderDelivered }
  })
}

/**
 * Carrier says "delivered" for a tracking number. Multi-seller order with a matching shipment →
 * only that seller's shipment is confirmed; otherwise the whole order (previous behaviour).
 */
async function confirmDeliveryForTracking(client, orderId, trackingNumber, { source, at = new Date(), actor = 'system' }) {
  const { confirmDelivery } = require('./payables')
  const sellers = await orderSellerIds(client, orderId)
  const t = String(trackingNumber || '').trim()
  if (sellers.length > 1 && t) {
    const sh = (await client.query(
      'SELECT seller_id FROM order_shipments WHERE order_id = $1::uuid AND lower(tracking_number) = lower($2) LIMIT 1', [orderId, t],
    )).rows[0]
    if (sh) return { scope: 'shipment', ...(await confirmShipmentDelivery(client, { orderId, sellerId: sh.seller_id, source, at, actor })) }
  }
  return { scope: 'order', ...(await confirmDelivery(client, orderId, { source, at, actor })) }
}

module.exports = { recordShipment, confirmShipmentDelivery, confirmDeliveryForTracking, findShipmentByTracking, listShipments, orderSellerIds }
