'use strict'

const {
  resolveSellerScope,
  sqlOrderOwnedBySeller,
  sqlOrderVisibleToActor,
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
assert(owned.includes("oi.seller_id"), 'prefers item seller')
assert(owned.includes("IS DISTINCT FROM 'default'"), 'never treat default header as ownership')
assert(!/o\.seller_id = \$3\s*\)/.test(owned.replace(/\s+/g, ' ')) || owned.includes('IS DISTINCT FROM'), 'default excluded')

const visible = sqlOrderVisibleToActor('o', '$2', '$3')
assert(visible.startsWith('($2::boolean OR'), 'superuser bypass')

console.log('seller-scope.test.js: ok')
