'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { computeShippingBySeller, resolveShippingQuoteCents, shippingBySellerMap } = require('./shipping-quote')

const groups = [
  { id: 'G-A', prices: { DE: 495, AT: 895 } },
  { id: 'g-b', prices: { de: 390 } },
  { id: 'G-BULKY', prices: { DE: 1990 } },
]
const line = (seller_id, cents, shipping_group_id, quantity = 1) => ({ seller_id, unit_price_cents: cents, quantity, shipping_group_id })

describe('computeShippingBySeller', () => {
  it('threshold only counts the seller\'s own items (40 € + 10 € from another seller ≠ free)', () => {
    const q = computeShippingBySeller({
      items: [line('A', 4000, 'G-A'), line('B', 1000, 'G-B')],
      groups,
      thresholdsBySeller: { A: { DE: 5000 }, B: null },
      country: 'DE',
    })
    assert.equal(q.totalCents, 495 + 390)
    assert.deepEqual(shippingBySellerMap(q), { A: 495, B: 390 })
  })

  it('seller over their own threshold ships free, the other seller still charges', () => {
    const q = computeShippingBySeller({
      items: [line('A', 2500, 'G-A', 2), line('B', 1000, 'G-B')],
      groups,
      thresholdsBySeller: { A: { DE: 5000 }, B: { DE: 5000 } },
      country: 'DE',
    })
    assert.deepEqual(shippingBySellerMap(q), { A: 0, B: 390 })
    assert.equal(q.totalCents, 390)
  })

  it('threshold is per country — a DE rule never applies to AT', () => {
    const q = computeShippingBySeller({
      items: [line('A', 9000, 'G-A')],
      groups,
      thresholdsBySeller: { A: { DE: 5000 } },
      country: 'AT',
    })
    assert.equal(q.totalCents, 895)
    assert.equal(q.sellers[0].free, false)
  })

  it('most expensive group wins within one seller; no group → 0', () => {
    const q = computeShippingBySeller({
      items: [line('A', 1000, 'G-A'), line('A', 1000, 'G-BULKY'), line('C', 1000, null)],
      groups,
      thresholdsBySeller: {},
      country: 'de',
    })
    assert.deepEqual(shippingBySellerMap(q), { A: 1990, C: 0 })
  })
})

describe('resolveShippingQuoteCents', () => {
  it('country, then DE, then cheapest', () => {
    assert.equal(resolveShippingQuoteCents({ DE: 495, AT: 895 }, 'AT'), 895)
    assert.equal(resolveShippingQuoteCents({ DE: 495, AT: 895 }, 'FR'), 495)
    assert.equal(resolveShippingQuoteCents({ AT: 895, CH: 1200 }, 'FR'), 895)
    assert.equal(resolveShippingQuoteCents({}, 'DE'), null)
  })
})
