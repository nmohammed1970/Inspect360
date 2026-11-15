-- Trial bonus: 2 inspection credits + 10 SMS credits
UPDATE billing_platform_config
SET value = '2', updated_at = NOW()
WHERE key = 'trial_inspection_credits';

UPDATE billing_platform_config
SET value = '10', updated_at = NOW()
WHERE key = 'trial_sms_credits';

INSERT INTO billing_platform_config (key, value)
VALUES
  ('trial_inspection_credits', '2'),
  ('trial_sms_credits', '10')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = NOW();
