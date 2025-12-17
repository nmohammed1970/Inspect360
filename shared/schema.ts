import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  boolean,
  pgEnum,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Enums
export const userRoleEnum = pgEnum("user_role", ["owner", "clerk", "compliance", "tenant", "contractor"]);
export const inspectionStatusEnum = pgEnum("inspection_status", ["scheduled", "in_progress", "completed", "reviewed"]);
export const inspectionTypeEnum = pgEnum("inspection_type", ["check_in", "check_out", "routine", "maintenance"]);
export const complianceStatusEnum = pgEnum("compliance_status", ["current", "expiring_soon", "expired"]);
export const maintenanceStatusEnum = pgEnum("maintenance_status", ["open", "in_progress", "completed", "closed"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "inactive", "cancelled"]);
export const subscriptionLevelEnum = pgEnum("subscription_level", ["free", "starter", "professional", "enterprise", "freelancer", "btr", "pbsa", "housing_association", "council"]);
export const workOrderStatusEnum = pgEnum("work_order_status", ["assigned", "in_progress", "waiting_parts", "completed", "rejected"]);
export const assetConditionEnum = pgEnum("asset_condition", ["excellent", "good", "fair", "poor", "needs_replacement"]);
export const inspectionPointDataTypeEnum = pgEnum("inspection_point_data_type", ["text", "number", "checkbox", "photo", "rating"]);
export const conditionRatingEnum = pgEnum("condition_rating", ["excellent", "good", "fair", "poor", "not_applicable"]);
export const cleanlinessRatingEnum = pgEnum("cleanliness_rating", ["very_clean", "clean", "acceptable", "needs_cleaning", "not_applicable"]);
export const contactTypeEnum = pgEnum("contact_type", ["internal", "contractor", "lead", "company", "partner", "vendor", "tenant", "other"]);
export const templateScopeEnum = pgEnum("template_scope", ["block", "property", "both"]);
export const fieldTypeEnum = pgEnum("field_type", ["short_text", "long_text", "number", "select", "multiselect", "boolean", "rating", "date", "time", "datetime", "photo", "photo_array", "video", "gps", "signature"]);
export const maintenanceSourceEnum = pgEnum("maintenance_source", ["manual", "inspection", "tenant_portal", "routine"]);
export const comparisonReportStatusEnum = pgEnum("comparison_report_status", ["draft", "under_review", "awaiting_signatures", "signed", "filed"]);
export const comparisonItemStatusEnum = pgEnum("comparison_item_status", ["pending", "reviewed", "disputed", "resolved", "waived"]);
export const currencyEnum = pgEnum("currency", ["GBP", "USD", "AED"]);
export const planCodeEnum = pgEnum("plan_code", ["starter", "professional", "enterprise", "enterprise_plus", "freelancer", "btr", "pbsa", "housing_association", "council"]);
export const creditSourceEnum = pgEnum("credit_source", ["plan_inclusion", "topup", "admin_grant", "refund", "adjustment", "consumption", "expiry"]);
export const topupStatusEnum = pgEnum("topup_status", ["pending", "paid", "failed", "refunded"]);

// User storage table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique().notNull(),
  password: varchar("password").notNull(),
  email: varchar("email").unique().notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  phone: varchar("phone"),
  address: jsonb("address").$type<{
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    formatted?: string;
  }>(),
  skills: text("skills").array(),
  qualifications: text("qualifications").array(),
  education: text("education"),
  certificateUrls: text("certificate_urls").array(),
  role: userRoleEnum("role").notNull().default("owner"),
  organizationId: varchar("organization_id"),
  isActive: boolean("is_active").notNull().default(true),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  resetToken: varchar("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  resetToken: true,
  resetTokenExpiry: true,
});

export const registerUserSchema = insertUserSchema.pick({
  username: true,
  password: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
}).extend({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  countryCode: z.string().length(2).optional(), // ISO 3166-1 alpha-2
});

export const loginUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type RegisterUser = z.infer<typeof registerUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;

// Admin Users (Platform administrators)
export const adminUsers = pgTable("admin_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  password: varchar("password").notNull(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const loginAdminSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1),
});

export type AdminUser = typeof adminUsers.$inferSelect;
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type LoginAdmin = z.infer<typeof loginAdminSchema>;

