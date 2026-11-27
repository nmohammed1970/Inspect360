-- Tracks that the team member has been emailed about an expired profile document.
-- A later save with a future expiry date clears this so the next expiry can notify again.
--
-- Development:
--   docker exec -it postgres psql -U creativecloud -d inspect360_dev
-- Production:
--   docker exec -it postgres psql -U creativecloud -d inspect360

ALTER TABLE user_documents
  ADD COLUMN IF NOT EXISTS expiry_notified_at TIMESTAMP;
