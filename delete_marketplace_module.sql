-- Delete marketplace module and all related records
-- Module ID: '749f8b13-394c-48ae-b5f5-49e2ad617200' (Fundraising)

-- First, check what related records exist (for safety)
SELECT 'bundle_modules_junction' as table_name, COUNT(*) as count
FROM bundle_modules_junction
WHERE module_id = '749f8b13-394c-48ae-b5f5-49e2ad617200'
UNION ALL
SELECT 'instance_modules', COUNT(*)
FROM instance_modules
WHERE module_id = '749f8b13-394c-48ae-b5f5-49e2ad617200'
UNION ALL
SELECT 'module_pricing', COUNT(*)
FROM module_pricing
WHERE module_id = '749f8b13-394c-48ae-b5f5-49e2ad617200'
UNION ALL
SELECT 'module_limits', COUNT(*)
FROM module_limits
WHERE module_id = '749f8b13-394c-48ae-b5f5-49e2ad617200'
UNION ALL
SELECT 'instance_module_overrides', COUNT(*)
FROM instance_module_overrides
WHERE module_id = '749f8b13-394c-48ae-b5f5-49e2ad617200';

-- Delete related records first (in correct order due to foreign key constraints)
BEGIN;

-- 1. Delete from bundle_modules_junction (junction table)
DELETE FROM bundle_modules_junction
WHERE module_id = '749f8b13-394c-48ae-b5f5-49e2ad617200';

-- 2. Delete from instance_module_overrides
DELETE FROM instance_module_overrides
WHERE module_id = '749f8b13-394c-48ae-b5f5-49e2ad617200';

-- 3. Delete from instance_modules
DELETE FROM instance_modules
WHERE module_id = '749f8b13-394c-48ae-b5f5-49e2ad617200';

-- 4. Delete from module_limits
DELETE FROM module_limits
WHERE module_id = '749f8b13-394c-48ae-b5f5-49e2ad617200';

-- 5. Delete from module_pricing
DELETE FROM module_pricing
WHERE module_id = '749f8b13-394c-48ae-b5f5-49e2ad617200';

-- 6. Finally, delete the module itself
DELETE FROM marketplace_modules
WHERE id = '749f8b13-394c-48ae-b5f5-49e2ad617200';

-- Review the changes before committing
-- If everything looks good, uncomment the next line:
-- COMMIT;

-- If something went wrong, you can rollback:
-- ROLLBACK;