// Organizations
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  ownerId: varchar("owner_id").notNull(),
  stripeCustomerId: varchar("stripe_customer_id"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").default("inactive"),
  subscriptionLevel: subscriptionLevelEnum("subscription_level").default("free"),
  countryCode: varchar("country_code", { length: 2 }).default("GB"), // ISO 3166-1 alpha-2
  currentPlanId: varchar("current_plan_id"),
  trialEndAt: timestamp("trial_end_at"),
  isActive: boolean("is_active").default(true),
  creditsRemaining: integer("credits_remaining").default(5),
  includedInspectionsPerMonth: integer("included_inspections_per_month").default(0), // From subscription plan
  usedInspectionsThisMonth: integer("used_inspections_this_month").default(0), // Resets at billing cycle
  topupInspectionsBalance: integer("topup_inspections_balance").default(0), // Rolls over until used
  billingCycleResetAt: timestamp("billing_cycle_reset_at"), // When to reset monthly usage
  preferredCurrency: currencyEnum("preferred_currency").default("GBP"),
  defaultAiMaxWords: integer("default_ai_max_words").default(150), // Eco Admin default max word count
  defaultAiInstruction: text("default_ai_instruction"), // Eco Admin default AI instruction
  logoUrl: varchar("logo_url"), // White-label: Company logo URL
  trademarkUrl: varchar("trademark_url"), // White-label: Trademark/certification image for reports
  brandingName: varchar("branding_name"), // White-label: Display name for company
  brandingEmail: varchar("branding_email"), // White-label: Contact email
  brandingPhone: varchar("branding_phone"), // White-label: Contact phone
  brandingAddress: text("branding_address"), // White-label: Address for reports
  brandingWebsite: varchar("branding_website"), // White-label: Company website
  brandingPrimaryColor: varchar("branding_primary_color"), // White-label: Primary brand color (hex)
  financeEmail: varchar("finance_email"), // Finance department email for liability reports
  autoRenewEnabled: boolean("auto_renew_enabled").default(false), // Auto-renew credits when low
  autoRenewBundleId: varchar("auto_renew_bundle_id"), // Which bundle to auto-purchase
  autoRenewThreshold: integer("auto_renew_threshold").default(10), // Trigger when credits drop below
  autoRenewLastRunAt: timestamp("auto_renew_last_run_at"), // Last auto-renewal execution
  autoRenewFailureCount: integer("auto_renew_failure_count").default(0), // Track consecutive failures
  comparisonAlertThreshold: integer("comparison_alert_threshold").default(20), // Percentage threshold for condition/cleanliness alerts in comparison reports
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

// Organization Trademarks (Multiple trademark/certification images for reports)
export const organizationTrademarks = pgTable("organization_trademarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  imageUrl: varchar("image_url").notNull(),
  displayOrder: integer("display_order").default(0),
  altText: varchar("alt_text"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOrganizationTrademarkSchema = createInsertSchema(organizationTrademarks).omit({
  id: true,
  createdAt: true,
});
export type OrganizationTrademark = typeof organizationTrademarks.$inferSelect;
export type InsertOrganizationTrademark = z.infer<typeof insertOrganizationTrademarkSchema>;

// User Documents (profile-attached documents like certifications, licenses, etc.)
export const userDocuments = pgTable("user_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  documentName: varchar("document_name").notNull(),
  documentType: varchar("document_type"), // e.g., "certification", "license", "id", "training", "other"
  fileUrl: varchar("file_url").notNull(),
  expiryDate: timestamp("expiry_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserDocumentSchema = createInsertSchema(userDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type UserDocument = typeof userDocuments.$inferSelect;
export type InsertUserDocument = z.infer<typeof insertUserDocumentSchema>;

// Contacts (Internal team members and external contacts)
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  type: contactTypeEnum("type").notNull().default("other"),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email"),
  phone: varchar("phone"),
  countryCode: varchar("country_code").default("+1"),
  companyName: varchar("company_name"),
  jobTitle: varchar("job_title"),
  address: text("address"),
  city: varchar("city"),
  state: varchar("state"),
  postalCode: varchar("postal_code"),
  country: varchar("country"),
  website: varchar("website"),
  notes: text("notes"),
  profileImageUrl: varchar("profile_image_url"),
  tags: text("tags").array(),
  linkedUserId: varchar("linked_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;

// Blocks (Buildings/Complexes)
export const blocks = pgTable("blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  name: varchar("name").notNull(),
  address: text("address").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBlockSchema = createInsertSchema(blocks).omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});
export type Block = typeof blocks.$inferSelect;
export type InsertBlock = z.infer<typeof insertBlockSchema>;

// Properties (Buildings/Locations)
// Properties can optionally belong to blocks for organizational hierarchy
export const properties = pgTable("properties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  blockId: varchar("block_id"), // Optional: properties can be grouped into blocks
  name: varchar("name").notNull(),
  address: text("address").notNull(),
  propertyType: varchar("property_type"), // Property type: apartment, house, studio, etc.
  imageUrl: text("image_url"), // Property image URL
  sqft: integer("sqft"), // Property area in square feet (for cost estimation)
  fixfloPropertyId: varchar("fixflo_property_id"), // Fixflo external property/asset ID
  fixfloSyncedAt: timestamp("fixflo_synced_at"), // Last successful sync timestamp
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPropertySchema = createInsertSchema(properties).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof insertPropertySchema>;

// Tenant Assignments (tracks which tenant is assigned to which property)
export const tenantAssignments = pgTable("tenant_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  tenantId: varchar("tenant_id").notNull(), // References users.id where role='tenant'
  propertyId: varchar("property_id").notNull(), // References properties.id
  leaseStartDate: timestamp("lease_start_date"),
  leaseEndDate: timestamp("lease_end_date"),
  monthlyRent: numeric("monthly_rent", { precision: 10, scale: 2 }),
  depositAmount: numeric("deposit_amount", { precision: 10, scale: 2 }),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  // Next of Kin Information
  nextOfKinName: varchar("next_of_kin_name", { length: 255 }),
  nextOfKinPhone: varchar("next_of_kin_phone", { length: 50 }),
  nextOfKinEmail: varchar("next_of_kin_email", { length: 255 }),
  nextOfKinRelationship: varchar("next_of_kin_relationship", { length: 100 }),
  // Tenant Portal Access
  hasPortalAccess: boolean("has_portal_access").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantAssignmentSchema = createInsertSchema(tenantAssignments).omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});
export const updateTenantAssignmentSchema = insertTenantAssignmentSchema.partial();
export type TenantAssignment = typeof tenantAssignments.$inferSelect;
export type InsertTenantAssignment = z.infer<typeof insertTenantAssignmentSchema>;

// Tenant Assignment Tags (many-to-many relationship)
export const tenantAssignmentTags = pgTable("tenant_assignment_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantAssignmentId: varchar("tenant_assignment_id").notNull(),
  tagId: varchar("tag_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type TenantAssignmentTag = typeof tenantAssignmentTags.$inferSelect;

// Tenancy Attachments (documents related to tenant assignments)
export const tenancyAttachments = pgTable("tenancy_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantAssignmentId: varchar("tenant_assignment_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: varchar("file_type", { length: 100 }), // e.g., "application/pdf", "image/png"
  fileSize: integer("file_size"), // Size in bytes
  description: text("description"),
  uploadedBy: varchar("uploaded_by"), // References users.id
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenancyAttachmentSchema = createInsertSchema(tenancyAttachments).omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});
export type TenancyAttachment = typeof tenancyAttachments.$inferSelect;
export type InsertTenancyAttachment = z.infer<typeof insertTenancyAttachmentSchema>;

// Inspection Categories
export const inspectionCategories = pgTable("inspection_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  name: varchar("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInspectionCategorySchema = createInsertSchema(inspectionCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InspectionCategory = typeof inspectionCategories.$inferSelect;
export type InsertInspectionCategory = z.infer<typeof insertInspectionCategorySchema>;

// Template Categories (optional grouping for templates)
export const templateCategories = pgTable("template_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  name: varchar("name").notNull(),
  description: text("description"),
  color: varchar("color").default("#5AB5E8"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTemplateCategorySchema = createInsertSchema(templateCategories).omit({
  id: true,
  createdAt: true,
});
export type TemplateCategory = typeof templateCategories.$inferSelect;
export type InsertTemplateCategory = z.infer<typeof insertTemplateCategorySchema>;

// Inspection Templates (JSON-based flexible structure)
export const inspectionTemplates = pgTable("inspection_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  name: varchar("name").notNull(),
  description: text("description"),
  scope: templateScopeEnum("scope").notNull().default("property"),
  version: integer("version").notNull().default(1),
  parentTemplateId: varchar("parent_template_id"), // Links to parent template for versioning
  isActive: boolean("is_active").default(true),
  structureJson: jsonb("structure_json").notNull(), // Full template schema with sections/fields
  categoryId: varchar("category_id"), // Optional link to template_categories
  aiMaxWords: integer("ai_max_words").default(150), // Max word count for AI analysis output
  aiInstruction: text("ai_instruction"), // Custom AI instruction/prompt for this template
  reportConfig: jsonb("report_config").$type<{
    showCover: boolean;
    showContentsPage: boolean;
    showTradeMarks: boolean;
    showGlossary: boolean;
    showMaintenanceLog: boolean;
    showInspection: boolean;
    showInventory: boolean;
    showTermsConditions: boolean;
    showClosingSection: boolean;
    // Custom content fields
    coverPageTitle?: string;
    coverPageSubtitle?: string;
    termsConditionsText?: string;
    closingSectionTitle?: string;
    closingSectionText?: string;
    // Custom formatted text sections
    customSections?: Array<{
      id: string;
      title: string;
      content: string;
      sortOrder: number;
      placement: "before_inspection" | "after_inspection" | "before_closing";
    }>;
  }>(), // Report section visibility and custom content configuration
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInspectionTemplateSchema = createInsertSchema(inspectionTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InspectionTemplate = typeof inspectionTemplates.$inferSelect;
export type InsertInspectionTemplate = z.infer<typeof insertInspectionTemplateSchema>;

// Template Inventory Links (bind templates to inventory templates)
export const templateInventoryLinks = pgTable("template_inventory_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull(),
  inventoryTemplateId: varchar("inventory_template_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("template_inventory_links_template_id_idx").on(table.templateId),
]);

export const insertTemplateInventoryLinkSchema = createInsertSchema(templateInventoryLinks).omit({
  id: true,
  createdAt: true,
});
export type TemplateInventoryLink = typeof templateInventoryLinks.$inferSelect;
export type InsertTemplateInventoryLink = z.infer<typeof insertTemplateInventoryLinkSchema>;

// Inspection Template Points (the items to inspect within a template)
export const inspectionTemplatePoints = pgTable("inspection_template_points", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull(),
  categoryId: varchar("category_id"), // Link to inspection_categories
  name: varchar("name").notNull(), // e.g., "Kitchen Sink", "Living Room Walls"
  description: text("description"),
  dataType: inspectionPointDataTypeEnum("data_type").notNull().default("text"),
  requiresConditionRating: boolean("requires_condition_rating").default(true),
  requiresCleanlinessRating: boolean("requires_cleanliness_rating").default(true),
  requiresPhoto: boolean("requires_photo").default(false),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInspectionTemplatePointSchema = createInsertSchema(inspectionTemplatePoints).omit({
  id: true,
  createdAt: true,
});
export type InspectionTemplatePoint = typeof inspectionTemplatePoints.$inferSelect;
export type InsertInspectionTemplatePoint = z.infer<typeof insertInspectionTemplatePointSchema>;

// Inspections (can be on blocks OR properties)
export const inspections = pgTable("inspections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  templateId: varchar("template_id"), // Link to inspection template (optional for backward compatibility)
  templateVersion: integer("template_version"), // Snapshot of template version used
  templateSnapshotJson: jsonb("template_snapshot_json"), // Copy of template structure at inspection start
  inventorySnapshotJson: jsonb("inventory_snapshot_json"), // Copy of inventory layout at inspection start
  // Inspection can be on either a block or a property (at least one must be set)
  blockId: varchar("block_id"),
  propertyId: varchar("property_id"),
  inspectorId: varchar("inspector_id").notNull(),
  type: inspectionTypeEnum("type").notNull(),
  status: inspectionStatusEnum("status").notNull().default("scheduled"),
  scheduledDate: timestamp("scheduled_date"),
  startedAt: timestamp("started_at"), // When inspector begins capture
  completedDate: timestamp("completed_date"),
  submittedAt: timestamp("submitted_at"), // When inspector submits
  notes: text("notes"),
  // AI Analysis tracking for full-report analysis
  aiAnalysisStatus: varchar("ai_analysis_status").default("idle"), // idle, processing, completed, failed
  aiAnalysisProgress: integer("ai_analysis_progress").default(0), // Number of fields processed
  aiAnalysisTotalFields: integer("ai_analysis_total_fields").default(0), // Total fields with photos
  aiAnalysisError: text("ai_analysis_error"), // Error message if failed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("inspections_organization_id_idx").on(table.organizationId),
]);

export const insertInspectionSchema = createInsertSchema(inspections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).refine(
  (data) => data.blockId || data.propertyId,
  { message: "Either blockId or propertyId must be provided" }
);
export type Inspection = typeof inspections.$inferSelect;
export type InsertInspection = z.infer<typeof insertInspectionSchema>;

// Inspection Items (Photos and condition ratings)
export const inspectionItems = pgTable("inspection_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inspectionId: varchar("inspection_id").notNull(),
  categoryId: varchar("category_id"), // Optional: reference to inspection_categories
  category: varchar("category").notNull(), // e.g., "Kitchen", "Bathroom", "Living Room" (for backward compat)
  itemName: varchar("item_name").notNull(), // e.g., "Walls", "Floors", "Appliances"
  photoUrl: text("photo_url"),
  conditionRating: integer("condition_rating"), // 1-5 slider
  notes: text("notes"),
  aiAnalysis: text("ai_analysis"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInspectionItemSchema = createInsertSchema(inspectionItems).omit({
  id: true,
  createdAt: true,
});
export type InspectionItem = typeof inspectionItems.$inferSelect;
export type InsertInspectionItem = z.infer<typeof insertInspectionItemSchema>;

// Inspection Responses (for template-based inspections)
export const inspectionResponses = pgTable("inspection_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inspectionId: varchar("inspection_id").notNull(),
  templatePointId: varchar("template_point_id").notNull(), // Links to inspection_template_points
  assetInventoryId: varchar("asset_inventory_id"), // Optional: link to asset being inspected
  conditionRating: conditionRatingEnum("condition_rating"),
  cleanlinessRating: cleanlinessRatingEnum("cleanliness_rating"),
  textValue: text("text_value"), // For text data type
  numberValue: integer("number_value"), // For number data type
  checkboxValue: boolean("checkbox_value"), // For checkbox data type
  photoUrl: text("photo_url"), // For photo data type
  notes: text("notes"),
  aiAnalysis: text("ai_analysis"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInspectionResponseSchema = createInsertSchema(inspectionResponses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InspectionResponse = typeof inspectionResponses.$inferSelect;
export type InsertInspectionResponse = z.infer<typeof insertInspectionResponseSchema>;

// Inspection Entries (new flexible JSON-based system for template inspections)
export const inspectionEntries = pgTable("inspection_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inspectionId: varchar("inspection_id").notNull(),
  sectionRef: text("section_ref").notNull(), // Path to section in template (e.g., "Bedrooms/Bedroom 1")
  itemRef: text("item_ref"), // Path to item if inventory-based (e.g., "Bedrooms/Bedroom 1/Wardrobe")
  fieldKey: varchar("field_key").notNull(), // Field identifier from template
  fieldType: fieldTypeEnum("field_type").notNull(),
  valueJson: jsonb("value_json"), // Flexible value storage (text, number, boolean, array, etc.)
  note: text("note"),
  photos: text("photos").array(), // Array of photo URLs
  videos: text("videos").array(), // Array of video URLs
  maintenanceFlag: boolean("maintenance_flag").default(false),
  markedForReview: boolean("marked_for_review").default(false), // For comparison report generation
  assetInventoryId: varchar("asset_inventory_id"), // Link to asset for depreciation calculation
  defectsJson: jsonb("defects_json"), // Array of defect tags/types
  offlineId: varchar("offline_id").unique(), // For offline sync reconciliation (unique for idempotency)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("inspection_entries_inspection_id_idx").on(table.inspectionId),
  index("inspection_entries_offline_id_idx").on(table.offlineId),
]);

export const insertInspectionEntrySchema = createInsertSchema(inspectionEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InspectionEntry = typeof inspectionEntries.$inferSelect;
export type InsertInspectionEntry = z.infer<typeof insertInspectionEntrySchema>;

// AI Image Analyses (results from OpenAI Vision API)
export const aiImageAnalyses = pgTable("ai_image_analyses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inspectionEntryId: varchar("inspection_entry_id"), // Link to entry if from inspection
  inspectionId: varchar("inspection_id"), // Direct link to inspection for easier queries
  mediaUrl: text("media_url").notNull(),
  mediaType: varchar("media_type").notNull().default("photo"), // "photo" or "video"
  model: varchar("model").notNull().default("gpt-4o"), // AI model used
  resultJson: jsonb("result_json"), // Full AI response
  confidence: integer("confidence"), // 0-100 confidence score
  detectionsJson: jsonb("detections_json"), // Detected issues (mold, cracks, etc.) with bboxes
  annotationsUrl: text("annotations_url"), // URL to annotated image if generated
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ai_image_analyses_entry_id_idx").on(table.inspectionEntryId),
  index("ai_image_analyses_inspection_id_idx").on(table.inspectionId),
]);

export const insertAiImageAnalysisSchema = createInsertSchema(aiImageAnalyses).omit({
  id: true,
  createdAt: true,
});
export type AiImageAnalysis = typeof aiImageAnalyses.$inferSelect;
export type InsertAiImageAnalysis = z.infer<typeof insertAiImageAnalysisSchema>;

// Compliance Documents
export const complianceDocuments = pgTable("compliance_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  propertyId: varchar("property_id"),
  blockId: varchar("block_id"),
  documentType: varchar("document_type").notNull(), // e.g., "Fire Safety", "Insurance", "License"
  documentUrl: text("document_url").notNull(),
  expiryDate: timestamp("expiry_date"),
  status: complianceStatusEnum("status").notNull().default("current"),
  uploadedBy: varchar("uploaded_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertComplianceDocumentSchema = createInsertSchema(complianceDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  expiryDate: z.coerce.date().nullable().optional(),
});
export type ComplianceDocument = typeof complianceDocuments.$inferSelect;
export type InsertComplianceDocument = z.infer<typeof insertComplianceDocumentSchema>;

// Custom Compliance Document Types (user-defined document types)
export const complianceDocumentTypes = pgTable("compliance_document_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  name: varchar("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("compliance_document_types_organization_id_idx").on(table.organizationId),
]);

export const insertComplianceDocumentTypeSchema = createInsertSchema(complianceDocumentTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ComplianceDocumentType = typeof complianceDocumentTypes.$inferSelect;
export type InsertComplianceDocumentType = z.infer<typeof insertComplianceDocumentTypeSchema>;

// Maintenance Requests (Internal tracking)
export const maintenanceRequests = pgTable("maintenance_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  propertyId: varchar("property_id"), // Optional - can be null for block-level requests
  blockId: varchar("block_id"), // Optional - for block-level maintenance requests
  reportedBy: varchar("reported_by").notNull(),
  assignedTo: varchar("assigned_to"),
  title: varchar("title").notNull(),
  description: text("description"),
  status: maintenanceStatusEnum("status").notNull().default("open"),
  priority: varchar("priority").notNull().default("medium"), // low, medium, high, urgent
  photoUrls: text("photo_urls").array(), // Multiple photo support for maintenance teams
  aiSuggestedFixes: text("ai_suggested_fixes"), // AI-generated fix suggestions for tenant portal
  aiAnalysisJson: jsonb("ai_analysis_json"), // Full AI analysis data
  source: maintenanceSourceEnum("source").notNull().default("manual"), // Track origin
  inspectionId: varchar("inspection_id"), // Link to source inspection if auto-created
  inspectionEntryId: varchar("inspection_entry_id"), // Link to specific entry that flagged it
  fixfloIssueId: varchar("fixflo_issue_id"), // Fixflo external issue ID
  fixfloJobId: varchar("fixflo_job_id"), // Fixflo job ID if escalated to job
  fixfloStatus: varchar("fixflo_status"), // Last known Fixflo status
  fixfloContractorName: varchar("fixflo_contractor_name"), // Assigned contractor from Fixflo
  fixfloSyncedAt: timestamp("fixflo_synced_at"), // Last successful sync timestamp
  dueDate: timestamp("due_date"), // Optional due date for the maintenance request
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMaintenanceRequestSchema = createInsertSchema(maintenanceRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type MaintenanceRequest = typeof maintenanceRequests.$inferSelect;
export type InsertMaintenanceRequest = z.infer<typeof insertMaintenanceRequestSchema>;

// Tenant Maintenance Chat Conversations (AI Chatbot for preventative maintenance)
export const tenantMaintenanceChats = pgTable("tenant_maintenance_chats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  tenantId: varchar("tenant_id").notNull(), // References users.id where role='tenant'
  propertyId: varchar("property_id").notNull(),
  maintenanceRequestId: varchar("maintenance_request_id"), // Linked if tenant creates request after chat
  title: varchar("title").notNull(), // Auto-generated from first message
  status: varchar("status").notNull().default("active"), // active, resolved, escalated
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantMaintenanceChatSchema = createInsertSchema(tenantMaintenanceChats).omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});
export type TenantMaintenanceChat = typeof tenantMaintenanceChats.$inferSelect;
export type InsertTenantMaintenanceChat = z.infer<typeof insertTenantMaintenanceChatSchema>;

// Chat Messages
export const tenantMaintenanceChatMessages = pgTable("tenant_maintenance_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: varchar("chat_id").notNull(),
  role: varchar("role").notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  imageUrl: varchar("image_url"), // If user uploaded image
  aiSuggestedFixes: text("ai_suggested_fixes"), // If AI provided fixes
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTenantMaintenanceChatMessageSchema = createInsertSchema(tenantMaintenanceChatMessages).omit({
  id: true,
  createdAt: true,
});
export type TenantMaintenanceChatMessage = typeof tenantMaintenanceChatMessages.$inferSelect;
export type InsertTenantMaintenanceChatMessage = z.infer<typeof insertTenantMaintenanceChatMessageSchema>;

// Quick-add maintenance schema for in-inspection workflow (minimal fields)
export const quickAddMaintenanceSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  propertyId: z.string().optional(), // Optional - can use blockId instead
  blockId: z.string().optional(), // Optional - can use propertyId instead
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  photoUrls: z.array(z.string()).optional(),
  inspectionId: z.string().optional(), // Auto-populated from inspection context
  inspectionEntryId: z.string().optional(), // Optional specific entry link
  source: z.enum(["manual", "inspection", "tenant_portal", "routine"]).default("inspection"),
}).refine(
  (data) => data.propertyId || data.blockId,
  { message: "Either propertyId or blockId is required", path: ["propertyId"] }
);
export type QuickAddMaintenance = z.infer<typeof quickAddMaintenanceSchema>;

// Comparison Reports (Check-in vs Check-out collaborative liability assessment)
export const comparisonReports = pgTable("comparison_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  propertyId: varchar("property_id").notNull(),
  checkInInspectionId: varchar("check_in_inspection_id").notNull(),
  checkOutInspectionId: varchar("check_out_inspection_id").notNull(),
  tenantId: varchar("tenant_id"), // Optional: Tenant assigned to property (null for vacant units during turnover)
  status: comparisonReportStatusEnum("status").notNull().default("draft"),
  totalEstimatedCost: numeric("total_estimated_cost", { precision: 10, scale: 2 }).default("0"),
  aiAnalysisJson: jsonb("ai_analysis_json"), // AI comparison results
  itemComparisons: jsonb("item_comparisons"), // Array of item-by-item comparisons (backward compatibility)
  generatedBy: varchar("generated_by").notNull(), // User who triggered report generation
  generatedAt: timestamp("generated_at").defaultNow(),
  operatorSignature: varchar("operator_signature"), // Typed name
  operatorSignedAt: timestamp("operator_signed_at"),
  operatorIpAddress: varchar("operator_ip_address"),
  tenantSignature: varchar("tenant_signature"), // Typed name
  tenantSignedAt: timestamp("tenant_signed_at"),
  tenantIpAddress: varchar("tenant_ip_address"),
  filedAt: timestamp("filed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("comparison_reports_organization_id_idx").on(table.organizationId),
  index("comparison_reports_property_id_idx").on(table.propertyId),
  index("comparison_reports_check_out_inspection_id_idx").on(table.checkOutInspectionId),
]);

export const insertComparisonReportSchema = createInsertSchema(comparisonReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ComparisonReport = typeof comparisonReports.$inferSelect;
export type InsertComparisonReport = z.infer<typeof insertComparisonReportSchema>;

// Comparison Report Items (Individual inspection entries marked for review)
export const comparisonReportItems = pgTable("comparison_report_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  comparisonReportId: varchar("comparison_report_id").notNull(),
  checkInEntryId: varchar("check_in_entry_id"), // May not exist if new item in check-out
  checkOutEntryId: varchar("check_out_entry_id").notNull(),
  sectionRef: text("section_ref").notNull(),
  itemRef: text("item_ref"),
  fieldKey: varchar("field_key").notNull(),
  aiComparisonJson: jsonb("ai_comparison_json"), // AI analysis for this specific item (includes ~100 word report)
  aiSummary: text("ai_summary"), // Concise AI-generated summary (~100 words)
  estimatedCost: numeric("estimated_cost", { precision: 10, scale: 2 }),
  depreciation: numeric("depreciation", { precision: 10, scale: 2 }),
  finalCost: numeric("final_cost", { precision: 10, scale: 2 }), // After depreciation
  liabilityDecision: varchar("liability_decision"), // "tenant", "landlord", "shared", "waived"
  liabilityNotes: text("liability_notes"),
  status: comparisonItemStatusEnum("status").notNull().default("pending"), // Item review status
  // Dispute-related fields
  disputeReason: text("dispute_reason"), // Tenant's reason for disputing
  disputedAt: timestamp("disputed_at"), // When the dispute was raised
  aiCostCalculationNotes: text("ai_cost_calculation_notes"), // AI-generated notes about cost calculation
  costCalculationMethod: varchar("cost_calculation_method"), // "depreciation" or "local_market_search"
  assetInventoryId: varchar("asset_inventory_id"), // Link to asset if this is an inventory item
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("comparison_report_items_report_id_idx").on(table.comparisonReportId),
]);

export const insertComparisonReportItemSchema = createInsertSchema(comparisonReportItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ComparisonReportItem = typeof comparisonReportItems.$inferSelect;
export type InsertComparisonReportItem = z.infer<typeof insertComparisonReportItemSchema>;

// Comparison Comments (Async discussion thread for liability negotiation)
export const comparisonComments = pgTable("comparison_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  comparisonReportId: varchar("comparison_report_id").notNull(),
  comparisonReportItemId: varchar("comparison_report_item_id"), // Optional: comment on specific item
  userId: varchar("user_id").notNull(),
  authorName: varchar("author_name"), // Display name at time of comment
  authorRole: varchar("author_role"), // "tenant", "operator" - role at time of comment for display
  content: text("content").notNull(),
  attachments: text("attachments").array(), // Optional file attachments
  isInternal: boolean("is_internal").default(false), // Internal notes not visible to tenant
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("comparison_comments_report_id_idx").on(table.comparisonReportId),
  index("comparison_comments_item_id_idx").on(table.comparisonReportItemId),
]);

export const insertComparisonCommentSchema = createInsertSchema(comparisonComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ComparisonComment = typeof comparisonComments.$inferSelect;
export type InsertComparisonComment = z.infer<typeof insertComparisonCommentSchema>;

// Credit Transactions (Track credit usage)
export const creditTransactions = pgTable("credit_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  amount: integer("amount").notNull(), // Positive for addition, negative for usage
  type: varchar("type").notNull(), // "purchase", "inspection", "comparison", "refund"
  description: text("description"),
  relatedId: varchar("related_id"), // ID of related inspection/comparison
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).omit({
  id: true,
  createdAt: true,
});
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;

// Inventory Templates (Predefined room/item structures)
export const inventoryTemplates = pgTable("inventory_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  name: varchar("name").notNull(), // e.g., "Studio", "1-bed", "2-bed"
  description: text("description"),
  schema: jsonb("schema").notNull(), // JSON structure defining rooms and items
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInventoryTemplateSchema = createInsertSchema(inventoryTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InventoryTemplate = typeof inventoryTemplates.$inferSelect;
export type InsertInventoryTemplate = z.infer<typeof insertInventoryTemplateSchema>;

// Inventories (Active inventory instances for properties)
export const inventories = pgTable("inventories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  propertyId: varchar("property_id").notNull(),
  templateId: varchar("template_id"),
  version: integer("version").default(1),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInventorySchema = createInsertSchema(inventories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Inventory = typeof inventories.$inferSelect;
export type InsertInventory = z.infer<typeof insertInventorySchema>;

// Inventory Items (Individual items within an inventory)
export const inventoryItems = pgTable("inventory_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryId: varchar("inventory_id").notNull(),
  path: text("path").notNull(), // e.g., "Kitchen > Appliances > Refrigerator"
  itemName: varchar("item_name").notNull(),
  baselineCondition: integer("baseline_condition"), // 1-5 rating
  baselineCleanliness: integer("baseline_cleanliness"), // 1-5 rating
  baselinePhotos: text("baseline_photos").array(), // Array of photo URLs
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;

// Work Orders (Contractor assignments linked to maintenance requests)
export const workOrders = pgTable("work_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  maintenanceRequestId: varchar("maintenance_request_id").notNull(),
  teamId: varchar("team_id"), // Assigned team for work order
  contractorId: varchar("contractor_id"), // Specific contractor assigned (if any)
  assignedToId: varchar("assigned_to_id"), // Specific team member assigned
  status: workOrderStatusEnum("status").notNull().default("assigned"),
  slaDue: timestamp("sla_due"), // Service Level Agreement deadline
  costEstimate: integer("cost_estimate"), // In cents
  costActual: integer("cost_actual"), // In cents
  variationNotes: text("variation_notes"), // Notes on cost variations
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWorkOrderSchema = createInsertSchema(workOrders, {
  slaDue: z.union([z.date(), z.string().transform((s) => s ? new Date(s) : undefined)]).optional(),
}).omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});
export type WorkOrder = typeof workOrders.$inferSelect;
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;

// Work Logs (Activity logs for work orders)
export const workLogs = pgTable("work_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workOrderId: varchar("work_order_id").notNull(),
  note: text("note").notNull(),
  photos: text("photos").array(), // Array of photo URLs
  timeSpentMinutes: integer("time_spent_minutes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkLogSchema = createInsertSchema(workLogs).omit({
  id: true,
  createdAt: true,
});
export type WorkLog = typeof workLogs.$inferSelect;
export type InsertWorkLog = z.infer<typeof insertWorkLogSchema>;

// Asset Inventory (Physical assets/equipment for properties and blocks)
export const assetInventory = pgTable("asset_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  propertyId: varchar("property_id"),
  blockId: varchar("block_id"),
  name: varchar("name").notNull(),
  category: varchar("category"), // e.g., "HVAC", "Appliances", "Furniture", "Plumbing", "Electrical"
  description: text("description"),
  location: varchar("location"), // Specific room/area: "Unit 101 - Kitchen", "Common Area - Lobby"
  supplier: varchar("supplier"),
  supplierContact: varchar("supplier_contact"), // Phone or email
  serialNumber: varchar("serial_number"),
  modelNumber: varchar("model_number"),
  datePurchased: timestamp("date_purchased"),
  purchasePrice: numeric("purchase_price", { precision: 10, scale: 2 }),
  warrantyExpiryDate: timestamp("warranty_expiry_date"),
  condition: assetConditionEnum("condition").notNull(),
  cleanliness: cleanlinessRatingEnum("cleanliness"),
  expectedLifespanYears: integer("expected_lifespan_years"),
  depreciationPerYear: numeric("depreciation_per_year", { precision: 10, scale: 2 }), // Auto-calculated or manual
  currentValue: numeric("current_value", { precision: 10, scale: 2 }), // Purchase price - accumulated depreciation
  lastMaintenanceDate: timestamp("last_maintenance_date"),
  nextMaintenanceDate: timestamp("next_maintenance_date"),
  maintenanceNotes: text("maintenance_notes"),
  photos: text("photos").array(), // Array of photo URLs
  documents: text("documents").array(), // Array of document URLs (manuals, warranties)
  inspectionId: varchar("inspection_id"), // Link to source inspection for audit trail
  inspectionEntryId: varchar("inspection_entry_id"), // Link to specific inspection entry if relevant
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAssetInventorySchema = createInsertSchema(assetInventory).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  datePurchased: z.coerce.date().nullable().optional(),
  warrantyExpiryDate: z.coerce.date().nullable().optional(),
  lastMaintenanceDate: z.coerce.date().nullable().optional(),
  nextMaintenanceDate: z.coerce.date().nullable().optional(),
});
export type AssetInventory = typeof assetInventory.$inferSelect;
export type InsertAssetInventory = z.infer<typeof insertAssetInventorySchema>;

// Quick-add asset schema for in-inspection workflow (minimal fields)
export const quickAddAssetSchema = z.object({
  name: z.string().min(1, "Asset name is required"),
  category: z.string().optional(),
  condition: z.enum(["excellent", "good", "fair", "poor", "needs_replacement"]),
  cleanliness: z.enum(["very_clean", "clean", "acceptable", "needs_cleaning", "not_applicable"]).optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  propertyId: z.string().optional(), // Auto-populated from inspection context
  blockId: z.string().optional(), // Auto-populated if block-level inspection
  photos: z.array(z.string()).optional(),
  inspectionId: z.string().optional(), // Auto-populated from inspection context
  inspectionEntryId: z.string().optional(), // Optional specific entry link
});
export type QuickAddAsset = z.infer<typeof quickAddAssetSchema>;

// Quick-update asset schema for in-inspection workflow (update existing assets)
export const quickUpdateAssetSchema = z.object({
  condition: z.enum(["excellent", "good", "fair", "poor", "needs_replacement"]).optional(),
  cleanliness: z.enum(["very_clean", "clean", "acceptable", "needs_cleaning", "not_applicable"]).optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  photos: z.array(z.string()).optional(),
  inspectionId: z.string().optional(), // Link update to current inspection
  inspectionEntryId: z.string().optional(), // Optional specific entry link
  offlineId: z.string().optional(), // For offline deduplication
});
export type QuickUpdateAsset = z.infer<typeof quickUpdateAssetSchema>;

// Fixflo Integration Configuration (per organization)
export const fixfloConfig = pgTable("fixflo_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().unique(),
  baseUrl: varchar("base_url").notNull().default("https://api-sandbox.fixflo.com/api/v2"),
  bearerToken: varchar("bearer_token"), // Encrypted token for Fixflo API
  webhookVerifyToken: varchar("webhook_verify_token"), // Token for webhook signature verification
  isEnabled: boolean("is_enabled").notNull().default(false),
  lastHealthCheck: timestamp("last_health_check"),
  healthCheckStatus: varchar("health_check_status"), // "healthy", "degraded", "error"
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFixfloConfigSchema = createInsertSchema(fixfloConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type FixfloConfig = typeof fixfloConfig.$inferSelect;
export type InsertFixfloConfig = z.infer<typeof insertFixfloConfigSchema>;

// Fixflo Webhook Logs (for debugging and audit trail)
export const fixfloWebhookLogs = pgTable("fixflo_webhook_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  eventType: varchar("event_type").notNull(), // "IssueCreated", "IssueUpdated", "JobCompleted", etc.
  fixfloIssueId: varchar("fixflo_issue_id"),
  fixfloJobId: varchar("fixflo_job_id"),
  payloadJson: jsonb("payload_json").notNull(),
  processingStatus: varchar("processing_status").notNull().default("pending"), // "pending", "processed", "error", "retrying"
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("fixflo_webhook_logs_organization_id_idx").on(table.organizationId),
  index("fixflo_webhook_logs_event_type_idx").on(table.eventType),
  index("fixflo_webhook_logs_processing_status_idx").on(table.processingStatus),
]);

export const insertFixfloWebhookLogSchema = createInsertSchema(fixfloWebhookLogs).omit({
  id: true,
  createdAt: true,
});
export type FixfloWebhookLog = typeof fixfloWebhookLogs.$inferSelect;
export type InsertFixfloWebhookLog = z.infer<typeof insertFixfloWebhookLogSchema>;

// Fixflo Sync State (tracks last successful sync for different entity types)
export const fixfloSyncState = pgTable("fixflo_sync_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  entityType: varchar("entity_type").notNull(), // "issues", "properties", "contractors", "invoices"
  lastSyncAt: timestamp("last_sync_at"),
  lastSuccessfulSyncAt: timestamp("last_successful_sync_at"),
  syncStatus: varchar("sync_status").notNull().default("idle"), // "idle", "syncing", "error"
  errorMessage: text("error_message"),
  recordsSynced: integer("records_synced").notNull().default(0),
  recordsFailed: integer("records_failed").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  organizationIdIdx: index("fixflo_sync_state_organization_id_idx").on(table.organizationId),
}));

export const insertFixfloSyncStateSchema = createInsertSchema(fixfloSyncState).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type FixfloSyncState = typeof fixfloSyncState.$inferSelect;
export type InsertFixfloSyncState = z.infer<typeof insertFixfloSyncStateSchema>;

// Teams (Work order distribution lists for BTR operators)
export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  name: varchar("name").notNull(), // e.g., "Electrical Team", "Plumbing Team", "General Maintenance"
  description: text("description"),
  email: varchar("email"), // Distribution list email (e.g., team@company.com)
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("teams_organization_id_idx").on(table.organizationId),
]);

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});
export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;

// Team Members (Links admins and contractors to teams)
export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  userId: varchar("user_id"), // For admins/internal users
  contactId: varchar("contact_id"), // For contractors in contacts list
  role: varchar("role").default("member"), // "lead", "member"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("team_members_team_id_idx").on(table.teamId),
  index("team_members_user_id_idx").on(table.userId),
  index("team_members_contact_id_idx").on(table.contactId),
]);

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  createdAt: true,
});
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;

// Team Categories (Assigns maintenance categories to teams)
export const teamCategories = pgTable("team_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  category: varchar("category").notNull(), // Maintenance category (e.g., "plumbing", "electrical", "hvac")
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("team_categories_team_id_idx").on(table.teamId),
]);

export const insertTeamCategorySchema = createInsertSchema(teamCategories).omit({
  id: true,
  createdAt: true,
});
export type TeamCategory = typeof teamCategories.$inferSelect;
export type InsertTeamCategory = z.infer<typeof insertTeamCategorySchema>;

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  blocks: many(blocks),
  properties: many(properties),
  inspectionCategories: many(inspectionCategories),
  complianceDocuments: many(complianceDocuments),
  creditTransactions: many(creditTransactions),
  inventoryTemplates: many(inventoryTemplates),
  workOrders: many(workOrders),
  assetInventory: many(assetInventory),
}));

export const blocksRelations = relations(blocks, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [blocks.organizationId],
    references: [organizations.id],
  }),
  properties: many(properties),
  assetInventory: many(assetInventory),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [properties.organizationId],
    references: [organizations.id],
  }),
  block: one(blocks, {
    fields: [properties.blockId],
    references: [blocks.id],
  }),
  inspections: many(inspections),
  maintenanceRequests: many(maintenanceRequests),
  inventories: many(inventories),
  comparisonReports: many(comparisonReports),
  assetInventory: many(assetInventory),
}));

export const inspectionCategoriesRelations = relations(inspectionCategories, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [inspectionCategories.organizationId],
    references: [organizations.id],
  }),
  items: many(inspectionItems),
}));

