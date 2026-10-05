'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { buildSearchIndex, searchIndex, searchFacets, searchSuggestions, normalizeText, levenshtein } = require('./store-search')

const categories = [
  { id: 'cat-home', name: 'Appliances', slug: 'haushaltsgeraete', parent_id: null, metadata: { translations: { de: { name: 'Haushaltsgeräte', keywords: 'haushaltsgeräte' }, en: { name: 'Appliances' } } } },
  { id: 'cat-wash', name: 'Washing machines', slug: 'waschmaschinen', parent_id: 'cat-home', metadata: { translations: { de: { name: 'Waschmaschinen' } } } },
  { id: 'cat-vape', name: 'Vape', slug: 'vape', parent_id: null, metadata: { translations: { de: { name: 'E-Zigaretten' } } } },
]

const products = [
  {
    id: 'p-wash', handle: 'bosch-serie-6', title: 'Bosch Serie 6 Waschmaschine 9 kg', description: '<p>Leise und sparsam</p>',
    metadata: { brand_name: 'Bosch', category_ids: ['cat-wash'], ean: '4242005222611', sales_count: 12, metafields: { farbe: 'Weiß' } },
    variants: [{ id: 'p-wash-variant-0', sku: 'BOS-WM-9KG', ean: '4242005222611' }],
  },
  {
    id: 'p-dryer', handle: 'miele-trockner', title: 'Miele Wärmepumpentrockner', description: '',
    metadata: { brand_name: 'Miele', category_ids: ['cat-home'], sales_count: 3 },
    variants: [{ id: 'p-dryer-variant-0', sku: 'MIE-T1' }],
  },
  {
    id: 'p-vape', handle: 'heisenberg-aroma', title: 'Vampire Vape 30ml Aroma - Heisenberg', description: 'Original Heisenberg Aroma',
    metadata: { brand_name: 'Vampire Vape', category_ids: ['cat-vape'], translations: { en: { title: 'Vampire Vape Heisenberg flavour' } } },
    variants: [{ id: 'p-vape-variant-0', sku: 'VV-HEIS-30' }],
  },
]

const index = buildSearchIndex(products, categories, new Map([['p-dryer', ['AN-K2N4P6X', 'AN-PQRS234']]]))
const ids = (r) => r.hits.map((h) => h.doc.product.id)

describe('normalize / levenshtein', () => {
  it('folds umlauts and punctuation', () => {
    assert.equal(normalizeText('Wärmepumpen-Trockner ß'), 'warmepumpen trockner ss')
  })
  it('levenshtein with early exit', () => {
    assert.equal(levenshtein('waschmachine', 'waschmaschine', 2), 1)
    assert.equal(levenshtein('abc', 'xyz', 1), 2)
  })
})

describe('searchIndex — codes', () => {
  it('EAN (also with spaces) finds the product first', () => {
    assert.equal(ids(searchIndex(index, '4242005222611'))[0], 'p-wash')
    assert.equal(ids(searchIndex(index, '4242 0052 22611'))[0], 'p-wash')
  })
  it('SKU / Artikelnummer, case and dash insensitive', () => {
    assert.equal(ids(searchIndex(index, 'bos wm 9kg'))[0], 'p-wash')
    assert.equal(ids(searchIndex(index, 'mie-t1'))[0], 'p-dryer')
  })
  it('Andertal-ID (parent and variant)', () => {
    assert.equal(ids(searchIndex(index, 'AN-K2N4P6X'))[0], 'p-dryer')
    assert.equal(ids(searchIndex(index, 'an pqrs234'))[0], 'p-dryer')
  })
  it('category id returns that category (and children)', () => {
    const r = searchIndex(index, 'cat-home')
    assert.equal(r.mode, 'exact')
    assert.deepEqual(new Set(ids(r)), new Set(['p-wash', 'p-dryer']))
  })
})

describe('searchIndex — text', () => {
  it('title, brand and category words (any language)', () => {
    assert.equal(ids(searchIndex(index, 'bosch'))[0], 'p-wash')
    assert.equal(ids(searchIndex(index, 'waschmaschine'))[0], 'p-wash')
    assert.equal(ids(searchIndex(index, 'flavour'))[0], 'p-vape')
    const home = searchIndex(index, 'Haushaltsgeräte')
    assert.equal(home.mode, 'exact')
    assert.deepEqual(new Set(ids(home)), new Set(['p-wash', 'p-dryer']))
  })
  it('prefix while typing', () => {
    assert.equal(ids(searchIndex(index, 'waschm'))[0], 'p-wash')
  })
  it('typos are tolerated', () => {
    const r = searchIndex(index, 'waschmachine')
    assert.equal(r.mode, 'exact')
    assert.equal(ids(r)[0], 'p-wash')
  })
  it('multi-word: every word must match for exact mode', () => {
    const r = searchIndex(index, 'bosch 9 kg')
    assert.equal(r.mode, 'exact')
    assert.deepEqual(ids(r), ['p-wash'])
  })
  it('no full match → related results (never empty) + did-you-mean', () => {
    const r = searchIndex(index, 'bosch fernseher')
    assert.equal(r.mode, 'related')
    assert.equal(ids(r)[0], 'p-wash')
    assert.ok(ids(r).includes('p-dryer'), 'same-category products are related too')
    const none = searchIndex(index, 'qqqqzzzz')
    assert.equal(none.mode, 'popular')
    assert.ok(none.hits.length > 0)
  })
})

describe('facets & suggestions', () => {
  it('category + brand panels', () => {
    const r = searchIndex(index, 'wasch')
    const f = searchFacets(index, r, 'de')
    assert.equal(f.categories[0].name, 'Waschmaschinen')
    assert.equal(f.brands[0].name, 'Bosch')
    const s = searchSuggestions(index, r, 'de', f)
    assert.ok(s.includes('Waschmaschinen'))
  })
})
