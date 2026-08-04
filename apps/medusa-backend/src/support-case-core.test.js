'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizePlainText,
  routeCategory,
  normalizeCaseView,
  groupOrderItemsBySeller,
  transitionFor,
  nextStatusAfterMessage,
  canAccessCase,
  detectFileType,
} = require('./support-case-core')
const { archiveEligibleSupportCases, listRetentionPurgeCandidates } = require('./support-case-schema')
const { seedSupportCaseFlows } = require('./seed-support-case-flows')

test('normalizes case text to plain text and removes control characters', () => {
  assert.equal(normalizePlainText('  <script>alert(1)</script>\r\nHello\u0000  world  '), 'alert(1) \nHello world')
  assert.equal(normalizePlainText('abcdef', 3), 'abc')
})

test('routes platform categories without trusting item sellers', () => {
  assert.deepEqual(routeCategory('Payment'), { category: 'payment', accepted: true, isPlatform: true, requiresOrder: false })
  assert.deepEqual(groupOrderItemsBySeller([{ id: '1', seller_id: 'attacker' }], 'payment'), [
    { sellerId: null, items: [{ id: '1', seller_id: 'attacker' }] },
  ])
})

test('whitelists CMS categories and routes invoice/other safely', () => {
  assert.deepEqual(routeCategory('invoice'), { category: 'invoice', accepted: true, isPlatform: false, requiresOrder: true })
  assert.deepEqual(routeCategory('other'), { category: 'other', accepted: true, isPlatform: true, requiresOrder: false })
  assert.deepEqual(routeCategory('made-up'), { category: 'made-up', accepted: false, isPlatform: false, requiresOrder: false })
})

test('normalizes grouped inbox views', () => {
  assert.equal(normalizeCaseView(undefined), '')
  assert.equal(normalizeCaseView('OPEN'), 'open')
  assert.equal(normalizeCaseView('unread'), 'unread')
  assert.equal(normalizeCaseView('closed'), null)
})

test('groups validated order items by backend-derived seller', () => {
  const a = { id: 'a', seller_id: 'seller-a' }
  const b = { id: 'b', seller_id: 'seller-b' }
  const c = { id: 'c', seller_id: 'seller-a' }
  assert.deepEqual(groupOrderItemsBySeller([a, b, c], 'order'), [
    { sellerId: 'seller-a', items: [a, c] },
    { sellerId: 'seller-b', items: [b] },
  ])
  assert.throws(() => groupOrderItemsBySeller([{ id: 'x', seller_id: 'default' }], 'order'), /no routable seller/)
})

test('enforces state transition whitelist and closed message behavior', () => {
  assert.equal(transitionFor('customer', 'close', 'open'), 'closed')
  assert.equal(transitionFor('customer', 'reopen', 'closed'), 'reopened')
  assert.equal(transitionFor('seller', 'close', 'awaiting_support'), null)
  assert.equal(transitionFor('support', 'close', 'awaiting_support'), 'resolved')
  assert.equal(nextStatusAfterMessage('customer', true), 'awaiting_seller')
  assert.equal(nextStatusAfterMessage('customer', false), 'awaiting_support')
  assert.equal(nextStatusAfterMessage('seller', true), 'awaiting_customer')
})

test('authorizes customers, sellers and superusers without object disclosure', () => {
  const supportCase = { customer_id: 'customer-1', customer_email: 'user@example.com', seller_id: 'seller-1' }
  assert.equal(canAccessCase({ role: 'customer', customerId: 'customer-1', email: 'other@example.com' }, supportCase), true)
  assert.equal(canAccessCase({ role: 'customer', customerId: null, email: 'USER@example.com' }, supportCase), true)
  assert.equal(canAccessCase({ role: 'customer', customerId: 'customer-2', email: 'no@example.com' }, supportCase), false)
  assert.equal(canAccessCase({ role: 'seller', sellerId: 'seller-1' }, supportCase), true)
  assert.equal(canAccessCase({ role: 'seller', sellerId: 'seller-2' }, supportCase), false)
  assert.equal(canAccessCase({ role: 'support', isSuperuser: true }, supportCase), true)
})

test('detects allowed files by magic bytes and rejects SVG/spoofed content', () => {
  assert.equal(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0x00])).mime, 'image/jpeg')
  assert.equal(detectFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).mime, 'image/png')
  assert.equal(detectFileType(Buffer.from('RIFFxxxxWEBP')).mime, 'image/webp')
  assert.equal(detectFileType(Buffer.from('%PDF-1.7')).mime, 'application/pdf')
  assert.equal(detectFileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null)
  assert.equal(detectFileType(Buffer.from('not really a jpeg')), null)
})

test('auto-archive is transactional, emits events, and ignores legal hold', async () => {
  const queries = []
  const client = {
    async query(sql, params) {
      queries.push({ sql, params })
      return String(sql).includes('RETURNING case_id') ? { rowCount: 2, rows: [{ id: 'a' }, { id: 'b' }] } : { rowCount: 0, rows: [] }
    },
  }
  const result = await archiveEligibleSupportCases(client, 30)
  assert.equal(result.rowCount, 2)
  assert.equal(queries[0].sql, 'BEGIN')
  assert.match(queries[1].sql, /case_auto_archived/)
  assert.doesNotMatch(queries[1].sql, /legal_hold/)
  assert.equal(queries[2].sql, 'COMMIT')

  queries.length = 0
  await listRetentionPurgeCandidates(client, 730, 10)
  assert.match(queries[0].sql, /legal_hold = false/)
})

test('support flow seed provides six locales and preserves existing flows', async () => {
  const insertedSteps = []
  let nextId = 1
  const client = {
    async query(sql, params) {
      if (String(sql).startsWith('SELECT id')) {
        return { rows: params[0] === 'seller_support_case_updated' ? [{ id: 'custom-flow' }] : [] }
      }
      if (String(sql).includes('INSERT INTO admin_hub_flows')) return { rows: [{ id: `flow-${nextId++}` }] }
      if (String(sql).includes('INSERT INTO admin_hub_flow_steps')) insertedSteps.push(params)
      return { rows: [] }
    },
  }
  await seedSupportCaseFlows(client)
  assert.equal(insertedSteps.length, 2)
  for (const params of insertedSteps) {
    const locales = Object.keys(JSON.parse(params[3])).sort()
    assert.deepEqual(locales, ['de', 'en', 'es', 'fr', 'it', 'tr'])
    assert.match(params[2], /\{SUPPORT_CASE_URL\}/)
  }
})
