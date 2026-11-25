-- Link messaging conversations to maintenance requests (one thread per MR).
-- Run as creativecloud on Contabo:
-- Dev:  docker exec -it postgres psql -U creativecloud -d inspect360_dev
-- Prod: docker exec -it postgres psql -U creativecloud -d inspect360

ALTER TABLE messaging_conversations
  ADD COLUMN IF NOT EXISTS maintenance_request_id VARCHAR;

CREATE UNIQUE INDEX IF NOT EXISTS messaging_conversations_mr_uidx
  ON messaging_conversations (maintenance_request_id)
  WHERE maintenance_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS messaging_conversations_org_type_last_idx
  ON messaging_conversations (organization_id, type, last_message_at DESC);
