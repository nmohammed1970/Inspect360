-- Inspect360 PostgreSQL Database Schema
-- Generated from shared/schema.ts

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== ENUMS ====================

CREATE TYPE user_role AS ENUM ('owner', 'clerk', 'compliance', 'tenant', 'contractor');
CREATE TYPE inspection_status AS ENUM ('scheduled', 'in_progress', 'completed', 'reviewed');
CREATE TYPE inspection_type AS ENUM ('check_in', 'check_out', 'routine', 'maintenance');
CREATE TYPE compliance_status AS ENUM ('current', 'expiring_soon', 'expired');
CREATE TYPE maintenance_status AS ENUM ('open', 'in_progress', 'completed', 'closed');
CREATE TYPE subscription_status AS ENUM ('active', 'inactive', 'cancelled');
CREATE TYPE subscription_level AS ENUM ('free', 'starter', 'professional', 'enterprise');
CREATE TYPE work_order_status AS ENUM ('assigned', 'in_progress', 'waiting_parts', 'completed', 'rejected');
CREATE TYPE asset_condition AS ENUM ('excellent', 'good', 'fair', 'poor', 'needs_replacement');
CREATE TYPE inspection_point_data_type AS ENUM ('text', 'number', 'checkbox', 'photo', 'rating');
CREATE TYPE condition_rating AS ENUM ('excellent', 'good', 'fair', 'poor', 'not_applicable');
CREATE TYPE cleanliness_rating AS ENUM ('very_clean', 'clean', 'acceptable', 'needs_cleaning', 'not_applicable');
CREATE TYPE contact_type AS ENUM ('internal', 'contractor', 'lead', 'company', 'partner', 'vendor', 'other');
CREATE TYPE template_scope AS ENUM ('block', 'property', 'both');
CREATE TYPE field_type AS ENUM ('short_text', 'long_text', 'number', 'select', 'multiselect', 'boolean', 'rating', 'date', 'time', 'datetime', 'photo', 'photo_array', 'video', 'gps', 'signature');
CREATE TYPE maintenance_source AS ENUM ('manual', 'inspection', 'tenant_portal', 'routine');
CREATE TYPE comparison_report_status AS ENUM ('draft', 'under_review', 'awaiting_signatures', 'signed', 'filed');
CREATE TYPE currency AS ENUM ('GBP', 'USD', 'AED');
CREATE TYPE plan_code AS ENUM ('starter', 'professional', 'enterprise', 'enterprise_plus');
CREATE TYPE credit_source AS ENUM ('plan_inclusion', 'topup', 'admin_grant', 'refund', 'adjustment', 'consumption', 'expiry');
CREATE TYPE topup_status AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- ==================== TABLES ====================

-- Sessions table (required for session storage)
CREATE TABLE sessions (
    sid VARCHAR PRIMARY KEY,
    sess JSONB NOT NULL,
    expire TIMESTAMP NOT NULL
);

CREATE INDEX IDX_session_expire ON sessions(expire);

