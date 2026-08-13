'use strict'
/**
 * BonusPunkte.md §3.11 — pure-function tests for the platform-funded bonus points settlement math.
 * No live DB / Stripe / HTTP. Run: `node --test src/bonus-settlement.test.js` (from apps/medusa-backend).
 *
 * Reference (never contradict): 50 Bonuspunkte = 1 €.
 *   discountCentsFromBonusPoints(points) = floor(points/50*100)
 *   bonusPointsEarnedFromOrderPaidCents(paidCents) = ceil(paidCents/100)
 * §2 acceptance case: subtotal 5000c, bonus 50pt/100c, paid 4900c, earn 49pt,
 * commission 600c, seller_net 4400c (NOT the ChatGPT-draft 4500c), platform funding 100c.
 */
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const {
  buildOrderSettlementBreakdown,
  bonusPointsEarnedFromOrderPaidCents,
  computeCartCheckoutMoney,
  discountCentsFromBonusPoints,
  clampCartBonusRedemption,
} = require('./routes/store-checkout')
const { getGoodsVatRatePercent, splitInclusiveVat } = require('./goods-vat')

describe('1-4. §2 acceptance scenarios — earn/redeem/commission/seller-net', () => {
  test('1. 100€ paid, no bonus redeemed → 100 pts earned, 12% commission = 12€, seller net 88€', () => {
    const row = { subtotal_cents: 10000, shipping_cents: 0, discount_cents: 0, total_cents: 10000 }
    const b = buildOrderSettlementBreakdown(row, 0.12)
    assert.equal(b.customer_paid_cents, 10000)
    assert.equal(b.platform_commission_cents, 1200)
    assert.equal(b.seller_net_merchandise_cents, 8800)
    assert.equal(bonusPointsEarnedFromOrderPaidCents(b.customer_paid_cents), 100)
  })

  test('2. 50€ merch, 50pt(=1€) bonus redeemed → paid 49€, earn 49pt, funding 1€, commission 6€, seller net 44€ — 45€ is the bug this doc corrects', () => {
    const bonusDiscountCents = discountCentsFromBonusPoints(50)
    assert.equal(bonusDiscountCents, 100)
    const row = { subtotal_cents: 5000, shipping_cents: 0, discount_cents: bonusDiscountCents, coupon_discount_cents: 0, total_cents: 4900 }
    const b = buildOrderSettlementBreakdown(row, 0.12)
    assert.equal(b.customer_paid_cents, 4900)
    assert.equal(bonusPointsEarnedFromOrderPaidCents(b.customer_paid_cents), 49)
    assert.equal(b.platform_bonus_funding_cents, 100)
    assert.equal(b.platform_commission_cents, 600)
    assert.equal(b.seller_net_merchandise_cents, 4400)
    assert.notEqual(b.seller_net_merchandise_cents, 4500)
  })

  test('3. 25€ paid → 25 pts earned', () => {
    assert.equal(bonusPointsEarnedFromOrderPaidCents(2500), 25)
  })

  test('4. 0,01€ paid → ceil policy rounds up to 1 pt (not 0)', () => {
    assert.equal(bonusPointsEarnedFromOrderPaidCents(1), 1)
  })
})

describe('5-6. Refund reversal ratio (mirrors returns.js refundRatio logic)', () => {
  const refundRatio = (refundCents, orderPaidTotalCents) =>
    orderPaidTotalCents > 0 ? Math.min(1, refundCents / orderPaidTotalCents) : 0

  test('5. Partial refund: 50% of the paid amount refunded → 50% of earn/redeem reversed', () => {
    const ratio = refundRatio(2450, 4900)
    assert.equal(ratio, 0.5)
    assert.equal(Math.round(49 * ratio), 25)
    assert.equal(Math.round(50 * ratio), 25)
  })

  test('6. Full refund: ratio 1 → earn fully reversed, redeem fully given back, funding closes to 0', () => {
    const ratio = refundRatio(4900, 4900)
    assert.equal(ratio, 1)
    const earnedReversal = Math.round(49 * ratio)
    const pointsGivenBack = Math.round(50 * ratio)
    assert.equal(earnedReversal, 49)
    assert.equal(pointsGivenBack, 50)
    const originalFundingCents = discountCentsFromBonusPoints(50)
    const fundingReversedCents = Math.round(originalFundingCents * ratio)
    assert.equal(originalFundingCents - fundingReversedCents, 0)
  })

  test('refund ratio never exceeds 1 even if refund_cents is stored larger than the order paid (data glitch)', () => {
    assert.equal(refundRatio(6000, 4900), 1)
  })
})

