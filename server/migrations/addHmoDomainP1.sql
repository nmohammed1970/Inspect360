-- HMO Compliance Intelligence domain tables (P1–P3 schema).
-- Contabo: run as creativecloud, then grants below give inspect360 app access.

CREATE TABLE IF NOT EXISTS hmo_org_settings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL UNIQUE,
  sla_json JSONB DEFAULT '{}'::jsonb,
  quiet_hours_json JSONB DEFAULT '{}'::jsonb,
  assignment_routing_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR,
  updated_by VARCHAR
);

CREATE TABLE IF NOT EXISTS hmo_property_profiles (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  property_id VARCHAR NOT NULL,
  licensing_scheme_id VARCHAR,
  uprn VARCHAR(32),
  responsible_region_id VARCHAR,
  compliance_owner_id VARCHAR,
  profile_status VARCHAR(64) DEFAULT 'NOT_ASSESSED',
  overall_status VARCHAR(64) DEFAULT 'NOT_ASSESSED',
  evidence_completeness INTEGER DEFAULT 0,
  last_assessment_id VARCHAR,
  last_assessed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR,
  updated_by VARCHAR
);

CREATE UNIQUE INDEX IF NOT EXISTS hmo_property_profiles_org_property_uidx
  ON hmo_property_profiles (organization_id, property_id);
CREATE INDEX IF NOT EXISTS hmo_property_profiles_org_idx
  ON hmo_property_profiles (organization_id);

CREATE TABLE IF NOT EXISTS hmo_licences (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  property_id VARCHAR NOT NULL,
  licence_number VARCHAR(128),
  authority_id VARCHAR,
  authority_name TEXT,
  holder_contact_id VARCHAR,
  holder_name TEXT,
  manager_contact_id VARCHAR,
  manager_name TEXT,
  scheme_type VARCHAR(128),
  issue_date TIMESTAMP,
  expiry_date TIMESTAMP,
  max_persons INTEGER,
  lifecycle_status VARCHAR(64) DEFAULT 'DRAFT',
  supersedes_id VARCHAR,
  current_version_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR,
  updated_by VARCHAR
);

CREATE INDEX IF NOT EXISTS hmo_licences_org_property_idx
  ON hmo_licences (organization_id, property_id);
CREATE INDEX IF NOT EXISTS hmo_licences_expiry_idx
  ON hmo_licences (expiry_date);

CREATE TABLE IF NOT EXISTS hmo_licence_versions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  licence_id VARCHAR NOT NULL,
  original_document_id TEXT,
  original_object_url TEXT,
  file_name VARCHAR(512),
  content_hash VARCHAR(128),
  version_no INTEGER NOT NULL DEFAULT 1,
  extracted_json JSONB,
  page_count INTEGER,
  reviewer_id VARCHAR,
  review_at TIMESTAMP,
  confirmed_at TIMESTAMP,
  effective_from TIMESTAMP,
  effective_to TIMESTAMP,
  status VARCHAR(64) DEFAULT 'DRAFT',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR,
  updated_by VARCHAR
);

CREATE INDEX IF NOT EXISTS hmo_licence_versions_licence_idx
  ON hmo_licence_versions (licence_id);
CREATE UNIQUE INDEX IF NOT EXISTS hmo_licence_versions_hash_uidx
  ON hmo_licence_versions (organization_id, content_hash);

CREATE TABLE IF NOT EXISTS hmo_licence_conditions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  licence_version_id VARCHAR NOT NULL,
  condition_no INTEGER,
  raw_text TEXT NOT NULL,
  structured_rule_json JSONB,
  source_pages INTEGER[],
  validity VARCHAR(64) DEFAULT 'PENDING_REVIEW',
  human_approved BOOLEAN DEFAULT false,
  exception_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR,
  updated_by VARCHAR
);

CREATE TABLE IF NOT EXISTS hmo_jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  property_id VARCHAR,
  job_type VARCHAR(64) NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'QUEUED',
  progress INTEGER DEFAULT 0,
  error_message TEXT,
  result_json JSONB,
  licence_version_id VARCHAR,
  assessment_id VARCHAR,
  idempotency_key VARCHAR(256),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR
);