export const inspectionsRelations = relations(inspections, ({ one, many }) => ({
  block: one(blocks, {
    fields: [inspections.blockId],
    references: [blocks.id],
  }),
  property: one(properties, {
    fields: [inspections.propertyId],
    references: [properties.id],
  }),
  items: many(inspectionItems),
}));

export const inspectionItemsRelations = relations(inspectionItems, ({ one }) => ({
  inspection: one(inspections, {
    fields: [inspectionItems.inspectionId],
    references: [inspections.id],
  }),
  category: one(inspectionCategories, {
    fields: [inspectionItems.categoryId],
    references: [inspectionCategories.id],
  }),
}));

export const inventoryTemplatesRelations = relations(inventoryTemplates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [inventoryTemplates.organizationId],
    references: [organizations.id],
  }),
  inventories: many(inventories),
}));

export const inventoriesRelations = relations(inventories, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [inventories.organizationId],
    references: [organizations.id],
  }),
  property: one(properties, {
    fields: [inventories.propertyId],
    references: [properties.id],
  }),
  template: one(inventoryTemplates, {
    fields: [inventories.templateId],
    references: [inventoryTemplates.id],
  }),
  items: many(inventoryItems),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({ one }) => ({
  inventory: one(inventories, {
    fields: [inventoryItems.inventoryId],
    references: [inventories.id],
  }),
}));

