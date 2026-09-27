-- Existing rows keep trial_enforced = false. Do not backfill trial dates.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS trial_enforced BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS trial_start_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_organizations_trial_end
  ON organizations (trial_end_at);

CREATE TABLE IF NOT EXISTS entitlement_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  actor_user_id VARCHAR,
  previous_trial_end TIMESTAMP,
  new_trial_end TIMESTAMP,
  additional_days INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entitlement_events_org
  ON entitlement_events (organization_id, created_at);
