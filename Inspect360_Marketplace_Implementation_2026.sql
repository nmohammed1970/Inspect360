-- Inspect360 Marketplace & Pricing Full Implementation 2026
-- This file contains both the database schema and the initial seeded data.
--
-- IMPORTANT: Before running this script, ensure the 'growth' enum value exists in plan_code.
-- If you get an "unsafe use of new enum value" error, run this FIRST and COMMIT:
--   ALTER TYPE "public"."plan_code" ADD VALUE 'growth' BEFORE 'professional';
-- Then run this entire script.

-- 1. DATABASE SCHEMA
DO $$ BEGIN
  CREATE TYPE "public"."community_flag_reason" AS ENUM('spam', 'offensive', 'harassment', 'misinformation', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  CREATE TYPE "public"."community_group_status" AS ENUM('pending', 'approved', 'rejected', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  CREATE TYPE "public"."community_moderation_action" AS ENUM('approved', 'rejected', 'hidden', 'restored', 'removed', 'warned');
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  CREATE TYPE "public"."community_post_status" AS ENUM('visible', 'hidden', 'flagged', 'removed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  CREATE TYPE "public"."limit_type" AS ENUM('active_tenants', 'work_orders', 'disputes');
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  CREATE TYPE "public"."override_type" AS ENUM('subscription', 'module', 'addon');
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TYPE "public"."credit_source" ADD VALUE 'addon_pack';
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TYPE "public"."field_type" ADD VALUE 'auto_inspection_date';
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TYPE "public"."field_type" ADD VALUE 'auto_inspector';
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TYPE "public"."field_type" ADD VALUE 'auto_address';
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TYPE "public"."field_type" ADD VALUE 'auto_tenant_names';
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

-- Add 'growth' enum value if it doesn't exist
-- IMPORTANT: PostgreSQL requires enum value additions to be committed before use.
-- If you encounter "unsafe use of new enum value" error, run this statement separately first:
-- ALTER TYPE "public"."plan_code" ADD VALUE 'growth' BEFORE 'professional';
-- Then commit, and then run the rest of this script.
DO $$ 
DECLARE
  enum_exists boolean;
BEGIN
  -- Check if 'growth' already exists in the enum
  SELECT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'growth' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'plan_code')
  ) INTO enum_exists;
  
  -- Only add if it doesn't exist
  IF NOT enum_exists THEN
    -- Try to add the enum value
    -- Note: This may fail if run in the same transaction as INSERTs that use it
    BEGIN
      ALTER TYPE "public"."plan_code" ADD VALUE 'growth' BEFORE 'professional';
    EXCEPTION WHEN OTHERS THEN
      -- If it fails, the value might already exist or we're in a transaction issue
      -- Log a warning but continue
      RAISE NOTICE 'Could not add growth enum value. If you get an error, run: ALTER TYPE "public"."plan_code" ADD VALUE ''growth'' BEFORE ''professional''; separately and commit first.';
    END;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- If any other error occurs, continue
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS "addon_pack_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"inspection_quantity" integer NOT NULL,
	"pack_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
;

CREATE TABLE IF NOT EXISTS "addon_pack_pricing" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" varchar NOT NULL,
	"tier_id" varchar NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"price_per_inspection" integer NOT NULL,
	"total_pack_price" integer NOT NULL,
	"last_updated" timestamp DEFAULT now()
);
;

CREATE TABLE IF NOT EXISTS "bundle_modules_junction" (
	"bundle_id" varchar NOT NULL,
	"module_id" varchar NOT NULL
);
;

CREATE TABLE IF NOT EXISTS "bundle_pricing" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bundle_id" varchar NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"price_monthly" integer NOT NULL,
	"price_annual" integer NOT NULL,
	"savings_monthly" integer,
	"last_updated" timestamp DEFAULT now()
);
;

CREATE TABLE IF NOT EXISTS "community_group_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"joined_at" timestamp DEFAULT now()
);
;

CREATE TABLE IF NOT EXISTS "community_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"block_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"cover_image_url" varchar,
	"status" "community_group_status" DEFAULT 'pending' NOT NULL,
	"created_by" varchar NOT NULL,
	"rule_version_agreed_at" integer,
	"approved_by" varchar,
	"approved_at" timestamp,
	"rejection_reason" text,
	"member_count" integer DEFAULT 0,
	"post_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE IF NOT EXISTS "community_rule_acceptances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"rule_version" integer NOT NULL,
	"accepted_at" timestamp DEFAULT now()
);
;

CREATE TABLE IF NOT EXISTS "community_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rules_text" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
;

CREATE TABLE IF NOT EXISTS "community_tenant_blocks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"tenant_user_id" varchar NOT NULL,
	"blocked_by_user_id" varchar NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
;

CREATE TABLE IF NOT EXISTS "community_threads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" varchar NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"created_by" varchar NOT NULL,
	"status" "community_post_status" DEFAULT 'visible' NOT NULL,
	"is_pinned" boolean DEFAULT false,
	"is_locked" boolean DEFAULT false,
	"view_count" integer DEFAULT 0,
	"reply_count" integer DEFAULT 0,
	"last_activity_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE IF NOT EXISTS "currency_config" (
	"code" varchar(3) PRIMARY KEY NOT NULL,
	"symbol" varchar(5) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"default_for_region" varchar(50),
	"conversion_rate" numeric(10, 4) DEFAULT '1.0000',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE IF NOT EXISTS "extensive_inspection_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"image_count" integer DEFAULT 800,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL
);
;

CREATE TABLE IF NOT EXISTS "extensive_inspection_pricing" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extensive_type_id" varchar NOT NULL,
	"tier_id" varchar NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"price_per_inspection" integer NOT NULL,
	"last_updated" timestamp DEFAULT now()
);
;

