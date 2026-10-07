'use strict'

/**
 * Why a product does / does not appear in the shop catalog — mirrors the hard filters in
 * store-products listStoreProducts / PDP GET (status, seller approval, family shell).
 * Catalog metafield proposals no longer hide products (2026-10-07).
 */

const { isFamilyShell } = require('./product-identity')

const STORE_LIVE_STATUSES = new Set(['published', 'active'])

const REASON_MESSAGES = {
  status_not_live:
    'Status is not Active/Published — draft, archived, merged, or inactive products are hidden from the shop.',
  seller_not_approved:
    'Seller account is rejected or suspended, so their products are hidden from the shop.',
  family_shell:
    'This product is a family roof (shell) and is excluded from shop catalog listings.',
}

/**
 * @param {object} product
 * @param {{ approvedSellerIds?: Set<string> }} [opts]
 * @returns {{ visible: boolean, reasons: Array<{ code: string, message: string }> }}
 */
const explainStoreVisibility = (product, opts = {}) => {
  const reasons = []
  const status = String(product?.status || '').trim().toLowerCase()
  if (!STORE_LIVE_STATUSES.has(status)) {
    reasons.push({ code: 'status_not_live', message: REASON_MESSAGES.status_not_live })
  }
  const sid = String(product?.seller_id || '').trim()
  if (sid && sid !== 'default') {
    const set = opts.approvedSellerIds
    if (set instanceof Set && !set.has(sid)) {
      reasons.push({
        code: 'seller_not_approved',
        message: REASON_MESSAGES.seller_not_approved,
      })
    }
  }
  if (isFamilyShell(product)) {
    reasons.push({ code: 'family_shell', message: REASON_MESSAGES.family_shell })
  }
  return { visible: reasons.length === 0, reasons }
}

module.exports = {
  explainStoreVisibility,
  STORE_LIVE_STATUSES,
  REASON_MESSAGES,
}
