-- Allow the same licence file (content hash) on multiple properties.
-- Previously unique on (organization_id, content_hash) blocked cross-property re-use.
-- Run as creativecloud on Contabo (inspect360_dev / inspect360).

DROP INDEX IF EXISTS hmo_licence_versions_hash_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS hmo_licence_versions_licence_hash_uidx
  ON hmo_licence_versions (licence_id, content_hash);

CREATE INDEX IF NOT EXISTS hmo_licence_versions_org_hash_idx
  ON hmo_licence_versions (organization_id, content_hash);