export const maintenanceRequestsRelations = relations(maintenanceRequests, ({ one, many }) => ({
  property: one(properties, {
    fields: [maintenanceRequests.propertyId],
    references: [properties.id],
  }),
  workOrders: many(workOrders),
}));

export const workOrdersRelations = relations(workOrders, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workOrders.organizationId],
    references: [organizations.id],
  }),
  maintenanceRequest: one(maintenanceRequests, {
    fields: [workOrders.maintenanceRequestId],
    references: [maintenanceRequests.id],
  }),
  logs: many(workLogs),
}));

export const workLogsRelations = relations(workLogs, ({ one }) => ({
  workOrder: one(workOrders, {
    fields: [workLogs.workOrderId],
    references: [workOrders.id],
  }),
}));

export const assetInventoryRelations = relations(assetInventory, ({ one }) => ({
  organization: one(organizations, {
    fields: [assetInventory.organizationId],
    references: [organizations.id],
  }),
  property: one(properties, {
    fields: [assetInventory.propertyId],
    references: [properties.id],
  }),
  block: one(blocks, {
    fields: [assetInventory.blockId],
    references: [blocks.id],
  }),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  organization: one(organizations, {
    fields: [contacts.organizationId],
    references: [organizations.id],
  }),
  linkedUser: one(users, {
    fields: [contacts.linkedUserId],
    references: [users.id],
  }),
}));

