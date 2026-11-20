-- Persist the tenant selected when creating a property inspection.
-- Run as creativecloud on Contabo (inspect360 / inspect360_dev).

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS tenant_id varchar;

CREATE INDEX IF NOT EXISTS inspections_tenant_id_idx
  ON inspections (tenant_id);
