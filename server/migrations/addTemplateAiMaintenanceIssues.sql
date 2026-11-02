-- Template setting: include Maintenance Issues in InspectAI notes (default off).

ALTER TABLE inspection_templates
  ADD COLUMN IF NOT EXISTS ai_include_maintenance_issues BOOLEAN DEFAULT false;

UPDATE inspection_templates
SET ai_include_maintenance_issues = false
WHERE ai_include_maintenance_issues IS NULL;
