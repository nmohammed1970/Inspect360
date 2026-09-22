-- Credit purchase requests. Granting a row does not add credits.

CREATE TABLE IF NOT EXISTS credit_requests (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL,
  requested_by_user_id VARCHAR NOT NULL,
  requester_name VARCHAR NOT NULL,
  requester_email VARCHAR NOT NULL,
  organization_name VARCHAR NOT NULL,
  credits_requested INTEGER NOT NULL CHECK (credits_requested >= 6 AND credits_requested <= 100000),
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'GRANTED')),
  email_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed')),
  email_error TEXT,
  granted_at TIMESTAMP,
  granted_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_requests_org
  ON credit_requests (organization_id, created_at);

CREATE INDEX IF NOT EXISTS idx_credit_requests_user
  ON credit_requests (requested_by_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_credit_requests_status
  ON credit_requests (status, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON credit_requests TO inspect360;
