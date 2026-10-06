'use strict'

/**
 * Test harness for the settlement integration tests: a real PostgreSQL database
 * (SETTLEMENT_TEST_PG_URL) with the subset of the production tables the settlement code reads,
 * column-for-column as server.js creates them, plus a deterministic fake Stripe client.
 */

const { ensureSettlementSchema } = require('./schema')

const TEST_PG_URL = process.env.SETTLEMENT_TEST_PG_URL || ''

const BASE_TABLES = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
  `CREATE TABLE seller_users (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     email varchar(255) UNIQUE NOT NULL,
     password_hash varchar(255) NOT NULL DEFAULT 'x',
     store_name varchar(255) DEFAULT '',
     seller_id varchar(255) UNIQUE NOT NULL,
     is_superuser boolean DEFAULT false,
     sub_of_seller_id varchar(255),
     approval_status varchar(30) DEFAULT 'approved',
     commission_rate numeric,
     iban text, payment_account_holder text,
     company_name varchar(255), first_name varchar(255), last_name varchar(255),
     tax_id varchar(100), vat_id varchar(100), business_address jsonb,
     stripe_custom_account_id text, stripe_account_id varchar(255),
     created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
   )`,
  `CREATE TABLE admin_hub_products (
     id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
     seller_id varchar(255),
     metadata jsonb DEFAULT '{}'::jsonb
   )`,
  `CREATE TABLE store_orders (
     id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
     order_number BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 100001 INCREMENT BY 1),
     payment_intent_id text,
     status varchar(50) NOT NULL DEFAULT 'paid',
     seller_id varchar(255) DEFAULT 'default',
     payment_status varchar(50) NOT NULL DEFAULT 'bezahlt',
     delivery_status varchar(50) NOT NULL DEFAULT 'offen',
     order_status varchar(50) NOT NULL DEFAULT 'offen',
     checkout_payment_kind varchar(40) DEFAULT 'stripe',
     subtotal_cents integer NOT NULL DEFAULT 0,
     shipping_cents integer NOT NULL DEFAULT 0,
     discount_cents integer NOT NULL DEFAULT 0,
     total_cents integer NOT NULL DEFAULT 0,
     currency text NOT NULL DEFAULT 'eur',
     shipping_by_seller jsonb,
     delivery_date timestamp,
     tracking_number text,
     created_at timestamp DEFAULT now(),
     updated_at timestamp DEFAULT now()
   )`,
  `CREATE TABLE store_order_items (
     id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
     order_id uuid NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
     product_id text,
     quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
     unit_price_cents integer NOT NULL DEFAULT 0,
     title text,
     seller_id varchar(255),
     created_at timestamp DEFAULT now(),
     updated_at timestamp DEFAULT now()
   )`,
  `CREATE TABLE store_returns (
     id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
     order_id uuid REFERENCES store_orders(id) ON DELETE SET NULL,
     status varchar(50) NOT NULL DEFAULT 'offen',
     items jsonb,
     seller_id varchar(255),
     refund_amount_cents integer,
     refund_status varchar(50),
     created_at timestamp DEFAULT now(),
     updated_at timestamp DEFAULT now()
   )`,
  `CREATE TABLE seller_ledger_adjustments (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     seller_id text NOT NULL,
     type text NOT NULL,
     amount_cents integer NOT NULL,
     description_key text NOT NULL DEFAULT 'x',
     description_params jsonb DEFAULT '{}',
     order_id uuid REFERENCES store_orders(id),
     stripe_payment_intent_id text,
     charge_method text,
     settled_payout_id uuid,
     created_at timestamptz DEFAULT now()
   )`,
]

async function freshDatabase() {
  const { Client } = require('pg')
  const client = new Client({ connectionString: TEST_PG_URL })
  await client.connect()
  await client.query('DROP SCHEMA IF EXISTS public CASCADE')
  await client.query('CREATE SCHEMA public')
  for (const sql of BASE_TABLES) await client.query(sql)
  await ensureSettlementSchema(client)
  // Cutover in the past so fixtures dated "now - n days" are post-cutover.
  await client.query(`UPDATE settlement_settings SET value = (now() - interval '400 days')::text WHERE key = 'cutover_at'`)
  return client
}

async function addSeller(client, sellerId, extra = {}) {
  await client.query(
    `INSERT INTO seller_users (email, seller_id, commission_rate, approval_status, stripe_custom_account_id,
       stripe_payouts_enabled, stripe_transfers_capability, legal_entity_type, legal_name, iban,
       stripe_service_agreement, stripe_tos_accepted_at, stripe_tos_ip, vat_id, business_address, vat_id_vies_valid, vat_id_vies_checked_value)
     VALUES ($1, $2, $3, 'approved', $4, $5, $6, 'company', $7, 'DE89370400440532013000', $8, $9, $10, $11, $12::jsonb, $13, $14)`,
    [`${sellerId}@test.local`, sellerId, extra.rate ?? 0.12, extra.account ?? `acct_${sellerId}`,
      extra.payoutsEnabled ?? true, extra.transfers ?? 'active', extra.legalName ?? `${sellerId} GmbH`,
      extra.agreement ?? 'recipient', extra.tosAt === null ? null : new Date(Date.now() - 30 * 86400000), extra.tosAt === null ? null : '203.0.113.7',
      // Default fixture seller: Austrian company with VAT ID → commission invoiced reverse charge
      // (0 % German VAT). German sellers are created explicitly with { country: 'DE' }.
      extra.vatId !== undefined ? extra.vatId : 'ATU12345678',
      JSON.stringify({ street: 'Teststraße 1', postal_code: '1010', city: 'Wien', country: extra.country || 'AT' }),
      extra.viesValid !== undefined ? extra.viesValid : true,
      String(extra.vatId !== undefined ? (extra.vatId || '') : 'ATU12345678').replace(/\s/g, '').toUpperCase() || null],
  )
}

