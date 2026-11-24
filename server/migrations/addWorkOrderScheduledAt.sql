-- Work order visit schedule (technician Schedule Job after quote accepted).
-- Run as creativecloud on Contabo:
-- Dev:  docker exec -it postgres psql -U creativecloud -d inspect360_dev
-- Prod: docker exec -it postgres psql -U creativecloud -d inspect360

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP;
