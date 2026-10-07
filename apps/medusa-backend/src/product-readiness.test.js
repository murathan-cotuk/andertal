'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { listingReadinessMissing, applyListingReadinessGate } = require('./product-readiness')

const complete = {
  title: 'T-Shirt',
  priceCents: 1999,
  metadata: { media: ['https://x/a.jpg'], category_ids: ['c1'] },
  variants: [],
}

test('a complete product has nothing missing', () => {
  assert.deepEqual(listingReadinessMissing(complete), [])
})

test('missing title, price, image and category are reported', () => {
  assert.deepEqual(listingReadinessMissing({ title: 'Untitled', priceCents: 0, metadata: {}, variants: [] }), ['title', 'price', 'image', 'category'])
})

test('prices and images may come from variants (all formats used in the catalog)', () => {
  const v = (extra) => ({ option_values: ['Red'], ...extra })
  const base = { title: 'X', priceCents: 0, metadata: { category_ids: ['c'] } }
  assert.deepEqual(listingReadinessMissing({ ...base, variants: [v({ price_cents: 500, image_url: 'a.jpg' })] }), [])
  assert.deepEqual(listingReadinessMissing({ ...base, variants: [v({ metadata: { prices: { DE: { brutto_cents: 999 } }, media: ['m.jpg'] } })] }), [])
  assert.deepEqual(listingReadinessMissing({ ...base, variants: [v({ price_cents: 500, image_urls: { en: 'e.jpg' } })] }), [])
  // one unpriced variant without a parent price is not sellable
  assert.deepEqual(listingReadinessMissing({ ...base, variants: [v({ price_cents: 500, image_url: 'a.jpg' }), v({})] }), ['price'])
  // parent DE price covers unpriced variants
  assert.deepEqual(listingReadinessMissing({ ...base, metadata: { ...base.metadata, prices: { DE: { brutto_cents: 999 } } }, variants: [v({ image_url: 'a.jpg' })] }), [])
})

test('publishing an incomplete product keeps it a draft', () => {
  const r = applyListingReadinessGate({ ...complete, status: 'published', metadata: {} })
  assert.equal(r.status, 'draft')
  assert.deepEqual(r.missing, ['image', 'category'])
  assert.match(r.message, /missing: image, category/)
})

test('already-live products are never taken offline, drafts are untouched', () => {
  const incomplete = { title: 'X', priceCents: 0, metadata: {}, variants: [] }
  assert.equal(applyListingReadinessGate({ ...incomplete, status: 'published', previousStatus: 'published' }).status, 'published')
  assert.equal(applyListingReadinessGate({ ...incomplete, status: 'published', previousStatus: 'active' }).status, 'published')
  assert.equal(applyListingReadinessGate({ ...incomplete, status: 'draft' }).message, null)
  assert.equal(applyListingReadinessGate({ ...incomplete, status: 'published', previousStatus: 'draft' }).status, 'draft')
})
