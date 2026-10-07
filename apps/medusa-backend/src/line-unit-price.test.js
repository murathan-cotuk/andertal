'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveCatalogUnitPriceCents } = require('./line-unit-price')

const parent = { prices: { DE: { brutto_cents: 2890 }, AT: { brutto_cents: 2990 } } }

test("variant's own price wins over the parent's (live case: 28,00 € variant of a 28,90 € parent)", () => {
  assert.equal(resolveCatalogUnitPriceCents({ variant: { price_cents: 2800 }, meta: parent, country: 'DE' }), 2800)
})

test('variant per-market price wins first; sale only when lower', () => {
  const v = { price_cents: 2800, metadata: { prices: { DE: { brutto_cents: 2700, sale_cents: 2500 } } } }
  assert.equal(resolveCatalogUnitPriceCents({ variant: v, meta: parent, country: 'DE' }), 2500)
  assert.equal(resolveCatalogUnitPriceCents({ variant: { price_cents: 2800, sale_price_cents: 2600 }, meta: parent }), 2600)
  assert.equal(resolveCatalogUnitPriceCents({ variant: { price_cents: 2800, sale_price_cents: 3000 }, meta: parent }), 2800)
})

test('variant without own price falls back to the parent (per market, then DE)', () => {
  assert.equal(resolveCatalogUnitPriceCents({ variant: { option_values: ['M'] }, meta: parent, country: 'AT' }), 2990)
  assert.equal(resolveCatalogUnitPriceCents({ variant: {}, meta: parent, country: 'FR' }), 2890)
  assert.equal(resolveCatalogUnitPriceCents({ variant: null, meta: {}, productPriceCents: 1500 }), 1500)
})
