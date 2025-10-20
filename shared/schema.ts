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
export const userRoleEnum = pgEnum("user_role", ["owner", "clerk", "compliance", "tenant", "contractor"]);
export const inspectionStatusEnum = pgEnum("inspection_status", ["scheduled", "in_progress", "completed", "reviewed"]);
export const inspectionTypeEnum = pgEnum("inspection_type", ["check_in", "check_out", "routine", "maintenance"]);
export const complianceStatusEnum = pgEnum("compliance_status", ["current", "expiring_soon", "expired"]);
export const maintenanceStatusEnum = pgEnum("maintenance_status", ["open", "in_progress", "completed", "closed"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "inactive", "cancelled"]);
export const unitStatusEnum = pgEnum("unit_status", ["occupied", "vacant"]);
export const workOrderStatusEnum = pgEnum("work_order_status", ["assigned", "in_progress", "waiting_parts", "completed", "rejected"]);

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
  role: true,
}).extend({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
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

// Properties (Buildings/Blocks)
export const properties = pgTable("properties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  blockId: varchar("block_id"), // Optional: properties can be grouped into blocks
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
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  floor: integer("floor"),
  sqft: integer("sqft"),
  status: unitStatusEnum("status").default("vacant"),
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
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});
export type InventoryTemplate = typeof inventoryTemplates.$inferSelect;
export type InsertInventoryTemplate = z.infer<typeof insertInventoryTemplateSchema>;

// Inventories (Active inventory instances for units)
export const inventories = pgTable("inventories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  unitId: varchar("unit_id").notNull(),
  templateId: varchar("template_id"),
  version: integer("version").default(1),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInventorySchema = createInsertSchema(inventories).omit({
  id: true,
  organizationId: true,
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
  contractorId: varchar("contractor_id").notNull(), // User with contractor role
  status: workOrderStatusEnum("status").notNull().default("assigned"),
  slaDue: timestamp("sla_due"), // Service Level Agreement deadline
  costEstimate: integer("cost_estimate"), // In cents
  costActual: integer("cost_actual"), // In cents
  variationNotes: text("variation_notes"), // Notes on cost variations
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWorkOrderSchema = createInsertSchema(workOrders).omit({
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
  complianceDocuments: many(complianceDocuments),
  creditTransactions: many(creditTransactions),
  inventoryTemplates: many(inventoryTemplates),
  workOrders: many(workOrders),
}));

export const blocksRelations = relations(blocks, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [blocks.organizationId],
    references: [organizations.id],
  }),
  properties: many(properties),
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
  units: many(units),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  property: one(properties, {
    fields: [units.propertyId],
    references: [properties.id],
  }),
  inspections: many(inspections),
  maintenanceRequests: many(maintenanceRequests),
  inventories: many(inventories),
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
  unit: one(units, {
    fields: [inventories.unitId],
    references: [units.id],
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
  unit: one(units, {
    fields: [maintenanceRequests.unitId],
    references: [units.id],
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
