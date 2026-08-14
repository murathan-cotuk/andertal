'use strict'
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { commissionInclVatCents } = require('./seller-ledger')

describe('commissionInclVatCents', () => {
  test('12% of 4299c + 19% USt', () => {
    const net = Math.round(4299 * 0.12)
    const { vat, total } = commissionInclVatCents(net, 19)
    assert.equal(net, 516)
    assert.equal(vat, 98)
    assert.equal(total, 614)
  })

  test('empty vat percent still charges 0 extra, not NaN', () => {
    const r = commissionInclVatCents(1200, 0)
    assert.equal(r.net, 1200)
    assert.equal(r.vat, 0)
    assert.equal(r.total, 1200)
  })
})
