-- HMO Stage 2 floor-plan bridge: measurement provenance + human confirm flags.
-- Run as creativecloud on Contabo (inspect360_dev / inspect360).

ALTER TABLE hmo_room_profiles
  ADD COLUMN IF NOT EXISTS measurement_source varchar(64) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS human_confirmed boolean DEFAULT true;
