'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeStoreEan,
  buildListingSellerMeta,
  listingCoversEan,
  resolveSellableUnit,
  stableVariantId,
  productIdFromVariantId,
  resolveVariantFromCartId,
  isFamilyShell,
  PRODUCT_ROLE_FAMILY_SHELL,
} = require('./product-identity')
const { buildFamilyLinkPlan, buildCombineAsVariantsPlan } = require('./combine-as-variants-core')

describe('product-identity', () => {
  it('normalizeStoreEan strips non-digits and requires length >= 8', () => {
    assert.equal(normalizeStoreEan('3234-567-891'), '3234567891')
    assert.equal(normalizeStoreEan('123'), '')
  })

  it('buildListingSellerMeta never sets covers_all', () => {
    const m = buildListingSellerMeta('3234567891')
    assert.deepEqual(m, { ean: '3234567891' })
    assert.equal(m.covers_all, undefined)
    assert.equal(buildListingSellerMeta('12'), null)
  })

  it('listingCoversEan ignores covers_all and scopes to exact EAN', () => {
    const parent = {
      id: 'p1',
      metadata: { ean: '1111111111111' },
      variants: [
        { ean: '3234567891', title: 'Child A' },
        { ean: '3234567892', title: 'Child B' },
      ],
    }
    const listingCoversAll = {
      seller_metadata: { covers_all: true, ean: '3234567891' },
    }
    // Even with covers_all, only the listed ean matches (covers_all ignored).
    assert.equal(listingCoversEan(listingCoversAll, '3234567891', parent), true)
    assert.equal(listingCoversEan(listingCoversAll, '3234567892', parent), false)

    const listingB = { seller_metadata: { ean: '3234567892' }, listed_ean: '3234567892' }
    assert.equal(listingCoversEan(listingB, '3234567892', parent), true)
    assert.equal(listingCoversEan(listingB, '3234567891', parent), false)
  })

  it('resolveSellableUnit returns variant identity for child EAN', () => {
    const parent = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      title: 'Umbrella',
      metadata: { ean: '1111111111111' },
      variants: [
        { ean: '3234567891', title: 'Child A', an_id: 'AN-AAAAAAA' },
        { ean: '3234567892', title: 'Child B' },
      ],
    }
    const unit = resolveSellableUnit(parent, '3234567891')
    assert.equal(unit.matched_on, 'variant')
    assert.equal(unit.title, 'Child A')
    assert.equal(unit.ean, '3234567891')
    assert.equal(unit.cart_variant_id, `${parent.id}-ean-3234567891`)
  })

  it('stableVariantId prefers ean over index', () => {
    const pid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    assert.equal(stableVariantId(pid, { ean: '3234567891' }, 3), `${pid}-ean-3234567891`)
    assert.equal(stableVariantId(pid, {}, 0), `${pid}-variant-0`)
  })

  it('productIdFromVariantId supports -ean- and -listing-', () => {
    const pid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    assert.equal(productIdFromVariantId(`${pid}-ean-3234567891`), pid)
    assert.equal(productIdFromVariantId(`${pid}-variant-0`), pid)
    assert.equal(productIdFromVariantId(`${pid}-listing-seller1-variant-0`), pid)
  })

  it('resolveVariantFromCartId finds by ean after reorder', () => {
    const product = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      variants: [
        { ean: '9999999999999', title: 'Moved' },
        { ean: '3234567891', title: 'Target' },
      ],
    }
    const r = resolveVariantFromCartId(product, `${product.id}-ean-3234567891`)
    assert.equal(r.index, 1)
    assert.equal(r.variant.title, 'Target')
  })

  it('isFamilyShell detects role', () => {
    assert.equal(isFamilyShell({ product_role: PRODUCT_ROLE_FAMILY_SHELL }), true)
    assert.equal(isFamilyShell({ metadata: { is_family_shell: true } }), true)
    assert.equal(isFamilyShell({ product_role: 'product' }), false)
  })
})

describe('family link combine', () => {
  it('buildFamilyLinkPlan keeps all product ids independent', () => {
    const products = [
      { id: 'a', title: 'Black', status: 'active' },
      { id: 'b', title: 'White', status: 'active' },
    ]
    const plan = buildFamilyLinkPlan({ familyTitle: 'Phone', products })
    assert.equal(plan.ok, true)
    assert.equal(plan.mode, 'family_link')
    assert.deepEqual(plan.members.map((m) => m.product_id), ['a', 'b'])
  })

  it('legacy fold still available', () => {
    const products = [
      { id: 'a', title: 'Black', status: 'active', metadata: { ean: '1111111111111' }, variants: [] },
      { id: 'b', title: 'White', status: 'active', metadata: { ean: '2222222222222' }, variants: [] },
    ]
    const plan = buildCombineAsVariantsPlan({ parentId: 'a', products })
    assert.equal(plan.ok, true)
    assert.ok(plan.source_ids_to_archive.includes('b'))
  })
})
