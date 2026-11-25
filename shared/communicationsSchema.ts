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

/** Communications Hub — first-class operational cases. */

export const COMMUNICATION_CASE_STATUSES = [
  "new",
  "triaged",
  "assigned",
  "in_progress",
  "awaiting_tenant",
  "awaiting_approval",
  "awaiting_third_party",
  "resolved",
  "closed",
  "cancelled",
  "duplicate",
] as const;
export type CommunicationCaseStatus = (typeof COMMUNICATION_CASE_STATUSES)[number];

export const COMMUNICATION_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type CommunicationPriority = (typeof COMMUNICATION_PRIORITIES)[number];

export const COMMUNICATION_SOURCES = [
  "tenant_portal",
  "app",
  "email",
  "whatsapp",
  "phone",
  "manual",
  "maintenance",
  "system",
] as const;
export type CommunicationSource = (typeof COMMUNICATION_SOURCES)[number];

export const COMMUNICATION_MESSAGE_VISIBILITIES = ["tenant", "internal"] as const;
export type CommunicationMessageVisibility =
  (typeof COMMUNICATION_MESSAGE_VISIBILITIES)[number];

export const COMMUNICATION_DELIVERY_STATUSES = [
  "queued",
  "sent",
  "delivered",
  "failed",
  "unknown",
  "not_applicable",
] as const;

export const COMMUNICATION_APPROVAL_POLICIES = [
  "none",
  "required",
  "conditional",
] as const;

export const COMMUNICATION_LINK_ENTITY_TYPES = [
  "maintenance_request",
  "work_order",
  "inspection",
  "tenancy",
  "property",
  "case",
] as const;

export const DEFAULT_COMMUNICATION_CATEGORIES: Array<{
  key: string;
  label: string;
  defaultPriority: CommunicationPriority;
  approvalPolicy: (typeof COMMUNICATION_APPROVAL_POLICIES)[number];
  sortOrder: number;
}> = [
  { key: "maintenance", label: "Maintenance", defaultPriority: "medium", approvalPolicy: "conditional", sortOrder: 10 },
  { key: "rent_payments", label: "Rent & payments", defaultPriority: "medium", approvalPolicy: "required", sortOrder: 20 },
  { key: "tenancy", label: "Tenancy", defaultPriority: "medium", approvalPolicy: "required", sortOrder: 30 },
  { key: "complaints", label: "Complaints", defaultPriority: "high", approvalPolicy: "conditional", sortOrder: 40 },
  { key: "health_safety", label: "Health & safety", defaultPriority: "urgent", approvalPolicy: "conditional", sortOrder: 50 },
  { key: "access", label: "Access", defaultPriority: "medium", approvalPolicy: "none", sortOrder: 60 },
  { key: "property_alterations", label: "Property alterations", defaultPriority: "medium", approvalPolicy: "required", sortOrder: 70 },
  { key: "documentation", label: "Documentation", defaultPriority: "low", approvalPolicy: "none", sortOrder: 80 },
  { key: "inspections", label: "Inspections", defaultPriority: "medium", approvalPolicy: "none", sortOrder: 90 },
  { key: "move_in", label: "Move-in", defaultPriority: "medium", approvalPolicy: "none", sortOrder: 100 },
  { key: "move_out", label: "Move-out", defaultPriority: "medium", approvalPolicy: "none", sortOrder: 110 },
  { key: "general", label: "General", defaultPriority: "low", approvalPolicy: "none", sortOrder: 120 },
  { key: "internal", label: "Internal", defaultPriority: "low", approvalPolicy: "none", sortOrder: 130 },
];

/** Public labels tenants may see (mapped from internal status). */
export const PUBLIC_CASE_STATUS_LABELS: Record<string, string> = {
  new: "Received",
  triaged: "Under review",
  assigned: "Under review",
  in_progress: "In progress",
  awaiting_tenant: "Waiting for you",
  awaiting_approval: "Under review",
  awaiting_third_party: "In progress",
  resolved: "Resolved",
  closed: "Closed",
  cancelled: "Closed",
  duplicate: "Closed",
};

