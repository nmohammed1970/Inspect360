-- Rent Management Phase 1 — operational subledger
-- Contabo: run as creativecloud against inspect360_dev / inspect360, then GRANT to inspect360.
-- Local: skip GRANT statements if role inspect360 does not exist.

CREATE TABLE IF NOT EXISTS rent_accounts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  tenancy_id VARCHAR NOT NULL,
  property_id VARCHAR NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  jurisdiction VARCHAR(32) NOT NULL DEFAULT 'england',
  tenancy_type VARCHAR(40) NOT NULL DEFAULT 'assured_shorthold',
  collection_account_id VARCHAR,
  payer_reference VARCHAR(120),
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/London',
  month_end_rule VARCHAR(32) NOT NULL DEFAULT 'clamp_to_last_day',
  unapplied_credit_minor INTEGER NOT NULL DEFAULT 0,
  migrated_from_legacy BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS rent_accounts_tenancy_uidx ON rent_accounts (tenancy_id);
CREATE INDEX IF NOT EXISTS rent_accounts_org_idx ON rent_accounts (organization_id);
CREATE INDEX IF NOT EXISTS rent_accounts_org_property_idx ON rent_accounts (organization_id, property_id);
CREATE INDEX IF NOT EXISTS rent_accounts_org_status_idx ON rent_accounts (organization_id, status);

CREATE TABLE IF NOT EXISTS rent_schedule_versions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  account_id VARCHAR NOT NULL,
  amount_minor INTEGER NOT NULL,
  frequency VARCHAR(24) NOT NULL DEFAULT 'monthly',
  due_day INTEGER NOT NULL DEFAULT 1,
  due_rule VARCHAR(64) NOT NULL DEFAULT 'day_of_month',
  effective_from TIMESTAMP NOT NULL,
  effective_to TIMESTAMP,
  proration_rule VARCHAR(32) NOT NULL DEFAULT 'actual_days',
  approved_by VARCHAR,
  approved_at TIMESTAMP,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  evidence_id VARCHAR,
  idempotency_key VARCHAR(120),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rent_schedule_versions_account_idx ON rent_schedule_versions (account_id);