// Tags system
export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  name: varchar("name").notNull(),
  color: varchar("color"), // Hex color code for the tag
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tag join tables
export const blockTags = pgTable("block_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  blockId: varchar("block_id").notNull(),
  tagId: varchar("tag_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const propertyTags = pgTable("property_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull(),
  tagId: varchar("tag_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userTags = pgTable("user_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  tagId: varchar("tag_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const complianceDocumentTags = pgTable("compliance_document_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  complianceDocumentId: varchar("compliance_document_id").notNull(),
  tagId: varchar("tag_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const assetInventoryTags = pgTable("asset_inventory_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetInventoryId: varchar("asset_inventory_id").notNull(),
  tagId: varchar("tag_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const maintenanceRequestTags = pgTable("maintenance_request_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  maintenanceRequestId: varchar("maintenance_request_id").notNull(),
  tagId: varchar("tag_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const contactTags = pgTable("contact_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull(),
  tagId: varchar("tag_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tag schemas
export const insertTagSchema = createInsertSchema(tags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;

// Tag relations
export const tagsRelations = relations(tags, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tags.organizationId],
    references: [organizations.id],
  }),
  blockTags: many(blockTags),
  propertyTags: many(propertyTags),
  userTags: many(userTags),
  complianceDocumentTags: many(complianceDocumentTags),
  assetInventoryTags: many(assetInventoryTags),
  maintenanceRequestTags: many(maintenanceRequestTags),
  contactTags: many(contactTags),
}));

export const blockTagsRelations = relations(blockTags, ({ one }) => ({
  block: one(blocks, {
    fields: [blockTags.blockId],
    references: [blocks.id],
  }),
  tag: one(tags, {
    fields: [blockTags.tagId],
    references: [tags.id],
  }),
}));

export const propertyTagsRelations = relations(propertyTags, ({ one }) => ({
  property: one(properties, {
    fields: [propertyTags.propertyId],
    references: [properties.id],
  }),
  tag: one(tags, {
    fields: [propertyTags.tagId],
    references: [tags.id],
  }),
}));

export const userTagsRelations = relations(userTags, ({ one }) => ({
  user: one(users, {
    fields: [userTags.userId],
    references: [users.id],
  }),
  tag: one(tags, {
    fields: [userTags.tagId],
    references: [tags.id],
  }),
}));

export const complianceDocumentTagsRelations = relations(complianceDocumentTags, ({ one }) => ({
  complianceDocument: one(complianceDocuments, {
    fields: [complianceDocumentTags.complianceDocumentId],
    references: [complianceDocuments.id],
  }),
  tag: one(tags, {
    fields: [complianceDocumentTags.tagId],
    references: [tags.id],
  }),
}));

export const assetInventoryTagsRelations = relations(assetInventoryTags, ({ one }) => ({
  assetInventory: one(assetInventory, {
    fields: [assetInventoryTags.assetInventoryId],
    references: [assetInventory.id],
  }),
  tag: one(tags, {
    fields: [assetInventoryTags.tagId],
    references: [tags.id],
  }),
}));

export const maintenanceRequestTagsRelations = relations(maintenanceRequestTags, ({ one }) => ({
  maintenanceRequest: one(maintenanceRequests, {
    fields: [maintenanceRequestTags.maintenanceRequestId],
    references: [maintenanceRequests.id],
  }),
  tag: one(tags, {
    fields: [maintenanceRequestTags.tagId],
    references: [tags.id],
  }),
}));

export const contactTagsRelations = relations(contactTags, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactTags.contactId],
    references: [contacts.id],
  }),
  tag: one(tags, {
    fields: [contactTags.tagId],
    references: [tags.id],
  }),
}));

