'use strict'

/**
 * Who may change which order field through PATCH /admin-hub/v1/orders/:id (Phase 7).
 *
 * Money-relevant fields are never seller-editable: payment status, delivery date (starts the
 * payout hold period), payout / transfer status and refund fields. Sellercentral sends the full
 * status triple on every save, so an UNCHANGED value is accepted — only a change is rejected.
 * Order status values that imply money moved (refunded / storniert) require the refund API.
 */

const SELLER_FORBIDDEN_FIELDS = [
  'delivery_date',
  'delivery_confirmed_at',
  'stripe_payout_status',
  'stripe_transfer_status',
  'payout_status',
  'refund_amount_cents',
  'refund_status',
  'refunded_cents',
]
const SELLER_FORBIDDEN_ORDER_STATUSES = new Set(['refunded', 'storniert'])

/**
 * @param {object} body     request body
 * @param {object} current  current order row (payment_status, order_status)
 * @param {{ isSuperuser: boolean }} actor
 * @returns {{ ok: true } | { ok: false, status: number, message: string, field: string }}
 */
function authorizeOrderPatch(body, current, { isSuperuser }) {
  if (isSuperuser) return { ok: true }
  const b = body || {}
  for (const f of SELLER_FORBIDDEN_FIELDS) {
    if (b[f] !== undefined) return { ok: false, status: 403, field: f, message: `Sellers cannot change ${f}` }
  }
  if (b.payment_status !== undefined && String(b.payment_status) !== String(current?.payment_status ?? '')) {
    return { ok: false, status: 403, field: 'payment_status', message: 'Sellers cannot change payment_status' }
  }
  if (b.order_status !== undefined
    && String(b.order_status) !== String(current?.order_status ?? '')
    && SELLER_FORBIDDEN_ORDER_STATUSES.has(String(b.order_status))) {
    return { ok: false, status: 403, field: 'order_status', message: 'Refunds / cancellations go through the refund API' }
  }
  return { ok: true }
}

module.exports = { authorizeOrderPatch, SELLER_FORBIDDEN_FIELDS }