-- Users table
CREATE TABLE users (
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
    reset_token VARCHAR,
    reset_token_expiry TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Admin Users table
CREATE TABLE admin_users (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    email VARCHAR UNIQUE NOT NULL,
    password VARCHAR NOT NULL,
    first_name VARCHAR NOT NULL,
    last_name VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Organizations table
CREATE TABLE organizations (
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
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Contacts table
CREATE TABLE contacts (
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
CREATE TABLE blocks (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    address TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Properties table
CREATE TABLE properties (
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
CREATE TABLE tenant_assignments (
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
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Inspection Categories table
CREATE TABLE inspection_categories (
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
CREATE TABLE template_categories (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    description TEXT,
    color VARCHAR DEFAULT '#5AB5E8',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Inspection Templates table
CREATE TABLE inspection_templates (
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
    created_by VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Template Inventory Links table
CREATE TABLE template_inventory_links (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    template_id VARCHAR NOT NULL,
    inventory_template_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX template_inventory_links_template_id_idx ON template_inventory_links(template_id);

-- Inspection Template Points table
CREATE TABLE inspection_template_points (
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
CREATE TABLE inspections (
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
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT inspections_location_check CHECK (block_id IS NOT NULL OR property_id IS NOT NULL)
);

CREATE INDEX inspections_organization_id_idx ON inspections(organization_id);

-- Inspection Items table
CREATE TABLE inspection_items (
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
CREATE TABLE inspection_responses (
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
CREATE TABLE inspection_entries (
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
    offline_id VARCHAR UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX inspection_entries_inspection_id_idx ON inspection_entries(inspection_id);
CREATE INDEX inspection_entries_offline_id_idx ON inspection_entries(offline_id);

-- AI Image Analyses table
CREATE TABLE ai_image_analyses (
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

CREATE INDEX ai_image_analyses_entry_id_idx ON ai_image_analyses(inspection_entry_id);
CREATE INDEX ai_image_analyses_inspection_id_idx ON ai_image_analyses(inspection_id);

-- Compliance Documents table
CREATE TABLE compliance_documents (
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
CREATE TABLE maintenance_requests (
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
CREATE TABLE tenant_maintenance_chats (
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
CREATE TABLE tenant_maintenance_chat_messages (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    chat_id VARCHAR NOT NULL,
    role VARCHAR NOT NULL,
    content TEXT NOT NULL,
    image_url VARCHAR,
    ai_suggested_fixes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Comparison Reports table
CREATE TABLE comparison_reports (
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

CREATE INDEX comparison_reports_organization_id_idx ON comparison_reports(organization_id);
CREATE INDEX comparison_reports_property_id_idx ON comparison_reports(property_id);
CREATE INDEX comparison_reports_check_out_inspection_id_idx ON comparison_reports(check_out_inspection_id);

-- Comparison Report Items table
CREATE TABLE comparison_report_items (
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
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX comparison_report_items_report_id_idx ON comparison_report_items(comparison_report_id);

-- Comparison Comments table
CREATE TABLE comparison_comments (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    comparison_report_id VARCHAR NOT NULL,
    comparison_report_item_id VARCHAR,
    user_id VARCHAR NOT NULL,
    content TEXT NOT NULL,
    attachments TEXT[],
    is_internal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX comparison_comments_report_id_idx ON comparison_comments(comparison_report_id);
CREATE INDEX comparison_comments_item_id_idx ON comparison_comments(comparison_report_item_id);

-- Credit Transactions table
CREATE TABLE credit_transactions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    amount INTEGER NOT NULL,
    type VARCHAR NOT NULL,
    description TEXT,
    related_id VARCHAR,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Inventory Templates table
CREATE TABLE inventory_templates (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    description TEXT,
    schema JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Inventories table
CREATE TABLE inventories (
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
CREATE TABLE inventory_items (
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
CREATE TABLE work_orders (
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
CREATE TABLE work_logs (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    work_order_id VARCHAR NOT NULL,
    note TEXT NOT NULL,
    photos TEXT[],
    time_spent_minutes INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Asset Inventory table
CREATE TABLE asset_inventory (
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
CREATE TABLE fixflo_config (
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
CREATE TABLE fixflo_webhook_logs (
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

CREATE INDEX fixflo_webhook_logs_organization_id_idx ON fixflo_webhook_logs(organization_id);
CREATE INDEX fixflo_webhook_logs_event_type_idx ON fixflo_webhook_logs(event_type);
CREATE INDEX fixflo_webhook_logs_processing_status_idx ON fixflo_webhook_logs(processing_status);

-- Fixflo Sync State table
CREATE TABLE fixflo_sync_state (
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

CREATE INDEX fixflo_sync_state_organization_id_idx ON fixflo_sync_state(organization_id);

-- Teams table
CREATE TABLE teams (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    description TEXT,
    email VARCHAR,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX teams_organization_id_idx ON teams(organization_id);

-- Team Members table
CREATE TABLE team_members (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    team_id VARCHAR NOT NULL,
    user_id VARCHAR,
    contact_id VARCHAR,
    role VARCHAR DEFAULT 'member',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX team_members_team_id_idx ON team_members(team_id);
CREATE INDEX team_members_user_id_idx ON team_members(user_id);
CREATE INDEX team_members_contact_id_idx ON team_members(contact_id);

-- Team Categories table
CREATE TABLE team_categories (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    team_id VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX team_categories_team_id_idx ON team_categories(team_id);

-- Tags table
CREATE TABLE tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    color VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tag join tables
CREATE TABLE block_tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    block_id VARCHAR NOT NULL,
    tag_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE property_tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    property_id VARCHAR NOT NULL,
    tag_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id VARCHAR NOT NULL,
    tag_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE compliance_document_tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    compliance_document_id VARCHAR NOT NULL,
    tag_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE asset_inventory_tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    asset_inventory_id VARCHAR NOT NULL,
    tag_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE maintenance_request_tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    maintenance_request_id VARCHAR NOT NULL,
    tag_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE contact_tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    contact_id VARCHAR NOT NULL,
    tag_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Dashboard Preferences table
CREATE TABLE dashboard_preferences (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id VARCHAR NOT NULL,
    enabled_panels JSONB NOT NULL DEFAULT '["stats", "inspections", "compliance", "maintenance"]'::JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Plans table
CREATE TABLE plans (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    code plan_code NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    monthly_price_gbp INTEGER NOT NULL,
    included_credits INTEGER NOT NULL,
    soft_cap INTEGER DEFAULT 5000,
    is_custom BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Country Pricing Overrides table
CREATE TABLE country_pricing_overrides (
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

CREATE INDEX idx_country_pricing_country_plan ON country_pricing_overrides(country_code, plan_id);

-- Subscriptions table
CREATE TABLE subscriptions (
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

CREATE INDEX idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_period_end ON subscriptions(current_period_end);

-- Credit Batches table
CREATE TABLE credit_batches (
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

CREATE INDEX idx_credit_batches_org_expires ON credit_batches(organization_id, expires_at);
CREATE INDEX idx_credit_batches_org_granted ON credit_batches(organization_id, granted_at);

-- Credit Ledger table
CREATE TABLE credit_ledger (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    source credit_source NOT NULL,
    quantity INTEGER NOT NULL,
    batch_id VARCHAR,
    unit_cost_minor_units INTEGER,
    notes TEXT,
    linked_entity_type VARCHAR,
    linked_entity_id VARCHAR,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_credit_ledger_org_created ON credit_ledger(organization_id, created_at);
CREATE INDEX idx_credit_ledger_batch ON credit_ledger(batch_id);

-- Topup Orders table
CREATE TABLE topup_orders (
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

CREATE INDEX idx_topup_orders_org ON topup_orders(organization_id);

-- Message Templates table
CREATE TABLE message_templates (
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
CREATE TABLE knowledge_base_documents (
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

CREATE INDEX idx_kb_docs_active ON knowledge_base_documents(is_active);
CREATE INDEX idx_kb_docs_category ON knowledge_base_documents(category);

-- Chat Conversations table
CREATE TABLE chat_conversations (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    organization_id VARCHAR NOT NULL,
    user_id VARCHAR NOT NULL,
    title VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_chat_conversations_user ON chat_conversations(user_id);
CREATE INDEX idx_chat_conversations_org ON chat_conversations(organization_id);

-- Chat Messages table
CREATE TABLE chat_messages (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    conversation_id VARCHAR NOT NULL,
    role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    source_docs TEXT[],
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id);

-- ==================== COMMENTS ====================

COMMENT ON TABLE sessions IS 'Session storage for authentication';
COMMENT ON TABLE users IS 'Application users with various roles';
COMMENT ON TABLE organizations IS 'Organizations using the platform';
COMMENT ON TABLE inspections IS 'Property and block inspections';
COMMENT ON TABLE maintenance_requests IS 'Maintenance requests and work orders';
COMMENT ON TABLE comparison_reports IS 'Check-in vs check-out comparison reports';

