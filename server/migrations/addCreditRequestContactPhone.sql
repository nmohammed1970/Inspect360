-- Purchase credits request: contact phone + allow unit counts from 1.

ALTER TABLE credit_requests
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);

ALTER TABLE credit_requests
  DROP CONSTRAINT IF EXISTS credit_requests_credits_requested_check;

ALTER TABLE credit_requests
  ADD CONSTRAINT credit_requests_credits_requested_check
  CHECK (credits_requested >= 1 AND credits_requested <= 100000);

-- Contabo only (app role). Skip if role does not exist locally:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON credit_requests TO inspect360;