// Dashboard Preferences
export const dashboardPreferences = pgTable("dashboard_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  enabledPanels: jsonb("enabled_panels").notNull().default('["stats", "inspections", "compliance", "maintenance"]'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDashboardPreferencesSchema = createInsertSchema(dashboardPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DashboardPreferences = typeof dashboardPreferences.$inferSelect;
export type InsertDashboardPreferences = z.infer<typeof insertDashboardPreferencesSchema>;

// ==================== ADDITIONAL VALIDATION SCHEMAS ====================

// Organization validation schemas
export const createOrganizationSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(255),
});

// Team management validation schemas
export const createTeamMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  username: z.string().min(3, "Username must be at least 3 characters").max(100),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["owner", "clerk", "compliance", "contractor", "tenant"]), // Include tenant for tenant user creation
  phone: z.string().max(50).optional(),
  address: z.union([
    z.object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
      formatted: z.string().optional(),
    }),
    z.string(),
    z.undefined()
  ]).optional(),
  skills: z.array(z.string()).optional(),
  education: z.string().optional(),
  profileImageUrl: z.union([z.string().url(), z.string().startsWith("/objects/"), z.literal("")]).optional(),
  certificateUrls: z.array(z.union([z.string().url(), z.string().startsWith("/objects/"), z.literal("")])).optional(),
});

export const updateTeamMemberSchema = z.object({
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
    formatted: z.string().optional(),
  }).optional(),
  skills: z.array(z.string()).optional(),
  education: z.string().optional(),
  profileImageUrl: z.union([z.string().url(), z.string().startsWith("/objects/"), z.literal("")]).optional(),
  certificateUrls: z.array(z.union([z.string().url(), z.string().startsWith("/objects/"), z.literal("")])).optional(),
  role: z.enum(["owner", "clerk", "compliance", "contractor"]).optional(), // Tenants managed via Contacts
});

export const updateUserRoleSchema = z.object({
  role: z.enum(["owner", "clerk", "compliance", "contractor"]), // Tenants managed via Contacts
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export const updateSelfProfileSchema = z.object({
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  phone: z.string().max(50).optional(),
  profileImageUrl: z.union([z.string().url(), z.string().startsWith("/objects/"), z.literal("")]).optional(),
  skills: z.array(z.string()).optional(),
  qualifications: z.array(z.string()).optional(),
});

// User document update schema
export const updateUserDocumentSchema = z.object({
  documentName: z.string().min(1).max(255).optional(),
  documentType: z.string().max(100).optional(),
  expiryDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type UpdateUserDocument = z.infer<typeof updateUserDocumentSchema>;

// Property update schema
export const updatePropertySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  address: z.string().min(1).optional(),
  blockId: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Compliance update schema
export const updateComplianceDocumentSchema = z.object({
  documentType: z.string().min(1).optional(),
  documentUrl: z.string().url().optional(),
  expiryDate: z.string().datetime().optional().nullable(),
  propertyId: z.string().nullable().optional(),
  blockId: z.string().nullable().optional(),
});

// Maintenance update schema
export const updateMaintenanceRequestSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(["open", "in_progress", "completed", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignedTo: z.string().nullable().optional(),
  photoUrls: z.array(z.string()).optional(),
});

// AI operation validation schemas
export const analyzePhotoSchema = z.object({
  itemId: z.string().uuid("Invalid inspection item ID"),
});

export const inspectFieldSchema = z.object({
  inspectionId: z.string().uuid("Invalid inspection ID"),
  fieldKey: z.string().min(1, "Field key is required"),
  fieldLabel: z.string().min(1, "Field label is required"),
  fieldDescription: z.string().optional(),
  sectionName: z.string().optional(),
  photos: z.array(z.string().min(1, "Photo path or URL is required")).min(1, "At least one photo is required"),
});

export const generateComparisonSchema = z.object({
  propertyId: z.string().uuid("Invalid property ID"),
  checkInInspectionId: z.string().uuid("Invalid check-in inspection ID"),
  checkOutInspectionId: z.string().uuid("Invalid check-out inspection ID"),
});

export const analyzeMaintenanceImageSchema = z.object({
  imageUrl: z.string().min(1, "Image URL is required"),
  issueDescription: z.string().optional(),
});

// Contact update schema (for PATCH route)
export const updateContactSchema = z.object({
  type: z.enum(["internal", "contractor", "lead", "company", "partner", "vendor", "tenant", "other"]).optional(),
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  countryCode: z.string().optional(),
  companyName: z.string().optional(),
  jobTitle: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  website: z.string().url().optional(),
  notes: z.string().optional(),
  profileImageUrl: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
  linkedUserId: z.string().optional(),
});

// Tag update schema
export const updateTagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid color hex code").optional(),
});

// Dashboard preferences update schema
export const updateDashboardPreferencesSchema = z.object({
  enabledPanels: z.array(z.string()).min(1, "At least one panel must be enabled"),
});

// Template category update schema
export const updateTemplateCategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid color hex code").optional(),
});

// Inspection update schema
export const updateInspectionSchema = z.object({
  status: z.enum(["scheduled", "in_progress", "completed", "reviewed"]).optional(),
  type: z.enum(["check_in", "check_out", "routine", "maintenance"]).optional(),
  scheduledDate: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedDate: z.string().datetime().optional(),
  submittedAt: z.string().datetime().optional(),
  inspectorId: z.string().optional(),
  notes: z.string().optional(),
});

// Block update schema
export const updateBlockSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  address: z.string().min(1).optional(),
  notes: z.string().optional(),
});

