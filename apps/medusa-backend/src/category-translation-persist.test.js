'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { glossaryLookup } = require('./amazon-category-name-glossary')
const {
  shouldFillName,
  applyCategoryLocaleNames,
} = require('./category-translation-persist')

describe('category-translation-persist', () => {
  it('glossary uses the French appliances label the shop expects', () => {
    assert.equal(glossaryLookup('Appliances', 'fr'), 'Appareils électroménagers')
    assert.equal(glossaryLookup('Appliances', 'de'), 'Haushaltsgeräte')
  })

  it('fills empty and English-copied names, keeps manual translations', () => {
    assert.equal(shouldFillName('', 'Appliances'), true)
    assert.equal(shouldFillName('Appliances', 'Appliances'), true)
    assert.equal(shouldFillName('Appareils électroménagers', 'Appliances'), false)
  })

  it('writes locale names into metadata.translations without touching a manual FR name', () => {
    const { changed, metadata } = applyCategoryLocaleNames(
      {
        name: 'Appliances',
        metadata: { translations: { fr: { name: 'Gros électroménager' } } },
      },
      { de: 'Haushaltsgeräte', fr: 'Appareils électroménagers', es: 'Electrodomésticos', it: 'Elettrodomestici', tr: 'Ev Aletleri' },
    )
    assert.equal(changed, true)
    assert.equal(metadata.translations.fr.name, 'Gros électroménager')
    assert.equal(metadata.translations.de.name, 'Haushaltsgeräte')
    assert.equal(metadata.translations.en.name, 'Appliances')
    assert.equal(metadata.translations.de._auto.name, true)
  })
})
