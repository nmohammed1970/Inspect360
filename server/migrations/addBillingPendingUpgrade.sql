-- Pending upgrade fields: local plan stays on old tier until proration invoice is paid.

ALTER TABLE billing_subscriptions
  ADD COLUMN IF NOT EXISTS pending_plan_code VARCHAR(64),
  ADD COLUMN IF NOT EXISTS pending_cycle VARCHAR(16),
  ADD COLUMN IF NOT EXISTS pending_amount_minor INTEGER,
  ADD COLUMN IF NOT EXISTS pending_price_version_id VARCHAR;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inspect360') THEN
    -- columns inherit table grants; no extra GRANT needed for ALTER ADD COLUMN
    NULL;
  END IF;
END
$$;
