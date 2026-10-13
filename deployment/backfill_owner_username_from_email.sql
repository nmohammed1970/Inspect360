-- ============================================================
-- Backfill owner usernames that were stored as company name.
-- Run as creativecloud on Contabo (inspect360 or inspect360_dev).
-- Preview first, then UPDATE.
-- New registrations already use email|companyName.
-- ============================================================

-- Preview
SELECT
  u.id,
  u.email,
  u.username AS old_username,
  o.name AS org_name,
  lower(u.email) || '|' || o.name AS new_username
FROM users u
JOIN organizations o ON o.id = u.organization_id AND o.owner_id = u.id
WHERE u.username = o.name
ORDER BY u.created_at;

-- Apply (only when new_username is not already taken by another user)
BEGIN;

UPDATE users u
SET
  username = lower(u.email) || '|' || o.name,
  updated_at = NOW()
FROM organizations o
WHERE o.id = u.organization_id
  AND o.owner_id = u.id
  AND u.username = o.name
  AND NOT EXISTS (
    SELECT 1
    FROM users other
    WHERE other.username = lower(u.email) || '|' || o.name
      AND other.id <> u.id
  );

COMMIT;

-- Verify remaining collisions (should be empty)
SELECT u.id, u.email, u.username, o.name
FROM users u
JOIN organizations o ON o.id = u.organization_id AND o.owner_id = u.id
WHERE u.username = o.name;
