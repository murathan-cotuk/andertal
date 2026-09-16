'use strict'
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const {
  commissionInclVatCents,
  summarizeLedgerEntries,
  classifyAdjustmentType,
} = require('./seller-ledger')

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

describe('summarizeLedgerEntries', () => {
  test('splits each kalem and ignores payouts in net', () => {
    const t = summarizeLedgerEntries([
      { type: 'order_received', order_id: 'a', amount_cents: 5000 },
      { type: 'shipping_customer', amount_cents: 800 },
      { type: 'commission', amount_cents: -714 },
      { type: 'shipping_label', amount_cents: -800 },
      { type: 'refund', amount_cents: -1000 },
      { type: 'advertising', amount_cents: -250 },
      { type: 'payout', amount_cents: -3036 },
    ])
    assert.equal(t.merchandise_cents, 5000)
    assert.equal(t.shipping_customer_cents, 800)
    assert.equal(t.commission_cents, 714)
    assert.equal(t.commission_vat_cents || 0, 0)
    assert.equal(t.shipping_label_cents, 800)
    assert.equal(t.refunds_cents, 1000)
    assert.equal(t.advertising_cents, 250)
    assert.equal(t.payouts_cents, 3036)
    assert.equal(t.order_count, 1)
    assert.equal(t.net_cents, 5000 + 800 - 714 - 800 - 1000 - 250)
  })

  test('splits commission net and VAT, VAT does not hit payout net', () => {
    const t = summarizeLedgerEntries([
      { type: 'commission', amount_cents: -516 },
      { type: 'commission_vat', amount_cents: -98, affects_balance: false },
    ])
    assert.equal(t.commission_cents, 516)
    assert.equal(t.commission_vat_cents, 98)
    assert.equal(t.net_cents, -516)
  })

  test('card-paid label does not hit net', () => {
    const t = summarizeLedgerEntries([
      { type: 'shipping_customer', amount_cents: 800 },
      { type: 'shipping_label', amount_cents: -800, affects_balance: false },
    ])
    assert.equal(t.shipping_label_cents, 800)
    assert.equal(t.net_cents, 800)
  })
})

describe('classifyAdjustmentType', () => {
  test('return shipping by description_key', () => {
    assert.equal(
      classifyAdjustmentType({ type: 'shipping_label', description_key: 'return_shipping_label', amount_cents: -490 }),
      'return_shipping',
    )
  })

  test('outbound label stays shipping_label even if a return exists on the order', () => {
    assert.equal(
      classifyAdjustmentType({ type: 'shipping_label', description_key: 'shipping_label_for_order', order_id: 'ord-1', amount_cents: -490 }),
      'shipping_label',
    )
  })
})
