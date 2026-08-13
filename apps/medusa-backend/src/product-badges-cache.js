'use strict'

/**
 * In-memory cache for active product badges (storefront enrichment).
 * Must be invalidated on every admin create/update/delete so shop size/style
 * edits appear without waiting for TTL.
 */

let productBadgesCache = { expiresAt: 0, badges: [] }
const PRODUCT_BADGES_CACHE_TTL_MS = 60 * 1000

function invalidateProductBadgesCache() {
  productBadgesCache = { expiresAt: 0, badges: [] }
}

/**
 * @param {() => import('pg').Client | null} getDbClient
 * @returns {Promise<object[]>}
 */
async function getActiveProductBadges(getDbClient) {
  const now = Date.now()
  if (productBadgesCache.expiresAt > now) return productBadgesCache.badges
  let badges = []
  const client = typeof getDbClient === 'function' ? getDbClient() : null
  if (client) {
    try {
      await client.connect()
      const r = await client.query('SELECT * FROM admin_hub_product_badges WHERE active = true')
      badges = r.rows || []
      await client.end()
    } catch (_) {
      try { await client.end() } catch (__) {}
    }
  }
  productBadgesCache = { expiresAt: now + PRODUCT_BADGES_CACHE_TTL_MS, badges }
  return badges
}

/** Public store payload: style fields only (merged onto product.custom_badges by id in the shop). */
function badgeStylePayload(b) {
  if (!b) return null
  let i18n = b.i18n
  if (typeof i18n === 'string') {
    try { i18n = JSON.parse(i18n) } catch (_) { i18n = null }
  }
  return {
    id: b.id,
    label: b.label,
    position: b.position,
    bg_color: b.bg_color,
    text_color: b.text_color,
    font_size: b.font_size,
    border_width: b.border_width,
    border_color: b.border_color,
    border_radius: b.border_radius,
    offset_x: b.offset_x,
    offset_y: b.offset_y,
    badge_type: b.badge_type,
    image_url: b.image_url,
    image_width: b.image_width,
    image_height: b.image_height,
    i18n: i18n && typeof i18n === 'object' ? i18n : null,
    updated_at: b.updated_at || null,
  }
}

module.exports = {
  getActiveProductBadges,
  invalidateProductBadgesCache,
  badgeStylePayload,
  PRODUCT_BADGES_CACHE_TTL_MS,
}
