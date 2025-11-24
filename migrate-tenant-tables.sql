-- Migration: Fix tenant_assignment_tags and tenancy_attachments tables
-- Run this script on your database to fix the missing table and column issues

-- 1. Create tenant_assignment_tags table if it doesn't exist
CREATE TABLE IF NOT EXISTS tenant_assignment_tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_assignment_id VARCHAR NOT NULL,
    tag_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for tenant_assignment_tags
CREATE INDEX IF NOT EXISTS tenant_assignment_tags_tenant_assignment_id_idx ON tenant_assignment_tags(tenant_assignment_id);
CREATE INDEX IF NOT EXISTS tenant_assignment_tags_tag_id_idx ON tenant_assignment_tags(tag_id);

-- 2. Fix tenancy_attachments table structure
DO $$ 
BEGIN
    -- Rename file_size_bytes to file_size if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenancy_attachments' 
        AND column_name = 'file_size_bytes'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenancy_attachments' 
        AND column_name = 'file_size'
    ) THEN
        ALTER TABLE tenancy_attachments RENAME COLUMN file_size_bytes TO file_size;
        RAISE NOTICE 'Renamed file_size_bytes to file_size';
    END IF;
    
    -- Add missing columns if they don't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenancy_attachments' 
        AND column_name = 'organization_id'
    ) THEN
        ALTER TABLE tenancy_attachments ADD COLUMN organization_id VARCHAR;
        RAISE NOTICE 'Added organization_id column';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenancy_attachments' 
        AND column_name = 'description'
    ) THEN
        ALTER TABLE tenancy_attachments ADD COLUMN description TEXT;
        RAISE NOTICE 'Added description column';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenancy_attachments' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE tenancy_attachments ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column';
    END IF;
    
    -- Make file_name NOT NULL if it's nullable
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenancy_attachments' 
        AND column_name = 'file_name'
        AND is_nullable = 'YES'
    ) THEN
        -- First set any NULL values to empty string, then make NOT NULL
        UPDATE tenancy_attachments SET file_name = '' WHERE file_name IS NULL;
        ALTER TABLE tenancy_attachments ALTER COLUMN file_name SET NOT NULL;
        RAISE NOTICE 'Made file_name NOT NULL';
    END IF;
    
    -- Update file_name length if needed (from VARCHAR(500) to VARCHAR(255))
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenancy_attachments' 
        AND column_name = 'file_name'
        AND character_maximum_length > 255
    ) THEN
        ALTER TABLE tenancy_attachments ALTER COLUMN file_name TYPE VARCHAR(255);
        RAISE NOTICE 'Updated file_name length to 255';
    END IF;
END $$;

-- Add indexes for tenancy_attachments if they don't exist
CREATE INDEX IF NOT EXISTS tenancy_attachments_tenant_assignment_id_idx ON tenancy_attachments(tenant_assignment_id);
CREATE INDEX IF NOT EXISTS tenancy_attachments_organization_id_idx ON tenancy_attachments(organization_id);

