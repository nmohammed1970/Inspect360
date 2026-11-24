-- Combined migrations from develop pull (26e7378..4edefde)
-- Run as creativecloud on Contabo:
--   Dev:  docker exec -it postgres psql -U creativecloud -d inspect360_dev
--   Prod: docker exec -it postgres psql -U creativecloud -d inspect360
--
-- WARNING: Section 9 (wipeDualApprovalQuotes) DELETES all quotes/lines/share tokens.
-- Skip section 9 on production unless you intentionally want that wipe.
--
-- Tip: ALTER TYPE ... ADD VALUE often must run outside a transaction block.
-- If the whole paste fails on the enum line, run section 1 alone first, then 2–8.

-- =============================================================================
-- 1) addMaintenanceAdminRole.sql
-- =============================================================================
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'maintenance_admin';

-- =============================================================================
-- 2) addWorkOrderScheduledAt.sql
-- =============================================================================
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP;

-- =============================================================================
-- 3) addWorkOrderArrivedAt.sql
-- =============================================================================
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP;

-- =============================================================================
-- 4) addWorkOrderCreatedByAndRecipientUser.sql
-- =============================================================================
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS created_by varchar;

ALTER TABLE maintenance_quotes ADD COLUMN IF NOT EXISTS recipient_user_id varchar;

ALTER TABLE maintenance_invoices ADD COLUMN IF NOT EXISTS recipient_user_id varchar;

-- =============================================================================
-- 5) addQuoteInvoiceLocation.sql
-- =============================================================================
ALTER TABLE maintenance_quotes ADD COLUMN IF NOT EXISTS property_id varchar;
ALTER TABLE maintenance_quotes ADD COLUMN IF NOT EXISTS block_id varchar;

ALTER TABLE maintenance_invoices ADD COLUMN IF NOT EXISTS property_id varchar;
ALTER TABLE maintenance_invoices ADD COLUMN IF NOT EXISTS block_id varchar;

CREATE INDEX IF NOT EXISTS maintenance_quotes_org_property_idx
  ON maintenance_quotes (organization_id, property_id);
CREATE INDEX IF NOT EXISTS maintenance_quotes_org_block_idx
  ON maintenance_quotes (organization_id, block_id);
CREATE INDEX IF NOT EXISTS maintenance_invoices_org_property_idx
  ON maintenance_invoices (organization_id, property_id);
CREATE INDEX IF NOT EXISTS maintenance_invoices_org_block_idx
  ON maintenance_invoices (organization_id, block_id);

UPDATE maintenance_quotes q
SET
  property_id = mr.property_id,
  block_id = COALESCE(mr.block_id, p.block_id)
FROM work_orders wo
JOIN maintenance_requests mr ON mr.id = wo.maintenance_request_id
LEFT JOIN properties p ON p.id = mr.property_id
WHERE wo.id = q.work_order_id
  AND (q.property_id IS NULL OR q.block_id IS NULL);

UPDATE maintenance_invoices i
SET
  property_id = mr.property_id,
  block_id = COALESCE(mr.block_id, p.block_id)
FROM work_orders wo
JOIN maintenance_requests mr ON mr.id = wo.maintenance_request_id
LEFT JOIN properties p ON p.id = mr.property_id
WHERE wo.id = i.work_order_id
  AND (i.property_id IS NULL OR i.block_id IS NULL);

-- =============================================================================
-- 6) addMaintenanceDocumentAttachments.sql
-- =============================================================================
CREATE TABLE IF NOT EXISTS maintenance_document_attachments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  quote_id VARCHAR,
  invoice_id VARCHAR,
  storage_key TEXT NOT NULL,
  file_name VARCHAR NOT NULL,
  mime_type VARCHAR,
  file_size_bytes INTEGER,
  uploaded_by_user_id VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS maintenance_doc_attachments_org_idx
  ON maintenance_document_attachments (organization_id);
CREATE INDEX IF NOT EXISTS maintenance_doc_attachments_quote_idx
  ON maintenance_document_attachments (quote_id);
CREATE INDEX IF NOT EXISTS maintenance_doc_attachments_invoice_idx
  ON maintenance_document_attachments (invoice_id);
CREATE INDEX IF NOT EXISTS maintenance_doc_attachments_storage_idx
  ON maintenance_document_attachments (storage_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_document_attachments TO inspect360;

-- =============================================================================
-- 7) addMaintenanceJobFeedback.sql
-- =============================================================================
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

-- =============================================================================
-- 8) addMaintenanceRequestMessages.sql
-- =============================================================================
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

-- =============================================================================
-- 9) wipeDualApprovalQuotes.sql  *** DESTRUCTIVE — optional ***
-- Wipes ALL quotes, lines, share tokens, and quote_* work_order_events.
-- Uncomment only if you intentionally want that wipe on this database.
-- =============================================================================
-- DELETE FROM maintenance_quote_share_tokens;
-- DELETE FROM maintenance_quote_lines;
-- UPDATE maintenance_invoices SET quote_id = NULL WHERE quote_id IS NOT NULL;
-- DELETE FROM maintenance_quotes;
-- DELETE FROM work_order_events WHERE event_type LIKE 'quote_%';
