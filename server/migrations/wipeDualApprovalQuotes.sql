-- Wipe dual-approval quote history (single-stage customer approval).
-- Keeps maintenance_quote_share_tokens table; only clears rows for wiped quotes.
-- Run as creativecloud on Contabo:
-- Dev:  docker exec -it postgres psql -U creativecloud -d inspect360_dev -f -
-- Prod: docker exec -it postgres psql -U creativecloud -d inspect360 -f -

DELETE FROM maintenance_quote_share_tokens;
DELETE FROM maintenance_quote_lines;
UPDATE maintenance_invoices SET quote_id = NULL WHERE quote_id IS NOT NULL;
DELETE FROM maintenance_quotes;
DELETE FROM work_order_events WHERE event_type LIKE 'quote_%';
