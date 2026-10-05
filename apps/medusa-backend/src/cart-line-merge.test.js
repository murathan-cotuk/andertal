'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { cartLineUnitKey, cartLineSellerKeyFor } = require('./routes/store-checkout')

const product = {
  id: 'p1',
  variants: [
    { id: 'var-a', ean: '4006381333931' },
    { id: 'var-b', ean: '4006381333948' },
  ],
}

describe('cartLineUnitKey', () => {
  it('maps every id format of the same variant to one key', () => {
    const keys = ['var-a', 'p1-variant-0', 'p1-v-0', 'p1-ean-4006381333931'].map((id) => cartLineUnitKey(product, id))
    assert.deepEqual(new Set(keys), new Set(['i:0']))
  })

  it('keeps different variants apart', () => {
    assert.notEqual(cartLineUnitKey(product, 'var-a'), cartLineUnitKey(product, 'var-b'))
  })

  it('product without variants is one unit', () => {
    const single = { id: 'p2', variants: [] }
    assert.equal(cartLineUnitKey(single, 'p2'), cartLineUnitKey(single, 'p2-variant'))
  })
})

describe('cartLineSellerKeyFor', () => {
  it('treats null / empty / default as the product owner', () => {
    assert.equal(cartLineSellerKeyFor(null, 'seller-x'), 'seller-x')
    assert.equal(cartLineSellerKeyFor('', 'seller-x'), 'seller-x')
    assert.equal(cartLineSellerKeyFor('default', 'seller-x'), 'seller-x')
    assert.equal(cartLineSellerKeyFor('seller-x', 'seller-x'), 'seller-x')
  })

  it('another seller (buybox) stays a separate line', () => {
    assert.notEqual(cartLineSellerKeyFor('seller-y', 'seller-x'), cartLineSellerKeyFor(null, 'seller-x'))
  })
})
