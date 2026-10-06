'use strict'

const { auditFinance } = require('./ledger')
const { recordOrderPayment, createPayablesForOrder } = require('./payables')
const { syncStripeRefund } = require('./refunds')
const { handleDispute } = require('./disputes')
const { handleStripePayoutEvent, handleTransferReversed } = require('./payouts')
const { syncConnectedAccount } = require('./connect-account')

/** Who carries the Stripe processing fee. Not assumed from code: configured. Default platform
 *  (the current payout formula never deducted it from sellers). */
const stripeFeeBearer = () => (String(process.env.PLATFORM_STRIPE_FEE_BEARER || 'platform').trim().toLowerCase() === 'seller' ? 'seller' : 'platform')

const HANDLED = new Set([
  'payment_intent.succeeded', 'payment_intent.payment_failed', 'charge.succeeded', 'charge.updated',
  'charge.refunded', 'refund.created', 'refund.updated', 'refund.failed', 'charge.refund.updated',
  'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
  'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated',
  'transfer.created', 'transfer.reversed', 'transfer.updated',
  'payout.paid', 'payout.failed', 'payout.canceled', 'payout.created', 'payout.updated',
  'account.updated',
])

/** Charge → fee / net from its balance transaction (Phase 16). Best effort, never throws. */
async function chargeFeeSnapshot(stripe, chargeId) {
  if (!stripe || !chargeId) return {}
  try {
    const ch = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] })
    const bt = ch.balance_transaction && typeof ch.balance_transaction === 'object' ? ch.balance_transaction : null
    return {
      chargeId: ch.id,
      balanceTransactionId: bt?.id || (typeof ch.balance_transaction === 'string' ? ch.balance_transaction : null),
      stripeFeeCents: bt ? Number(bt.fee) : null,
      stripeNetCents: bt ? Number(bt.net) : null,
    }
  } catch (_) {
    return { chargeId }
  }
}

/**
 * Only when PLATFORM_STRIPE_FEE_BEARER=seller: the order's Stripe fee is split across its sellers
 * by their share of goods + shipping and booked as ADJUSTMENT (never mixed into COMMISSION).
 */
async function bookStripeFeeIfSellerBorne(client, orderId) {
  if (stripeFeeBearer() !== 'seller') return
  const { appendLedgerEntry } = require('./ledger')
  const { allocateProportional } = require('./money')
  const pay = (await client.query('SELECT stripe_fee_cents, charge_id FROM order_payments WHERE order_id = $1::uuid', [orderId])).rows[0]
  if (!pay || pay.stripe_fee_cents == null || Number(pay.stripe_fee_cents) <= 0) return
  const rows = (await client.query(
    `SELECT seller_id, SUM(gross_cents + shipping_cents)::bigint AS w FROM seller_payables WHERE order_id = $1::uuid GROUP BY seller_id ORDER BY seller_id`,
    [orderId],
  )).rows
  const parts = allocateProportional(Number(pay.stripe_fee_cents), rows.map((r) => Number(r.w)))
  for (let i = 0; i < rows.length; i++) {
    if (parts[i] <= 0) continue
    await appendLedgerEntry(client, {
      sellerId: rows[i].seller_id, orderId, eventType: 'ADJUSTMENT', amountCents: -parts[i],
      idempotencyKey: `STRIPE_FEE:${orderId}:${rows[i].seller_id}`, referenceId: pay.charge_id, metadata: { type: 'stripe_processing_fee' },
    })
  }
}

async function onPaymentIntentSucceeded(client, stripe, pi) {
  const o = (await client.query('SELECT id, total_cents FROM store_orders WHERE payment_intent_id = $1 LIMIT 1', [pi.id])).rows[0]
  if (!o) return 'order_not_created_yet' // checkout records the payment itself when the order is inserted
  const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id
  const fee = await chargeFeeSnapshot(stripe, chargeId)
  await recordOrderPayment(client, {
    orderId: o.id, paymentIntentId: pi.id, currency: pi.currency, grossAmountCents: Number(pi.amount_received || pi.amount),
    paymentSucceededAt: new Date((pi.created || Math.floor(Date.now() / 1000)) * 1000), source: 'webhook',
    feeBearer: stripeFeeBearer(), ...fee,
  })
  await createPayablesForOrder(client, o.id, { source: 'webhook' })
  await bookStripeFeeIfSellerBorne(client, o.id)
  return 'recorded'
}

