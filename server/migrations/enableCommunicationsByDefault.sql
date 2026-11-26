-- Communications Hub: enable by default for all organisations (same pattern as maintenance/tenancies).
-- Contabo: run as creativecloud, then GRANT is not needed (ALTER/UPDATE on existing table).

ALTER TABLE organizations
  ALTER COLUMN communications_enabled SET DEFAULT true;

UPDATE organizations
SET communications_enabled = true
WHERE communications_enabled IS DISTINCT FROM true;
