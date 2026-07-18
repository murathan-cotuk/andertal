'use strict'

/**
 * Billbee direction note: in this codebase's integration model, Billbee is the *consumer* —
 * it polls Andertal's marketplace API (billbee-marketplace-api.js: GetOrders/GetProducts/GetStock)
 * for product/order data. There is no inbound "Billbee product -> Andertal" flow to map, so this
 * file only covers the one real inbound payload Billbee sends: the order status callback
 * (`Action=SetOrderState`, POST, per Billbee's Custom-Shop-API — see docs/erp-connectors.md).
 *
 * Documented SetOrderState fields (Billbee Hilfe: "Billbee API zur Anbindung eines eigenen
 * Webshops"): OrderId, NewStateId, Comment, ShippingCarrier, TrackingCode, TrackingUrl.
 * NewStateId uses the same enum this codebase already emits in the other direction via
 * toOrderState() in billbee-marketplace-api.js (1=offen, 2=in_bearbeitung, 3=bezahlt,
 * 4=versendet, 5=zugestellt, 6=storniert; 7=abgeschlossen is documented but not yet emitted
 * by toOrderState — added here for the inbound direction too).
 */
const STATE_ID_TO_ANDERTAL = {
  1: { order_status: 'offen' },
  2: { order_status: 'in_bearbeitung' },
  3: { payment_status: 'bezahlt' },
  4: { delivery_status: 'versendet' },
  5: { delivery_status: 'zugestellt' },
  6: { order_status: 'storniert' },
  7: { order_status: 'abgeschlossen' },
}

/**
 * Maps a Billbee SetOrderState callback body into a canonical order-status-update patch.
 * @param {Object} body - req.body from the SetOrderState POST (form or JSON, already parsed)
 * @returns {{ externalOrderId: string, statusPatch: Object, tracking: {carrier: string, trackingNumber: string, trackingUrl: string}|null, comment: string }}
 */
function billbeeOrderStateToCanonical(body) {
  const b = body && typeof body === 'object' ? body : {}
  const externalOrderId = String(b.OrderId ?? b.orderId ?? '').trim()
  const stateId = Number(b.NewStateId ?? b.newStateId)
  const statusPatch = STATE_ID_TO_ANDERTAL[stateId] || {}
  const carrier = String(b.ShippingCarrier ?? b.shippingCarrier ?? '').trim()
  const trackingNumber = String(b.TrackingCode ?? b.trackingCode ?? '').trim()
  const trackingUrl = String(b.TrackingUrl ?? b.trackingUrl ?? '').trim()
  return {
    externalOrderId,
    statusPatch,
    tracking: trackingNumber ? { carrier, trackingNumber, trackingUrl } : null,
    comment: String(b.Comment ?? b.comment ?? '').trim(),
  }
}

module.exports = { billbeeOrderStateToCanonical, STATE_ID_TO_ANDERTAL }
