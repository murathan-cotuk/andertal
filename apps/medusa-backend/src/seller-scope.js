'use strict'

/**
 * Strict seller scope helpers.
 * Multi-seller carts stamp store_orders.seller_id = 'default'; real ownership is on
 * store_order_items.seller_id (with legacy product/listing fallback when item seller is null).
 */

function isStrictSuperuser(user) {
  return user?.is_superuser === true
}

function sellerIdOf(user) {
  return String(user?.seller_id || '').trim()
}

/**
 * Resolve auth scope for sellercentral APIs.
 * Non-superusers without a real seller_id must be rejected (never fail-open to "all data").
 * `default` is the platform order header — never a scoped seller identity.
 * @returns {{ isSuperuser: boolean, sellerId: string } | null}
 */
function resolveSellerScope(user) {
  if (!user) return null
  const isSuperuser = isStrictSuperuser(user)
  const sellerId = sellerIdOf(user)
  if (!isSuperuser && (!sellerId || sellerId === 'default')) return null
  return { isSuperuser, sellerId }
}

/**
 * SQL boolean expression: does order `oAlias` belong to seller param (e.g. `$3`)?
 * Prefer line-item seller_id; fall back to product/listing only when item seller is unset.
 * Never treat platform header seller_id='default' as ownership for a real seller.
 */
function sqlOrderOwnedBySeller(oAlias, sellerParam) {
  const o = oAlias || 'o'
  const p = sellerParam
  return `(
    EXISTS (
      SELECT 1 FROM store_order_items oi
      WHERE oi.order_id = ${o}.id AND (
        NULLIF(TRIM(COALESCE(oi.seller_id, '')), '') = ${p}
        OR (
          NULLIF(TRIM(COALESCE(oi.seller_id, '')), '') IS NULL
          AND (
            EXISTS (
              SELECT 1 FROM admin_hub_seller_listings sl
              WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = ${p}
            )
            OR EXISTS (
              SELECT 1 FROM admin_hub_products ap
              WHERE ap.id::text = oi.product_id::text AND ap.seller_id = ${p}
            )
          )
        )
      )
    )
    OR (${o}.seller_id = ${p} AND NULLIF(TRIM(COALESCE(${o}.seller_id, '')), '') IS DISTINCT FROM 'default')
  )`
}

/** WHERE clause for non-superuser OR superuser-bypass: ($sup::boolean OR ownership) */
function sqlOrderVisibleToActor(oAlias, superParam, sellerParam) {
  return `(${superParam}::boolean OR ${sqlOrderOwnedBySeller(oAlias, sellerParam)})`
}

module.exports = {
  isStrictSuperuser,
  sellerIdOf,
  resolveSellerScope,
  sqlOrderOwnedBySeller,
  sqlOrderVisibleToActor,
}
