-- Sync inspection_type enum with shared/schema.ts.
-- Run as creativecloud on Contabo (inspect360_dev or inspect360).
-- Safe to re-run: skips labels that already exist.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'inspection_type' AND e.enumlabel = 'esg_sustainability_inspection'
  ) THEN
    ALTER TYPE inspection_type ADD VALUE 'esg_sustainability_inspection';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'inspection_type' AND e.enumlabel = 'fire_hazard_assessment'
  ) THEN
    ALTER TYPE inspection_type ADD VALUE 'fire_hazard_assessment';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'inspection_type' AND e.enumlabel = 'maintenance_inspection'
  ) THEN
    ALTER TYPE inspection_type ADD VALUE 'maintenance_inspection';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'inspection_type' AND e.enumlabel = 'damage'
  ) THEN
    ALTER TYPE inspection_type ADD VALUE 'damage';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'inspection_type' AND e.enumlabel = 'emergency'
  ) THEN
    ALTER TYPE inspection_type ADD VALUE 'emergency';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'inspection_type' AND e.enumlabel = 'safety_compliance'
  ) THEN
    ALTER TYPE inspection_type ADD VALUE 'safety_compliance';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'inspection_type' AND e.enumlabel = 'compliance_regulatory'
  ) THEN
    ALTER TYPE inspection_type ADD VALUE 'compliance_regulatory';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'inspection_type' AND e.enumlabel = 'pre_purchase'
  ) THEN
    ALTER TYPE inspection_type ADD VALUE 'pre_purchase';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'inspection_type' AND e.enumlabel = 'specialized'
  ) THEN
    ALTER TYPE inspection_type ADD VALUE 'specialized';
  END IF;
END$$;
