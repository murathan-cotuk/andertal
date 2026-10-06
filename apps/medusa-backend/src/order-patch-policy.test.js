'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { authorizeOrderPatch } = require('./order-patch-policy')

const cur = { payment_status: 'bezahlt', order_status: 'offen' }

test('17 seller changing delivery_date → 403', () => {
  const r = authorizeOrderPatch({ delivery_date: '2026-10-01' }, cur, { isSuperuser: false })
  assert.equal(r.ok, false)
  assert.equal(r.status, 403)
  assert.equal(r.field, 'delivery_date')
})

test('seller cannot change payment_status, payout or refund fields', () => {
  assert.equal(authorizeOrderPatch({ payment_status: 'erstattet' }, cur, { isSuperuser: false }).status, 403)
  assert.equal(authorizeOrderPatch({ stripe_payout_status: 'paid' }, cur, { isSuperuser: false }).status, 403)
  assert.equal(authorizeOrderPatch({ refund_status: 'erstattet' }, cur, { isSuperuser: false }).status, 403)
  assert.equal(authorizeOrderPatch({ order_status: 'refunded' }, cur, { isSuperuser: false }).status, 403)
})

test('Sellercentral full-triple save with unchanged payment_status still works', () => {
  assert.deepEqual(authorizeOrderPatch({ order_status: 'in_bearbeitung', payment_status: 'bezahlt', delivery_status: 'versendet' }, cur, { isSuperuser: false }), { ok: true })
})

test('superuser may change money fields (audited in the route)', () => {
  assert.deepEqual(authorizeOrderPatch({ delivery_date: '2026-10-01', payment_status: 'offen' }, cur, { isSuperuser: true }), { ok: true })
})
