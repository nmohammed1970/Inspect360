-- Team-based WO assignment: status while awaiting first team-member accept.
-- Run as creativecloud on Contabo (inspect360_dev / inspect360).

ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'pending_acceptance';

-- GRANT unchanged (enum only).
