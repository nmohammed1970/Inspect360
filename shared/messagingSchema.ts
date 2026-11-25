import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const MESSAGING_CONVERSATION_TYPES = ["direct", "group", "maintenance"] as const;
export type MessagingConversationType = (typeof MESSAGING_CONVERSATION_TYPES)[number];

export const messagingConversations = pgTable(
  "messaging_conversations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    type: varchar("type").notNull().default("direct"),
    title: varchar("title"),
    /** Sorted participant ids joined by ':' for unique 1:1 per org */
    directKey: varchar("direct_key"),
    /** Set for type=maintenance — one conversation per MR */
    maintenanceRequestId: varchar("maintenance_request_id"),
    createdById: varchar("created_by_id").notNull(),
    lastMessageAt: timestamp("last_message_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("messaging_conversations_org_last_idx").on(
      table.organizationId,
      table.lastMessageAt,
    ),
    uniqueIndex("messaging_conversations_direct_key_uidx").on(
      table.organizationId,
      table.directKey,
    ),
    uniqueIndex("messaging_conversations_mr_uidx").on(table.maintenanceRequestId),
    index("messaging_conversations_org_type_last_idx").on(
      table.organizationId,
      table.type,
      table.lastMessageAt,
    ),
  ],
);

export const messagingParticipants = pgTable(
  "messaging_participants",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    conversationId: varchar("conversation_id").notNull(),
    userId: varchar("user_id").notNull(),
    joinedAt: timestamp("joined_at").defaultNow(),
    lastReadAt: timestamp("last_read_at"),
    mutedUntil: timestamp("muted_until"),
  },
  (table) => [
    uniqueIndex("messaging_participants_conv_user_uidx").on(
      table.conversationId,
      table.userId,
    ),
    index("messaging_participants_user_idx").on(table.userId),
  ],
);

export const messagingMessages = pgTable(
  "messaging_messages",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    conversationId: varchar("conversation_id").notNull(),
    organizationId: varchar("organization_id").notNull(),
    senderId: varchar("sender_id").notNull(),
    body: text("body"),
    clientMessageId: varchar("client_message_id"),
    replyToMessageId: varchar("reply_to_message_id"),
    editedAt: timestamp("edited_at"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("messaging_messages_conv_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    index("messaging_messages_org_idx").on(table.organizationId),
    uniqueIndex("messaging_messages_client_id_uidx").on(
      table.senderId,
      table.clientMessageId,
    ),
  ],
);

export const messagingAttachments = pgTable(
  "messaging_attachments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    messageId: varchar("message_id").notNull(),
    objectPath: varchar("object_path").notNull(),
    fileName: varchar("file_name").notNull(),
    mimeType: varchar("mime_type").notNull(),
    byteSize: integer("byte_size").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("messaging_attachments_message_idx").on(table.messageId)],
);

export const messagingReactions = pgTable(
  "messaging_reactions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    messageId: varchar("message_id").notNull(),
    userId: varchar("user_id").notNull(),
    emoji: varchar("emoji").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("messaging_reactions_uidx").on(
      table.messageId,
      table.userId,
      table.emoji,
    ),
    index("messaging_reactions_message_idx").on(table.messageId),
  ],
);

export const messagingReceipts = pgTable(
  "messaging_receipts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    messageId: varchar("message_id").notNull(),
    userId: varchar("user_id").notNull(),
    deliveredAt: timestamp("delivered_at"),
    readAt: timestamp("read_at"),
  },
  (table) => [
    uniqueIndex("messaging_receipts_uidx").on(table.messageId, table.userId),
    index("messaging_receipts_user_idx").on(table.userId),
  ],
);

export const insertMessagingConversationSchema = createInsertSchema(
  messagingConversations,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessagingMessageSchema = createInsertSchema(messagingMessages).omit({
  id: true,
  createdAt: true,
});

export type MessagingConversation = typeof messagingConversations.$inferSelect;
export type MessagingParticipant = typeof messagingParticipants.$inferSelect;
export type MessagingMessage = typeof messagingMessages.$inferSelect;
export type MessagingAttachment = typeof messagingAttachments.$inferSelect;
export type MessagingReaction = typeof messagingReactions.$inferSelect;
export type MessagingReceipt = typeof messagingReceipts.$inferSelect;

export const createConversationBodySchema = z.object({
  participantIds: z.array(z.string().min(1)).min(1).max(50),
  title: z.string().trim().min(1).max(120).optional(),
});

export const ensureMaintenanceDiscussionBodySchema = z.object({
  maintenanceRequestId: z.string().min(1),
});

export const sendMessageBodySchema = z.object({
  body: z.string().trim().max(8000).optional().nullable(),
  clientMessageId: z.string().trim().min(1).max(128).optional(),
  replyToMessageId: z.string().min(1).optional().nullable(),
  attachments: z
    .array(
      z.object({
        objectPath: z.string().min(1),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(120),
        byteSize: z.number().int().nonnegative().max(25 * 1024 * 1024),
      }),
    )
    .max(5)
    .optional(),
});

export const editMessageBodySchema = z.object({
  body: z.string().trim().min(1).max(8000),
});

export const reactionBodySchema = z.object({
  emoji: z.string().trim().min(1).max(32),
});

export const forwardMessageBodySchema = z.object({
  targetConversationId: z.string().min(1),
  clientMessageId: z.string().trim().min(1).max(128).optional(),
});

export const MESSAGING_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const MESSAGING_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const MESSAGING_MAX_ATTACHMENTS = 5;

export const MESSAGING_ALLOWED_MIME_PREFIXES = ["image/"] as const;
export const MESSAGING_ALLOWED_MIMES = new Set([
  "video/mp4",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

export function isMessagingMimeAllowed(mime: string): boolean {
  if (!mime) return false;
  if (mime.startsWith("image/")) return true;
  return MESSAGING_ALLOWED_MIMES.has(mime);
}

export function messagingMaxBytesForMime(mime: string): number {
  return mime.startsWith("image/") ? MESSAGING_IMAGE_MAX_BYTES : MESSAGING_FILE_MAX_BYTES;
}
