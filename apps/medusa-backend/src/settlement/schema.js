'use strict'

/**
 * Canonical settlement schema (docs/Odeme-Payout-Denetimi.md → implementation).
 *
 *   Payment (order_payments) → Seller Payable (seller_payables, per order item / per seller shipping)
 *   → Ledger (seller_ledger_entries, append-only) → Refund (order_refunds) / Dispute (order_disputes)
 *   → Settlement (seller_settlement_payouts + seller_payout_items) → Payout (Stripe transfer + payout)
 *
 * Every statement is idempotent (IF NOT EXISTS / OR REPLACE) and additive: no existing column is
 * dropped or rewritten, so the migration is safe to run on every boot and on a live database.
 * New tables deliberately carry no FOREIGN KEY to store_orders — finance records must outlive an
 * accidental order delete (orders.js refuses that delete once settlement data exists).
 */

const LEDGER_EVENT_TYPES = [
  'SALE',
  'COMMISSION',
  'SHIPPING',
  'REFUND',
  'COMMISSION_REFUND',
  'CHARGEBACK',
  'CHARGEBACK_RELEASE',
  'PAYOUT',
  'PAYOUT_REVERSAL',
  'ADJUSTMENT',
]

const STATEMENTS = [
  // ── Payment snapshot (Phase 4) ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS order_payments (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     order_id uuid NOT NULL,
     provider varchar(20) NOT NULL DEFAULT 'stripe',
     payment_intent_id text,
     charge_id text,
     balance_transaction_id text,
     currency varchar(3) NOT NULL DEFAULT 'eur',
     gross_amount_cents bigint NOT NULL CHECK (gross_amount_cents >= 0),
     stripe_fee_cents bigint,
     stripe_net_cents bigint,
     fee_bearer varchar(20),
     status varchar(30) NOT NULL DEFAULT 'succeeded',
     payment_succeeded_at timestamptz,
     source varchar(30) NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_order_payments_order ON order_payments(order_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_order_payments_pi ON order_payments(payment_intent_id) WHERE payment_intent_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_order_payments_charge ON order_payments(charge_id)`,

  // ── Seller payables (Phase 2) — immutable money snapshot per order item / seller shipping ──
  `CREATE TABLE IF NOT EXISTS seller_payables (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     seller_id varchar(255) NOT NULL CHECK (btrim(seller_id) <> '' AND seller_id <> 'default'),
     order_id uuid NOT NULL,
     order_item_id uuid,
     kind varchar(20) NOT NULL CHECK (kind IN ('item', 'shipping')),
     quantity integer NOT NULL DEFAULT 0,
     currency varchar(3) NOT NULL DEFAULT 'eur',
     gross_cents bigint NOT NULL DEFAULT 0 CHECK (gross_cents >= 0),
     shipping_cents bigint NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
     commission_rate_snapshot numeric(9,6) NOT NULL DEFAULT 0,
     commission_cents bigint NOT NULL DEFAULT 0 CHECK (commission_cents >= 0),
     commission_vat_rate_snapshot numeric(6,3) NOT NULL DEFAULT 0,
     commission_vat_cents bigint NOT NULL DEFAULT 0,
     commission_vat_scheme varchar(30) NOT NULL DEFAULT 'domestic',
     refunded_quantity integer NOT NULL DEFAULT 0,
     refunded_gross_cents bigint NOT NULL DEFAULT 0,
     refunded_shipping_cents bigint NOT NULL DEFAULT 0,
     refund_commission_reversal_cents bigint NOT NULL DEFAULT 0,
     refund_commission_vat_reversal_cents bigint NOT NULL DEFAULT 0,
     chargeback_cents bigint NOT NULL DEFAULT 0,
     -- Commission is withheld INCLUDING its VAT (the Provisionsrechnung states the gross commission
     -- as the amount due; reverse-charge sellers have a 0 % VAT snapshot).
     net_cents bigint GENERATED ALWAYS AS (
       gross_cents + shipping_cents - commission_cents - commission_vat_cents
       - refunded_gross_cents - refunded_shipping_cents
       + refund_commission_reversal_cents + refund_commission_vat_reversal_cents
       - chargeback_cents
     ) STORED,
     status varchar(20) NOT NULL DEFAULT 'pending'
       CHECK (status IN ('pending', 'eligible', 'blocked', 'in_payout', 'paid', 'refunded', 'charged_back', 'cancelled')),
     block_reasons text[] NOT NULL DEFAULT '{}',
     delivered_at timestamptz,
     eligible_at timestamptz,
     paid_at timestamptz,
     payout_id uuid,
     source text NOT NULL DEFAULT 'checkout',
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     CHECK (refunded_gross_cents >= 0 AND refunded_gross_cents <= gross_cents),
     CHECK (refunded_shipping_cents >= 0 AND refunded_shipping_cents <= shipping_cents),
     CHECK (refund_commission_reversal_cents >= 0 AND refund_commission_reversal_cents <= commission_cents),
     CHECK (refund_commission_vat_reversal_cents >= 0 AND refund_commission_vat_reversal_cents <= commission_vat_cents)
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_payables_item ON seller_payables(order_item_id) WHERE kind = 'item'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_payables_shipping ON seller_payables(order_id, seller_id) WHERE kind = 'shipping'`,
  `CREATE INDEX IF NOT EXISTS idx_seller_payables_seller_status ON seller_payables(seller_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_seller_payables_order ON seller_payables(order_id)`,

  // Amount snapshot columns are immutable once written: a commission-rate change, a product
  // price edit or a reassignment can never rewrite what was owed for an existing order.
  `CREATE OR REPLACE FUNCTION seller_payables_guard_snapshot() RETURNS trigger AS $$
   BEGIN
     IF NEW.seller_id IS DISTINCT FROM OLD.seller_id
        OR NEW.order_id IS DISTINCT FROM OLD.order_id
        OR NEW.order_item_id IS DISTINCT FROM OLD.order_item_id
        OR NEW.kind IS DISTINCT FROM OLD.kind
        OR NEW.quantity IS DISTINCT FROM OLD.quantity
        OR NEW.currency IS DISTINCT FROM OLD.currency
        OR NEW.gross_cents IS DISTINCT FROM OLD.gross_cents
        OR NEW.shipping_cents IS DISTINCT FROM OLD.shipping_cents
        OR NEW.commission_rate_snapshot IS DISTINCT FROM OLD.commission_rate_snapshot
        OR NEW.commission_cents IS DISTINCT FROM OLD.commission_cents
        OR NEW.commission_vat_rate_snapshot IS DISTINCT FROM OLD.commission_vat_rate_snapshot
        OR NEW.commission_vat_cents IS DISTINCT FROM OLD.commission_vat_cents
        OR NEW.commission_vat_scheme IS DISTINCT FROM OLD.commission_vat_scheme THEN
       RAISE EXCEPTION 'seller_payables snapshot columns are immutable (payable %)', OLD.id;
     END IF;
     NEW.updated_at := now();
     RETURN NEW;
   END $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS trg_seller_payables_guard ON seller_payables`,
  `CREATE TRIGGER trg_seller_payables_guard BEFORE UPDATE ON seller_payables
     FOR EACH ROW EXECUTE FUNCTION seller_payables_guard_snapshot()`,

  // ── Append-only seller ledger (Phase 3) ──────────────────────────────────
  `CREATE TABLE IF NOT EXISTS seller_ledger_entries (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     seller_id varchar(255) NOT NULL CHECK (btrim(seller_id) <> '' AND seller_id <> 'default'),
     order_id uuid,
     order_item_id uuid,
     payable_id uuid,
     payout_id uuid,
     refund_id uuid,
     dispute_id uuid,
     event_type varchar(30) NOT NULL CHECK (event_type IN (${LEDGER_EVENT_TYPES.map((t) => `'${t}'`).join(', ')})),
     amount_cents bigint NOT NULL,
     currency varchar(3) NOT NULL DEFAULT 'eur',
     reference_id text,
     idempotency_key text NOT NULL,
     metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_ledger_idem ON seller_ledger_entries(idempotency_key)`,
  `CREATE INDEX IF NOT EXISTS idx_seller_ledger_seller ON seller_ledger_entries(seller_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_seller_ledger_payable ON seller_ledger_entries(payable_id)`,
  `CREATE INDEX IF NOT EXISTS idx_seller_ledger_order ON seller_ledger_entries(order_id)`,
  `CREATE OR REPLACE FUNCTION seller_ledger_entries_append_only() RETURNS trigger AS $$
   BEGIN
     RAISE EXCEPTION 'seller_ledger_entries is append-only — book a reversal entry instead';
   END $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS trg_seller_ledger_append_only ON seller_ledger_entries`,
  `CREATE TRIGGER trg_seller_ledger_append_only BEFORE UPDATE OR DELETE ON seller_ledger_entries
     FOR EACH ROW EXECUTE FUNCTION seller_ledger_entries_append_only()`,

  // ── Settlement payouts (Phase 1/12/13/14) — the ONLY record that says "money was paid" ──
  `CREATE TABLE IF NOT EXISTS seller_settlement_payouts (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     seller_id varchar(255) NOT NULL CHECK (btrim(seller_id) <> '' AND seller_id <> 'default'),
     business_key text NOT NULL,
     method varchar(30) NOT NULL CHECK (method IN ('stripe_connect', 'manual_bank_transfer')),
     amount_cents bigint NOT NULL CHECK (amount_cents > 0),
     currency varchar(3) NOT NULL DEFAULT 'eur',
     status varchar(30) NOT NULL DEFAULT 'created'
       CHECK (status IN ('created', 'transfer_pending', 'transfer_review', 'transferred', 'payout_pending', 'paid', 'failed', 'payout_failed')),
     stripe_account_id text,
     transfer_group text,
     stripe_transfer_id text,
     stripe_payout_id text,
     external_reference text,
     failure_code text,
     failure_message text,
     attempt_count integer NOT NULL DEFAULT 0,
     last_attempt_at timestamptz,
     created_by text,
     paid_at timestamptz,
     failed_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_payouts_business_key ON seller_settlement_payouts(business_key)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_payouts_transfer ON seller_settlement_payouts(stripe_transfer_id) WHERE stripe_transfer_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_payouts_payout ON seller_settlement_payouts(stripe_payout_id) WHERE stripe_payout_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_payouts_manual_ref ON seller_settlement_payouts(seller_id, external_reference) WHERE external_reference IS NOT NULL`,
  // At most one in-flight payout per seller — a second run while one is open cannot claim again.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_payouts_one_open ON seller_settlement_payouts(seller_id)
     WHERE status IN ('created', 'transfer_pending', 'transfer_review', 'transferred', 'payout_pending', 'payout_failed')`,

  // Which ledger entries a payout settles. One ACTIVE claim per entry → an entry (and therefore an
  // order item) can never be paid twice; a failed transfer releases its claims for the next run.
  `CREATE TABLE IF NOT EXISTS seller_payout_items (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     payout_id uuid NOT NULL REFERENCES seller_settlement_payouts(id),
     ledger_entry_id uuid NOT NULL REFERENCES seller_ledger_entries(id),
     amount_cents bigint NOT NULL,
     released_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_payout_items_active ON seller_payout_items(ledger_entry_id) WHERE released_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_seller_payout_items_payout ON seller_payout_items(payout_id)`,

  // One Stripe transfer per order (charge) inside a settlement payout: source_transaction = the
  // order's charge, transfer_group = ORDER_<id> (Stripe guidance for SCT reconciliation).
  `CREATE TABLE IF NOT EXISTS seller_payout_transfers (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     payout_id uuid NOT NULL REFERENCES seller_settlement_payouts(id),
     order_id uuid,
     charge_id text,
     amount_cents bigint NOT NULL CHECK (amount_cents > 0),
     transfer_group text NOT NULL,
     idempotency_key text NOT NULL,
     status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'reversed')),
     stripe_transfer_id text,
     failure_message text,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_payout_transfers_idem ON seller_payout_transfers(idempotency_key)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_payout_transfers_stripe ON seller_payout_transfers(stripe_transfer_id) WHERE stripe_transfer_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_seller_payout_transfers_payout ON seller_payout_transfers(payout_id)`,
  `CREATE INDEX IF NOT EXISTS idx_seller_payout_transfers_charge ON seller_payout_transfers(charge_id)`,

  // ── Refunds (Phase 8/9/20) ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS order_refunds (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     order_id uuid NOT NULL,
     return_id uuid,
     amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
     currency varchar(3) NOT NULL DEFAULT 'eur',
     status varchar(20) NOT NULL DEFAULT 'pending'
       CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'canceled')),
     payment_intent_id text,
     stripe_refund_id text,
     reason text,
     failure_reason text,
     idempotency_key text NOT NULL,
     requested_by text,
     seller_scope text,
     platform_borne_cents bigint NOT NULL DEFAULT 0,
     ledger_applied_at timestamptz,
     succeeded_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_order_refunds_idem ON order_refunds(idempotency_key)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_order_refunds_stripe ON order_refunds(stripe_refund_id) WHERE stripe_refund_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_order_refunds_order ON order_refunds(order_id)`,
  `CREATE TABLE IF NOT EXISTS order_refund_lines (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     refund_id uuid NOT NULL REFERENCES order_refunds(id),
     payable_id uuid NOT NULL REFERENCES seller_payables(id),
     seller_id varchar(255) NOT NULL,
     order_item_id uuid,
     kind varchar(20) NOT NULL,
     quantity integer NOT NULL DEFAULT 0,
     gross_cents bigint NOT NULL DEFAULT 0 CHECK (gross_cents >= 0),
     shipping_cents bigint NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
     commission_reversal_cents bigint NOT NULL DEFAULT 0 CHECK (commission_reversal_cents >= 0),
     commission_vat_reversal_cents bigint NOT NULL DEFAULT 0 CHECK (commission_vat_reversal_cents >= 0),
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_order_refund_lines_refund ON order_refund_lines(refund_id)`,

  // ── Disputes / chargebacks (Phase 11) ────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS order_disputes (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     stripe_dispute_id text NOT NULL,
     order_id uuid,
     charge_id text,
     payment_intent_id text,
     amount_cents bigint NOT NULL DEFAULT 0,
     currency varchar(3) NOT NULL DEFAULT 'eur',
     reason text,
     stripe_status text,
     outcome varchar(20) NOT NULL DEFAULT 'open' CHECK (outcome IN ('open', 'won', 'lost')),
     fee_cents bigint,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     closed_at timestamptz
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_order_disputes_stripe ON order_disputes(stripe_dispute_id)`,
  `CREATE INDEX IF NOT EXISTS idx_order_disputes_order ON order_disputes(order_id)`,

  // ── Central webhook store (Phase 15) ─────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS stripe_webhook_events (
     stripe_event_id text PRIMARY KEY,
     type text NOT NULL,
     account text,
     livemode boolean,
     status varchar(20) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed', 'ignored')),
     attempts integer NOT NULL DEFAULT 0,
     last_error text,
     payload jsonb NOT NULL,
     received_at timestamptz NOT NULL DEFAULT now(),
     processed_at timestamptz
   )`,
  `CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type ON stripe_webhook_events(type, received_at)`,

  // ── Finance audit log (Phase 1) ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS finance_audit_log (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     actor text,
     action text NOT NULL,
     entity_type text NOT NULL,
     entity_id text,
     seller_id text,
     details jsonb NOT NULL DEFAULT '{}'::jsonb,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_finance_audit_entity ON finance_audit_log(entity_type, entity_id)`,

  // Settlement cutover: orders paid / label charges booked from this moment on are settled by the
  // canonical system automatically. Earlier history is NOT reconstructed (scripts/settlement-legacy-report.js).
  `CREATE TABLE IF NOT EXISTS settlement_settings (
     key text PRIMARY KEY,
     value text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `INSERT INTO settlement_settings (key, value) VALUES ('cutover_at', now()::text) ON CONFLICT (key) DO NOTHING`,

  // ── Additive columns on existing tables ──────────────────────────────────
  // Delivery that counts for payout eligibility (Phase 6/7): only carrier webhook / carrier API /
  // superuser may set it. delivery_date stays the display field it always was.
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS delivery_confirmed_at timestamptz`,
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS delivery_confirmed_source varchar(30)`,
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS seller_reported_delivered_at timestamptz`,
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS payment_succeeded_at timestamptz`,
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS stripe_charge_id text`,
  `ALTER TABLE store_order_items ADD COLUMN IF NOT EXISTS commission_rate_snapshot numeric(9,6)`,
  `ALTER TABLE store_returns ADD COLUMN IF NOT EXISTS refund_id uuid`,
  `ALTER TABLE store_returns ADD COLUMN IF NOT EXISTS refund_failure_reason text`,
  // Connected-account (Custom) KYC state mirrored from Stripe (Phase 17/18) — never self-asserted.
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_transfers_capability text`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_requirements jsonb`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_disabled_reason text`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_account_synced_at timestamptz`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_tos_accepted_at timestamptz`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_service_agreement text`,
  // VIES result for the seller's own VAT ID — reverse charge on the commission only when valid.
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS vat_id_vies_valid boolean`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS vat_id_vies_checked_at timestamptz`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS vat_id_vies_checked_value text`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_tos_ip varchar(64)`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_tos_user_agent text`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_external_account_id text`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_external_account_status text`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_external_account_last4 varchar(8)`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS bank_holder_matches_legal_entity boolean`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS payout_blocked boolean NOT NULL DEFAULT false`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS payout_block_reason text`,
  // DAC7 / KYC data points (Phase 19) — stored as given by the seller; nothing is inferred.
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS legal_entity_type varchar(20)`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS legal_name text`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS date_of_birth date`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS tax_id_country varchar(2)`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS business_registration_number text`,
  `ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS business_registration_country varchar(2)`,
  // ── Per-seller shipments (multi-seller orders): one row per order × seller. Delivery of a
  // seller's shipment starts THAT seller's payout hold; without a row the order-level
  // delivery_confirmed_at applies (single-seller and legacy orders unchanged).
  `CREATE TABLE IF NOT EXISTS order_shipments (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     order_id uuid NOT NULL,
     seller_id varchar(255) NOT NULL,
     carrier_name text,
     tracking_number text,
     delivery_status varchar(20) NOT NULL DEFAULT 'offen' CHECK (delivery_status IN ('offen', 'versendet', 'zugestellt')),
     shipped_at timestamptz,
     seller_reported_delivered_at timestamptz,
     delivery_confirmed_at timestamptz,
     delivery_confirmed_source varchar(30),
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE (order_id, seller_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_order_shipments_tracking ON order_shipments (lower(tracking_number)) WHERE tracking_number IS NOT NULL`,
  `ALTER TABLE order_shipments ADD COLUMN IF NOT EXISTS label_url text`,
]

/**
 * Applies the settlement schema. Throws on the first failing statement — callers at boot should
 * log loudly: money flows depend on these tables, silently skipping them would be worse.
 */
async function ensureSettlementSchema(client) {
  for (const sql of STATEMENTS) {
    await client.query(sql)
  }
}

module.exports = { ensureSettlementSchema, LEDGER_EVENT_TYPES }