CREATE TABLE IF NOT EXISTS "instance_addon_purchases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" varchar NOT NULL,
	"pack_id" varchar NOT NULL,
	"tier_id_at_purchase" varchar NOT NULL,
	"quantity" integer NOT NULL,
	"price_per_inspection" integer NOT NULL,
	"total_price" integer NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"purchase_date" timestamp DEFAULT now(),
	"expiry_date" timestamp,
	"inspections_used" integer DEFAULT 0,
	"inspections_remaining" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active'
);
;

CREATE TABLE IF NOT EXISTS "instance_bundles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" varchar NOT NULL,
	"bundle_id" varchar NOT NULL,
	"purchase_date" timestamp DEFAULT now(),
	"is_active" boolean DEFAULT true NOT NULL,
	"start_date" timestamp DEFAULT now(),
	"end_date" timestamp,
	"bundle_price_monthly" integer,
	"bundle_price_annual" integer,
	"currency_code" varchar(3)
);

-- Add purchase_date column if it doesn't exist (for existing databases)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'instance_bundles' 
    AND column_name = 'purchase_date'
  ) THEN
    ALTER TABLE "public"."instance_bundles" ADD COLUMN "purchase_date" timestamp DEFAULT now();
  END IF;
END $$;
;

CREATE TABLE IF NOT EXISTS "instance_module_overrides" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" varchar NOT NULL,
	"module_id" varchar NOT NULL,
	"override_monthly_price" integer,
	"override_annual_price" integer,
	"override_reason" text,
	"override_set_by" varchar,
	"override_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL
);
;

CREATE TABLE IF NOT EXISTS "instance_modules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" varchar NOT NULL,
	"module_id" varchar NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"enabled_date" timestamp,
	"disabled_date" timestamp,
	"billing_start_date" timestamp,
	"monthly_price" integer,
	"annual_price" integer,
	"currency_code" varchar(3),
	"usage_limit" integer,
	"current_usage" integer DEFAULT 0,
	"overage_charges" integer DEFAULT 0
);
;

CREATE TABLE IF NOT EXISTS "instance_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"registration_currency" varchar(3) NOT NULL,
	"current_tier_id" varchar,
	"inspection_quota_included" integer NOT NULL,
	"billing_cycle" "billing_interval" DEFAULT 'monthly' NOT NULL,
	"subscription_start_date" timestamp DEFAULT now(),
	"subscription_renewal_date" timestamp,
	"subscription_status" varchar(20) DEFAULT 'active',
	"override_monthly_fee" integer,
	"override_annual_fee" integer,
	"override_reason" text,
	"override_set_by" varchar,
	"override_date" timestamp,
	CONSTRAINT "instance_subscriptions_organization_id_unique" UNIQUE("organization_id")
);
;

CREATE TABLE IF NOT EXISTS "marketplace_modules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"module_key" varchar(50) NOT NULL,
	"description" text,
	"icon_name" varchar(50),
	"is_available_globally" boolean DEFAULT true NOT NULL,
	"default_enabled" boolean DEFAULT false NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "marketplace_modules_module_key_unique" UNIQUE("module_key")
);
;

CREATE TABLE IF NOT EXISTS "module_bundles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"discount_percentage" numeric(5, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
;

CREATE TABLE IF NOT EXISTS "module_limits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" varchar NOT NULL,
	"limit_type" "limit_type" NOT NULL,
	"included_quantity" integer NOT NULL,
	"overage_price" integer NOT NULL,
	"overage_currency" varchar(3) NOT NULL
);
;

CREATE TABLE IF NOT EXISTS "module_pricing" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" varchar NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"price_monthly" integer NOT NULL,
	"price_annual" integer NOT NULL,
	"last_updated" timestamp DEFAULT now()
);
;

CREATE TABLE IF NOT EXISTS "pricing_override_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" varchar NOT NULL,
	"override_type" "override_type" NOT NULL,
	"target_id" varchar NOT NULL,
	"old_price_monthly" integer,
	"new_price_monthly" integer,
	"old_price_annual" integer,
	"new_price_annual" integer,
	"reason" text,
	"changed_by" varchar,
	"change_date" timestamp DEFAULT now()
);
;

CREATE TABLE IF NOT EXISTS "subscription_tiers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" "plan_code" NOT NULL,
	"description" text,
	"tier_order" integer NOT NULL,
	"included_inspections" integer NOT NULL,
	"base_price_monthly" integer NOT NULL,
	"base_price_annual" integer NOT NULL,
	"annual_discount_percentage" numeric(5, 2) DEFAULT '16.70',
	"is_active" boolean DEFAULT true NOT NULL,
	"requires_custom_pricing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "subscription_tiers_code_unique" UNIQUE("code")
);

-- Add description column if it doesn't exist (for existing databases)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'subscription_tiers' 
    AND column_name = 'description'
  ) THEN
    ALTER TABLE "public"."subscription_tiers" ADD COLUMN "description" text;
  END IF;
END $$;
;

CREATE TABLE IF NOT EXISTS "tier_pricing" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier_id" varchar NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"price_monthly" integer NOT NULL,
	"price_annual" integer NOT NULL,
	"last_updated" timestamp DEFAULT now()
);
;

ALTER TABLE "inspections" ADD COLUMN IF NOT EXISTS "tenant_approval_status" varchar;;

ALTER TABLE "inspections" ADD COLUMN IF NOT EXISTS "tenant_approval_deadline" timestamp;;

ALTER TABLE "inspections" ADD COLUMN IF NOT EXISTS "tenant_approved_at" timestamp;;

