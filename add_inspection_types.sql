-- SQL Migration Script to Add New Inspection Types to PostgreSQL
-- Run this script in pgAdmin or your PostgreSQL client
-- Compatible with PostgreSQL 9.1+ (for older versions, run each ALTER TYPE statement separately)

-- IMPORTANT: If you're using PostgreSQL < 9.5, remove the IF NOT EXISTS clauses
-- and run each ALTER TYPE statement separately outside of a transaction block

-- Method 1: Using DO blocks with existence checks (PostgreSQL 9.1+)
-- This method checks if values exist before adding them

DO $$ 
BEGIN
    -- Add 'esg_sustainability_inspection'
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'esg_sustainability_inspection' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'inspection_type')
    ) THEN
        ALTER TYPE "public"."inspection_type" ADD VALUE 'esg_sustainability_inspection';
    END IF;
END $$;

DO $$ 
BEGIN
    -- Add 'fire_hazard_assessment'
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'fire_hazard_assessment' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'inspection_type')
    ) THEN
        ALTER TYPE "public"."inspection_type" ADD VALUE 'fire_hazard_assessment';
    END IF;
END $$;

DO $$ 
BEGIN
    -- Add 'maintenance_inspection'
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'maintenance_inspection' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'inspection_type')
    ) THEN
        ALTER TYPE "public"."inspection_type" ADD VALUE 'maintenance_inspection';
    END IF;
END $$;

DO $$ 
BEGIN
    -- Add 'damage'
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'damage' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'inspection_type')
    ) THEN
        ALTER TYPE "public"."inspection_type" ADD VALUE 'damage';
    END IF;
END $$;

DO $$ 
BEGIN
    -- Add 'emergency'
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'emergency' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'inspection_type')
    ) THEN
        ALTER TYPE "public"."inspection_type" ADD VALUE 'emergency';
    END IF;
END $$;

DO $$ 
BEGIN
    -- Add 'safety_compliance'
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'safety_compliance' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'inspection_type')
    ) THEN
        ALTER TYPE "public"."inspection_type" ADD VALUE 'safety_compliance';
    END IF;
END $$;

DO $$ 
BEGIN
    -- Add 'compliance_regulatory'
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'compliance_regulatory' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'inspection_type')
    ) THEN
        ALTER TYPE "public"."inspection_type" ADD VALUE 'compliance_regulatory';
    END IF;
END $$;

DO $$ 
BEGIN
    -- Add 'pre_purchase'
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'pre_purchase' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'inspection_type')
    ) THEN
        ALTER TYPE "public"."inspection_type" ADD VALUE 'pre_purchase';
    END IF;
END $$;

DO $$ 
BEGIN
    -- Add 'specialized'
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'specialized' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'inspection_type')
    ) THEN
        ALTER TYPE "public"."inspection_type" ADD VALUE 'specialized';
    END IF;
END $$;

-- Verify the enum values (should show all inspection types)
SELECT enumlabel as inspection_type_value
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'inspection_type')
ORDER BY enumsortorder;

-- ============================================================================
-- ALTERNATIVE METHOD: If the above doesn't work, use these individual statements
-- Run each one separately (one at a time) in pgAdmin Query Tool
-- ============================================================================

/*
ALTER TYPE "public"."inspection_type" ADD VALUE 'esg_sustainability_inspection';
ALTER TYPE "public"."inspection_type" ADD VALUE 'fire_hazard_assessment';
ALTER TYPE "public"."inspection_type" ADD VALUE 'maintenance_inspection';
ALTER TYPE "public"."inspection_type" ADD VALUE 'damage';
ALTER TYPE "public"."inspection_type" ADD VALUE 'emergency';
ALTER TYPE "public"."inspection_type" ADD VALUE 'safety_compliance';
ALTER TYPE "public"."inspection_type" ADD VALUE 'compliance_regulatory';
ALTER TYPE "public"."inspection_type" ADD VALUE 'pre_purchase';
ALTER TYPE "public"."inspection_type" ADD VALUE 'specialized';
*/
