'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { withdrawalDeadline, deliveryInstant, returnPeriodDays, remainingReturnable, buildReturnWindow } = require('./withdrawal')
const { planReturnRefund } = require('./settlement/return-refund')

const TZ = 'Europe/Berlin'

test('deadline = end of the 14th day after delivery, Berlin time (summer, CEST)', () => {
  // Delivered 2026-06-01 18:30 Berlin (16:30 UTC) → last day 2026-06-15, ends 23:59:59.999 CEST.
  const d = withdrawalDeadline(new Date('2026-06-01T16:30:00Z'), 14, TZ)
  assert.equal(d.toISOString(), '2026-06-15T21:59:59.999Z')
})

test('deadline across the DST change and in winter (CET)', () => {
  // Delivered 2026-10-20 → last day 2026-11-03 (after the switch to CET on 25 Oct).
  assert.equal(withdrawalDeadline(new Date('2026-10-20T09:00:00Z'), 14, TZ).toISOString(), '2026-11-03T22:59:59.999Z')
  // Delivered late evening UTC that is already the next day in Berlin.
  assert.equal(withdrawalDeadline(new Date('2026-12-01T23:30:00Z'), 14, TZ).toISOString(), '2026-12-16T22:59:59.999Z')
})

test('a longer promised period wins; never below 14 days', () => {
  assert.equal(returnPeriodDays([{ return_days: 30 }, { return_days: 14 }]), 30)
  assert.equal(returnPeriodDays([{ return_days: 7 }]), 14)
  assert.equal(returnPeriodDays([{}, { return_days: 'x' }]), 14)
  assert.equal(withdrawalDeadline(new Date('2026-06-01T10:00:00Z'), 7, TZ).toISOString(), '2026-06-15T21:59:59.999Z')
  assert.equal(withdrawalDeadline(new Date('2026-06-01T10:00:00Z'), 30, TZ).toISOString(), '2026-07-01T21:59:59.999Z')
})

test('delivery instant uses the latest known date; none → no deadline', () => {
  assert.equal(deliveryInstant({}), null)
  assert.equal(deliveryInstant({ delivery_date: '2026-06-01T10:00:00Z', delivery_confirmed_at: '2026-06-03T10:00:00Z' }).toISOString(), '2026-06-03T10:00:00.000Z')
  assert.equal(withdrawalDeadline(null), null)
})

test('only quantities in non-rejected returns are used up', () => {
  const items = [{ id: 'a', quantity: 3 }, { id: 'b', quantity: 1 }]
  const left = remainingReturnable(items, [
    { status: 'offen', items: [{ order_item_id: 'a', quantity: 1 }] },
    { status: 'abgelehnt', items: JSON.stringify([{ order_item_id: 'b', quantity: 1 }]) },
    { status: 'abgeschlossen', items: [{ order_item_id: 'a', quantity: 1 }] },
  ])
  assert.equal(left.get('a'), 1)
  assert.equal(left.get('b'), 1)
})

test('return window for the shop', () => {
  const w = buildReturnWindow({
    order: { delivery_date: '2026-06-01T10:00:00Z' },
    items: [{ id: 'a', quantity: 2, product_id: 'p1' }],
    returns: [{ status: 'offen', items: [{ order_item_id: 'a', quantity: 2 }] }],
    returnDaysByProduct: new Map([['p1', 30]]),
    now: new Date('2026-06-20T10:00:00Z'),
  })
  assert.equal(w.days, 30)
  assert.equal(w.open, true)
  assert.equal(w.remaining_total, 0)
  const before = buildReturnWindow({ order: {}, items: [{ id: 'a', quantity: 1 }], returns: [] })
  assert.equal(before.deadline, null)
  assert.equal(before.open, true)
})

// Payables of one order: seller A (2 items + shipping 490), seller B (1 item + shipping 390).
const payables = [
  { id: 'pa1', kind: 'item', seller_id: 'A', order_item_id: 'i1', quantity: 2, gross_cents: 4000, commission_cents: 400, commission_vat_cents: 76, refunded_gross_cents: 0, refunded_quantity: 0, refunded_shipping_cents: 0, refund_commission_reversal_cents: 0, refund_commission_vat_reversal_cents: 0, shipping_cents: 0 },
  { id: 'pa2', kind: 'item', seller_id: 'A', order_item_id: 'i2', quantity: 1, gross_cents: 1500, commission_cents: 150, commission_vat_cents: 28, refunded_gross_cents: 0, refunded_quantity: 0, refunded_shipping_cents: 0, refund_commission_reversal_cents: 0, refund_commission_vat_reversal_cents: 0, shipping_cents: 0 },
  { id: 'pas', kind: 'shipping', seller_id: 'A', order_item_id: null, quantity: 0, gross_cents: 0, shipping_cents: 490, commission_cents: 0, commission_vat_cents: 0, refunded_gross_cents: 0, refunded_quantity: 0, refunded_shipping_cents: 0, refund_commission_reversal_cents: 0, refund_commission_vat_reversal_cents: 0 },
  { id: 'pb1', kind: 'item', seller_id: 'B', order_item_id: 'i3', quantity: 1, gross_cents: 2000, commission_cents: 200, commission_vat_cents: 38, refunded_gross_cents: 0, refunded_quantity: 0, refunded_shipping_cents: 0, refund_commission_reversal_cents: 0, refund_commission_vat_reversal_cents: 0, shipping_cents: 0 },
  { id: 'pbs', kind: 'shipping', seller_id: 'B', order_item_id: null, quantity: 0, gross_cents: 0, shipping_cents: 390, commission_cents: 0, commission_vat_cents: 0, refunded_gross_cents: 0, refunded_quantity: 0, refunded_shipping_cents: 0, refund_commission_reversal_cents: 0, refund_commission_vat_reversal_cents: 0 },
]

test('partial return: goods only, shipping stays with the seller', () => {
  const p = planReturnRefund(payables, { lines: [{ order_item_id: 'i1', quantity: 1 }] })
  assert.equal(p.goods_cents, 2000)
  assert.equal(p.shipping_cents, 0)
  assert.deepEqual(p.shipping_seller_ids, [])
})

test("return completing a seller's part adds that seller's outbound shipping (§357 Abs. 2 BGB)", () => {
  const p = planReturnRefund(payables, { lines: [{ order_item_id: 'i1', quantity: 2 }, { order_item_id: 'i2', quantity: 1 }] })
  assert.equal(p.goods_cents, 5500)
  assert.equal(p.shipping_cents, 490)
  assert.equal(p.amount_cents, 5990)
  assert.deepEqual(p.shipping_seller_ids, ['A'])
})

test('earlier refunds count toward completion; platform discounts scale the amount', () => {
  const after = payables.map((p) => (p.id === 'pa1' ? { ...p, refunded_quantity: 2, refunded_gross_cents: 4000 } : p))
  const p = planReturnRefund(after, { lines: [{ order_item_id: 'i2', quantity: 1 }] })
  assert.equal(p.amount_cents, 1500 + 490)
  // credited 8380, customer paid 7380 (1000 platform-funded coupon) → ratio 7380 / 8380
  const d = planReturnRefund(payables, { lines: [{ order_item_id: 'i3', quantity: 1 }], paymentGrossCents: 7380 })
  assert.equal(d.amount_cents, Math.round((2000 + 390) * 7380 / 8380))
})
