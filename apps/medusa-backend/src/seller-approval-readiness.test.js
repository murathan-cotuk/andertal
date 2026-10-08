'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { approvalReadiness, isSellingStatus } = require('./seller-approval-readiness')

const complete = {
  agreement_accepted: true,
  company_name: 'Muster GmbH',
  business_address: { street: 'Hauptstr. 1', zip: '10115', city: 'Berlin', country: 'DE' },
  vat_id: 'DE123456789',
  vat_id_vies_valid: true,
  lucid_number: 'DE1234567890123',
  stripe_account_id: 'acct_1',
}

test('complete seller is ready without warnings', () => {
  assert.deepEqual(approvalReadiness(complete), { ready: true, blockers: [], warnings: [] })
})

test('missing legal basics block approval', () => {
  const r = approvalReadiness({ agreement_accepted: false, business_address: '{"city":"Berlin"}' })
  assert.equal(r.ready, false)
  assert.deepEqual(r.blockers, ['agreement_not_accepted', 'legal_name_missing', 'business_address_missing', 'tax_number_missing', 'lucid_number_missing'])
})

test('payout account / DAC7 / VIES are warnings only', () => {
  const r = approvalReadiness({ ...complete, stripe_account_id: null, vat_id_vies_valid: null, legal_entity_type: 'individual' })
  assert.equal(r.ready, true)
  assert.deepEqual(r.warnings, ['payout_account_missing', 'dac7_birth_date_missing', 'vat_id_not_vies_valid'])
})

test('only approved / active sellers sell', () => {
  assert.equal(isSellingStatus('Approved'), true)
  assert.equal(isSellingStatus('registered'), false)
  assert.equal(isSellingStatus('suspended'), false)
})
