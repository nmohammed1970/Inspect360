import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/** Nov 2026 self-serve billing catalog (versioned). Amounts in integer minor units (pence). */

export const billingPriceVersions = pgTable(
  "billing_price_versions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    label: varchar("label", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"), // draft | published | archived
    publishedAt: timestamp("published_at"),
    publishedBy: varchar("published_by"),
    checksum: varchar("checksum", { length: 128 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    createdBy: varchar("created_by"),
  },
  (t) => [index("idx_billing_price_versions_status").on(t.status)],
);

export const billingPlans = pgTable(
  "billing_plans",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    code: varchar("code", { length: 64 }).notNull().unique(),
    tab: varchar("tab", { length: 32 }).notNull(), // property_management | ai_inspections
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    popular: boolean("popular").notNull().default(false),
    enquireOnly: boolean("enquire_only").notNull().default(false),
    maxProperties: integer("max_properties"), // null = unlimited / N/A
    maxUsers: integer("max_users"),
    monthlyInspections: integer("monthly_inspections"),
    yearlyInspections: integer("yearly_inspections"),
    smsPerYear: integer("sms_per_year").default(0),
    allowsPropertyPacks: boolean("allows_property_packs").notNull().default(false),
    allowsExtraUsers: boolean("allows_extra_users").notNull().default(false),
    modulesJson: jsonb("modules_json").$type<Record<string, boolean | "addon">>().default({}),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("idx_billing_plans_tab").on(t.tab)],
);

export const billingPlanPrices = pgTable(
  "billing_plan_prices",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    versionId: varchar("version_id")
      .notNull()
      .references(() => billingPriceVersions.id),
    planCode: varchar("plan_code", { length: 64 }).notNull(),
    cycle: varchar("cycle", { length: 16 }).notNull(), // monthly | yearly
    amountMinor: integer("amount_minor").notNull(), // pence, ex VAT; 0 for enquire
    currency: varchar("currency", { length: 3 }).notNull().default("GBP"),
    stripeLookupKey: varchar("stripe_lookup_key", { length: 128 }),
    paygUnitMinor: integer("payg_unit_minor"), // for pay-as-you-go
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("uidx_billing_plan_prices_ver_plan_cycle").on(t.versionId, t.planCode, t.cycle),
    index("idx_billing_plan_prices_version").on(t.versionId),
  ],
);

