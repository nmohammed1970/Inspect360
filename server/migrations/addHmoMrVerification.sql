-- HMO MR verification gate (Guide Steps 6–7). Run as creativecloud on Contabo.

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS verification_status varchar(64) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS verified_at timestamp,
  ADD COLUMN IF NOT EXISTS verified_by varchar,
  ADD COLUMN IF NOT EXISTS verification_notes text;

ALTER TABLE hmo_room_profiles
  ADD COLUMN IF NOT EXISTS measurement_source varchar(64) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS human_confirmed boolean DEFAULT true;
