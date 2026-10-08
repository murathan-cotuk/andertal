'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { computeLabelRates, normalizeWeightKg } = require('./label-pricing')

const methods = [
  { id: 1, name: 'DHL Paket 0-5kg', carrier: 'dhl', min_weight: '0.001', max_weight: '5', countries: [{ iso_2: 'DE', price: 4.0, lead_time_hours: 24 }, { iso_2: 'AT', price: 9.5 }] },
  { id: 2, name: 'DHL Paket 5-10kg', carrier: 'dhl', min_weight: '5.001', max_weight: '10', countries: [{ iso_2: 'DE', price: 6.0 }] },
  { id: 3, name: 'UPS Standard', carrier: 'ups', countries: [{ iso_2: 'DE', price: 3.0 }] },
]

test('server-side label price: DHL only, weight bracket, destination, markup', () => {
  const de = computeLabelRates(methods, { toCountry: 'de', weightKg: 2, markupPct: 5 })
  assert.deepEqual(de.map((r) => [r.service_id, r.price_eur]), [[1, 4.2]])
  assert.equal(de[0].delivery_days, 'Lieferung am nächsten Werktag')
  assert.deepEqual(computeLabelRates(methods, { toCountry: 'DE', weightKg: 7 }).map((r) => r.service_id), [2])
  assert.deepEqual(computeLabelRates(methods, { toCountry: 'AT', weightKg: 1, markupPct: 10 }).map((r) => r.price_eur), [10.45])
  assert.deepEqual(computeLabelRates(methods, { toCountry: 'FR', weightKg: 1 }), [])
})

test('weight normalisation matches the rates request', () => {
  assert.equal(normalizeWeightKg(undefined), 1)
  assert.equal(normalizeWeightKg('2.3456'), 2.346)
})
