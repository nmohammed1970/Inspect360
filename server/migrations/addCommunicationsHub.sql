-- Communications Hub foundation
-- Contabo: run as creativecloud against inspect360_dev / inspect360, then GRANT to inspect360.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS communications_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS communications_emergency_guidance TEXT;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS communications_default_landing BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS communication_categories (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  key VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL,
  default_priority VARCHAR(16) NOT NULL DEFAULT 'medium',
  default_team_id VARCHAR,
  approval_policy VARCHAR(32) NOT NULL DEFAULT 'none',
  first_response_hours INTEGER NOT NULL DEFAULT 4,
  resolution_hours INTEGER NOT NULL DEFAULT 48,
  notify_on_assign BOOLEAN NOT NULL DEFAULT true,
  escalate_overdue BOOLEAN NOT NULL DEFAULT true,
  sla_json JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS communication_categories_org_key_uidx
  ON communication_categories (organization_id, key);
CREATE INDEX IF NOT EXISTS communication_categories_org_idx
  ON communication_categories (organization_id);

CREATE TABLE IF NOT EXISTS communication_cases (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  reference VARCHAR(32) NOT NULL,
  subject VARCHAR(300) NOT NULL,
  category_id VARCHAR NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'new',
  priority VARCHAR(16) NOT NULL DEFAULT 'medium',
  source VARCHAR(32) NOT NULL DEFAULT 'tenant_portal',
  tenant_id VARCHAR,
  tenancy_id VARCHAR,
  property_id VARCHAR,
  block_id VARCHAR,
  unit_label VARCHAR(120),
  owner_user_id VARCHAR,
  owner_team_id VARCHAR,
  summary TEXT,
  next_action_at TIMESTAMP,
  first_response_due_at TIMESTAMP,
  resolution_due_at TIMESTAMP,
  first_response_at TIMESTAMP,
  resolved_at TIMESTAMP,
  closed_at TIMESTAMP,
  resolution_summary TEXT,
  reopen_reason TEXT,
  policy_snapshot_json JSONB,
  ai_suggestion_json JSONB,
  unread_for_staff BOOLEAN NOT NULL DEFAULT true,
  unread_for_tenant BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  created_by_user_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS communication_cases_org_reference_uidx
  ON communication_cases (organization_id, reference);
CREATE INDEX IF NOT EXISTS communication_cases_org_status_idx
  ON communication_cases (organization_id, status);
CREATE INDEX IF NOT EXISTS communication_cases_org_owner_idx
  ON communication_cases (organization_id, owner_user_id);
CREATE INDEX IF NOT EXISTS communication_cases_org_team_idx
  ON communication_cases (organization_id, owner_team_id);
CREATE INDEX IF NOT EXISTS communication_cases_org_property_idx
  ON communication_cases (organization_id, property_id);
CREATE INDEX IF NOT EXISTS communication_cases_org_tenant_idx
  ON communication_cases (organization_id, tenant_id);
CREATE INDEX IF NOT EXISTS communication_cases_org_updated_idx
  ON communication_cases (organization_id, updated_at);
CREATE INDEX IF NOT EXISTS communication_cases_org_priority_idx
  ON communication_cases (organization_id, priority);

CREATE TABLE IF NOT EXISTS communication_messages (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  case_id VARCHAR NOT NULL,
  direction VARCHAR(16) NOT NULL DEFAULT 'inbound',
  visibility VARCHAR(16) NOT NULL DEFAULT 'tenant',
  channel VARCHAR(32) NOT NULL DEFAULT 'tenant_portal',
  body TEXT NOT NULL,
  author_user_id VARCHAR,
  author_name_snapshot TEXT,
  delivery_status VARCHAR(32) NOT NULL DEFAULT 'not_applicable',
  provider_message_id VARCHAR(255),
  provider_thread_id VARCHAR(255),
  attachments_json JSONB,
  received_at TIMESTAMP,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS communication_messages_case_idx
  ON communication_messages (case_id, created_at);
CREATE INDEX IF NOT EXISTS communication_messages_org_idx
  ON communication_messages (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS communication_messages_provider_uidx
  ON communication_messages (organization_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS communication_actions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  case_id VARCHAR NOT NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  assignee_id VARCHAR,
  due_at TIMESTAMP,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  required BOOLEAN NOT NULL DEFAULT false,
  completed_by VARCHAR,
  completed_at TIMESTAMP,
  evidence_ref TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS communication_actions_case_idx ON communication_actions (case_id);
CREATE INDEX IF NOT EXISTS communication_actions_org_idx ON communication_actions (organization_id);

CREATE TABLE IF NOT EXISTS communication_approvals (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  case_id VARCHAR NOT NULL,
  type VARCHAR(64) NOT NULL DEFAULT 'manager_decision',
  requested_by VARCHAR NOT NULL,
  eligible_team_id VARCHAR,
  eligible_user_id VARCHAR,
  decision VARCHAR(32),
  reason TEXT,
  terms_json JSONB,
  decided_by VARCHAR,
  decided_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS communication_approvals_case_idx ON communication_approvals (case_id);
CREATE INDEX IF NOT EXISTS communication_approvals_org_idx ON communication_approvals (organization_id);

CREATE TABLE IF NOT EXISTS communication_case_links (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  case_id VARCHAR NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR NOT NULL,
  relationship VARCHAR(64) NOT NULL DEFAULT 'related',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS communication_case_links_uidx
  ON communication_case_links (case_id, entity_type, entity_id, relationship);
CREATE INDEX IF NOT EXISTS communication_case_links_entity_idx
  ON communication_case_links (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS communication_case_links_org_idx
  ON communication_case_links (organization_id);

CREATE TABLE IF NOT EXISTS communication_audit_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  case_id VARCHAR NOT NULL,
  actor_type VARCHAR(32) NOT NULL DEFAULT 'user',
  actor_id VARCHAR,
  event_type VARCHAR(64) NOT NULL,
  before_json JSONB,
  after_json JSONB,
  reason TEXT,
  correlation_id VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS communication_audit_case_idx
  ON communication_audit_events (case_id, created_at);
CREATE INDEX IF NOT EXISTS communication_audit_org_idx
  ON communication_audit_events (organization_id);

CREATE TABLE IF NOT EXISTS communication_sla_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  case_id VARCHAR NOT NULL,
  timer_type VARCHAR(32) NOT NULL,
  deadline TIMESTAMP NOT NULL,
  paused_at TIMESTAMP,
  resumed_at TIMESTAMP,
  pause_reason TEXT,
  escalation_level INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS communication_sla_case_idx ON communication_sla_events (case_id);
CREATE INDEX IF NOT EXISTS communication_sla_org_idx ON communication_sla_events (organization_id);

CREATE TABLE IF NOT EXISTS communication_channel_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR,
  provider VARCHAR(64) NOT NULL,
  external_event_id VARCHAR(255) NOT NULL,
  processing_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  correlation_id VARCHAR(64),
  payload_json JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS communication_channel_events_uidx
  ON communication_channel_events (provider, external_event_id);
CREATE INDEX IF NOT EXISTS communication_channel_events_status_idx
  ON communication_channel_events (processing_status);

CREATE TABLE IF NOT EXISTS communication_document_sequences (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  year INTEGER NOT NULL,
  next_value INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS communication_document_sequences_uidx
  ON communication_document_sequences (organization_id, year);

GRANT SELECT, INSERT, UPDATE, DELETE ON communication_categories TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON communication_cases TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON communication_messages TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON communication_actions TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON communication_approvals TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON communication_case_links TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON communication_audit_events TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON communication_sla_events TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON communication_channel_events TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON communication_document_sequences TO inspect360;
