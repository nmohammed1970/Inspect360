-- Reapit Foundations integration (Contabo: run as creativecloud, then GRANT inspect360)

DO $$ BEGIN
  ALTER TYPE contact_type ADD VALUE IF NOT EXISTS 'landlord';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS landlord_contact_id VARCHAR;

CREATE TABLE IF NOT EXISTS reapit_connections (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL UNIQUE,
  reapit_customer_id VARCHAR,
  status VARCHAR NOT NULL DEFAULT 'disconnected',
  encrypted_tokens TEXT,
  last_error TEXT,
  connected_at TIMESTAMP,
  disconnected_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reapit_connections_customer_id_idx
  ON reapit_connections (reapit_customer_id);

CREATE TABLE IF NOT EXISTS reapit_entity_mappings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL,
  entity_type VARCHAR NOT NULL,
  reapit_id VARCHAR NOT NULL,
  inspect360_table VARCHAR NOT NULL,
  inspect360_id VARCHAR NOT NULL,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS reapit_entity_mappings_reapit_uidx
  ON reapit_entity_mappings (organization_id, entity_type, reapit_id);

CREATE UNIQUE INDEX IF NOT EXISTS reapit_entity_mappings_local_uidx
  ON reapit_entity_mappings (organization_id, inspect360_table, inspect360_id, entity_type);

CREATE INDEX IF NOT EXISTS reapit_entity_mappings_org_idx
  ON reapit_entity_mappings (organization_id);

CREATE TABLE IF NOT EXISTS reapit_sync_runs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL,
  type VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'queued',
  counters_json JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reapit_sync_runs_org_idx
  ON reapit_sync_runs (organization_id);

CREATE TABLE IF NOT EXISTS reapit_webhook_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR,
  event_id VARCHAR NOT NULL UNIQUE,
  topic_id VARCHAR NOT NULL,
  reapit_entity_id VARCHAR,
  reapit_customer_id VARCHAR,
  status VARCHAR NOT NULL DEFAULT 'pending',
  payload_json JSONB,
  error_message TEXT,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reapit_webhook_events_org_idx
  ON reapit_webhook_events (organization_id);

CREATE INDEX IF NOT EXISTS reapit_webhook_events_status_idx
  ON reapit_webhook_events (status);

CREATE TABLE IF NOT EXISTS reapit_jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR,
  kind VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'queued',
  run_after TIMESTAMP DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  payload_json JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  locked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reapit_jobs_status_run_after_idx
  ON reapit_jobs (status, run_after);

GRANT SELECT, INSERT, UPDATE, DELETE ON reapit_connections TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON reapit_entity_mappings TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON reapit_sync_runs TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON reapit_webhook_events TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON reapit_jobs TO inspect360;
