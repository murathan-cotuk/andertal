'use strict'
/**
 * Auto-creates a DHL return label via Sendcloud when a customer requests a return.
 * Best-effort only: never throws — a missing Sendcloud config or a carrier API error
 * must not block the return request itself (see storeReturnRequestPOST). The seller
 * is NOT charged here; per product decision, the return label is created for free at
 * request time. The cost is only captured (label_cost_cents) for later billing once
 * the parcel actually moves in the carrier network — see chargeReturnLabelOnCarrierMovement,
 * invoked from the /webhook/sendcloud handler in routes/webhooks.js.
 */

const logger = require('./logger')
const { getSendcloudCredentials, sendcloudRequest } = require('./sendcloud-client')
// Required lazily inside chargeReturnLabelOnCarrierMovement (not at module top): seller-billing.js
// requires routes/store-checkout.js, which requires this file — a top-level require here would
// complete that cycle while store-checkout.js is still mid-load and hasn't set its exports yet.

// Return parcels ship back TO the seller's warehouse, which today is always assumed to be
// in Germany (matches the rest of the platform's DE-first defaults). If multi-country seller
// warehouses are ever supported, this needs to come from the seller's own address instead.
const RETURN_DESTINATION_COUNTRY = 'DE'

async function pickCheapestDhlReturnMethod(sc) {
  const resp = await sendcloudRequest(`/api/v2/shipping_methods?to_country=${RETURN_DESTINATION_COUNTRY}`, sc)
  if (resp.status >= 400) {
    return { error: `Sendcloud API ${resp.status}: ${JSON.stringify(resp.data?.error || resp.data)}` }
  }
  const methods = resp.data?.shipping_methods || []
  let best = null
  for (const method of methods) {
    const carrierKey = String(method.carrier || method.name || '').toLowerCase()
    if (!carrierKey.includes('dhl')) continue
    const countryEntry = (method.countries || []).find((c) => (c.iso_2 || '').toUpperCase() === RETURN_DESTINATION_COUNTRY)
    if (!countryEntry || countryEntry.price == null) continue
    if (!best || Number(countryEntry.price) < Number(best.price)) {
      best = { id: method.id, name: method.name, carrier: method.carrier || 'DHL', price: countryEntry.price }
    }
  }
  if (!best) return { error: `No DHL return method found for ${RETURN_DESTINATION_COUNTRY}` }
  return { method: best }
}

/**
 * @param {object} pgClient connected pg client
 * @param {{ returnId: string, orderId: string }} opts
 * @returns {Promise<{ ok: boolean, reason?: string, label_url?: string, tracking_number?: string, carrier_name?: string }>}
 */