export const communicationCategories = pgTable(
  "communication_categories",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    key: varchar("key", { length: 64 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    defaultPriority: varchar("default_priority", { length: 16 }).notNull().default("medium"),
    defaultTeamId: varchar("default_team_id"),
    approvalPolicy: varchar("approval_policy", { length: 32 }).notNull().default("none"),
    firstResponseHours: integer("first_response_hours").notNull().default(4),
    resolutionHours: integer("resolution_hours").notNull().default(48),
    notifyOnAssign: boolean("notify_on_assign").notNull().default(true),
    escalateOverdue: boolean("escalate_overdue").notNull().default(true),
    slaJson: jsonb("sla_json").$type<Record<string, unknown>>(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("communication_categories_org_key_uidx").on(t.organizationId, t.key),
    index("communication_categories_org_idx").on(t.organizationId),
  ],
);

export const communicationCases = pgTable(
  "communication_cases",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    reference: varchar("reference", { length: 32 }).notNull(),
    subject: varchar("subject", { length: 300 }).notNull(),
    categoryId: varchar("category_id").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("new"),
    priority: varchar("priority", { length: 16 }).notNull().default("medium"),
    source: varchar("source", { length: 32 }).notNull().default("tenant_portal"),
    tenantId: varchar("tenant_id"),
    tenancyId: varchar("tenancy_id"),
    propertyId: varchar("property_id"),
    blockId: varchar("block_id"),
    unitLabel: varchar("unit_label", { length: 120 }),
    ownerUserId: varchar("owner_user_id"),
    ownerTeamId: varchar("owner_team_id"),
    summary: text("summary"),
    nextActionAt: timestamp("next_action_at"),
    firstResponseDueAt: timestamp("first_response_due_at"),
    resolutionDueAt: timestamp("resolution_due_at"),
    firstResponseAt: timestamp("first_response_at"),
    resolvedAt: timestamp("resolved_at"),
    closedAt: timestamp("closed_at"),
    resolutionSummary: text("resolution_summary"),
    reopenReason: text("reopen_reason"),
    policySnapshotJson: jsonb("policy_snapshot_json").$type<Record<string, unknown>>(),
    aiSuggestionJson: jsonb("ai_suggestion_json").$type<Record<string, unknown>>(),
    unreadForStaff: boolean("unread_for_staff").notNull().default(true),
    unreadForTenant: boolean("unread_for_tenant").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdByUserId: varchar("created_by_user_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("communication_cases_org_reference_uidx").on(t.organizationId, t.reference),
    index("communication_cases_org_status_idx").on(t.organizationId, t.status),
    index("communication_cases_org_owner_idx").on(t.organizationId, t.ownerUserId),
    index("communication_cases_org_team_idx").on(t.organizationId, t.ownerTeamId),
    index("communication_cases_org_property_idx").on(t.organizationId, t.propertyId),
    index("communication_cases_org_tenant_idx").on(t.organizationId, t.tenantId),
    index("communication_cases_org_updated_idx").on(t.organizationId, t.updatedAt),
    index("communication_cases_org_priority_idx").on(t.organizationId, t.priority),
  ],
);

export const communicationMessages = pgTable(
  "communication_messages",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    caseId: varchar("case_id").notNull(),
    direction: varchar("direction", { length: 16 }).notNull().default("inbound"),
    visibility: varchar("visibility", { length: 16 }).notNull().default("tenant"),
    channel: varchar("channel", { length: 32 }).notNull().default("tenant_portal"),
    body: text("body").notNull(),
    authorUserId: varchar("author_user_id"),
    authorNameSnapshot: text("author_name_snapshot"),
    deliveryStatus: varchar("delivery_status", { length: 32 })
      .notNull()
      .default("not_applicable"),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    providerThreadId: varchar("provider_thread_id", { length: 255 }),
    attachmentsJson: jsonb("attachments_json").$type<Array<Record<string, unknown>>>(),
    receivedAt: timestamp("received_at"),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("communication_messages_case_idx").on(t.caseId, t.createdAt),
    index("communication_messages_org_idx").on(t.organizationId),
  ],
);

export const communicationActions = pgTable(
  "communication_actions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    caseId: varchar("case_id").notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    assigneeId: varchar("assignee_id"),
    dueAt: timestamp("due_at"),
    status: varchar("status", { length: 32 }).notNull().default("open"),
    required: boolean("required").notNull().default(false),
    completedBy: varchar("completed_by"),
    completedAt: timestamp("completed_at"),
    evidenceRef: text("evidence_ref"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("communication_actions_case_idx").on(t.caseId),
    index("communication_actions_org_idx").on(t.organizationId),
  ],
);

export const communicationApprovals = pgTable(
  "communication_approvals",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    caseId: varchar("case_id").notNull(),
    type: varchar("type", { length: 64 }).notNull().default("manager_decision"),
    requestedBy: varchar("requested_by").notNull(),
    eligibleTeamId: varchar("eligible_team_id"),
    eligibleUserId: varchar("eligible_user_id"),
    decision: varchar("decision", { length: 32 }),
    reason: text("reason"),
    termsJson: jsonb("terms_json").$type<Record<string, unknown>>(),
    decidedBy: varchar("decided_by"),
    decidedAt: timestamp("decided_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("communication_approvals_case_idx").on(t.caseId),
    index("communication_approvals_org_idx").on(t.organizationId),
  ],
);

export const communicationCaseLinks = pgTable(
  "communication_case_links",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    caseId: varchar("case_id").notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: varchar("entity_id").notNull(),
    relationship: varchar("relationship", { length: 64 }).notNull().default("related"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("communication_case_links_uidx").on(
      t.caseId,
      t.entityType,
      t.entityId,
      t.relationship,
    ),
    index("communication_case_links_entity_idx").on(t.entityType, t.entityId),
    index("communication_case_links_org_idx").on(t.organizationId),
  ],
);

export const communicationAuditEvents = pgTable(
  "communication_audit_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    caseId: varchar("case_id").notNull(),
    actorType: varchar("actor_type", { length: 32 }).notNull().default("user"),
    actorId: varchar("actor_id"),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    beforeJson: jsonb("before_json").$type<Record<string, unknown>>(),
    afterJson: jsonb("after_json").$type<Record<string, unknown>>(),
    reason: text("reason"),
    correlationId: varchar("correlation_id", { length: 64 }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("communication_audit_case_idx").on(t.caseId, t.createdAt),
    index("communication_audit_org_idx").on(t.organizationId),
  ],
);

export const communicationSlaEvents = pgTable(
  "communication_sla_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    caseId: varchar("case_id").notNull(),
    timerType: varchar("timer_type", { length: 32 }).notNull(),
    deadline: timestamp("deadline").notNull(),
    pausedAt: timestamp("paused_at"),
    resumedAt: timestamp("resumed_at"),
    pauseReason: text("pause_reason"),
    escalationLevel: integer("escalation_level").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("communication_sla_case_idx").on(t.caseId),
    index("communication_sla_org_idx").on(t.organizationId),
  ],
);

