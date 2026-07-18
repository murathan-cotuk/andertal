'use strict'

/**
 * @typedef {Object} CanonicalLineItem
 * @property {string} [externalId]
 * @property {string} sku
 * @property {string} title
 * @property {number} quantity
 * @property {number} unitPriceCents
 *
 * @typedef {Object} CanonicalAddress
 * @property {string} [firstName]
 * @property {string} [lastName]
 * @property {string} [company]
 * @property {string} [street]
 * @property {string} [street2]
 * @property {string} [postalCode]
 * @property {string} [city]
 * @property {string} [country] - ISO-3166 alpha-2
 *
 * @typedef {Object} CanonicalOrder
 * @property {string} externalOrderId - Andertal store_orders.id (or order_number) when pushing OUT;
 *                                       ERP's own order id when an ERP order flows back IN.
 * @property {CanonicalLineItem[]} lineItems
 * @property {Object} customer - { firstName, lastName, email, phone }
 * @property {CanonicalAddress} shippingAddress
 * @property {CanonicalAddress} [billingAddress]
 * @property {{ subtotalCents: number, shippingCents: number, totalCents: number, currency: string }} totals
 * @property {string} status - canonical status string, mapped per-adapter to the ERP's own enum
 * @property {{ carrier: string, trackingNumber: string }} [tracking]
 */

function makeCanonicalOrder(partial) {
  return {
    externalOrderId: '',
    lineItems: [],
    customer: {},
    shippingAddress: {},
    billingAddress: null,
    totals: { subtotalCents: 0, shippingCents: 0, totalCents: 0, currency: 'EUR' },
    status: 'pending',
    tracking: null,
    ...partial,
  }
}

module.exports = { makeCanonicalOrder }
