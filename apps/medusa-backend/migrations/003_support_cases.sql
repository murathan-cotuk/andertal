CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SEQUENCE IF NOT EXISTS support_case_number_seq START 100001;

CREATE TABLE IF NOT EXISTS support_cases (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_number varchar(32) NOT NULL UNIQUE DEFAULT
    ('SUP-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('support_case_number_seq')::text, 6, '0')),
  customer_id uuid REFERENCES store_customers(id) ON DELETE SET NULL,
  customer_email varchar(254) NOT NULL,
  order_id uuid REFERENCES store_orders(id) ON DELETE SET NULL,
  seller_id varchar(255),
  parent_case_id uuid REFERENCES support_cases(id) ON DELETE SET NULL,
  category varchar(50) NOT NULL CHECK (char_length(category) BETWEEN 1 AND 50),
  subcategory varchar(80) NOT NULL CHECK (char_length(subcategory) BETWEEN 1 AND 80),
  title varchar(200) NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  status varchar(32) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','awaiting_seller','awaiting_customer','awaiting_support','resolved','closed','reopened')),
  priority varchar(16) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  locale varchar(8) NOT NULL DEFAULT 'de',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  reopened_at timestamptz,
  customer_hidden_at timestamptz,
  auto_archive_at timestamptz,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  legal_hold boolean NOT NULL DEFAULT false,
  resolution_note text,
  CHECK (seller_id IS NULL OR char_length(trim(seller_id)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_support_cases_customer ON support_cases (customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_cases_customer_email ON support_cases (lower(customer_email), updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_cases_seller ON support_cases (seller_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_cases_parent ON support_cases (parent_case_id);
CREATE INDEX IF NOT EXISTS idx_support_cases_order ON support_cases (order_id);
CREATE INDEX IF NOT EXISTS idx_support_cases_archive ON support_cases (auto_archive_at)
  WHERE customer_hidden_at IS NULL AND status IN ('closed','resolved');

CREATE TABLE IF NOT EXISTS support_case_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id uuid NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES store_order_items(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES store_orders(id) ON DELETE RESTRICT,
  seller_id varchar(255),
  product_id_snapshot text,
  variant_id_snapshot text,
  title_snapshot varchar(500) NOT NULL,
  image_snapshot text,
  quantity_snapshot integer NOT NULL CHECK (quantity_snapshot > 0),
  unit_price_cents_snapshot integer NOT NULL CHECK (unit_price_cents_snapshot >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, order_item_id)
);
CREATE INDEX IF NOT EXISTS idx_support_case_items_case ON support_case_items (case_id);
CREATE INDEX IF NOT EXISTS idx_support_case_items_order_item ON support_case_items (order_item_id);

CREATE TABLE IF NOT EXISTS support_attachment_uploads (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_role varchar(16) NOT NULL CHECK (owner_role IN ('customer','seller','support')),
  owner_id text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  public_url text NOT NULL,
  mime_type varchar(80) NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
  byte_size integer NOT NULL CHECK (byte_size > 0),
  original_name varchar(255),
  sha256 char(64) NOT NULL,
  case_id uuid REFERENCES support_cases(id) ON DELETE SET NULL,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_attachment_owner ON support_attachment_uploads (owner_role, owner_id, expires_at);

CREATE TABLE IF NOT EXISTS support_case_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id uuid NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  sender_role varchar(16) NOT NULL CHECK (sender_role IN ('customer','seller','support','system','legacy')),
  sender_id text,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attachments) = 'array'),
  read_by_customer_at timestamptz,
  read_by_seller_at timestamptz,
  read_by_support_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_case_messages_case ON support_case_messages (case_id, created_at);

CREATE TABLE IF NOT EXISTS support_case_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id uuid NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  event_type varchar(64) NOT NULL,
  actor_role varchar(16) NOT NULL CHECK (actor_role IN ('customer','seller','support','system')),
  actor_id text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  dedupe_key varchar(255),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_support_case_events_case ON support_case_events (case_id, created_at);

CREATE OR REPLACE FUNCTION reject_support_case_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'support_case_events is immutable';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'support_case_events_immutable') THEN
    CREATE TRIGGER support_case_events_immutable
      BEFORE UPDATE OR DELETE ON support_case_events
      FOR EACH ROW EXECUTE FUNCTION reject_support_case_event_mutation();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS support_case_idempotency (
  customer_key text NOT NULL,
  idempotency_key varchar(200) NOT NULL,
  request_hash char(64) NOT NULL,
  response_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_key, idempotency_key)
);

CREATE TABLE IF NOT EXISTS support_notification_dedupe (
  dedupe_key varchar(255) PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  channel varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE support_cases IS 'SUPPORT_RETENTION_DAYS is reserved for a future explicit, legal-hold-aware purge command. No automatic hard deletion is implemented.';
