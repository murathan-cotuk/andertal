'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

function isPaidOrderTx(tx) {
  const type = String(tx?.type || 'order')
  if (type === 'return' || type === 'ledger_adjustment') return false
  return String(tx?.payment_status || '').toLowerCase() === 'bezahlt'
}

function sellerPeriodPayoutCents({ grossCents = 0, commissionCents = 0, shippingPayoutCents = 0, labelBalanceCents = 0 } = {}) {
  return Math.max(0, Math.round(Number(grossCents) || 0) - Math.round(Number(commissionCents) || 0) + Math.round(Number(shippingPayoutCents) || 0) - Math.round(Number(labelBalanceCents) || 0))
}

function customerShippingCents(tx) {
  if (tx?.shipping_customer_cents != null) return Number(tx.shipping_customer_cents || 0)
  return Number(tx?.shipping_cents || 0)
}

function platformShippingCents(tx) {
  if (tx?.shipping_platform_cents != null) return Number(tx.shipping_platform_cents || 0)
  return 0
}

function payoutShippingCents(tx) {
  if (tx?.shipping_payout_cents != null) return Number(tx.shipping_payout_cents || 0)
  return customerShippingCents(tx)
}

function summarizeSellerPeriodTransactions(periodTx) {
  const rows = Array.isArray(periodTx) ? periodTx : []
  const orders = rows.filter(isPaidOrderTx)
  const labels = rows.filter((t) => t.type === 'ledger_adjustment' && t.adjustment_type === 'shipping_label' && String(t.charge_method || 'balance') !== 'card')
  const gross = orders.reduce((s, t) => s + Number(t.total_cents || 0), 0)
  const commission = orders.reduce((s, t) => s + Number(t.commission_cents || 0), 0)
  const shippingCustomer = orders.reduce((s, t) => s + customerShippingCents(t), 0)
  const shippingPayout = orders.reduce((s, t) => s + payoutShippingCents(t), 0)
  const shippingPlatformFromOrders = orders.reduce((s, t) => s + platformShippingCents(t), 0)
  const shippingPlatformFromLedger = labels.reduce((s, t) => s + Math.abs(Number(t.total_cents || t.payout_cents || 0)), 0)
  const shippingPlatform = shippingPlatformFromOrders > 0 ? shippingPlatformFromOrders : shippingPlatformFromLedger
  const withheld = Math.max(0, shippingCustomer - shippingPayout)
  const labelBalance = Math.max(0, shippingPlatform - withheld)
  return {
    gross,
    commission,
    shipping: shippingCustomer,
    shippingCustomer,
    shippingPlatform,
    shippingPayout,
    payout: sellerPeriodPayoutCents({ grossCents: gross, commissionCents: commission, shippingPayoutCents: shippingPayout, labelBalanceCents: labelBalance }),
    orderCount: orders.length,
  }
}

describe('summarizeSellerPeriodTransactions', () => {
  it('splits customer vs platform shipping; does not pay platform shipping to the seller', () => {
    const rows = [
      {
        type: 'order',
        payment_status: 'bezahlt',
        total_cents: 5299,
        commission_cents: 636,
        shipping_cents: 800,
        shipping_customer_cents: 800,
        shipping_platform_cents: 800,
        shipping_payout_cents: 0,
      },
      { type: 'ledger_adjustment', adjustment_type: 'shipping_label', charge_method: 'balance', total_cents: -800 },
    ]
    const s = summarizeSellerPeriodTransactions(rows)
    assert.equal(s.gross, 5299)
    assert.equal(s.commission, 636)
    assert.equal(s.shippingCustomer, 800)
    assert.equal(s.shippingPlatform, 800)
    assert.equal(s.shippingPayout, 0)
    assert.equal(s.orderCount, 1)
    assert.equal(s.payout, 4663)
  })

  it('pays unlabeled customer shipping to the seller', () => {
    const rows = [
      {
        type: 'order',
        payment_status: 'bezahlt',
        total_cents: 10000,
        commission_cents: 1200,
        shipping_cents: 500,
        shipping_customer_cents: 500,
        shipping_platform_cents: 0,
        shipping_payout_cents: 500,
      },
    ]
    const s = summarizeSellerPeriodTransactions(rows)
    assert.equal(s.shippingCustomer, 500)
    assert.equal(s.shippingPlatform, 0)
    assert.equal(s.payout, 9300)
  })

  it('ignores unpaid orders and returns in Warenwert', () => {
    const rows = [
      { type: 'order', payment_status: 'bezahlt', total_cents: 1000, commission_cents: 120, shipping_cents: 0, shipping_payout_cents: 0 },
      { type: 'order', payment_status: 'offen', total_cents: 9999, commission_cents: 0, shipping_cents: 0 },
      { type: 'return', payment_status: 'return', total_cents: -500, commission_cents: -60 },
    ]
    const s = summarizeSellerPeriodTransactions(rows)
    assert.equal(s.gross, 1000)
    assert.equal(s.commission, 120)
    assert.equal(s.payout, 880)
  })
})
