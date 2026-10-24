-- Allow inspections to be unassigned when a team member is hard-deleted.
-- Run as creativecloud on Contabo (inspect360 / inspect360_dev).

ALTER TABLE inspections
  ALTER COLUMN inspector_id DROP NOT NULL;