CREATE INDEX IF NOT EXISTS hmo_jobs_org_idx ON hmo_jobs (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS hmo_jobs_idempotency_uidx
  ON hmo_jobs (organization_id, idempotency_key);

CREATE TABLE IF NOT EXISTS hmo_assessments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  property_id VARCHAR NOT NULL,
  licence_version_id VARCHAR,
  snapshot_hash VARCHAR(128),
  run_reason VARCHAR(128),
  engine_version VARCHAR(64) DEFAULT '1.0',
  prompt_version VARCHAR(64),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  status VARCHAR(64) DEFAULT 'RUNNING',
  overall_status VARCHAR(64),
  evidence_completeness INTEGER DEFAULT 0,
  superseded_by_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR
);

CREATE INDEX IF NOT EXISTS hmo_assessments_property_idx
  ON hmo_assessments (organization_id, property_id);

CREATE TABLE IF NOT EXISTS hmo_findings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  assessment_id VARCHAR NOT NULL,
  property_id VARCHAR NOT NULL,
  check_id VARCHAR(32) NOT NULL,
  subject_ref VARCHAR(256) NOT NULL,
  rule_version_id VARCHAR,
  status VARCHAR(64) NOT NULL,
  severity VARCHAR(64) NOT NULL,
  actual_json JSONB,
  required_json JSONB,
  explanation TEXT,
  fingerprint VARCHAR(512) NOT NULL,
  confidence DOUBLE PRECISION,
  human_review_required BOOLEAN DEFAULT false,
  suggested_action_code VARCHAR(128),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hmo_findings_assessment_idx ON hmo_findings (assessment_id);
CREATE INDEX IF NOT EXISTS hmo_findings_fingerprint_idx
  ON hmo_findings (organization_id, fingerprint);

