'use strict'

/**
 * ERP connector tables (docs/CONNECTOR.md, JTL Faz E). ensure-pattern, idempotent.
 *  - erp_connections: one per seller and ERP (JTL SCX sellerId = our seller_id, \w{1,50})
 *  - erp_offer_links: SCX offer → Andertal product (variations: one product each, family-linked)
 *  - erp_event_log: processed SCX events (idempotency; SCX redelivers unacknowledged events)
 *  - erp_order_exports: which seller part of which order went to the ERP (+ cancellation sync)
 *  - erp_sync_state: cursors (stock updates)
 */
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS erp_connections (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     seller_id varchar(255) NOT NULL,
     erp_type varchar(20) NOT NULL,
     external_seller_id text NOT NULL,
     status varchar(20) NOT NULL DEFAULT 'active',
     company_name text,
     external_account_id text,
     connected_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     unlinked_at timestamptz,
     unlink_reason text,
     UNIQUE (erp_type, external_seller_id),
     UNIQUE (erp_type, seller_id)
   )`,
  `CREATE TABLE IF NOT EXISTS erp_offer_links (
     erp_type varchar(20) NOT NULL,
     external_seller_id text NOT NULL,
     offer_id bigint NOT NULL,
     product_id uuid,
     parent_offer_id bigint,
     family_id uuid,
     status varchar(20) NOT NULL DEFAULT 'pending',
     last_error text,
     updated_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (erp_type, external_seller_id, offer_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_erp_offer_links_product ON erp_offer_links (product_id)`,
  `CREATE TABLE IF NOT EXISTS erp_event_log (
     event_id text PRIMARY KEY,
     erp_type varchar(20) NOT NULL,
     event_type text NOT NULL,
     external_seller_id text,
     received_at timestamptz NOT NULL DEFAULT now(),
     processed_at timestamptz,
     attempts integer NOT NULL DEFAULT 0,
     error text
   )`,
  `CREATE TABLE IF NOT EXISTS erp_order_exports (
     order_id uuid NOT NULL,
     seller_id varchar(255) NOT NULL,
     erp_type varchar(20) NOT NULL,
     external_order_id text,
     status varchar(20) NOT NULL DEFAULT 'pending',
     exported_at timestamptz,
     cancel_sent_at timestamptz,
     attempts integer NOT NULL DEFAULT 0,
     last_error text,
     updated_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (order_id, seller_id, erp_type)
   )`,
  `CREATE TABLE IF NOT EXISTS erp_sync_state (
     key text PRIMARY KEY,
     value text,
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
]

async function ensureConnectorSchema(client) {
  for (const sql of STATEMENTS) await client.query(sql)
}

module.exports = { ensureConnectorSchema }
