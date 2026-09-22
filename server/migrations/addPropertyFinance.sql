-- Property finance: deposits, rent periods, expenses, rent reminders

ALTER TABLE tenant_assignments
  ADD COLUMN IF NOT EXISTS rent_due_day INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN
  CREATE TYPE property_deposit_status AS ENUM ('held', 'partially_returned', 'returned', 'deducted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE rent_period_status AS ENUM ('due', 'partial', 'collected', 'waived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE property_expense_category AS ENUM ('appliance', 'repair', 'furnishing', 'utilities', 'insurance', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS property_deposits (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL,
  property_id VARCHAR NOT NULL,
  tenant_assignment_id VARCHAR NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  received_date TIMESTAMP,
  payment_method VARCHAR(40),
  status property_deposit_status NOT NULL DEFAULT 'held',
  returned_amount NUMERIC(12, 2),
  deducted_amount NUMERIC(12, 2),
  deduction_reason TEXT,
  notes TEXT,
  receipt_url TEXT,
  created_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_deposits_org_property
  ON property_deposits (organization_id, property_id);
CREATE INDEX IF NOT EXISTS idx_property_deposits_assignment
  ON property_deposits (tenant_assignment_id);

CREATE TABLE IF NOT EXISTS rent_periods (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL,
  property_id VARCHAR NOT NULL,
  tenant_assignment_id VARCHAR NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  due_date TIMESTAMP NOT NULL,
  amount_due NUMERIC(12, 2) NOT NULL,
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  status rent_period_status NOT NULL DEFAULT 'due',
  collected_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rent_periods_org_property
  ON rent_periods (organization_id, property_id);
CREATE INDEX IF NOT EXISTS idx_rent_periods_assignment
  ON rent_periods (tenant_assignment_id);
CREATE INDEX IF NOT EXISTS idx_rent_periods_due
  ON rent_periods (due_date, status);
CREATE UNIQUE INDEX IF NOT EXISTS rent_periods_assignment_start_uidx
  ON rent_periods (tenant_assignment_id, period_start);

CREATE TABLE IF NOT EXISTS property_expenses (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL,
  property_id VARCHAR NOT NULL,
  description TEXT NOT NULL,
  category property_expense_category NOT NULL DEFAULT 'other',
  expense_date TIMESTAMP NOT NULL,
  supplier VARCHAR(255),
  supplier_contact VARCHAR(255),
  amount NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  warranty_expiry TIMESTAMP,
  warranty_notes TEXT,
  receipt_url TEXT,
  asset_inventory_id VARCHAR,
  notes TEXT,
  created_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_expenses_org_property
  ON property_expenses (organization_id, property_id);

CREATE TABLE IF NOT EXISTS organization_rent_settings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  days_before_due_1 INTEGER NOT NULL DEFAULT 10,
  days_before_due_2 INTEGER NOT NULL DEFAULT 5,
  days_before_due_3 INTEGER NOT NULL DEFAULT 2,
  reminder1_subject TEXT,
  reminder1_body TEXT,
  reminder2_subject TEXT,
  reminder2_body TEXT,
  reminder3_subject TEXT,
  reminder3_body TEXT,
  overdue_subject TEXT,
  overdue_body TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rent_reminder_log (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL,
  rent_period_id VARCHAR NOT NULL,
  reminder_type VARCHAR(40) NOT NULL,
  scheduled_for_date VARCHAR(40) NOT NULL,
  trigger VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  recipient_email VARCHAR,
  last_error TEXT,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS rent_reminder_log_claim_uidx
  ON rent_reminder_log (rent_period_id, reminder_type, scheduled_for_date, trigger);
CREATE INDEX IF NOT EXISTS idx_rent_reminder_log_org
  ON rent_reminder_log (organization_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON property_deposits TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON rent_periods TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON property_expenses TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON organization_rent_settings TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON rent_reminder_log TO inspect360;
