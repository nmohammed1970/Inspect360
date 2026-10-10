-- Company module on/off flag for Maintenance + Work Orders.
-- Defaults TRUE so existing orgs keep current behaviour.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS maintenance_enabled BOOLEAN NOT NULL DEFAULT true;

-- Contabo: after creating columns as creativecloud, grant app role if needed:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO inspect360;
