import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/** Feedback & Feature Requests (MVP ticketing-lite). */

export const FEEDBACK_TYPES = ["issue", "feature_request", "question"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_STATUSES = [
  "new",
  "in_review",
  "waiting_on_user",
  "planned",
  "resolved",
  "closed",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_MESSAGE_VISIBILITIES = ["public", "internal"] as const;
export type FeedbackMessageVisibility = (typeof FEEDBACK_MESSAGE_VISIBILITIES)[number];

export const FEEDBACK_OPEN_STATUSES: FeedbackStatus[] = [
  "new",
  "in_review",
  "waiting_on_user",
  "planned",
];

export const feedbackRequests = pgTable(
  "feedback_requests",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    reference: varchar("reference", { length: 32 }).notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    subject: varchar("subject", { length: 150 }).notNull(),
    description: text("description").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("new"),
    reporterUserId: varchar("reporter_user_id").notNull(),
    reporterNameSnapshot: text("reporter_name_snapshot"),
    reporterEmailSnapshot: varchar("reporter_email_snapshot", { length: 320 }),
    organizationId: varchar("organization_id"),
    organizationNameSnapshot: text("organization_name_snapshot"),
    sourcePage: text("source_page"),
    clientContext: jsonb("client_context").$type<Record<string, unknown>>(),
    assignedToUserId: varchar("assigned_to_user_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    resolvedAt: timestamp("resolved_at"),
    closedAt: timestamp("closed_at"),
  },
  (t) => [
    uniqueIndex("feedback_requests_reference_uidx").on(t.reference),
    index("feedback_requests_reporter_idx").on(t.reporterUserId),
    index("feedback_requests_org_idx").on(t.organizationId),
    index("feedback_requests_status_idx").on(t.status),
    index("feedback_requests_type_idx").on(t.type),
    index("feedback_requests_created_idx").on(t.createdAt),
    index("feedback_requests_assigned_idx").on(t.assignedToUserId),
  ],
);

export const feedbackMessages = pgTable(
  "feedback_messages",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    feedbackRequestId: varchar("feedback_request_id").notNull(),
    authorUserId: varchar("author_user_id").notNull(),
    authorNameSnapshot: text("author_name_snapshot"),
    body: text("body").notNull(),
    visibility: varchar("visibility", { length: 16 }).notNull().default("public"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("feedback_messages_request_idx").on(t.feedbackRequestId),
    index("feedback_messages_created_idx").on(t.createdAt),
  ],
);

export const feedbackAttachments = pgTable(
  "feedback_attachments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    feedbackRequestId: varchar("feedback_request_id").notNull(),
    messageId: varchar("message_id"),
    uploadedByUserId: varchar("uploaded_by_user_id").notNull(),
    originalFilename: varchar("original_filename", { length: 512 }),
    mimeType: varchar("mime_type", { length: 128 }).notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("feedback_attachments_request_idx").on(t.feedbackRequestId),
    index("feedback_attachments_message_idx").on(t.messageId),
  ],
);

export const feedbackAuditEvents = pgTable(
  "feedback_audit_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    feedbackRequestId: varchar("feedback_request_id").notNull(),
    actorUserId: varchar("actor_user_id"),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    beforeValue: text("before_value"),
    afterValue: text("after_value"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("feedback_audit_request_idx").on(t.feedbackRequestId),
    index("feedback_audit_created_idx").on(t.createdAt),
  ],
);

export const featureAdminMembers = pgTable(
  "feature_admin_members",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id"),
    email: varchar("email", { length: 320 }).notNull(),
    membershipStatus: varchar("membership_status", { length: 32 }).notNull().default("pending"),
    canManageTeam: boolean("can_manage_team").notNull().default(false),
    invitedByUserId: varchar("invited_by_user_id"),
    createdAt: timestamp("created_at").defaultNow(),
    activatedAt: timestamp("activated_at"),
    removedAt: timestamp("removed_at"),
  },
  (t) => [
    uniqueIndex("feature_admin_members_email_uidx").on(t.email),
    index("feature_admin_members_user_idx").on(t.userId),
    index("feature_admin_members_status_idx").on(t.membershipStatus),
  ],
);

export const feedbackReferenceCounter = pgTable("feedback_reference_counter", {
  id: integer("id").primaryKey().default(1),
  nextValue: bigint("next_value", { mode: "number" }).notNull().default(1),
});

export const insertFeedbackRequestSchema = createInsertSchema(feedbackRequests).omit({
  id: true,
  reference: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  closedAt: true,
});

export type FeedbackRequest = typeof feedbackRequests.$inferSelect;
export type InsertFeedbackRequest = z.infer<typeof insertFeedbackRequestSchema>;
export type FeedbackMessage = typeof feedbackMessages.$inferSelect;
export type FeedbackAttachment = typeof feedbackAttachments.$inferSelect;
export type FeedbackAuditEvent = typeof feedbackAuditEvents.$inferSelect;
export type FeatureAdminMember = typeof featureAdminMembers.$inferSelect;