CREATE INDEX IF NOT EXISTS rent_schedule_versions_org_idx ON rent_schedule_versions (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS rent_schedule_versions_idem_uidx
  ON rent_schedule_versions (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS rent_charges (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  account_id VARCHAR NOT NULL,
  schedule_version_id VARCHAR,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  due_date TIMESTAMP NOT NULL,
  amount_minor INTEGER NOT NULL,
  allocated_minor INTEGER NOT NULL DEFAULT 0,
  type VARCHAR(32) NOT NULL DEFAULT 'rent',
  status VARCHAR(24) NOT NULL DEFAULT 'scheduled',
  linked_reversal_id VARCHAR,
  legacy_period_id VARCHAR,
  posted_at TIMESTAMP,
  effective_date TIMESTAMP,
  currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  idempotency_key VARCHAR(160),
  created_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rent_charges_account_due_idx ON rent_charges (account_id, due_date);
CREATE INDEX IF NOT EXISTS rent_charges_org_status_idx ON rent_charges (organization_id, status);
CREATE INDEX IF NOT EXISTS rent_charges_org_due_idx ON rent_charges (organization_id, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS rent_charges_period_uidx
  ON rent_charges (account_id, schedule_version_id, period_start, type)
  WHERE schedule_version_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS rent_charges_idem_uidx
  ON rent_charges (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS rent_charges_legacy_uidx
  ON rent_charges (legacy_period_id) WHERE legacy_period_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rent_receipts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  account_id VARCHAR,
  amount_minor INTEGER NOT NULL,
  allocated_minor INTEGER NOT NULL DEFAULT 0,
  channel VARCHAR(32) NOT NULL DEFAULT 'manual',
  reference VARCHAR(160),
  received_at TIMESTAMP NOT NULL,
  confirmed_at TIMESTAMP,
  external_id VARCHAR(160),
  source VARCHAR(80),
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  allocation_state VARCHAR(24) NOT NULL DEFAULT 'unallocated',
  bank_account_id VARCHAR,
  bank_transaction_id VARCHAR,
  currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  idempotency_key VARCHAR(160),
  notes TEXT,
  created_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rent_receipts_org_status_idx ON rent_receipts (organization_id, status);
CREATE INDEX IF NOT EXISTS rent_receipts_account_idx ON rent_receipts (account_id);
CREATE UNIQUE INDEX IF NOT EXISTS rent_receipts_idem_uidx
  ON rent_receipts (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS rent_receipts_external_uidx
  ON rent_receipts (organization_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rent_allocations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  receipt_id VARCHAR NOT NULL,
  charge_id VARCHAR NOT NULL,
  amount_minor INTEGER NOT NULL,
  effective_at TIMESTAMP NOT NULL,
  reversal_of VARCHAR,
  is_reversed BOOLEAN NOT NULL DEFAULT false,
  created_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rent_allocations_receipt_idx ON rent_allocations (receipt_id);
CREATE INDEX IF NOT EXISTS rent_allocations_charge_idx ON rent_allocations (charge_id);
CREATE INDEX IF NOT EXISTS rent_allocations_org_idx ON rent_allocations (organization_id);

CREATE TABLE IF NOT EXISTS rent_adjustments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  account_id VARCHAR NOT NULL,
  charge_id VARCHAR,
  receipt_id VARCHAR,
  type VARCHAR(32) NOT NULL,
  amount_minor INTEGER NOT NULL,
  reason TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  approved_by VARCHAR,
  approved_at TIMESTAMP,
  posted_at TIMESTAMP,
  reversal_of VARCHAR,
  created_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rent_adjustments_account_idx ON rent_adjustments (account_id);
CREATE INDEX IF NOT EXISTS rent_adjustments_org_status_idx ON rent_adjustments (organization_id, status);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  bank_account_label VARCHAR(120),
  value_date TIMESTAMP NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  direction VARCHAR(16) NOT NULL DEFAULT 'in',
  reference VARCHAR(255),
  counterparty VARCHAR(255),
  source_id VARCHAR(160),
  fingerprint VARCHAR(160),
  raw_json JSONB,
  match_state VARCHAR(24) NOT NULL DEFAULT 'unmatched',
  suggested_account_id VARCHAR,
  receipt_id VARCHAR,
  import_batch_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bank_transactions_org_match_idx ON bank_transactions (organization_id, match_state);
CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_source_uidx
  ON bank_transactions (organization_id, source_id) WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_fp_uidx
  ON bank_transactions (organization_id, fingerprint) WHERE fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  bank_account_label VARCHAR(120),
  opened_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP,
  opening_balance_minor INTEGER DEFAULT 0,
  closing_balance_minor INTEGER,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  reviewer_id VARCHAR,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reconciliation_runs_org_idx ON reconciliation_runs (organization_id);

CREATE TABLE IF NOT EXISTS reconciliation_links (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  run_id VARCHAR NOT NULL,
  bank_transaction_id VARCHAR NOT NULL,
  receipt_id VARCHAR,
  reviewer_id VARCHAR,
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reconciliation_links_run_idx ON reconciliation_links (run_id);
CREATE INDEX IF NOT EXISTS reconciliation_links_org_idx ON reconciliation_links (organization_id);

CREATE TABLE IF NOT EXISTS arrears_cases (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  account_id VARCHAR NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'review_required',
  overdue_minor INTEGER NOT NULL DEFAULT 0,
  oldest_due_date TIMESTAMP,
  assigned_to VARCHAR,
  next_action_at TIMESTAMP,
  last_contact_at TIMESTAMP,
  hold_reason TEXT,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS arrears_cases_org_status_idx ON arrears_cases (organization_id, status);
CREATE INDEX IF NOT EXISTS arrears_cases_account_idx ON arrears_cases (account_id);
CREATE UNIQUE INDEX IF NOT EXISTS arrears_cases_one_open_uidx
  ON arrears_cases (account_id)
  WHERE status NOT IN ('resolved');

CREATE TABLE IF NOT EXISTS arrears_case_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  case_id VARCHAR NOT NULL,
  event_type VARCHAR(48) NOT NULL,
  note TEXT,
  actor_user_id VARCHAR,
  metadata_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS arrears_case_events_case_idx ON arrears_case_events (case_id);
CREATE INDEX IF NOT EXISTS arrears_case_events_org_idx ON arrears_case_events (organization_id);

CREATE TABLE IF NOT EXISTS payment_plans (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  account_id VARCHAR NOT NULL,
  case_id VARCHAR,
  original_arrears_minor INTEGER NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  notes TEXT,
  approved_by VARCHAR,
  approved_at TIMESTAMP,
  created_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payment_plans_account_idx ON payment_plans (account_id);
CREATE INDEX IF NOT EXISTS payment_plans_org_idx ON payment_plans (organization_id);

CREATE TABLE IF NOT EXISTS plan_instalments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  plan_id VARCHAR NOT NULL,
  due_date TIMESTAMP NOT NULL,
  amount_minor INTEGER NOT NULL,
  paid_minor INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'due',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS plan_instalments_plan_idx ON plan_instalments (plan_id);

CREATE TABLE IF NOT EXISTS rent_notification_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  account_id VARCHAR,
  case_id VARCHAR,
  channel VARCHAR(32) NOT NULL DEFAULT 'email',
  template_key VARCHAR(64),
  status VARCHAR(24) NOT NULL DEFAULT 'queued',
  scheduled_for TIMESTAMP,
  sent_at TIMESTAMP,
  dedupe_key VARCHAR(160),
  payload_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS rent_notification_events_dedupe_uidx
  ON rent_notification_events (organization_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS rent_notification_events_org_idx ON rent_notification_events (organization_id);

CREATE TABLE IF NOT EXISTS rent_reviews (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  account_id VARCHAR NOT NULL,
  current_amount_minor INTEGER NOT NULL,
  proposed_amount_minor INTEGER,
  status VARCHAR(32) NOT NULL DEFAULT 'eligibility_check',
  eligibility_notes TEXT,
  proposed_effective_date TIMESTAMP,
  notice_served_at TIMESTAMP,
  notice_evidence_id VARCHAR,
  challenge_status VARCHAR(48),
  approved_by VARCHAR,
  approved_at TIMESTAMP,
  effective_at TIMESTAMP,
  schedule_version_id VARCHAR,
  created_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rent_reviews_org_status_idx ON rent_reviews (organization_id, status);
CREATE INDEX IF NOT EXISTS rent_reviews_account_idx ON rent_reviews (account_id);

CREATE TABLE IF NOT EXISTS statement_snapshots (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  account_id VARCHAR NOT NULL,
  from_date TIMESTAMP NOT NULL,
  to_date TIMESTAMP NOT NULL,
  as_of TIMESTAMP NOT NULL,
  opening_balance_minor INTEGER NOT NULL DEFAULT 0,
  closing_balance_minor INTEGER NOT NULL DEFAULT 0,
  unapplied_credit_minor INTEGER NOT NULL DEFAULT 0,
  payload_json JSONB NOT NULL,
  delivered_at TIMESTAMP,
  delivery_channel VARCHAR(32),
  created_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS statement_snapshots_account_idx ON statement_snapshots (account_id);
CREATE INDEX IF NOT EXISTS statement_snapshots_org_idx ON statement_snapshots (organization_id);

CREATE TABLE IF NOT EXISTS financial_audit_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  entity_type VARCHAR(48) NOT NULL,
  entity_id VARCHAR NOT NULL,
  action VARCHAR(64) NOT NULL,
  actor_user_id VARCHAR,
  before_json JSONB,
  after_json JSONB,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS financial_audit_events_org_idx ON financial_audit_events (organization_id);
CREATE INDEX IF NOT EXISTS financial_audit_events_entity_idx ON financial_audit_events (entity_type, entity_id);

-- App DB user grants (Contabo). Skip locally if role missing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inspect360') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON rent_accounts TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON rent_schedule_versions TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON rent_charges TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON rent_receipts TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON rent_allocations TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON rent_adjustments TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON bank_transactions TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON reconciliation_runs TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON reconciliation_links TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON arrears_cases TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON arrears_case_events TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON payment_plans TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON plan_instalments TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON rent_notification_events TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON rent_reviews TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON statement_snapshots TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON financial_audit_events TO inspect360;
  END IF;
END $$;
