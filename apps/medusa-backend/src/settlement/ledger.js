'use strict'

const { LEDGER_EVENT_TYPES } = require('./schema')

/**
 * Runs `fn` inside a transaction on an already-connected pg client. Nested calls reuse the outer
 * transaction (tracked on the client) so domain helpers compose without SAVEPOINT bookkeeping.
 */
async function withTx(client, fn) {
  if (client.__settlementTxDepth) {
    client.__settlementTxDepth += 1
    try { return await fn(client) } finally { client.__settlementTxDepth -= 1 }
  }
  await client.query('BEGIN')
  client.__settlementTxDepth = 1
  try {
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (e) {
    try { await client.query('ROLLBACK') } catch (_) {}
    throw e
  } finally {
    client.__settlementTxDepth = 0
  }
}

/** Transaction-scoped advisory lock: serialises money work per seller / order / event. */
async function lockKey(client, key) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [String(key)])
}

/**
 * Appends one ledger entry. The idempotency key makes every money event exactly-once: replaying
 * a webhook, re-running a job or retrying a request returns the existing row instead of booking
 * the amount again. Returns { inserted, entry }.
 */
async function appendLedgerEntry(client, e) {
  const sellerId = String(e.sellerId || '').trim()
  if (!sellerId || sellerId === 'default') throw new Error('ledger entry requires a real seller_id')
  if (!LEDGER_EVENT_TYPES.includes(e.eventType)) throw new Error(`unknown ledger event ${e.eventType}`)
  const amount = Number(e.amountCents)
  if (!Number.isInteger(amount)) throw new Error('ledger amount must be integer cents')
  if (!e.idempotencyKey) throw new Error('ledger entry requires idempotencyKey')
  const ins = await client.query(
    `INSERT INTO seller_ledger_entries
       (seller_id, order_id, order_item_id, payable_id, payout_id, refund_id, dispute_id,
        event_type, amount_cents, currency, reference_id, idempotency_key, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [
      sellerId, e.orderId || null, e.orderItemId || null, e.payableId || null, e.payoutId || null,
      e.refundId || null, e.disputeId || null, e.eventType, amount, (e.currency || 'eur').toLowerCase(),
      e.referenceId || null, e.idempotencyKey, JSON.stringify(e.metadata || {}),
    ],
  )
  if (ins.rows[0]) return { inserted: true, entry: ins.rows[0] }
  const ex = await client.query('SELECT * FROM seller_ledger_entries WHERE idempotency_key = $1', [e.idempotencyKey])
  return { inserted: false, entry: ex.rows[0] }
}

async function auditFinance(client, { actor, action, entityType, entityId, sellerId, details }) {
  await client.query(
    `INSERT INTO finance_audit_log (actor, action, entity_type, entity_id, seller_id, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [actor || 'system', action, entityType, entityId != null ? String(entityId) : null, sellerId || null, JSON.stringify(details || {})],
  )
}

/** Seller balance = Σ all ledger entries (payouts are negative entries). May be negative. */
async function sellerLedgerBalanceCents(client, sellerId) {
  const r = await client.query(
    'SELECT COALESCE(SUM(amount_cents), 0)::bigint AS cents FROM seller_ledger_entries WHERE seller_id = $1',
    [sellerId],
  )
  return Number(r.rows[0]?.cents || 0)
}

module.exports = { withTx, lockKey, appendLedgerEntry, auditFinance, sellerLedgerBalanceCents }
