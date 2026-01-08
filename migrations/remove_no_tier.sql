-- ============================================================================
-- Remove "No Tier" Support - Enforce Minimum 10 Inspections
-- ============================================================================
-- This migration removes support for "No Tier" (0-9 inspections) and enforces
-- a minimum of 10 inspections. All users must have at least the Starter tier.

-- Step 1: Update any subscriptions with less than 10 inspections to use Starter tier
-- First, find the Starter tier ID
DO $$
DECLARE
    starter_tier_id VARCHAR;
    affected_count INTEGER;
BEGIN
    -- Get Starter tier ID
    SELECT id INTO starter_tier_id 
    FROM subscription_tiers 
    WHERE code = 'starter' AND is_active = true 
    LIMIT 1;
    
    IF starter_tier_id IS NULL THEN
        RAISE EXCEPTION 'Starter tier not found. Cannot proceed with migration.';
    END IF;
    
    -- Update instance subscriptions with inspectionQuotaIncluded < 10
    UPDATE instance_subscriptions
    SET 
        current_tier_id = starter_tier_id,
        inspection_quota_included = 10
    WHERE 
        inspection_quota_included < 10 
        OR inspection_quota_included IS NULL
        OR current_tier_id IS NULL;
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RAISE NOTICE 'Updated % instance subscriptions to use Starter tier (minimum 10 inspections)', affected_count;
END $$;

-- Step 2: Update any credit batches that reference 0-9 inspections
-- These should be updated to reference at least 10 inspections
-- (This is informational - credit batches are historical records, but we can note them)
DO $$
DECLARE
    affected_count INTEGER;
BEGIN
    -- Count batches with grantedQuantity < 10 that might be from "No Tier" subscriptions
    SELECT COUNT(*) INTO affected_count
    FROM credit_batches
    WHERE granted_quantity < 10 
      AND grant_source = 'plan_inclusion';
    
    RAISE NOTICE 'Found % credit batches with quantity < 10 (historical records - no changes needed)', affected_count;
END $$;

-- Step 3: Verify all active subscriptions have at least 10 inspections
-- This is a validation query - should return 0 rows
SELECT 
    id,
    organization_id,
    inspection_quota_included,
    current_tier_id,
    (SELECT name FROM subscription_tiers WHERE id = current_tier_id) as tier_name
FROM instance_subscriptions
WHERE 
    inspection_quota_included < 10 
    OR inspection_quota_included IS NULL
    OR current_tier_id IS NULL;

-- If the above query returns any rows, those need to be fixed manually
-- Expected result: 0 rows (all subscriptions should have tier and >= 10 inspections)

-- Step 4: Clean up any orphaned data (optional - for reference only)
-- Note: We don't delete historical data, but we can verify there are no active "No Tier" subscriptions

-- Verification: Check that all active subscriptions have valid tiers
SELECT 
    COUNT(*) as total_subscriptions,
    COUNT(CASE WHEN current_tier_id IS NOT NULL THEN 1 END) as with_tier,
    COUNT(CASE WHEN inspection_quota_included >= 10 THEN 1 END) as with_min_inspections,
    COUNT(CASE WHEN current_tier_id IS NOT NULL AND inspection_quota_included >= 10 THEN 1 END) as valid_subscriptions
FROM instance_subscriptions
WHERE subscription_status = 'active';

-- Expected: All counts should match (all active subscriptions should be valid)

-- ============================================================================
-- Summary
-- ============================================================================
-- After running this migration:
-- 1. All instance_subscriptions will have current_tier_id set (Starter tier minimum)
-- 2. All inspection_quota_included values will be >= 10
-- 3. Historical credit batches remain unchanged (they're historical records)
-- 4. The application code enforces minimum 10 inspections going forward

