-- =============================================================================
-- SQL Queries to Add Missing Columns to Inspect360 Database
-- Run these queries in pgAdmin to fix the database schema
-- =============================================================================

-- 1. Add onboarding_completed column to users table (FIXES THE IMMEDIATE ERROR)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add missing columns to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS default_ai_max_words INTEGER DEFAULT 150;

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS default_ai_instruction TEXT;

-- 3. Add missing columns to inspection_templates table
ALTER TABLE inspection_templates 
ADD COLUMN IF NOT EXISTS ai_max_words INTEGER DEFAULT 150;

ALTER TABLE inspection_templates 
ADD COLUMN IF NOT EXISTS ai_instruction TEXT;

-- 4. Add missing columns to inspections table
ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS ai_analysis_status VARCHAR DEFAULT 'idle';

ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS ai_analysis_progress INTEGER DEFAULT 0;

ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS ai_analysis_total_fields INTEGER DEFAULT 0;

ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS ai_analysis_error TEXT;

-- 5. Create comparison_item_status enum if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comparison_item_status') THEN
        CREATE TYPE comparison_item_status AS ENUM ('pending', 'reviewed', 'disputed', 'resolved', 'waived');
    END IF;
END $$;

-- 6. Add status column to comparison_report_items table
ALTER TABLE comparison_report_items 
ADD COLUMN IF NOT EXISTS status comparison_item_status NOT NULL DEFAULT 'pending';

-- 7. Add missing columns to comparison_comments table
ALTER TABLE comparison_comments 
ADD COLUMN IF NOT EXISTS author_name VARCHAR;

ALTER TABLE comparison_comments 
ADD COLUMN IF NOT EXISTS author_role VARCHAR;

-- =============================================================================
-- Verification Query (Optional - to check if columns were added)
-- =============================================================================
-- Run this to verify the columns exist:
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'users' AND column_name = 'onboarding_completed';

