'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { explainStoreVisibility } = require('./shop-visibility')

test('live owned product with approved seller is visible', () => {
  const r = explainStoreVisibility(
    { status: 'active', seller_id: 's1', metadata: {} },
    { approvedSellerIds: new Set(['s1']) },
  )
  assert.equal(r.visible, true)
  assert.deepEqual(r.reasons, [])
})

test('draft is not visible', () => {
  const r = explainStoreVisibility({ status: 'draft', seller_id: 's1', metadata: {} }, { approvedSellerIds: new Set(['s1']) })
  assert.equal(r.visible, false)
  assert.equal(r.reasons[0].code, 'status_not_live')
})

test('pending catalog metafields hide active products', () => {
  const r = explainStoreVisibility(
    { status: 'active', seller_id: 's1', metadata: { _catalog_approval_pending: true } },
    { approvedSellerIds: new Set(['s1']) },
  )
  assert.equal(r.visible, false)
  assert.ok(r.reasons.some((x) => x.code === 'pending_catalog_metafields'))
})

test('rejected seller hides product', () => {
  const r = explainStoreVisibility(
    { status: 'published', seller_id: 's1', metadata: {} },
    { approvedSellerIds: new Set(['other']) },
  )
  assert.equal(r.visible, false)
  assert.ok(r.reasons.some((x) => x.code === 'seller_not_approved'))
})

test('family shell is hidden even when active', () => {
  const r = explainStoreVisibility(
    { status: 'active', seller_id: null, metadata: { product_role: 'family_shell' } },
    { approvedSellerIds: new Set() },
  )
  assert.equal(r.visible, false)
  assert.ok(r.reasons.some((x) => x.code === 'family_shell'))
})

test('master catalog (null seller) skips seller approval check', () => {
  const r = explainStoreVisibility(
    { status: 'active', seller_id: null, metadata: {} },
    { approvedSellerIds: new Set() },
  )
  assert.equal(r.visible, true)
})