test(
  '7. Double order_earn insert for the same order must not double-credit points',
  { skip: 'DB-level guarantee (idx_bonus_ledger_order_source_unique, server.js) — needs a live Postgres instance, not a pure-function test. Verify manually: two POSTs racing the same order_id+source must yield one ledger row.' },
  () => {},
)

describe('8. Insufficient balance / cart-reservation clamp (clampCartBonusRedemption)', () => {
  test('requesting more points than the balance clamps down to the balance', () => {
    assert.equal(clampCartBonusRedemption(500, 100, 10000), 100)
  })
  test('zero balance → zero redemption regardless of request', () => {
    assert.equal(clampCartBonusRedemption(500, 0, 10000), 0)
  })
  test('cart subtotal below the Stripe minimum charge → forced to 0', () => {
    assert.equal(clampCartBonusRedemption(500, 500, 30), 0)
  })
  test('discount is clamped so the remaining charge never drops below the Stripe minimum (50c)', () => {
    const points = clampCartBonusRedemption(1000, 1000, 60)
    const discountCents = discountCentsFromBonusPoints(points)
    assert.ok(60 - discountCents >= 50)
  })
})

test('9. computeCartCheckoutMoney stays integer cents end to end (no floats)', () => {
  const cart = {
    items: [{ unit_price_cents: 333, quantity: 3 }],
    bonus_points_reserved: 50,
    coupon_discount_cents: 0,
  }
  const m = computeCartCheckoutMoney(cart, 495)
  assert.equal(m.subtotalCents, 999)
  assert.equal(m.bonusDiscountCents, 100)
  assert.equal(m.payTotalCents, 999 - 100 + 495)
  for (const v of Object.values(m)) assert.ok(Number.isInteger(v), `${v} is not an integer`)
})

describe('10. Destination-country goods VAT (goods-vat.js) — rate lookup + split only; net-anchor auto-derivation NOT implemented (§3.10 deferred, see docs/BonusPunkte.md §7)', () => {
  test('DE standard rate is 19%, FR is 20% — not a single hardcoded rate everywhere', () => {
    assert.equal(getGoodsVatRatePercent('DE'), 19)
    assert.equal(getGoodsVatRatePercent('FR'), 20)
  })
  test('50,00€ gross at DE 19% splits to net 42,02€ / VAT 7,98€ (doc §3.10 net-anchor reference value)', () => {
    const s = splitInclusiveVat(5000, 19)
    assert.equal(s.netCents, 4202)
    assert.equal(s.vatCents, 798)
  })
  test('IF the FR gross were 50,42€ (doc example), splitting at FR 20% reproduces the same 42,02€ net', () => {
    const s = splitInclusiveVat(5042, 20)
    assert.equal(s.netCents, 4202)
    assert.equal(s.vatCents, 840)
  })
  test(
    'auto-deriving the FR gross (50,42€) FROM the DE net anchor (42,02€) is not implemented yet',
    { skip: 'Net-anchor price derivation across countries does not exist in code (checkout only reads explicit per-country prices via pickCountryMerchandiseCents, or falls back to DE/EUR). Implementing this touches live checkout pricing — deliberately deferred, see docs/BonusPunkte.md §7.' },
    () => {},
  )
})

test(
  '11. B2B + FR VAT-ID → 0% goods VAT, intra_b2b scheme, excluded from the B2C OSS sheet',
  { skip: 'No customer-VAT-ID / B2B reverse-charge branch exists in goods-vat.js (salesInvoiceVat only checks the SELLER\'s own vat_id) — part of the deferred §3.10 scope, see docs/BonusPunkte.md §7.' },
  () => {},
)
