-- Widen for manual reminder keys like "manual-<timestamp>" (~20 chars).
-- Contabo (as creativecloud):
--   docker exec -it postgres psql -U creativecloud -d inspect360_dev
--   or production: ... -d inspect360
ALTER TABLE rent_reminder_log
  ALTER COLUMN scheduled_for_date TYPE VARCHAR(40);