export const communicationChannelEvents = pgTable(
  "communication_channel_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id"),
    provider: varchar("provider", { length: 64 }).notNull(),
    externalEventId: varchar("external_event_id", { length: 255 }).notNull(),
    processingStatus: varchar("processing_status", { length: 32 })
      .notNull()
      .default("pending"),
    retryCount: integer("retry_count").notNull().default(0),
    correlationId: varchar("correlation_id", { length: 64 }),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("communication_channel_events_uidx").on(t.provider, t.externalEventId),
    index("communication_channel_events_status_idx").on(t.processingStatus),
  ],
);

export const communicationDocumentSequences = pgTable(
  "communication_document_sequences",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    year: integer("year").notNull(),
    nextValue: integer("next_value").notNull().default(1),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("communication_document_sequences_uidx").on(t.organizationId, t.year),
  ],
);

export const insertCommunicationCaseSchema = createInsertSchema(communicationCases).omit({
  id: true,
  reference: true,
  createdAt: true,
  updatedAt: true,
  version: true,
});

export type CommunicationCategory = typeof communicationCategories.$inferSelect;
export type CommunicationCase = typeof communicationCases.$inferSelect;
export type CommunicationMessage = typeof communicationMessages.$inferSelect;
export type CommunicationAction = typeof communicationActions.$inferSelect;
export type CommunicationApproval = typeof communicationApprovals.$inferSelect;
export type CommunicationCaseLink = typeof communicationCaseLinks.$inferSelect;
export type CommunicationAuditEvent = typeof communicationAuditEvents.$inferSelect;
export type InsertCommunicationCase = z.infer<typeof insertCommunicationCaseSchema>;
