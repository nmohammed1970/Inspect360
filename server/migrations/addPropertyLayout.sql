-- Property layout: room counts + optional floor plan / AI analysis metadata.
-- Defaults keep existing properties valid (1 of each room type).

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS bedrooms INTEGER NOT NULL DEFAULT 1;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS kitchens INTEGER NOT NULL DEFAULT 1;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS bathrooms INTEGER NOT NULL DEFAULT 1;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS living_rooms INTEGER NOT NULL DEFAULT 1;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS floor_plan_url TEXT;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS floor_plan_mime_type VARCHAR(128);

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS floor_plan_file_name VARCHAR(512);

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS floor_plan_uploaded_at TIMESTAMP;

DO $$ BEGIN
  CREATE TYPE floor_plan_analysis_status AS ENUM (
    'none',
    'uploading',
    'processing',
    'complete',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS floor_plan_analysis_status floor_plan_analysis_status NOT NULL DEFAULT 'none';

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS floor_plan_analysis_json JSONB;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS floor_plan_analysed_at TIMESTAMP;

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS property_room_counts_snapshot JSONB;

-- Contabo: after applying as creativecloud, grant app role if needed:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON properties TO inspect360;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON inspections TO inspect360;
