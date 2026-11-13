-- Platform (built-in) inspection template catalog + lineage on org templates

CREATE TABLE IF NOT EXISTS platform_inspection_templates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR NOT NULL,
  description TEXT,
  scope template_scope NOT NULL DEFAULT 'property',
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  structure_json JSONB NOT NULL,
  ai_max_words INTEGER DEFAULT 150,
  ai_instruction TEXT,
  ai_include_recommended_actions BOOLEAN DEFAULT FALSE,
  ai_include_maintenance_issues BOOLEAN DEFAULT FALSE,
  report_config JSONB,
  created_by_admin_id VARCHAR,
  source_organization_id VARCHAR,
  source_template_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_inspection_templates_name_scope_uidx
  ON platform_inspection_templates (name, scope);

ALTER TABLE inspection_templates
  ADD COLUMN IF NOT EXISTS platform_template_id VARCHAR;

CREATE INDEX IF NOT EXISTS inspection_templates_platform_template_id_idx
  ON inspection_templates (platform_template_id);

-- One org copy per platform catalog entry
CREATE UNIQUE INDEX IF NOT EXISTS inspection_templates_org_platform_uidx
  ON inspection_templates (organization_id, platform_template_id)
  WHERE platform_template_id IS NOT NULL;

-- Contabo: grant app role (may not exist on local/dev DBs)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inspect360') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform_inspection_templates TO inspect360;
  END IF;
END
$$;
