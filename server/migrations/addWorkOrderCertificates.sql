-- Work Order certificates + link Compliance docs to source work order.
-- Contabo (as creativecloud):
--   docker exec -it postgres psql -U creativecloud -d inspect360_dev
--   or production: ... -d inspect360
-- Then GRANT to inspect360 (see bottom).

DO $$ BEGIN
  CREATE TYPE work_order_certificate_extraction_status AS ENUM (
    'uploaded',
    'analysing',
    'needs_info',
    'ready_to_confirm',
    'added_to_compliance',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE compliance_documents
  ADD COLUMN IF NOT EXISTS source_work_order_id VARCHAR;

CREATE TABLE IF NOT EXISTS work_order_certificates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  work_order_id VARCHAR NOT NULL,
  property_id VARCHAR,
  document_url TEXT NOT NULL,
  file_name VARCHAR(512),
  mime_type VARCHAR(128),
  extraction_status work_order_certificate_extraction_status NOT NULL DEFAULT 'uploaded',
  certificate_type VARCHAR(255),
  expiry_date TIMESTAMP,
  extraction_confidence INTEGER,
  extraction_raw JSONB,
  processing_error TEXT,
  compliance_document_id VARCHAR,
  created_by VARCHAR NOT NULL,
  confirmed_by VARCHAR,
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS work_order_certificates_work_order_id_idx
  ON work_order_certificates (work_order_id);
CREATE INDEX IF NOT EXISTS work_order_certificates_organization_id_idx
  ON work_order_certificates (organization_id);

-- Contabo only (app role). Skip if role does not exist locally:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON work_order_certificates TO inspect360;
