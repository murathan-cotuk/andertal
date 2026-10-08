'use strict'

/**
 * A seller's view of a multi-seller order: shipping fields come from ITS OWN parcel
 * (order_shipments), not the order header — otherwise seller B's order vanished from the
 * "to ship" / packing queue as soon as seller A shipped, and B saw A's tracking number and label.
 * Single-seller orders keep the order-level fields (unchanged behaviour).
 */
function applySellerShipmentView(row, ownShipment, { multiSeller }) {
  if (!row || !multiSeller) return row
  const sh = ownShipment || {}
  return {
    ...row,
    delivery_status: sh.delivery_status || 'offen',
    tracking_number: sh.tracking_number || null,
    carrier_name: sh.carrier_name || null,
    shipped_at: sh.shipped_at || null,
    sendcloud_label_url: sh.label_url || null,
    delivery_date: sh.delivery_confirmed_at || null,
  }
}

/** SQL for the seller-view delivery status (multi-seller → own parcel, else order header). */
function sqlSellerDeliveryStatus(oAlias, sellerParam, sellerIdsAggSql) {
  const o = oAlias || 'o'
  return `(CASE WHEN cardinality(${sellerIdsAggSql}) > 1
    THEN COALESCE((SELECT sh.delivery_status FROM order_shipments sh WHERE sh.order_id = ${o}.id AND sh.seller_id = ${sellerParam}), 'offen')
    ELSE ${o}.delivery_status END)`
}

module.exports = { applySellerShipmentView, sqlSellerDeliveryStatus }
