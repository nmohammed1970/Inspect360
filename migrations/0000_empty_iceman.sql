-- Create ENUM types only if they don't exist
DO $$ BEGIN
    CREATE TYPE "public"."asset_condition" AS ENUM('excellent', 'good', 'fair', 'poor', 'needs_replacement');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."billing_interval" AS ENUM('monthly', 'annual');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."cancellation_reason" AS ENUM('too_expensive', 'missing_features', 'not_using_enough', 'switching_provider', 'support_issues', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."cleanliness_rating" AS ENUM('very_clean', 'clean', 'acceptable', 'needs_cleaning', 'not_applicable');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."comparison_item_status" AS ENUM('pending', 'reviewed', 'disputed', 'resolved', 'waived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."comparison_report_status" AS ENUM('draft', 'under_review', 'awaiting_signatures', 'signed', 'filed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."compliance_status" AS ENUM('current', 'expiring_soon', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."condition_rating" AS ENUM('excellent', 'good', 'fair', 'poor', 'not_applicable');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."contact_type" AS ENUM('internal', 'contractor', 'lead', 'company', 'partner', 'vendor', 'tenant', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."credit_source" AS ENUM('plan_inclusion', 'topup', 'admin_grant', 'refund', 'adjustment', 'consumption', 'expiry');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."currency" AS ENUM('GBP', 'USD', 'AED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."feedback_category" AS ENUM('bug', 'feature', 'improvement');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."feedback_priority" AS ENUM('low', 'medium', 'high');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."feedback_status" AS ENUM('new', 'in_review', 'in_progress', 'completed', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."field_type" AS ENUM('short_text', 'long_text', 'number', 'select', 'multiselect', 'boolean', 'rating', 'date', 'time', 'datetime', 'photo', 'photo_array', 'video', 'gps', 'signature', 'auto_inspection_date', 'auto_inspector', 'auto_address', 'auto_tenant_names');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."inspection_point_data_type" AS ENUM('text', 'number', 'checkbox', 'photo', 'rating');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."inspection_status" AS ENUM('scheduled', 'in_progress', 'completed', 'reviewed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."inspection_type" AS ENUM('check_in', 'check_out', 'routine', 'maintenance');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."maintenance_source" AS ENUM('manual', 'inspection', 'tenant_portal', 'routine');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."maintenance_status" AS ENUM('open', 'in_progress', 'completed', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."plan_code" AS ENUM('starter', 'professional', 'enterprise', 'enterprise_plus', 'freelancer', 'btr', 'pbsa', 'housing_association', 'council');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."subscription_level" AS ENUM('free', 'starter', 'professional', 'enterprise', 'freelancer', 'btr', 'pbsa', 'housing_association', 'council');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."subscription_status" AS ENUM('active', 'inactive', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."template_scope" AS ENUM('block', 'property', 'both');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."topup_status" AS ENUM('pending', 'paid', 'failed', 'refunded');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."user_role" AS ENUM('owner', 'clerk', 'compliance', 'tenant', 'contractor');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."work_order_status" AS ENUM('assigned', 'in_progress', 'waiting_parts', 'completed', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar NOT NULL,
	"password" varchar NOT NULL,
	"first_name" varchar NOT NULL,
	"last_name" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_image_analyses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_entry_id" varchar,
	"inspection_id" varchar,
	"media_url" text NOT NULL,
	"media_type" varchar DEFAULT 'photo' NOT NULL,
	"model" varchar DEFAULT 'gpt-4o' NOT NULL,
	"result_json" jsonb,
	"confidence" integer,
	"detections_json" jsonb,
	"annotations_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset_inventory" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"property_id" varchar,
	"block_id" varchar,
	"name" varchar NOT NULL,
	"category" varchar,
	"description" text,
	"location" varchar,
	"supplier" varchar,
	"supplier_contact" varchar,
	"serial_number" varchar,
	"model_number" varchar,
	"date_purchased" timestamp,
	"purchase_price" numeric(10, 2),
	"warranty_expiry_date" timestamp,
	"condition" "asset_condition" NOT NULL,
	"cleanliness" "cleanliness_rating",
	"expected_lifespan_years" integer,
	"depreciation_per_year" numeric(10, 2),
	"current_value" numeric(10, 2),
	"last_maintenance_date" timestamp,
	"next_maintenance_date" timestamp,
	"maintenance_notes" text,
	"photos" text[],
	"documents" text[],
	"inspection_id" varchar,
	"inspection_entry_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset_inventory_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_inventory_id" varchar NOT NULL,
	"tag_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "block_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" varchar NOT NULL,
	"tag_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blocks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"address" text NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bundle_tier_pricing" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bundle_id" varchar NOT NULL,
	"plan_code" "plan_code" NOT NULL,
	"price_gbp" integer NOT NULL,
	"price_usd" integer NOT NULL,
	"price_aed" integer NOT NULL,
	"stripe_price_id_gbp" varchar,
	"stripe_price_id_usd" varchar,
	"stripe_price_id_aed" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "central_team_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_email" varchar NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"title" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"role" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"source_docs" text[],
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comparison_comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comparison_report_id" varchar NOT NULL,
	"comparison_report_item_id" varchar,
	"user_id" varchar NOT NULL,
	"author_name" varchar,
	"author_role" varchar,
	"content" text NOT NULL,
	"attachments" text[],
	"is_internal" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comparison_report_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comparison_report_id" varchar NOT NULL,
	"check_in_entry_id" varchar,
	"check_out_entry_id" varchar NOT NULL,
	"section_ref" text NOT NULL,
	"item_ref" text,
	"field_key" varchar NOT NULL,
	"ai_comparison_json" jsonb,
	"ai_summary" text,
	"estimated_cost" numeric(10, 2),
	"depreciation" numeric(10, 2),
	"final_cost" numeric(10, 2),
	"liability_decision" varchar,
	"liability_notes" text,
	"status" "comparison_item_status" DEFAULT 'pending' NOT NULL,
	"dispute_reason" text,
	"disputed_at" timestamp,
	"ai_cost_calculation_notes" text,
	"cost_calculation_method" varchar,
	"asset_inventory_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comparison_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"property_id" varchar NOT NULL,
	"check_in_inspection_id" varchar NOT NULL,
	"check_out_inspection_id" varchar NOT NULL,
	"tenant_id" varchar,
	"status" "comparison_report_status" DEFAULT 'draft' NOT NULL,
	"total_estimated_cost" numeric(10, 2) DEFAULT '0',
	"ai_analysis_json" jsonb,
	"item_comparisons" jsonb,
	"generated_by" varchar NOT NULL,
	"generated_at" timestamp DEFAULT now(),
	"operator_signature" varchar,
	"operator_signed_at" timestamp,
	"operator_ip_address" varchar,
	"tenant_signature" varchar,
	"tenant_signed_at" timestamp,
	"tenant_ip_address" varchar,
	"filed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compliance_document_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compliance_document_id" varchar NOT NULL,
	"tag_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compliance_document_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compliance_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"property_id" varchar,
	"block_id" varchar,
	"document_type" varchar NOT NULL,
	"document_url" text NOT NULL,
	"expiry_date" timestamp,
	"status" "compliance_status" DEFAULT 'current' NOT NULL,
	"uploaded_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"tag_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"type" "contact_type" DEFAULT 'other' NOT NULL,
	"first_name" varchar NOT NULL,
	"last_name" varchar NOT NULL,
	"email" varchar,
	"phone" varchar,
	"country_code" varchar DEFAULT '+1',
	"company_name" varchar,
	"job_title" varchar,
	"address" text,
	"city" varchar,
	"state" varchar,
	"postal_code" varchar,
	"country" varchar,
	"website" varchar,
	"notes" text,
	"profile_image_url" varchar,
	"tags" text[],
	"linked_user_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "country_pricing_overrides" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"plan_id" varchar NOT NULL,
	"currency" "currency" NOT NULL,
	"monthly_price_minor_units" integer NOT NULL,
	"included_credits_override" integer,
	"topup_price_per_credit_minor_units" integer,
	"active_from" timestamp DEFAULT now() NOT NULL,
	"active_to" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"granted_quantity" integer NOT NULL,
	"remaining_quantity" integer NOT NULL,
	"grant_source" "credit_source" NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"unit_cost_minor_units" integer,
	"rolled" boolean DEFAULT false,
	"metadata_json" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_bundles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"credits" integer NOT NULL,
	"price_gbp" integer NOT NULL,
	"price_usd" integer NOT NULL,
	"price_aed" integer NOT NULL,
	"sort_order" integer DEFAULT 0,
	"is_popular" boolean DEFAULT false,
	"discount_label" varchar(50),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_ledger" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_by" varchar,
	"source" "credit_source" NOT NULL,
	"quantity" integer NOT NULL,
	"batch_id" varchar,
	"unit_cost_minor_units" integer,
	"notes" text,
	"linked_entity_type" varchar,
	"linked_entity_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"amount" integer NOT NULL,
	"type" varchar NOT NULL,
	"description" text,
	"related_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dashboard_preferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"enabled_panels" jsonb DEFAULT '["stats", "inspections", "compliance", "maintenance"]' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback_submissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"priority" "feedback_priority" DEFAULT 'medium' NOT NULL,
	"category" "feedback_category" DEFAULT 'feature' NOT NULL,
	"status" "feedback_status" DEFAULT 'new' NOT NULL,
	"user_id" varchar NOT NULL,
	"user_email" varchar NOT NULL,
	"user_name" varchar,
	"organization_id" varchar,
	"organization_name" varchar,
	"assigned_to" varchar,
	"assigned_department" varchar,
	"resolution_notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fixflo_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"base_url" varchar DEFAULT 'https://api-sandbox.fixflo.com/api/v2' NOT NULL,
	"bearer_token" varchar,
	"webhook_verify_token" varchar,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"last_health_check" timestamp,
	"health_check_status" varchar,
	"last_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "fixflo_config_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fixflo_sync_state" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"entity_type" varchar NOT NULL,
	"last_sync_at" timestamp,
	"last_successful_sync_at" timestamp,
	"sync_status" varchar DEFAULT 'idle' NOT NULL,
	"error_message" text,
	"records_synced" integer DEFAULT 0 NOT NULL,
	"records_failed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fixflo_webhook_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"event_type" varchar NOT NULL,
	"fixflo_issue_id" varchar,
	"fixflo_job_id" varchar,
	"payload_json" jsonb NOT NULL,
	"processing_status" varchar DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspection_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspection_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" varchar NOT NULL,
	"section_ref" text NOT NULL,
	"item_ref" text,
	"field_key" varchar NOT NULL,
	"field_type" "field_type" NOT NULL,
	"value_json" jsonb,
	"note" text,
	"photos" text[],
	"videos" text[],
	"maintenance_flag" boolean DEFAULT false,
	"marked_for_review" boolean DEFAULT false,
	"asset_inventory_id" varchar,
	"defects_json" jsonb,
	"offline_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "inspection_entries_offline_id_unique" UNIQUE("offline_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspection_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" varchar NOT NULL,
	"category_id" varchar,
	"category" varchar NOT NULL,
	"item_name" varchar NOT NULL,
	"photo_url" text,
	"condition_rating" integer,
	"notes" text,
	"ai_analysis" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspection_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" varchar NOT NULL,
	"template_point_id" varchar NOT NULL,
	"asset_inventory_id" varchar,
	"condition_rating" "condition_rating",
	"cleanliness_rating" "cleanliness_rating",
	"text_value" text,
	"number_value" integer,
	"checkbox_value" boolean,
	"photo_url" text,
	"notes" text,
	"ai_analysis" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspection_template_points" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"category_id" varchar,
	"name" varchar NOT NULL,
	"description" text,
	"data_type" "inspection_point_data_type" DEFAULT 'text' NOT NULL,
	"requires_condition_rating" boolean DEFAULT true,
	"requires_cleanliness_rating" boolean DEFAULT true,
	"requires_photo" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspection_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"scope" "template_scope" DEFAULT 'property' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_template_id" varchar,
	"is_active" boolean DEFAULT true,
	"structure_json" jsonb NOT NULL,
	"category_id" varchar,
	"ai_max_words" integer DEFAULT 150,
	"ai_instruction" text,
	"report_config" jsonb,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"template_id" varchar,
	"template_version" integer,
	"template_snapshot_json" jsonb,
	"inventory_snapshot_json" jsonb,
	"block_id" varchar,
	"property_id" varchar,
	"inspector_id" varchar NOT NULL,
	"type" "inspection_type" NOT NULL,
	"status" "inspection_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_date" timestamp,
	"started_at" timestamp,
	"completed_date" timestamp,
	"submitted_at" timestamp,
	"notes" text,
	"ai_analysis_status" varchar DEFAULT 'idle',
	"ai_analysis_progress" integer DEFAULT 0,
	"ai_analysis_total_fields" integer DEFAULT 0,
	"ai_analysis_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"property_id" varchar NOT NULL,
	"template_id" varchar,
	"version" integer DEFAULT 1,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_id" varchar NOT NULL,
	"path" text NOT NULL,
	"item_name" varchar NOT NULL,
	"baseline_condition" integer,
	"baseline_cleanliness" integer,
	"baseline_photos" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"schema" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_base_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(500) NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"file_url" varchar(1000) NOT NULL,
	"file_type" varchar(100) NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"extracted_text" text,
	"category" varchar(255),
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"uploaded_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maintenance_request_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maintenance_request_id" varchar NOT NULL,
	"tag_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maintenance_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"property_id" varchar,
	"block_id" varchar,
	"reported_by" varchar NOT NULL,
	"assigned_to" varchar,
	"title" varchar NOT NULL,
	"description" text,
	"status" "maintenance_status" DEFAULT 'open' NOT NULL,
	"priority" varchar DEFAULT 'medium' NOT NULL,
	"photo_urls" text[],
	"ai_suggested_fixes" text,
	"ai_analysis_json" jsonb,
	"source" "maintenance_source" DEFAULT 'manual' NOT NULL,
	"inspection_id" varchar,
	"inspection_entry_id" varchar,
	"fixflo_issue_id" varchar,
	"fixflo_job_id" varchar,
	"fixflo_status" varchar,
	"fixflo_contractor_name" varchar,
	"fixflo_synced_at" timestamp,
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"subject" varchar(500) NOT NULL,
	"body" text NOT NULL,
	"description" text,
	"variables" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"type" varchar NOT NULL,
	"title" varchar NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_trademarks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"image_url" varchar NOT NULL,
	"display_order" integer DEFAULT 0,
	"alt_text" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"owner_id" varchar NOT NULL,
	"stripe_customer_id" varchar,
	"subscription_status" "subscription_status" DEFAULT 'inactive',
	"subscription_level" "subscription_level" DEFAULT 'free',
	"country_code" varchar(2) DEFAULT 'GB',
	"current_plan_id" varchar,
	"trial_end_at" timestamp,
	"is_active" boolean DEFAULT true,
	"credits_remaining" integer DEFAULT 5,
	"included_inspections_per_month" integer DEFAULT 0,
	"used_inspections_this_month" integer DEFAULT 0,
	"topup_inspections_balance" integer DEFAULT 0,
	"billing_cycle_reset_at" timestamp,
	"preferred_currency" "currency" DEFAULT 'GBP',
	"default_ai_max_words" integer DEFAULT 150,
	"default_ai_instruction" text,
	"logo_url" varchar,
	"trademark_url" varchar,
	"branding_name" varchar,
	"branding_email" varchar,
	"branding_phone" varchar,
	"branding_address" text,
	"branding_website" varchar,
	"branding_primary_color" varchar,
	"finance_email" varchar,
	"auto_renew_enabled" boolean DEFAULT false,
	"auto_renew_bundle_id" varchar,
	"auto_renew_threshold" integer DEFAULT 10,
	"auto_renew_last_run_at" timestamp,
	"auto_renew_failure_count" integer DEFAULT 0,
	"comparison_alert_threshold" integer DEFAULT 20,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" "plan_code" NOT NULL,
	"name" varchar(100) NOT NULL,
	"monthly_price_gbp" integer NOT NULL,
	"annual_price_gbp" integer,
	"monthly_price_usd" integer,
	"annual_price_usd" integer,
	"monthly_price_aed" integer,
	"annual_price_aed" integer,
	"included_inspections" integer DEFAULT 0 NOT NULL,
	"included_credits" integer NOT NULL,
	"soft_cap" integer DEFAULT 5000,
	"topup_price_per_inspection_gbp" integer,
	"topup_price_per_inspection_usd" integer,
	"topup_price_per_inspection_aed" integer,
	"stripe_price_id_monthly_gbp" varchar,
	"stripe_price_id_annual_gbp" varchar,
	"stripe_price_id_monthly_usd" varchar,
	"stripe_price_id_annual_usd" varchar,
	"stripe_price_id_monthly_aed" varchar,
	"stripe_price_id_annual_aed" varchar,
	"is_custom" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "properties" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"block_id" varchar,
	"name" varchar NOT NULL,
	"address" text NOT NULL,
	"property_type" varchar,
	"image_url" text,
	"sqft" integer,
	"fixflo_property_id" varchar,
	"fixflo_synced_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"tag_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"plan_snapshot_json" jsonb NOT NULL,
	"stripe_subscription_id" varchar,
	"stripe_customer_id" varchar,
	"billing_interval" "billing_interval" DEFAULT 'monthly' NOT NULL,
	"billing_cycle_anchor" timestamp NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false,
	"cancellation_reason" "cancellation_reason",
	"cancellation_reason_text" text,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"color" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"category" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"user_id" varchar,
	"contact_id" varchar,
	"role" varchar DEFAULT 'member',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"email" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"color" varchar DEFAULT '#5AB5E8',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_inventory_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"inventory_template_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenancy_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_assignment_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_url" text NOT NULL,
	"file_type" varchar(100),
	"file_size" integer,
	"description" text,
	"uploaded_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_assignment_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_assignment_id" varchar NOT NULL,
	"tag_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"property_id" varchar NOT NULL,
	"lease_start_date" timestamp,
	"lease_end_date" timestamp,
	"monthly_rent" numeric(10, 2),
	"deposit_amount" numeric(10, 2),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"next_of_kin_name" varchar(255),
	"next_of_kin_phone" varchar(50),
	"next_of_kin_email" varchar(255),
	"next_of_kin_relationship" varchar(100),
	"has_portal_access" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_maintenance_chat_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" varchar NOT NULL,
	"role" varchar NOT NULL,
	"content" text NOT NULL,
	"image_url" varchar,
	"ai_suggested_fixes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_maintenance_chats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"property_id" varchar NOT NULL,
	"maintenance_request_id" varchar,
	"title" varchar NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topup_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"pack_size" integer NOT NULL,
	"currency" "currency" NOT NULL,
	"unit_price_minor_units" integer NOT NULL,
	"total_price_minor_units" integer NOT NULL,
	"stripe_payment_intent_id" varchar,
	"status" "topup_status" DEFAULT 'pending' NOT NULL,
	"delivered_batch_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"document_name" varchar NOT NULL,
	"document_type" varchar,
	"file_url" varchar NOT NULL,
	"expiry_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"tag_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar NOT NULL,
	"password" varchar NOT NULL,
	"email" varchar NOT NULL,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"phone" varchar,
	"address" jsonb,
	"skills" text[],
	"qualifications" text[],
	"education" text,
	"certificate_urls" text[],
	"role" "user_role" DEFAULT 'owner' NOT NULL,
	"organization_id" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"reset_token" varchar,
	"reset_token_expiry" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" varchar NOT NULL,
	"note" text NOT NULL,
	"photos" text[],
	"time_spent_minutes" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"maintenance_request_id" varchar NOT NULL,
	"team_id" varchar,
	"contractor_id" varchar,
	"assigned_to_id" varchar,
	"status" "work_order_status" DEFAULT 'assigned' NOT NULL,
	"sla_due" timestamp,
	"cost_estimate" integer,
	"cost_actual" integer,
	"variation_notes" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_image_analyses_entry_id_idx" ON "ai_image_analyses" USING btree ("inspection_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_image_analyses_inspection_id_idx" ON "ai_image_analyses" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bundle_tier_pricing_bundle" ON "bundle_tier_pricing" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bundle_tier_pricing_plan" ON "bundle_tier_pricing" USING btree ("plan_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_user" ON "chat_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_org" ON "chat_conversations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_conversation" ON "chat_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comparison_comments_report_id_idx" ON "comparison_comments" USING btree ("comparison_report_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comparison_comments_item_id_idx" ON "comparison_comments" USING btree ("comparison_report_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comparison_report_items_report_id_idx" ON "comparison_report_items" USING btree ("comparison_report_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comparison_reports_organization_id_idx" ON "comparison_reports" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comparison_reports_property_id_idx" ON "comparison_reports" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comparison_reports_check_out_inspection_id_idx" ON "comparison_reports" USING btree ("check_out_inspection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_document_types_organization_id_idx" ON "compliance_document_types" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_country_pricing_country_plan" ON "country_pricing_overrides" USING btree ("country_code","plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_batches_org_expires" ON "credit_batches" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_batches_org_granted" ON "credit_batches" USING btree ("organization_id","granted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_ledger_org_created" ON "credit_ledger" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_ledger_batch" ON "credit_ledger" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_user" ON "feedback_submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_status" ON "feedback_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_category" ON "feedback_submissions" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_priority" ON "feedback_submissions" USING btree ("priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_created" ON "feedback_submissions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fixflo_sync_state_organization_id_idx" ON "fixflo_sync_state" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fixflo_webhook_logs_organization_id_idx" ON "fixflo_webhook_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fixflo_webhook_logs_event_type_idx" ON "fixflo_webhook_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fixflo_webhook_logs_processing_status_idx" ON "fixflo_webhook_logs" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspection_entries_inspection_id_idx" ON "inspection_entries" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspection_entries_offline_id_idx" ON "inspection_entries" USING btree ("offline_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspections_organization_id_idx" ON "inspections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_docs_active" ON "knowledge_base_documents" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_docs_category" ON "knowledge_base_documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_read_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_organization_id_idx" ON "notifications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_subscriptions_org" ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_subscriptions_period_end" ON "subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_categories_team_id_idx" ON "team_categories" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_members_team_id_idx" ON "team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_members_user_id_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_members_contact_id_idx" ON "team_members" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_organization_id_idx" ON "teams" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_inventory_links_template_id_idx" ON "template_inventory_links" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_topup_orders_org" ON "topup_orders" USING btree ("organization_id");
-- Add missing columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills text[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS qualifications text[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS education text;
-- Add missing columns to comparison_report_items table
ALTER TABLE comparison_report_items ADD COLUMN IF NOT EXISTS dispute_reason text;
ALTER TABLE comparison_report_items ADD COLUMN IF NOT EXISTS disputed_at timestamp;
ALTER TABLE comparison_report_items ADD COLUMN IF NOT EXISTS ai_cost_calculation_notes text;
ALTER TABLE comparison_report_items ADD COLUMN IF NOT EXISTS cost_calculation_method varchar;
ALTER TABLE comparison_report_items ADD COLUMN IF NOT EXISTS asset_inventory_id varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS certificate_urls text[];