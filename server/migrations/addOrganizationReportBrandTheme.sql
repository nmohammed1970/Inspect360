-- Org-scoped report brand palette (Settings → Company Branding → Website Brand Colors).
-- Contabo: run as creativecloud on inspect360_dev / inspect360.
-- ALTER on organizations (owned by creativecloud); app user inspect360 already has table access.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS branding_report_palette JSONB;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS branding_palette_meta JSONB;
