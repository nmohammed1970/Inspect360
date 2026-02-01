# Database Migration Guide

## Quick Start

Use `DATABASE_MIGRATION_SQL_SIMPLE.sql` for a quick migration, or `DATABASE_MIGRATION_SQL.sql` for a complete migration with triggers and verification.

## What This Migration Adds

### 1. Soft Delete Support
- `deleted_at` column on all syncable tables
- Records are marked as deleted, not physically removed
- Filter with `WHERE deleted_at IS NULL` in queries

### 2. Server Timestamp Tracking
- `server_updated_at` column on all syncable tables
- Tracks when server last updated the record
- Used for conflict resolution and delta sync

### 3. Sync Metadata Table
- `sync_metadata` table tracks last sync time per resource type
- Used by mobile app for delta sync queries
- Prevents fetching all records on every sync

### 4. Indexes
- Indexes on `deleted_at` for efficient filtering
- Indexes on `server_updated_at` for delta sync queries
- Composite indexes for optimized queries

## Table Names

The migration assumes these table names:
- `inspections`
- `inspection_entries`
- `inspection_photos`

**If your table names are different**, update the SQL accordingly.

## Column Names

The migration assumes these columns exist:
- `updated_at` (used to initialize `server_updated_at`)
- `created_at` (used as fallback for photos)

**If your columns are named differently**, update the SQL accordingly.

## After Migration

### 1. Update API Endpoints

Add delta sync support:
```typescript
// GET /api/inspections?updated_after=TIMESTAMP
// GET /api/inspections/{id}/entries?updated_after=TIMESTAMP
```

### 2. Update Queries

Filter deleted records:
```sql
SELECT * FROM inspections 
WHERE deleted_at IS NULL;
```

### 3. Update Create/Update Logic

Set `server_updated_at` on every create/update:
```typescript
await db.update({
  ...data,
  server_updated_at: new Date(),
  updated_at: new Date(), // Also update updated_at
});
```

### 4. Soft Delete Instead of Hard Delete

```typescript
// Instead of: DELETE FROM inspections WHERE id = ?
// Use:
await db.update({
  deleted_at: new Date(),
  updated_at: new Date(),
});
```

## Verification

After running the migration, verify:

```sql
-- Check columns were added
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'inspections' 
  AND column_name IN ('deleted_at', 'server_updated_at');

-- Check sync_metadata exists
SELECT * FROM sync_metadata;

-- Check indexes
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'inspections' 
  AND indexname LIKE '%deleted_at%';
```

## Rollback (if needed)

If you need to rollback:

```sql
-- Remove columns
ALTER TABLE inspections DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE inspections DROP COLUMN IF EXISTS server_updated_at;
ALTER TABLE inspection_entries DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE inspection_entries DROP COLUMN IF EXISTS server_updated_at;
ALTER TABLE inspection_photos DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE inspection_photos DROP COLUMN IF EXISTS server_updated_at;

-- Drop table
DROP TABLE IF EXISTS sync_metadata;

-- Drop indexes (they'll be dropped automatically with columns, but just in case)
DROP INDEX IF EXISTS idx_inspections_deleted_at;
DROP INDEX IF EXISTS idx_inspection_entries_deleted_at;
DROP INDEX IF EXISTS idx_inspection_photos_deleted_at;
DROP INDEX IF EXISTS idx_inspections_server_updated_at;
DROP INDEX IF EXISTS idx_inspection_entries_server_updated_at;
DROP INDEX IF EXISTS idx_inspection_photos_server_updated_at;
```

## Notes

- The migration uses `IF NOT EXISTS` so it's safe to run multiple times
- Existing data is preserved
- `server_updated_at` is initialized from `updated_at` for existing records
- Indexes use partial indexes (`WHERE deleted_at IS NULL`) for better performance

