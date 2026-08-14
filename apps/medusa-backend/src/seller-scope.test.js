'use strict'

const {
  resolveSellerScope,
  sqlOrderOwnedBySeller,
  sqlOrderVisibleToActor,
  sqlOrderItemSellerIdsAgg,
} = require('./seller-scope')

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}

assert(resolveSellerScope(null) === null, 'null user')
assert(resolveSellerScope({}) === null, 'empty user')
assert(resolveSellerScope({ is_superuser: false, seller_id: '' }) === null, 'empty seller_id')
assert(resolveSellerScope({ is_superuser: false, seller_id: 'default' }) === null, 'platform default blocked')
assert(
  resolveSellerScope({ is_superuser: 'true', seller_id: 'seller_abc' })?.isSuperuser === false,
  'string truthy is_superuser is not superuser',
)
assert(
  resolveSellerScope({ is_superuser: 1, seller_id: 'seller_abc' })?.isSuperuser === false,
  'numeric truthy is_superuser is not superuser',
)
assert(
  resolveSellerScope({ is_superuser: true, seller_id: '' })?.isSuperuser === true,
  'superuser without seller ok',
)
assert(
  resolveSellerScope({ is_superuser: false, seller_id: 'seller_abc' })?.sellerId === 'seller_abc',
  'normal seller scoped',
)

const owned = sqlOrderOwnedBySeller('o', '$3')
assert(owned.includes('oi.seller_id'), 'prefers item seller')
assert(owned.includes('IS DISTINCT FROM $3'), 'header cannot claim another seller\'s stamped lines')
assert(owned.includes('admin_hub_seller_listings'), 'listings considered only for unstamped lines')
assert(owned.includes("NULLIF(NULLIF(TRIM(COALESCE(o.seller_id, '')), ''), 'default')"), 'never treat default header as ownership')

const agg = sqlOrderItemSellerIdsAgg('o')
assert(agg.includes('store_order_items'), 'aggregates line sellers')
assert(agg.includes('array_agg'), 'returns distinct seller ids')
assert(agg.includes('admin_hub_products'), 'falls back to catalog owner')

const visible = sqlOrderVisibleToActor('o', '$2', '$3')
assert(visible.startsWith('($2::boolean OR'), 'superuser bypass')

console.log('seller-scope.test.js: ok')
