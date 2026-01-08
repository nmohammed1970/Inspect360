-- Add per-inspection price to tier_pricing and seed GBP values
ALTER TABLE tier_pricing
ADD COLUMN IF NOT EXISTS per_inspection_price INTEGER DEFAULT 0 NOT NULL;

-- Seed default GBP values for Starter, Growth, Professional, Enterprise
-- Assumes subscription_tiers table has codes: starter, growth, professional, enterprise
WITH tier_ids AS (
  SELECT id, code FROM subscription_tiers WHERE code IN ('starter','growth','professional','enterprise')
)
UPDATE tier_pricing tp
SET per_inspection_price = CASE t.code
  WHEN 'starter' THEN 1200  -- £12.00
  WHEN 'growth' THEN 1000   -- £10.00
  WHEN 'professional' THEN 900 -- £9.00
  WHEN 'enterprise' THEN 550  -- £5.50
  ELSE COALESCE(tp.per_inspection_price, 0)
END
FROM tier_ids t
WHERE tp.tier_id = t.id AND tp.currency_code = 'GBP';

-- Verify
SELECT tier_id, currency_code, price_monthly, price_annual, per_inspection_price
FROM tier_pricing
WHERE currency_code = 'GBP';


