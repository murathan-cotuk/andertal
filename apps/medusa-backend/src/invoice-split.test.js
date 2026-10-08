'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { splitOrderForInvoices, allocate } = require('./invoice-split')

const items = [
  { id: 'a1', seller_id: 's_a', unit_price_cents: 3000, quantity: 1 },
  { id: 'b1', seller_id: 's_b', unit_price_cents: 1000, quantity: 1 },
  { id: 'a2', seller_id: 's_a', unit_price_cents: 1000, quantity: 2 },
]

test('single-seller order is returned unchanged', () => {
  const row = { subtotal_cents: 1000, shipping_cents: 490 }
  const parts = splitOrderForInvoices(row, [items[1]])
  assert.equal(parts.length, 1)
  assert.equal(parts[0].row, row)
})

test('multi-seller: own lines + own shipping; bonus split by share; sums equal the order', () => {
  const row = { subtotal_cents: 6000, shipping_cents: 880, shipping_by_seller: '{"s_a":490,"s_b":390}', discount_cents: 600, coupon_discount_cents: 0, bonus_points_redeemed: 600, total_cents: 6280 }
  const parts = splitOrderForInvoices(row, items)
  assert.deepEqual(parts.map((p) => p.sellerId), ['s_a', 's_b'])
  assert.deepEqual(parts.map((p) => p.items.map((i) => i.id)), [['a1', 'a2'], ['b1']])
  assert.deepEqual(parts.map((p) => p.row.subtotal_cents), [5000, 1000])
  assert.deepEqual(parts.map((p) => p.row.shipping_cents), [490, 390])
  assert.deepEqual(parts.map((p) => p.row.discount_cents), [500, 100])
  assert.equal(parts.reduce((a, p) => a + p.row.total_cents, 0), 6280)
})

test('seller-specific coupon stays with its seller', () => {
  const row = { subtotal_cents: 6000, shipping_cents: 0, discount_cents: 300, coupon_discount_cents: 300, coupon_code: 'B10', total_cents: 5700 }
  const parts = splitOrderForInvoices(row, items, { couponSellerId: 's_b' })
  assert.deepEqual(parts.map((p) => p.row.coupon_discount_cents), [0, 300])
  assert.deepEqual(parts.map((p) => p.row.coupon_code), [null, 'B10'])
})

test('allocation is exact', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [33, 33, 34])
  assert.deepEqual(allocate(0, [1, 2]), [0, 0])
})
