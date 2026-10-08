'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { buildFamilyVariants } = require('./family-variants')

const groups = [{ name: 'Farbe', options: [{ value: 'Rot' }, { value: 'Blau' }, { value: 'Grün' }] }]
const member = (id, value, cents, extra = {}) => ({
  row: { id, handle: `h-${id}`, title: `T ${id}`, metadata: { family_option_value: value, prices: { DE: { brutto_cents: cents } } } },
  mapped: { variants: [{ id: `${id}-ean-400000000000${id.slice(-1)}`, price_cents: cents, inventory_quantity: 3, metadata: {}, ...extra }] },
})

test('members become variants in axis order, viewed member first, own cart id + price', () => {
  const r = buildFamilyVariants({ currentId: 'p3', members: [member('p1', 'Blau', 1000), member('p2', 'Rot', 1100), member('p3', 'Grün', 1200)], variationGroups: groups })
  assert.deepEqual(r.variants.map((v) => v.option_values[0]), ['Grün', 'Rot', 'Blau'])
  assert.equal(r.variants[0].product_id, 'p3')
  assert.equal(r.variants[0].id, 'p3-ean-4000000000003')
  assert.equal(r.variants[1].metadata.prices.DE.brutto_cents, 1100)
  assert.deepEqual(r.family_members.map((m) => m.handle), ['h-p3', 'h-p2', 'h-p1'])
})

test('no expansion when a member has several variants, or with < 2 members / no axis', () => {
  const multi = member('p2', 'Rot', 1100)
  multi.mapped.variants.push({ id: 'x' })
  assert.equal(buildFamilyVariants({ currentId: 'p1', members: [member('p1', 'Blau', 1000), multi], variationGroups: groups }), null)
  assert.equal(buildFamilyVariants({ currentId: 'p1', members: [member('p1', 'Blau', 1000)], variationGroups: groups }), null)
  assert.equal(buildFamilyVariants({ currentId: 'p1', members: [member('p1', 'Blau', 1000), member('p2', 'Rot', 1)], variationGroups: [] }), null)
})
