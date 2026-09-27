-- Platform admin self-serve password reset (same model as users.reset_token).

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS reset_token VARCHAR;

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP;

-- Contabo only (app role). Skip if role does not exist locally:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON admin_users TO inspect360;
