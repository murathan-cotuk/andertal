'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { wouldCreateCycle } = require('./category-cycle')

// root ← a ← b ← c
const parents = { a: 'root', b: 'a', c: 'b', root: null, x: 'y', y: 'x' }
const parentOf = (id) => parents[id]

test('moving a node under its own descendant is a cycle', () => {
  assert.equal(wouldCreateCycle(parentOf, 'a', 'c'), true)
  assert.equal(wouldCreateCycle(parentOf, 'a', 'a'), true)
})

test('normal moves are fine', () => {
  assert.equal(wouldCreateCycle(parentOf, 'c', 'a'), false)
  assert.equal(wouldCreateCycle(parentOf, 'b', 'root'), false)
  assert.equal(wouldCreateCycle(parentOf, 'b', null), false)
})

test('attaching to an already broken loop is refused', () => {
  assert.equal(wouldCreateCycle(parentOf, 'c', 'x'), true)
})
