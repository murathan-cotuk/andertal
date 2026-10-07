'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { matrixProblems, validateVariantMatrix } = require('./product-variants')

const meta = { variation_groups: [{ name: 'Farbe' }, { name: 'Größe' }] }
const v = (...option_values) => ({ option_values })

test('a clean matrix passes; simple products without variants pass', () => {
  assert.equal(validateVariantMatrix(meta, [v('Rot', 'M'), v('Rot', 'L'), v('Blau', 'M')]).ok, true)
  assert.equal(validateVariantMatrix({}, []).ok, true)
  assert.equal(validateVariantMatrix({}, [{ sku: 'single' }]).ok, true)
})

test('the same combination twice is rejected (case/space-insensitive)', () => {
  const r = validateVariantMatrix(meta, [v('Rot', 'M'), v(' rot', 'm ')])
  assert.equal(r.ok, false)
  assert.equal(r.code, 'duplicate_combination')
})

test('a variant missing a group value is rejected', () => {
  assert.equal(validateVariantMatrix(meta, [v('Rot')]).code, 'incomplete_combination')
  assert.equal(validateVariantMatrix(meta, [v('Rot', '')]).code, 'incomplete_combination')
})

test('problems already stored on the product do not block saving it', () => {
  const previous = { metadata: meta, variants: [v('Rot', 'M'), v('Rot', 'M')] }
  assert.equal(matrixProblems(previous.metadata, previous.variants).length, 1)
  assert.equal(validateVariantMatrix(meta, [v('Rot', 'M'), v('Rot', 'M')], previous).ok, true)
  // …but a new duplicate is still caught
  assert.equal(validateVariantMatrix(meta, [v('Rot', 'M'), v('Rot', 'M'), v('Blau', 'S'), v('Blau', 'S')], previous).ok, false)
})
