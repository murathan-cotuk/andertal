'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { allocateSellerShareOfOrder } = require('./seller-billing')

describe('allocateSellerShareOfOrder', () => {
  it('full order: customer paid includes shipping; merchandise separate', () => {
    const row = {
      subtotal_cents: 9484,
      shipping_cents: 5420,
      discount_cents: 0,
      total_cents: 14904,
      platform_bonus_funding_cents: 0,
    }
    const share = allocateSellerShareOfOrder(row, 9484)
    assert.equal(share.shippingCents, 5420)
    assert.equal(share.customerPaidCents, 14904)
    assert.equal(share.bonusFundingCents, 0)
    assert.equal(9484 + share.shippingCents, share.customerPaidCents)
  })

  it('prorates shared multi-seller order by merchandise share', () => {
    const row = {
      subtotal_cents: 10000,
      shipping_cents: 500,
      discount_cents: 0,
      total_cents: 10500,
      platform_bonus_funding_cents: 1000,
    }
    const share = allocateSellerShareOfOrder(row, 4000)
    assert.equal(share.shippingCents, 200)
    assert.equal(share.customerPaidCents, 4200)
    assert.equal(share.bonusFundingCents, 400)
  })

  it('zero merchandise → zero share', () => {
    const row = { subtotal_cents: 10000, shipping_cents: 500, total_cents: 10500, platform_bonus_funding_cents: 0 }
    const share = allocateSellerShareOfOrder(row, 0)
    assert.deepEqual(share, { shippingCents: 0, customerPaidCents: 0, bonusFundingCents: 0 })
  })
})
