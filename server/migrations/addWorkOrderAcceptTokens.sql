-- Per-member accept tokens for team auto-assigned work orders.
-- Run as creativecloud on Contabo (inspect360_dev / inspect360).

CREATE TABLE IF NOT EXISTS work_order_accept_tokens (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id varchar NOT NULL,
  work_order_id varchar NOT NULL,
  team_member_id varchar NOT NULL,
  user_id varchar,
  contact_id varchar,
  token_hash varchar NOT NULL,
  expires_at timestamp NOT NULL,
  revoked_at timestamp,
  accepted_at timestamp,
  email_sent_at timestamp,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_order_accept_tokens_wo_idx
  ON work_order_accept_tokens (work_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS work_order_accept_tokens_hash_uidx
  ON work_order_accept_tokens (token_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON work_order_accept_tokens TO inspect360;
