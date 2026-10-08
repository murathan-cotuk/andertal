'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeExcelSlug,
  preferredLeafSlug,
  resolveStoredCategorySlug,
  allocateUniqueLeafSlug,
  isPathLikeSlug,
  looksGermanSlug,
  slugFromCategoryName,
  resolveExcelUpsertTarget,
  nextSlugForExcelUpsert,
  LEAF_SLUG_MAX,
} = require('./category-excel-upsert-helpers')

describe('category excel upsert slug conflict → update', () => {
  it('normalizes spaced Amazon-style slugs like the DB does (lookup, up to 255)', () => {
    const raw =
      'arts-crafts-sewing-craft-supplies-materials-craft-supplies-craft-adhesives-craft-adhesive-sheets-sprays-Adhesive Sheets'
    assert.equal(
      normalizeExcelSlug(raw),
      'arts-crafts-sewing-craft-supplies-materials-craft-supplies-craft-adhesives-craft-adhesive-sheets-sprays-adhesive-sheets',
    )
  })

  it('matches an existing row by normalized slug (no -1 create)', () => {
    const keep = {
      id: '583d2016-2e5e-4234-8b45-96f8a55e70c3',
      slug: 'arts-crafts-sewing-craft-supplies-materials-craft-supplies-craft-adhesives-craft-adhesive-sheets-sprays-adhesive-sheets',
    }
    const byId = new Map([[keep.id, keep]])
    const bySlug = new Map([[keep.slug, keep]])
    const raw =
      'arts-crafts-sewing-craft-supplies-materials-craft-supplies-craft-adhesives-craft-adhesive-sheets-sprays-Adhesive Sheets'
    const slug = normalizeExcelSlug(raw)
    const { existing, match } = resolveExcelUpsertTarget({ id: '', slug, byId, bySlug })
    assert.equal(match, 'slug')
    assert.equal(existing.id, keep.id)
  })

  it('never invents a -1 suffix when desired slug is taken by another row', () => {
    const keep = { id: 'a', slug: 'adhesive-sheets' }
    const other = { id: 'b', slug: 'other' }
    const taken = new Map([
      ['adhesive-sheets', keep.id],
      ['other', other.id],
    ])
    assert.equal(
      nextSlugForExcelUpsert({ desiredSlug: 'adhesive-sheets', existingRow: other, takenSlugs: taken }),
      'other',
    )
    assert.equal(
      nextSlugForExcelUpsert({ desiredSlug: 'adhesive-sheets', existingRow: keep, takenSlugs: taken }),
      'adhesive-sheets',
    )
  })
})

describe('leaf niche slug generation (English)', () => {
  it('slugifies English names and stays under max length', () => {
    const s = slugFromCategoryName('Adhesive Sheets & Sprays for Air Conditioning')
    assert.equal(s, 'adhesive-sheets-sprays-for-air-conditioning')
    assert.ok(s.length <= LEAF_SLUG_MAX)
  })

  it('detects Amazon path-like and German-looking slugs', () => {
    assert.equal(isPathLikeSlug('adhesive-sheets'), false)
    assert.equal(looksGermanSlug('adhesive-sheets'), false)
    assert.equal(looksGermanSlug('klebefolien'), false) // no German stem token
    assert.equal(looksGermanSlug('kfz-ersatzdichtungen-fuer-klimaanlagenkompressoren'), true)
    assert.equal(looksGermanSlug('reifen-und-schlaeuche-fuer-motorsportfahrzeuge'), true)
    assert.equal(
      isPathLikeSlug(
        'arts-crafts-sewing-craft-supplies-materials-craft-supplies-craft-adhesives-craft-adhesive-sheets',
      ),
      true,
    )
  })

  it('never truncates mid-word when slugifying long names', () => {
    const long =
      'Automotive Replacement Air Conditioning Compressors Parts Automotive Replacement Air Conditioning Compressor Seals'
    const s = slugFromCategoryName(long, 100)
    assert.ok(!s.endsWith('-sea'))
    assert.ok(s.length <= 100)
  })

  it('preferredLeafSlug ignores path-like raw and uses English name', () => {
    const leaf = preferredLeafSlug(
      'arts-crafts-sewing-craft-supplies-materials-craft-adhesives-adhesive-sheets',
      'Adhesive Sheets',
    )
    assert.equal(leaf, 'adhesive-sheets')
  })

  it('preferredLeafSlug replaces German-looking raw when English name exists', () => {
    assert.equal(
      preferredLeafSlug('kfz-ersatzdichtungen-fuer-klimaanlagenkompressoren', 'Automotive Replacement Air Conditioning Compressor Seals'),
      'automotive-replacement-air-conditioning-compressor-seals',
    )
  })

  it('preferredLeafSlug keeps short English custom slug that extends the leaf', () => {
    assert.equal(preferredLeafSlug('adhesive-sheets-pro', 'Adhesive Sheets'), 'adhesive-sheets-pro')
  })

  it('preferredLeafSlug replaces unrelated German leaf when name_en exists', () => {
    assert.equal(preferredLeafSlug('klebefolien', 'Adhesive Sheets'), 'adhesive-sheets')
  })

  it('resolveStoredCategorySlug prefers name_en over German fallback', () => {
    assert.equal(
      resolveStoredCategorySlug({
        rawSlug: 'klebefolien',
        nameEn: 'Adhesive Sheets',
        nameFallback: 'Klebefolien',
      }),
      'adhesive-sheets',
    )
  })

  it('allocateUniqueLeafSlug uses parent disambiguator then -2/-3', () => {
    const taken = new Set(['adhesive-sheets'])
    const a = allocateUniqueLeafSlug('Adhesive Sheets', taken, ['sprays'])
    assert.equal(a, 'adhesive-sheets-sprays')
    taken.add(a)
    const b = allocateUniqueLeafSlug('Adhesive Sheets', taken, ['sprays'])
    assert.equal(b, 'adhesive-sheets-2')
    taken.add(b)
    const c = allocateUniqueLeafSlug('Adhesive Sheets', taken, ['sprays'])
    assert.equal(c, 'adhesive-sheets-3')
  })
})
