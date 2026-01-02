-- Remove bundle pricing records where price is 0
-- This will effectively hide bundles with zero pricing from the marketplace

-- First, let's see what we're about to delete (for safety)
SELECT 
    bp.id,
    bp.bundle_id,
    mb.name AS bundle_name,
    bp.currency_code,
    bp.price_monthly,
    bp.price_annual
FROM bundle_pricing bp
JOIN module_bundles mb ON bp.bundle_id = mb.id
WHERE bp.price_monthly = 0 OR bp.price_annual = 0;

-- Delete bundle pricing records where monthly or annual price is 0
DELETE FROM bundle_pricing
WHERE price_monthly = 0 OR price_annual = 0;

-- Optional: If you also want to deactivate the bundles themselves (instead of just removing pricing)
-- Uncomment the following lines:
-- UPDATE module_bundles
-- SET is_active = FALSE
-- WHERE id IN (
--     SELECT DISTINCT bundle_id 
--     FROM bundle_pricing 
--     WHERE price_monthly = 0 OR price_annual = 0
-- );

