-- Optional SKU / part number on quote (and invoice) line items.

ALTER TABLE maintenance_quote_lines
  ADD COLUMN IF NOT EXISTS sku VARCHAR;

ALTER TABLE maintenance_invoice_lines
  ADD COLUMN IF NOT EXISTS sku VARCHAR;

-- Contabo: no new GRANT needed (tables already granted).
