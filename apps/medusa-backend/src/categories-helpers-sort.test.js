'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { sortCategoryTreeByLocalizedName } = require('./categories-helpers')

describe('sortCategoryTreeByLocalizedName', () => {
  it('sorts roots by localized German name not English sort_order', () => {
    const tree = [
      { name: 'Appliances', localized_name: 'Haushaltsgeräte', sort_order: 0, children: [] },
      { name: 'Automotive', localized_name: 'Auto & Motorrad', sort_order: 1, children: [] },
      { name: 'Baby Products', localized_name: 'Baby', sort_order: 2, children: [] },
    ]
    sortCategoryTreeByLocalizedName(tree, 'de')
    assert.deepEqual(
      tree.map((c) => c.localized_name),
      ['Auto & Motorrad', 'Baby', 'Haushaltsgeräte'],
    )
  })

  it('sorts children deeply by English labels', () => {
    const tree = [
      {
        name: 'Parent',
        children: [
          { name: 'Zebra', children: [] },
          { name: 'Apple', children: [] },
        ],
      },
    ]
    sortCategoryTreeByLocalizedName(tree, 'en')
    assert.equal(tree[0].children[0].name, 'Apple')
    assert.equal(tree[0].children[1].name, 'Zebra')
  })
})
