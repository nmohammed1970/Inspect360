-- ============================================================================
-- Add missing 'description' column to subscription_tiers table
-- ============================================================================
-- This script adds the 'description' column that is defined in the TypeScript
-- schema but missing from the database table.
-- ============================================================================

-- Add the description column if it doesn't exist
DO $$ 
BEGIN
  -- Check if the column already exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'subscription_tiers' 
    AND column_name = 'description'
  ) THEN
    -- Add the description column as TEXT (nullable)
    ALTER TABLE "public"."subscription_tiers" 
    ADD COLUMN "description" text;
    
    RAISE NOTICE 'Successfully added description column to subscription_tiers table';
  ELSE
    RAISE NOTICE 'Description column already exists in subscription_tiers table';
  END IF;
END $$;

-- Verify the column was added
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'subscription_tiers' 
  AND column_name = 'description';

