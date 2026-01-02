-- ============================================================================
-- Add missing 'purchase_date' column to instance_bundles table
-- ============================================================================
-- This script adds the 'purchase_date' column that is defined in the TypeScript
-- schema but missing from the database table.
-- ============================================================================

-- Add the purchase_date column if it doesn't exist
DO $$ 
BEGIN
  -- Check if the column already exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'instance_bundles' 
    AND column_name = 'purchase_date'
  ) THEN
    -- Add the purchase_date column as TIMESTAMP with default NOW()
    ALTER TABLE "public"."instance_bundles" 
    ADD COLUMN "purchase_date" timestamp DEFAULT now();
    
    RAISE NOTICE 'Successfully added purchase_date column to instance_bundles table';
  ELSE
    RAISE NOTICE 'purchase_date column already exists in instance_bundles table';
  END IF;
END $$;

-- Verify the column was added
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'instance_bundles' 
  AND column_name = 'purchase_date';

