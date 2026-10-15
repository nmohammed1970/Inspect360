-- Add Auto: Bedrooms / Bathrooms field types to inspection_entries.field_type enum.
-- Run as table owner (local: postgres; Contabo: creativecloud).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'field_type' AND e.enumlabel = 'auto_bedroom_count'
  ) THEN
    ALTER TYPE field_type ADD VALUE 'auto_bedroom_count';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'field_type' AND e.enumlabel = 'auto_bathroom_count'
  ) THEN
    ALTER TYPE field_type ADD VALUE 'auto_bathroom_count';
  END IF;
END$$;