/**
 * Creates a paid order. items: [{ seller, price, qty }]; shippingBySeller: { seller: cents }.
 * Records the verified payment snapshot exactly like the checkout does.
 */
async function addPaidOrder(client, { items, shippingBySeller = null, paidCents = null, pi = null, createdAt = null }) {
  const { recordOrderPayment } = require('./payables')
  const subtotal = items.reduce((s, it) => s + it.price * (it.qty || 1), 0)
  const ship = shippingBySeller ? Object.values(shippingBySeller).reduce((a, b) => a + b, 0) : 0
  const total = paidCents != null ? paidCents : subtotal + ship
  const piId = pi || `pi_${Math.random().toString(36).slice(2, 12)}`
  const o = (await client.query(
    `INSERT INTO store_orders (payment_intent_id, subtotal_cents, shipping_cents, total_cents, shipping_by_seller, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, COALESCE($6::timestamp, now())) RETURNING *`,
    [piId, subtotal, ship, total, shippingBySeller ? JSON.stringify(shippingBySeller) : null, createdAt],
  )).rows[0]
  const itemRows = []
  for (const it of items) {
    itemRows.push((await client.query(
      `INSERT INTO store_order_items (order_id, quantity, unit_price_cents, seller_id, title)
       VALUES ($1, $2, $3, $4, 'Item') RETURNING *`,
      [o.id, it.qty || 1, it.price, it.seller],
    )).rows[0])
  }
  await recordOrderPayment(client, {
    orderId: o.id, paymentIntentId: piId, chargeId: `ch_${piId.slice(3)}`, currency: 'eur',
    grossAmountCents: total, source: 'checkout_verified',
  })
  return { order: o, items: itemRows, pi: piId }
}

async function deliver(client, orderId, daysAgo) {
  const { confirmDelivery } = require('./payables')
  await confirmDelivery(client, orderId, { source: 'carrier_webhook', at: new Date(Date.now() - daysAgo * 86400000) })
}

/** Deterministic in-memory Stripe double honouring idempotency keys like the real API. */
function fakeStripe(opts = {}) {
  const calls = { transfers: [], payouts: [], refunds: [] }
  const byKey = new Map()
  let n = 0
  const idem = (key, make) => {
    if (key && byKey.has(key)) return byKey.get(key)
    const v = make()
    if (key) byKey.set(key, v)
    return v
  }
  const fail = (what) => {
    const f = opts.fail && opts.fail[what]
    if (!f) return
    const e = new Error(f.message || `${what} failed`)
    e.type = f.type || 'StripeInvalidRequestError'
    e.statusCode = f.statusCode || 400
    e.code = f.code || `${what}_failed`
    if (f.once) delete opts.fail[what]
    throw e
  }
  return {
    calls,
    opts,
    transfers: {
      create: async (params, o = {}) => {
        fail('transfer')
        return idem(o.idempotencyKey, () => { const t = { id: `tr_${++n}`, ...params }; calls.transfers.push(t); return t })
      },
    },
    payouts: {
      create: async (params, o = {}) => {
        fail('payout')
        return idem(o.idempotencyKey, () => { const p = { id: `po_${++n}`, status: 'pending', ...params, account: o.stripeAccount }; calls.payouts.push(p); return p })
      },
      retrieve: async (id) => {
        const p = calls.payouts.find((x) => x.id === id)
        return { ...p, status: (opts.payoutStatus && opts.payoutStatus[id]) || p.status }
      },
    },
    refunds: {
      create: async (params, o = {}) => {
        fail('refund')
        return idem(o.idempotencyKey, () => {
          const r = { id: `re_${++n}`, status: opts.refundStatus || 'succeeded', ...params }
          calls.refunds.push(r)
          return r
        })
      },
    },
    // Connected-account balance: everything transferred is available unless opts.available is set
    // (simulates the ~24 h recipient delay) — platform balance carries opts.connectReserved.
    balance: {
      retrieve: async (_params, o = {}) => {
        if (!o.stripeAccount) return { available: [], pending: [], connect_reserved: opts.connectReserved ? [{ amount: opts.connectReserved, currency: 'eur' }] : [] }
        const amount = opts.available != null ? opts.available
          : calls.transfers.filter((t) => t.destination === o.stripeAccount).reduce((x, t) => x + t.amount, 0)
            - calls.payouts.filter((p) => p.account === o.stripeAccount && !['failed', 'canceled'].includes((opts.payoutStatus && opts.payoutStatus[p.id]) || p.status)).reduce((x, p) => x + p.amount, 0)
        return { available: [{ amount, currency: 'eur' }], pending: [{ amount: 0, currency: 'eur' }] }
      },
    },
    charges: { retrieve: async (id) => ({ id, balance_transaction: { id: `txn_${id}`, fee: opts.fee ?? 175, net: 0 } }) },
    paymentIntents: { retrieve: async (id) => ({ id, status: 'succeeded', amount: 0, currency: 'eur', created: Math.floor(Date.now() / 1000) }) },
  }
}

const balanceOf = async (client, sellerId) => Number((await client.query(
  'SELECT COALESCE(SUM(amount_cents), 0)::bigint AS c FROM seller_ledger_entries WHERE seller_id = $1', [sellerId],
)).rows[0].c)

module.exports = { TEST_PG_URL, freshDatabase, addSeller, addPaidOrder, deliver, fakeStripe, balanceOf }
