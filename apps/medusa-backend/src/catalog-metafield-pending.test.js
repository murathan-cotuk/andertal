'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { buildCatalogMaps, resolveCatalogKey } = require('./catalog-metafield-pending')

test('an exact definition key wins over another definition\'s label or translation (Farbe ≠ Design)', () => {
  const maps = buildCatalogMaps([
    { key: 'farbe', label: 'Farbe', values: ['Rot'] },
    // a later definition whose translation spells the same word must not steal "farbe"
    { key: 'design', label: 'Design', label_i18n: { tr: { label: 'Farbe' } }, values: ['Blume'] },
  ])
  assert.equal(resolveCatalogKey('farbe', maps), 'farbe')
  assert.equal(resolveCatalogKey('Design', maps), 'design')
  assert.equal(resolveCatalogKey('Colour', buildCatalogMaps([{ key: 'farbe', label: 'Farbe', label_i18n: { en: { label: 'Colour' } }, values: [] }])), 'farbe')
})