ALTER TABLE "inspections" ADD COLUMN IF NOT EXISTS "tenant_approved_by" varchar;;

ALTER TABLE "inspections" ADD COLUMN IF NOT EXISTS "tenant_comments" text;;

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "tenant_portal_community_enabled" boolean DEFAULT true;;

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "tenant_portal_comparison_enabled" boolean DEFAULT true;;

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "tenant_portal_chatbot_enabled" boolean DEFAULT true;;

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "tenant_portal_maintenance_enabled" boolean DEFAULT true;;

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "check_in_approval_period_days" integer DEFAULT 5;;

DO $$ BEGIN
  ALTER TABLE "addon_pack_pricing" ADD CONSTRAINT "addon_pack_pricing_pack_id_addon_pack_config_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."addon_pack_config"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "addon_pack_pricing" ADD CONSTRAINT "addon_pack_pricing_tier_id_subscription_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."subscription_tiers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "addon_pack_pricing" ADD CONSTRAINT "addon_pack_pricing_currency_code_currency_config_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currency_config"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "bundle_modules_junction" ADD CONSTRAINT "bundle_modules_junction_bundle_id_module_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."module_bundles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "bundle_modules_junction" ADD CONSTRAINT "bundle_modules_junction_module_id_marketplace_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."marketplace_modules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "bundle_pricing" ADD CONSTRAINT "bundle_pricing_bundle_id_module_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."module_bundles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "bundle_pricing" ADD CONSTRAINT "bundle_pricing_currency_code_currency_config_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currency_config"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "extensive_inspection_pricing" ADD CONSTRAINT "ext_insp_pricing_type_id_fk" FOREIGN KEY ("extensive_type_id") REFERENCES "public"."extensive_inspection_config"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "extensive_inspection_pricing" ADD CONSTRAINT "ext_insp_pricing_tier_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."subscription_tiers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "extensive_inspection_pricing" ADD CONSTRAINT "ext_insp_pricing_currency_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currency_config"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_addon_purchases" ADD CONSTRAINT "inst_addon_purchases_instance_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instance_subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_addon_purchases" ADD CONSTRAINT "inst_addon_purchases_pack_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."addon_pack_config"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_addon_purchases" ADD CONSTRAINT "inst_addon_purchases_tier_fk" FOREIGN KEY ("tier_id_at_purchase") REFERENCES "public"."subscription_tiers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_addon_purchases" ADD CONSTRAINT "inst_addon_purchases_currency_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currency_config"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_bundles" ADD CONSTRAINT "inst_bundles_instance_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instance_subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_bundles" ADD CONSTRAINT "inst_bundles_bundle_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."module_bundles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_bundles" ADD CONSTRAINT "inst_bundles_currency_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currency_config"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_module_overrides" ADD CONSTRAINT "inst_module_overrides_instance_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instance_subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_module_overrides" ADD CONSTRAINT "instance_module_overrides_module_id_marketplace_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."marketplace_modules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_module_overrides" ADD CONSTRAINT "instance_module_overrides_override_set_by_admin_users_id_fk" FOREIGN KEY ("override_set_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_modules" ADD CONSTRAINT "inst_modules_instance_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instance_subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_modules" ADD CONSTRAINT "inst_modules_module_fk" FOREIGN KEY ("module_id") REFERENCES "public"."marketplace_modules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_modules" ADD CONSTRAINT "inst_modules_currency_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currency_config"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_subscriptions" ADD CONSTRAINT "inst_subs_org_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_subscriptions" ADD CONSTRAINT "inst_subs_reg_currency_fk" FOREIGN KEY ("registration_currency") REFERENCES "public"."currency_config"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_subscriptions" ADD CONSTRAINT "inst_subs_tier_fk" FOREIGN KEY ("current_tier_id") REFERENCES "public"."subscription_tiers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "instance_subscriptions" ADD CONSTRAINT "inst_subs_override_by_fk" FOREIGN KEY ("override_set_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "module_limits" ADD CONSTRAINT "module_limits_module_id_marketplace_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."marketplace_modules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "module_limits" ADD CONSTRAINT "module_limits_overage_currency_currency_config_code_fk" FOREIGN KEY ("overage_currency") REFERENCES "public"."currency_config"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "module_pricing" ADD CONSTRAINT "module_pricing_module_id_marketplace_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."marketplace_modules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "module_pricing" ADD CONSTRAINT "module_pricing_currency_code_currency_config_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currency_config"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "pricing_override_history" ADD CONSTRAINT "pricing_override_hist_instance_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instance_subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "pricing_override_history" ADD CONSTRAINT "pricing_override_hist_changed_by_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "tier_pricing" ADD CONSTRAINT "tier_pricing_tier_id_subscription_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."subscription_tiers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

DO $$ BEGIN
  ALTER TABLE "tier_pricing" ADD CONSTRAINT "tier_pricing_currency_code_currency_config_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currency_config"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;;

CREATE INDEX IF NOT EXISTS "idx_group_members_group" ON "community_group_members" USING btree ("group_id");;

CREATE INDEX IF NOT EXISTS "idx_group_members_tenant" ON "community_group_members" USING btree ("tenant_id");;

CREATE INDEX IF NOT EXISTS "idx_community_groups_org" ON "community_groups" USING btree ("organization_id");;

CREATE INDEX IF NOT EXISTS "idx_community_groups_block" ON "community_groups" USING btree ("block_id");;

CREATE INDEX IF NOT EXISTS "idx_community_groups_status" ON "community_groups" USING btree ("status");;

CREATE INDEX IF NOT EXISTS "idx_community_groups_creator" ON "community_groups" USING btree ("created_by");;

CREATE INDEX IF NOT EXISTS "idx_rule_acceptances_tenant" ON "community_rule_acceptances" USING btree ("tenant_id");;

CREATE INDEX IF NOT EXISTS "idx_rule_acceptances_org" ON "community_rule_acceptances" USING btree ("organization_id");;

CREATE INDEX IF NOT EXISTS "idx_community_rules_org" ON "community_rules" USING btree ("organization_id");;

CREATE INDEX IF NOT EXISTS "idx_community_rules_active" ON "community_rules" USING btree ("organization_id","is_active");;

CREATE INDEX IF NOT EXISTS "idx_tenant_blocks_org" ON "community_tenant_blocks" USING btree ("organization_id");;

CREATE INDEX IF NOT EXISTS "idx_tenant_blocks_tenant" ON "community_tenant_blocks" USING btree ("tenant_user_id");;

CREATE INDEX IF NOT EXISTS "idx_community_threads_group" ON "community_threads" USING btree ("group_id");;

CREATE INDEX IF NOT EXISTS "idx_community_threads_creator" ON "community_threads" USING btree ("created_by");;

CREATE INDEX IF NOT EXISTS "idx_community_threads_status" ON "community_threads" USING btree ("status");;

CREATE INDEX IF NOT EXISTS "idx_community_threads_activity" ON "community_threads" USING btree ("last_activity_at");

-- 2. SEEDED DATA
-- Inspect360 Marketplace & Pricing Data 2026
-- Generated for Direct pgAdmin Import

-- Data for currency_config
INSERT INTO currency_config ("code", "symbol", "is_active", "default_for_region", "conversion_rate", "created_at", "updated_at") VALUES ('GBP', '£', TRUE, 'UK', '1.0000', '2025-12-28T19:06:41.821Z', '2025-12-28T19:06:41.821Z') ON CONFLICT DO NOTHING;
INSERT INTO currency_config ("code", "symbol", "is_active", "default_for_region", "conversion_rate", "created_at", "updated_at") VALUES ('USD', '$', TRUE, 'US', '1.2700', '2025-12-28T19:06:41.838Z', '2025-12-28T19:06:41.838Z') ON CONFLICT DO NOTHING;
INSERT INTO currency_config ("code", "symbol", "is_active", "default_for_region", "conversion_rate", "created_at", "updated_at") VALUES ('AED', 'AED', TRUE, 'UAE', '4.6600', '2025-12-28T19:06:41.840Z', '2025-12-28T19:06:41.840Z') ON CONFLICT DO NOTHING;

-- Data for subscription_tiers
INSERT INTO subscription_tiers ("id", "name", "code", "tier_order", "included_inspections", "base_price_monthly", "base_price_annual", "annual_discount_percentage", "is_active", "requires_custom_pricing", "created_at", "updated_at") VALUES ('626bee64-a380-4a5f-8377-fe864d083045', 'Starter', 'starter', 1, 10, 4900, 49000, '16.70', TRUE, FALSE, '2025-12-28T19:06:41.844Z', '2025-12-28T19:06:41.844Z') ON CONFLICT DO NOTHING;

-- Insert Growth tier only if the enum value exists (to avoid "unsafe use of new enum value" error)
DO $$
DECLARE
  enum_exists boolean;
BEGIN
  -- Check if 'growth' enum value exists
  SELECT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'growth' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'plan_code')
  ) INTO enum_exists;
  
  IF enum_exists THEN
    INSERT INTO subscription_tiers ("id", "name", "code", "tier_order", "included_inspections", "base_price_monthly", "base_price_annual", "annual_discount_percentage", "is_active", "requires_custom_pricing", "created_at", "updated_at") 
    VALUES ('d0d7af4e-7d6f-46d8-9a5a-3adef9c9c220', 'Growth', 'growth', 2, 30, 12900, 129000, '16.70', TRUE, FALSE, '2025-12-28T19:06:41.875Z', '2025-12-28T19:06:41.875Z') 
    ON CONFLICT DO NOTHING;
  ELSE
    RAISE NOTICE 'Skipping Growth tier insert - enum value "growth" does not exist in plan_code. Please run: ALTER TYPE "public"."plan_code" ADD VALUE ''growth'' BEFORE ''professional''; and commit, then re-run this script.';
  END IF;
