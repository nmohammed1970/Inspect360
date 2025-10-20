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
export const userRoleEnum = pgEnum("user_role", ["owner", "clerk", "compliance", "tenant"]);
export const inspectionStatusEnum = pgEnum("inspection_status", ["scheduled", "in_progress", "completed", "reviewed"]);
export const inspectionTypeEnum = pgEnum("inspection_type", ["check_in", "check_out", "routine", "maintenance"]);
export const complianceStatusEnum = pgEnum("compliance_status", ["current", "expiring_soon", "expired"]);
export const maintenanceStatusEnum = pgEnum("maintenance_status", ["open", "in_progress", "completed", "closed"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "inactive", "cancelled"]);

// User storage table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique().notNull(),
  password: varchar("password").notNull(),
  email: varchar("email").unique().notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: userRoleEnum("role").notNull().default("owner"),
  organizationId: varchar("organization_id"),
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
});

export const loginUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type RegisterUser = z.infer<typeof registerUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;

// Organizations
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  ownerId: varchar("owner_id").notNull(),
  stripeCustomerId: varchar("stripe_customer_id"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").default("inactive"),
  creditsRemaining: integer("credits_remaining").default(0),
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

// Properties (Buildings/Blocks)
export const properties = pgTable("properties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  name: varchar("name").notNull(),
  address: text("address").notNull(),
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

// Units (Individual apartments/units)
export const units = pgTable("units", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull(),
  unitNumber: varchar("unit_number").notNull(),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUnitSchema = createInsertSchema(units).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Unit = typeof units.$inferSelect;
export type InsertUnit = z.infer<typeof insertUnitSchema>;

// Inspections
export const inspections = pgTable("inspections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitId: varchar("unit_id").notNull(),
  inspectorId: varchar("inspector_id").notNull(),
  type: inspectionTypeEnum("type").notNull(),
  status: inspectionStatusEnum("status").notNull().default("scheduled"),
  scheduledDate: timestamp("scheduled_date"),
  completedDate: timestamp("completed_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInspectionSchema = createInsertSchema(inspections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Inspection = typeof inspections.$inferSelect;
export type InsertInspection = z.infer<typeof insertInspectionSchema>;

// Inspection Items (Photos and condition ratings)
export const inspectionItems = pgTable("inspection_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inspectionId: varchar("inspection_id").notNull(),
  category: varchar("category").notNull(), // e.g., "Kitchen", "Bathroom", "Living Room"
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

// Compliance Documents
export const complianceDocuments = pgTable("compliance_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  propertyId: varchar("property_id"),
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
});
export type ComplianceDocument = typeof complianceDocuments.$inferSelect;
export type InsertComplianceDocument = z.infer<typeof insertComplianceDocumentSchema>;

// Maintenance Requests (Internal tracking)
export const maintenanceRequests = pgTable("maintenance_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitId: varchar("unit_id").notNull(),
  reportedBy: varchar("reported_by").notNull(),
  assignedTo: varchar("assigned_to"),
  title: varchar("title").notNull(),
  description: text("description"),
  status: maintenanceStatusEnum("status").notNull().default("open"),
  priority: varchar("priority").notNull().default("medium"), // low, medium, high
  photoUrl: text("photo_url"),
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

// Comparison Reports (AI-generated comparison between check-in and check-out)
export const comparisonReports = pgTable("comparison_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitId: varchar("unit_id").notNull(),
  checkInInspectionId: varchar("check_in_inspection_id").notNull(),
  checkOutInspectionId: varchar("check_out_inspection_id").notNull(),
  aiSummary: text("ai_summary"), // Overall AI-generated comparison
  itemComparisons: jsonb("item_comparisons"), // Array of item-by-item comparisons
  generatedBy: varchar("generated_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertComparisonReportSchema = createInsertSchema(comparisonReports).omit({
  id: true,
  createdAt: true,
});
export type ComparisonReport = typeof comparisonReports.$inferSelect;
export type InsertComparisonReport = z.infer<typeof insertComparisonReportSchema>;

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

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  properties: many(properties),
  complianceDocuments: many(complianceDocuments),
  creditTransactions: many(creditTransactions),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [properties.organizationId],
    references: [organizations.id],
  }),
  units: many(units),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  property: one(properties, {
    fields: [units.propertyId],
    references: [properties.id],
  }),
  inspections: many(inspections),
  maintenanceRequests: many(maintenanceRequests),
}));

export const inspectionsRelations = relations(inspections, ({ one, many }) => ({
  unit: one(units, {
    fields: [inspections.unitId],
    references: [units.id],
  }),
  items: many(inspectionItems),
}));

export const inspectionItemsRelations = relations(inspectionItems, ({ one }) => ({
  inspection: one(inspections, {
    fields: [inspectionItems.inspectionId],
    references: [inspections.id],
  }),
}));
