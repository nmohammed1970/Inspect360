-- Complete fix for credits_remaining column issue
-- Run these queries in order in your database admin portal

-- Step 1: Drop the column if it exists (this should have already run)
ALTER TABLE organizations DROP COLUMN IF EXISTS credits_remaining;

-- Step 2: Verify the column is completely removed
-- This should return 0 rows
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'organizations' 
AND column_name = 'credits_remaining';

-- Step 3: Check if there are any database views, functions, or triggers referencing credits_remaining
-- This will help identify if something else is trying to use this column
SELECT 
    schemaname,
    viewname as object_name,
    'view' as object_type,
    definition
FROM pg_views 
WHERE schemaname = 'public' 
AND definition LIKE '%credits_remaining%';

-- Step 4: Check for any materialized views
SELECT 
    schemaname,
    matviewname as object_name,
    'materialized_view' as object_type
FROM pg_matviews 
WHERE schemaname = 'public'
AND pg_get_viewdef('public.' || matviewname::regclass)::text LIKE '%credits_remaining%';

-- Step 5: Verify the organizations table structure (should NOT include credits_remaining)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'organizations' 
ORDER BY ordinal_position;

-- If Step 2 returns 0 rows, the column is successfully removed
-- If any of Steps 3-4 return results, those objects need to be updated or dropped

