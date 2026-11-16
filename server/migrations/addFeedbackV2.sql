-- Feedback & Feature Requests MVP (v2)
-- Contabo: run as creativecloud, then GRANT below to inspect360.

CREATE TABLE IF NOT EXISTS feedback_reference_counter (
  id INTEGER PRIMARY KEY DEFAULT 1,
  next_value BIGINT NOT NULL DEFAULT 1
);

INSERT INTO feedback_reference_counter (id, next_value)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS feedback_requests (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  reference VARCHAR(32) NOT NULL,
  type VARCHAR(32) NOT NULL,
  subject VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'new',
  reporter_user_id VARCHAR NOT NULL,
  reporter_name_snapshot TEXT,
  reporter_email_snapshot VARCHAR(320),
  organization_id VARCHAR,
  organization_name_snapshot TEXT,
  source_page TEXT,
  client_context JSONB,
  assigned_to_user_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  closed_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS feedback_requests_reference_uidx ON feedback_requests (reference);
CREATE INDEX IF NOT EXISTS feedback_requests_reporter_idx ON feedback_requests (reporter_user_id);
CREATE INDEX IF NOT EXISTS feedback_requests_org_idx ON feedback_requests (organization_id);
CREATE INDEX IF NOT EXISTS feedback_requests_status_idx ON feedback_requests (status);
CREATE INDEX IF NOT EXISTS feedback_requests_type_idx ON feedback_requests (type);
CREATE INDEX IF NOT EXISTS feedback_requests_created_idx ON feedback_requests (created_at);
CREATE INDEX IF NOT EXISTS feedback_requests_assigned_idx ON feedback_requests (assigned_to_user_id);

CREATE TABLE IF NOT EXISTS feedback_messages (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  feedback_request_id VARCHAR NOT NULL,
  author_user_id VARCHAR NOT NULL,
  author_name_snapshot TEXT,
  body TEXT NOT NULL,
  visibility VARCHAR(16) NOT NULL DEFAULT 'public',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_messages_request_idx ON feedback_messages (feedback_request_id);
CREATE INDEX IF NOT EXISTS feedback_messages_created_idx ON feedback_messages (created_at);

CREATE TABLE IF NOT EXISTS feedback_attachments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  feedback_request_id VARCHAR NOT NULL,
  message_id VARCHAR,
  uploaded_by_user_id VARCHAR NOT NULL,
  original_filename VARCHAR(512),
  mime_type VARCHAR(128) NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_attachments_request_idx ON feedback_attachments (feedback_request_id);
CREATE INDEX IF NOT EXISTS feedback_attachments_message_idx ON feedback_attachments (message_id);

CREATE TABLE IF NOT EXISTS feedback_audit_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  feedback_request_id VARCHAR NOT NULL,
  actor_user_id VARCHAR,
  event_type VARCHAR(64) NOT NULL,
  before_value TEXT,
  after_value TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_audit_request_idx ON feedback_audit_events (feedback_request_id);
CREATE INDEX IF NOT EXISTS feedback_audit_created_idx ON feedback_audit_events (created_at);

CREATE TABLE IF NOT EXISTS feature_admin_members (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR,
  email VARCHAR(320) NOT NULL,
  membership_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  can_manage_team BOOLEAN NOT NULL DEFAULT FALSE,
  invited_by_user_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  activated_at TIMESTAMP,
  removed_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS feature_admin_members_email_uidx ON feature_admin_members (email);
CREATE INDEX IF NOT EXISTS feature_admin_members_user_idx ON feature_admin_members (user_id);
CREATE INDEX IF NOT EXISTS feature_admin_members_status_idx ON feature_admin_members (membership_status);

-- Seed Feature Admin Team (spec §7)
INSERT INTO feature_admin_members (email, membership_status, can_manage_team, activated_at)
VALUES
  ('wasif.ali@deffinity.com', 'active', TRUE, NOW()),
  ('nadeem.mohammed@inspect360.ai', 'active', TRUE, NOW()),
  ('chan.mohammed@inspect360.ai', 'active', TRUE, NOW())
ON CONFLICT (email) DO NOTHING;

-- Migrate legacy feedback_submissions if present
DO $$
DECLARE
  r RECORD;
  mapped_type TEXT;
  mapped_status TEXT;
  next_ref BIGINT;
  ref_text TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'feedback_submissions'
  ) THEN
    FOR r IN
      SELECT * FROM feedback_submissions
      ORDER BY created_at ASC NULLS LAST
    LOOP
      mapped_type := CASE r.category::text
        WHEN 'bug' THEN 'issue'
        WHEN 'feature' THEN 'feature_request'
        WHEN 'improvement' THEN 'question'
        ELSE 'question'
      END;
      mapped_status := CASE r.status::text
        WHEN 'completed' THEN 'resolved'
        WHEN 'rejected' THEN 'closed'
        WHEN 'in_progress' THEN 'in_review'
        WHEN 'in_review' THEN 'in_review'
        WHEN 'new' THEN 'new'
        ELSE 'new'
      END;

      UPDATE feedback_reference_counter
      SET next_value = next_value + 1
      WHERE id = 1
      RETURNING next_value - 1 INTO next_ref;

      ref_text := 'FB-' || LPAD(next_ref::text, 6, '0');

      INSERT INTO feedback_requests (
        id, reference, type, subject, description, status,
        reporter_user_id, reporter_name_snapshot, reporter_email_snapshot,
        organization_id, organization_name_snapshot,
        assigned_to_user_id, created_at, updated_at, resolved_at, closed_at
      ) VALUES (
        r.id,
        ref_text,
        mapped_type,
        LEFT(COALESCE(r.title, 'Untitled'), 150),
        COALESCE(r.description, ''),
        mapped_status,
        r.user_id,
        r.user_name,
        r.user_email,
        r.organization_id,
        r.organization_name,
        r.assigned_to,
        COALESCE(r.created_at, NOW()),
        COALESCE(r.updated_at, NOW()),
        CASE WHEN mapped_status = 'resolved' THEN COALESCE(r.resolved_at, r.updated_at, NOW()) ELSE NULL END,
        CASE WHEN mapped_status = 'closed' THEN COALESCE(r.resolved_at, r.updated_at, NOW()) ELSE NULL END
      )
      ON CONFLICT (id) DO NOTHING;

      IF r.resolution_notes IS NOT NULL AND LENGTH(TRIM(r.resolution_notes)) > 0 THEN
        INSERT INTO feedback_messages (
          feedback_request_id, author_user_id, author_name_snapshot, body, visibility, created_at
        ) VALUES (
          r.id,
          COALESCE(r.assigned_to, r.user_id),
          'Inspect360 team',
          r.resolution_notes,
          'public',
          COALESCE(r.resolved_at, r.updated_at, NOW())
        );
      END IF;
    END LOOP;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON feedback_requests TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON feedback_messages TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON feedback_attachments TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON feedback_audit_events TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON feature_admin_members TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON feedback_reference_counter TO inspect360;
