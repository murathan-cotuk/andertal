'use strict'

const { withTx, lockKey, appendLedgerEntry, auditFinance } = require('./ledger')
const { refreshEligibilityForSeller } = require('./payables')
const { isDefinitiveStripeError } = require('./refunds')

/** Smallest amount sent to the bank (Stripe EUR payouts need ≥ 1 €). Configurable, never < 100. */
const minPayoutCents = () => Math.max(100, Math.round(Number(process.env.SETTLEMENT_MIN_PAYOUT_CENTS) || 100))

const OPEN_PAYOUT_STATUSES = ['created', 'transfer_pending', 'transfer_review', 'transferred', 'payout_pending', 'payout_failed']

/**
 * Legacy balance-paid label charges (seller_ledger_adjustments) are mirrored into the canonical
 * ledger as ADJUSTMENT entries before each settlement so they are netted exactly once.
 */
async function mirrorLegacyAdjustments(client, sellerId) {
  // Only charges booked after the settlement cutover: older ones belong to the legacy statements
  // (seller_payouts) and may already have been netted there — re-booking them would double-charge.
  const r = await client.query(
    `SELECT a.id, a.amount_cents, a.type, a.order_id FROM seller_ledger_adjustments a
      WHERE a.seller_id = $1 AND COALESCE(a.charge_method, 'balance') = 'balance'
        AND a.created_at >= (SELECT value::timestamptz FROM settlement_settings WHERE key = 'cutover_at')`,
    [sellerId],
  ).catch(() => ({ rows: [] }))
  for (const a of r.rows) {
    await appendLedgerEntry(client, {
      sellerId, orderId: a.order_id, eventType: 'ADJUSTMENT', amountCents: Number(a.amount_cents),
      idempotencyKey: `LEGACY_ADJ:${a.id}`, referenceId: String(a.id), metadata: { type: a.type, source: 'seller_ledger_adjustments' },
    })
  }
}

/**
 * Entries a new payout may settle: not actively claimed by another payout, and either not tied
 * to a payable (adjustments, receivables) or tied to a payable that is eligible / already paid
 * (post-payout refunds & chargebacks) / final (fully refunded, charged back).
 */
async function claimableEntries(client, sellerId) {
  return (await client.query(
    `SELECT e.* FROM seller_ledger_entries e
       LEFT JOIN seller_payables p ON p.id = e.payable_id
      WHERE e.seller_id = $1
        AND e.event_type NOT IN ('PAYOUT', 'PAYOUT_REVERSAL')
        AND NOT EXISTS (SELECT 1 FROM seller_payout_items i WHERE i.ledger_entry_id = e.id AND i.released_at IS NULL)
        AND (e.payable_id IS NULL OR p.status IN ('eligible', 'paid', 'refunded', 'charged_back'))
      ORDER BY e.created_at, e.id`,
    [sellerId],
  )).rows
}

/** Read model for UIs / jobs: balance, claimable amount and what blocks the rest. */
async function sellerSettlementSummary(client, sellerId) {
  const bal = (await client.query(
    'SELECT COALESCE(SUM(amount_cents), 0)::bigint AS c FROM seller_ledger_entries WHERE seller_id = $1', [sellerId],
  )).rows[0].c
  const entries = await claimableEntries(client, sellerId)
  const claimable = entries.reduce((s, e) => s + Number(e.amount_cents), 0)
  const byStatus = (await client.query(
    `SELECT status, COUNT(*)::int AS n, COALESCE(SUM(net_cents), 0)::bigint AS net
       FROM seller_payables WHERE seller_id = $1 GROUP BY status`,
    [sellerId],
  )).rows
  return { balance_cents: Number(bal), claimable_cents: claimable, payables_by_status: byStatus }
}

/**
 * Stripe-side readiness of the seller's connected (Custom) account, from the mirrored state.
 * Stripe guidance (2026-10): sellers who never take card payments are Custom accounts with the
 * RECIPIENT service agreement and only the transfers capability, and terms acceptance must be the
 * seller's own (real IP + date). Accounts created before that fix (platform-filled acceptance,
 * 'full' agreement) are NOT paid until they are re-onboarded — never silently converted.
 */
