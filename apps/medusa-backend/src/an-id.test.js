'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  formatAnId,
  isValidAnId,
  normalizeAnId,
  assignAnId,
  ensureVariantAnIds,
} = require('./an-id')

function mockClient(taken) {
  const set = taken instanceof Set ? taken : new Set(taken || [])
  return {
    query: async (_sql, params) => {
      const id = params && params[0]
      return { rows: set.has(id) ? [{}] : [] }
    },
  }
}

describe('normalizeAnId', () => {
  it('uppercases and accepts a missing AN- prefix for a 7-char suffix', () => {
    assert.equal(normalizeAnId('an-k2n4p6x'), 'AN-K2N4P6X')
    assert.equal(normalizeAnId('  k2n4p6x  '), 'AN-K2N4P6X')
  })
  it('rejects ambiguous characters and wrong lengths', () => {
    assert.equal(normalizeAnId('AN-0000000'), '')
    assert.equal(normalizeAnId('AN-IIIIIII'), '')
    assert.equal(normalizeAnId('not-an-id'), '')
    assert.equal(normalizeAnId(''), '')
  })
  it('isValidAnId matches the same pattern', () => {
    assert.equal(isValidAnId('AN-K2N4P6X'), true)
    assert.equal(isValidAnId(formatAnId('K2N4P6X')), true)
    assert.equal(isValidAnId('AN-O123456'), false)
  })
})

describe('assignAnId / ensureVariantAnIds', () => {
  it('skips IDs already in the DB or reserved set', async () => {
    const reserved = new Set()
    const client = mockClient()
    const a = await assignAnId(client, reserved)
    const b = await assignAnId(client, reserved)
    assert.match(a, /^AN-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{7}$/)
    assert.match(b, /^AN-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{7}$/)
    assert.notEqual(a, b)
    assert.equal(reserved.has(a), true)
    assert.equal(reserved.has(b), true)
  })

  it('stamps missing variant AN-IDs and keeps existing ones', async () => {
    const client = mockClient()
    const reserved = new Set(['AN-PARENT1'])
    const { variants, changed } = await ensureVariantAnIds(client, [
      { option_values: ['Red'], an_id: 'an-k2n4p6x' },
      { option_values: ['Blue'] },
    ], reserved)
    assert.equal(changed, true)
    assert.equal(variants[0].an_id, 'AN-K2N4P6X')
    assert.match(variants[1].an_id, /^AN-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{7}$/)
    assert.notEqual(variants[1].an_id, 'AN-K2N4P6X')
    assert.notEqual(variants[1].an_id, 'AN-PARENT1')
  })

  it('reports unchanged when every variant already has a valid AN-ID', async () => {
    const client = mockClient()
    const { variants, changed } = await ensureVariantAnIds(client, [
      { option_values: ['Red'], an_id: 'AN-K2N4P6X' },
    ])
    assert.equal(changed, false)
    assert.equal(variants[0].an_id, 'AN-K2N4P6X')
  })

  it('returns empty when there are no variants', async () => {
    const client = mockClient()
    const empty = await ensureVariantAnIds(client, [])
    assert.deepEqual(empty, { variants: [], changed: false })
    const none = await ensureVariantAnIds(client, null)
    assert.deepEqual(none, { variants: [], changed: false })
  })
})