END $$;
INSERT INTO subscription_tiers ("id", "name", "code", "tier_order", "included_inspections", "base_price_monthly", "base_price_annual", "annual_discount_percentage", "is_active", "requires_custom_pricing", "created_at", "updated_at") VALUES ('b266846d-96b0-4e74-a2b4-03e307b28a08', 'Professional', 'professional', 3, 75, 29900, 299000, '16.70', TRUE, FALSE, '2025-12-28T19:06:41.884Z', '2025-12-28T19:06:41.884Z') ON CONFLICT DO NOTHING;
INSERT INTO subscription_tiers ("id", "name", "code", "tier_order", "included_inspections", "base_price_monthly", "base_price_annual", "annual_discount_percentage", "is_active", "requires_custom_pricing", "created_at", "updated_at") VALUES ('eda7e5ba-0f5e-4ed4-9215-67a91310becb', 'Enterprise', 'enterprise', 4, 200, 69900, 699000, '16.70', TRUE, FALSE, '2025-12-28T19:06:41.891Z', '2025-12-28T19:06:41.891Z') ON CONFLICT DO NOTHING;
INSERT INTO subscription_tiers ("id", "name", "code", "tier_order", "included_inspections", "base_price_monthly", "base_price_annual", "annual_discount_percentage", "is_active", "requires_custom_pricing", "created_at", "updated_at") VALUES ('6c79daec-9645-4fe8-baf1-5584ec5b8a17', 'Enterprise Plus', 'enterprise_plus', 5, 500, 0, 0, '16.70', TRUE, TRUE, '2025-12-28T19:06:41.899Z', '2025-12-28T19:06:41.899Z') ON CONFLICT DO NOTHING;

