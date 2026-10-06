#!/usr/bin/env node
'use strict'

/**
 * Legacy orders (paid BEFORE the settlement cutover) are not settled automatically — their
 * history is not reconstructed by guessing. This script reports, per order, what can be derived
 * reliably and what cannot, so a human decides.
 *
 *   node scripts/settlement-legacy-report.js                 # report only (default, read-only)
 *   node scripts/settlement-legacy-report.js --json          # same, machine readable
 *   node scripts/settlement-legacy-report.js --apply --orders=<uuid>,<uuid>
 *       creates payables ONLY for the listed orders, after re-verifying each PaymentIntent with
 *       Stripe. Use it only for orders a superuser confirmed were never paid out.
 *
 * Reliably derivable: item gross (unit price × qty), item seller (store_order_items.seller_id),
 * per-seller shipping (shipping_by_seller, when stored), PaymentIntent id, payment succeeded
 * (verified at checkout + re-verifiable with Stripe), delivery date only if a carrier event exists.
 * NOT derivable: commission rate at order time (no snapshot — current rate is used and the
 * payable source says so), whether / how much was already paid out (old seller_payouts rows are
 * period statements and the old IBAN job keyed on store_orders.seller_id = 'default'), refunds
 * executed only in the database without Stripe.
 */

require('dotenv').config()
const { Client } = require('pg')

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const asJson = args.includes('--json')
const onlyOrders = (args.find((a) => a.startsWith('--orders=')) || '').slice('--orders='.length).split(',').map((s) => s.trim()).filter(Boolean)

async function main() {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl) throw new Error('DATABASE_URL not set')
  const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
  await client.connect()
  try {
    const rows = (await client.query(
      `SELECT o.id, o.order_number, o.created_at, o.payment_intent_id, o.total_cents, o.shipping_cents,
              o.shipping_by_seller IS NOT NULL AS has_shipping_split, o.delivery_date, o.stripe_payout_status,
              o.order_status,
              (SELECT array_agg(DISTINCT NULLIF(NULLIF(oi.seller_id, ''), 'default')) FROM store_order_items oi WHERE oi.order_id = o.id) AS sellers,
              (SELECT bool_or(oi.seller_id IS NULL OR oi.seller_id IN ('', 'default')) FROM store_order_items oi WHERE oi.order_id = o.id) AS has_unstamped_items,
              EXISTS (SELECT 1 FROM store_shipment_events e WHERE e.order_id = o.id AND e.status = 'zugestellt' AND e.source IN ('sendcloud', 'api')) AS carrier_delivered,
              EXISTS (SELECT 1 FROM store_returns r WHERE r.order_id = o.id AND r.refund_status = 'erstattet') AS db_refund_marked
         FROM store_orders o
        WHERE o.payment_status IN ('bezahlt', 'refunded')
          AND o.created_at < (SELECT value::timestamptz FROM settlement_settings WHERE key = 'cutover_at')
          AND NOT EXISTS (SELECT 1 FROM seller_payables p WHERE p.order_id = o.id)
        ORDER BY o.created_at`,
    )).rows
    const report = rows.map((r) => ({
      order_id: r.id,
      order_number: r.order_number ? Number(r.order_number) : null,
      created_at: r.created_at,
      sellers: (r.sellers || []).filter(Boolean),
      derivable: {
        item_gross_and_seller: !r.has_unstamped_items,
        per_seller_shipping: r.has_shipping_split || (r.sellers || []).filter(Boolean).length <= 1,
        payment_intent: !!r.payment_intent_id,
        carrier_confirmed_delivery: r.carrier_delivered,
      },
      not_derivable: [
        'commission_rate_at_order_time',
        'already_paid_out_amount',
        ...(r.db_refund_marked ? ['refund_marked_in_db_without_stripe_proof'] : []),
        ...(r.stripe_payout_status === 'paid' ? ['legacy_payout_flag_paid'] : []),
      ],
    }))

    if (!apply) {
      if (asJson) console.log(JSON.stringify(report, null, 2))
      else {
        console.log(`Legacy orders without payables (before cutover): ${report.length}`)
        for (const r of report) {
          console.log(`#${r.order_number || r.order_id}  sellers=${r.sellers.join('|') || '?'}  derivable=${Object.entries(r.derivable).filter(([, v]) => v).map(([k]) => k).join(',')}  NOT=${r.not_derivable.join(',')}`)
        }
        console.log('\nRead-only. To settle specific verified orders: --apply --orders=<id,id>')
      }
      return
    }

    if (!onlyOrders.length) throw new Error('--apply requires --orders=<uuid,...> (no bulk backfill by design)')
    const settlement = require('../src/settlement')
    const { loadPlatformCheckoutRow, resolveStripeSecretKeyFromPlatform } = require('../src/routes/platform-checkout')
    const key = resolveStripeSecretKeyFromPlatform(await loadPlatformCheckoutRow(client))
    if (!key) throw new Error('Stripe secret key not configured')
    const stripe = new (require('stripe'))(key)
    for (const id of onlyOrders) {
      const r = report.find((x) => x.order_id === id)
      if (!r) { console.log(`${id}: not a legacy order without payables — skipped`); continue }
      if (!r.derivable.item_gross_and_seller) { console.log(`${id}: unstamped items — resolve sellers first, skipped`); continue }
      const o = rows.find((x) => x.id === id)
      const pi = await stripe.paymentIntents.retrieve(o.payment_intent_id)
      if (pi.status !== 'succeeded') { console.log(`${id}: PaymentIntent ${pi.status} — skipped`); continue }
      await settlement.recordOrderPayment(client, {
        orderId: id, paymentIntentId: pi.id, chargeId: typeof pi.latest_charge === 'string' ? pi.latest_charge : null,
        currency: pi.currency, grossAmountCents: Number(pi.amount_received || pi.amount),
        paymentSucceededAt: new Date(pi.created * 1000), source: 'legacy_backfill_verified', feeBearer: settlement.stripeFeeBearer(),
      })
      const res = await settlement.createPayablesForOrder(client, id, { source: 'legacy_backfill', actor: 'legacy-script' })
      await settlement.auditFinance(client, { actor: 'legacy-script', action: 'legacy_order_settled', entityType: 'order', entityId: id, details: { created: res.created, not_derivable: r.not_derivable } })
      console.log(`${id}: payables created (${res.created}); commission uses CURRENT seller rate (flagged in payable.source)`)
    }
  } finally {
    await client.end()
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
