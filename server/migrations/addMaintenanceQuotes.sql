-- Maintenance quotations (org → customer AR drafts on existing work orders).

CREATE TABLE IF NOT EXISTS maintenance_document_sequences (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  document_type VARCHAR NOT NULL,
  year INTEGER NOT NULL,
  next_value INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_document_sequences_org_type_year_uidx
  ON maintenance_document_sequences (organization_id, document_type, year);

CREATE TABLE IF NOT EXISTS maintenance_quotes (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  work_order_id VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'draft',
  quote_number INTEGER NOT NULL,
  quote_reference VARCHAR NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  quote_type VARCHAR NOT NULL DEFAULT 'original',
  currency currency NOT NULL DEFAULT 'GBP',
  recipient_contact_id VARCHAR,
  recipient_name VARCHAR,
  recipient_email VARCHAR,
  recipient_phone VARCHAR,
  recipient_address TEXT,
  scope_description TEXT,
  engineer_notes TEXT,
  valid_until TIMESTAMP,
  subtotal_minor INTEGER NOT NULL DEFAULT 0,
  tax_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL DEFAULT 0,
  prepared_by_user_id VARCHAR NOT NULL,
  submitted_at TIMESTAMP,
  submitted_by_user_id VARCHAR,
  parent_quote_id VARCHAR,
  superseded_by_quote_id VARCHAR,
  variation_of_quote_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS maintenance_quotes_org_idx
  ON maintenance_quotes (organization_id);

CREATE INDEX IF NOT EXISTS maintenance_quotes_work_order_idx
  ON maintenance_quotes (work_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_quotes_org_number_version_uidx
  ON maintenance_quotes (organization_id, quote_number, version_number);

CREATE TABLE IF NOT EXISTS maintenance_quote_lines (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  quote_id VARCHAR NOT NULL,
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
  price_book_item_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS maintenance_quote_lines_quote_idx
  ON maintenance_quote_lines (quote_id);

-- Contabo: after applying as creativecloud, grant app role:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_document_sequences TO inspect360;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_quotes TO inspect360;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_quote_lines TO inspect360;
