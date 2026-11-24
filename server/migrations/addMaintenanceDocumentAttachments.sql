-- Quote/invoice file attachments (shared storage keys; convert copies rows, not blobs).
-- Run as creativecloud on Contabo:
-- Dev:  docker exec -it postgres psql -U creativecloud -d inspect360_dev
-- Prod: docker exec -it postgres psql -U creativecloud -d inspect360

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
