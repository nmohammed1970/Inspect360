-- Staff–tenant discussion thread on maintenance requests.
-- Run as creativecloud on Contabo:
-- Dev:  docker exec -it postgres psql -U creativecloud -d inspect360_dev
-- Prod: docker exec -it postgres psql -U creativecloud -d inspect360

CREATE TABLE IF NOT EXISTS maintenance_request_messages (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  maintenance_request_id VARCHAR NOT NULL,
  author_user_id VARCHAR NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS maintenance_request_messages_request_idx
  ON maintenance_request_messages (maintenance_request_id, created_at);

CREATE INDEX IF NOT EXISTS maintenance_request_messages_org_idx
  ON maintenance_request_messages (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_request_messages TO inspect360;
