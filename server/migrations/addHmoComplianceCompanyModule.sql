-- Company module on/off flag for HMO Compliance Intelligence.
-- Defaults FALSE (opt-in) so existing orgs are unchanged until enabled in Settings.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS hmo_compliance_enabled BOOLEAN NOT NULL DEFAULT false;

-- Contabo: run as creativecloud, then grant app role if needed:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO inspect360;
