'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  wantsFullCategoryPayload,
  mapLightCategoryRow,
  lightCategorySelectSql,
  normalizeListLocale,
  mergeCategoryMetadata,
} = require('./category-list-light')

describe('admin category list light payload', () => {
  it('is slim unless full=true', () => {
    assert.equal(wantsFullCategoryPayload({}), false)
    assert.equal(wantsFullCategoryPayload({ light: 'true' }), false)
    assert.equal(wantsFullCategoryPayload({ full: 'true' }), true)
  })

  it('maps a stored locale name without shipping full metadata', () => {
    const row = {
      id: 'c1',
      name: 'Appliances',
      slug: 'appliances',
      parent_id: null,
      active: true,
      is_visible: true,
      has_collection: false,
      sort_order: 0,
      locale_own_name: 'Appareils électroménagers',
      localized_name: 'Appareils électroménagers',
    }
    const mapped = mapLightCategoryRow(row, 'fr')
    assert.equal(mapped.name, 'Appliances')
    assert.equal(mapped.localized_name, 'Appareils électroménagers')
    assert.equal(mapped.metadata.translations.fr.name, 'Appareils électroménagers')
    assert.equal(mapped.long_content, undefined)
    assert.equal(Object.keys(mapped.metadata).join(','), 'translations')
  })

  it('does not pretend a fallback name is a stored translation', () => {
    const mapped = mapLightCategoryRow({
      id: 'c1',
      name: 'Appliances',
      slug: 'appliances',
      locale_own_name: '',
      localized_name: 'Haushaltsgeräte',
    }, 'fr')
    assert.equal(mapped.localized_name, 'Haushaltsgeräte')
    assert.deepEqual(mapped.metadata, {})
  })

  it('merges one locale without wiping the others', () => {
    const merged = mergeCategoryMetadata(
      { translations: { de: { name: 'Geräte' }, fr: { name: 'Appareils' } }, collection_id: 'x' },
      { translations: { fr: { name: 'Appareils électroménagers' } } },
    )
    assert.equal(merged.translations.de.name, 'Geräte')
    assert.equal(merged.translations.fr.name, 'Appareils électroménagers')
    assert.equal(merged.collection_id, 'x')
  })

  it('binds locale as $1 in the slim select', () => {
    assert.match(lightCategorySelectSql(), /ARRAY\['translations', \$1, 'name'\]/)
    assert.equal(normalizeListLocale('FR-be'), 'fr')
  })
})
