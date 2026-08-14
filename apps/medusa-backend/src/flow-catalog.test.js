'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { canonicalFlowName, flowCategory, keepScore } = require('./flow-catalog')

describe('flow catalog', () => {
  it('names order vs support flows distinctly', () => {
    assert.equal(canonicalFlowName('order_placed', 'seller'), 'Neue Bestellung — Seller')
    assert.equal(canonicalFlowName('seller_support_ticket_sent', 'seller'), 'Seller-Support — Eingangsbestätigung')
    assert.equal(flowCategory('return_requested', 'customer'), 'returns')
    assert.equal(flowCategory('review_request', 'customer'), 'marketing')
    assert.equal(flowCategory('customer_signup', 'customer'), 'customers')
    assert.equal(canonicalFlowName('order_placed', 'customer'), 'Bestellbestätigung — Kunde')
  })

  it('prefers the original active flow over a copy', () => {
    const original = { name: 'Neue Bestellung — Seller', trigger_key: 'order_placed', audience: 'seller', status: 'active', sent_count: 3, step_count: 1 }
    const copy = { name: 'Neue Bestellung — Seller (Kopie)', trigger_key: 'order_placed', audience: 'seller', status: 'active', sent_count: 12, step_count: 1 }
    assert.ok(keepScore(original) > keepScore(copy))
  })
})
