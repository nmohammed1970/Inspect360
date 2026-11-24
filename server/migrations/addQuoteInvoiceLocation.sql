-- Snapshot property (site) + block on quotes/invoices for historical listing.
-- Run as creativecloud on Contabo:
-- Dev:  docker exec -it postgres psql -U creativecloud -d inspect360_dev
-- Prod: docker exec -it postgres psql -U creativecloud -d inspect360

ALTER TABLE maintenance_quotes ADD COLUMN IF NOT EXISTS property_id varchar;
ALTER TABLE maintenance_quotes ADD COLUMN IF NOT EXISTS block_id varchar;

ALTER TABLE maintenance_invoices ADD COLUMN IF NOT EXISTS property_id varchar;
ALTER TABLE maintenance_invoices ADD COLUMN IF NOT EXISTS block_id varchar;

CREATE INDEX IF NOT EXISTS maintenance_quotes_org_property_idx
  ON maintenance_quotes (organization_id, property_id);
CREATE INDEX IF NOT EXISTS maintenance_quotes_org_block_idx
  ON maintenance_quotes (organization_id, block_id);
CREATE INDEX IF NOT EXISTS maintenance_invoices_org_property_idx
  ON maintenance_invoices (organization_id, property_id);
CREATE INDEX IF NOT EXISTS maintenance_invoices_org_block_idx
  ON maintenance_invoices (organization_id, block_id);

-- Backfill from current WO → maintenance request (+ property.block when MR block is null)
UPDATE maintenance_quotes q
SET
  property_id = mr.property_id,
  block_id = COALESCE(mr.block_id, p.block_id)
FROM work_orders wo
JOIN maintenance_requests mr ON mr.id = wo.maintenance_request_id
LEFT JOIN properties p ON p.id = mr.property_id
WHERE wo.id = q.work_order_id
  AND (q.property_id IS NULL OR q.block_id IS NULL);

UPDATE maintenance_invoices i
SET
  property_id = mr.property_id,
  block_id = COALESCE(mr.block_id, p.block_id)
FROM work_orders wo
JOIN maintenance_requests mr ON mr.id = wo.maintenance_request_id
LEFT JOIN properties p ON p.id = mr.property_id
WHERE wo.id = i.work_order_id
  AND (i.property_id IS NULL OR i.block_id IS NULL);
