'use strict'

/**
 * Seller offer (admin_hub_seller_listings) status. The storefront and checkout show an offer
 * when it is 'active'. The Sellercentral product form sends the product vocabulary
 * ('published'), which used to be stored verbatim — such offers never appeared in the shop.
 * Writes normalize to 'active'; reads also accept legacy 'published' rows.
 */

const LIVE_LISTING_STATUSES = ['active', 'published']

const normalizeListingStatus = (raw) => {
  if (raw == null) return null
  const s = String(raw).trim().toLowerCase()
  if (!s) return null
  return s === 'published' ? 'active' : s
}

/** An offer without a positive price cannot go live (it would show 0 € in the buy box). */
const gateListingStatus = (status, effectivePriceCents) => {
  const s = normalizeListingStatus(status)
  if (s === 'active' && !(Number(effectivePriceCents) > 0)) return 'draft'
  return s
}

module.exports = { LIVE_LISTING_STATUSES, normalizeListingStatus, gateListingStatus }