CREATE TABLE IF NOT EXISTS hmo_finding_evidence (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  finding_id VARCHAR NOT NULL,
  document_id TEXT,
  inspection_id VARCHAR,
  page INTEGER,
  text_offsets JSONB,
  measured_at TIMESTAMP,
  verification_state VARCHAR(64) DEFAULT 'AI_REVIEWED',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hmo_cases (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  property_id VARCHAR NOT NULL,
  case_reference VARCHAR(64) NOT NULL,
  severity VARCHAR(32) NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'OPEN',
  owner_user_id VARCHAR,
  created_from_assessment_id VARCHAR,
  due_at TIMESTAMP,
  closure_reason TEXT,
  approver_id VARCHAR,
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR,
  updated_by VARCHAR
);

CREATE INDEX IF NOT EXISTS hmo_cases_org_status_idx ON hmo_cases (organization_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS hmo_cases_org_ref_uidx
  ON hmo_cases (organization_id, case_reference);

CREATE TABLE IF NOT EXISTS hmo_case_findings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  case_id VARCHAR NOT NULL,
  finding_id VARCHAR NOT NULL,
  finding_status_at_link VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hmo_tasks (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  case_id VARCHAR NOT NULL,
  finding_id VARCHAR,
  property_id VARCHAR NOT NULL,
  task_code VARCHAR(64),
  assigned_role VARCHAR(64),
  assigned_user_id VARCHAR,
  title TEXT NOT NULL,
  description TEXT,
  status VARCHAR(64) NOT NULL DEFAULT 'OPEN',
  due_at TIMESTAMP,
  priority VARCHAR(32) DEFAULT 'MEDIUM',
  approval_policy_id VARCHAR,
  escalated_at TIMESTAMP,
  idempotency_key VARCHAR(256) NOT NULL,
  evidence_checklist_json JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR,
  updated_by VARCHAR
);

CREATE UNIQUE INDEX IF NOT EXISTS hmo_tasks_idempotency_uidx
  ON hmo_tasks (organization_id, idempotency_key);
CREATE INDEX IF NOT EXISTS hmo_tasks_case_idx ON hmo_tasks (case_id);

CREATE TABLE IF NOT EXISTS hmo_evidence_requests (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  task_id VARCHAR NOT NULL,
  recipient_contact_id VARCHAR,
  recipient_email VARCHAR(320),
  secure_token_hash VARCHAR(128) NOT NULL,
  expiry_at TIMESTAMP NOT NULL,
  request_template TEXT,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  response_at TIMESTAMP,
  status VARCHAR(64) DEFAULT 'REQUESTED',
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR
);

CREATE TABLE IF NOT EXISTS hmo_evidence_reviews (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  task_id VARCHAR NOT NULL,
  evidence_id VARCHAR,
  evidence_object_url TEXT,
  ai_result JSONB,
  reviewer_user_id VARCHAR,
  decision VARCHAR(64),
  decision_at TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hmo_escalation_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  task_id VARCHAR NOT NULL,
  policy_id VARCHAR,
  trigger VARCHAR(128),
  recipient_user_id VARCHAR,
  occurred_at TIMESTAMP DEFAULT NOW(),
  delivery_result TEXT
);

CREATE TABLE IF NOT EXISTS hmo_audit_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  actor_type VARCHAR(64) NOT NULL,
  actor_id VARCHAR,
  entity_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR NOT NULL,
  action VARCHAR(128) NOT NULL,
  before_hash VARCHAR(128),
  after_hash VARCHAR(128),
  correlation_id VARCHAR(128),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hmo_audit_org_entity_idx
  ON hmo_audit_events (organization_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS hmo_room_profiles (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  property_id VARCHAR NOT NULL,
  existing_room_id VARCHAR,
  room_type VARCHAR(128),
  measured_usable_area_m2 DOUBLE PRECISION,
  ceiling_height_m DOUBLE PRECISION,
  measured_at TIMESTAMP,
  measurement_evidence_id TEXT,
  declared_permitted_occupancy INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR,
  updated_by VARCHAR
);

CREATE INDEX IF NOT EXISTS hmo_room_profiles_property_idx
  ON hmo_room_profiles (organization_id, property_id);

CREATE TABLE IF NOT EXISTS hmo_occupancy_snapshots (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  property_id VARCHAR NOT NULL,
  as_of TIMESTAMP NOT NULL,
  source_system VARCHAR(128) DEFAULT 'tenant_assignments',
  verified_by VARCHAR,
  person_count INTEGER,
  household_count INTEGER,
  confidence DOUBLE PRECISION,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR
);

CREATE INDEX IF NOT EXISTS hmo_occupancy_snapshots_property_idx
  ON hmo_occupancy_snapshots (organization_id, property_id);

CREATE TABLE IF NOT EXISTS hmo_room_allocations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  occupancy_snapshot_id VARCHAR NOT NULL,
  room_id VARCHAR,
  pseudonymous_occupant_ref VARCHAR(128),
  effective_from TIMESTAMP,
  effective_to TIMESTAMP,
  household_ref VARCHAR(128),
  age_band VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hmo_regulatory_sources (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR,
  authority_id VARCHAR,
  authority_name TEXT,
  source_url TEXT,
  source_type VARCHAR(128),
  content_hash VARCHAR(128),
  published_at TIMESTAMP,
  checked_at TIMESTAMP,
  status VARCHAR(64) DEFAULT 'ACTIVE',
  evidence_document_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hmo_rule_versions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR,
  rule_code VARCHAR(128) NOT NULL,
  authority_id VARCHAR,
  scheme_id VARCHAR,
  jurisdiction VARCHAR(64) DEFAULT 'England',
  classification VARCHAR(128),
  requirements_json JSONB,
  effective_from TIMESTAMP,
  effective_to TIMESTAMP,
  approved_by VARCHAR,
  approved_at TIMESTAMP,
  status VARCHAR(64) DEFAULT 'DRAFT',
  supersedes_id VARCHAR,
  source_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hmo_rule_versions_code_status_idx
  ON hmo_rule_versions (rule_code, status);

CREATE TABLE IF NOT EXISTS hmo_rule_impact_runs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  rule_version_id VARCHAR NOT NULL,
  status VARCHAR(64) DEFAULT 'QUEUED',
  impacted_property_count INTEGER DEFAULT 0,
  completed_count INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  summary_json JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR
);

-- Contabo app role; skip gracefully on local DBs without inspect360.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inspect360') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_org_settings TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_property_profiles TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_licences TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_licence_versions TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_licence_conditions TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_jobs TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_assessments TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_findings TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_finding_evidence TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_cases TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_case_findings TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_tasks TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_evidence_requests TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_evidence_reviews TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_escalation_events TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_audit_events TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_room_profiles TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_occupancy_snapshots TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_room_allocations TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_regulatory_sources TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_rule_versions TO inspect360;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hmo_rule_impact_runs TO inspect360;
  END IF;
END $$;
