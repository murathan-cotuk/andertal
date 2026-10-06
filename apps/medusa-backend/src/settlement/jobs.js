'use strict'

const { auditFinance } = require('./ledger')
const { recordOrderPayment, createPayablesForOrder, refreshEligibilityForSeller } = require('./payables')
const { createSettlementPayout, executeStripePayout, tryBankPayout, sellerAccountReadiness, claimableEntries, mirrorLegacyAdjustments, auditPlatformConnectReserved } = require('./payouts')
const { executeRefund } = require('./refunds')
const { stripeFeeBearer, chargeFeeSnapshot } = require('./stripe-events')

/**
 * Paid orders since the cutover that have no payables yet (checkout hook failed / crashed).
 * The payment is re-verified against Stripe before anything is booked.
 */
async function sweepOrdersWithoutPayables(client, stripe, { limit = 200 } = {}) {
  const r = await client.query(
    `SELECT o.id, o.payment_intent_id, o.checkout_payment_kind, o.total_cents, o.currency
       FROM store_orders o
      WHERE o.payment_status = 'bezahlt'
        AND o.created_at >= (SELECT value::timestamptz FROM settlement_settings WHERE key = 'cutover_at')
        AND NOT EXISTS (SELECT 1 FROM seller_payables p WHERE p.order_id = o.id)
      ORDER BY o.created_at ASC
      LIMIT $1`,
    [limit],
  )
  let fixed = 0
  for (const o of r.rows) {
    try {
      const zeroPay = String(o.checkout_payment_kind || '') === 'platform_loyalty'
      const has = (await client.query('SELECT 1 FROM order_payments WHERE order_id = $1::uuid', [o.id])).rows.length > 0
      if (!has && !zeroPay) {
        if (!stripe || !o.payment_intent_id) continue
        const pi = await stripe.paymentIntents.retrieve(o.payment_intent_id)
        if (pi.status !== 'succeeded') {
          await auditFinance(client, { action: 'sweep_payment_not_succeeded', entityType: 'order', entityId: o.id, details: { pi: pi.id, status: pi.status } })
          continue
        }
        const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id
        await recordOrderPayment(client, {
          orderId: o.id, paymentIntentId: pi.id, currency: pi.currency, grossAmountCents: Number(pi.amount_received || pi.amount),
          paymentSucceededAt: new Date(pi.created * 1000), source: 'sweeper_verified', feeBearer: stripeFeeBearer(),
          ...(await chargeFeeSnapshot(stripe, chargeId)),
        })
      }
      const res = await createPayablesForOrder(client, o.id, { source: 'sweeper' })
      if (res.created) fixed += 1
    } catch (e) {
      await auditFinance(client, { action: 'sweep_failed', entityType: 'order', entityId: o.id, details: { error: e?.message } }).catch(() => {})
    }
  }
  return { checked: r.rows.length, fixed }
}

/** Payouts / refunds whose Stripe call had an unknown outcome: retried with the same idempotency key. */
async function reconcileInFlight(client, stripe) {
  if (!stripe) return { payouts: 0, refunds: 0 }
  const ps = (await client.query(
    `SELECT id FROM seller_settlement_payouts
      WHERE method = 'stripe_connect' AND status IN ('created', 'transfer_pending')
        AND updated_at < now() - interval '10 minutes'`,
  )).rows
  for (const p of ps) await executeStripePayout(client, stripe, p.id, { actor: 'reconciler' }).catch(() => {})
  // Transferred settlements wait until the funds are available on the connected account
  // (recipient transfers: ~24 h), then the bank payout is created.
  const waiting = (await client.query(
    `SELECT id FROM seller_settlement_payouts WHERE method = 'stripe_connect' AND status = 'transferred'`,
  )).rows
  for (const p of waiting) await tryBankPayout(client, stripe, p.id, { actor: 'reconciler' }).catch(() => {})
  const rs = (await client.query(
    `SELECT id FROM order_refunds WHERE status = 'pending' AND stripe_refund_id IS NULL
        AND requested_by <> 'stripe_dashboard' AND updated_at < now() - interval '10 minutes'`,
  )).rows
  for (const r of rs) await executeRefund(client, stripe, r.id, { actor: 'reconciler' }).catch(() => {})
  return { payouts: ps.length + waiting.length, refunds: rs.length }
}

/**
 * Creates + executes the payout of every seller with something claimable. `runKey` (e.g. the
 * Berlin payout date) is part of each business key → re-running the same day is a no-op.
 */
