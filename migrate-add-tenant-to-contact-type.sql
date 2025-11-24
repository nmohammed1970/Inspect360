-- Migration: Add 'tenant' to contact_type enum
-- Run this script on your database to fix the enum issue

DO $$ 
BEGIN
    -- Check if 'tenant' value already exists in the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'tenant' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'contact_type')
    ) THEN
        -- Add 'tenant' to the existing enum
        ALTER TYPE contact_type ADD VALUE 'tenant';
        RAISE NOTICE 'Added ''tenant'' to contact_type enum';
    ELSE
        RAISE NOTICE '''tenant'' already exists in contact_type enum';
    END IF;
END $$;

