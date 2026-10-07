'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeListingStatus, gateListingStatus, LIVE_LISTING_STATUSES } = require('./listing-status')

test('product vocabulary is stored as the offer status the shop reads', () => {
  assert.equal(normalizeListingStatus('published'), 'active')
  assert.equal(normalizeListingStatus(' Published '), 'active')
  assert.equal(normalizeListingStatus('draft'), 'draft')
  assert.equal(normalizeListingStatus(''), null)
  assert.equal(normalizeListingStatus(undefined), null)
  assert.ok(LIVE_LISTING_STATUSES.includes('published')) // legacy rows still readable
})

test('an offer without a positive price stays draft', () => {
  assert.equal(gateListingStatus('published', 1999), 'active')
  assert.equal(gateListingStatus('active', 0), 'draft')
  assert.equal(gateListingStatus('published', null), 'draft')
  assert.equal(gateListingStatus('draft', 0), 'draft')
  assert.equal(gateListingStatus('archived', 0), 'archived')
})
