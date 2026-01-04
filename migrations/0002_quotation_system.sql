-- Migration: Add Quotation System Tables
-- Created for Enterprise+ custom quotation requests

-- Create quotation_requests table
CREATE TABLE "quotation_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"requested_inspections" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"preferred_billing_period" "billing_interval" NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"customer_notes" text,
	"assigned_admin_id" varchar,
	"viewed_by_customer_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

-- Create quotations table
CREATE TABLE "quotations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_request_id" varchar NOT NULL,
	"quoted_price" integer NOT NULL,
	"quoted_inspections" integer NOT NULL,
	"billing_period" "billing_interval" NOT NULL,
	"currency" varchar(3) NOT NULL,
	"admin_notes" text,
	"customer_notes" text,
	"created_by" varchar NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

-- Create quotation_activity_log table
CREATE TABLE "quotation_activity_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_request_id" varchar NOT NULL,
	"action" varchar(50) NOT NULL,
	"performed_by" varchar NOT NULL,
	"performed_by_type" varchar(20) NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint

-- Add foreign key constraints
ALTER TABLE "quotation_requests" ADD CONSTRAINT "quotation_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint

ALTER TABLE "quotation_requests" ADD CONSTRAINT "quotation_requests_assigned_admin_id_admin_users_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint

ALTER TABLE "quotation_requests" ADD CONSTRAINT "quotation_requests_currency_currency_config_code_fk" FOREIGN KEY ("currency") REFERENCES "currency_config"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint

ALTER TABLE "quotations" ADD CONSTRAINT "quotations_quotation_request_id_quotation_requests_id_fk" FOREIGN KEY ("quotation_request_id") REFERENCES "quotation_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint

ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint

ALTER TABLE "quotations" ADD CONSTRAINT "quotations_currency_currency_config_code_fk" FOREIGN KEY ("currency") REFERENCES "currency_config"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint

ALTER TABLE "quotation_activity_log" ADD CONSTRAINT "quotation_activity_log_quotation_request_id_quotation_requests_id_fk" FOREIGN KEY ("quotation_request_id") REFERENCES "quotation_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint

-- Create indexes for better query performance
CREATE INDEX "idx_quotation_requests_organization" ON "quotation_requests"("organization_id");
--> statement-breakpoint

CREATE INDEX "idx_quotation_requests_status" ON "quotation_requests"("status");
--> statement-breakpoint

CREATE INDEX "idx_quotation_requests_assigned_admin" ON "quotation_requests"("assigned_admin_id");
--> statement-breakpoint

CREATE INDEX "idx_quotations_request" ON "quotations"("quotation_request_id");
--> statement-breakpoint

CREATE INDEX "idx_quotations_status" ON "quotations"("status");
--> statement-breakpoint

CREATE INDEX "idx_quotation_activity_log_request" ON "quotation_activity_log"("quotation_request_id");
--> statement-breakpoint

CREATE INDEX "idx_quotation_activity_log_created_at" ON "quotation_activity_log"("created_at");
--> statement-breakpoint