async function sellerAccountReadiness(client, sellerId) {
  const s = (await client.query(
    `SELECT stripe_custom_account_id, stripe_payouts_enabled, stripe_transfers_capability, stripe_disabled_reason,
            stripe_service_agreement, stripe_tos_accepted_at, stripe_tos_ip,
            COALESCE(payout_blocked, false) AS payout_blocked, payout_block_reason, approval_status
       FROM seller_users WHERE seller_id = $1 AND sub_of_seller_id IS NULL ORDER BY created_at ASC LIMIT 1`,
    [sellerId],
  )).rows[0]
  if (!s) return { ready: false, reason: 'seller_not_found' }
  if (s.payout_blocked) return { ready: false, reason: s.payout_block_reason || 'payout_blocked' }
  if (String(s.approval_status || 'approved').toLowerCase() !== 'approved') return { ready: false, reason: 'seller_not_approved' }
  if (!s.stripe_custom_account_id) return { ready: false, reason: 'no_connected_account' }
  const account = s.stripe_custom_account_id
  if (s.stripe_service_agreement !== 'recipient') return { ready: false, reason: 'service_agreement_not_recipient', account }
  if (!s.stripe_tos_accepted_at) return { ready: false, reason: 'tos_not_accepted_by_seller', account }
  if (s.stripe_transfers_capability !== 'active') return { ready: false, reason: 'transfers_capability_inactive', account }
  if (s.stripe_payouts_enabled !== true) return { ready: false, reason: s.stripe_disabled_reason || 'payouts_disabled', account }
  return { ready: true, account }
}

/**
 * Splits a payout into Stripe transfers: one per order (source_transaction = that order's charge,
 * transfer_group = ORDER_<id>). Negative order sums and entries without an order (labels,
 * receivables) reduce the largest order chunks first. A chunk never exceeds what is still
 * transferable from its charge (payment − succeeded refunds − earlier transfers from it); any
 * excess (e.g. platform-funded coupon) goes into one chunk without source_transaction.
 */
