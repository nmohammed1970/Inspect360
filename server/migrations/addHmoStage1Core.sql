-- HMO Stage 1 core: classification, licence evidence status, room UX fields, MR source.
-- Run as creativecloud on Contabo (inspect360_dev / inspect360).
--
-- Smoke acceptance (A/B/C-light/E/J):
-- A: Create/edit property as HMO or Unsure → HMO tab shows setup incomplete until
--    licence evidence status is ISSUED or NOT_REQUIRED (with note).
-- B: Licence max 5 + 6 active tenants → occupancy mismatch copy + optional MR from alert.
-- C-light: Add room with usable m² below 6.51 → save rooms → assess → room finding.
-- E: Licence expiry within renewal window → renewal alert on Alerts / dashboard.
-- J: Missing schedule/doc or SAF evidence → Evidence "Missing"/"Needs review", not auto-compliant.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS hmo_classification varchar(32);

ALTER TABLE hmo_property_profiles
  ADD COLUMN IF NOT EXISTS licence_evidence_status varchar(64) DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS licence_evidence_notes text;

ALTER TABLE hmo_room_profiles
  ADD COLUMN IF NOT EXISTS room_name varchar(256),
  ADD COLUMN IF NOT EXISTS sleeping_approved boolean DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'maintenance_source'
      AND e.enumlabel = 'hmo_finding'
  ) THEN
    ALTER TYPE maintenance_source ADD VALUE 'hmo_finding';
  END IF;
END $$;
