-- Fix credits_remaining column issue
-- Run this SQL in your database admin portal

-- Step 1: Drop the column if it exists (safe to run multiple times)
ALTER TABLE organizations DROP COLUMN IF EXISTS credits_remaining;

-- Step 2: Verify the column is gone
-- This query should return 0 rows if the fix worked
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'organizations' 
AND column_name = 'credits_remaining';

-- If the above query returns 0 rows, the fix is complete!
-- If it returns 1 row, the column still exists and you may need to check for dependencies

