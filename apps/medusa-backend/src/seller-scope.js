'use strict'

/**
 * Strict seller scope helpers.
 * Multi-seller carts stamp store_orders.seller_id = 'default'; real ownership is on
 * store_order_items.seller_id. Catalog ownership / listings must never leak a sold
 * offer to a seller who was not the chosen merchant.
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

/** SQL: treat '', whitespace, and platform 'default' as "no seller stamped". */
function sqlRealSellerId(expr) {
  return `NULLIF(NULLIF(TRIM(COALESCE(${expr}, '')), ''), 'default')`
}

/**
 * SQL boolean: does order line `oiAlias` belong to seller param (e.g. `$3`)?
 * Stamped line seller always wins. Unstamped lines fall back to the catalog owner
 * only when no other seller lists that product — otherwise the sold-from merchant
 * is ambiguous and must not match the catalog owner (or every listing seller).
 */
function sqlOrderItemOwnedBySeller(oiAlias, sellerParam) {
  const oi = oiAlias || 'oi'
  const p = sellerParam
  const line = sqlRealSellerId(`${oi}.seller_id`)
  return `(
    ${line} = ${p}
    OR (
      ${line} IS NULL
      AND EXISTS (
        SELECT 1 FROM admin_hub_products ap
        WHERE ap.id::text = ${oi}.product_id::text AND ap.seller_id = ${p}
      )
      AND NOT EXISTS (
        SELECT 1 FROM admin_hub_seller_listings sl
        WHERE sl.product_id::text = ${oi}.product_id::text
          AND ${sqlRealSellerId('sl.seller_id')} IS NOT NULL
          AND ${sqlRealSellerId('sl.seller_id')} IS DISTINCT FROM ${p}
      )
    )
    OR (
      ${line} IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM admin_hub_products ap
        WHERE ap.id::text = ${oi}.product_id::text
          AND ${sqlRealSellerId('ap.seller_id')} IS NOT NULL
      )
      AND EXISTS (
        SELECT 1 FROM admin_hub_seller_listings sl
        WHERE sl.product_id::text = ${oi}.product_id::text AND sl.seller_id = ${p}
      )
      AND (
        SELECT COUNT(*) FROM admin_hub_seller_listings sl2
        WHERE sl2.product_id::text = ${oi}.product_id::text
      ) = 1
    )
  )`
}

/**
 * SQL boolean expression: does order `oAlias` belong to seller param (e.g. `$3`)?
 * Prefer line-item seller_id. Header store_orders.seller_id is never enough to claim
 * an order whose lines are stamped to a different seller, and 'default' is never ownership.
 */
function sqlOrderOwnedBySeller(oAlias, sellerParam) {
  const o = oAlias || 'o'
  const p = sellerParam
  return `(
    EXISTS (
      SELECT 1 FROM store_order_items oi
      WHERE oi.order_id = ${o}.id AND ${sqlOrderItemOwnedBySeller('oi', p)}
    )
    OR (
      ${o}.seller_id = ${p}
      AND ${sqlRealSellerId(`${o}.seller_id`)} IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM store_order_items oi
        WHERE oi.order_id = ${o}.id
          AND ${sqlRealSellerId('oi.seller_id')} IS NOT NULL
          AND ${sqlRealSellerId('oi.seller_id')} IS DISTINCT FROM ${p}
      )
    )
  )`
}

/** WHERE clause for non-superuser OR superuser-bypass: ($sup::boolean OR ownership) */
function sqlOrderVisibleToActor(oAlias, superParam, sellerParam) {
  return `(${superParam}::boolean OR ${sqlOrderOwnedBySeller(oAlias, sellerParam)})`
}

/**
 * Distinct real merchant ids on an order's lines (stamped item.seller_id, else catalog /
 * unique listing fallback). Used by superuser order list grouping — header
 * store_orders.seller_id is always the platform (`default`) after marketplace checkout.
 */
function sqlOrderItemSellerIdsAgg(oAlias) {
  const o = oAlias || 'o'
  return `(
    SELECT COALESCE(array_agg(DISTINCT sid), ARRAY[]::text[])
    FROM (
      SELECT ${sqlRealSellerId('oi.seller_id')} AS sid
      FROM store_order_items oi
      WHERE oi.order_id = ${o}.id
      UNION
      SELECT ${sqlRealSellerId('ap.seller_id')}
      FROM store_order_items oi
      INNER JOIN admin_hub_products ap ON ap.id::text = oi.product_id::text
      WHERE oi.order_id = ${o}.id
        AND ${sqlRealSellerId('oi.seller_id')} IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM admin_hub_seller_listings sl
          WHERE sl.product_id::text = oi.product_id::text
            AND ${sqlRealSellerId('sl.seller_id')} IS NOT NULL
            AND ${sqlRealSellerId('sl.seller_id')} IS DISTINCT FROM ${sqlRealSellerId('ap.seller_id')}
        )
      UNION
      SELECT ${sqlRealSellerId('sl.seller_id')}
      FROM store_order_items oi
      INNER JOIN admin_hub_seller_listings sl ON sl.product_id::text = oi.product_id::text
      WHERE oi.order_id = ${o}.id
        AND ${sqlRealSellerId('oi.seller_id')} IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM admin_hub_products ap
          WHERE ap.id::text = oi.product_id::text
            AND ${sqlRealSellerId('ap.seller_id')} IS NOT NULL
        )
        AND (
          SELECT COUNT(*) FROM admin_hub_seller_listings sl2
          WHERE sl2.product_id::text = oi.product_id::text
            AND ${sqlRealSellerId('sl2.seller_id')} IS NOT NULL
        ) = 1
    ) resolved
    WHERE sid IS NOT NULL
  )`
}

module.exports = {
  isStrictSuperuser,
  sellerIdOf,
  resolveSellerScope,
  sqlRealSellerId,
  sqlOrderItemOwnedBySeller,
  sqlOrderOwnedBySeller,
  sqlOrderVisibleToActor,
  sqlOrderItemSellerIdsAgg,
}