async function createReturnLabelForOrder(pgClient, { returnId, orderId }) {
  try {
    const sc = await getSendcloudCredentials(pgClient)
    if (!sc.public_key || !sc.secret_key) {
      return { ok: false, reason: 'sendcloud_not_configured' }
    }
    const orderR = await pgClient.query(
      `SELECT id, order_number, first_name, last_name, email, phone, country, postal_code, city, address_line1, address_line2
       FROM store_orders WHERE id = $1::uuid`,
      [orderId],
    )
    const order = orderR.rows[0]
    if (!order) return { ok: false, reason: 'order_not_found' }

    const picked = await pickCheapestDhlReturnMethod(sc)
    if (picked.error) {
      logger.warn('[return-label] rate lookup failed:', picked.error)
      return { ok: false, reason: picked.error }
    }

    const parcelBody = JSON.stringify({ parcel: {
      name: [order.first_name, order.last_name].filter(Boolean).join(' ') || order.email || 'Kunde',
      address: order.address_line1 || '',
      address_2: order.address_line2 || '',
      city: order.city || '',
      postal_code: order.postal_code || '',
      country: { iso_2: (order.country || 'DE').toUpperCase() },
      telephone: order.phone || '',
      email: order.email || '',
      weight: '1',
      length: '30',
      width: '20',
      height: '15',
      shipment: { id: Number(picked.method.id) },
      is_return: true,
      request_label: true,
      order_number: `RET-${String(order.order_number || orderId).toString().slice(0, 12)}`,
    }})
    const scResp = await sendcloudRequest('/api/v2/parcels', sc, { method: 'POST', body: parcelBody })
    if (scResp.status >= 400) {
      const detail = JSON.stringify(scResp.data?.error || scResp.data)
      logger.warn('[return-label] Sendcloud parcel creation failed:', detail)
      return { ok: false, reason: `sendcloud_error: ${detail}` }
    }
    const parcel = scResp.data?.parcel || {}
    const trackingNumber = parcel.tracking_number || ''
    const labelUrl = parcel.label?.label_printer || parcel.label?.normal_printer || ''
    const carrierName = picked.method.carrier || 'DHL'
    if (!labelUrl) return { ok: false, reason: 'no_label_url_in_response' }
    const markup = 1 + (Number(sc.markup_pct) || 5) / 100
    const costCents = Math.round(Number(picked.method.price) * markup * 100)

    await pgClient.query(
      `UPDATE store_returns SET label_url = $1, label_tracking_number = $2, label_carrier_name = $3,
         label_cost_cents = $4, label_created_at = now(), updated_at = now() WHERE id = $5::uuid`,
      [labelUrl, trackingNumber, carrierName, costCents, returnId],
    )
    return { ok: true, label_url: labelUrl, tracking_number: trackingNumber, carrier_name: carrierName }
  } catch (e) {
    logger.error('[return-label] unexpected error:', e?.message || e)
    return { ok: false, reason: e?.message || 'unexpected_error' }
  }
}

/**
 * Called from the Sendcloud webhook once a return parcel's status changes to something
 * other than the very first status ever recorded for it — i.e. proof the carrier actually
 * scanned/moved the parcel, not just that the label was created. Charges the seller exactly
 * once (label_charge_status guards against double-charging on repeated webhook deliveries).
 * Never throws — webhook handling must stay best-effort.
 */
async function chargeReturnLabelOnCarrierMovement(pgClient, { returnId, stripe }) {
  const { chargeSellerForLabel } = require('./seller-billing')
  try {
    const retR = await pgClient.query(
      `SELECT r.order_id, r.label_cost_cents, r.label_charge_status, o.seller_id, o.order_number
       FROM store_returns r LEFT JOIN store_orders o ON o.id = r.order_id WHERE r.id = $1::uuid`,
      [returnId],
    )
    const row = retR.rows[0]
    if (!row) return { ok: false, reason: 'return_not_found' }
    if (row.label_charge_status !== 'pending') return { ok: false, reason: `already_${row.label_charge_status}` }
    if (!row.label_cost_cents || Number(row.label_cost_cents) <= 0) return { ok: false, reason: 'no_cost_recorded' }
    if (!row.seller_id) return { ok: false, reason: 'order_has_no_seller' }

    await chargeSellerForLabel(pgClient, {
      sellerId: row.seller_id,
      orderId: row.order_id,
      amountCents: row.label_cost_cents,
      orderNumber: row.order_number,
      stripe,
    })
    await pgClient.query(
      `UPDATE store_returns SET label_charge_status = 'charged', label_charged_at = now(), updated_at = now() WHERE id = $1::uuid`,
      [returnId],
    )
    return { ok: true }
  } catch (e) {
    logger.error('[return-label] charge failed:', e?.message || e)
    try {
      await pgClient.query(
        `UPDATE store_returns SET label_charge_status = 'charge_failed', updated_at = now() WHERE id = $1::uuid`,
        [returnId],
      )
    } catch (_) {}
    return { ok: false, reason: e?.message || 'charge_failed' }
  }
}

module.exports = { createReturnLabelForOrder, chargeReturnLabelOnCarrierMovement }
