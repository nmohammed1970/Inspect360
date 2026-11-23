-- Maintenance price book catalog (org-scoped quotation line templates).

CREATE TABLE IF NOT EXISTS maintenance_price_book_items (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  sku VARCHAR,
  description TEXT,
  unit VARCHAR NOT NULL DEFAULT 'hour',
  default_unit_price_minor INTEGER NOT NULL,
  currency currency NOT NULL DEFAULT 'GBP',
  vat_rate VARCHAR NOT NULL DEFAULT 'standard_20',
  category VARCHAR NOT NULL DEFAULT 'labour',
  cost_rate_minor INTEGER,
  environment_tags TEXT[] DEFAULT '{}',
  productivity_rate NUMERIC,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS maintenance_price_book_items_org_idx
  ON maintenance_price_book_items (organization_id);

CREATE INDEX IF NOT EXISTS maintenance_price_book_items_org_active_idx
  ON maintenance_price_book_items (organization_id, active);

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_price_book_items_org_sku_uidx
  ON maintenance_price_book_items (organization_id, sku)
  WHERE sku IS NOT NULL AND length(trim(sku)) > 0;

-- Contabo: after applying as creativecloud, grant app role:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_price_book_items TO inspect360;
