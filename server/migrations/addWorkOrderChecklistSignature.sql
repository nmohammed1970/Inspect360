-- Work order completion checklist (reuse completion_checklists masters)
-- + on-device customer signature for hard-gated complete.

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS completion_checklist_id VARCHAR;

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS completion_checklist_snapshot_json JSONB;

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS customer_signature_json JSONB;

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS customer_signed_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS work_order_completion_checklist_responses (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  work_order_id VARCHAR NOT NULL,
  item_id VARCHAR NOT NULL,
  value_json JSONB,
  photo_urls TEXT[] DEFAULT '{}',
  updated_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wo_completion_checklist_responses_wo_id_idx
  ON work_order_completion_checklist_responses (work_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS wo_completion_checklist_responses_wo_item_uidx
  ON work_order_completion_checklist_responses (work_order_id, item_id);

-- Contabo: after applying as creativecloud, grant app role:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON work_order_completion_checklist_responses TO inspect360;
