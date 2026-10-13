-- Property rooms + org room categories + inspection rooms snapshot.
-- Run as creativecloud on Contabo. Then grant inspect360.

CREATE TABLE IF NOT EXISTS organization_room_categories (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  name VARCHAR(120) NOT NULL,
  name_normalized VARCHAR(120) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT organization_room_categories_org_name_uq UNIQUE (organization_id, name_normalized)
);

CREATE INDEX IF NOT EXISTS organization_room_categories_org_idx
  ON organization_room_categories (organization_id);

CREATE TABLE IF NOT EXISTS property_rooms (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  property_id VARCHAR NOT NULL,
  category_id VARCHAR NOT NULL REFERENCES organization_room_categories(id),
  name VARCHAR(160) NOT NULL,
  width_mm INTEGER,
  length_mm INTEGER,
  ceiling_height_mm INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source VARCHAR(20) NOT NULL DEFAULT 'manual',
  ai_confidence VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS property_rooms_property_sort_idx
  ON property_rooms (property_id, sort_order);

CREATE INDEX IF NOT EXISTS property_rooms_org_idx
  ON property_rooms (organization_id);

CREATE INDEX IF NOT EXISTS property_rooms_category_idx
  ON property_rooms (category_id);

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS property_rooms_snapshot JSONB;

-- Contabo grants (run as creativecloud after create):
-- GRANT SELECT, INSERT, UPDATE, DELETE ON organization_room_categories TO inspect360;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON property_rooms TO inspect360;
