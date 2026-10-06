'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const m = require('./money')

test('allocateProportional sums exactly and never mints cents', () => {
  assert.deepEqual(m.allocateProportional(100, [1, 1, 1]), [34, 33, 33])
  assert.deepEqual(m.allocateProportional(-100, [1, 1, 1]), [-34, -33, -33])
  assert.deepEqual(m.allocateProportional(5, [0, 0]), [0, 0])
  for (const total of [1, 7, 999, 12345]) {
    const parts = m.allocateProportional(total, [3, 5, 11, 0, 2])
    assert.equal(parts.reduce((a, b) => a + b, 0), total)
  }
})

test('commission + proportional reversal (Vertrag §12)', () => {
  assert.equal(m.commissionCents(10000, 0.12), 1200)
  assert.throws(() => m.commissionCents(100, -1))
  const p = { gross_cents: 10000, commission_cents: 1200, refunded_gross_cents: 0, refund_commission_reversal_cents: 0 }
  assert.equal(m.commissionReversalCents(p, 4000), 480)
  // last refund reverses exactly the rest even with rounding
  const q = { gross_cents: 999, commission_cents: 120, refunded_gross_cents: 333, refund_commission_reversal_cents: 40 }
  assert.equal(m.commissionReversalCents(q, 666), 80)
})

test('allocateRefund rejects over-refunds', () => {
  const ps = [{ id: 'p1', kind: 'item', order_item_id: 'i1', seller_id: 's', quantity: 2, gross_cents: 5000, commission_cents: 600, refunded_gross_cents: 0, refunded_shipping_cents: 0, refund_commission_reversal_cents: 0, refunded_quantity: 0, shipping_cents: 0 }]
  assert.throws(() => m.allocateRefund(ps, { lines: [{ order_item_id: 'i1', quantity: 3 }] }), /exceeds/)
  assert.throws(() => m.allocateRefund(ps, { amountCents: 6000 }), /exceeds/)
  const a = m.allocateRefund(ps, { lines: [{ order_item_id: 'i1', quantity: 1 }, { order_item_id: 'i1', quantity: 1 }] })
  assert.deepEqual(a.map((l) => [l.gross_cents, l.commission_reversal_cents]), [[2500, 300], [2500, 300]])
})

test('eligibility: 14 days after confirmed delivery, blocked by any open issue', () => {
  const p = { status: 'pending', gross_cents: 100, shipping_cents: 0, refunded_gross_cents: 0, refunded_shipping_cents: 0 }
  const base = { paymentOk: true, deliveryConfirmedAt: new Date(Date.now() - 15 * 86400000) }
  assert.equal(m.evaluateEligibility(p, base).status, 'eligible')
  assert.equal(m.evaluateEligibility(p, { ...base, deliveryConfirmedAt: new Date(Date.now() - 13 * 86400000) }).status, 'pending')
  assert.equal(m.evaluateEligibility(p, { ...base, deliveryConfirmedAt: null }).status, 'pending')
  for (const k of ['openDispute', 'openReturn', 'pendingRefund', 'sellerPayoutBlocked', 'sellerComplianceBlocked']) {
    assert.equal(m.evaluateEligibility(p, { ...base, [k]: true }).status, 'blocked', k)
  }
  assert.equal(m.evaluateEligibility(p, { ...base, paymentOk: false }).status, 'blocked')
  assert.equal(m.evaluateEligibility(p, { ...base, lostDispute: true }).status, 'charged_back')
})
