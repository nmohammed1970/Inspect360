-- Company module on/off flags (Settings → Company Branding).
-- Defaults TRUE so existing orgs keep current behaviour.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS rentals_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS tenancies_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS compliance_enabled BOOLEAN NOT NULL DEFAULT true;

-- Contabo: after creating columns as creativecloud, grant app role if needed:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO inspect360;
