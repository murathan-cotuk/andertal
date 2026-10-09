'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const m = require('./mapper')

const offer = {
  sellerId: 'seller_abc', offerId: 822, channelCategoryId: 'cat-uuid', quantity: '7.00', taxPercent: '19',
  priceList: [{ id: 'ANDERTAL_B2C', quantityPriceList: [{ quantity: '1', amount: '19.99', currency: 'EUR' }] }],
  title: 'Fahrrad Halterung', description: '<p>Stabil</p>', sku: '843609', gtin: '4006381333931', brand: 'Acme',
  mainPicture: 'https://s3.api.jtl-software.com/scx-api/public/a.jpg', pictureList: ['https://s3.api.jtl-software.com/scx-api/public/b.png'],
  channelAttributeList: [{ attributeId: 'manufacturer', value: 'Acme GmbH' }, { attributeId: 'unknown', value: 'x' }],
}

test('simple offer → one product with price, stock, EAN, GPSR attribute, category, erp link', () => {
  const [u] = m.offerEventToUnits(offer, 'seller_abc')
  assert.equal(u.offerId, 822)
  assert.equal(u.product.price, 19.99)
  assert.equal(u.product.inventory, 7)
  assert.equal(u.product.sku, '843609')
  assert.equal(u.product.metadata.ean, '4006381333931')
  assert.equal(u.product.metadata.manufacturer, 'Acme GmbH')
  assert.equal(u.product.metadata.unknown, undefined)
  assert.deepEqual(u.product.metadata.category_ids, ['cat-uuid'])
  assert.deepEqual(u.product.metadata.prices, { DE: { brutto_cents: 1999 } })
  assert.equal(u.product.metadata.erp.offer_id, 822)
  assert.equal(u.imageUrls.length, 2)
})

test('variation offer → one product per variation with its own offer id, EAN, price and option value', () => {
  const units = m.offerEventToUnits({
    ...offer,
    variationList: [
      { offerId: 901, sku: 'A-S', gtin: '4006381333948', quantity: '2', variationDimensionList: [{ attributeId: 'size', value: 'S' }], priceList: [{ id: 'ANDERTAL_B2C', quantityPriceList: [{ amount: '21.00', currency: 'EUR' }] }] },
      { offerId: 902, sku: 'A-M', gtin: '4006381333955', quantity: '0', variationDimensionList: [{ attributeId: 'size', value: 'M' }] },
    ],
  }, 'seller_abc')
  assert.deepEqual(units.map((u) => [u.offerId, u.optionValue, u.product.metadata.ean, u.product.price, u.product.inventory]), [
    [901, 'S', '4006381333948', 21, 2],
    [902, 'M', '4006381333955', 19.99, 0],
  ])
  assert.equal(units[0].product.metadata.erp.parent_offer_id, 822)
})

test('price: non-EUR or missing → null; other price type falls back to the first list', () => {
  assert.equal(m.pickPrice([{ id: 'B2C', quantityPriceList: [{ amount: '5.5', currency: 'EUR' }] }]), 5.5)
  assert.equal(m.pickPrice([{ id: 'ANDERTAL_B2C', quantityPriceList: [{ amount: '5', currency: 'CHF' }] }]), null)
  assert.equal(m.pickPrice([]), null)
})

test('order → SCX order: own lines, shipping line, addresses with house number, paid + accepted', () => {
  const o = m.buildScxOrder({
    order: { id: 'o1', order_number: 100200, created_at: '2026-10-01T10:00:00Z', email: 'k@x.de', first_name: 'Max', last_name: 'Muster', address_line1: 'Hauptstraße 12a', postal_code: '10115', city: 'Berlin', country: 'de', locale: 'de' },
    items: [{ id: 'i1', quantity: 2, unit_price_cents: 1999, title: 'Tasse', sku: 'T-1', offer_id: 822 }],
    sellerId: 'seller_abc', shippingCents: 490, vatPercent: 19,
  })
  assert.equal(o.orderId, 'A100200')
  assert.equal(o.orderStatus, 'ACCEPTED')
  assert.deepEqual(o.orderItem.map((i) => [i.type, i.grossPrice, i.total || null]), [['ITEM', '19.99', '39.98'], ['SHIPPING', '4.90', null]])
  assert.equal(o.orderItem[0].itemPaymentStatus, 'PAID')
  assert.deepEqual([o.shippingAddress.street, o.shippingAddress.houseNumber, o.shippingAddress.country], ['Hauptstraße', '12a', 'DE'])
  assert.equal(o.buyer.email, 'k@x.de')
})