-- Data for tier_pricing
INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('144d44e7-59a7-4bbb-8b49-d4dc86b2a5d8', '626bee64-a380-4a5f-8377-fe864d083045', 'GBP', 4900, 49000, '2025-12-28T19:06:41.864Z') ON CONFLICT DO NOTHING;
INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('ebfbb220-f31a-41c0-ad9e-301218783403', '626bee64-a380-4a5f-8377-fe864d083045', 'USD', 6125, 61250, '2025-12-28T19:06:41.870Z') ON CONFLICT DO NOTHING;
INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('ca24e0e1-6e25-4f05-a391-b63e6d7e3457', '626bee64-a380-4a5f-8377-fe864d083045', 'AED', 22540, 225400, '2025-12-28T19:06:41.872Z') ON CONFLICT DO NOTHING;
-- Insert Growth tier pricing only if the Growth tier exists
DO $$
DECLARE
  growth_tier_exists boolean;
BEGIN
  -- Check if Growth tier exists
  SELECT EXISTS (
    SELECT 1 FROM subscription_tiers 
    WHERE id = 'd0d7af4e-7d6f-46d8-9a5a-3adef9c9c220'
  ) INTO growth_tier_exists;
  
  IF growth_tier_exists THEN
    INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('4f42f0b7-75f0-4688-b7a9-086af676b522', 'd0d7af4e-7d6f-46d8-9a5a-3adef9c9c220', 'GBP', 12900, 129000, '2025-12-28T19:06:41.878Z') ON CONFLICT DO NOTHING;
    INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('f9e4db62-ff92-44f8-b5ed-12eb6d9e1612', 'd0d7af4e-7d6f-46d8-9a5a-3adef9c9c220', 'USD', 16125, 161250, '2025-12-28T19:06:41.880Z') ON CONFLICT DO NOTHING;
    INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('e076bcc6-1c0d-46b2-a251-c59fa3a8e519', 'd0d7af4e-7d6f-46d8-9a5a-3adef9c9c220', 'AED', 59340, 593400, '2025-12-28T19:06:41.882Z') ON CONFLICT DO NOTHING;
  END IF;
