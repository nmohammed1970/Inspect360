-- Tenant CSAT after work order completion (5-star + improvement notes).
-- Run as creativecloud on Contabo:
-- Dev:  docker exec -it postgres psql -U creativecloud -d inspect360_dev
-- Prod: docker exec -it postgres psql -U creativecloud -d inspect360

CREATE TABLE IF NOT EXISTS maintenance_job_feedback (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  work_order_id VARCHAR NOT NULL,
  token VARCHAR NOT NULL,
  rating INTEGER,
  improvement_notes TEXT,
  submitted_at TIMESTAMP,
  submitted_by_email VARCHAR,
  tenant_user_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_job_feedback_token_uidx
  ON maintenance_job_feedback (token);

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_job_feedback_wo_uidx
  ON maintenance_job_feedback (work_order_id);

CREATE INDEX IF NOT EXISTS maintenance_job_feedback_org_idx
  ON maintenance_job_feedback (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_job_feedback TO inspect360;
