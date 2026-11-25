-- Internal messaging system.
-- Run as creativecloud on Contabo:
-- Dev:  docker exec -it postgres psql -U creativecloud -d inspect360_dev
-- Prod: docker exec -it postgres psql -U creativecloud -d inspect360

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS messaging_conversations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  type VARCHAR NOT NULL DEFAULT 'direct',
  title VARCHAR,
  direct_key VARCHAR,
  created_by_id VARCHAR NOT NULL,
  last_message_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messaging_conversations_org_last_idx
  ON messaging_conversations (organization_id, last_message_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS messaging_conversations_direct_key_uidx
  ON messaging_conversations (organization_id, direct_key)
  WHERE direct_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS messaging_participants (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  joined_at TIMESTAMP DEFAULT NOW(),
  last_read_at TIMESTAMP,
  muted_until TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS messaging_participants_conv_user_uidx
  ON messaging_participants (conversation_id, user_id);

CREATE INDEX IF NOT EXISTS messaging_participants_user_idx
  ON messaging_participants (user_id);

CREATE TABLE IF NOT EXISTS messaging_messages (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id VARCHAR NOT NULL,
  organization_id VARCHAR NOT NULL,
  sender_id VARCHAR NOT NULL,
  body TEXT,
  client_message_id VARCHAR,
  reply_to_message_id VARCHAR,
  edited_at TIMESTAMP,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messaging_messages_conv_created_idx
  ON messaging_messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messaging_messages_org_idx
  ON messaging_messages (organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS messaging_messages_client_id_uidx
  ON messaging_messages (sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS messaging_attachments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id VARCHAR NOT NULL,
  object_path VARCHAR NOT NULL,
  file_name VARCHAR NOT NULL,
  mime_type VARCHAR NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messaging_attachments_message_idx
  ON messaging_attachments (message_id);

CREATE TABLE IF NOT EXISTS messaging_reactions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  emoji VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS messaging_reactions_uidx
  ON messaging_reactions (message_id, user_id, emoji);

CREATE INDEX IF NOT EXISTS messaging_reactions_message_idx
  ON messaging_reactions (message_id);

CREATE TABLE IF NOT EXISTS messaging_receipts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS messaging_receipts_uidx
  ON messaging_receipts (message_id, user_id);

CREATE INDEX IF NOT EXISTS messaging_receipts_user_idx
  ON messaging_receipts (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON messaging_conversations TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON messaging_participants TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON messaging_messages TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON messaging_attachments TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON messaging_reactions TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON messaging_receipts TO inspect360;
