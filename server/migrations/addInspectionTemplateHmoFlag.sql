-- Mark org inspection templates as HMO evidence templates

ALTER TABLE inspection_templates
  ADD COLUMN IF NOT EXISTS is_hmo_template BOOLEAN DEFAULT FALSE;

UPDATE inspection_templates
SET is_hmo_template = FALSE
WHERE is_hmo_template IS NULL;
