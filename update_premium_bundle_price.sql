-- Update Premium Bundle price to £450 per month
-- Annual price will be calculated dynamically based on discount_percentage (20%)

-- First, let's see the current Premium Bundle pricing
SELECT 
    mb.id as bundle_id,
    mb.name,
    mb.description,
    mb.discount_percentage,
    bp.currency_code,
    bp.price_monthly / 100.0 as monthly_price_gbp,
    bp.price_annual / 100.0 as annual_price_gbp,
    bp.savings_monthly / 100.0 as savings_monthly_gbp
FROM module_bundles mb
LEFT JOIN bundle_pricing bp ON mb.id = bp.bundle_id AND bp.currency_code = 'GBP'
WHERE mb.name = 'Premium Bundle'
ORDER BY mb.created_at;

-- Update Premium Bundle pricing to £450/month
-- Annual price calculation: (monthly * 12) * (1 - discount_percentage/100)
-- Example with 20% discount: (£450 * 12) * (1 - 20/100) = £5,400 * 0.8 = £4,320
-- Savings per month: (annual without discount - annual with discount) / 12
--                   = (£5,400 - £4,320) / 12 = £90 per month

UPDATE bundle_pricing
SET 
    price_monthly = 45000,  -- £450 in pence
    price_annual = (
        SELECT ROUND((45000 * 12) * (1 - COALESCE(mb.discount_percentage, 0) / 100.0))
        FROM module_bundles mb
        WHERE mb.id = bundle_pricing.bundle_id
    ),
    savings_monthly = (
        SELECT ROUND(((45000 * 12) - ((45000 * 12) * (1 - COALESCE(mb.discount_percentage, 0) / 100.0))) / 12)
        FROM module_bundles mb
        WHERE mb.id = bundle_pricing.bundle_id
    ),
    last_updated = NOW()
WHERE bundle_id IN (
    SELECT id FROM module_bundles WHERE name = 'Premium Bundle'
)
AND currency_code = 'GBP';

-- Verify the update
SELECT 
    mb.name,
    mb.discount_percentage || '%' as discount,
    bp.currency_code,
    bp.price_monthly / 100.0 as monthly_price_gbp,
    bp.price_annual / 100.0 as annual_price_gbp,
    bp.savings_monthly / 100.0 as savings_per_month_gbp,
    ROUND((bp.price_annual / 100.0) / 12, 2) as effective_monthly_price,
    bp.last_updated
FROM module_bundles mb
JOIN bundle_pricing bp ON mb.id = bp.bundle_id
WHERE mb.name = 'Premium Bundle' AND bp.currency_code = 'GBP';
