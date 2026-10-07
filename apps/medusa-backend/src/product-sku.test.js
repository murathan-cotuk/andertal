'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { collectProductRowSkus, validateSellerSkusDb } = require('./product-sku')

const neverCalled = { query: async () => { throw new Error('must not query') } }

test('platform products (no seller) and unchanged SKUs are never checked', async () => {
  assert.equal((await validateSellerSkusDb(neverCalled, { sellerId: null, parentSku: 'A' })).ok, true)
  const r = await validateSellerSkusDb(neverCalled, {
    sellerId: 's1', parentSku: 'A-1', variants: [{ sku: 'a-1-red' }], grandfathered: ['A-1', 'A-1-RED'],
  })
  assert.equal(r.ok, true)
})

test('duplicate variant SKUs in one product are rejected', async () => {
  const r = await validateSellerSkusDb(neverCalled, { sellerId: 's1', variants: [{ sku: 'X' }, { sku: ' x ' }] })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'duplicate_sku')
})

test('collectProductRowSkus normalizes parent and variants', () => {
  assert.deepEqual([...collectProductRowSkus({ sku: ' AB ', variants: [{ sku: 'ab-1' }, {}] })], ['ab', 'ab-1'])
})

test('SKU taken by another product, variant or listing of the same seller (real PostgreSQL)', { skip: !process.env.SETTLEMENT_TEST_PG_URL }, async () => {
  const { Client } = require('pg')
  const c = new Client({ connectionString: process.env.SETTLEMENT_TEST_PG_URL })
  await c.connect()
  try {
    await c.query('BEGIN')
    await c.query(`CREATE TEMP TABLE admin_hub_products (id uuid PRIMARY KEY, seller_id varchar(255), sku varchar(255), status varchar(50), variants jsonb) ON COMMIT DROP`)
    await c.query(`CREATE TEMP TABLE admin_hub_seller_listings (product_id uuid, seller_id varchar(255), sku varchar(255)) ON COMMIT DROP`)
    await c.query(`INSERT INTO admin_hub_products VALUES
      ('00000000-0000-0000-0000-000000000001', 's1', 'TEE-1', 'published', '[{"sku":"TEE-1-RED"}]'),
      ('00000000-0000-0000-0000-000000000002', 's2', 'OTHER', 'published', null),
      ('00000000-0000-0000-0000-000000000003', 's1', 'OLD', 'merged', null)`)
    await c.query(`INSERT INTO admin_hub_seller_listings VALUES ('00000000-0000-0000-0000-000000000002', 's1', 'LIST-9')`)
    const check = (args) => validateSellerSkusDb(c, { sellerId: 's1', ...args })
    assert.equal((await check({ parentSku: 'tee-1' })).ok, false)
    assert.equal((await check({ variants: [{ sku: 'tee-1-red ' }] })).ok, false)
    assert.equal((await check({ parentSku: 'list-9' })).ok, false)
    assert.equal((await check({ parentSku: 'OTHER' })).ok, true) // other seller
    assert.equal((await check({ parentSku: 'OLD' })).ok, true) // merged product
    assert.equal((await check({ parentSku: 'TEE-1', excludeProductId: '00000000-0000-0000-0000-000000000001' })).ok, true) // itself
    const err = await check({ parentSku: 'TEE-1' })
    assert.match(err.message, /already used by another of your products: tee-1/)
  } finally {
    await c.query('ROLLBACK').catch(() => {})
    await c.end()
  }
})
