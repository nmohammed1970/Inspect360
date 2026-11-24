-- Work order creator + quote/invoice recipient user (run as creativecloud on Contabo).
-- Dev:  docker exec -it postgres psql -U creativecloud -d inspect360_dev
-- Prod: docker exec -it postgres psql -U creativecloud -d inspect360

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS created_by varchar;

ALTER TABLE maintenance_quotes ADD COLUMN IF NOT EXISTS recipient_user_id varchar;

ALTER TABLE maintenance_invoices ADD COLUMN IF NOT EXISTS recipient_user_id varchar;