// Subscription Plans
export const plans = pgTable("plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: planCodeEnum("code").notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  monthlyPriceGbp: integer("monthly_price_gbp").notNull(), // Price in pence
  annualPriceGbp: integer("annual_price_gbp"), // Price in pence (nullable for plans without annual option)
  monthlyPriceUsd: integer("monthly_price_usd"), // Price in cents
  annualPriceUsd: integer("annual_price_usd"), // Price in cents
  monthlyPriceAed: integer("monthly_price_aed"), // Price in fils
  annualPriceAed: integer("annual_price_aed"), // Price in fils
  includedInspections: integer("included_inspections").notNull().default(0), // Renamed from credits
  includedCredits: integer("included_credits").notNull(), // Kept for backward compatibility
  softCap: integer("soft_cap").default(5000), // Fair usage limit for "unlimited" plans
  topupPricePerInspectionGbp: integer("topup_price_per_inspection_gbp"), // Tier-based top-up price in pence
  topupPricePerInspectionUsd: integer("topup_price_per_inspection_usd"), // Tier-based top-up price in cents
  topupPricePerInspectionAed: integer("topup_price_per_inspection_aed"), // Tier-based top-up price in fils
  stripePriceIdMonthlyGbp: varchar("stripe_price_id_monthly_gbp"),
  stripePriceIdAnnualGbp: varchar("stripe_price_id_annual_gbp"),
  stripePriceIdMonthlyUsd: varchar("stripe_price_id_monthly_usd"),
  stripePriceIdAnnualUsd: varchar("stripe_price_id_annual_usd"),
  stripePriceIdMonthlyAed: varchar("stripe_price_id_monthly_aed"),
  stripePriceIdAnnualAed: varchar("stripe_price_id_annual_aed"),
  isCustom: boolean("is_custom").default(false),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlanSchema = createInsertSchema(plans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;

// Country Pricing Overrides
export const countryPricingOverrides = pgTable("country_pricing_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryCode: varchar("country_code", { length: 2 }).notNull(), // ISO 3166-1 alpha-2
  planId: varchar("plan_id").notNull(),
  currency: currencyEnum("currency").notNull(),
  monthlyPriceMinorUnits: integer("monthly_price_minor_units").notNull(), // Price in smallest currency unit (pence, cents, fils)
  includedCreditsOverride: integer("included_credits_override"),
  topupPricePerCreditMinorUnits: integer("topup_price_per_credit_minor_units"), // Per-credit price for top-ups
  activeFrom: timestamp("active_from").notNull().defaultNow(),
  activeTo: timestamp("active_to"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_country_pricing_country_plan").on(table.countryCode, table.planId),
]);

export const insertCountryPricingOverrideSchema = createInsertSchema(countryPricingOverrides).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CountryPricingOverride = typeof countryPricingOverrides.$inferSelect;
export type InsertCountryPricingOverride = z.infer<typeof insertCountryPricingOverrideSchema>;

// Credit Bundles (Add-on Packages)
export const creditBundles = pgTable("credit_bundles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  credits: integer("credits").notNull(), // Number of inspections in bundle (100, 500, 1000)
  priceGbp: integer("price_gbp").notNull(), // Base price in pence (for freelancer tier)
  priceUsd: integer("price_usd").notNull(), // Base price in cents (for freelancer tier)
  priceAed: integer("price_aed").notNull(), // Base price in fils (for freelancer tier)
  sortOrder: integer("sort_order").default(0),
  isPopular: boolean("is_popular").default(false),
  discountLabel: varchar("discount_label", { length: 50 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bundleTierPricing = pgTable("bundle_tier_pricing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bundleId: varchar("bundle_id").notNull(),
  planCode: planCodeEnum("plan_code").notNull(), // Which plan tier this price applies to
  priceGbp: integer("price_gbp").notNull(), // Price in pence for this tier
  priceUsd: integer("price_usd").notNull(), // Price in cents for this tier
  priceAed: integer("price_aed").notNull(), // Price in fils for this tier
  stripePriceIdGbp: varchar("stripe_price_id_gbp"),
  stripePriceIdUsd: varchar("stripe_price_id_usd"),
  stripePriceIdAed: varchar("stripe_price_id_aed"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_bundle_tier_pricing_bundle").on(table.bundleId),
  index("idx_bundle_tier_pricing_plan").on(table.planCode),
]);

export const insertCreditBundleSchema = createInsertSchema(creditBundles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CreditBundle = typeof creditBundles.$inferSelect;
export type InsertCreditBundle = z.infer<typeof insertCreditBundleSchema>;

export const insertBundleTierPricingSchema = createInsertSchema(bundleTierPricing).omit({
  id: true,
  createdAt: true,
});
export type BundleTierPricing = typeof bundleTierPricing.$inferSelect;
export type InsertBundleTierPricing = z.infer<typeof insertBundleTierPricingSchema>;

// Billing interval for subscriptions
export const billingIntervalEnum = pgEnum("billing_interval", ["monthly", "annual"]);

// Cancellation reason for subscriptions
export const cancellationReasonEnum = pgEnum("cancellation_reason", [
  "too_expensive",
  "missing_features",
  "not_using_enough",
  "switching_provider",
  "support_issues",
  "other"
]);

// Subscriptions
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  planSnapshotJson: jsonb("plan_snapshot_json").$type<{
    planId: string;
    planCode: string;
    planName: string;
    monthlyPrice: number;
    annualPrice?: number;
    includedCredits: number;
    includedInspections: number;
    currency: string;
  }>().notNull(),
  stripeSubscriptionId: varchar("stripe_subscription_id").unique(),
  stripeCustomerId: varchar("stripe_customer_id"),
  billingInterval: billingIntervalEnum("billing_interval").notNull().default("monthly"),
  billingCycleAnchor: timestamp("billing_cycle_anchor").notNull(),
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  cancellationReason: cancellationReasonEnum("cancellation_reason"),
  cancellationReasonText: text("cancellation_reason_text"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_subscriptions_org").on(table.organizationId),
  index("idx_subscriptions_period_end").on(table.currentPeriodEnd),
]);

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

// Credit Batches (for FIFO consumption and rollover tracking)
export const creditBatches = pgTable("credit_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  grantedQuantity: integer("granted_quantity").notNull(),
  remainingQuantity: integer("remaining_quantity").notNull(),
  grantSource: creditSourceEnum("grant_source").notNull(), // plan_inclusion, topup, admin_grant
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"), // null for non-expiring batches
  unitCostMinorUnits: integer("unit_cost_minor_units"), // For valuation
  rolled: boolean("rolled").default(false), // Indicates if this batch came from a rollover
  metadataJson: jsonb("metadata_json").$type<{
    subscriptionId?: string;
    topupOrderId?: string;
    adminNotes?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_credit_batches_org_expires").on(table.organizationId, table.expiresAt),
  index("idx_credit_batches_org_granted").on(table.organizationId, table.grantedAt),
]);

export const insertCreditBatchSchema = createInsertSchema(creditBatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CreditBatch = typeof creditBatches.$inferSelect;
export type InsertCreditBatch = z.infer<typeof insertCreditBatchSchema>;

// Credit Ledger (transaction log for all credit movements)
export const creditLedger = pgTable("credit_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  createdBy: varchar("created_by"), // User who initiated this transaction (for purchases, admin grants, etc.)
  source: creditSourceEnum("source").notNull(),
  quantity: integer("quantity").notNull(), // Positive for grants, negative for consumption
  batchId: varchar("batch_id"), // Links to credit_batches
  unitCostMinorUnits: integer("unit_cost_minor_units"), // For valuation
  notes: text("notes"),
  linkedEntityType: varchar("linked_entity_type"), // e.g., "inspection", "topup_order"
  linkedEntityId: varchar("linked_entity_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_credit_ledger_org_created").on(table.organizationId, table.createdAt),
  index("idx_credit_ledger_batch").on(table.batchId),
]);

export const insertCreditLedgerSchema = createInsertSchema(creditLedger).omit({
  id: true,
  createdAt: true,
});
export type CreditLedger = typeof creditLedger.$inferSelect;
export type InsertCreditLedger = z.infer<typeof insertCreditLedgerSchema>;

// Top-up Orders
export const topupOrders = pgTable("topup_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  packSize: integer("pack_size").notNull(), // 100, 500, 1000, or custom
  currency: currencyEnum("currency").notNull(),
  unitPriceMinorUnits: integer("unit_price_minor_units").notNull(),
  totalPriceMinorUnits: integer("total_price_minor_units").notNull(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  status: topupStatusEnum("status").notNull().default("pending"),
  deliveredBatchId: varchar("delivered_batch_id"), // Links to credit_batches when delivered
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_topup_orders_org").on(table.organizationId),
]);

export const insertTopupOrderSchema = createInsertSchema(topupOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type TopupOrder = typeof topupOrders.$inferSelect;
export type InsertTopupOrder = z.infer<typeof insertTopupOrderSchema>;

// Message Templates (for broadcasting to tenants)
export const messageTemplates = pgTable("message_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  body: text("body").notNull(),
  description: text("description"),
  variables: text("variables").array(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMessageTemplateSchema = createInsertSchema(messageTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateMessageTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  description: z.string().optional(),
  variables: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type InsertMessageTemplate = z.infer<typeof insertMessageTemplateSchema>;
export type UpdateMessageTemplate = z.infer<typeof updateMessageTemplateSchema>;

// Knowledge Base Documents (for AI chatbot)
export const knowledgeBaseDocuments = pgTable("knowledge_base_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 500 }).notNull(),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  fileUrl: varchar("file_url", { length: 1000 }).notNull(),
  fileType: varchar("file_type", { length: 100 }).notNull(), // pdf, docx, txt
  fileSizeBytes: integer("file_size_bytes").notNull(),
  extractedText: text("extracted_text"), // Full text content
  category: varchar("category", { length: 255 }), // e.g., "User Guide", "Best Practices", "Compliance"
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  uploadedBy: varchar("uploaded_by").notNull(), // admin user ID
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_kb_docs_active").on(table.isActive),
  index("idx_kb_docs_category").on(table.category),
]);

export const insertKnowledgeBaseDocumentSchema = createInsertSchema(knowledgeBaseDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type KnowledgeBaseDocument = typeof knowledgeBaseDocuments.$inferSelect;
export type InsertKnowledgeBaseDocument = z.infer<typeof insertKnowledgeBaseDocumentSchema>;

// Chat Conversations (for AI chatbot)
export const chatConversations = pgTable("chat_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  userId: varchar("user_id").notNull(), // User who started the conversation
  title: varchar("title", { length: 500 }), // Auto-generated from first message
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_chat_conversations_user").on(table.userId),
  index("idx_chat_conversations_org").on(table.organizationId),
]);

export const insertChatConversationSchema = createInsertSchema(chatConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;

// Chat Messages (for AI chatbot)
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull(),
  role: varchar("role", { length: 50 }).notNull(), // "user" or "assistant"
  content: text("content").notNull(),
  sourceDocs: text("source_docs").array(), // IDs of knowledge base docs used
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_chat_messages_conversation").on(table.conversationId),
]);

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;

// Export types for the new schemas
export type CreateOrganization = z.infer<typeof createOrganizationSchema>;
export type CreateTeamMember = z.infer<typeof createTeamMemberSchema>;
export type UpdateTeamMember = z.infer<typeof updateTeamMemberSchema>;
export type UpdateUserRole = z.infer<typeof updateUserRoleSchema>;
export type UpdateUserStatus = z.infer<typeof updateUserStatusSchema>;
export type UpdateSelfProfile = z.infer<typeof updateSelfProfileSchema>;
export type UpdateProperty = z.infer<typeof updatePropertySchema>;
export type UpdateComplianceDocument = z.infer<typeof updateComplianceDocumentSchema>;
export type UpdateMaintenanceRequest = z.infer<typeof updateMaintenanceRequestSchema>;
export type AnalyzePhoto = z.infer<typeof analyzePhotoSchema>;
export type InspectField = z.infer<typeof inspectFieldSchema>;
export type GenerateComparison = z.infer<typeof generateComparisonSchema>;
export type AnalyzeMaintenanceImage = z.infer<typeof analyzeMaintenanceImageSchema>;
export type UpdateContact = z.infer<typeof updateContactSchema>;
export type UpdateTag = z.infer<typeof updateTagSchema>;
export type UpdateDashboardPreferences = z.infer<typeof updateDashboardPreferencesSchema>;
export type UpdateTemplateCategory = z.infer<typeof updateTemplateCategorySchema>;
export type UpdateInspection = z.infer<typeof updateInspectionSchema>;
export type UpdateBlock = z.infer<typeof updateBlockSchema>;

// ==================== FEEDBACK SYSTEM ====================

// Feedback enums
export const feedbackPriorityEnum = pgEnum("feedback_priority", ["low", "medium", "high"]);
export const feedbackCategoryEnum = pgEnum("feedback_category", ["bug", "feature", "improvement"]);
export const feedbackStatusEnum = pgEnum("feedback_status", ["new", "in_review", "in_progress", "completed", "rejected"]);

// Feedback submissions
export const feedbackSubmissions = pgTable("feedback_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  priority: feedbackPriorityEnum("priority").notNull().default("medium"),
  category: feedbackCategoryEnum("category").notNull().default("feature"),
  status: feedbackStatusEnum("status").notNull().default("new"),
  userId: varchar("user_id").notNull(),
  userEmail: varchar("user_email").notNull(),
  userName: varchar("user_name"),
  organizationId: varchar("organization_id"),
  organizationName: varchar("organization_name"),
  assignedTo: varchar("assigned_to"),
  assignedDepartment: varchar("assigned_department"),
  resolutionNotes: text("resolution_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("idx_feedback_user").on(table.userId),
  index("idx_feedback_status").on(table.status),
  index("idx_feedback_category").on(table.category),
  index("idx_feedback_priority").on(table.priority),
  index("idx_feedback_created").on(table.createdAt),
]);

export const insertFeedbackSchema = createInsertSchema(feedbackSubmissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
});

export const updateFeedbackSchema = z.object({
  status: z.enum(["new", "in_review", "in_progress", "completed", "rejected"]).optional(),
  assignedTo: z.string().optional().nullable(),
  assignedDepartment: z.string().optional().nullable(),
  resolutionNotes: z.string().optional().nullable(),
});

export type FeedbackSubmission = typeof feedbackSubmissions.$inferSelect;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type UpdateFeedback = z.infer<typeof updateFeedbackSchema>;

// Central team configuration for notifications
export const centralTeamConfig = pgTable("central_team_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  notificationEmail: varchar("notification_email").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCentralTeamConfigSchema = createInsertSchema(centralTeamConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CentralTeamConfig = typeof centralTeamConfig.$inferSelect;
export type InsertCentralTeamConfig = z.infer<typeof insertCentralTeamConfigSchema>;

// Notifications table for real-time alerts to tenants
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // User to receive the notification (typically tenant)
  organizationId: varchar("organization_id").notNull(),
  type: varchar("type").notNull(), // e.g., "comparison_report_created"
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  data: jsonb("data"), // Additional data like reportId, propertyId, etc.
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("notifications_user_id_idx").on(table.userId),
  index("notifications_user_read_idx").on(table.userId, table.isRead),
  index("notifications_organization_id_idx").on(table.organizationId),
]);

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// ==================== COMMUNITY DISCUSSIONS ====================

// Community enums
export const communityGroupStatusEnum = pgEnum("community_group_status", ["pending", "approved", "rejected", "archived"]);
export const communityPostStatusEnum = pgEnum("community_post_status", ["visible", "hidden", "flagged", "removed"]);
export const communityFlagReasonEnum = pgEnum("community_flag_reason", ["spam", "offensive", "harassment", "misinformation", "other"]);
export const communityModerationActionEnum = pgEnum("community_moderation_action", ["approved", "rejected", "hidden", "restored", "removed", "warned"]);

// Community Rules - versioned rules that tenants must agree to
export const communityRules = pgTable("community_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  version: integer("version").notNull().default(1),
  rulesText: text("rules_text").notNull(), // Markdown/HTML content of rules
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").notNull(), // User ID of operator who created
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_community_rules_org").on(table.organizationId),
  index("idx_community_rules_active").on(table.organizationId, table.isActive),
]);

export const insertCommunityRulesSchema = createInsertSchema(communityRules).omit({
  id: true,
  createdAt: true,
});

export type CommunityRules = typeof communityRules.$inferSelect;
export type InsertCommunityRules = z.infer<typeof insertCommunityRulesSchema>;

// Community Rule Acceptances - track which tenants accepted which version
export const communityRuleAcceptances = pgTable("community_rule_acceptances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(), // User ID of tenant
  organizationId: varchar("organization_id").notNull(),
  ruleVersion: integer("rule_version").notNull(),
  acceptedAt: timestamp("accepted_at").defaultNow(),
}, (table) => [
  index("idx_rule_acceptances_tenant").on(table.tenantId),
  index("idx_rule_acceptances_org").on(table.organizationId),
]);

export const insertCommunityRuleAcceptanceSchema = createInsertSchema(communityRuleAcceptances).omit({
  id: true,
  acceptedAt: true,
});

export type CommunityRuleAcceptance = typeof communityRuleAcceptances.$inferSelect;
export type InsertCommunityRuleAcceptance = z.infer<typeof insertCommunityRuleAcceptanceSchema>;

// Community Groups - discussion groups created by tenants (scoped to block)
export const communityGroups = pgTable("community_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  blockId: varchar("block_id").notNull(), // Scoped to a block
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  coverImageUrl: varchar("cover_image_url"),
  status: communityGroupStatusEnum("status").notNull().default("pending"),
  createdBy: varchar("created_by").notNull(), // Tenant who created the group
  ruleVersionAgreedAt: integer("rule_version_agreed_at"), // Version of rules agreed when creating
  approvedBy: varchar("approved_by"), // Operator who approved
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  memberCount: integer("member_count").default(0),
  postCount: integer("post_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_community_groups_org").on(table.organizationId),
  index("idx_community_groups_block").on(table.blockId),
  index("idx_community_groups_status").on(table.status),
  index("idx_community_groups_creator").on(table.createdBy),
]);

export const insertCommunityGroupSchema = createInsertSchema(communityGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedBy: true,
  approvedAt: true,
  memberCount: true,
  postCount: true,
});

export const updateCommunityGroupSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  coverImageUrl: z.string().optional().nullable(),
  status: z.enum(["pending", "approved", "rejected", "archived"]).optional(),
  rejectionReason: z.string().optional().nullable(),
});

