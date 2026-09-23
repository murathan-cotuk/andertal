'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  collectCategorySubtreeIdsFromFlat,
  collectCategorySubtreeIdsBySlugSql,
  SUBTREE_IDS_SQL,
} = require('./category-subtree-ids')

describe('category subtree ids', () => {
  it('collects subtree ids from a flat parent map without loading metadata', () => {
    const rows = [
      { id: 'ROOT', slug: 'appliances', parent_id: null },
      { id: 'KID', slug: 'dishwashers', parent_id: 'ROOT' },
      { id: 'LEAF', slug: 'built-in', parent_id: 'KID' },
      { id: 'OTHER', slug: 'cars', parent_id: null },
    ]
    const ids = collectCategorySubtreeIdsFromFlat(rows, 'appliances')
    assert.equal(ids.has('root'), true)
    assert.equal(ids.has('kid'), true)
    assert.equal(ids.has('leaf'), true)
    assert.equal(ids.has('other'), false)
    assert.equal(collectCategorySubtreeIdsFromFlat(rows, 'cars').size, 1)
  })

  it('uses a recursive CTE then falls back to the flat map', async () => {
    assert.match(SUBTREE_IDS_SQL, /WITH RECURSIVE tree/)
    const ids = await collectCategorySubtreeIdsBySlugSql(async () => {
      throw new Error('no cte')
    }, 'appliances')
    assert.equal(ids.size, 0)

    const fallback = await collectCategorySubtreeIdsBySlugSql(async (sql) => {
      if (String(sql).includes('WITH RECURSIVE')) throw new Error('no cte')
      return {
        rows: [
          { id: 'a', slug: 'appliances', parent_id: null },
          { id: 'b', slug: 'ovens', parent_id: 'a' },
        ],
      }
    }, 'appliances')
    assert.equal(fallback.has('a'), true)
    assert.equal(fallback.has('b'), true)
  })
})