END $$;
INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('4c4b8a33-2d4a-4cd9-a2e3-3a225477dc9f', 'b266846d-96b0-4e74-a2b4-03e307b28a08', 'GBP', 29900, 299000, '2025-12-28T19:06:41.886Z') ON CONFLICT DO NOTHING;
INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('fae016b5-ff0a-434f-8b91-ebb6e65c6fa7', 'b266846d-96b0-4e74-a2b4-03e307b28a08', 'USD', 37375, 373750, '2025-12-28T19:06:41.888Z') ON CONFLICT DO NOTHING;
INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('934c99fe-cf11-438d-b029-f7f8d5789bfd', 'b266846d-96b0-4e74-a2b4-03e307b28a08', 'AED', 137540, 1375400, '2025-12-28T19:06:41.889Z') ON CONFLICT DO NOTHING;
INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('c8b2b37c-f968-4e6d-a2c1-c3fe997c3323', 'eda7e5ba-0f5e-4ed4-9215-67a91310becb', 'GBP', 69900, 699000, '2025-12-28T19:06:41.893Z') ON CONFLICT DO NOTHING;
INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('912cd17b-bc39-4e63-ac19-af81ee4c7251', 'eda7e5ba-0f5e-4ed4-9215-67a91310becb', 'USD', 87375, 873750, '2025-12-28T19:06:41.895Z') ON CONFLICT DO NOTHING;
INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('88398b52-359c-4143-bec5-1131648c88f0', 'eda7e5ba-0f5e-4ed4-9215-67a91310becb', 'AED', 321540, 3215400, '2025-12-28T19:06:41.897Z') ON CONFLICT DO NOTHING;
INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('4ed1a76c-a6bf-4e7f-948d-8845332da098', '6c79daec-9645-4fe8-baf1-5584ec5b8a17', 'GBP', 0, 0, '2025-12-28T19:06:41.901Z') ON CONFLICT DO NOTHING;
INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('4f0be062-b581-4abf-8b24-bf38d6a13f72', '6c79daec-9645-4fe8-baf1-5584ec5b8a17', 'USD', 0, 0, '2025-12-28T19:06:41.902Z') ON CONFLICT DO NOTHING;
INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('6e762247-f3c6-4098-b696-b84763e7a7ac', '6c79daec-9645-4fe8-baf1-5584ec5b8a17', 'AED', 0, 0, '2025-12-28T19:06:41.904Z') ON CONFLICT DO NOTHING;
INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('51e8857c-0879-4091-8fe4-7add13b4c7d0', 'b266846d-96b0-4e74-a2b4-03e307b28a08', 'GBP', 69900, 699000, '2025-12-28T19:20:41.564Z') ON CONFLICT DO NOTHING;
INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('9c86a5b0-4b8e-4ade-8374-8d91c27935ad', 'b266846d-96b0-4e74-a2b4-03e307b28a08', 'USD', 89900, 899000, '2025-12-28T19:20:41.599Z') ON CONFLICT DO NOTHING;
INSERT INTO tier_pricing ("id", "tier_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('1ad0e6ad-3318-489c-ab40-8254670a60a0', 'b266846d-96b0-4e74-a2b4-03e307b28a08', 'AED', 320000, 3200000, '2025-12-28T19:20:41.601Z') ON CONFLICT DO NOTHING;

-- Data for addon_pack_config
INSERT INTO addon_pack_config ("id", "name", "inspection_quantity", "pack_order", "is_active", "created_at") VALUES ('083d8cc3-c37e-48b5-a9be-4c6016f9d847', '20 Pack', 20, 1, TRUE, '2025-12-28T19:20:41.657Z') ON CONFLICT DO NOTHING;
INSERT INTO addon_pack_config ("id", "name", "inspection_quantity", "pack_order", "is_active", "created_at") VALUES ('a80b5f94-577a-4eee-ad5d-3c0b2d0e5943', '50 Pack', 50, 2, TRUE, '2025-12-28T19:20:41.661Z') ON CONFLICT DO NOTHING;
INSERT INTO addon_pack_config ("id", "name", "inspection_quantity", "pack_order", "is_active", "created_at") VALUES ('bebaf571-d683-4112-b8d3-f4c6b6318272', '100 Pack', 100, 3, TRUE, '2025-12-28T19:20:41.663Z') ON CONFLICT DO NOTHING;

-- Data for extensive_inspection_config
INSERT INTO extensive_inspection_config ("id", "name", "image_count", "description", "is_active") VALUES ('1e85365a-7c1e-41dc-bddf-c343973c8838', 'Fire Assessment', 800, 'Full fire safety audit', TRUE) ON CONFLICT DO NOTHING;
INSERT INTO extensive_inspection_config ("id", "name", "image_count", "description", "is_active") VALUES ('898f0eeb-d433-419d-87e8-bc5ae59b0918', 'Full Building Survey', 1500, 'Structural survey', TRUE) ON CONFLICT DO NOTHING;

-- Data for marketplace_modules
INSERT INTO marketplace_modules ("id", "name", "module_key", "description", "icon_name", "is_available_globally", "default_enabled", "display_order", "created_at", "updated_at") VALUES ('fb11e485-10d1-4b9c-8b8d-a59c36ef7650', 'White Labelling', 'white_label', 'Custom branding, domain, and reports', 'palette', TRUE, FALSE, 1, '2025-12-28T19:06:41.906Z', '2025-12-28T19:06:41.906Z') ON CONFLICT DO NOTHING;
INSERT INTO marketplace_modules ("id", "name", "module_key", "description", "icon_name", "is_available_globally", "default_enabled", "display_order", "created_at", "updated_at") VALUES ('73e59766-aeba-4cbe-9f2c-efce1f41144c', 'Tenant Portal', 'tenant_portal', 'Self-service portal for tenants', 'users', TRUE, FALSE, 2, '2025-12-28T19:06:41.917Z', '2025-12-28T19:06:41.917Z') ON CONFLICT DO NOTHING;
INSERT INTO marketplace_modules ("id", "name", "module_key", "description", "icon_name", "is_available_globally", "default_enabled", "display_order", "created_at", "updated_at") VALUES ('d4fdb090-31cd-4a96-be4d-7f7f9dcf1125', 'Maintenance & Work Orders', 'maintenance', 'Track and manage repairs and contractors', 'tool', TRUE, FALSE, 3, '2025-12-28T19:06:41.925Z', '2025-12-28T19:06:41.925Z') ON CONFLICT DO NOTHING;
INSERT INTO marketplace_modules ("id", "name", "module_key", "description", "icon_name", "is_available_globally", "default_enabled", "display_order", "created_at", "updated_at") VALUES ('f332a452-fe95-4a44-bb15-7ede9406d6ca', 'AI Preventative Maintenance', 'ai_preventative', 'Predict maintenance needs with AI', 'cpu', TRUE, FALSE, 4, '2025-12-28T19:06:41.932Z', '2025-12-28T19:06:41.932Z') ON CONFLICT DO NOTHING;
INSERT INTO marketplace_modules ("id", "name", "module_key", "description", "icon_name", "is_available_globally", "default_enabled", "display_order", "created_at", "updated_at") VALUES ('9b939df3-35c3-4a98-ab43-cb7e539afea8', 'Dispute Resolution Portal', 'dispute_resolution', 'Manage deposit disputes with evidence', 'shield', TRUE, FALSE, 5, '2025-12-28T19:06:41.939Z', '2025-12-28T19:06:41.939Z') ON CONFLICT DO NOTHING;
INSERT INTO marketplace_modules ("id", "name", "module_key", "description", "icon_name", "is_available_globally", "default_enabled", "display_order", "created_at", "updated_at") VALUES ('749f8b13-394c-48ae-b5f5-49e2ad617200', 'Fundraising', 'fundraising', 'Create and manage fundraising campaigns with QR codes and online donations', 'target', TRUE, FALSE, 6, '2025-12-28T19:06:41.946Z', '2025-12-28T19:06:41.946Z') ON CONFLICT DO NOTHING;
INSERT INTO marketplace_modules ("id", "name", "module_key", "description", "icon_name", "is_available_globally", "default_enabled", "display_order", "created_at", "updated_at") VALUES ('15aed8ec-b806-4584-9089-cccf384cc1e4', 'Events & Ticketing', 'events_ticketing', 'Manage events, sell tickets, and track attendees with integrated payments', 'calendar', TRUE, FALSE, 7, '2025-12-28T19:06:41.952Z', '2025-12-28T19:06:41.952Z') ON CONFLICT DO NOTHING;
INSERT INTO marketplace_modules ("id", "name", "module_key", "description", "icon_name", "is_available_globally", "default_enabled", "display_order", "created_at", "updated_at") VALUES ('88187200-f601-439b-8f00-97b9ebcc2474', 'Livestream Overlays', 'livestream_overlays', 'Display real-time donation overlays during livestreams with customizable alerts', 'video', TRUE, FALSE, 8, '2025-12-28T19:06:41.959Z', '2025-12-28T19:06:41.959Z') ON CONFLICT DO NOTHING;
INSERT INTO marketplace_modules ("id", "name", "module_key", "description", "icon_name", "is_available_globally", "default_enabled", "display_order", "created_at", "updated_at") VALUES ('95889407-c44b-41dd-bb55-0cd17e53d17a', 'Volunteer Management', 'volunteer_management', 'Comprehensive volunteer tracking and management system', 'users', TRUE, FALSE, 9, '2025-12-28T19:06:41.965Z', '2025-12-28T19:06:41.965Z') ON CONFLICT DO NOTHING;
INSERT INTO marketplace_modules ("id", "name", "module_key", "description", "icon_name", "is_available_globally", "default_enabled", "display_order", "created_at", "updated_at") VALUES ('6f94f17f-b31c-4b9f-b35c-64fcbe82ee03', 'AI Preventative Maintenance', 'ai_maintenance', 'Predict maintenance needs with AI', 'Sparkles', TRUE, FALSE, 4, '2025-12-28T19:20:41.611Z', '2025-12-28T19:20:41.611Z') ON CONFLICT DO NOTHING;
INSERT INTO marketplace_modules ("id", "name", "module_key", "description", "icon_name", "is_available_globally", "default_enabled", "display_order", "created_at", "updated_at") VALUES ('611e6dbd-dec5-432e-9756-a0dc1a4e5199', 'Dispute Resolution Portal', 'dispute_portal', 'Manage deposit disputes with evidence', 'ShieldCheck', TRUE, FALSE, 5, '2025-12-28T19:20:41.616Z', '2025-12-28T19:20:41.616Z') ON CONFLICT DO NOTHING;

-- Data for module_pricing
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('728a560c-5750-4f5b-b508-85edff80dbd4', 'fb11e485-10d1-4b9c-8b8d-a59c36ef7650', 'GBP', 15000, 150000, '2025-12-28T19:06:41.910Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('6fb08d43-bedd-4ea6-9274-c1c4faa10e6c', 'fb11e485-10d1-4b9c-8b8d-a59c36ef7650', 'USD', 19000, 190000, '2025-12-28T19:06:41.914Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('12c4b407-e893-4c72-a0a1-153eba1170c5', 'fb11e485-10d1-4b9c-8b8d-a59c36ef7650', 'AED', 70000, 700000, '2025-12-28T19:06:41.915Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('ab6277ed-450a-4b0e-8737-bb02775848af', '73e59766-aeba-4cbe-9f2c-efce1f41144c', 'GBP', 15000, 150000, '2025-12-28T19:06:41.919Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('f8bdd225-7976-417e-b951-e7c179865c95', '73e59766-aeba-4cbe-9f2c-efce1f41144c', 'USD', 19000, 190000, '2025-12-28T19:06:41.922Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('1ebfef9e-ce5e-431b-8c66-c5cb75568be0', '73e59766-aeba-4cbe-9f2c-efce1f41144c', 'AED', 70000, 700000, '2025-12-28T19:06:41.923Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('8a70750f-5f6f-46fb-ac1b-a790dfa3039a', 'd4fdb090-31cd-4a96-be4d-7f7f9dcf1125', 'GBP', 15000, 150000, '2025-12-28T19:06:41.927Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('126774bb-22e8-4db4-a413-7be6d8c20e0e', 'd4fdb090-31cd-4a96-be4d-7f7f9dcf1125', 'USD', 19000, 190000, '2025-12-28T19:06:41.928Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('3d45abfd-f147-4960-9588-735a476fb156', 'd4fdb090-31cd-4a96-be4d-7f7f9dcf1125', 'AED', 70000, 700000, '2025-12-28T19:06:41.930Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('dbc8994a-87b4-4ecc-8aac-cb7e45adceee', 'f332a452-fe95-4a44-bb15-7ede9406d6ca', 'GBP', 15000, 150000, '2025-12-28T19:06:41.934Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('5ab09c75-3040-42ce-bcfe-a35bf62ff5ba', 'f332a452-fe95-4a44-bb15-7ede9406d6ca', 'USD', 19000, 190000, '2025-12-28T19:06:41.936Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('30433f87-b847-44b1-b22e-5fe6dedc4215', 'f332a452-fe95-4a44-bb15-7ede9406d6ca', 'AED', 70000, 700000, '2025-12-28T19:06:41.937Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('5599891a-804a-46ff-9661-c9f5f6bf4626', '9b939df3-35c3-4a98-ab43-cb7e539afea8', 'GBP', 15000, 150000, '2025-12-28T19:06:41.941Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('48104b01-569f-479d-867e-9b7734be81e3', '9b939df3-35c3-4a98-ab43-cb7e539afea8', 'USD', 19000, 190000, '2025-12-28T19:06:41.942Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('acb2e6d5-159e-43bb-9d23-869658e5b6de', '9b939df3-35c3-4a98-ab43-cb7e539afea8', 'AED', 70000, 700000, '2025-12-28T19:06:41.944Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('bc6b6087-4694-4476-b6d7-5164aa29d2c2', '749f8b13-394c-48ae-b5f5-49e2ad617200', 'GBP', 15000, 150000, '2025-12-28T19:06:41.947Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('47e5bf1e-d3d6-471d-8438-e6e380693057', '749f8b13-394c-48ae-b5f5-49e2ad617200', 'USD', 19000, 190000, '2025-12-28T19:06:41.949Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('0993d4ad-1ae3-4fef-bdef-2faf2fa425e7', '749f8b13-394c-48ae-b5f5-49e2ad617200', 'AED', 70000, 700000, '2025-12-28T19:06:41.950Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('4d461718-602c-458f-a556-e6b85b6825b9', '15aed8ec-b806-4584-9089-cccf384cc1e4', 'GBP', 15000, 150000, '2025-12-28T19:06:41.954Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('d1e07e76-7a8f-4622-9f33-81a26fa57d8c', '15aed8ec-b806-4584-9089-cccf384cc1e4', 'USD', 19000, 190000, '2025-12-28T19:06:41.955Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('ef1b46eb-ab4d-4f40-8381-16222a5c9c49', '15aed8ec-b806-4584-9089-cccf384cc1e4', 'AED', 70000, 700000, '2025-12-28T19:06:41.957Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('1bee8c57-fcaf-4c0b-b989-9ded8b4abf7e', '88187200-f601-439b-8f00-97b9ebcc2474', 'GBP', 15000, 150000, '2025-12-28T19:06:41.961Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('bc1fdf38-18e8-4b20-abc0-b2eb371cc5c2', '88187200-f601-439b-8f00-97b9ebcc2474', 'USD', 19000, 190000, '2025-12-28T19:06:41.962Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('b2f45255-0edb-4a24-9ae9-6ab4e0057f5a', '88187200-f601-439b-8f00-97b9ebcc2474', 'AED', 70000, 700000, '2025-12-28T19:06:41.963Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('29450070-75d1-48a5-ac04-f855802c2a58', '95889407-c44b-41dd-bb55-0cd17e53d17a', 'GBP', 15000, 150000, '2025-12-28T19:06:41.968Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('5e9ffb5c-b373-4f57-8526-5d4752c7e37a', '95889407-c44b-41dd-bb55-0cd17e53d17a', 'USD', 19000, 190000, '2025-12-28T19:06:41.969Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('11cabf61-e512-4568-9223-64bfea9e90f4', '95889407-c44b-41dd-bb55-0cd17e53d17a', 'AED', 70000, 700000, '2025-12-28T19:06:41.971Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('3ad831b1-ba43-451c-92a3-101522401bb5', 'fb11e485-10d1-4b9c-8b8d-a59c36ef7650', 'GBP', 23900, 239000, '2025-12-28T19:20:41.624Z') ON CONFLICT DO NOTHING;
INSERT INTO module_pricing ("id", "module_id", "currency_code", "price_monthly", "price_annual", "last_updated") VALUES ('2092ba8e-26ff-495d-afd2-d7e8f0922af4', 'fb11e485-10d1-4b9c-8b8d-a59c36ef7650', 'USD', 29900, 299000, '2025-12-28T19:20:41.629Z') ON CONFLICT DO NOTHING;

-- Data for module_bundles
INSERT INTO module_bundles ("id", "name", "description", "discount_percentage", "is_active", "created_at") VALUES ('d89ba38a-0e7e-4c8b-b70f-6121d891a9df', 'Essential Bundle', 'Tenant Portal + Maintenance', '12.00', TRUE, '2025-12-28T19:06:41.973Z') ON CONFLICT DO NOTHING;
INSERT INTO module_bundles ("id", "name", "description", "discount_percentage", "is_active", "created_at") VALUES ('2ba564b9-7900-4360-804a-2613db5b52e0', 'Premium Bundle', 'All premium features included', '20.00', TRUE, '2025-12-28T19:06:41.980Z') ON CONFLICT DO NOTHING;
INSERT INTO module_bundles ("id", "name", "description", "discount_percentage", "is_active", "created_at") VALUES ('c874323c-120b-4dab-99aa-418462804c50', 'Essential Bundle', 'Tenant Portal + Maintenance', '12.00', TRUE, '2025-12-28T19:20:41.632Z') ON CONFLICT DO NOTHING;
INSERT INTO module_bundles ("id", "name", "description", "discount_percentage", "is_active", "created_at") VALUES ('156d331c-45b0-49b5-9345-94050db5f8b0', 'Premium Bundle', 'All Modules', '20.00', TRUE, '2025-12-28T19:20:41.641Z') ON CONFLICT DO NOTHING;

-- Data for bundle_modules_junction
INSERT INTO bundle_modules_junction ("bundle_id", "module_id") VALUES ('d89ba38a-0e7e-4c8b-b70f-6121d891a9df', '73e59766-aeba-4cbe-9f2c-efce1f41144c') ON CONFLICT DO NOTHING;
INSERT INTO bundle_modules_junction ("bundle_id", "module_id") VALUES ('d89ba38a-0e7e-4c8b-b70f-6121d891a9df', 'd4fdb090-31cd-4a96-be4d-7f7f9dcf1125') ON CONFLICT DO NOTHING;

-- Data for bundle_pricing
INSERT INTO bundle_pricing ("id", "bundle_id", "currency_code", "price_monthly", "price_annual", "savings_monthly", "last_updated") VALUES ('873e486b-a403-4449-9ae0-f0bb7e9f41b6', 'd89ba38a-0e7e-4c8b-b70f-6121d891a9df', 'GBP', 27900, 279000, 3900, '2025-12-28T19:06:41.976Z') ON CONFLICT DO NOTHING;
INSERT INTO bundle_pricing ("id", "bundle_id", "currency_code", "price_monthly", "price_annual", "savings_monthly", "last_updated") VALUES ('c3d3b7ca-293c-4b18-adab-4b69ec004bd8', '2ba564b9-7900-4360-804a-2613db5b52e0', 'GBP', 27900, 279000, 3900, '2025-12-28T19:06:41.982Z') ON CONFLICT DO NOTHING;

