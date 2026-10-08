'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const inv = require('./inventory')

test('variant index from the shop\'s synthetic variant ids', () => {
  assert.equal(inv.parseVariantIndex('p1-variant-2'), 2)
  assert.equal(inv.parseVariantIndex('p1-v-0'), 0)
  assert.equal(inv.parseVariantIndex('p1-listing-seller_x-variant-11'), 11)
  assert.equal(inv.parseVariantIndex('p1'), null)
})

test('stock target: owner variant, owner product, other seller\'s listing, untracked variant', () => {
  const product = { id: 'p1', seller_id: 's_owner', inventory: 0, variants: [{ inventory: 5 }, { inventory: '0' }, {}] }
  assert.deepEqual(inv.resolveStockTarget({ line: { seller_id: 's_owner', variant_id: 'p1-variant-0' }, product }), { kind: 'variant', productId: 'p1', sellerId: 's_owner', idx: 0, available: 5 })
  assert.equal(inv.resolveStockTarget({ line: { seller_id: 's_owner', variant_id: 'p1-variant-2' }, product }).available, null)
  assert.deepEqual(inv.resolveStockTarget({ line: { seller_id: 's_owner', variant_id: 'p1-variant-0' }, product: { ...product, variants: [] } }).kind, 'product')
  assert.deepEqual(inv.resolveStockTarget({ line: { seller_id: 's_b', variant_id: 'p1-variant-0' }, product, listing: { inventory: 3 } }), { kind: 'listing', productId: 'p1', sellerId: 's_b', idx: null, available: 3 })
  // Same-seller listing row is a shadow — the product row holds the stock.
  assert.equal(inv.resolveStockTarget({ line: { seller_id: 's_owner', variant_id: 'p1-variant-0' }, product, listing: { inventory: 0 } }).kind, 'variant')
})

test('shortage sums quantities of lines that share one stock', () => {
  const t = { kind: 'product', productId: 'p1', sellerId: 's', idx: null, available: 2 }
  const a = { id: 'l1', quantity: 1 }
  const b = { id: 'l2', quantity: 2 }
  const untracked = { id: 'l3', quantity: 99 }
  const m = new Map([[a, t], [b, t], [untracked, { ...t, productId: 'p2', available: null }]])
  assert.deepEqual(inv.findShortages([a, b, untracked], m), [{ line_item_ids: ['l1', 'l2'], available: 2, requested: 3 }])
})

const PG = process.env.SETTLEMENT_TEST_PG_URL
test('deduct once (never below 0) and restore cancelled lines once — real Postgres', { skip: !PG && 'SETTLEMENT_TEST_PG_URL not set' }, async () => {
  const { Client } = require('pg')
  const c = new Client({ connectionString: PG })
  await c.connect()
  try {
    await c.query(`CREATE TEMP TABLE admin_hub_products (id uuid PRIMARY KEY, seller_id text, inventory integer, variants jsonb, updated_at timestamptz)`)
    await c.query(`CREATE TEMP TABLE admin_hub_seller_listings (product_id uuid, seller_id text, inventory integer, status text, updated_at timestamptz)`)
    await c.query(`CREATE TEMP TABLE store_orders (id uuid PRIMARY KEY, stock_deducted_at timestamptz)`)
    await c.query(`CREATE TEMP TABLE store_order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, product_id text, variant_id text, seller_id text, quantity int, stock_restored_at timestamptz)`)
    const p1 = '00000000-0000-0000-0000-0000000000a1'
    const p2 = '00000000-0000-0000-0000-0000000000a2'
    const o = '00000000-0000-0000-0000-0000000000b1'
    await c.query(`INSERT INTO admin_hub_products VALUES ($1, 's_a', 0, '[{"inventory": "3"}, {"inventory": 1}]'), ($2, 's_a', 1, '[]')`, [p1, p2])
    await c.query(`INSERT INTO admin_hub_seller_listings VALUES ($1, 's_b', 4, 'active')`, [p2])
    await c.query('INSERT INTO store_orders (id) VALUES ($1)', [o])
    await c.query(`INSERT INTO store_order_items (order_id, product_id, variant_id, seller_id, quantity) VALUES
      ($1, $2, $2 || '-variant-0', 's_a', 2), ($1, $2, $2 || '-variant-1', 's_a', 5), ($1, $3, $3, 's_a', 1), ($1, $3, $3, 's_b', 3)`, [o, p1, p2])

    const short = await inv.checkCartStock(c, (await c.query('SELECT * FROM store_order_items WHERE order_id = $1', [o])).rows)
    assert.equal(short.length, 1) // variant 1: 5 requested, 1 available
    assert.equal(short[0].available, 1)

    assert.equal((await inv.deductOrderStock(c, o)).deducted, 4)
    assert.equal((await inv.deductOrderStock(c, o)).deducted, 0) // idempotent
    const prod = async (id) => (await c.query('SELECT inventory, variants FROM admin_hub_products WHERE id = $1', [id])).rows[0]
    assert.deepEqual((await prod(p1)).variants.map((v) => v.inventory), [1, 0]) // 3-2, max(0, 1-5)
    assert.equal((await prod(p2)).inventory, 0)
    assert.equal((await c.query('SELECT inventory FROM admin_hub_seller_listings')).rows[0].inventory, 1)

    // Seller B cancels its line → only its listing gets stock back, once.
    assert.equal((await inv.restoreOrderStock(c, o, { sellerId: 's_b' })).restored, 1)
    assert.equal((await inv.restoreOrderStock(c, o, { sellerId: 's_b' })).restored, 0)
    assert.equal((await c.query('SELECT inventory FROM admin_hub_seller_listings')).rows[0].inventory, 4)
    assert.equal((await prod(p2)).inventory, 0)
  } finally {
    await c.end()
  }
})

test('minimum order quantity sums all lines of a product — real Postgres', { skip: !PG && 'SETTLEMENT_TEST_PG_URL not set' }, async () => {
  const { Client } = require('pg')
  const c = new Client({ connectionString: PG })
  await c.connect()
  try {
    await c.query(`CREATE TEMP TABLE admin_hub_products (id uuid PRIMARY KEY, metadata jsonb)`)
    const p = '00000000-0000-0000-0000-0000000000c1'
    const q = '00000000-0000-0000-0000-0000000000c2'
    await c.query(`INSERT INTO admin_hub_products VALUES ($1, '{"minimum_order_quantity": "3"}'), ($2, '{}')`, [p, q])
    assert.deepEqual(await inv.findBelowMinimum(c, [{ product_id: p, quantity: 1 }, { product_id: q, quantity: 1 }]), [{ product_id: p, minimum: 3, requested: 1 }])
    assert.deepEqual(await inv.findBelowMinimum(c, [{ product_id: p, quantity: 1 }, { product_id: p, quantity: 2 }]), [])
  } finally {
    await c.end()
  }
})
