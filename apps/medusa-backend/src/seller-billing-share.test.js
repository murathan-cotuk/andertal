'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { allocateSellerShareOfOrder, sellerPeriodPayoutCents, applySellerPeriodLiveFields } = require('./seller-billing')

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

describe('sellerPeriodPayoutCents', () => {
  it('merchandise minus commission, plus unlabeled customer shipping', () => {
    assert.equal(sellerPeriodPayoutCents({
      grossCents: 10000,
      commissionCents: 1200,
      shippingPayoutCents: 800,
      labelBalanceCents: 0,
    }), 9600)
  })

  it('platform label: withhold customer shipping and do not also deduct the same 8€', () => {
    // 8€ customer shipping withheld, label already covered → payout is ware − provision, not −16
    assert.equal(sellerPeriodPayoutCents({
      grossCents: 10000,
      commissionCents: 1200,
      shippingPayoutCents: 0,
      labelBalanceCents: 0,
    }), 8800)
  })

  it('deducts only the label remainder above withheld shipping', () => {
    assert.equal(sellerPeriodPayoutCents({
      grossCents: 10000,
      commissionCents: 1200,
      shippingPayoutCents: 0,
      labelBalanceCents: 400,
    }), 8400)
  })
})

describe('applySellerPeriodLiveFields', () => {
  it('writes shipping as customer amount and payout after label withhold', () => {
    const payout = {}
    applySellerPeriodLiveFields(payout, {
      grossCents: 10000,
      commissionCents: 1200,
      shippingCents: 800,
      shippingPayoutCents: 0,
      labelBalanceCents: 0,
      labelCents: 800,
      bonusFundingCents: 0,
      customerPaidCents: 10800,
      refundCents: 0,
      orderCount: 1,
    }, 0.12)
    assert.equal(payout.shipping_cents, 800)
    assert.equal(payout.label_cents, 800)
    assert.equal(payout.payout_cents, 8800)
    assert.equal(payout.commission_cents, 1200)
  })
})
