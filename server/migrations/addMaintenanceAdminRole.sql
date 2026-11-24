-- Add maintenance_admin to user_role enum (run as creativecloud on Contabo).
-- Dev:  docker exec -it postgres psql -U creativecloud -d inspect360_dev
-- Prod: docker exec -it postgres psql -U creativecloud -d inspect360

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'maintenance_admin';
