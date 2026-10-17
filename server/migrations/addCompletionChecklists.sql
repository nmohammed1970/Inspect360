-- Completion checklists: org masters attached to inspection templates,
-- snapshotted onto inspections, with per-item crew responses.

CREATE TABLE IF NOT EXISTS completion_checklists (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS completion_checklists_organization_id_idx
  ON completion_checklists (organization_id);

CREATE TABLE IF NOT EXISTS completion_checklist_responses (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  inspection_id VARCHAR NOT NULL,
  item_id VARCHAR NOT NULL,
  value_json JSONB,
  photo_urls TEXT[] DEFAULT '{}',
  updated_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS completion_checklist_responses_inspection_id_idx
  ON completion_checklist_responses (inspection_id);

CREATE UNIQUE INDEX IF NOT EXISTS completion_checklist_responses_insp_item_uidx
  ON completion_checklist_responses (inspection_id, item_id);

ALTER TABLE inspection_templates
  ADD COLUMN IF NOT EXISTS completion_checklist_id VARCHAR;

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS completion_checklist_id VARCHAR;

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS completion_checklist_snapshot_json JSONB;

-- Contabo: after applying as creativecloud, grant app role (see SETUP.md):
-- GRANT SELECT, INSERT, UPDATE, DELETE ON completion_checklists TO inspect360;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON completion_checklist_responses TO inspect360;
