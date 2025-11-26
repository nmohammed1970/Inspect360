-- Inspect360 PostgreSQL Database Schema (Idempotent Version)
-- Generated from shared/schema.ts
-- This script can be run multiple times safely - it will create missing tables/columns/indexes
-- and skip existing ones without errors

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== ENUMS ====================
-- Create ENUMs only if they don't exist

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('owner', 'clerk', 'compliance', 'tenant', 'contractor');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspection_status') THEN
        CREATE TYPE inspection_status AS ENUM ('scheduled', 'in_progress', 'completed', 'reviewed');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspection_type') THEN
        CREATE TYPE inspection_type AS ENUM ('check_in', 'check_out', 'routine', 'maintenance');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'compliance_status') THEN
        CREATE TYPE compliance_status AS ENUM ('current', 'expiring_soon', 'expired');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'maintenance_status') THEN
        CREATE TYPE maintenance_status AS ENUM ('open', 'in_progress', 'completed', 'closed');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
        CREATE TYPE subscription_status AS ENUM ('active', 'inactive', 'cancelled');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_level') THEN
        CREATE TYPE subscription_level AS ENUM ('free', 'starter', 'professional', 'enterprise');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_order_status') THEN
        CREATE TYPE work_order_status AS ENUM ('assigned', 'in_progress', 'waiting_parts', 'completed', 'rejected');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_condition') THEN
        CREATE TYPE asset_condition AS ENUM ('excellent', 'good', 'fair', 'poor', 'needs_replacement');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspection_point_data_type') THEN
        CREATE TYPE inspection_point_data_type AS ENUM ('text', 'number', 'checkbox', 'photo', 'rating');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'condition_rating') THEN
        CREATE TYPE condition_rating AS ENUM ('excellent', 'good', 'fair', 'poor', 'not_applicable');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cleanliness_rating') THEN
        CREATE TYPE cleanliness_rating AS ENUM ('very_clean', 'clean', 'acceptable', 'needs_cleaning', 'not_applicable');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_type') THEN
        CREATE TYPE contact_type AS ENUM ('internal', 'contractor', 'lead', 'company', 'partner', 'vendor', 'tenant', 'other');
    ELSE
        -- Add 'tenant' to existing enum if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum 
            WHERE enumlabel = 'tenant' 
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'contact_type')
        ) THEN
            ALTER TYPE contact_type ADD VALUE 'tenant';
        END IF;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'template_scope') THEN
        CREATE TYPE template_scope AS ENUM ('block', 'property', 'both');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'field_type') THEN
        CREATE TYPE field_type AS ENUM ('short_text', 'long_text', 'number', 'select', 'multiselect', 'boolean', 'rating', 'date', 'time', 'datetime', 'photo', 'photo_array', 'video', 'gps', 'signature');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'maintenance_source') THEN
        CREATE TYPE maintenance_source AS ENUM ('manual', 'inspection', 'tenant_portal', 'routine');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comparison_report_status') THEN
        CREATE TYPE comparison_report_status AS ENUM ('draft', 'under_review', 'awaiting_signatures', 'signed', 'filed');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comparison_item_status') THEN
        CREATE TYPE comparison_item_status AS ENUM ('pending', 'reviewed', 'disputed', 'resolved', 'waived');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'currency') THEN
        CREATE TYPE currency AS ENUM ('GBP', 'USD', 'AED');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_code') THEN
        CREATE TYPE plan_code AS ENUM ('starter', 'professional', 'enterprise', 'enterprise_plus');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credit_source') THEN
        CREATE TYPE credit_source AS ENUM ('plan_inclusion', 'topup', 'admin_grant', 'refund', 'adjustment', 'consumption', 'expiry');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'topup_status') THEN
        CREATE TYPE topup_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
    END IF;
END $$;

