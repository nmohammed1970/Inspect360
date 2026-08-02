-- Add EUR to Postgres enum `currency` (preferred_currency, etc.)
-- Safe to re-run on Postgres 15+ (IF NOT EXISTS).
--
-- Contabo (Docker):
--   docker exec -i postgres psql -U inspect360 -d inspect360 < deployment/add_currency_eur.sql
--
-- Or interactive:
--   docker exec -it postgres psql -U inspect360 -d inspect360
--   then paste the ALTER below.
--
-- Verify:
--   SELECT enumlabel FROM pg_enum e
--   JOIN pg_type t ON t.oid = e.enumtypid
--   WHERE t.typname = 'currency'
--   ORDER BY enumsortorder;

ALTER TYPE currency ADD VALUE IF NOT EXISTS 'EUR';