export const billingAddons = pgTable("billing_addons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  kind: varchar("kind", { length: 32 }).notNull(), // hmo | property_pack | extra_user | heyteam
  monthlyAmountMinor: integer("monthly_amount_minor"),
  yearlyAmountMinor: integer("yearly_amount_minor"),
  currency: varchar("currency", { length: 3 }).notNull().default("GBP"),
  stripeLookupKeyMonth: varchar("stripe_lookup_key_month", { length: 128 }),
  stripeLookupKeyYear: varchar("stripe_lookup_key_year", { length: 128 }),
  maxQuantity: integer("max_quantity"),
  propertiesPerPack: integer("properties_per_pack"),
  inspectionsPerMonth: integer("inspections_per_month"),
  inspectionsPerYear: integer("inspections_per_year"),
  availableOnPlansJson: jsonb("available_on_plans_json").$type<string[]>().default([]),
  includedFreeOnPlansJson: jsonb("included_free_on_plans_json").$type<string[]>().default([]),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const billingTopupPacks = pgTable("billing_topup_packs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 64 }).notNull().unique(),
  kind: varchar("kind", { length: 32 }).notNull(), // inspection | sms
  name: varchar("name", { length: 128 }).notNull(),
  quantity: integer("quantity").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("GBP"),
  expiryMonths: integer("expiry_months").notNull().default(12),
  stripeLookupKey: varchar("stripe_lookup_key", { length: 128 }),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const billingPriceVersionItems = pgTable(
  "billing_price_version_items",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    versionId: varchar("version_id")
      .notNull()
      .references(() => billingPriceVersions.id),
    itemType: varchar("item_type", { length: 32 }).notNull(), // plan_price | addon | topup | setting
    itemCode: varchar("item_code", { length: 64 }).notNull(),
    payloadJson: jsonb("payload_json").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("idx_billing_price_version_items_ver").on(t.versionId)],
);

export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull().unique(),
    planCode: varchar("plan_code", { length: 64 }).notNull(),
    cycle: varchar("cycle", { length: 16 }).notNull().default("yearly"),
    priceVersionId: varchar("price_version_id").references(() => billingPriceVersions.id),
    status: varchar("status", { length: 32 }).notNull().default("trialing"),
    // trialing | active | past_due | read_only | canceled | incomplete
    periodStart: timestamp("period_start"),
    periodEnd: timestamp("period_end"),
    trialEnd: timestamp("trial_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    propertyPacks: integer("property_packs").notNull().default(0),
    extraUsers: integer("extra_users").notNull().default(0),
    hmoAddon: boolean("hmo_addon").notNull().default(false),
    stripeCustomerId: varchar("stripe_customer_id"),
    stripeSubscriptionId: varchar("stripe_subscription_id"),
    firstPaymentFailureAt: timestamp("first_payment_failure_at"),
    scheduledPlanCode: varchar("scheduled_plan_code", { length: 64 }),
    scheduledCycle: varchar("scheduled_cycle", { length: 16 }),
    /** Upgrade awaiting proration invoice payment — local planCode stays old until paid. */
    pendingPlanCode: varchar("pending_plan_code", { length: 64 }),
    pendingCycle: varchar("pending_cycle", { length: 16 }),
    pendingAmountMinor: integer("pending_amount_minor"),
    pendingPriceVersionId: varchar("pending_price_version_id"),
    amountMinorFrozen: integer("amount_minor_frozen"),
    currency: varchar("currency", { length: 3 }).notNull().default("GBP"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("idx_billing_subscriptions_status").on(t.status),
    index("idx_billing_subscriptions_stripe").on(t.stripeSubscriptionId),
  ],
);

export const billingOrgSettings = pgTable("billing_org_settings", {
  organizationId: varchar("organization_id").primaryKey(),
  autoTopupEnabled: boolean("auto_topup_enabled").notNull().default(false),
  autoTopupPackCode: varchar("auto_topup_pack_code", { length: 64 }),
  autoTopupCountThisMonth: integer("auto_topup_count_this_month").notNull().default(0),
  autoTopupMonthKey: varchar("auto_topup_month_key", { length: 7 }), // YYYY-MM
  moneyBackEligibleUntil: timestamp("money_back_eligible_until"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const billingWebhookEvents = pgTable(
  "billing_webhook_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    stripeEventId: varchar("stripe_event_id", { length: 255 }).notNull().unique(),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    payloadJson: jsonb("payload_json"),
    processedAt: timestamp("processed_at"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("idx_billing_webhook_events_type").on(t.eventType)],
);

export const billingAuditLog = pgTable(
  "billing_audit_log",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    actorType: varchar("actor_type", { length: 32 }).notNull(), // admin | user | system
    actorId: varchar("actor_id"),
    organizationId: varchar("organization_id"),
    action: varchar("action", { length: 128 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }),
    entityId: varchar("entity_id"),
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("idx_billing_audit_org").on(t.organizationId, t.createdAt),
    index("idx_billing_audit_action").on(t.action),
  ],
);

export const billingAnalyticsEvents = pgTable(
  "billing_analytics_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id"),
    userId: varchar("user_id"),
    eventName: varchar("event_name", { length: 64 }).notNull(),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("idx_billing_analytics_name").on(t.eventName, t.createdAt)],
);

export const billingPlatformConfig = pgTable("billing_platform_config", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type BillingPriceVersion = typeof billingPriceVersions.$inferSelect;
export type BillingPlan = typeof billingPlans.$inferSelect;
export type BillingPlanPrice = typeof billingPlanPrices.$inferSelect;
export type BillingAddon = typeof billingAddons.$inferSelect;
export type BillingTopupPack = typeof billingTopupPacks.$inferSelect;
export type BillingSubscription = typeof billingSubscriptions.$inferSelect;
export type BillingOrgSettings = typeof billingOrgSettings.$inferSelect;

export const insertBillingPlanSchema = createInsertSchema(billingPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBillingPlan = z.infer<typeof insertBillingPlanSchema>;
