/**
 * Rent Management Phase 1 — operational subledger schema.
 * Money is always integer minor units (pence). Never use binary float for ledger math.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const RENT_ACCOUNT_STATUSES = ["active", "closed", "suspended"] as const;
export type RentAccountStatus = (typeof RENT_ACCOUNT_STATUSES)[number];

export const RENT_FREQUENCIES = ["weekly", "fortnightly", "monthly", "quarterly"] as const;
export type RentFrequency = (typeof RENT_FREQUENCIES)[number];

export const RENT_PRORATION_RULES = ["actual_days", "none"] as const;
export type RentProrationRule = (typeof RENT_PRORATION_RULES)[number];

export const RENT_MONTH_END_RULES = ["clamp_to_last_day", "roll_forward"] as const;

export const RENT_CHARGE_TYPES = ["rent", "opening_balance", "concession", "adjustment"] as const;
export type RentChargeType = (typeof RENT_CHARGE_TYPES)[number];

export const RENT_CHARGE_STATUSES = [
  "scheduled",
  "due",
  "part_paid",
  "paid",
  "overdue",
  "reversed",
  "adjusted",
] as const;
export type RentChargeStatus = (typeof RENT_CHARGE_STATUSES)[number];

export const RENT_RECEIPT_STATUSES = [
  "pending",
  "confirmed",
  "failed",
  "reversed",
  "refunded",
] as const;
export type RentReceiptStatus = (typeof RENT_RECEIPT_STATUSES)[number];

export const RENT_RECEIPT_CHANNELS = [
  "manual",
  "bank_csv",
  "bank_match",
  "legacy_migration",
  "provider",
] as const;

export const RENT_ALLOCATION_STATES = ["unallocated", "partial", "allocated"] as const;

export const RENT_BANK_MATCH_STATES = [
  "unmatched",
  "suggested",
  "confirmed",
  "reconciled",
  "ignored",
] as const;

export const RENT_ARREARS_CASE_STATES = [
  "review_required",
  "contact_scheduled",
  "reminder_sent",
  "plan_active",
  "disputed",
  "on_hold",
  "escalated",
  "resolved",
] as const;

export const RENT_ADJUSTMENT_TYPES = [
  "concession",
  "write_off",
  "correction",
  "opening_balance",
  "reversal",
] as const;

export const RENT_REVIEW_STATUSES = [
  "eligibility_check",
  "draft",
  "awaiting_approval",
  "approved",
  "notice_ready",
  "challenged",
  "effective",
  "rejected",
  "manual_review",
] as const;

export const RENT_JURISDICTIONS = ["england", "wales", "scotland", "ni", "other"] as const;
export const RENT_TENANCY_TYPES = [
  "assured",
  "assured_shorthold",
  "license",
  "hmo_room",
  "other",
] as const;

/** Convert major currency units (e.g. 1100.50) to minor units (110050). */
export function toMinorUnits(major: string | number | null | undefined): number {
  if (major === null || major === undefined || major === "") return 0;
  const n = typeof major === "number" ? major : parseFloat(String(major).replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Convert minor units to fixed 2-decimal major string. */
export function fromMinorUnits(minor: number | null | undefined): string {
  const n = Number(minor) || 0;
  return (n / 100).toFixed(2);
}

export function formatGbpMinor(minor: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format((Number(minor) || 0) / 100);
}

// ---- Tables ----

export const rentAccounts = pgTable(
  "rent_accounts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    tenancyId: varchar("tenancy_id").notNull(), // tenant_assignments.id
    propertyId: varchar("property_id").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("GBP"),
    jurisdiction: varchar("jurisdiction", { length: 32 }).notNull().default("england"),
    tenancyType: varchar("tenancy_type", { length: 40 }).notNull().default("assured_shorthold"),
    collectionAccountId: varchar("collection_account_id"),
    payerReference: varchar("payer_reference", { length: 120 }),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    timezone: varchar("timezone", { length: 64 }).notNull().default("Europe/London"),
    monthEndRule: varchar("month_end_rule", { length: 32 }).notNull().default("clamp_to_last_day"),
    unappliedCreditMinor: integer("unapplied_credit_minor").notNull().default(0),
    migratedFromLegacy: boolean("migrated_from_legacy").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("rent_accounts_tenancy_uidx").on(table.tenancyId),
    index("rent_accounts_org_idx").on(table.organizationId),
    index("rent_accounts_org_property_idx").on(table.organizationId, table.propertyId),
    index("rent_accounts_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const rentScheduleVersions = pgTable(
  "rent_schedule_versions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    accountId: varchar("account_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    frequency: varchar("frequency", { length: 24 }).notNull().default("monthly"),
    dueDay: integer("due_day").notNull().default(1),
    dueRule: varchar("due_rule", { length: 64 }).notNull().default("day_of_month"),
    effectiveFrom: timestamp("effective_from").notNull(),
    effectiveTo: timestamp("effective_to"),
    prorationRule: varchar("proration_rule", { length: 32 }).notNull().default("actual_days"),
    approvedBy: varchar("approved_by"),
    approvedAt: timestamp("approved_at"),
    status: varchar("status", { length: 24 }).notNull().default("draft"), // draft | approved | superseded
    evidenceId: varchar("evidence_id"),
    idempotencyKey: varchar("idempotency_key", { length: 120 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("rent_schedule_versions_account_idx").on(table.accountId),
    index("rent_schedule_versions_org_idx").on(table.organizationId),
    uniqueIndex("rent_schedule_versions_idem_uidx").on(table.organizationId, table.idempotencyKey),
  ],
);

export const rentCharges = pgTable(
  "rent_charges",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    accountId: varchar("account_id").notNull(),
    scheduleVersionId: varchar("schedule_version_id"),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    dueDate: timestamp("due_date").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    allocatedMinor: integer("allocated_minor").notNull().default(0),
    type: varchar("type", { length: 32 }).notNull().default("rent"),
    status: varchar("status", { length: 24 }).notNull().default("scheduled"),
    linkedReversalId: varchar("linked_reversal_id"),
    legacyPeriodId: varchar("legacy_period_id"),
    postedAt: timestamp("posted_at"),
    effectiveDate: timestamp("effective_date"),
    currency: varchar("currency", { length: 3 }).notNull().default("GBP"),
    idempotencyKey: varchar("idempotency_key", { length: 160 }),
    createdBy: varchar("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("rent_charges_account_due_idx").on(table.accountId, table.dueDate),
    index("rent_charges_org_status_idx").on(table.organizationId, table.status),
    index("rent_charges_org_due_idx").on(table.organizationId, table.dueDate),
    uniqueIndex("rent_charges_period_uidx").on(
      table.accountId,
      table.scheduleVersionId,
      table.periodStart,
      table.type,
    ),
    uniqueIndex("rent_charges_idem_uidx").on(table.organizationId, table.idempotencyKey),
  ],
);

export const rentReceipts = pgTable(
  "rent_receipts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    accountId: varchar("account_id"), // null = suspense
    amountMinor: integer("amount_minor").notNull(),
    allocatedMinor: integer("allocated_minor").notNull().default(0),
    channel: varchar("channel", { length: 32 }).notNull().default("manual"),
    reference: varchar("reference", { length: 160 }),
    receivedAt: timestamp("received_at").notNull(),
    confirmedAt: timestamp("confirmed_at"),
    externalId: varchar("external_id", { length: 160 }),
    source: varchar("source", { length: 80 }),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    allocationState: varchar("allocation_state", { length: 24 }).notNull().default("unallocated"),
    bankAccountId: varchar("bank_account_id"),
    bankTransactionId: varchar("bank_transaction_id"),
    currency: varchar("currency", { length: 3 }).notNull().default("GBP"),
    idempotencyKey: varchar("idempotency_key", { length: 160 }),
    notes: text("notes"),
    createdBy: varchar("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("rent_receipts_org_status_idx").on(table.organizationId, table.status),
    index("rent_receipts_account_idx").on(table.accountId),
    uniqueIndex("rent_receipts_idem_uidx").on(table.organizationId, table.idempotencyKey),
    uniqueIndex("rent_receipts_external_uidx").on(table.organizationId, table.externalId),
  ],
);

export const rentAllocations = pgTable(
  "rent_allocations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    receiptId: varchar("receipt_id").notNull(),
    chargeId: varchar("charge_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    effectiveAt: timestamp("effective_at").notNull(),
    reversalOf: varchar("reversal_of"),
    isReversed: boolean("is_reversed").notNull().default(false),
    createdBy: varchar("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("rent_allocations_receipt_idx").on(table.receiptId),
    index("rent_allocations_charge_idx").on(table.chargeId),
    index("rent_allocations_org_idx").on(table.organizationId),
  ],
);

export const rentAdjustments = pgTable(
  "rent_adjustments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    accountId: varchar("account_id").notNull(),
    chargeId: varchar("charge_id"),
    receiptId: varchar("receipt_id"),
    type: varchar("type", { length: 32 }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    reason: text("reason"),
    status: varchar("status", { length: 24 }).notNull().default("pending"), // pending | approved | rejected
    approvedBy: varchar("approved_by"),
    approvedAt: timestamp("approved_at"),
    postedAt: timestamp("posted_at"),
    reversalOf: varchar("reversal_of"),
    createdBy: varchar("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("rent_adjustments_account_idx").on(table.accountId),
    index("rent_adjustments_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    bankAccountLabel: varchar("bank_account_label", { length: 120 }),
    valueDate: timestamp("value_date").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("GBP"),
    direction: varchar("direction", { length: 16 }).notNull().default("in"), // in | out
    reference: varchar("reference", { length: 255 }),
    counterparty: varchar("counterparty", { length: 255 }),
    sourceId: varchar("source_id", { length: 160 }),
    fingerprint: varchar("fingerprint", { length: 160 }),
    rawJson: jsonb("raw_json"),
    matchState: varchar("match_state", { length: 24 }).notNull().default("unmatched"),
    suggestedAccountId: varchar("suggested_account_id"),
    receiptId: varchar("receipt_id"),
    importBatchId: varchar("import_batch_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("bank_transactions_org_match_idx").on(table.organizationId, table.matchState),
    uniqueIndex("bank_transactions_source_uidx").on(table.organizationId, table.sourceId),
    uniqueIndex("bank_transactions_fp_uidx").on(table.organizationId, table.fingerprint),
  ],
);

export const reconciliationRuns = pgTable(
  "reconciliation_runs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    bankAccountLabel: varchar("bank_account_label", { length: 120 }),
    openedAt: timestamp("opened_at").defaultNow(),
    closedAt: timestamp("closed_at"),
    openingBalanceMinor: integer("opening_balance_minor").default(0),
    closingBalanceMinor: integer("closing_balance_minor"),
    status: varchar("status", { length: 24 }).notNull().default("open"),
    reviewerId: varchar("reviewer_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("reconciliation_runs_org_idx").on(table.organizationId)],
);

export const reconciliationLinks = pgTable(
  "reconciliation_links",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    runId: varchar("run_id").notNull(),
    bankTransactionId: varchar("bank_transaction_id").notNull(),
    receiptId: varchar("receipt_id"),
    reviewerId: varchar("reviewer_id"),
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("reconciliation_links_run_idx").on(table.runId),
    index("reconciliation_links_org_idx").on(table.organizationId),
  ],
);

export const arrearsCases = pgTable(
  "arrears_cases",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    accountId: varchar("account_id").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("review_required"),
    overdueMinor: integer("overdue_minor").notNull().default(0),
    oldestDueDate: timestamp("oldest_due_date"),
    assignedTo: varchar("assigned_to"),
    nextActionAt: timestamp("next_action_at"),
    lastContactAt: timestamp("last_contact_at"),
    holdReason: text("hold_reason"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("arrears_cases_org_status_idx").on(table.organizationId, table.status),
    index("arrears_cases_account_idx").on(table.accountId),
  ],
);

export const arrearsCaseEvents = pgTable(
  "arrears_case_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    caseId: varchar("case_id").notNull(),
    eventType: varchar("event_type", { length: 48 }).notNull(),
    note: text("note"),
    actorUserId: varchar("actor_user_id"),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("arrears_case_events_case_idx").on(table.caseId),
    index("arrears_case_events_org_idx").on(table.organizationId),
  ],
);

export const paymentPlans = pgTable(
  "payment_plans",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    accountId: varchar("account_id").notNull(),
    caseId: varchar("case_id"),
    originalArrearsMinor: integer("original_arrears_minor").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    notes: text("notes"),
    approvedBy: varchar("approved_by"),
    approvedAt: timestamp("approved_at"),
    createdBy: varchar("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("payment_plans_account_idx").on(table.accountId),
    index("payment_plans_org_idx").on(table.organizationId),
  ],
);

export const planInstalments = pgTable(
  "plan_instalments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    planId: varchar("plan_id").notNull(),
    dueDate: timestamp("due_date").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    paidMinor: integer("paid_minor").notNull().default(0),
    status: varchar("status", { length: 24 }).notNull().default("due"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("plan_instalments_plan_idx").on(table.planId)],
);

export const rentNotificationEvents = pgTable(
  "rent_notification_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    accountId: varchar("account_id"),
    caseId: varchar("case_id"),
    channel: varchar("channel", { length: 32 }).notNull().default("email"),
    templateKey: varchar("template_key", { length: 64 }),
    status: varchar("status", { length: 24 }).notNull().default("queued"),
    scheduledFor: timestamp("scheduled_for"),
    sentAt: timestamp("sent_at"),
    dedupeKey: varchar("dedupe_key", { length: 160 }),
    payloadJson: jsonb("payload_json"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("rent_notification_events_dedupe_uidx").on(table.organizationId, table.dedupeKey),
    index("rent_notification_events_org_idx").on(table.organizationId),
  ],
);

export const rentReviews = pgTable(
  "rent_reviews",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    accountId: varchar("account_id").notNull(),
    currentAmountMinor: integer("current_amount_minor").notNull(),
    proposedAmountMinor: integer("proposed_amount_minor"),
    status: varchar("status", { length: 32 }).notNull().default("eligibility_check"),
    eligibilityNotes: text("eligibility_notes"),
    proposedEffectiveDate: timestamp("proposed_effective_date"),
    noticeServedAt: timestamp("notice_served_at"),
    noticeEvidenceId: varchar("notice_evidence_id"),
    challengeStatus: varchar("challenge_status", { length: 48 }),
    approvedBy: varchar("approved_by"),
    approvedAt: timestamp("approved_at"),
    effectiveAt: timestamp("effective_at"),
    scheduleVersionId: varchar("schedule_version_id"),
    createdBy: varchar("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("rent_reviews_org_status_idx").on(table.organizationId, table.status),
    index("rent_reviews_account_idx").on(table.accountId),
  ],
);

export const statementSnapshots = pgTable(
  "statement_snapshots",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    accountId: varchar("account_id").notNull(),
    fromDate: timestamp("from_date").notNull(),
    toDate: timestamp("to_date").notNull(),
    asOf: timestamp("as_of").notNull(),
    openingBalanceMinor: integer("opening_balance_minor").notNull().default(0),
    closingBalanceMinor: integer("closing_balance_minor").notNull().default(0),
    unappliedCreditMinor: integer("unapplied_credit_minor").notNull().default(0),
    payloadJson: jsonb("payload_json").notNull(),
    deliveredAt: timestamp("delivered_at"),
    deliveryChannel: varchar("delivery_channel", { length: 32 }),
    createdBy: varchar("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("statement_snapshots_account_idx").on(table.accountId),
    index("statement_snapshots_org_idx").on(table.organizationId),
  ],
);

export const financialAuditEvents = pgTable(
  "financial_audit_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    entityType: varchar("entity_type", { length: 48 }).notNull(),
    entityId: varchar("entity_id").notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    actorUserId: varchar("actor_user_id"),
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("financial_audit_events_org_idx").on(table.organizationId),
    index("financial_audit_events_entity_idx").on(table.entityType, table.entityId),
  ],
);

// ---- Zod / types ----

export const insertRentAccountSchema = createInsertSchema(rentAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type RentAccount = typeof rentAccounts.$inferSelect;
export type InsertRentAccount = z.infer<typeof insertRentAccountSchema>;

export type RentScheduleVersion = typeof rentScheduleVersions.$inferSelect;
export type RentCharge = typeof rentCharges.$inferSelect;
export type RentReceipt = typeof rentReceipts.$inferSelect;
export type RentAllocation = typeof rentAllocations.$inferSelect;
export type RentAdjustment = typeof rentAdjustments.$inferSelect;
export type BankTransaction = typeof bankTransactions.$inferSelect;
export type ArrearsCase = typeof arrearsCases.$inferSelect;
export type RentReview = typeof rentReviews.$inferSelect;
export type StatementSnapshot = typeof statementSnapshots.$inferSelect;
export type FinancialAuditEvent = typeof financialAuditEvents.$inferSelect;

export const createReceiptBodySchema = z.object({
  accountId: z.string().min(1).nullable().optional(),
  amountMinor: z.number().int().positive().optional(),
  amount: z.union([z.string(), z.number()]).optional(), // major units convenience
  currency: z.string().length(3).optional(),
  reference: z.string().max(160).optional(),
  receivedAt: z.string().datetime().or(z.string().min(4)).optional(),
  channel: z.enum(RENT_RECEIPT_CHANNELS).optional(),
  confirm: z.boolean().optional().default(true),
  allocateOldestFirst: z.boolean().optional().default(true),
  allocations: z
    .array(
      z.object({
        chargeId: z.string().min(1),
        amountMinor: z.number().int().positive(),
      }),
    )
    .optional(),
  creditExcess: z.boolean().optional().default(true),
  notes: z.string().max(2000).optional(),
  idempotencyKey: z.string().max(160).optional(),
});

export const createScheduleVersionBodySchema = z.object({
  amountMinor: z.number().int().positive().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  frequency: z.enum(RENT_FREQUENCIES).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  effectiveFrom: z.string().min(4),
  effectiveTo: z.string().optional().nullable(),
  prorationRule: z.enum(RENT_PRORATION_RULES).optional(),
  approve: z.boolean().optional().default(true),
  notes: z.string().max(2000).optional(),
  idempotencyKey: z.string().max(160).optional(),
});