async function buildTransferPlan(client, payoutId, entries) {
  const byOrder = new Map()
  let loose = 0
  for (const e of entries) {
    if (e.order_id) byOrder.set(String(e.order_id), (byOrder.get(String(e.order_id)) || 0) + Number(e.amount_cents))
    else loose += Number(e.amount_cents)
  }
  let negative = Math.min(0, loose)
  let extra = Math.max(0, loose)
  const chunks = []
  for (const [orderId, cents] of byOrder) {
    if (cents <= 0) { negative += cents; continue }
    chunks.push({ orderId, cents })
  }
  chunks.sort((a, b) => b.cents - a.cents || a.orderId.localeCompare(b.orderId))
  let debt = -negative
  for (const c of chunks) {
    if (debt <= 0) break
    const take = Math.min(c.cents, debt)
    c.cents -= take
    debt -= take
  }
  const plan = []
  for (const c of chunks) {
    if (c.cents <= 0) continue
    const pay = (await client.query(
      `SELECT op.charge_id, op.gross_amount_cents,
              COALESCE((SELECT SUM(amount_cents) FROM order_refunds r WHERE r.order_id = op.order_id AND r.status = 'succeeded'), 0)::bigint AS refunded,
              COALESCE((SELECT SUM(amount_cents) FROM seller_payout_transfers t WHERE t.charge_id = op.charge_id AND t.status IN ('pending', 'succeeded')), 0)::bigint AS transferred
         FROM order_payments op WHERE op.order_id = $1::uuid`,
      [c.orderId],
    )).rows[0]
    let cents = c.cents
    if (pay?.charge_id) {
      const room = Math.max(0, Number(pay.gross_amount_cents) - Number(pay.refunded) - Number(pay.transferred))
      const withSource = Math.min(cents, room)
      if (withSource > 0) {
        plan.push({ orderId: c.orderId, chargeId: pay.charge_id, cents: withSource })
        cents -= withSource
      }
    }
    extra += cents // no charge (zero-pay order) or beyond the charge's room
  }
  if (extra > 0) plan.push({ orderId: null, chargeId: null, cents: extra })
  for (const p of plan) {
    await client.query(
      `INSERT INTO seller_payout_transfers (payout_id, order_id, charge_id, amount_cents, transfer_group, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [payoutId, p.orderId, p.chargeId, p.cents,
        p.orderId ? `ORDER_${p.orderId}` : `SETTLEMENT_${payoutId}`,
        `andertal-settlement-transfer-${payoutId}-${p.orderId || 'rest'}`],
    )
  }
  return plan
}

/**
 * Creates ONE settlement payout for a seller from everything currently claimable (Phase 1/10/12).
 *   - business_key is unique → re-running the same job / double-clicking returns the same payout
 *   - one open payout per seller (unique partial index) → a parallel run cannot claim again
 *   - each ledger entry gets one active claim (unique partial index) → no order item paid twice
 *   - negative entries (refunds / chargebacks after an earlier payout) are netted, never clamped
 *   - total ≤ 0 or below the minimum → nothing is created, the (negative) balance carries over
 * method 'manual_bank_transfer' (superuser) requires a real bank reference and the exact amount.
 */
async function createSettlementPayout(client, {
  sellerId, method = 'stripe_connect', businessKey, actor = 'system', externalReference = null,
  expectedAmountCents = null, accountId = null, now = new Date(),
}) {
  if (!sellerId || sellerId === 'default') throw Object.assign(new Error('real seller_id required'), { status: 400 })
  if (!businessKey) throw Object.assign(new Error('businessKey required'), { status: 400 })
  if (method === 'manual_bank_transfer') {
    const ref = String(externalReference || '').trim()
    if (ref.length < 6) throw Object.assign(new Error('Bank transfer reference (Verwendungszweck / Transaktions-ID) required'), { status: 400 })
    if (!Number.isInteger(Number(expectedAmountCents))) throw Object.assign(new Error('confirm_amount_cents required'), { status: 400 })
  }
  return withTx(client, async () => {
    await lockKey(client, `seller-payout:${sellerId}`)
    const dup = (await client.query('SELECT * FROM seller_settlement_payouts WHERE business_key = $1', [businessKey])).rows[0]
    if (dup) return { payout: dup, existing: true }
    const open = (await client.query(
      `SELECT * FROM seller_settlement_payouts WHERE seller_id = $1 AND status = ANY($2::text[]) LIMIT 1`,
      [sellerId, OPEN_PAYOUT_STATUSES],
    )).rows[0]
    if (open) return { payout: null, skipped: 'payout_in_flight', open }

    await mirrorLegacyAdjustments(client, sellerId)
    await refreshEligibilityForSeller(client, sellerId, now)
    const entries = await claimableEntries(client, sellerId)
    const amount = entries.reduce((s, e) => s + Number(e.amount_cents), 0)
    if (method === 'manual_bank_transfer' && Number(expectedAmountCents) !== amount) {
      throw Object.assign(new Error(`Amount mismatch: settlement is ${amount} cents, confirmed ${expectedAmountCents}`), { status: 409, amount })
    }
    if (amount <= 0) return { payout: null, skipped: amount < 0 ? 'negative_balance' : 'nothing_due', amount }
    if (method === 'stripe_connect' && amount < minPayoutCents()) return { payout: null, skipped: 'below_minimum', amount }

    const manual = method === 'manual_bank_transfer'
    const ins = await client.query(
      `INSERT INTO seller_settlement_payouts
         (seller_id, business_key, method, amount_cents, currency, status, stripe_account_id, transfer_group,
          external_reference, created_by, paid_at)
       VALUES ($1, $2, $3, $4, 'eur', $5, $6, NULL, $7, $8, $9)
       RETURNING *`,
      [sellerId, businessKey, method, amount, manual ? 'paid' : 'created', accountId, manual ? String(externalReference).trim() : null, actor, manual ? now : null],
    )
    const payout = ins.rows[0]
    await client.query('UPDATE seller_settlement_payouts SET transfer_group = $2 WHERE id = $1', [payout.id, `SETTLEMENT_${payout.id}`])
    for (const e of entries) {
      await client.query(
        'INSERT INTO seller_payout_items (payout_id, ledger_entry_id, amount_cents) VALUES ($1, $2, $3)',
        [payout.id, e.id, Number(e.amount_cents)],
      )
    }
    if (!manual) {
      const plan = await buildTransferPlan(client, payout.id, entries)
      const planned = plan.reduce((s, p) => s + p.cents, 0)
      if (planned !== amount) throw new Error(`transfer plan ${planned} ≠ payout ${amount}`)
    }
    await appendLedgerEntry(client, {
      sellerId, payoutId: payout.id, eventType: 'PAYOUT', amountCents: -amount,
      idempotencyKey: `PAYOUT:${payout.id}`, referenceId: manual ? payout.external_reference : null,
      metadata: { method, entry_count: entries.length },
    })
    const payableIds = [...new Set(entries.map((e) => e.payable_id).filter(Boolean))]
    if (payableIds.length) {
      await client.query(
        `UPDATE seller_payables SET status = $2, payout_id = $3, paid_at = $4
          WHERE id = ANY($1::uuid[]) AND status = 'eligible'`,
        [payableIds, manual ? 'paid' : 'in_payout', payout.id, manual ? now : null],
      )
    }
    await auditFinance(client, {
      actor, action: manual ? 'payout_marked_paid_manual' : 'payout_created', entityType: 'settlement_payout',
      entityId: payout.id, sellerId, details: { amount_cents: amount, entries: entries.length, business_key: businessKey, external_reference: payout.external_reference },
    })
    return { payout: { ...payout, transfer_group: `SETTLEMENT_${payout.id}` }, existing: false }
  })
}

/** Undo claims of a payout whose money provably never left the platform (no transfer succeeded). */
async function releasePayout(client, payoutId, { reason, code = null, actor = 'system' }) {
  return withTx(client, async () => {
    const p = (await client.query('SELECT * FROM seller_settlement_payouts WHERE id = $1 FOR UPDATE', [payoutId])).rows[0]
    if (!p) return null
    const moved = (await client.query(
      `SELECT COUNT(*)::int AS n FROM seller_payout_transfers WHERE payout_id = $1 AND status = 'succeeded'`, [payoutId],
    )).rows[0].n
    if (moved > 0) throw new Error('payout has a succeeded Stripe transfer — cannot release claims')
    if (p.status === 'failed') return p
    await client.query(
      `UPDATE seller_settlement_payouts SET status = 'failed', failure_code = $2, failure_message = $3, failed_at = now(), updated_at = now() WHERE id = $1`,
      [payoutId, code, reason],
    )
    await client.query(`UPDATE seller_payout_transfers SET status = 'failed', updated_at = now() WHERE payout_id = $1 AND status = 'pending'`, [payoutId])
    await client.query('UPDATE seller_payout_items SET released_at = now() WHERE payout_id = $1 AND released_at IS NULL', [payoutId])
    await appendLedgerEntry(client, {
      sellerId: p.seller_id, payoutId, eventType: 'PAYOUT_REVERSAL', amountCents: Number(p.amount_cents),
      idempotencyKey: `PAYOUT_REVERSAL:${payoutId}`, metadata: { reason, code },
    })
    await client.query(
      `UPDATE seller_payables SET status = 'eligible', payout_id = NULL WHERE payout_id = $1 AND status = 'in_payout'`,
      [payoutId],
    )
    await auditFinance(client, { actor, action: 'payout_failed_released', entityType: 'settlement_payout', entityId: payoutId, sellerId: p.seller_id, details: { reason, code } })
    return { ...p, status: 'failed' }
  })
}

async function markPayoutPaid(client, payoutId, { stripePayoutId = null, actor = 'system', at = new Date() } = {}) {
  return withTx(client, async () => {
    const p = (await client.query('SELECT * FROM seller_settlement_payouts WHERE id = $1 FOR UPDATE', [payoutId])).rows[0]
    if (!p) return null
    if (p.status === 'paid') return p
    if (stripePayoutId && p.stripe_payout_id && p.stripe_payout_id !== stripePayoutId) {
      // payout.paid for an older, superseded attempt would mean two bank payouts — never ignore.
      await auditFinance(client, { actor, action: 'payout_paid_for_other_attempt', entityType: 'settlement_payout', entityId: payoutId, sellerId: p.seller_id, details: { stored: p.stripe_payout_id, event: stripePayoutId } })
      return p
    }
    await client.query(
      `UPDATE seller_settlement_payouts SET status = 'paid', paid_at = $2, failure_code = NULL, failure_message = NULL, updated_at = now() WHERE id = $1`,
      [payoutId, at],
    )
    await client.query(`UPDATE seller_payables SET status = 'paid', paid_at = $2 WHERE payout_id = $1 AND status = 'in_payout'`, [payoutId, at])
    await auditFinance(client, { actor, action: 'payout_paid', entityType: 'settlement_payout', entityId: payoutId, sellerId: p.seller_id, details: { stripe_payout_id: stripePayoutId } })
    return { ...p, status: 'paid' }
  })
}

/**
 * Bank payout failed AFTER the transfer: the money is in the seller's Stripe balance (it left the
 * platform), so claims stay and the ledger PAYOUT stays. The payout waits for a checked retry.
 */
async function markBankPayoutFailed(client, payoutId, { stripePayoutId, code, message, actor = 'system' }) {
  return withTx(client, async () => {
    const p = (await client.query('SELECT * FROM seller_settlement_payouts WHERE id = $1 FOR UPDATE', [payoutId])).rows[0]
    if (!p) return null
    if (p.status === 'paid') {
      await auditFinance(client, { actor, action: 'payout_failed_after_paid', entityType: 'settlement_payout', entityId: payoutId, sellerId: p.seller_id, details: { stripePayoutId, code, message } })
    }
    if (stripePayoutId && p.stripe_payout_id && p.stripe_payout_id !== stripePayoutId) return p // stale attempt
    await client.query(
      `UPDATE seller_settlement_payouts SET status = 'payout_failed', failure_code = $2, failure_message = $3, failed_at = now(), updated_at = now() WHERE id = $1`,
      [payoutId, code || null, message || null],
    )
    await client.query(`UPDATE seller_payables SET status = 'in_payout', paid_at = NULL WHERE payout_id = $1 AND status = 'paid'`, [payoutId])
    await auditFinance(client, { actor, action: 'bank_payout_failed', entityType: 'settlement_payout', entityId: payoutId, sellerId: p.seller_id, details: { stripePayoutId, code, message } })
    return { ...p, status: 'payout_failed' }
  })
}

/**
 * Available EUR on the connected account. A negative balance (refund / dispute debited on the
 * connected account, connect_reserved situations) is never ignored: the seller is blocked from
 * further payouts and the case is audited for review.
 */
async function connectedAvailableCents(client, stripe, p, { actor }) {
  const bal = await stripe.balance.retrieve({}, { stripeAccount: p.stripe_account_id })
  const sum = (arr) => (arr || []).filter((b) => String(b.currency) === String(p.currency || 'eur')).reduce((s, b) => s + Number(b.amount || 0), 0)
  const available = sum(bal.available)
  const pending = sum(bal.pending)
  if (available < 0 || pending < 0) {
    await client.query(
      `UPDATE seller_users SET payout_blocked = true, payout_block_reason = 'connected_balance_negative' WHERE seller_id = $1 AND sub_of_seller_id IS NULL`,
      [p.seller_id],
    )
    await auditFinance(client, { actor, action: 'connected_balance_negative', entityType: 'settlement_payout', entityId: p.id, sellerId: p.seller_id, details: { available, pending, account: p.stripe_account_id } })
  }
  return available
}

async function bankPayoutStep(client, stripe, p, { actor }) {
  const attempt = Number(p.attempt_count || 0) + 1
  await client.query(
    `UPDATE seller_settlement_payouts SET attempt_count = $2, last_attempt_at = now(), updated_at = now() WHERE id = $1`,
    [p.id, attempt],
  )
  let po
  try {
    po = await stripe.payouts.create(
      {
        amount: Number(p.amount_cents), currency: p.currency || 'eur',
        metadata: { settlement_payout_id: p.id, seller_id: p.seller_id },
      },
      { stripeAccount: p.stripe_account_id, idempotencyKey: `andertal-settlement-payout-${p.id}-${attempt}` },
    )
  } catch (e) {
    if (isDefinitiveStripeError(e)) {
      await markBankPayoutFailed(client, p.id, { code: e?.code || 'stripe_rejected', message: e?.message, actor })
      return { ok: false, stage: 'payout', error: e?.message }
    }
    await auditFinance(client, { actor, action: 'bank_payout_unknown_outcome', entityType: 'settlement_payout', entityId: p.id, sellerId: p.seller_id, details: { error: e?.message, attempt } })
    return { ok: false, stage: 'payout', pending: true, error: e?.message }
  }
  await client.query(
    `UPDATE seller_settlement_payouts SET stripe_payout_id = $2, status = 'payout_pending', failure_code = NULL, failure_message = NULL, updated_at = now() WHERE id = $1`,
    [p.id, po.id],
  )
  if (po.status === 'paid') await markPayoutPaid(client, p.id, { stripePayoutId: po.id, actor })
  return { ok: true, stripePayoutId: po.id }
}

/**
 * Bank payout of a 'transferred' settlement once the funds are AVAILABLE on the connected account
 * (Stripe: transfers to recipient accounts become available after ~24 h). Until then the payout
 * stays 'transferred' and the hourly reconciler checks again.
 */
async function tryBankPayout(client, stripe, payoutId, { actor = 'system' } = {}) {
  const p = (await client.query('SELECT * FROM seller_settlement_payouts WHERE id = $1', [payoutId])).rows[0]
  if (!p || p.status !== 'transferred') return { ok: false, reason: p ? p.status : 'not_found' }
  const available = await connectedAvailableCents(client, stripe, p, { actor })
  if (available < Number(p.amount_cents)) return { ok: true, waiting: 'funds_not_yet_available', available }
  return bankPayoutStep(client, stripe, p, { actor })
}

/**
 * Moves the money of a 'created' payout: one Stripe transfer per planned order chunk
 * (source_transaction + transfer_group ORDER_<id>, idempotency key per chunk), then — once the
 * funds are available — a bank payout from the connected account. Unknown-outcome errors leave
 * the chunk 'pending' so the reconciler retries with the SAME idempotency key (Stripe returns the
 * original transfer instead of moving the money twice). A definitive rejection before any money
 * moved releases the payout; after a partial transfer it goes to 'transfer_review' (no auto-undo).
 */
async function executeStripePayout(client, stripe, payoutId, { actor = 'system' } = {}) {
  const p = (await client.query('SELECT * FROM seller_settlement_payouts WHERE id = $1', [payoutId])).rows[0]
  if (!p) throw new Error('payout not found')
  if (p.method !== 'stripe_connect') return { ok: false, reason: 'not_stripe' }
  if (['paid', 'payout_pending', 'payout_failed'].includes(p.status)) return { ok: true, already: true }
  if (p.status === 'failed') return { ok: false, reason: 'failed' }
  if (p.status === 'transfer_review') return { ok: false, reason: 'transfer_review' }
  if (p.status === 'transferred') return tryBankPayout(client, stripe, payoutId, { actor })
  if (!p.stripe_account_id) {
    await releasePayout(client, payoutId, { reason: 'no_connected_account', code: 'no_connected_account', actor })
    return { ok: false, reason: 'no_connected_account' }
  }
  await client.query(`UPDATE seller_settlement_payouts SET status = 'transfer_pending', updated_at = now() WHERE id = $1 AND status = 'created'`, [payoutId])
  const chunks = (await client.query(
    `SELECT * FROM seller_payout_transfers WHERE payout_id = $1 AND status = 'pending' ORDER BY created_at, id`, [payoutId],
  )).rows
  for (const t of chunks) {
    let tr
    try {
      tr = await stripe.transfers.create(
        {
          amount: Number(t.amount_cents), currency: p.currency || 'eur', destination: p.stripe_account_id,
          transfer_group: t.transfer_group,
          ...(t.charge_id ? { source_transaction: t.charge_id } : {}),
          metadata: { settlement_payout_id: p.id, seller_id: p.seller_id, order_id: t.order_id || '' },
        },
        { idempotencyKey: t.idempotency_key },
      )
    } catch (e) {
      if (!isDefinitiveStripeError(e)) {
        await auditFinance(client, { actor, action: 'transfer_unknown_outcome', entityType: 'settlement_payout', entityId: payoutId, sellerId: p.seller_id, details: { chunk: t.id, error: e?.message } })
        return { ok: false, stage: 'transfer', pending: true, error: e?.message }
      }
      await client.query(`UPDATE seller_payout_transfers SET status = 'failed', failure_message = $2, updated_at = now() WHERE id = $1`, [t.id, e?.message || 'rejected'])
      const moved = (await client.query(`SELECT COUNT(*)::int AS n FROM seller_payout_transfers WHERE payout_id = $1 AND status = 'succeeded'`, [payoutId])).rows[0].n
      if (!moved) {
        await releasePayout(client, payoutId, { reason: e?.message || 'transfer_rejected', code: e?.code || 'transfer_rejected', actor })
      } else {
        await client.query(
          `UPDATE seller_settlement_payouts SET status = 'transfer_review', failure_code = $2, failure_message = $3, updated_at = now() WHERE id = $1`,
          [payoutId, e?.code || 'transfer_rejected', e?.message || null],
        )
        await auditFinance(client, { actor, action: 'transfer_partial_failure', entityType: 'settlement_payout', entityId: payoutId, sellerId: p.seller_id, details: { chunk: t.id, error: e?.message } })
      }
      return { ok: false, stage: 'transfer', error: e?.message }
    }
    await client.query(
      `UPDATE seller_payout_transfers SET status = 'succeeded', stripe_transfer_id = $2, updated_at = now() WHERE id = $1`,
      [t.id, tr.id],
    )
  }
  const first = (await client.query(
    `SELECT stripe_transfer_id FROM seller_payout_transfers WHERE payout_id = $1 AND status = 'succeeded' ORDER BY created_at, id LIMIT 1`, [payoutId],
  )).rows[0]
  await client.query(
    `UPDATE seller_settlement_payouts SET stripe_transfer_id = COALESCE(stripe_transfer_id, $2), status = 'transferred', updated_at = now() WHERE id = $1`,
    [payoutId, first?.stripe_transfer_id || null],
  )
  await auditFinance(client, { actor, action: 'transfers_created', entityType: 'settlement_payout', entityId: payoutId, sellerId: p.seller_id, details: { chunks: chunks.length } })
  return tryBankPayout(client, stripe, payoutId, { actor })
}

/**
 * Retry of a failed BANK payout (Phase 14). Checks first that the previous Stripe payout really
 * ended failed/canceled and that the account can receive payouts again — so a retry can never
 * produce a second successful payout for the same settlement.
 */
async function retryBankPayout(client, stripe, payoutId, { actor = 'system' } = {}) {
  const p = (await client.query('SELECT * FROM seller_settlement_payouts WHERE id = $1', [payoutId])).rows[0]
  if (!p) throw Object.assign(new Error('payout not found'), { status: 404 })
  if (p.status !== 'payout_failed') throw Object.assign(new Error(`payout is ${p.status}, not payout_failed`), { status: 409 })
  if (p.stripe_payout_id) {
    const prev = await stripe.payouts.retrieve(p.stripe_payout_id, { stripeAccount: p.stripe_account_id })
    if (prev.status === 'paid') { await markPayoutPaid(client, p.id, { stripePayoutId: prev.id, actor }); return { ok: true, already: true } }
    if (!['failed', 'canceled'].includes(prev.status)) throw Object.assign(new Error(`previous Stripe payout is ${prev.status}`), { status: 409 })
  }
  const ready = await sellerAccountReadiness(client, p.seller_id)
  if (!ready.ready) throw Object.assign(new Error(`connected account not ready: ${ready.reason}`), { status: 409 })
  const available = await connectedAvailableCents(client, stripe, p, { actor })
  if (available < Number(p.amount_cents)) throw Object.assign(new Error(`connected balance ${available} < ${p.amount_cents}`), { status: 409 })
  await auditFinance(client, { actor, action: 'bank_payout_retry', entityType: 'settlement_payout', entityId: p.id, sellerId: p.seller_id, details: { previous: p.stripe_payout_id } })
  return bankPayoutStep(client, stripe, p, { actor })
}

/** Webhook entry: payout.* on a connected account → our settlement payout. */
async function handleStripePayoutEvent(client, po, type, { actor = 'stripe_webhook' } = {}) {
  let p = (await client.query('SELECT * FROM seller_settlement_payouts WHERE stripe_payout_id = $1', [po.id])).rows[0]
  if (!p && po.metadata?.settlement_payout_id) {
    p = (await client.query('SELECT * FROM seller_settlement_payouts WHERE id::text = $1', [String(po.metadata.settlement_payout_id)])).rows[0]
  }
  if (!p) return { matched: false }
  if (type === 'payout.paid') await markPayoutPaid(client, p.id, { stripePayoutId: po.id, actor })
  else if (type === 'payout.failed' || type === 'payout.canceled') {
    await markBankPayoutFailed(client, p.id, { stripePayoutId: po.id, code: po.failure_code || type, message: po.failure_message || null, actor })
  }
  return { matched: true, payoutId: p.id }
}

/**
 * transfer.reversed: money came back to the platform. A fully reversed settlement that never
 * reached the bank is reversed in the ledger (claims released); anything partial or after a bank
 * payout is flagged for review — never silently absorbed.
 */
async function handleTransferReversed(client, tr, { actor = 'stripe_webhook' } = {}) {
  const t = (await client.query('SELECT * FROM seller_payout_transfers WHERE stripe_transfer_id = $1', [tr.id])).rows[0]
  if (!t) return { matched: false }
  const p = (await client.query('SELECT * FROM seller_settlement_payouts WHERE id = $1', [t.payout_id])).rows[0]
  const reversed = Number(tr.amount_reversed || 0)
  await client.query(`UPDATE seller_payout_transfers SET status = 'reversed', updated_at = now() WHERE id = $1 AND $2 >= amount_cents`, [t.id, reversed])
  const all = (await client.query('SELECT status FROM seller_payout_transfers WHERE payout_id = $1', [p.id])).rows
  const fullyBack = all.every((x) => x.status === 'reversed' || x.status === 'failed')
  if (fullyBack && ['transferred', 'transfer_pending', 'transfer_review'].includes(p.status)) {
    await withTx(client, async () => {
      await client.query(
        `UPDATE seller_settlement_payouts SET status = 'failed', failure_code = 'transfer_reversed', failed_at = now(), updated_at = now() WHERE id = $1`,
        [p.id],
      )
      await client.query('UPDATE seller_payout_items SET released_at = now() WHERE payout_id = $1 AND released_at IS NULL', [p.id])
      await appendLedgerEntry(client, {
        sellerId: p.seller_id, payoutId: p.id, eventType: 'PAYOUT_REVERSAL', amountCents: Number(p.amount_cents),
        idempotencyKey: `PAYOUT_REVERSAL:${p.id}`, referenceId: tr.id, metadata: { reason: 'transfer_reversed' },
      })
      await client.query(`UPDATE seller_payables SET status = 'eligible', payout_id = NULL WHERE payout_id = $1 AND status = 'in_payout'`, [p.id])
      await auditFinance(client, { actor, action: 'transfer_reversed', entityType: 'settlement_payout', entityId: p.id, sellerId: p.seller_id, details: { transfer: tr.id, reversed } })
    })
  } else {
    await auditFinance(client, { actor, action: 'transfer_reversal_needs_review', entityType: 'settlement_payout', entityId: p.id, sellerId: p.seller_id, details: { transfer: tr.id, reversed, status: p.status } })
  }
  return { matched: true }
}

/**
 * Platform balance check before a payout run: Stripe moves negative connected balances into
 * `connect_reserved` on the platform. Reported (audit) instead of silently ignored.
 */
async function auditPlatformConnectReserved(client, stripe, { actor = 'payout_job' } = {}) {
  try {
    const bal = await stripe.balance.retrieve()
    const reserved = (bal.connect_reserved || []).reduce((s, b) => s + Number(b.amount || 0), 0)
    if (reserved > 0) await auditFinance(client, { actor, action: 'platform_connect_reserved', entityType: 'platform', entityId: 'stripe', details: { connect_reserved: bal.connect_reserved } })
    return reserved
  } catch (e) {
    await auditFinance(client, { actor, action: 'platform_balance_check_failed', entityType: 'platform', entityId: 'stripe', details: { error: e?.message } }).catch(() => {})
    return null
  }
}

module.exports = {
  OPEN_PAYOUT_STATUSES,
  mirrorLegacyAdjustments,
  minPayoutCents,
  claimableEntries,
  sellerSettlementSummary,
  sellerAccountReadiness,
  buildTransferPlan,
  createSettlementPayout,
  executeStripePayout,
  tryBankPayout,
  releasePayout,
  markPayoutPaid,
  markBankPayoutFailed,
  retryBankPayout,
  handleStripePayoutEvent,
  handleTransferReversed,
  auditPlatformConnectReserved,
}