async function runScheduledPayouts(client, stripe, { runKey, now = new Date(), actor = 'payout_job', onlySellerId = null } = {}) {
  const sellers = onlySellerId
    ? [{ seller_id: onlySellerId }]
    : (await client.query(
      `SELECT DISTINCT seller_id FROM seller_ledger_entries
        UNION SELECT DISTINCT seller_id FROM seller_payables WHERE status IN ('pending', 'eligible', 'blocked')`,
    )).rows
  const results = []
  if (stripe) await auditPlatformConnectReserved(client, stripe, { actor })
  for (const { seller_id: sellerId } of sellers) {
    try {
      await mirrorLegacyAdjustments(client, sellerId)
      await refreshEligibilityForSeller(client, sellerId, now)
      const entries = await claimableEntries(client, sellerId)
      const amount = entries.reduce((s, e) => s + Number(e.amount_cents), 0)
      if (amount <= 0) { results.push({ sellerId, skipped: amount < 0 ? 'negative_balance' : 'nothing_due', amount }); continue }
      const ready = await sellerAccountReadiness(client, sellerId)
      if (!ready.ready) {
        results.push({ sellerId, skipped: ready.reason, amount })
        await auditFinance(client, { actor, action: 'payout_skipped_account_not_ready', entityType: 'seller', entityId: sellerId, sellerId, details: { reason: ready.reason, amount } })
        continue
      }
      const created = await createSettlementPayout(client, {
        sellerId, method: 'stripe_connect', businessKey: `AUTO:${runKey}:${sellerId}`, actor, accountId: ready.account, now,
      })
      if (!created.payout) { results.push({ sellerId, skipped: created.skipped, amount: created.amount }); continue }
      if (!stripe) { results.push({ sellerId, payoutId: created.payout.id, pending: 'stripe_not_configured' }); continue }
      const exec = await executeStripePayout(client, stripe, created.payout.id, { actor })
      results.push({ sellerId, payoutId: created.payout.id, ...exec })
    } catch (e) {
      results.push({ sellerId, error: e?.message })
      await auditFinance(client, { actor, action: 'payout_job_error', entityType: 'seller', entityId: sellerId, sellerId, details: { error: e?.message } }).catch(() => {})
    }
  }
  return results
}

/**
 * Re-checks sellers' own VAT IDs in VIES (EU sellers outside Germany): when the ID changed or the
 * last check is older than 30 days. A VIES outage keeps the previous result (no flapping); a
 * changed ID resets the result until checked.
 */
async function refreshSellerVatIdsViaVies(client, { limit = 50, check = null } = {}) {
  const { checkVatIdViaVies } = require('../vies-check')
  const viesCheck = check || checkVatIdViaVies
  const rows = (await client.query(
    `SELECT seller_id, vat_id, business_address, vat_id_vies_checked_value
       FROM seller_users
      WHERE sub_of_seller_id IS NULL AND NULLIF(TRIM(COALESCE(vat_id, '')), '') IS NOT NULL
        AND UPPER(COALESCE(business_address->>'country', 'DE')) <> 'DE'
        AND (vat_id_vies_checked_at IS NULL OR vat_id_vies_checked_at < now() - interval '30 days'
             OR vat_id_vies_checked_value IS DISTINCT FROM REPLACE(UPPER(vat_id), ' ', ''))
      LIMIT $1`,
    [limit],
  )).rows
  let checked = 0
  for (const r of rows) {
    const raw = String(r.vat_id || '').replace(/\s/g, '').toUpperCase()
    const cc = /^[A-Z]{2}/.test(raw) ? raw.slice(0, 2) : String(r.business_address?.country || '').toUpperCase()
    const num = /^[A-Z]{2}/.test(raw) ? raw.slice(2) : raw
    const res = await viesCheck({ countryCode: cc === 'GR' ? 'EL' : cc, vatNumber: num })
    if (!res.ok) {
      if (r.vat_id_vies_checked_value !== raw) {
        await client.query(`UPDATE seller_users SET vat_id_vies_valid = NULL, vat_id_vies_checked_value = NULL WHERE seller_id = $1 AND sub_of_seller_id IS NULL`, [r.seller_id])
      }
      continue
    }
    await client.query(
      `UPDATE seller_users SET vat_id_vies_valid = $2, vat_id_vies_checked_at = now(), vat_id_vies_checked_value = $3
        WHERE seller_id = $1 AND sub_of_seller_id IS NULL`,
      [r.seller_id, res.valid, raw],
    )
    await auditFinance(client, { action: 'seller_vat_id_vies_checked', entityType: 'seller', entityId: r.seller_id, sellerId: r.seller_id, details: { valid: res.valid } })
    checked += 1
  }
  return { checked }
}

module.exports = { sweepOrdersWithoutPayables, reconcileInFlight, runScheduledPayouts, refreshSellerVatIdsViaVies }