-- ==================== HELPER FUNCTION ====================
-- Function to add column if it doesn't exist
CREATE OR REPLACE FUNCTION add_column_if_not_exists(
    p_table_name TEXT,
    p_column_name TEXT,
    p_column_definition TEXT
) RETURNS VOID AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public'
        AND table_name = p_table_name 
        AND column_name = p_column_name
    ) THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', p_table_name, p_column_name, p_column_definition);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ==================== TABLES ====================

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR PRIMARY KEY,
    sess JSONB NOT NULL,
    expire TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS IDX_session_expire ON sessions(expire);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    username VARCHAR UNIQUE NOT NULL,
    password VARCHAR NOT NULL,
    email VARCHAR UNIQUE NOT NULL,
    first_name VARCHAR,
    last_name VARCHAR,
    profile_image_url VARCHAR,
    phone VARCHAR,
    address JSONB,
    skills TEXT[],
    education TEXT,
    certificate_urls TEXT[],
    role user_role NOT NULL DEFAULT 'owner',
    organization_id VARCHAR,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
    reset_token VARCHAR,
    reset_token_expiry TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Admin Users table
CREATE TABLE IF NOT EXISTS admin_users (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    email VARCHAR UNIQUE NOT NULL,
    password VARCHAR NOT NULL,
    first_name VARCHAR NOT NULL,
    last_name VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name VARCHAR NOT NULL,
    owner_id VARCHAR NOT NULL,
    stripe_customer_id VARCHAR,
    subscription_status subscription_status DEFAULT 'inactive',
    subscription_level subscription_level DEFAULT 'free',
    country_code VARCHAR(2) DEFAULT 'GB',
    current_plan_id VARCHAR,
    trial_end_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    credits_remaining INTEGER DEFAULT 5,
    default_ai_max_words INTEGER DEFAULT 150,
    default_ai_instruction TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    type contact_type NOT NULL DEFAULT 'other',
    first_name VARCHAR NOT NULL,
    last_name VARCHAR NOT NULL,
    email VARCHAR,
    phone VARCHAR,
    country_code VARCHAR DEFAULT '+1',
    company_name VARCHAR,
    job_title VARCHAR,
    address TEXT,
    city VARCHAR,
    state VARCHAR,
    postal_code VARCHAR,
    country VARCHAR,
    website VARCHAR,
    notes TEXT,
    profile_image_url VARCHAR,
    tags TEXT[],
    linked_user_id VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Blocks table
CREATE TABLE IF NOT EXISTS blocks (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    address TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Properties table
CREATE TABLE IF NOT EXISTS properties (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    block_id VARCHAR,
    name VARCHAR NOT NULL,
    address TEXT NOT NULL,
    sqft INTEGER,
    fixflo_property_id VARCHAR,
    fixflo_synced_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tenant Assignments table
CREATE TABLE IF NOT EXISTS tenant_assignments (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    tenant_id VARCHAR NOT NULL,
    property_id VARCHAR NOT NULL,
    lease_start_date TIMESTAMP,
    lease_end_date TIMESTAMP,
    monthly_rent NUMERIC(10, 2),
    deposit_amount NUMERIC(10, 2),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    next_of_kin_name VARCHAR(255),
    next_of_kin_phone VARCHAR(50),
    next_of_kin_email VARCHAR(255),
    next_of_kin_relationship VARCHAR(100),
    has_portal_access BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Inspection Categories table
CREATE TABLE IF NOT EXISTS inspection_categories (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Template Categories table
CREATE TABLE IF NOT EXISTS template_categories (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    description TEXT,
    color VARCHAR DEFAULT '#5AB5E8',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Inspection Templates table
CREATE TABLE IF NOT EXISTS inspection_templates (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    description TEXT,
    scope template_scope NOT NULL DEFAULT 'property',
    version INTEGER NOT NULL DEFAULT 1,
    parent_template_id VARCHAR,
    is_active BOOLEAN DEFAULT TRUE,
    structure_json JSONB NOT NULL,
    category_id VARCHAR,
    ai_max_words INTEGER DEFAULT 150,
    ai_instruction TEXT,
    created_by VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Template Inventory Links table
CREATE TABLE IF NOT EXISTS template_inventory_links (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    template_id VARCHAR NOT NULL,
    inventory_template_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS template_inventory_links_template_id_idx ON template_inventory_links(template_id);

-- Inspection Template Points table
CREATE TABLE IF NOT EXISTS inspection_template_points (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    template_id VARCHAR NOT NULL,
    category_id VARCHAR,
    name VARCHAR NOT NULL,
    description TEXT,
    data_type inspection_point_data_type NOT NULL DEFAULT 'text',
    requires_condition_rating BOOLEAN DEFAULT TRUE,
    requires_cleanliness_rating BOOLEAN DEFAULT TRUE,
    requires_photo BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Inspections table
CREATE TABLE IF NOT EXISTS inspections (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    template_id VARCHAR,
    template_version INTEGER,
    template_snapshot_json JSONB,
    inventory_snapshot_json JSONB,
    block_id VARCHAR,
    property_id VARCHAR,
    inspector_id VARCHAR NOT NULL,
    type inspection_type NOT NULL,
    status inspection_status NOT NULL DEFAULT 'scheduled',
    scheduled_date TIMESTAMP,
    started_at TIMESTAMP,
    completed_date TIMESTAMP,
    submitted_at TIMESTAMP,
    notes TEXT,
    ai_analysis_status VARCHAR DEFAULT 'idle',
    ai_analysis_progress INTEGER DEFAULT 0,
    ai_analysis_total_fields INTEGER DEFAULT 0,
    ai_analysis_error TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inspections_organization_id_idx ON inspections(organization_id);

-- Inspection Items table
CREATE TABLE IF NOT EXISTS inspection_items (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    inspection_id VARCHAR NOT NULL,
    category_id VARCHAR,
    category VARCHAR NOT NULL,
    item_name VARCHAR NOT NULL,
    photo_url TEXT,
    condition_rating INTEGER,
    notes TEXT,
    ai_analysis TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Inspection Responses table
CREATE TABLE IF NOT EXISTS inspection_responses (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    inspection_id VARCHAR NOT NULL,
    template_point_id VARCHAR NOT NULL,
    asset_inventory_id VARCHAR,
    condition_rating condition_rating,
    cleanliness_rating cleanliness_rating,
    text_value TEXT,
    number_value INTEGER,
    checkbox_value BOOLEAN,
    photo_url TEXT,
    notes TEXT,
    ai_analysis TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Inspection Entries table
CREATE TABLE IF NOT EXISTS inspection_entries (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    inspection_id VARCHAR NOT NULL,
    section_ref TEXT NOT NULL,
    item_ref TEXT,
    field_key VARCHAR NOT NULL,
    field_type field_type NOT NULL,
    value_json JSONB,
    note TEXT,
    photos TEXT[],
    videos TEXT[],
    maintenance_flag BOOLEAN DEFAULT FALSE,
    marked_for_review BOOLEAN DEFAULT FALSE,
    asset_inventory_id VARCHAR,
    defects_json JSONB,
    offline_id VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inspection_entries_inspection_id_idx ON inspection_entries(inspection_id);
CREATE INDEX IF NOT EXISTS inspection_entries_offline_id_idx ON inspection_entries(offline_id);

-- AI Image Analyses table
CREATE TABLE IF NOT EXISTS ai_image_analyses (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    inspection_entry_id VARCHAR,
    inspection_id VARCHAR,
    media_url TEXT NOT NULL,
    media_type VARCHAR NOT NULL DEFAULT 'photo',
    model VARCHAR NOT NULL DEFAULT 'gpt-4o',
    result_json JSONB,
    confidence INTEGER,
    detections_json JSONB,
    annotations_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_image_analyses_entry_id_idx ON ai_image_analyses(inspection_entry_id);
CREATE INDEX IF NOT EXISTS ai_image_analyses_inspection_id_idx ON ai_image_analyses(inspection_id);

-- Compliance Documents table
CREATE TABLE IF NOT EXISTS compliance_documents (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    property_id VARCHAR,
    block_id VARCHAR,
    document_type VARCHAR NOT NULL,
    document_url TEXT NOT NULL,
    expiry_date TIMESTAMP,
    status compliance_status NOT NULL DEFAULT 'current',
    uploaded_by VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Maintenance Requests table
CREATE TABLE IF NOT EXISTS maintenance_requests (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    property_id VARCHAR NOT NULL,
    reported_by VARCHAR NOT NULL,
    assigned_to VARCHAR,
    title VARCHAR NOT NULL,
    description TEXT,
    status maintenance_status NOT NULL DEFAULT 'open',
    priority VARCHAR NOT NULL DEFAULT 'medium',
    photo_urls TEXT[],
    ai_suggested_fixes TEXT,
    ai_analysis_json JSONB,
    source maintenance_source NOT NULL DEFAULT 'manual',
    inspection_id VARCHAR,
    inspection_entry_id VARCHAR,
    fixflo_issue_id VARCHAR,
    fixflo_job_id VARCHAR,
    fixflo_status VARCHAR,
    fixflo_contractor_name VARCHAR,
    fixflo_synced_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tenant Maintenance Chats table
CREATE TABLE IF NOT EXISTS tenant_maintenance_chats (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    tenant_id VARCHAR NOT NULL,
    property_id VARCHAR NOT NULL,
    maintenance_request_id VARCHAR,
    title VARCHAR NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tenant Maintenance Chat Messages table
CREATE TABLE IF NOT EXISTS tenant_maintenance_chat_messages (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    chat_id VARCHAR NOT NULL,
    role VARCHAR NOT NULL,
    content TEXT NOT NULL,
    image_url VARCHAR,
    ai_suggested_fixes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Comparison Reports table
CREATE TABLE IF NOT EXISTS comparison_reports (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    property_id VARCHAR NOT NULL,
    check_in_inspection_id VARCHAR NOT NULL,
    check_out_inspection_id VARCHAR NOT NULL,
    tenant_id VARCHAR,
    status comparison_report_status NOT NULL DEFAULT 'draft',
    total_estimated_cost NUMERIC(10, 2) DEFAULT '0',
    ai_analysis_json JSONB,
    item_comparisons JSONB,
    generated_by VARCHAR NOT NULL,
    generated_at TIMESTAMP DEFAULT NOW(),
    operator_signature VARCHAR,
    operator_signed_at TIMESTAMP,
    operator_ip_address VARCHAR,
    tenant_signature VARCHAR,
    tenant_signed_at TIMESTAMP,
    tenant_ip_address VARCHAR,
    filed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comparison_reports_organization_id_idx ON comparison_reports(organization_id);
CREATE INDEX IF NOT EXISTS comparison_reports_property_id_idx ON comparison_reports(property_id);
CREATE INDEX IF NOT EXISTS comparison_reports_check_out_inspection_id_idx ON comparison_reports(check_out_inspection_id);

-- Comparison Report Items table
CREATE TABLE IF NOT EXISTS comparison_report_items (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    comparison_report_id VARCHAR NOT NULL,
    check_in_entry_id VARCHAR,
    check_out_entry_id VARCHAR NOT NULL,
    section_ref TEXT NOT NULL,
    item_ref TEXT,
    field_key VARCHAR NOT NULL,
    ai_comparison_json JSONB,
    estimated_cost NUMERIC(10, 2),
    depreciation NUMERIC(10, 2),
    final_cost NUMERIC(10, 2),
    liability_decision VARCHAR,
    liability_notes TEXT,
    status comparison_item_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comparison_report_items_report_id_idx ON comparison_report_items(comparison_report_id);

-- Comparison Comments table
CREATE TABLE IF NOT EXISTS comparison_comments (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    comparison_report_id VARCHAR NOT NULL,
    comparison_report_item_id VARCHAR,
    user_id VARCHAR NOT NULL,
    author_name VARCHAR,
    author_role VARCHAR,
    content TEXT NOT NULL,
    attachments TEXT[],
    is_internal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comparison_comments_report_id_idx ON comparison_comments(comparison_report_id);
CREATE INDEX IF NOT EXISTS comparison_comments_item_id_idx ON comparison_comments(comparison_report_item_id);

-- Credit Transactions table
CREATE TABLE IF NOT EXISTS credit_transactions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    amount INTEGER NOT NULL,
    type VARCHAR NOT NULL,
    description TEXT,
    related_id VARCHAR,
    created_by VARCHAR,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Inventory Templates table
CREATE TABLE IF NOT EXISTS inventory_templates (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    description TEXT,
    schema JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Inventories table
CREATE TABLE IF NOT EXISTS inventories (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    property_id VARCHAR NOT NULL,
    template_id VARCHAR,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Inventory Items table
CREATE TABLE IF NOT EXISTS inventory_items (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    inventory_id VARCHAR NOT NULL,
    path TEXT NOT NULL,
    item_name VARCHAR NOT NULL,
    baseline_condition INTEGER,
    baseline_cleanliness INTEGER,
    baseline_photos TEXT[],
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Work Orders table
CREATE TABLE IF NOT EXISTS work_orders (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    maintenance_request_id VARCHAR NOT NULL,
    team_id VARCHAR,
    contractor_id VARCHAR,
    status work_order_status NOT NULL DEFAULT 'assigned',
    sla_due TIMESTAMP,
    cost_estimate INTEGER,
    cost_actual INTEGER,
    variation_notes TEXT,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Work Logs table
CREATE TABLE IF NOT EXISTS work_logs (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    work_order_id VARCHAR NOT NULL,
    note TEXT NOT NULL,
    photos TEXT[],
    time_spent_minutes INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Asset Inventory table
CREATE TABLE IF NOT EXISTS asset_inventory (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    property_id VARCHAR,
    block_id VARCHAR,
    name VARCHAR NOT NULL,
    category VARCHAR,
    description TEXT,
    location VARCHAR,
    supplier VARCHAR,
    supplier_contact VARCHAR,
    serial_number VARCHAR,
    model_number VARCHAR,
    date_purchased TIMESTAMP,
    purchase_price NUMERIC(10, 2),
    warranty_expiry_date TIMESTAMP,
    condition asset_condition NOT NULL,
    cleanliness cleanliness_rating,
    expected_lifespan_years INTEGER,
    depreciation_per_year NUMERIC(10, 2),
    current_value NUMERIC(10, 2),
    last_maintenance_date TIMESTAMP,
    next_maintenance_date TIMESTAMP,
    maintenance_notes TEXT,
    photos TEXT[],
    documents TEXT[],
    inspection_id VARCHAR,
    inspection_entry_id VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Fixflo Config table
CREATE TABLE IF NOT EXISTS fixflo_config (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL UNIQUE,
    base_url VARCHAR NOT NULL DEFAULT 'https://api-sandbox.fixflo.com/api/v2',
    bearer_token VARCHAR,
    webhook_verify_token VARCHAR,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    last_health_check TIMESTAMP,
    health_check_status VARCHAR,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Fixflo Webhook Logs table
CREATE TABLE IF NOT EXISTS fixflo_webhook_logs (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    event_type VARCHAR NOT NULL,
    fixflo_issue_id VARCHAR,
    fixflo_job_id VARCHAR,
    payload_json JSONB NOT NULL,
    processing_status VARCHAR NOT NULL DEFAULT 'pending',
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fixflo_webhook_logs_organization_id_idx ON fixflo_webhook_logs(organization_id);
CREATE INDEX IF NOT EXISTS fixflo_webhook_logs_event_type_idx ON fixflo_webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS fixflo_webhook_logs_processing_status_idx ON fixflo_webhook_logs(processing_status);

-- Fixflo Sync State table
CREATE TABLE IF NOT EXISTS fixflo_sync_state (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    entity_type VARCHAR NOT NULL,
    last_sync_at TIMESTAMP,
    last_successful_sync_at TIMESTAMP,
    sync_status VARCHAR NOT NULL DEFAULT 'idle',
    error_message TEXT,
    records_synced INTEGER NOT NULL DEFAULT 0,
    records_failed INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fixflo_sync_state_organization_id_idx ON fixflo_sync_state(organization_id);

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    description TEXT,
    email VARCHAR,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS teams_organization_id_idx ON teams(organization_id);

-- Team Members table
CREATE TABLE IF NOT EXISTS team_members (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    team_id VARCHAR NOT NULL,
    user_id VARCHAR,
    contact_id VARCHAR,
    role VARCHAR DEFAULT 'member',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_members_team_id_idx ON team_members(team_id);
CREATE INDEX IF NOT EXISTS team_members_user_id_idx ON team_members(user_id);
CREATE INDEX IF NOT EXISTS team_members_contact_id_idx ON team_members(contact_id);

-- Team Categories table
CREATE TABLE IF NOT EXISTS team_categories (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    team_id VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_categories_team_id_idx ON team_categories(team_id);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    color VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tag join tables
CREATE TABLE IF NOT EXISTS block_tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    block_id VARCHAR NOT NULL,
    tag_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS property_tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    property_id VARCHAR NOT NULL,
    tag_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id VARCHAR NOT NULL,
    tag_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_document_tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    compliance_document_id VARCHAR NOT NULL,
    tag_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_inventory_tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    asset_inventory_id VARCHAR NOT NULL,
    tag_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_request_tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    maintenance_request_id VARCHAR NOT NULL,
    tag_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    contact_id VARCHAR NOT NULL,
    tag_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Dashboard Preferences table
CREATE TABLE IF NOT EXISTS dashboard_preferences (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id VARCHAR NOT NULL,
    enabled_panels JSONB NOT NULL DEFAULT '["stats", "inspections", "compliance", "maintenance"]'::JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Plans table
CREATE TABLE IF NOT EXISTS plans (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    code plan_code NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    monthly_price_gbp INTEGER NOT NULL,
    annual_price_gbp INTEGER,
    included_credits INTEGER NOT NULL,
    soft_cap INTEGER DEFAULT 5000,
    is_custom BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Country Pricing Overrides table
CREATE TABLE IF NOT EXISTS country_pricing_overrides (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    country_code VARCHAR(2) NOT NULL,
    plan_id VARCHAR NOT NULL,
    currency currency NOT NULL,
    monthly_price_minor_units INTEGER NOT NULL,
    included_credits_override INTEGER,
    topup_price_per_credit_minor_units INTEGER,
    active_from TIMESTAMP NOT NULL DEFAULT NOW(),
    active_to TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_country_pricing_country_plan ON country_pricing_overrides(country_code, plan_id);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    plan_snapshot_json JSONB NOT NULL,
    stripe_subscription_id VARCHAR UNIQUE,
    billing_cycle_anchor TIMESTAMP NOT NULL,
    current_period_start TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP NOT NULL,
    status subscription_status NOT NULL DEFAULT 'active',
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON subscriptions(current_period_end);

-- Credit Batches table
CREATE TABLE IF NOT EXISTS credit_batches (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    granted_quantity INTEGER NOT NULL,
    remaining_quantity INTEGER NOT NULL,
    grant_source credit_source NOT NULL,
    granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP,
    unit_cost_minor_units INTEGER,
    rolled BOOLEAN DEFAULT FALSE,
    metadata_json JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_batches_org_expires ON credit_batches(organization_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_credit_batches_org_granted ON credit_batches(organization_id, granted_at);

-- Credit Ledger table
CREATE TABLE IF NOT EXISTS credit_ledger (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    created_by VARCHAR,
    source credit_source NOT NULL,
    quantity INTEGER NOT NULL,
    batch_id VARCHAR,
    unit_cost_minor_units INTEGER,
    notes TEXT,
    linked_entity_type VARCHAR,
    linked_entity_id VARCHAR,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_org_created ON credit_ledger(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_batch ON credit_ledger(batch_id);

-- Topup Orders table
CREATE TABLE IF NOT EXISTS topup_orders (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    pack_size INTEGER NOT NULL,
    currency currency NOT NULL,
    unit_price_minor_units INTEGER NOT NULL,
    total_price_minor_units INTEGER NOT NULL,
    stripe_payment_intent_id VARCHAR,
    status topup_status NOT NULL DEFAULT 'pending',
    delivered_batch_id VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topup_orders_org ON topup_orders(organization_id);

-- Message Templates table
CREATE TABLE IF NOT EXISTS message_templates (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    description TEXT,
    variables TEXT[],
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Knowledge Base Documents table
CREATE TABLE IF NOT EXISTS knowledge_base_documents (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    title VARCHAR(500) NOT NULL,
    file_name VARCHAR(500) NOT NULL,
    file_url VARCHAR(1000) NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    extracted_text TEXT,
    category VARCHAR(255),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    uploaded_by VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_docs_active ON knowledge_base_documents(is_active);
CREATE INDEX IF NOT EXISTS idx_kb_docs_category ON knowledge_base_documents(category);

-- Chat Conversations table
CREATE TABLE IF NOT EXISTS chat_conversations (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    user_id VARCHAR NOT NULL,
    title VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_org ON chat_conversations(organization_id);

-- Chat Messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    conversation_id VARCHAR NOT NULL,
    role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    source_docs TEXT[],
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);

-- ==================== ADD MISSING COLUMNS ====================
-- This section adds columns that might have been added later to existing tables

-- Add created_by column to credit_transactions if it doesn't exist
SELECT add_column_if_not_exists('credit_transactions', 'created_by', 'VARCHAR');

-- Add created_by column to credit_ledger if it doesn't exist
SELECT add_column_if_not_exists('credit_ledger', 'created_by', 'VARCHAR');

-- Add annual_price_gbp column to plans if it doesn't exist
SELECT add_column_if_not_exists('plans', 'annual_price_gbp', 'INTEGER');

-- Add onboarding_completed column to users table if it doesn't exist
SELECT add_column_if_not_exists('users', 'onboarding_completed', 'BOOLEAN NOT NULL DEFAULT FALSE');

-- Add missing columns to organizations table
SELECT add_column_if_not_exists('organizations', 'default_ai_max_words', 'INTEGER DEFAULT 150');
SELECT add_column_if_not_exists('organizations', 'default_ai_instruction', 'TEXT');

-- Add missing columns to inspection_templates table
SELECT add_column_if_not_exists('inspection_templates', 'ai_max_words', 'INTEGER DEFAULT 150');
SELECT add_column_if_not_exists('inspection_templates', 'ai_instruction', 'TEXT');

-- Add missing columns to inspections table
SELECT add_column_if_not_exists('inspections', 'ai_analysis_status', 'VARCHAR DEFAULT ''idle''');
SELECT add_column_if_not_exists('inspections', 'ai_analysis_progress', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('inspections', 'ai_analysis_total_fields', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('inspections', 'ai_analysis_error', 'TEXT');

-- Add missing columns to comparison_report_items table
-- Note: If comparison_item_status enum doesn't exist, create it first
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comparison_item_status') THEN
        CREATE TYPE comparison_item_status AS ENUM ('pending', 'reviewed', 'disputed', 'resolved', 'waived');
    END IF;
END $$;
SELECT add_column_if_not_exists('comparison_report_items', 'status', 'comparison_item_status NOT NULL DEFAULT ''pending''');

-- Add missing columns to comparison_comments table
SELECT add_column_if_not_exists('comparison_comments', 'author_name', 'VARCHAR');
SELECT add_column_if_not_exists('comparison_comments', 'author_role', 'VARCHAR');

-- Add missing columns to tenant_assignments table
SELECT add_column_if_not_exists('tenant_assignments', 'next_of_kin_name', 'VARCHAR(255)');
SELECT add_column_if_not_exists('tenant_assignments', 'next_of_kin_phone', 'VARCHAR(50)');
SELECT add_column_if_not_exists('tenant_assignments', 'next_of_kin_email', 'VARCHAR(255)');
SELECT add_column_if_not_exists('tenant_assignments', 'next_of_kin_relationship', 'VARCHAR(100)');
SELECT add_column_if_not_exists('tenant_assignments', 'has_portal_access', 'BOOLEAN NOT NULL DEFAULT TRUE');

-- Tenant Assignment Tags table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS tenant_assignment_tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_assignment_id VARCHAR NOT NULL,
    tag_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for tenant_assignment_tags
CREATE INDEX IF NOT EXISTS tenant_assignment_tags_tenant_assignment_id_idx ON tenant_assignment_tags(tenant_assignment_id);
CREATE INDEX IF NOT EXISTS tenant_assignment_tags_tag_id_idx ON tenant_assignment_tags(tag_id);

-- Add tenancy_attachments table if it doesn't exist (referenced in schema but might not be in DB)
CREATE TABLE IF NOT EXISTS tenancy_attachments (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_assignment_id VARCHAR NOT NULL,
    organization_id VARCHAR NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(100),
    file_size INTEGER,
    description TEXT,
    uploaded_by VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for tenancy_attachments
CREATE INDEX IF NOT EXISTS tenancy_attachments_tenant_assignment_id_idx ON tenancy_attachments(tenant_assignment_id);
CREATE INDEX IF NOT EXISTS tenancy_attachments_organization_id_idx ON tenancy_attachments(organization_id);

-- Migrate existing tenancy_attachments table if it has old column names
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
    END IF;
    
    -- Add missing columns if they don't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenancy_attachments' 
        AND column_name = 'organization_id'
    ) THEN
        ALTER TABLE tenancy_attachments ADD COLUMN organization_id VARCHAR;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenancy_attachments' 
        AND column_name = 'description'
    ) THEN
        ALTER TABLE tenancy_attachments ADD COLUMN description TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenancy_attachments' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE tenancy_attachments ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
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
    END IF;
    
    -- Update file_name length if needed
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenancy_attachments' 
        AND column_name = 'file_name'
        AND character_maximum_length > 255
    ) THEN
        ALTER TABLE tenancy_attachments ALTER COLUMN file_name TYPE VARCHAR(255);
    END IF;
END $$;

-- ==================== ADD MISSING CONSTRAINTS ====================
-- These constraints won't be added by CREATE TABLE IF NOT EXISTS on existing tables

DO $$
BEGIN
    -- Add CHECK constraint to inspections table if it doesn't exist
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'inspections') THEN
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_constraint 
            WHERE conname = 'inspections_location_check'
        ) THEN
            ALTER TABLE inspections 
            ADD CONSTRAINT inspections_location_check 
            CHECK (block_id IS NOT NULL OR property_id IS NOT NULL);
        END IF;
    END IF;

    -- Add UNIQUE constraint to inspection_entries.offline_id if it doesn't exist
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'inspection_entries') THEN
        IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'inspection_entries' 
            AND column_name = 'offline_id'
        ) THEN
            IF NOT EXISTS (
                SELECT 1 
                FROM pg_constraint 
                WHERE conname = 'inspection_entries_offline_id_key'
                AND conrelid = 'inspection_entries'::regclass
            ) THEN
                ALTER TABLE inspection_entries 
                ADD CONSTRAINT inspection_entries_offline_id_key UNIQUE (offline_id);
            END IF;
        END IF;
    END IF;
END $$;

-- ==================== COMMENTS ====================
-- Only add comments if tables exist to avoid errors

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'sessions') THEN
        COMMENT ON TABLE sessions IS 'Session storage for authentication';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'users') THEN
        COMMENT ON TABLE users IS 'Application users with various roles';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'organizations') THEN
        COMMENT ON TABLE organizations IS 'Organizations using the platform';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'inspections') THEN
        COMMENT ON TABLE inspections IS 'Property and block inspections';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'maintenance_requests') THEN
        COMMENT ON TABLE maintenance_requests IS 'Maintenance requests and work orders';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'comparison_reports') THEN
        COMMENT ON TABLE comparison_reports IS 'Check-in vs check-out comparison reports';
    END IF;
END $$;
