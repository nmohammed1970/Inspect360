# Fix All Database and Error Issues

## 🔴 CRITICAL: Run These SQL Queries in pgAdmin

**You MUST run all the SQL queries below in pgAdmin to fix the database errors.**

### Steps:
1. Open **pgAdmin**
2. Connect to your **Inspect360** database
3. Right-click on the database → **Query Tool**
4. Copy and paste the **ENTIRE** contents of `ADD_MISSING_COLUMNS.sql`
5. Click **Execute** (F5)

### What This Fixes:
- ✅ `onboarding_completed` column in `users` table
- ✅ `default_ai_max_words` and `default_ai_instruction` in `organizations` table
- ✅ `ai_max_words` and `ai_instruction` in `inspection_templates` table
- ✅ `ai_analysis_status`, `ai_analysis_progress`, `ai_analysis_total_fields`, `ai_analysis_error` in `inspections` table
- ✅ `comparison_item_status` enum and `status` column in `comparison_report_items` table
- ✅ `author_name` and `author_role` in `comparison_comments` table

---

## 📋 Complete SQL Script (Copy This Entire Block)

```sql
-- =============================================================================
-- SQL Queries to Add Missing Columns to Inspect360 Database
-- Run these queries in pgAdmin to fix the database schema
-- =============================================================================

-- 1. Add onboarding_completed column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add missing columns to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS default_ai_max_words INTEGER DEFAULT 150;

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS default_ai_instruction TEXT;

-- 3. Add missing columns to inspection_templates table
ALTER TABLE inspection_templates 
ADD COLUMN IF NOT EXISTS ai_max_words INTEGER DEFAULT 150;

ALTER TABLE inspection_templates 
ADD COLUMN IF NOT EXISTS ai_instruction TEXT;

-- 4. Add missing columns to inspections table
ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS ai_analysis_status VARCHAR DEFAULT 'idle';

ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS ai_analysis_progress INTEGER DEFAULT 0;

ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS ai_analysis_total_fields INTEGER DEFAULT 0;

ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS ai_analysis_error TEXT;

-- 5. Create comparison_item_status enum if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comparison_item_status') THEN
        CREATE TYPE comparison_item_status AS ENUM ('pending', 'reviewed', 'disputed', 'resolved', 'waived');
    END IF;
END $$;

-- 6. Add status column to comparison_report_items table
ALTER TABLE comparison_report_items 
ADD COLUMN IF NOT EXISTS status comparison_item_status NOT NULL DEFAULT 'pending';

-- 7. Add missing columns to comparison_comments table
ALTER TABLE comparison_comments 
ADD COLUMN IF NOT EXISTS author_name VARCHAR;

ALTER TABLE comparison_comments 
ADD COLUMN IF NOT EXISTS author_role VARCHAR;
```

---

## ✅ What's Already Fixed in Code

### 1. Database Schema File
- ✅ All missing columns have been added to `database_schema.sql`
- ✅ Both in CREATE TABLE statements and ADD MISSING COLUMNS section

### 2. ObjectNotFoundError Handling
- ✅ Improved error handling in `server/routes.ts`
- ✅ ObjectNotFoundError (404 cases) no longer spam the console
- ✅ Only unexpected errors are logged

---

## 🚀 After Running SQL Queries

1. **Restart your server** (stop and start `npm run dev`)
2. All database errors should be resolved
3. ObjectNotFoundError messages will be quieter (only unexpected errors logged)

---

## 🔍 Verification (Optional)

After running the SQL, you can verify columns were added:

```sql
-- Check users table
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'onboarding_completed';

-- Check organizations table
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'organizations' 
AND column_name IN ('default_ai_max_words', 'default_ai_instruction');

-- Check inspection_templates table
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'inspection_templates' 
AND column_name IN ('ai_max_words', 'ai_instruction');

-- Check inspections table
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'inspections' 
AND column_name IN ('ai_analysis_status', 'ai_analysis_progress', 'ai_analysis_total_fields', 'ai_analysis_error');
```

---

## 📝 Notes

- The `ObjectNotFoundError` messages you saw are normal - they occur when the app tries to access files that don't exist (like deleted images). This is now handled more gracefully.
- All database schema changes are documented in `database_schema.sql` for future reference.
- The `ADD_MISSING_COLUMNS.sql` file contains all the queries you need to run.

