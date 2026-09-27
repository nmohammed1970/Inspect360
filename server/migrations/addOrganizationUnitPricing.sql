-- Per-organization unit pricing (eco-admin).
-- Run as creativecloud on inspect360_dev / inspect360.

CREATE TABLE IF NOT EXISTS organization_unit_pricing (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  price_per_unit_monthly NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price_per_unit_annual NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'GBP',
  features_included TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_unit_pricing_org
  ON organization_unit_pricing (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON organization_unit_pricing TO inspect360;
