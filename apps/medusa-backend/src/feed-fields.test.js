'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { firstImageUrl, unitPricing } = require('./feed-fields')
const { _buildFeedEntry } = require('./routes/google-merchant-feed')

test('image URL from strings, { url } objects, or thumbnail', () => {
  assert.equal(firstImageUrl({ media: ['https://x/a.jpg'] }), 'https://x/a.jpg')
  assert.equal(firstImageUrl({ media: [{ url: 'https://x/b.jpg', type: 'image' }] }), 'https://x/b.jpg')
  assert.equal(firstImageUrl({ media: [], thumbnail: 'https://x/t.jpg' }), 'https://x/t.jpg')
  assert.equal(firstImageUrl({}), null)
})

test('Google unit pricing per PAngV reference units', () => {
  assert.deepEqual(unitPricing({ unit_type: 'ml', unit_value: '750' }), { measure: '750ml', base: '1l' })
  assert.deepEqual(unitPricing({ unit_type: 'g', unit_value: '0,5' }), { measure: '0.5g', base: '1kg' })
  assert.deepEqual(unitPricing({ unit_type: 'stück', unit_value: 12, unit_reference: 1 }), { measure: '12ct', base: '1ct' })
  assert.equal(unitPricing({ unit_type: 'm', unit_value: 2 }), null)
  assert.equal(unitPricing({}), null)
})

test('feed entry no longer turns a { url } image into "[object Object]"', () => {
  const e = _buildFeedEntry({ id: 'p1', title: 'Öl', handle: 'oel', price_cents: 999, inventory: 3, metadata: { media: [{ url: 'https://x/o.jpg' }], unit_type: 'ml', unit_value: 500 } }, 'https://shop')
  assert.equal(e.image, 'https://x/o.jpg')
  assert.deepEqual(e.unitPricing, { measure: '500ml', base: '1l' })
})
