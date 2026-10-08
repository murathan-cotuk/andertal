'use strict'

/**
 * Settlement integration tests against a real PostgreSQL (SETTLEMENT_TEST_PG_URL). They are
 * skipped — and say so — when no test database is configured; CI/devs run them with e.g.
 *   SETTLEMENT_TEST_PG_URL=postgres://postgres:postgres@localhost:55432/settlement_test npm run test:settlement
 * Numbering follows the required test list (docs/Odeme-Payout-Denetimi.md, Phase 22).
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const h = require('./test-helpers')
const s = require('./index')

const skip = !h.TEST_PG_URL && 'SETTLEMENT_TEST_PG_URL not set — integration tests need a PostgreSQL test database'
const DAY = 86400000

const withDb = (name, fn) => test(name, { skip, concurrency: false }, async () => {
  const client = await h.freshDatabase()
  try { await fn(client) } finally { await client.end() }
})

const payablesOf = async (c, orderId) => (await c.query('SELECT * FROM seller_payables WHERE order_id = $1 ORDER BY kind, seller_id', [orderId])).rows
const claimable = async (c, sellerId) => (await s.claimableEntries(c, sellerId)).reduce((a, e) => a + Number(e.amount_cents), 0)
const refundAndApply = async (c, stripe, args) => {
  const { refund } = await s.createRefundRecord(c, args)
  return s.executeRefund(c, stripe, refund.id)
}

withDb('01 single seller 100 € at 12 % → 88 € (EU seller, reverse charge)', async (c) => {
  await h.addSeller(c, 'seller_a', { rate: 0.12 })
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  const [p] = await payablesOf(c, order.id)
  assert.equal(Number(p.gross_cents), 10000)
  assert.equal(Number(p.commission_cents), 1200)
  assert.equal(Number(p.net_cents), 8800)
  assert.equal(await h.balanceOf(c, 'seller_a'), 8800)
})

withDb('02 two sellers 60 € / 40 € → each paid only their own share', async (c) => {
  await h.addSeller(c, 'seller_a', { rate: 0.12 })
  await h.addSeller(c, 'seller_b', { rate: 0.12 })
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 6000 }, { seller: 'seller_b', price: 4000 }] })
  await s.createPayablesForOrder(c, order.id)
  assert.equal(await h.balanceOf(c, 'seller_a'), 6000 - 720)
  assert.equal(await h.balanceOf(c, 'seller_b'), 4000 - 480)
  const hdr = (await c.query('SELECT seller_id FROM store_orders WHERE id = $1', [order.id])).rows[0]
  assert.equal(hdr.seller_id, 'default') // header stays platform; nothing is ever booked on 'default'
  assert.equal((await c.query(`SELECT COUNT(*)::int AS n FROM seller_ledger_entries WHERE seller_id = 'default'`)).rows[0].n, 0)
})

withDb('03 commission rate change does not touch an existing order', async (c) => {
  await h.addSeller(c, 'seller_a', { rate: 0.12 })
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  await c.query(`UPDATE seller_users SET commission_rate = 0.30 WHERE seller_id = 'seller_a'`)
  await s.createPayablesForOrder(c, order.id) // re-run (sweeper / webhook) must not re-price
  const [p] = await payablesOf(c, order.id)
  assert.equal(Number(p.commission_cents), 1200)
  await assert.rejects(c.query('UPDATE seller_payables SET commission_cents = 3000 WHERE id = $1', [p.id]), /immutable/)
  const { order: o2 } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, o2.id)
  assert.equal(Number((await payablesOf(c, o2.id))[0].commission_cents), 3000)
})

withDb('04 delivered less than 14 days ago → no payout', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  await h.deliver(c, order.id, 13)
  const [p] = await payablesOf(c, order.id)
  assert.equal(p.status, 'pending')
  assert.deepEqual(p.block_reasons, ['hold_period'])
  assert.ok(p.eligible_at)
  const r = await s.createSettlementPayout(c, { sellerId: 'seller_a', businessKey: 'T4', accountId: 'acct_seller_a' })
  assert.equal(r.payout, null)
  assert.equal(r.skipped, 'nothing_due')
})

withDb('05 delivered 14+ days ago → eligible and paid out', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  await h.deliver(c, order.id, 15)
  assert.equal((await payablesOf(c, order.id))[0].status, 'eligible')
  const stripe = h.fakeStripe()
  const res = await s.runScheduledPayouts(c, stripe, { runKey: '2026-10-09' })
  const mine = res.find((r) => r.sellerId === 'seller_a')
  assert.ok(mine.payoutId, JSON.stringify(res))
  assert.equal(stripe.calls.transfers.length, 1)
  assert.equal(stripe.calls.transfers[0].amount, 8800)
  assert.equal(stripe.calls.transfers[0].destination, 'acct_seller_a')
  assert.equal(stripe.calls.transfers[0].transfer_group, `ORDER_${order.id}`)
  assert.match(stripe.calls.transfers[0].source_transaction, /^ch_/)
  assert.equal((await payablesOf(c, order.id))[0].status, 'in_payout')
  await s.handleStripePayoutEvent(c, { id: stripe.calls.payouts[0].id }, 'payout.paid')
  assert.equal((await payablesOf(c, order.id))[0].status, 'paid')
  assert.equal(await h.balanceOf(c, 'seller_a'), 0)
})

withDb('06 open return blocks the payable', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  await c.query(`INSERT INTO store_returns (order_id, status, seller_id) VALUES ($1, 'offen', 'seller_a')`, [order.id])
  await h.deliver(c, order.id, 20)
  const [p] = await payablesOf(c, order.id)
  assert.equal(p.status, 'blocked')
  assert.ok(p.block_reasons.includes('return_open'))
  assert.equal(await claimable(c, 'seller_a'), 0)
})

withDb('07 full refund → payable 0, commission fully reversed', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order, items } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  const stripe = h.fakeStripe()
  const r = await refundAndApply(c, stripe, { orderId: order.id, amountCents: 10000, lines: [{ order_item_id: items[0].id, quantity: 1 }], idempotencyKey: 'full' })
  assert.equal(r.status, 'succeeded')
  const [p] = await payablesOf(c, order.id)
  assert.equal(Number(p.net_cents), 0)
  assert.equal(Number(p.refund_commission_reversal_cents), 1200)
  assert.equal(p.status, 'refunded')
  assert.equal(await h.balanceOf(c, 'seller_a'), 0)
})

withDb('08 partial refund 40 € on 100 € → settlement on 60 €', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  const stripe = h.fakeStripe()
  await refundAndApply(c, stripe, { orderId: order.id, amountCents: 4000, idempotencyKey: 'partial-40' })
  const [p] = await payablesOf(c, order.id)
  assert.equal(Number(p.refunded_gross_cents), 4000)
  assert.equal(Number(p.refund_commission_reversal_cents), 480)
  assert.equal(Number(p.net_cents), 6000 - 720)
  assert.equal(stripe.calls.refunds[0].amount, 4000)
})

withDb('09 refund after payout → negative balance (not clamped)', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order, items } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  await h.deliver(c, order.id, 20)
  const stripe = h.fakeStripe()
  await s.runScheduledPayouts(c, stripe, { runKey: 'R1' })
  await s.handleStripePayoutEvent(c, { id: stripe.calls.payouts[0].id }, 'payout.paid')
  await refundAndApply(c, stripe, { orderId: order.id, amountCents: 10000, lines: [{ order_item_id: items[0].id, quantity: 1 }], idempotencyKey: 'after' })
  assert.equal(await h.balanceOf(c, 'seller_a'), -8800)
  assert.equal(await claimable(c, 'seller_a'), -8800)
  const r = await s.createSettlementPayout(c, { sellerId: 'seller_a', businessKey: 'R2', accountId: 'acct_seller_a' })
  assert.equal(r.payout, null)
  assert.equal(r.skipped, 'negative_balance')
})

withDb('10 negative balance is offset against the next order', async (c) => {
  await h.addSeller(c, 'seller_a')
  const stripe = h.fakeStripe()
  const { order, items } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  await h.deliver(c, order.id, 30)
  await s.runScheduledPayouts(c, stripe, { runKey: 'R1' })
  await s.handleStripePayoutEvent(c, { id: stripe.calls.payouts[0].id }, 'payout.paid')
  await refundAndApply(c, stripe, { orderId: order.id, amountCents: 4000, idempotencyKey: 'post-40' }) // −40 + 4.80
  const { order: o2 } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 20000 }] })
  await s.createPayablesForOrder(c, o2.id)
  await h.deliver(c, o2.id, 15)
  await s.runScheduledPayouts(c, stripe, { runKey: 'R2' })
  // 200 − 24 (commission) − 40 + 4.80 = 140.80
  assert.equal(stripe.calls.transfers[1].amount, 20000 - 2400 - 4000 + 480)
})

withDb('11 open chargeback blocks the payable', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order, pi } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  await h.deliver(c, order.id, 20)
  await s.handleDispute(c, { id: 'dp_1', payment_intent: pi, amount: 10000, currency: 'eur', status: 'needs_response' }, { eventType: 'charge.dispute.created' })
  const [p] = await payablesOf(c, order.id)
  assert.equal(p.status, 'blocked')
  assert.ok(p.block_reasons.includes('dispute_open'))
  assert.equal(await claimable(c, 'seller_a'), 0)
  // won → released, payable eligible again with the full amount
  await s.handleDispute(c, { id: 'dp_1', payment_intent: pi, amount: 10000, currency: 'eur', status: 'won' }, { eventType: 'charge.dispute.closed' })
  assert.equal((await payablesOf(c, order.id))[0].status, 'eligible')
  assert.equal(await claimable(c, 'seller_a'), 8800)
})

withDb('12 chargeback after payout → receivable (negative balance)', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order, pi } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  await h.deliver(c, order.id, 20)
  const stripe = h.fakeStripe()
  await s.runScheduledPayouts(c, stripe, { runKey: 'R1' })
  await s.handleStripePayoutEvent(c, { id: stripe.calls.payouts[0].id }, 'payout.paid')
  const dispute = { id: 'dp_2', payment_intent: pi, amount: 10000, currency: 'eur', status: 'needs_response' }
  await s.handleDispute(c, dispute, { eventType: 'charge.dispute.created' })
  await s.handleDispute(c, dispute, { eventType: 'charge.dispute.funds_withdrawn' }) // replay-safe
  assert.equal(await h.balanceOf(c, 'seller_a'), -10000)
  await s.handleDispute(c, { ...dispute, status: 'lost' }, { eventType: 'charge.dispute.closed' })
  // lost: commission is reversed pro rata (§305c Abs. 2 BGB) → seller owes exactly what was paid out
  assert.equal(await h.balanceOf(c, 'seller_a'), -8800)
  assert.equal((await c.query(`SELECT outcome FROM order_disputes WHERE stripe_dispute_id = 'dp_2'`)).rows[0].outcome, 'lost')
})

withDb('13 duplicate webhook is processed once', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order, items, pi } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  const stripe = h.fakeStripe()
  // a refund created in the Stripe Dashboard, delivered twice
  const event = { id: 'evt_dup', type: 'charge.refunded', data: { object: { id: 'ch_x', payment_intent: pi, refunds: { data: [{ id: 're_ext', amount: 3000, status: 'succeeded', payment_intent: pi, currency: 'eur', metadata: {} }] } } } }
  const a = await s.processStripeEvent(c, stripe, event)
  const b = await s.processStripeEvent(c, stripe, event)
  assert.equal(a.status, 'processed')
  assert.equal(b.status, 'duplicate')
  const [p] = await payablesOf(c, order.id)
  assert.equal(Number(p.refunded_gross_cents), 3000)
  assert.equal((await c.query(`SELECT COUNT(*)::int AS n FROM seller_ledger_entries WHERE event_type = 'REFUND'`)).rows[0].n, 1)
  // a different event id carrying the same refund is also booked once (per-refund idempotency)
  await s.processStripeEvent(c, stripe, { ...event, id: 'evt_dup_2', type: 'refund.updated', data: { object: event.data.object.refunds.data[0] } })
  assert.equal(Number((await payablesOf(c, order.id))[0].refunded_gross_cents), 3000)
  assert.ok(items.length)
})

withDb('14 payout job run twice → paid once', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  await h.deliver(c, order.id, 20)
  const stripe = h.fakeStripe()
  await Promise.all([
    s.runScheduledPayouts(c, stripe, { runKey: 'SAME' }),
  ])
  await s.runScheduledPayouts(c, stripe, { runKey: 'SAME' })
  await s.runScheduledPayouts(c, stripe, { runKey: 'OTHER' }) // different run, nothing left
  assert.equal(stripe.calls.transfers.length, 1)
  assert.equal(stripe.calls.payouts.length, 1)
  assert.equal((await c.query('SELECT COUNT(*)::int AS n FROM seller_settlement_payouts')).rows[0].n, 1)
  // claim uniqueness at the DB level: an entry cannot be claimed by a second payout
  const entry = (await c.query(`SELECT ledger_entry_id FROM seller_payout_items LIMIT 1`)).rows[0]
  const other = (await c.query(
    `INSERT INTO seller_settlement_payouts (seller_id, business_key, method, amount_cents, status) VALUES ('seller_a', 'X', 'stripe_connect', 1, 'paid') RETURNING id`,
  )).rows[0]
  await assert.rejects(c.query('INSERT INTO seller_payout_items (payout_id, ledger_entry_id, amount_cents) VALUES ($1, $2, 1)', [other.id, entry.ledger_entry_id]), /duplicate key/)
})

withDb('15 transfer failure → payout failed, nothing marked paid, claims released', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  await h.deliver(c, order.id, 20)
  const stripe = h.fakeStripe({ fail: { transfer: { message: 'Insufficient funds', once: true } } })
  const [res] = await s.runScheduledPayouts(c, stripe, { runKey: 'F1' })
  assert.equal(res.ok, false)
  const po = (await c.query('SELECT * FROM seller_settlement_payouts')).rows[0]
  assert.equal(po.status, 'failed')
  assert.equal((await payablesOf(c, order.id))[0].status, 'eligible')
  assert.equal(await h.balanceOf(c, 'seller_a'), 8800) // PAYOUT + PAYOUT_REVERSAL cancel out
  assert.equal(await claimable(c, 'seller_a'), 8800)
})

withDb('16 bank payout failed → retry produces exactly one success', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  await h.deliver(c, order.id, 20)
  const stripe = h.fakeStripe()
  await s.runScheduledPayouts(c, stripe, { runKey: 'B1' })
  const first = stripe.calls.payouts[0]
  await s.handleStripePayoutEvent(c, { id: first.id, failure_code: 'account_closed' }, 'payout.failed')
  let po = (await c.query('SELECT * FROM seller_settlement_payouts')).rows[0]
  assert.equal(po.status, 'payout_failed')
  assert.notEqual((await payablesOf(c, order.id))[0].status, 'paid')
  // a new run must not transfer again while this payout is unresolved
  await s.runScheduledPayouts(c, stripe, { runKey: 'B2' })
  assert.equal(stripe.calls.transfers.length, 1)
  stripe.opts.payoutStatus = { [first.id]: 'failed' }
  await s.retryBankPayout(c, stripe, po.id)
  assert.equal(stripe.calls.payouts.length, 2)
  assert.equal(stripe.calls.transfers.length, 1)
  await assert.rejects(s.retryBankPayout(c, stripe, po.id), /not payout_failed/)
  await s.handleStripePayoutEvent(c, { id: stripe.calls.payouts[1].id }, 'payout.paid')
  await s.handleStripePayoutEvent(c, { id: first.id }, 'payout.paid') // stale attempt can't double-book
  po = (await c.query('SELECT * FROM seller_settlement_payouts')).rows[0]
  assert.equal(po.status, 'paid')
  assert.equal(await h.balanceOf(c, 'seller_a'), 0)
})

withDb('18 Seller A cannot refund Seller B’s item', async (c) => {
  await h.addSeller(c, 'seller_a')
  await h.addSeller(c, 'seller_b')
  const { order, items } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 6000 }, { seller: 'seller_b', price: 4000 }] })
  await s.createPayablesForOrder(c, order.id)
  await assert.rejects(
    s.createRefundRecord(c, { orderId: order.id, amountCents: 4000, lines: [{ order_item_id: items[1].id, quantity: 1 }], actorSellerId: 'seller_a', idempotencyKey: 'x' }),
    (e) => e.status === 403,
  )
  await assert.rejects(
    s.createRefundRecord(c, { orderId: order.id, amountCents: 1000, idempotencyKey: 'y' }),
    /refund lines or seller scope required/,
  )
  // superuser with explicit lines: only seller_b is debited
  const stripe = h.fakeStripe()
  await refundAndApply(c, stripe, { orderId: order.id, amountCents: 4000, lines: [{ order_item_id: items[1].id, quantity: 1 }], idempotencyKey: 'z' })
  assert.equal(await h.balanceOf(c, 'seller_a'), 6000 - 720)
  assert.equal(await h.balanceOf(c, 'seller_b'), 0)
})

withDb('19 Stripe refund failure → not completed, no ledger impact', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  const ret = (await c.query(`INSERT INTO store_returns (order_id, status, seller_id) VALUES ($1, 'eingegangen', 'seller_a') RETURNING id`, [order.id])).rows[0]
  const stripe = h.fakeStripe({ fail: { refund: { message: 'charge_already_refunded' } } })
  const r = await refundAndApply(c, stripe, { orderId: order.id, returnId: ret.id, amountCents: 10000, idempotencyKey: 'f' })
  assert.equal(r.status, 'failed')
  assert.equal((await c.query('SELECT refund_status FROM store_returns WHERE id = $1', [ret.id])).rows[0].refund_status, 'fehlgeschlagen')
  assert.equal(await h.balanceOf(c, 'seller_a'), 8800)
  // async failure reported by webhook after 'pending'
  const stripe2 = h.fakeStripe({ refundStatus: 'pending' })
  const r2 = await refundAndApply(c, stripe2, { orderId: order.id, amountCents: 5000, idempotencyKey: 'g' })
  assert.equal(r2.status, 'processing')
  await s.syncStripeRefund(c, { id: r2.stripe_refund_id, status: 'failed', failure_reason: 'expired_or_canceled_card', metadata: {} })
  assert.equal((await c.query('SELECT status FROM order_refunds WHERE id = $1', [r2.id])).rows[0].status, 'failed')
  assert.equal(await h.balanceOf(c, 'seller_a'), 8800)
})

withDb('20 Stripe fee, payable and commission are booked separately', async (c) => {
  await h.addSeller(c, 'seller_a')
  const stripe = h.fakeStripe({ fee: 175 })
  const o = (await c.query(`INSERT INTO store_orders (payment_intent_id, subtotal_cents, total_cents) VALUES ('pi_fee', 10000, 10000) RETURNING *`)).rows[0]
  await c.query(`INSERT INTO store_order_items (order_id, quantity, unit_price_cents, seller_id) VALUES ($1, 1, 10000, 'seller_a')`, [o.id])
  await s.processStripeEvent(c, stripe, { id: 'evt_pi', type: 'payment_intent.succeeded', data: { object: { id: 'pi_fee', amount: 10000, amount_received: 10000, currency: 'eur', latest_charge: 'ch_fee', created: 1 } } })
  const pay = (await c.query('SELECT * FROM order_payments WHERE order_id = $1', [o.id])).rows[0]
  assert.equal(Number(pay.gross_amount_cents), 10000)
  assert.equal(Number(pay.stripe_fee_cents), 175)
  assert.equal(pay.fee_bearer, 'platform')
  const types = (await c.query(`SELECT event_type, amount_cents FROM seller_ledger_entries ORDER BY event_type`)).rows
  assert.deepEqual(types.map((t) => [t.event_type, Number(t.amount_cents)]), [['COMMISSION', -1200], ['SALE', 10000]])
  // fee bearer configured to seller → separate ADJUSTMENT, commission untouched
  process.env.PLATFORM_STRIPE_FEE_BEARER = 'seller'
  try {
    await s.bookStripeFeeIfSellerBorne(c, o.id)
    await s.bookStripeFeeIfSellerBorne(c, o.id)
  } finally { delete process.env.PLATFORM_STRIPE_FEE_BEARER }
  const adj = (await c.query(`SELECT amount_cents FROM seller_ledger_entries WHERE event_type = 'ADJUSTMENT'`)).rows
  assert.deepEqual(adj.map((a) => Number(a.amount_cents)), [-175])
})

withDb('ledger is append-only and manual "paid" needs reference + exact amount', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  await h.deliver(c, order.id, 20)
  await assert.rejects(c.query(`UPDATE seller_ledger_entries SET amount_cents = 1`), /append-only/)
  await assert.rejects(c.query(`DELETE FROM seller_ledger_entries`), /append-only/)
  await assert.rejects(s.createSettlementPayout(c, { sellerId: 'seller_a', method: 'manual_bank_transfer', businessKey: 'M1', expectedAmountCents: 8800 }), /reference/)
  await assert.rejects(s.createSettlementPayout(c, { sellerId: 'seller_a', method: 'manual_bank_transfer', businessKey: 'M1', externalReference: 'SEPA-2026-000123', expectedAmountCents: 9999 }), /Amount mismatch/)
  const ok = await s.createSettlementPayout(c, { sellerId: 'seller_a', method: 'manual_bank_transfer', businessKey: 'M1', externalReference: 'SEPA-2026-000123', expectedAmountCents: 8800, actor: 'su' })
  assert.equal(ok.payout.status, 'paid')
  const again = await s.createSettlementPayout(c, { sellerId: 'seller_a', method: 'manual_bank_transfer', businessKey: 'M1', externalReference: 'SEPA-2026-000123', expectedAmountCents: 8800, actor: 'su' })
  assert.equal(again.existing, true)
  assert.equal((await c.query(`SELECT COUNT(*)::int AS n FROM finance_audit_log WHERE action = 'payout_marked_paid_manual'`)).rows[0].n, 1)
  assert.equal(await h.balanceOf(c, 'seller_a'), 0)
})

withDb('multi-seller shipping: each seller gets own shipping; item refund keeps shipping', async (c) => {
  await h.addSeller(c, 'seller_a')
  await h.addSeller(c, 'seller_b')
  const { order, items } = await h.addPaidOrder(c, {
    items: [{ seller: 'seller_a', price: 2500, qty: 2 }, { seller: 'seller_b', price: 4000 }],
    shippingBySeller: { seller_a: 490, seller_b: 0 },
  })
  await s.createPayablesForOrder(c, order.id)
  assert.equal(await h.balanceOf(c, 'seller_a'), 5000 - 600 + 490)
  const stripe = h.fakeStripe()
  await refundAndApply(c, stripe, { orderId: order.id, amountCents: 2500, lines: [{ order_item_id: items[0].id, quantity: 1 }], idempotencyKey: 'one-unit' })
  assert.equal(await h.balanceOf(c, 'seller_a'), 2500 - 300 + 490)
  await assert.rejects(
    s.createRefundRecord(c, { orderId: order.id, amountCents: 5000, lines: [{ order_item_id: items[0].id, quantity: 2 }], idempotencyKey: 'too-many' }),
    /exceeds refundable/,
  )
})

withDb('delivery can only be confirmed by trusted sources', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 1000 }] })
  await assert.rejects(s.confirmDelivery(c, order.id, { source: 'seller' }), /untrusted/)
})

withDb('Stripe: recipient account required; legacy platform-filled accounts are not paid', async (c) => {
  await h.addSeller(c, 'seller_full', { agreement: 'full' })
  await h.addSeller(c, 'seller_notos', { tosAt: null })
  for (const sid of ['seller_full', 'seller_notos']) {
    const { order } = await h.addPaidOrder(c, { items: [{ seller: sid, price: 5000 }] })
    await s.createPayablesForOrder(c, order.id)
    await h.deliver(c, order.id, 20)
  }
  const stripe = h.fakeStripe()
  const res = await s.runScheduledPayouts(c, stripe, { runKey: 'RCP' })
  assert.equal(res.find((r) => r.sellerId === 'seller_full').skipped, 'service_agreement_not_recipient')
  assert.equal(res.find((r) => r.sellerId === 'seller_notos').skipped, 'tos_not_accepted_by_seller')
  assert.equal(stripe.calls.transfers.length, 0)
})

withDb('Stripe: one transfer per order with source_transaction; bank payout waits for available funds', async (c) => {
  await h.addSeller(c, 'seller_a')
  const o1 = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  const o2 = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 5000 }] })
  for (const o of [o1, o2]) { await s.createPayablesForOrder(c, o.order.id); await h.deliver(c, o.order.id, 20) }
  const stripe = h.fakeStripe({ available: 0 })
  await s.runScheduledPayouts(c, stripe, { runKey: 'PER-ORDER' })
  assert.equal(stripe.calls.transfers.length, 2)
  assert.deepEqual(stripe.calls.transfers.map((t) => t.amount).sort((a, b) => a - b), [4400, 8800])
  assert.ok(stripe.calls.transfers.every((t) => t.source_transaction && t.transfer_group.startsWith('ORDER_')))
  let po = (await c.query('SELECT * FROM seller_settlement_payouts')).rows[0]
  assert.equal(po.status, 'transferred')     // recipient funds not yet available (~24 h)
  assert.equal(stripe.calls.payouts.length, 0)
  await s.reconcileInFlight(c, stripe)        // still unavailable → still waiting, no retransfer
  assert.equal(stripe.calls.transfers.length, 2)
  stripe.opts.available = null               // funds available now
  await s.reconcileInFlight(c, stripe)
  assert.equal(stripe.calls.payouts.length, 1)
  assert.equal(stripe.calls.payouts[0].amount, 13200)
  po = (await c.query('SELECT * FROM seller_settlement_payouts')).rows[0]
  assert.equal(po.status, 'payout_pending')
})

withDb('Stripe: negative connected balance is not ignored (seller blocked + audited)', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  await h.deliver(c, order.id, 20)
  const stripe = h.fakeStripe({ available: -500, connectReserved: 500 })
  await s.runScheduledPayouts(c, stripe, { runKey: 'NEG' })
  assert.equal(stripe.calls.payouts.length, 0)
  const su = (await c.query(`SELECT payout_blocked, payout_block_reason FROM seller_users WHERE seller_id = 'seller_a'`)).rows[0]
  assert.equal(su.payout_blocked, true)
  assert.equal(su.payout_block_reason, 'connected_balance_negative')
  const actions = (await c.query('SELECT action FROM finance_audit_log')).rows.map((r) => r.action)
  assert.ok(actions.includes('connected_balance_negative'))
  assert.ok(actions.includes('platform_connect_reserved'))
})

withDb('Stripe: coupon-subsidised order — transfer never exceeds the charge', async (c) => {
  await h.addSeller(c, 'seller_a', { rate: 0 })
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }], paidCents: 9000 })
  await s.createPayablesForOrder(c, order.id)
  await h.deliver(c, order.id, 20)
  const stripe = h.fakeStripe()
  await s.runScheduledPayouts(c, stripe, { runKey: 'CPN' })
  const withSrc = stripe.calls.transfers.filter((t) => t.source_transaction)
  const without = stripe.calls.transfers.filter((t) => !t.source_transaction)
  assert.equal(withSrc[0].amount, 9000)
  assert.equal(without[0].amount, 1000)
})

withDb('14b two payout runs in parallel on separate connections → money moves once', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  await h.deliver(c, order.id, 20)
  const { Client } = require('pg')
  const c2 = new Client({ connectionString: h.TEST_PG_URL })
  await c2.connect()
  try {
    const stripe = h.fakeStripe()
    await Promise.all([
      s.runScheduledPayouts(c, stripe, { runKey: 'PAR-1' }),
      s.runScheduledPayouts(c2, stripe, { runKey: 'PAR-2' }),
    ])
    assert.equal(stripe.calls.transfers.length, 1)
    assert.equal(stripe.calls.transfers[0].amount, 8800)
    assert.equal((await c.query('SELECT COUNT(*)::int AS n FROM seller_settlement_payouts')).rows[0].n, 1)
  } finally { await c2.end() }
})

withDb('line refund below customer value (Wertersatz) debits the seller pro rata', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order, items } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 6000 }] })
  await s.createPayablesForOrder(c, order.id)
  const stripe = h.fakeStripe()
  await refundAndApply(c, stripe, { orderId: order.id, amountCents: 1000, lines: [{ order_item_id: items[0].id, quantity: 1 }], idempotencyKey: 'wertersatz' })
  const [p] = await payablesOf(c, order.id)
  assert.equal(Number(p.refunded_gross_cents), 1000)
  assert.equal(await h.balanceOf(c, 'seller_a'), 6000 - 720 - 1000 + 120)
})

withDb('full line refund of a coupon-discounted order reverses the full seller credit', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order, items } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 10000 }], paidCents: 9000 })
  await s.createPayablesForOrder(c, order.id)
  const stripe = h.fakeStripe()
  await refundAndApply(c, stripe, { orderId: order.id, amountCents: 9000, lines: [{ order_item_id: items[0].id, quantity: 1 }], idempotencyKey: 'cpn-full' })
  assert.equal(await h.balanceOf(c, 'seller_a'), 0)
  assert.equal(stripe.calls.refunds[0].amount, 9000)
})

withDb('01-DE German seller 100 € at 12 % → 85,72 € (commission 12 € + 19 % USt 2,28 € withheld)', async (c) => {
  await h.addSeller(c, 'seller_de', { country: 'DE', vatId: 'DE123456789' })
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_de', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  const [p] = await payablesOf(c, order.id)
  assert.equal(Number(p.commission_cents), 1200)
  assert.equal(Number(p.commission_vat_cents), 228)
  assert.equal(p.commission_vat_scheme, 'domestic')
  assert.equal(Number(p.net_cents), 8572)
  assert.equal(await h.balanceOf(c, 'seller_de'), 8572)
  const vatEntry = (await c.query(`SELECT amount_cents FROM seller_ledger_entries WHERE idempotency_key = $1`, [`COMMISSION_VAT:${p.id}`])).rows[0]
  assert.equal(Number(vatEntry.amount_cents), -228)
})

withDb('01-DE partial refund corrects commission VAT pro rata (§17 UStG); full refund → 0', async (c) => {
  await h.addSeller(c, 'seller_de', { country: 'DE', vatId: null })
  const { order, items } = await h.addPaidOrder(c, { items: [{ seller: 'seller_de', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  const stripe = h.fakeStripe()
  await refundAndApply(c, stripe, { orderId: order.id, amountCents: 4000, idempotencyKey: 'de-40' })
  let [p] = await payablesOf(c, order.id)
  assert.equal(Number(p.refund_commission_vat_reversal_cents), 91) // 228 × 40 %
  assert.equal(Number(p.net_cents), 6000 - 720 - 137)
  await refundAndApply(c, stripe, { orderId: order.id, amountCents: 6000, lines: [{ order_item_id: items[0].id, quantity: 1 }], idempotencyKey: 'de-rest' })
  ;[p] = await payablesOf(c, order.id)
  assert.equal(Number(p.net_cents), 0)
  assert.equal(await h.balanceOf(c, 'seller_de'), 0)
})

withDb('commission VAT schemes: EU without VAT ID taxed in DE, non-EU not taxable', async (c) => {
  await h.addSeller(c, 'seller_fr_novat', { country: 'FR', vatId: '' })
  await h.addSeller(c, 'seller_ch', { country: 'CH', vatId: 'CHE-123.456.789' })
  const o1 = await h.addPaidOrder(c, { items: [{ seller: 'seller_fr_novat', price: 10000 }] })
  const o2 = await h.addPaidOrder(c, { items: [{ seller: 'seller_ch', price: 10000 }] })
  await s.createPayablesForOrder(c, o1.order.id)
  await s.createPayablesForOrder(c, o2.order.id)
  const [p1] = await payablesOf(c, o1.order.id)
  const [p2] = await payablesOf(c, o2.order.id)
  assert.equal(p1.commission_vat_scheme, 'domestic_no_vat_id'); assert.equal(Number(p1.commission_vat_cents), 228)
  assert.equal(p2.commission_vat_scheme, 'non_eu_not_taxable'); assert.equal(Number(p2.commission_vat_cents), 0)
})

withDb('lost chargeback reverses commission + VAT pro rata by default (§305c Abs. 2 BGB)', async (c) => {
  await h.addSeller(c, 'seller_de', { country: 'DE', vatId: 'DE123456789' })
  const { order, pi } = await h.addPaidOrder(c, { items: [{ seller: 'seller_de', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  const d = { id: 'dp_l', payment_intent: pi, amount: 10000, currency: 'eur', status: 'needs_response' }
  await s.handleDispute(c, d, { eventType: 'charge.dispute.created' })
  await s.handleDispute(c, { ...d, status: 'lost' }, { eventType: 'charge.dispute.closed' })
  assert.equal(await h.balanceOf(c, 'seller_de'), 0)
})

withDb('DAC7 consideration is net of fees (PStTG / DAC7 Annex V I.C.9)', async (c) => {
  await h.addSeller(c, 'seller_de', { country: 'DE', vatId: 'DE123456789' })
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_de', price: 10000 }] })
  await s.createPayablesForOrder(c, order.id)
  const year = new Date().getFullYear()
  const [f] = await s.dac7Figures(c, year)
  assert.equal(f.gross_cents, 10000)
  assert.equal(f.fees_cents, 1428)
  assert.equal(f.consideration_cents, 8572)
  assert.equal(f.transaction_count, 1)
})

withDb('Dashboard refund on a multi-seller order waits for superuser allocation, then books once', async (c) => {
  await h.addSeller(c, 'seller_a'); await h.addSeller(c, 'seller_b')
  const { order, pi } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 6000 }, { seller: 'seller_b', price: 4000 }] })
  await s.createPayablesForOrder(c, order.id)
  await h.deliver(c, order.id, 20)
  const stripe = h.fakeStripe()
  await s.syncStripeRefund(c, { id: 're_dash', amount: 2000, status: 'succeeded', payment_intent: pi, currency: 'eur', metadata: {} })
  const r = (await c.query(`SELECT * FROM order_refunds WHERE stripe_refund_id = 're_dash'`)).rows[0]
  assert.equal(r.status, 'pending')
  assert.ok((await payablesOf(c, order.id)).every((p) => p.status === 'blocked'))
  await s.allocateExternalRefund(c, r.id, { sellerId: 'seller_b', actor: 'su' })
  await assert.rejects(s.allocateExternalRefund(c, r.id, { sellerId: 'seller_b' }), /already booked/)
  assert.equal(await h.balanceOf(c, 'seller_b'), 4000 - 480 - 2000 + 240)
  assert.equal(await h.balanceOf(c, 'seller_a'), 6000 - 720)
  assert.ok((await payablesOf(c, order.id)).every((p) => p.status === 'eligible'))
  assert.ok(stripe)
})

withDb('reverse charge only with a VIES-verified VAT ID that matches the current one', async (c) => {
  await h.addSeller(c, 'seller_at_unverified', { country: 'AT', vatId: 'ATU99999999', viesValid: null })
  const o = await h.addPaidOrder(c, { items: [{ seller: 'seller_at_unverified', price: 10000 }] })
  await s.createPayablesForOrder(c, o.order.id)
  assert.equal((await payablesOf(c, o.order.id))[0].commission_vat_scheme, 'domestic_no_vat_id')
  // VIES says valid → next orders are reverse charge; changing the ID resets it until re-checked
  await s.refreshSellerVatIdsViaVies(c, { check: async () => ({ ok: true, valid: true }) })
  const o2 = await h.addPaidOrder(c, { items: [{ seller: 'seller_at_unverified', price: 10000 }] })
  await s.createPayablesForOrder(c, o2.order.id)
  assert.equal((await payablesOf(c, o2.order.id))[0].commission_vat_scheme, 'reverse_charge_eu')
  await c.query(`UPDATE seller_users SET vat_id = 'ATU11111111' WHERE seller_id = 'seller_at_unverified'`)
  const o3 = await h.addPaidOrder(c, { items: [{ seller: 'seller_at_unverified', price: 10000 }] })
  await s.createPayablesForOrder(c, o3.order.id)
  assert.equal((await payablesOf(c, o3.order.id))[0].commission_vat_scheme, 'domestic_no_vat_id')
})

withDb('Widerruf: return of all of a seller\'s items refunds the outbound shipping too (§357 Abs. 2 BGB)', async (c) => {
  await h.addSeller(c, 'seller_a', { rate: 0.1 })
  const { order, items } = await h.addPaidOrder(c, {
    items: [{ seller: 'seller_a', price: 2000, qty: 2 }, { seller: 'seller_a', price: 1500 }],
    shippingBySeller: { seller_a: 490 },
  })
  await s.createPayablesForOrder(c, order.id)
  const before = await h.balanceOf(c, 'seller_a')
  const stripe = h.fakeStripe()

  // Partial return first: goods only.
  const part = { order_id: order.id, items: [{ order_item_id: items[0].id, quantity: 1 }] }
  const p1 = await s.suggestReturnRefund(c, part)
  assert.equal(p1.goods_cents, 2000)
  assert.equal(p1.shipping_cents, 0)
  await refundAndApply(c, stripe, { orderId: order.id, amountCents: p1.amount_cents, lines: part.items, shippingSellerIds: p1.shipping_seller_ids, idempotencyKey: 'ret:1' })

  // The rest comes back → shipping included, booked against the seller who charged it.
  const rest = { order_id: order.id, items: [{ order_item_id: items[0].id, quantity: 1 }, { order_item_id: items[1].id, quantity: 1 }] }
  const p2 = await s.suggestReturnRefund(c, rest)
  assert.equal(p2.goods_cents, 3500)
  assert.equal(p2.shipping_cents, 490)
  assert.deepEqual(p2.shipping_seller_ids, ['seller_a'])
  await refundAndApply(c, stripe, { orderId: order.id, amountCents: p2.amount_cents, lines: rest.items, shippingSellerIds: p2.shipping_seller_ids, idempotencyKey: 'ret:2' })

  assert.equal(stripe.calls.refunds.reduce((a, r) => a + r.amount, 0), 2000 + 3500 + 490)
  const shipLines = (await c.query(`SELECT COALESCE(SUM(shipping_cents), 0)::int AS s FROM order_refund_lines`)).rows[0].s
  assert.equal(shipLines, 490)
  // Everything the seller was credited is reversed (goods + shipping, commission given back).
  assert.ok(before > 0)
  assert.equal(await h.balanceOf(c, 'seller_a'), 0)
  // Nothing left to refund.
  assert.equal(await s.suggestReturnRefund(c, rest), null)
})

withDb('multi-seller order: each seller\'s own shipment delivery starts only its own payout hold', async (c) => {
  await h.addSeller(c, 'seller_a')
  await h.addSeller(c, 'seller_b')
  const { order } = await h.addPaidOrder(c, {
    items: [{ seller: 'seller_a', price: 5000 }, { seller: 'seller_b', price: 3000 }],
    shippingBySeller: { seller_a: 490, seller_b: 390 },
  })
  await s.createPayablesForOrder(c, order.id)

  // Seller A ships and its parcel is confirmed by the carrier 20 days ago; B only ships.
  await s.recordShipment(c, { orderId: order.id, sellerId: 'seller_a', carrierName: 'DHL', trackingNumber: 'A123' })
  await s.recordShipment(c, { orderId: order.id, sellerId: 'seller_b', carrierName: 'DPD', trackingNumber: 'B456' })
  // A seller-reported "zugestellt" must not start the clock.
  await s.recordShipment(c, { orderId: order.id, sellerId: 'seller_b', deliveryStatus: 'zugestellt', sellerReportedDelivered: true })
  assert.equal((await s.findShipmentByTracking(c, 'a123')).seller_id, 'seller_a')
  const r1 = await s.confirmShipmentDelivery(c, { orderId: order.id, sellerId: 'seller_a', source: 'carrier_webhook', at: new Date(Date.now() - 20 * DAY) })
  assert.equal(r1.changed, true)
  assert.equal(r1.orderDelivered, false)

  const byseller = async () => {
    const ps = await payablesOf(c, order.id)
    return Object.fromEntries(['seller_a', 'seller_b'].map((sid) => [sid, ps.filter((p) => p.seller_id === sid).map((p) => p.status)]))
  }
  let st = await byseller()
  assert.ok(st.seller_a.every((x) => x === 'eligible'), 'A is past its 14-day hold')
  assert.ok(st.seller_b.every((x) => x === 'pending'), 'B is still waiting for its delivery')
  assert.equal((await c.query('SELECT delivery_confirmed_at FROM store_orders WHERE id = $1', [order.id])).rows[0].delivery_confirmed_at, null)

  // B's parcel confirmed now → B pending (hold running), order counts as delivered.
  const r2 = await s.confirmShipmentDelivery(c, { orderId: order.id, sellerId: 'seller_b', source: 'carrier_api', at: new Date() })
  assert.equal(r2.orderDelivered, true)
  st = await byseller()
  assert.ok(st.seller_a.every((x) => x === 'eligible'))
  assert.ok(st.seller_b.every((x) => x === 'pending'))
  const o = (await c.query('SELECT delivery_status, delivery_confirmed_at FROM store_orders WHERE id = $1', [order.id])).rows[0]
  assert.equal(o.delivery_status, 'zugestellt')
  assert.ok(o.delivery_confirmed_at)
  // idempotent + untrusted sources refused
  assert.equal((await s.confirmShipmentDelivery(c, { orderId: order.id, sellerId: 'seller_a', source: 'carrier_webhook' })).changed, false)
  await assert.rejects(s.confirmShipmentDelivery(c, { orderId: order.id, sellerId: 'seller_a', source: 'seller' }), /untrusted/)
})

withDb('single-seller order without shipment rows keeps the order-level delivery rule', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 5000 }] })
  await s.createPayablesForOrder(c, order.id)
  await h.deliver(c, order.id, 20)
  assert.ok((await payablesOf(c, order.id)).every((p) => p.status === 'eligible'))
})

withDb('return refund: partial keeps the order paid + closes the return phase; full → refunded', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order, items } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 3000 }, { seller: 'seller_a', price: 7000 }] })
  await s.createPayablesForOrder(c, order.id)
  await c.query(`UPDATE store_orders SET delivery_status = 'zugestellt', order_status = 'retoure' WHERE id = $1`, [order.id])
  const stripe = h.fakeStripe()
  const ret1 = (await c.query(`INSERT INTO store_returns (order_id, status, seller_id, refund_amount_cents) VALUES ($1, 'eingegangen', 'seller_a', 3000) RETURNING id`, [order.id])).rows[0]
  // A second, still open return keeps the order in the return phase.
  const ret2 = (await c.query(`INSERT INTO store_returns (order_id, status, seller_id, refund_amount_cents) VALUES ($1, 'offen', 'seller_a', 7000) RETURNING id`, [order.id])).rows[0]
  await refundAndApply(c, stripe, { orderId: order.id, returnId: ret1.id, amountCents: 3000, lines: [{ order_item_id: items[0].id, quantity: 1 }], idempotencyKey: 'r1' })
  let o = (await c.query('SELECT order_status, payment_status FROM store_orders WHERE id = $1', [order.id])).rows[0]
  assert.deepEqual([o.order_status, o.payment_status], ['retoure', 'bezahlt'])
  await c.query(`UPDATE store_returns SET status = 'abgelehnt' WHERE id = $1`, [ret2.id])
  const { syncOrderStatusAfterReturnRefund } = require('../order-refund-status')
  o = await syncOrderStatusAfterReturnRefund(c, order.id)
  assert.deepEqual([o.order_status, o.payment_status], ['abgeschlossen', 'bezahlt'])
  // Rest refunded → the whole order is refunded.
  const ret3 = (await c.query(`INSERT INTO store_returns (order_id, status, seller_id, refund_amount_cents) VALUES ($1, 'eingegangen', 'seller_a', 7000) RETURNING id`, [order.id])).rows[0]
  await refundAndApply(c, stripe, { orderId: order.id, returnId: ret3.id, amountCents: 7000, lines: [{ order_item_id: items[1].id, quantity: 1 }], idempotencyKey: 'r3' })
  o = (await c.query('SELECT order_status, payment_status FROM store_orders WHERE id = $1', [order.id])).rows[0]
  assert.deepEqual([o.order_status, o.payment_status], ['refunded', 'refunded'])
})

withDb('seller cancel: refunds only its own lines + shipping; order cancelled once nothing is left', async (c) => {
  await h.addSeller(c, 'seller_a', { rate: 0.1 })
  await h.addSeller(c, 'seller_b', { rate: 0.1 })
  const { order } = await h.addPaidOrder(c, {
    items: [{ seller: 'seller_a', price: 2000 }, { seller: 'seller_b', price: 3000 }],
    shippingBySeller: { seller_a: 490, seller_b: 390 },
  })
  await s.createPayablesForOrder(c, order.id)
  const stripe = h.fakeStripe()
  const { refundSellerLines } = require('../order-cancel')
  const a = await refundSellerLines(c, { orderId: order.id, sellerId: 'seller_a', actor: 'seller:a', stripe })
  assert.equal(a.ok, true)
  assert.equal(a.amount_cents, 2000 + 490)
  assert.equal(a.all_cancelled, false)
  assert.equal(stripe.calls.refunds[0].amount, 2490)
  assert.equal(await h.balanceOf(c, 'seller_a'), 0)
  // Idempotent: nothing left for seller A.
  const again = await refundSellerLines(c, { orderId: order.id, sellerId: 'seller_a', actor: 'seller:a', stripe })
  assert.equal(again.ok, false)
  assert.equal(again.code, 'nothing_to_cancel')
  const b = await refundSellerLines(c, { orderId: order.id, sellerId: 'seller_b', actor: 'seller:b', stripe })
  assert.equal(b.amount_cents, 3000 + 390)
  assert.equal(b.all_cancelled, true)
  assert.equal(stripe.calls.refunds.reduce((x, r) => x + r.amount, 0), 2000 + 490 + 3000 + 390)
})

withDb('label charge reversal: unbooked charge removed; booked charge gets a counter-adjustment', async (c) => {
  await h.addSeller(c, 'seller_a')
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 1000 }] })
  const { reverseLabelCharge } = require('../seller-billing')
  const { appendLedgerEntry } = require('./ledger')
  const add = async () => (await c.query(
    `INSERT INTO seller_ledger_adjustments (seller_id, type, amount_cents, order_id, charge_method) VALUES ('seller_a', 'shipping_label', -499, $1, 'balance') RETURNING id`,
    [order.id],
  )).rows[0].id
  const a1 = await add()
  assert.deepEqual(await reverseLabelCharge(c, { ledger_id: a1, charge_method: 'balance' }), { reversed: true, method: 'deleted' })
  assert.equal((await c.query('SELECT COUNT(*)::int AS n FROM seller_ledger_adjustments')).rows[0].n, 0)
  const a2 = await add()
  await appendLedgerEntry(c, { sellerId: 'seller_a', orderId: order.id, eventType: 'ADJUSTMENT', amountCents: -499, idempotencyKey: `LEGACY_ADJ:${a2}`, referenceId: String(a2) })
  assert.deepEqual(await reverseLabelCharge(c, { ledger_id: a2, charge_method: 'balance' }), { reversed: true, method: 'counter_adjustment' })
  const sum = (await c.query(`SELECT COALESCE(SUM(amount_cents), 0)::int AS s FROM seller_ledger_adjustments WHERE seller_id = 'seller_a'`)).rows[0].s
  assert.equal(sum, 0)
})

withDb('seller view: multi-seller order stays "offen" for the seller who has not shipped yet', async (c) => {
  await h.addSeller(c, 'seller_a')
  await h.addSeller(c, 'seller_b')
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 1000 }, { seller: 'seller_b', price: 2000 }] })
  await s.recordShipment(c, { orderId: order.id, sellerId: 'seller_a', carrierName: 'DHL', trackingNumber: 'A1', deliveryStatus: 'versendet', labelUrl: 'https://l/a' })
  await c.query(`UPDATE store_orders SET delivery_status = 'versendet', tracking_number = 'A1' WHERE id = $1`, [order.id])
  const { sqlSellerDeliveryStatus } = require('../seller-order-view')
  const agg = `ARRAY(SELECT DISTINCT i.seller_id FROM store_order_items i WHERE i.order_id = o.id)`
  const view = async (sid) => (await c.query(`SELECT ${sqlSellerDeliveryStatus('o', '$2', agg)} AS ds FROM store_orders o WHERE o.id = $1`, [order.id, sid])).rows[0].ds
  assert.equal(await view('seller_a'), 'versendet')
  assert.equal(await view('seller_b'), 'offen')
  const sh = (await c.query(`SELECT label_url FROM order_shipments WHERE order_id = $1 AND seller_id = 'seller_a'`, [order.id])).rows[0]
  assert.equal(sh.label_url, 'https://l/a')
})

withDb('commission invoice per seller from payables: own amount, own VAT scheme, own number', async (c) => {
  await h.addSeller(c, 'seller_a', { rate: 0.1 })
  await h.addSeller(c, 'seller_b', { rate: 0.2 })
  const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_a', price: 5000 }, { seller: 'seller_b', price: 1000 }] })
  await s.createPayablesForOrder(c, order.id)
  // Production columns the PDF query reads (not in the minimal test schema).
  for (const col of ['coupon_discount_cents integer DEFAULT 0', 'stripe_application_fee_cents integer', 'seller_net_after_commission_cents integer', 'platform_bonus_funding_cents integer DEFAULT 0']) {
    await c.query('ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS ' + col)
  }
  const { buildProvisionsfakturPdfBuffer } = require('../order-pdf-buffers')
  await assert.rejects(() => buildProvisionsfakturPdfBuffer(c, order.id), /seller_id required/)
  const a = await buildProvisionsfakturPdfBuffer(c, order.id, { sellerId: 'seller_a' })
  const b = await buildProvisionsfakturPdfBuffer(c, order.id, { sellerId: 'seller_b' })
  assert.match(a.filename, /Provisionsfaktur-\d+-1\.pdf/)
  assert.match(b.filename, /Provisionsfaktur-\d+-2\.pdf/)
  assert.ok(a.content.length > 1000 && b.content.length > 1000)
})
