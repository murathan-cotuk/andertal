'use strict'

/**
 * SCX service against a real PostgreSQL (SETTLEMENT_TEST_PG_URL, same harness as the settlement
 * tests) with a fake SCX client. Skipped when no test database is configured.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const h = require('../../settlement/test-helpers')
const { ensureConnectorSchema } = require('../schema')
const svc = require('./service')

const skip = !h.TEST_PG_URL && 'SETTLEMENT_TEST_PG_URL not set — integration tests need a PostgreSQL test database'

function fakeScx(events = []) {
  const calls = {}
  const rec = (name) => async (arg) => { (calls[name] = calls[name] || []).push(arg); return {} }
  return {
    calls,
    getEvents: async () => ({ eventList: events.splice(0) }),
    ackEvents: rec('ack'),
    offerListed: rec('listed'),
    offerListingFailed: rec('failed'),
    createOrders: rec('orders'),
    updateOrderStatus: rec('status'),
    refundProcessingResult: rec('refundResult'),
    stockUpdatesAll: async () => ({ stockUpdateList: [{ sellerId: 's_jtl', offerId: 822, quantity: '3.00' }], lastUpdatedAt: '2026-10-09T10:00:00Z' }),
    readSignupSession: async () => ({ jtlAccountId: 4711 }),
    createSeller: rec('createSeller'),
  }
}

async function setup() {
  const client = await h.freshDatabase()
  await client.query(`ALTER TABLE admin_hub_products ADD COLUMN title text, ADD COLUMN status text, ADD COLUMN inventory integer,
    ADD COLUMN sku text, ADD COLUMN handle text, ADD COLUMN family_id uuid, ADD COLUMN product_role text, ADD COLUMN updated_at timestamptz`)
  await client.query(`CREATE TABLE admin_hub_product_families (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text, handle text UNIQUE, metadata jsonb)`)
  await client.query('ALTER TABLE store_order_items ADD COLUMN stock_restored_at timestamptz')
  await client.query('ALTER TABLE store_orders ADD COLUMN carrier_name text, ADD COLUMN shipped_at timestamptz')
  await ensureConnectorSchema(client)
  await require('../../jtl-partner').ensureJtlPartnerSchema(client)
  await h.addSeller(client, 's_jtl')
  return client
}

// Stand-in for createAdminHubProductDb / updateAdminHubProductDb (the real gates are tested elsewhere).
function fakeProducts(client, { live = true } = {}) {
  const ok = (row) => (live ? row : { ...row, status: 'draft', publish_missing: ['manufacturer'] })
  return {
    create: async (b) => ok((await client.query(
      `INSERT INTO admin_hub_products (title, status, inventory, sku, seller_id, handle, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *`,
      [b.title, live ? 'published' : 'draft', b.inventory, b.sku, b.seller, `h-${b.sku}`, JSON.stringify(b.metadata)],
    )).rows[0]),
    update: async (id, b) => ok((await client.query(
      `UPDATE admin_hub_products SET title = COALESCE($2, title), inventory = COALESCE($3, inventory) WHERE id = $1 RETURNING *`, [id, b.title ?? null, b.inventory ?? null],
    )).rows[0]),
  }
}

const offerEvent = (id, extra = {}) => ({
  id, type: 'Seller:Offer.New',
  event: {
    sellerId: 's_jtl', offerId: 822, quantity: '7', title: 'Halterung', sku: 'H-1', gtin: '4006381333931',
    priceList: [{ id: 'ANDERTAL_B2C', quantityPriceList: [{ amount: '19.99', currency: 'EUR' }] }], ...extra,
  },
})

const connect = (client) => svc.signupSeller({ client, scx: fakeScx() }, { session: 'S1', sellerId: 's_jtl', companyName: 'JTL GmbH' })

test('sign-up connects the seller and attributes it to the JTL partnership', { skip }, async () => {
  const client = await setup()
  try {
    const r = await connect(client)
    assert.equal(r.connected, true)
    const c = (await client.query(`SELECT * FROM erp_connections`)).rows[0]
    assert.deepEqual([c.seller_id, c.external_seller_id, c.status, c.external_account_id], ['s_jtl', 's_jtl', 'active', '4711'])
    const a = (await client.query(`SELECT source FROM jtl_partner_attributions WHERE seller_id = 's_jtl'`)).rows[0]
    assert.equal(a.source, 'jtl_scx_signup')
  } finally { await client.end() }
})

test('offer event → product + link + listed; redelivery is acked without a second product; unknown seller acked', { skip }, async () => {
  const client = await setup()
  try {
    await connect(client)
    const scx = fakeScx([offerEvent('e1'), { id: 'e2', type: 'Seller:Offer.New', event: { sellerId: 'nobody', offerId: 1 } }])
    const ctx = { client, scx, products: fakeProducts(client), shopBaseUrl: 'https://andertal.de' }
    const r = await svc.pollEventsOnce(ctx)
    assert.deepEqual(r, { received: 2, acknowledged: 2, failed: 0 })
    assert.equal(scx.calls.listed[0][0].offerId, 822)
    assert.match(scx.calls.listed[0][0].listingUrl, /andertal\.de\/de\/h-H-1/)
    const p = (await client.query('SELECT * FROM admin_hub_products')).rows
    assert.equal(p.length, 1)
    assert.equal(p[0].metadata.ean, '4006381333931')
    // SCX redelivers e1 (ack lost) → acked, not reprocessed
    const scx2 = fakeScx([offerEvent('e1')])
    await svc.pollEventsOnce({ ...ctx, scx: scx2 })
    assert.deepEqual(scx2.calls.ack, [['e1']])
    assert.equal((await client.query('SELECT count(*)::int AS n FROM admin_hub_products')).rows[0].n, 1)
    // Offer.Update of the same offer updates the linked product
    const scx3 = fakeScx([{ ...offerEvent('e3', { title: 'Halterung Pro' }), type: 'Seller:Offer.Update' }])
    await svc.pollEventsOnce({ ...ctx, scx: scx3 })
    assert.equal((await client.query('SELECT title FROM admin_hub_products')).rows[0].title, 'Halterung Pro')
  } finally { await client.end() }
})

test('offer blocked by the product gates → listing-failed with the reason', { skip }, async () => {
  const client = await setup()
  try {
    await connect(client)
    const scx = fakeScx([offerEvent('e1')])
    await svc.pollEventsOnce({ client, scx, products: fakeProducts(client, { live: false }) })
    assert.equal(scx.calls.listed, undefined)
    assert.match(scx.calls.failed[0][0].errorList[0].message, /manufacturer/)
    assert.equal((await client.query('SELECT status FROM erp_offer_links')).rows[0].status, 'failed')
  } finally { await client.end() }
})

test('variation offer → one product per variation, linked as a family', { skip }, async () => {
  const client = await setup()
  try {
    await connect(client)
    const scx = fakeScx([offerEvent('e1', {
      variationList: [
        { offerId: 901, sku: 'H-S', gtin: '4006381333948', quantity: '1', variationDimensionList: [{ value: 'S' }] },
        { offerId: 902, sku: 'H-M', gtin: '4006381333955', quantity: '2', variationDimensionList: [{ value: 'M' }] },
      ],
    })])
    await svc.pollEventsOnce({ client, scx, products: fakeProducts(client) })
    const rows = (await client.query(`SELECT family_id, metadata->>'family_option_value' AS v FROM admin_hub_products ORDER BY sku`)).rows
    assert.deepEqual(rows.map((r) => r.v), ['M', 'S'])
    assert.ok(rows[0].family_id && rows[0].family_id === rows[1].family_id)
  } finally { await client.end() }
})

test('order export: paid order of a connected seller goes to SCX once; stock cursor updates inventory', { skip }, async () => {
  const client = await setup()
  try {
    await connect(client)
    const ctx = { client, scx: fakeScx([offerEvent('e1')]), products: fakeProducts(client) }
    await svc.pollEventsOnce(ctx)
    const pid = (await client.query('SELECT id FROM admin_hub_products')).rows[0].id
    const { order, items } = await h.addPaidOrder(client, { items: [{ seller: 's_jtl', price: 1999, qty: 2 }], shippingBySeller: { s_jtl: 490 } })
    await client.query('UPDATE store_order_items SET product_id = $1 WHERE id = $2', [pid, items[0].id])
    const r = await svc.exportOrdersOnce(ctx)
    assert.equal(r.exported, 1)
    const sent = ctx.scx.calls.orders[0][0]
    assert.equal(sent.orderId, `A${order.order_number}`)
    assert.deepEqual(sent.orderItem.map((i) => [i.type, i.offerId || null]), [['ITEM', 822], ['SHIPPING', null]])
    assert.equal((await svc.exportOrdersOnce(ctx)).exported, 0)
    // customer cancellation on Andertal → CANCELED_BY_BUYER once
    await client.query('UPDATE store_order_items SET stock_restored_at = now() WHERE order_id = $1', [order.id])
    await svc.exportOrdersOnce(ctx)
    await svc.exportOrdersOnce(ctx)
    assert.equal(ctx.scx.calls.status.length, 1)
    assert.equal(ctx.scx.calls.status[0][0].orderItems[0].itemStatus, 'CANCELED_BY_BUYER')
    await svc.syncStockOnce(ctx)
    assert.equal((await client.query('SELECT inventory FROM admin_hub_products')).rows[0].inventory, 3)
  } finally { await client.end() }
})

test('refund from JTL-Wawi → settlement refund via Stripe + accepted processing result', { skip }, async () => {
  const client = await setup()
  try {
    await connect(client)
    const { order, items } = await h.addPaidOrder(client, { items: [{ seller: 's_jtl', price: 1999, qty: 1 }] })
    await require('../../settlement').createPayablesForOrder(client, order.id)
    const stripe = h.fakeStripe()
    const scx = fakeScx([{ id: 'r1', type: 'Seller:Order.Refund', event: {
      sellerId: 's_jtl', orderId: `A${order.order_number}`, refundId: 'RF1',
      orderItem: [{ orderItemId: items[0].id, quantity: '1', refund: '19.99', refundCurrency: 'EUR' }],
    } }])
    await svc.pollEventsOnce({ client, scx, stripe })
    assert.deepEqual(scx.calls.refundResult, [{ refundId: 'RF1', sellerId: 's_jtl', isAccepted: true }])
    assert.equal(stripe.calls.refunds.length, 1)
    assert.equal(stripe.calls.refunds[0].amount, 1999)
    assert.deepEqual(scx.calls.refundResult, [{ refundId: 'RF1', sellerId: 's_jtl', isAccepted: true }])
  } finally { await client.end() }
})

test('Channel.Unlinked → connection unlinked, attribution ended, later events ignored', { skip }, async () => {
  const client = await setup()
  try {
    await connect(client)
    const scx = fakeScx([{ id: 'u1', type: 'Seller:Channel.Unlinked', event: { sellerId: 's_jtl', reason: 'test', permanentlyRemoved: false } }])
    await svc.pollEventsOnce({ client, scx })
    assert.equal((await client.query('SELECT status FROM erp_connections')).rows[0].status, 'unlinked')
    assert.ok((await client.query(`SELECT ended_at FROM jtl_partner_attributions WHERE seller_id = 's_jtl'`)).rows[0].ended_at)
    const r = await svc.processEvent({ client, scx }, offerEvent('x'))
    assert.equal(r.result, 'unknown or inactive seller')
  } finally { await client.end() }
})

test('shipping from JTL-Wawi → seller shipment + order tracking + order_shipped flow', { skip }, async () => {
  const client = await setup()
  try {
    await connect(client)
    const { order, items } = await h.addPaidOrder(client, { items: [{ seller: 's_jtl', price: 1999, qty: 1 }] })
    const flows = []
    const scx = fakeScx([{ id: 'sh1', type: 'Seller:Order.Shipping', event: {
      sellerId: 's_jtl', orderId: `A${order.order_number}`, shippingComplete: true,
      shippingItems: [{ carrier: 'DHL', trackingNumber: '00340434161234567890', shippedAt: '2026-10-09T08:00:00Z', orderItemIdList: [items[0].id] }],
    } }])
    await svc.pollEventsOnce({ client, scx, dispatchFlow: (k, id) => flows.push([k, id]) })
    const sh = (await client.query('SELECT * FROM order_shipments WHERE order_id = $1', [order.id])).rows[0]
    assert.deepEqual([sh.seller_id, sh.tracking_number, sh.delivery_status], ['s_jtl', '00340434161234567890', 'versendet'])
    const o = (await client.query('SELECT tracking_number, carrier_name, delivery_status FROM store_orders WHERE id = $1', [order.id])).rows[0]
    assert.deepEqual([o.tracking_number, o.carrier_name, o.delivery_status], ['00340434161234567890', 'DHL', 'versendet'])
    assert.deepEqual(flows, [['order_shipped', order.id]])
  } finally { await client.end() }
})

test('seller cancels all its lines in JTL-Wawi → Stripe refund, order storniert, CANCELED_BY_SELLER to SCX', { skip }, async () => {
  const client = await setup()
  try {
    await connect(client)
    const { order, items } = await h.addPaidOrder(client, { items: [{ seller: 's_jtl', price: 2500, qty: 2 }] })
    await require('../../settlement').createPayablesForOrder(client, order.id)
    const stripe = h.fakeStripe()
    const flows = []
    const scx = fakeScx([{ id: 'c1', type: 'Seller:Order.Cancellation.Request', event: {
      sellerId: 's_jtl', orderId: `A${order.order_number}`, orderCancellationRequestId: 'CR1',
      orderItem: [{ orderItemId: items[0].id, quantity: '2' }], cancelReason: 'OUT_OF_STOCK',
    } }])
    const r = await svc.pollEventsOnce({ client, scx, stripe, dispatchFlow: (k, id) => flows.push([k, id]) })
    assert.equal(r.failed, 0)
    assert.equal(stripe.calls.refunds.length, 1)
    assert.equal(stripe.calls.refunds[0].amount, 5000)
    assert.equal((await client.query('SELECT order_status FROM store_orders WHERE id = $1', [order.id])).rows[0].order_status, 'storniert')
    assert.equal(scx.calls.status[0][0].orderItems[0].itemStatus, 'CANCELED_BY_SELLER')
    assert.deepEqual(flows, [['order_cancelled', order.id]])
  } finally { await client.end() }
})
