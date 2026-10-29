-- Template setting: include Recommended Actions in InspectAI notes (default off).

ALTER TABLE inspection_templates
  ADD COLUMN IF NOT EXISTS ai_include_recommended_actions BOOLEAN DEFAULT false;

UPDATE inspection_templates
SET ai_include_recommended_actions = false
WHERE ai_include_recommended_actions IS NULL;
