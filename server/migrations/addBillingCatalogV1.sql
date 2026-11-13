-- Nov 2026 self-serve billing catalog + subscriptions (Phase A–F foundation)

CREATE TABLE IF NOT EXISTS billing_price_versions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  label VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  published_at TIMESTAMP,
  published_by VARCHAR,
  checksum VARCHAR(128),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR
);
CREATE INDEX IF NOT EXISTS idx_billing_price_versions_status ON billing_price_versions(status);

CREATE TABLE IF NOT EXISTS billing_plans (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code VARCHAR(64) NOT NULL UNIQUE,
  tab VARCHAR(32) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  popular BOOLEAN NOT NULL DEFAULT FALSE,
  enquire_only BOOLEAN NOT NULL DEFAULT FALSE,
  max_properties INTEGER,
  max_users INTEGER,
  monthly_inspections INTEGER,
  yearly_inspections INTEGER,
  sms_per_year INTEGER DEFAULT 0,
  allows_property_packs BOOLEAN NOT NULL DEFAULT FALSE,
  allows_extra_users BOOLEAN NOT NULL DEFAULT FALSE,
  modules_json JSONB DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_plans_tab ON billing_plans(tab);

CREATE TABLE IF NOT EXISTS billing_plan_prices (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  version_id VARCHAR NOT NULL REFERENCES billing_price_versions(id),
  plan_code VARCHAR(64) NOT NULL,
  cycle VARCHAR(16) NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  stripe_lookup_key VARCHAR(128),
  payg_unit_minor INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_billing_plan_prices_ver_plan_cycle
  ON billing_plan_prices(version_id, plan_code, cycle);
CREATE INDEX IF NOT EXISTS idx_billing_plan_prices_version ON billing_plan_prices(version_id);

CREATE TABLE IF NOT EXISTS billing_addons (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  kind VARCHAR(32) NOT NULL,
  monthly_amount_minor INTEGER,
  yearly_amount_minor INTEGER,
  currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  stripe_lookup_key_month VARCHAR(128),
  stripe_lookup_key_year VARCHAR(128),
  max_quantity INTEGER,
  properties_per_pack INTEGER,
  inspections_per_month INTEGER,
  inspections_per_year INTEGER,
  available_on_plans_json JSONB DEFAULT '[]'::jsonb,
  included_free_on_plans_json JSONB DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_topup_packs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code VARCHAR(64) NOT NULL UNIQUE,
  kind VARCHAR(32) NOT NULL,
  name VARCHAR(128) NOT NULL,
  quantity INTEGER NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  expiry_months INTEGER NOT NULL DEFAULT 12,
  stripe_lookup_key VARCHAR(128),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_price_version_items (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  version_id VARCHAR NOT NULL REFERENCES billing_price_versions(id),
  item_type VARCHAR(32) NOT NULL,
  item_code VARCHAR(64) NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_price_version_items_ver ON billing_price_version_items(version_id);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL UNIQUE,
  plan_code VARCHAR(64) NOT NULL,
  cycle VARCHAR(16) NOT NULL DEFAULT 'yearly',
  price_version_id VARCHAR REFERENCES billing_price_versions(id),
  status VARCHAR(32) NOT NULL DEFAULT 'trialing',
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  trial_end TIMESTAMP,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  property_packs INTEGER NOT NULL DEFAULT 0,
  extra_users INTEGER NOT NULL DEFAULT 0,
  hmo_addon BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_customer_id VARCHAR,
  stripe_subscription_id VARCHAR,
  first_payment_failure_at TIMESTAMP,
  scheduled_plan_code VARCHAR(64),
  scheduled_cycle VARCHAR(16),
  amount_minor_frozen INTEGER,
  currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_status ON billing_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_stripe ON billing_subscriptions(stripe_subscription_id);

CREATE TABLE IF NOT EXISTS billing_org_settings (
  organization_id VARCHAR PRIMARY KEY,
  auto_topup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_topup_pack_code VARCHAR(64),
  auto_topup_count_this_month INTEGER NOT NULL DEFAULT 0,
  auto_topup_month_key VARCHAR(7),
  money_back_eligible_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(128) NOT NULL,
  payload_json JSONB,
  processed_at TIMESTAMP,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_type ON billing_webhook_events(event_type);

CREATE TABLE IF NOT EXISTS billing_audit_log (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  actor_type VARCHAR(32) NOT NULL,
  actor_id VARCHAR,
  organization_id VARCHAR,
  action VARCHAR(128) NOT NULL,
  entity_type VARCHAR(64),
  entity_id VARCHAR,
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_audit_org ON billing_audit_log(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_billing_audit_action ON billing_audit_log(action);

CREATE TABLE IF NOT EXISTS billing_analytics_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR,
  user_id VARCHAR,
  event_name VARCHAR(64) NOT NULL,
  metadata_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_analytics_name ON billing_analytics_events(event_name, created_at);

CREATE TABLE IF NOT EXISTS billing_platform_config (
  key VARCHAR(80) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO billing_platform_config (key, value) VALUES
  ('self_serve_enabled', 'true'),
  ('trial_days', '14'),
  ('trial_inspection_credits', '10'),
  ('trial_sms_credits', '20'),
  ('photos_per_credit', '500'),
  ('inspection_price_floor_minor', '295'),
  ('property_pack_ceiling', '15'),
  ('max_properties_with_packs', '250'),
  ('payment_failure_readonly_days', '7'),
  ('money_back_days', '30'),
  ('money_back_enabled', 'true'),
  ('auto_topup_max_per_month', '3'),
  ('enquire_calendly_url', 'https://calendly.com/-nadeemmohammed-/inspect360-demo'),
  ('low_balance_percent', '20'),
  ('low_balance_absolute', '5')
ON CONFLICT (key) DO NOTHING;

-- Extend credit_batches with credit kind (inspection | sms); existing rows = inspection
ALTER TABLE credit_batches ADD COLUMN IF NOT EXISTS credit_kind VARCHAR(32) NOT NULL DEFAULT 'inspection';
CREATE INDEX IF NOT EXISTS idx_credit_batches_org_kind_expires
  ON credit_batches(organization_id, credit_kind, expires_at);

ALTER TABLE topup_orders ADD COLUMN IF NOT EXISTS pack_code VARCHAR(64);
ALTER TABLE topup_orders ADD COLUMN IF NOT EXISTS credit_kind VARCHAR(32) DEFAULT 'inspection';
ALTER TABLE topup_orders ADD COLUMN IF NOT EXISTS auto_purchase BOOLEAN DEFAULT FALSE;

-- App role grants (Contabo: run as creativecloud; local may use postgres)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inspect360') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON billing_price_versions TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON billing_plans TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON billing_plan_prices TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON billing_addons TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON billing_topup_packs TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON billing_price_version_items TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON billing_subscriptions TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON billing_org_settings TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON billing_webhook_events TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON billing_audit_log TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON billing_analytics_events TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON billing_platform_config TO inspect360;
  END IF;
END $$;