async function onChargeUpdate(client, stripe, ch) {
  const pi = typeof ch.payment_intent === 'string' ? ch.payment_intent : ch.payment_intent?.id
  if (!pi) return 'no_payment_intent'
  const pay = (await client.query('SELECT order_id, stripe_fee_cents FROM order_payments WHERE payment_intent_id = $1', [pi])).rows[0]
  if (!pay) return 'payment_not_recorded'
  if (pay.stripe_fee_cents != null) return 'fee_known'
  const fee = await chargeFeeSnapshot(stripe, ch.id)
  await client.query(
    `UPDATE order_payments SET charge_id = COALESCE(charge_id, $2), balance_transaction_id = COALESCE(balance_transaction_id, $3),
            stripe_fee_cents = COALESCE(stripe_fee_cents, $4), stripe_net_cents = COALESCE(stripe_net_cents, $5), updated_at = now()
      WHERE order_id = $1`,
    [pay.order_id, fee.chargeId || ch.id, fee.balanceTransactionId || null, fee.stripeFeeCents ?? null, fee.stripeNetCents ?? null],
  )
  await bookStripeFeeIfSellerBorne(client, pay.order_id)
  return 'fee_recorded'
}

/** Dispatches one verified event to the settlement domain. Each handler is idempotent itself. */
async function dispatchStripeEvent(client, stripe, event) {
  const obj = event.data?.object || {}
  switch (event.type) {
    case 'payment_intent.succeeded': return onPaymentIntentSucceeded(client, stripe, obj)
    case 'payment_intent.payment_failed':
      await auditFinance(client, { actor: 'stripe_webhook', action: 'payment_failed', entityType: 'payment_intent', entityId: obj.id, details: { code: obj.last_payment_error?.code || null } })
      return 'logged'
    case 'charge.succeeded':
    case 'charge.updated': return onChargeUpdate(client, stripe, obj)
    case 'charge.refunded': {
      const refunds = obj.refunds?.data || []
      for (const r of refunds) await syncStripeRefund(client, { ...r, payment_intent: r.payment_intent || obj.payment_intent })
      return `refunds:${refunds.length}`
    }
    case 'refund.created':
    case 'refund.updated':
    case 'refund.failed':
    case 'charge.refund.updated':
      await syncStripeRefund(client, obj)
      return 'refund_synced'
    case 'charge.dispute.created':
    case 'charge.dispute.updated':
    case 'charge.dispute.closed':
    case 'charge.dispute.funds_withdrawn':
    case 'charge.dispute.funds_reinstated':
      await handleDispute(client, obj, { eventType: event.type })
      return 'dispute_synced'
    case 'transfer.reversed': await handleTransferReversed(client, obj); return 'transfer_reversal'
    case 'transfer.created':
    case 'transfer.updated': return 'noop'
    case 'payout.paid':
    case 'payout.failed':
    case 'payout.canceled': {
      const r = await handleStripePayoutEvent(client, obj, event.type)
      return r.matched ? 'payout_synced' : 'payout_not_ours'
    }
    case 'payout.created':
    case 'payout.updated': return 'noop'
    case 'account.updated': await syncConnectedAccount(client, obj); return 'account_synced'
    default: return 'ignored'
  }
}

/**
 * Central, idempotent webhook processing (Phase 15). The event is stored under its unique Stripe
 * id first; a processed event is never processed again, a failed one is retried when Stripe
 * redelivers it. An advisory lock keyed on the event id serialises concurrent deliveries.
 * Returns { status: 'processed' | 'duplicate' | 'ignored', result }. Throws on failure (caller
 * answers 500 so Stripe retries).
 */
async function processStripeEvent(client, stripe, event) {
  await client.query(
    `INSERT INTO stripe_webhook_events (stripe_event_id, type, account, livemode, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (stripe_event_id) DO NOTHING`,
    [event.id, event.type, event.account || null, event.livemode ?? null, JSON.stringify(event)],
  )
  await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [`stripe-event:${event.id}`])
  try {
    const row = (await client.query('SELECT status FROM stripe_webhook_events WHERE stripe_event_id = $1', [event.id])).rows[0]
    if (row && (row.status === 'processed' || row.status === 'ignored')) return { status: 'duplicate' }
    if (!HANDLED.has(event.type)) {
      await client.query(`UPDATE stripe_webhook_events SET status = 'ignored', processed_at = now() WHERE stripe_event_id = $1`, [event.id])
      return { status: 'ignored' }
    }
    await client.query(`UPDATE stripe_webhook_events SET status = 'processing', attempts = attempts + 1 WHERE stripe_event_id = $1`, [event.id])
    try {
      const result = await dispatchStripeEvent(client, stripe, event)
      await client.query(
        `UPDATE stripe_webhook_events SET status = 'processed', processed_at = now(), last_error = NULL WHERE stripe_event_id = $1`,
        [event.id],
      )
      return { status: 'processed', result }
    } catch (e) {
      await client.query(
        `UPDATE stripe_webhook_events SET status = 'failed', last_error = $2 WHERE stripe_event_id = $1`,
        [event.id, String(e?.message || e).slice(0, 2000)],
      ).catch(() => {})
      throw e
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [`stripe-event:${event.id}`]).catch(() => {})
  }
}

module.exports = { processStripeEvent, dispatchStripeEvent, stripeFeeBearer, chargeFeeSnapshot, bookStripeFeeIfSellerBorne, HANDLED_STRIPE_EVENTS: HANDLED }
