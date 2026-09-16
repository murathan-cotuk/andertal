'use strict'
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const {
  resolveSellerCommissionRate,
  sellerCommissionRatePct,
  displayCommissionRatePct,
} = require('./commission-rate')

describe('resolveSellerCommissionRate', () => {
  test('missing uses platform default 12 %', () => {
    assert.equal(resolveSellerCommissionRate(null), 0.12)
    assert.equal(resolveSellerCommissionRate(undefined), 0.12)
    assert.equal(resolveSellerCommissionRate(''), 0.12)
  })

  test('keeps seller-specific fractions including 0 %', () => {
    assert.equal(resolveSellerCommissionRate(0), 0)
    assert.equal(resolveSellerCommissionRate(0.10), 0.10)
    assert.equal(resolveSellerCommissionRate(0.15), 0.15)
  })

  test('accepts percent-style 15 as 0.15', () => {
    assert.equal(resolveSellerCommissionRate(15), 0.15)
  })
})

describe('sellerCommissionRatePct', () => {
  test('prints the contracted rate not a hardcoded 12', () => {
    assert.equal(sellerCommissionRatePct(0.15), 15)
    assert.equal(sellerCommissionRatePct(0.10), 10)
    assert.equal(sellerCommissionRatePct(0.105), 10.5)
    assert.equal(sellerCommissionRatePct(0), 0)
  })
})

describe('displayCommissionRatePct', () => {
  test('0 % stays 0; invalid falls back to 12', () => {
    assert.equal(displayCommissionRatePct(0), 0)
    assert.equal(displayCommissionRatePct(15), 15)
    assert.equal(displayCommissionRatePct(NaN), 12)
  })
})
