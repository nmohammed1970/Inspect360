-- Quotation lifecycle: owner/customer decisions, share tokens, invoices, payments, WO auth, events.

-- Quote decision / send / convert audit columns
ALTER TABLE maintenance_quotes
  ADD COLUMN IF NOT EXISTS owner_decided_at TIMESTAMP;
ALTER TABLE maintenance_quotes
  ADD COLUMN IF NOT EXISTS owner_decided_by_user_id VARCHAR;
ALTER TABLE maintenance_quotes
  ADD COLUMN IF NOT EXISTS owner_decision VARCHAR;
ALTER TABLE maintenance_quotes
  ADD COLUMN IF NOT EXISTS owner_decision_reason TEXT;
ALTER TABLE maintenance_quotes
  ADD COLUMN IF NOT EXISTS customer_decided_at TIMESTAMP;
ALTER TABLE maintenance_quotes
  ADD COLUMN IF NOT EXISTS customer_decision VARCHAR;
ALTER TABLE maintenance_quotes
  ADD COLUMN IF NOT EXISTS customer_decision_reason TEXT;
ALTER TABLE maintenance_quotes
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP;
ALTER TABLE maintenance_quotes
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP;
ALTER TABLE maintenance_quotes
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

-- Rename legacy status values if any exist from early draft builder
UPDATE maintenance_quotes SET status = 'owner_approved' WHERE status = 'approved';
UPDATE maintenance_quotes SET status = 'accepted' WHERE status = 'customer_accepted';
UPDATE maintenance_quotes SET status = 'declined' WHERE status = 'customer_declined';

CREATE INDEX IF NOT EXISTS maintenance_quotes_org_status_idx
  ON maintenance_quotes (organization_id, status);

CREATE TABLE IF NOT EXISTS maintenance_quote_share_tokens (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  quote_id VARCHAR NOT NULL,
  organization_id VARCHAR NOT NULL,
  token_hash VARCHAR NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  viewed_at TIMESTAMP,
  created_by_user_id VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS maintenance_quote_share_tokens_quote_idx
  ON maintenance_quote_share_tokens (quote_id);
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_quote_share_tokens_hash_uidx
  ON maintenance_quote_share_tokens (token_hash);

-- Work order authorisation (OD-06)
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS authorisation_status VARCHAR NOT NULL DEFAULT 'not_required';
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS approved_quote_id VARCHAR;
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS authorised_total_minor INTEGER;

CREATE TABLE IF NOT EXISTS work_order_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  work_order_id VARCHAR NOT NULL,
  event_type VARCHAR NOT NULL,
  actor_user_id VARCHAR,
  payload_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS work_order_events_wo_idx
  ON work_order_events (work_order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS maintenance_invoices (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  work_order_id VARCHAR NOT NULL,
  quote_id VARCHAR,
  status VARCHAR NOT NULL DEFAULT 'draft',
  invoice_number INTEGER NOT NULL,
  invoice_reference VARCHAR NOT NULL,
  currency currency NOT NULL DEFAULT 'GBP',
  recipient_contact_id VARCHAR,
  recipient_name VARCHAR,
  recipient_email VARCHAR,
  recipient_phone VARCHAR,
  recipient_address TEXT,
  notes TEXT,
  due_at TIMESTAMP,
  subtotal_minor INTEGER NOT NULL DEFAULT 0,
  tax_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL DEFAULT 0,
  paid_minor INTEGER NOT NULL DEFAULT 0,
  payment_status VARCHAR NOT NULL DEFAULT 'unpaid',
  sent_at TIMESTAMP,
  voided_at TIMESTAMP,
  void_reason TEXT,
  prepared_by_user_id VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS maintenance_invoices_org_idx
  ON maintenance_invoices (organization_id);
CREATE INDEX IF NOT EXISTS maintenance_invoices_work_order_idx
  ON maintenance_invoices (work_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_invoices_org_number_uidx
  ON maintenance_invoices (organization_id, invoice_number);

CREATE TABLE IF NOT EXISTS maintenance_invoice_lines (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  invoice_id VARCHAR NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name VARCHAR NOT NULL DEFAULT '',
  description TEXT,
  category VARCHAR NOT NULL DEFAULT 'labour',
  unit VARCHAR NOT NULL DEFAULT 'hour',
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price_minor INTEGER NOT NULL DEFAULT 0,
  vat_rate VARCHAR NOT NULL DEFAULT 'standard_20',
  line_net_minor INTEGER NOT NULL DEFAULT 0,
  line_tax_minor INTEGER NOT NULL DEFAULT 0,
  line_total_minor INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS maintenance_invoice_lines_invoice_idx
  ON maintenance_invoice_lines (invoice_id);

CREATE TABLE IF NOT EXISTS maintenance_invoice_share_tokens (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  invoice_id VARCHAR NOT NULL,
  organization_id VARCHAR NOT NULL,
  token_hash VARCHAR NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  viewed_at TIMESTAMP,
  created_by_user_id VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_invoice_share_tokens_hash_uidx
  ON maintenance_invoice_share_tokens (token_hash);

CREATE TABLE IF NOT EXISTS maintenance_invoice_payments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  invoice_id VARCHAR NOT NULL,
  organization_id VARCHAR NOT NULL,
  amount_minor INTEGER NOT NULL,
  paid_at TIMESTAMP NOT NULL,
  method VARCHAR NOT NULL,
  reference VARCHAR,
  notes TEXT,
  recorded_by_user_id VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS maintenance_invoice_payments_invoice_idx
  ON maintenance_invoice_payments (invoice_id);

-- Contabo: after applying as creativecloud, grant app role:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_quote_share_tokens TO inspect360;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON work_order_events TO inspect360;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_invoices TO inspect360;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_invoice_lines TO inspect360;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_invoice_share_tokens TO inspect360;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_invoice_payments TO inspect360;
