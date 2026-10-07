'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { isValidGtin, normalizeEanValue, collectProductRowEans, validateProductEansDb } = require('./product-ean')

test('GTIN check digits (GS1)', () => {
  assert.equal(isValidGtin('4006381333931'), true) // GTIN-13
  assert.equal(isValidGtin('96385074'), true) // GTIN-8
  assert.equal(isValidGtin('036000291452'), true) // UPC-A / GTIN-12
  assert.equal(isValidGtin('10012345678902'), true) // GTIN-14
  assert.equal(isValidGtin('4006381333932'), false)
  assert.equal(isValidGtin('1234567890'), false) // wrong length
  assert.equal(isValidGtin('ABC'), false)
})

test('normalization keeps digits for GTIN-like input', () => {
  assert.equal(normalizeEanValue(' 4006-3813 33931 '), '4006381333931')
  assert.equal(normalizeEanValue('AB12'), 'AB12')
  assert.deepEqual([...collectProductRowEans({ metadata: { ean: '4006381333931' }, variants: [{ ean: '96385074' }] })], ['4006381333931', '96385074'])
})

// Fake pg client: emulates the duplicate query against an in-memory list of stored codes.
const fakeClient = (stored) => ({
  query: async (_sql, [values, exclude]) => ({
    rows: stored
      .filter((r) => !exclude.includes(r.id) && r.status !== 'merged')
      .map((r) => normalizeEanValue(r.ean))
      .filter((n) => values.includes(n))
      .map((norm) => ({ norm })),
  }),
})

test('duplicate EANs are rejected before the GTIN rule (seller listing flow depends on it)', async () => {
  const client = fakeClient([{ id: 'p1', ean: '1234567890121', status: 'published' }])
  const r = await validateProductEansDb(client, '1234567890121', [], null, { requireValidGtin: true })
  assert.equal(r.ok, false)
  assert.match(r.message, /^EAN already exists: 1234567890121/)
})

test('new invalid codes are rejected, valid ones and empty pass', async () => {
  const client = fakeClient([])
  const bad = await validateProductEansDb(client, '4006381333932', [], null, { requireValidGtin: true })
  assert.equal(bad.ok, false)
  assert.equal(bad.code, 'invalid_gtin')
  assert.equal((await validateProductEansDb(client, '4006381333931', ['96385074'], null, { requireValidGtin: true })).ok, true)
  assert.equal((await validateProductEansDb(client, '', [], null, { requireValidGtin: true })).ok, true)
})

test('codes already stored on the product are grandfathered', async () => {
  const client = fakeClient([{ id: 'p1', ean: '1234567890121', status: 'published' }])
  const r = await validateProductEansDb(client, '1234567890121', ['96385074'], 'p1', {
    requireValidGtin: true,
    grandfathered: ['1234567890121'],
  })
  assert.equal(r.ok, true)
  const changed = await validateProductEansDb(client, '1234567890122', [], 'p1', { requireValidGtin: true, grandfathered: ['1234567890121'] })
  assert.equal(changed.ok, false)
})

test('without requireValidGtin the old behaviour is unchanged', async () => {
  const r = await validateProductEansDb(fakeClient([]), '1234567890122', [], null)
  assert.equal(r.ok, true)
  const dup = await validateProductEansDb(fakeClient([]), '4006381333931', ['4006381333931'], null)
  assert.match(dup.message, /must be different/)
})

test('SQL duplicate lookup matches the JS normalization (real PostgreSQL)', { skip: !process.env.SETTLEMENT_TEST_PG_URL }, async () => {
  const { Client } = require('pg')
  const { findTakenEans } = require('./product-ean')
  const c = new Client({ connectionString: process.env.SETTLEMENT_TEST_PG_URL })
  await c.connect()
  try {
    await c.query('BEGIN')
    await c.query(`CREATE TEMP TABLE admin_hub_products (id uuid PRIMARY KEY, status varchar(50), metadata jsonb, variants jsonb) ON COMMIT DROP`)
    await c.query(`INSERT INTO admin_hub_products VALUES
      ('00000000-0000-0000-0000-000000000001', 'published', '{"ean":"4006-3813 33931"}', '[{"ean":"96385074"},{"ean":null},{}]'),
      ('00000000-0000-0000-0000-000000000002', 'merged', '{"ean":"036000291452"}', null),
      ('00000000-0000-0000-0000-000000000003', NULL, '{"ean":" AB12 "}', '{"not":"array"}')`)
    const taken = await findTakenEans(c, ['4006381333931', '96385074', '036000291452', 'AB12', '10012345678902'], new Set())
    assert.deepEqual([...taken].sort(), ['4006381333931', '96385074', 'AB12'])
    const excl = await findTakenEans(c, ['4006381333931'], new Set(['00000000-0000-0000-0000-000000000001']))
    assert.equal(excl.size, 0)
  } finally {
    await c.query('ROLLBACK').catch(() => {})
    await c.end()
  }
})
