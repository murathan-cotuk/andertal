'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { applySellerShipmentView } = require('./seller-order-view')

const header = { id: 'o1', delivery_status: 'versendet', tracking_number: 'A-111', carrier_name: 'DHL', sendcloud_label_url: 'https://label/a', shipped_at: 't1' }

test('multi-seller order: seller B sees its own (not yet shipped) parcel, not seller A\'s', () => {
  const v = applySellerShipmentView(header, null, { multiSeller: true })
  assert.equal(v.delivery_status, 'offen')
  assert.equal(v.tracking_number, null)
  assert.equal(v.sendcloud_label_url, null)
  const own = applySellerShipmentView(header, { delivery_status: 'versendet', tracking_number: 'B-222', carrier_name: 'DHL', label_url: 'https://label/b' }, { multiSeller: true })
  assert.deepEqual([own.tracking_number, own.sendcloud_label_url], ['B-222', 'https://label/b'])
})

test('single-seller order keeps the order header', () => {
  assert.equal(applySellerShipmentView(header, null, { multiSeller: false }), header)
})