export type CommunityGroup = typeof communityGroups.$inferSelect;
export type InsertCommunityGroup = z.infer<typeof insertCommunityGroupSchema>;
export type UpdateCommunityGroup = z.infer<typeof updateCommunityGroupSchema>;

// Community Group Members - tenants who joined a group
export const communityGroupMembers = pgTable("community_group_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull(),
  tenantId: varchar("tenant_id").notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  index("idx_group_members_group").on(table.groupId),
  index("idx_group_members_tenant").on(table.tenantId),
]);

export const insertCommunityGroupMemberSchema = createInsertSchema(communityGroupMembers).omit({
  id: true,
  joinedAt: true,
});

export type CommunityGroupMember = typeof communityGroupMembers.$inferSelect;
export type InsertCommunityGroupMember = z.infer<typeof insertCommunityGroupMemberSchema>;

// Community Threads - discussion threads within a group
export const communityThreads = pgTable("community_threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(), // First post content
  createdBy: varchar("created_by").notNull(), // Tenant who created
  status: communityPostStatusEnum("status").notNull().default("visible"),
  isPinned: boolean("is_pinned").default(false),
  isLocked: boolean("is_locked").default(false), // Prevents new replies
  viewCount: integer("view_count").default(0),
  replyCount: integer("reply_count").default(0),
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_community_threads_group").on(table.groupId),
  index("idx_community_threads_creator").on(table.createdBy),
  index("idx_community_threads_status").on(table.status),
  index("idx_community_threads_activity").on(table.lastActivityAt),
]);

export const insertCommunityThreadSchema = createInsertSchema(communityThreads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  viewCount: true,
  replyCount: true,
  lastActivityAt: true,
});

export const updateCommunityThreadSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).optional(),
  status: z.enum(["visible", "hidden", "flagged", "removed"]).optional(),
  isPinned: z.boolean().optional(),
  isLocked: z.boolean().optional(),
});

export type CommunityThread = typeof communityThreads.$inferSelect;
export type InsertCommunityThread = z.infer<typeof insertCommunityThreadSchema>;
export type UpdateCommunityThread = z.infer<typeof updateCommunityThreadSchema>;

// Community Posts - replies to threads
export const communityPosts = pgTable("community_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threadId: varchar("thread_id").notNull(),
  content: text("content").notNull(),
  createdBy: varchar("created_by").notNull(), // Tenant who posted
  status: communityPostStatusEnum("status").notNull().default("visible"),
  isEdited: boolean("is_edited").default(false),
  editedAt: timestamp("edited_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_community_posts_thread").on(table.threadId),
  index("idx_community_posts_creator").on(table.createdBy),
  index("idx_community_posts_status").on(table.status),
]);

export const insertCommunityPostSchema = createInsertSchema(communityPosts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isEdited: true,
  editedAt: true,
});

export const updateCommunityPostSchema = z.object({
  content: z.string().min(1).optional(),
  status: z.enum(["visible", "hidden", "flagged", "removed"]).optional(),
});

export type CommunityPost = typeof communityPosts.$inferSelect;
export type InsertCommunityPost = z.infer<typeof insertCommunityPostSchema>;
export type UpdateCommunityPost = z.infer<typeof updateCommunityPostSchema>;

// Community Attachments - images attached to threads or posts
export const communityAttachments = pgTable("community_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threadId: varchar("thread_id"), // If attached to original thread post
  postId: varchar("post_id"), // If attached to a reply
  fileUrl: varchar("file_url").notNull(),
  fileName: varchar("file_name"),
  mimeType: varchar("mime_type"),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_community_attachments_thread").on(table.threadId),
  index("idx_community_attachments_post").on(table.postId),
]);

export const insertCommunityAttachmentSchema = createInsertSchema(communityAttachments).omit({
  id: true,
  createdAt: true,
});

export type CommunityAttachment = typeof communityAttachments.$inferSelect;
export type InsertCommunityAttachment = z.infer<typeof insertCommunityAttachmentSchema>;

// Community Post Flags - user-reported content
export const communityPostFlags = pgTable("community_post_flags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threadId: varchar("thread_id"), // If flagging original thread
  postId: varchar("post_id"), // If flagging a reply
  flaggedBy: varchar("flagged_by").notNull(), // User who flagged
  reason: communityFlagReasonEnum("reason").notNull(),
  details: text("details"), // Additional explanation
  isResolved: boolean("is_resolved").default(false),
  resolvedBy: varchar("resolved_by"),
  resolutionNotes: text("resolution_notes"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_community_flags_thread").on(table.threadId),
  index("idx_community_flags_post").on(table.postId),
  index("idx_community_flags_resolved").on(table.isResolved),
]);

export const insertCommunityPostFlagSchema = createInsertSchema(communityPostFlags).omit({
  id: true,
  createdAt: true,
  isResolved: true,
  resolvedBy: true,
  resolutionNotes: true,
  resolvedAt: true,
});

export type CommunityPostFlag = typeof communityPostFlags.$inferSelect;
export type InsertCommunityPostFlag = z.infer<typeof insertCommunityPostFlagSchema>;

// Community Moderation Log - audit trail of moderation actions
export const communityModerationLog = pgTable("community_moderation_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  moderatorId: varchar("moderator_id").notNull(), // Operator who took action
  action: communityModerationActionEnum("action").notNull(),
  targetType: varchar("target_type").notNull(), // "group", "thread", "post"
  targetId: varchar("target_id").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_moderation_log_org").on(table.organizationId),
  index("idx_moderation_log_moderator").on(table.moderatorId),
  index("idx_moderation_log_target").on(table.targetType, table.targetId),
])

export const insertCommunityModerationLogSchema = createInsertSchema(communityModerationLog).omit({
  id: true,
  createdAt: true,
});

export type CommunityModerationLog = typeof communityModerationLog.$inferSelect;
export type InsertCommunityModerationLog = z.infer<typeof insertCommunityModerationLogSchema>;
