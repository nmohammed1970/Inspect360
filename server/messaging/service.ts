import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  messagingAttachments,
  messagingConversations,
  messagingMessages,
  messagingParticipants,
  messagingReactions,
  messagingReceipts,
  users,
  type MessagingAttachment,
  type MessagingMessage,
} from "@shared/schema";
import { listParticipantUserIds, requireParticipant } from "./access";
import { buildDirectKey, httpError } from "./errors";
import {
  fanoutMessagingMessage,
  fanoutMessagingPresence,
  fanoutMessagingReceipt,
  fanoutMessagingTyping,
  fanoutMessagingUnread,
  isUserConnected,
} from "./wsFanout";

function displayName(u: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || "User";
}

function publicUser(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    role: u.role,
    profileImageUrl: u.profileImageUrl,
    lastSeenAt: u.lastSeenAt,
    online: isUserConnected(u.id),
  };
}

async function hydrateMessage(message: MessagingMessage) {
  const [attachments, reactions, receipts, sender] = await Promise.all([
    db
      .select()
      .from(messagingAttachments)
      .where(eq(messagingAttachments.messageId, message.id))
      .orderBy(asc(messagingAttachments.sortOrder)),
    db
      .select()
      .from(messagingReactions)
      .where(eq(messagingReactions.messageId, message.id)),
    db
      .select()
      .from(messagingReceipts)
      .where(eq(messagingReceipts.messageId, message.id)),
    storage.getUser(message.senderId),
  ]);

  let replyTo: {
    id: string;
    body: string | null;
    senderId: string;
    deletedAt: Date | null;
  } | null = null;
  if (message.replyToMessageId) {
    const [parent] = await db
      .select({
        id: messagingMessages.id,
        body: messagingMessages.body,
        senderId: messagingMessages.senderId,
        deletedAt: messagingMessages.deletedAt,
      })
      .from(messagingMessages)
      .where(eq(messagingMessages.id, message.replyToMessageId))
      .limit(1);
    if (parent) {
      replyTo = {
        ...parent,
        body: parent.deletedAt ? null : parent.body,
      };
    }
  }

  return {
    id: message.id,
    conversationId: message.conversationId,
    organizationId: message.organizationId,
    senderId: message.senderId,
    body: message.deletedAt ? null : message.body,
    clientMessageId: message.clientMessageId,
    replyToMessageId: message.replyToMessageId,
    replyTo,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    createdAt: message.createdAt,
    sender: sender
      ? {
          id: sender.id,
          firstName: sender.firstName,
          lastName: sender.lastName,
          profileImageUrl: sender.profileImageUrl,
          role: sender.role,
        }
      : null,
    attachments,
    reactions,
    receipts,
  };
}

const LAST_SEEN_THROTTLE_MS = 60_000;
const lastSeenWrittenAt = new Map<string, number>();

/** Persist lastSeenAt at most once per minute per user (WS heartbeat stays light). */
export async function touchLastSeen(userId: string, force = false) {
  const nowMs = Date.now();
  const prev = lastSeenWrittenAt.get(userId) ?? 0;
  if (!force && nowMs - prev < LAST_SEEN_THROTTLE_MS) return;
  lastSeenWrittenAt.set(userId, nowMs);
  const now = new Date(nowMs);
  await db.update(users).set({ lastSeenAt: now, updatedAt: now }).where(eq(users.id, userId));
}

export async function getDirectory(organizationId: string, selfId: string, q?: string) {
  const pattern = q?.trim() ? `%${q.trim()}%` : null;
  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.organizationId, organizationId),
        eq(users.isActive, true),
        ne(users.id, selfId),
        pattern
          ? or(
              ilike(users.firstName, pattern),
              ilike(users.lastName, pattern),
              ilike(users.email, pattern),
              ilike(users.username, pattern),
            )
          : undefined,
      ),
    )
    .orderBy(asc(users.firstName), asc(users.lastName))
    .limit(50);
  return rows.map(publicUser);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const parts = await db
    .select()
    .from(messagingParticipants)
    .where(eq(messagingParticipants.userId, userId));
  if (parts.length === 0) return 0;

  let total = 0;
  for (const p of parts) {
    const lastRead = p.lastReadAt ?? new Date(0);
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messagingMessages)
      .where(
        and(
          eq(messagingMessages.conversationId, p.conversationId),
          gt(messagingMessages.createdAt, lastRead),
          ne(messagingMessages.senderId, userId),
          isNull(messagingMessages.deletedAt),
        ),
      );
    total += row?.count ?? 0;
  }
  return total;
}

async function pushUnread(userId: string) {
  const count = await getUnreadCount(userId);
  fanoutMessagingUnread(userId, count);
  return count;
}

export async function listConversations(
  organizationId: string,
  userId: string,
  q?: string,
  category: "all" | "direct" | "maintenance" = "all",
) {
  const myParts = await db
    .select()
    .from(messagingParticipants)
    .where(eq(messagingParticipants.userId, userId));
  if (myParts.length === 0) return [];

  const convIds = myParts.map((p) => p.conversationId);
  const conversations = await db
    .select()
    .from(messagingConversations)
    .where(
      and(
        eq(messagingConversations.organizationId, organizationId),
        inArray(messagingConversations.id, convIds),
      ),
    )
    .orderBy(desc(messagingConversations.lastMessageAt), desc(messagingConversations.createdAt));

  const { loadMaintenanceMeta } = await import("./maintenanceThreads");

  const results = [];
  for (const conv of conversations) {
    if (category === "maintenance" && conv.type !== "maintenance") continue;
    if (
      category === "direct" &&
      conv.type !== "direct" &&
      conv.type !== "group"
    ) {
      continue;
    }
    const participantRows = await db
      .select({
        userId: messagingParticipants.userId,
        lastReadAt: messagingParticipants.lastReadAt,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        profileImageUrl: users.profileImageUrl,
        lastSeenAt: users.lastSeenAt,
      })
      .from(messagingParticipants)
      .innerJoin(users, eq(users.id, messagingParticipants.userId))
      .where(eq(messagingParticipants.conversationId, conv.id));

    const peers = participantRows
      .filter((p) => p.userId !== userId)
      .map((p) => ({
        id: p.userId,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        role: p.role,
        profileImageUrl: p.profileImageUrl,
        lastSeenAt: p.lastSeenAt,
        online: isUserConnected(p.userId),
      }));

    const maintenanceRequest =
      conv.type === "maintenance" && conv.maintenanceRequestId
        ? await loadMaintenanceMeta(conv.maintenanceRequestId, organizationId)
        : null;

    const title =
      conv.type === "maintenance"
        ? conv.title || maintenanceRequest?.title || "Maintenance discussion"
        : conv.type === "group"
          ? conv.title || "Group chat"
          : peers.map((p) => displayName(p)).join(", ") || "Conversation";

    if (q?.trim()) {
      const needle = q.trim().toLowerCase();
      const hay =
        `${title} ${peers.map((p) => displayName(p)).join(" ")} ${maintenanceRequest?.propertyLabel || ""} ${maintenanceRequest?.reference || ""}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }

    const myPart = myParts.find((p) => p.conversationId === conv.id)!;
    const lastRead = myPart.lastReadAt ?? new Date(0);
    const [unreadRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messagingMessages)
      .where(
        and(
          eq(messagingMessages.conversationId, conv.id),
          gt(messagingMessages.createdAt, lastRead),
          ne(messagingMessages.senderId, userId),
          isNull(messagingMessages.deletedAt),
        ),
      );

    const [lastMsg] = await db
      .select()
      .from(messagingMessages)
      .where(eq(messagingMessages.conversationId, conv.id))
      .orderBy(desc(messagingMessages.createdAt))
      .limit(1);

    results.push({
      id: conv.id,
      type: conv.type,
      title,
      organizationId: conv.organizationId,
      maintenanceRequestId: conv.maintenanceRequestId ?? null,
      maintenanceRequest,
      lastMessageAt: conv.lastMessageAt,
      createdAt: conv.createdAt,
      participants: participantRows.map((p) => ({
        id: p.userId,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        role: p.role,
        profileImageUrl: p.profileImageUrl,
        lastSeenAt: p.lastSeenAt,
        online: isUserConnected(p.userId),
        lastReadAt: p.lastReadAt,
      })),
      unreadCount: unreadRow?.count ?? 0,
      lastMessage: lastMsg
        ? {
            id: lastMsg.id,
            body: lastMsg.deletedAt ? null : lastMsg.body,
            senderId: lastMsg.senderId,
            createdAt: lastMsg.createdAt,
            deletedAt: lastMsg.deletedAt,
            hasAttachments: false,
          }
        : null,
    });
  }

  return results;
}

export async function ensureMaintenanceDiscussion(input: {
  organizationId: string;
  maintenanceRequestId: string;
  createdById: string;
  actorRole: string;
}) {
  const {
    assertCanAccessMaintenanceRequestForDiscussion,
    findConversationByMaintenanceRequestId,
    ensureActorIsParticipant,
    resolveMaintenanceDiscussionParticipantIds,
    createMaintenanceConversationRow,
  } = await import("./maintenanceThreads");

  const request = await assertCanAccessMaintenanceRequestForDiscussion({
    userId: input.createdById,
    userRole: input.actorRole,
    organizationId: input.organizationId,
    maintenanceRequestId: input.maintenanceRequestId,
  });

  const existing = await findConversationByMaintenanceRequestId(
    input.organizationId,
    input.maintenanceRequestId,
  );
  if (existing) {
    await ensureActorIsParticipant({
      conversationId: existing.id,
      userId: input.createdById,
      actorRole: input.actorRole,
    });
    return getConversationDetail(
      input.organizationId,
      input.createdById,
      existing.id,
    );
  }

  const participantIds = await resolveMaintenanceDiscussionParticipantIds(
    input.organizationId,
    request.reportedBy,
  );
  if (!participantIds.includes(input.createdById)) {
    participantIds.push(input.createdById);
  }

  const created = await createMaintenanceConversationRow({
    organizationId: input.organizationId,
    maintenanceRequestId: request.id,
    createdById: input.createdById,
    title: request.title || "Maintenance request",
    participantIds,
  });

  return getConversationDetail(
    input.organizationId,
    input.createdById,
    created.id,
  );
}

/** Fire-and-forget after MR create — never fails the MR. */
export function scheduleEnsureMaintenanceDiscussion(input: {
  organizationId: string;
  maintenanceRequestId: string;
  createdById: string;
  actorRole: string;
}) {
  setImmediate(() => {
    void ensureMaintenanceDiscussion(input).catch((err) => {
      console.error(
        `[messaging] ensureMaintenanceDiscussion failed for MR ${input.maintenanceRequestId}:`,
        err,
      );
    });
  });
}

export async function getConversationDetail(
  organizationId: string,
  userId: string,
  conversationId: string,
) {
  await requireParticipant(conversationId, userId, organizationId);
  const list = await listConversations(organizationId, userId);
  const found = list.find((c) => c.id === conversationId);
  if (!found) throw httpError("Conversation not found", 404);
  return found;
}

export async function createOrGetConversation(input: {
  organizationId: string;
  createdById: string;
  participantIds: string[];
  title?: string;
}) {
  const uniqueOthers = [...new Set(input.participantIds)].filter(
    (id) => id !== input.createdById,
  );
  if (uniqueOthers.length === 0) {
    throw httpError("Select at least one other participant", 400);
  }

  const orgUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.organizationId, input.organizationId),
        eq(users.isActive, true),
        inArray(users.id, uniqueOthers),
      ),
    );
  if (orgUsers.length !== uniqueOthers.length) {
    throw httpError("One or more participants are invalid", 400);
  }

  const allIds = [input.createdById, ...uniqueOthers];
  const isDirect = allIds.length === 2;
  const directKey = isDirect ? buildDirectKey(allIds) : null;

  if (isDirect && directKey) {
    const [existing] = await db
      .select()
      .from(messagingConversations)
      .where(
        and(
          eq(messagingConversations.organizationId, input.organizationId),
          eq(messagingConversations.directKey, directKey),
        ),
      )
      .limit(1);
    if (existing) {
      return getConversationDetail(input.organizationId, input.createdById, existing.id);
    }
  }

  if (!isDirect && !input.title?.trim()) {
    throw httpError("Group conversations require a title", 400);
  }

  const [created] = await db
    .insert(messagingConversations)
    .values({
      organizationId: input.organizationId,
      type: isDirect ? "direct" : "group",
      title: isDirect ? null : input.title!.trim(),
      directKey,
      createdById: input.createdById,
    })
    .returning();

  await db.insert(messagingParticipants).values(
    allIds.map((userId) => ({
      conversationId: created.id,
      userId,
      lastReadAt: new Date(),
    })),
  );

  return getConversationDetail(input.organizationId, input.createdById, created.id);
}

export async function listMessages(input: {
  organizationId: string;
  userId: string;
  conversationId: string;
  cursor?: string;
  limit?: number;
}) {
  await requireParticipant(input.conversationId, input.userId, input.organizationId);
  const limit = Math.min(Math.max(input.limit ?? 40, 1), 100);

  let cursorCreatedAt: Date | null = null;
  if (input.cursor) {
    const [cursorMsg] = await db
      .select()
      .from(messagingMessages)
      .where(
        and(
          eq(messagingMessages.id, input.cursor),
          eq(messagingMessages.conversationId, input.conversationId),
        ),
      )
      .limit(1);
    if (cursorMsg?.createdAt) cursorCreatedAt = cursorMsg.createdAt;
  }

  const rows = await db
    .select()
    .from(messagingMessages)
    .where(
      and(
        eq(messagingMessages.conversationId, input.conversationId),
        cursorCreatedAt ? lt(messagingMessages.createdAt, cursorCreatedAt) : undefined,
      ),
    )
    .orderBy(desc(messagingMessages.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const hydrated = await Promise.all(page.map((m) => hydrateMessage(m)));
  // Return chronological ascending for UI
  hydrated.reverse();

  return {
    messages: hydrated,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

/** Live delivery only — keeps send API fast. */
function fanoutNewMessageSync(input: {
  participantIds: string[];
  message: Awaited<ReturnType<typeof hydrateMessage>>;
}) {
  fanoutMessagingMessage(input.participantIds, input.message, "created");
}

/** Receipts + in-app notifications — must not block HTTP send. */
function scheduleNewMessageSideEffects(input: {
  organizationId: string;
  conversationId: string;
  message: Awaited<ReturnType<typeof hydrateMessage>>;
  participantIds: string[];
  senderId: string;
}) {
  setImmediate(() => {
    void (async () => {
      try {
        for (const uid of input.participantIds) {
          if (uid === input.senderId) continue;
          try {
            await pushUnread(uid);

            if (isUserConnected(uid)) {
              const receipt = await upsertReceipt({
                messageId: input.message.id,
                userId: uid,
                deliveredAt: new Date(),
              });
              fanoutMessagingReceipt(input.participantIds, receipt);
            }

            // Messaging UX uses messaging_* WS events + dock/unread badge — no bell rows.
          } catch (err) {
            console.error(`[messaging] side effect failed for ${uid}:`, err);
          }
        }
        try {
          await pushUnread(input.senderId);
        } catch (err) {
          console.error("[messaging] sender unread push failed:", err);
        }
      } catch (err) {
        console.error("[messaging] scheduleNewMessageSideEffects failed:", err);
      }
    })();
  });
}

async function upsertReceipt(input: {
  messageId: string;
  userId: string;
  deliveredAt?: Date | null;
  readAt?: Date | null;
}) {
  const [existing] = await db
    .select()
    .from(messagingReceipts)
    .where(
      and(
        eq(messagingReceipts.messageId, input.messageId),
        eq(messagingReceipts.userId, input.userId),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(messagingReceipts)
      .set({
        deliveredAt: input.deliveredAt ?? existing.deliveredAt,
        readAt: input.readAt ?? existing.readAt,
      })
      .where(eq(messagingReceipts.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(messagingReceipts)
    .values({
      messageId: input.messageId,
      userId: input.userId,
      deliveredAt: input.deliveredAt ?? null,
      readAt: input.readAt ?? null,
    })
    .returning();
  return created;
}

export async function sendMessage(input: {
  organizationId: string;
  userId: string;
  conversationId: string;
  body?: string | null;
  clientMessageId?: string;
  replyToMessageId?: string | null;
  attachments?: Array<{
    objectPath: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
  }>;
}) {
  await requireParticipant(input.conversationId, input.userId, input.organizationId);

  const body = input.body?.trim() || null;
  const attachments = input.attachments ?? [];
  if (!body && attachments.length === 0) {
    throw httpError("Message body or attachments required", 400);
  }

  if (input.clientMessageId) {
    const [dup] = await db
      .select()
      .from(messagingMessages)
      .where(
        and(
          eq(messagingMessages.senderId, input.userId),
          eq(messagingMessages.clientMessageId, input.clientMessageId),
        ),
      )
      .limit(1);
    if (dup) {
      return hydrateMessage(dup);
    }
  }

  if (input.replyToMessageId) {
    const [parent] = await db
      .select()
      .from(messagingMessages)
      .where(
        and(
          eq(messagingMessages.id, input.replyToMessageId),
          eq(messagingMessages.conversationId, input.conversationId),
        ),
      )
      .limit(1);
    if (!parent) throw httpError("Reply target not found", 400);
  }

  const [created] = await db
    .insert(messagingMessages)
    .values({
      conversationId: input.conversationId,
      organizationId: input.organizationId,
      senderId: input.userId,
      body,
      clientMessageId: input.clientMessageId || null,
      replyToMessageId: input.replyToMessageId || null,
    })
    .returning();

  if (attachments.length) {
    await db.insert(messagingAttachments).values(
      attachments.map((a, i) => ({
        messageId: created.id,
        objectPath: a.objectPath,
        fileName: a.fileName,
        mimeType: a.mimeType,
        byteSize: a.byteSize,
        sortOrder: i,
      })),
    );
  }

  const now = new Date();
  await db
    .update(messagingConversations)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(messagingConversations.id, input.conversationId));

  await db
    .update(messagingParticipants)
    .set({ lastReadAt: now })
    .where(
      and(
        eq(messagingParticipants.conversationId, input.conversationId),
        eq(messagingParticipants.userId, input.userId),
      ),
    );

  const hydrated = await hydrateMessage(created);
  const participantIds = await listParticipantUserIds(input.conversationId);
  fanoutNewMessageSync({ participantIds, message: hydrated });
  scheduleNewMessageSideEffects({
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    message: hydrated,
    participantIds,
    senderId: input.userId,
  });

  return hydrated;
}

export async function markConversationRead(input: {
  organizationId: string;
  userId: string;
  conversationId: string;
}) {
  await requireParticipant(input.conversationId, input.userId, input.organizationId);
  const now = new Date();
  await db
    .update(messagingParticipants)
    .set({ lastReadAt: now })
    .where(
      and(
        eq(messagingParticipants.conversationId, input.conversationId),
        eq(messagingParticipants.userId, input.userId),
      ),
    );

  const recent = await db
    .select()
    .from(messagingMessages)
    .where(
      and(
        eq(messagingMessages.conversationId, input.conversationId),
        ne(messagingMessages.senderId, input.userId),
      ),
    )
    .orderBy(desc(messagingMessages.createdAt))
    .limit(50);

  const participantIds = await listParticipantUserIds(input.conversationId);
  for (const msg of recent) {
    const receipt = await upsertReceipt({
      messageId: msg.id,
      userId: input.userId,
      deliveredAt: now,
      readAt: now,
    });
    fanoutMessagingReceipt(participantIds, receipt);
  }

  const count = await pushUnread(input.userId);
  return { ok: true, unreadCount: count };
}

export async function editMessage(input: {
  organizationId: string;
  userId: string;
  messageId: string;
  body: string;
}) {
  const [message] = await db
    .select()
    .from(messagingMessages)
    .where(eq(messagingMessages.id, input.messageId))
    .limit(1);
  if (!message || message.organizationId !== input.organizationId) {
    throw httpError("Message not found", 404);
  }
  await requireParticipant(message.conversationId, input.userId, input.organizationId);
  if (message.senderId !== input.userId) {
    throw httpError("Only the sender can edit this message", 403);
  }
  if (message.deletedAt) throw httpError("Cannot edit a deleted message", 400);

  const [updated] = await db
    .update(messagingMessages)
    .set({ body: input.body.trim(), editedAt: new Date() })
    .where(eq(messagingMessages.id, message.id))
    .returning();

  const hydrated = await hydrateMessage(updated);
  const participantIds = await listParticipantUserIds(message.conversationId);
  fanoutMessagingMessage(participantIds, hydrated, "updated");
  return hydrated;
}

export async function deleteMessage(input: {
  organizationId: string;
  userId: string;
  messageId: string;
}) {
  const [message] = await db
    .select()
    .from(messagingMessages)
    .where(eq(messagingMessages.id, input.messageId))
    .limit(1);
  if (!message || message.organizationId !== input.organizationId) {
    throw httpError("Message not found", 404);
  }
  await requireParticipant(message.conversationId, input.userId, input.organizationId);
  if (message.senderId !== input.userId) {
    throw httpError("Only the sender can delete this message", 403);
  }

  const [updated] = await db
    .update(messagingMessages)
    .set({ deletedAt: new Date(), body: null })
    .where(eq(messagingMessages.id, message.id))
    .returning();

  const hydrated = await hydrateMessage(updated);
  const participantIds = await listParticipantUserIds(message.conversationId);
  fanoutMessagingMessage(participantIds, hydrated, "deleted");
  return hydrated;
}

export async function addReaction(input: {
  organizationId: string;
  userId: string;
  messageId: string;
  emoji: string;
}) {
  const [message] = await db
    .select()
    .from(messagingMessages)
    .where(eq(messagingMessages.id, input.messageId))
    .limit(1);
  if (!message || message.organizationId !== input.organizationId) {
    throw httpError("Message not found", 404);
  }
  await requireParticipant(message.conversationId, input.userId, input.organizationId);

  await db
    .insert(messagingReactions)
    .values({
      messageId: message.id,
      userId: input.userId,
      emoji: input.emoji,
    })
    .onConflictDoNothing();

  const hydrated = await hydrateMessage(message);
  const participantIds = await listParticipantUserIds(message.conversationId);
  fanoutMessagingMessage(participantIds, hydrated, "updated");
  return hydrated;
}

export async function removeReaction(input: {
  organizationId: string;
  userId: string;
  messageId: string;
  emoji: string;
}) {
  const [message] = await db
    .select()
    .from(messagingMessages)
    .where(eq(messagingMessages.id, input.messageId))
    .limit(1);
  if (!message || message.organizationId !== input.organizationId) {
    throw httpError("Message not found", 404);
  }
  await requireParticipant(message.conversationId, input.userId, input.organizationId);

  await db
    .delete(messagingReactions)
    .where(
      and(
        eq(messagingReactions.messageId, message.id),
        eq(messagingReactions.userId, input.userId),
        eq(messagingReactions.emoji, input.emoji),
      ),
    );

  const hydrated = await hydrateMessage(message);
  const participantIds = await listParticipantUserIds(message.conversationId);
  fanoutMessagingMessage(participantIds, hydrated, "updated");
  return hydrated;
}

export async function searchInConversation(input: {
  organizationId: string;
  userId: string;
  conversationId: string;
  q: string;
}) {
  await requireParticipant(input.conversationId, input.userId, input.organizationId);
  const needle = input.q.trim();
  if (!needle) return [];

  const rows = await db
    .select()
    .from(messagingMessages)
    .where(
      and(
        eq(messagingMessages.conversationId, input.conversationId),
        isNull(messagingMessages.deletedAt),
        ilike(messagingMessages.body, `%${needle}%`),
      ),
    )
    .orderBy(desc(messagingMessages.createdAt))
    .limit(40);

  return Promise.all(rows.map((m) => hydrateMessage(m)));
}

export async function forwardMessage(input: {
  organizationId: string;
  userId: string;
  messageId: string;
  targetConversationId: string;
  clientMessageId?: string;
}) {
  const [source] = await db
    .select()
    .from(messagingMessages)
    .where(eq(messagingMessages.id, input.messageId))
    .limit(1);
  if (!source || source.organizationId !== input.organizationId) {
    throw httpError("Message not found", 404);
  }
  await requireParticipant(source.conversationId, input.userId, input.organizationId);
  await requireParticipant(input.targetConversationId, input.userId, input.organizationId);

  const attachments = await db
    .select()
    .from(messagingAttachments)
    .where(eq(messagingAttachments.messageId, source.id));

  return sendMessage({
    organizationId: input.organizationId,
    userId: input.userId,
    conversationId: input.targetConversationId,
    body: source.deletedAt ? null : source.body,
    clientMessageId: input.clientMessageId,
    attachments: attachments.map((a: MessagingAttachment) => ({
      objectPath: a.objectPath,
      fileName: a.fileName,
      mimeType: a.mimeType,
      byteSize: a.byteSize,
    })),
  });
}

export async function handleTypingEvent(input: {
  userId: string;
  conversationId: string;
  isTyping: boolean;
}) {
  const user = await storage.getUser(input.userId);
  if (!user?.organizationId) return;
  try {
    await requireParticipant(input.conversationId, input.userId, user.organizationId);
  } catch {
    return;
  }
  const participantIds = await listParticipantUserIds(input.conversationId);
  fanoutMessagingTyping(participantIds, {
    conversationId: input.conversationId,
    userId: input.userId,
    isTyping: input.isTyping,
  });
}

export async function ackMessageDelivered(input: {
  userId: string;
  messageId: string;
}) {
  const [message] = await db
    .select()
    .from(messagingMessages)
    .where(eq(messagingMessages.id, input.messageId))
    .limit(1);
  if (!message || message.senderId === input.userId) return;

  const user = await storage.getUser(input.userId);
  if (!user?.organizationId || user.organizationId !== message.organizationId) return;
  try {
    await requireParticipant(message.conversationId, input.userId, user.organizationId);
  } catch {
    return;
  }

  const receipt = await upsertReceipt({
    messageId: message.id,
    userId: input.userId,
    deliveredAt: new Date(),
  });
  const participantIds = await listParticipantUserIds(message.conversationId);
  fanoutMessagingReceipt(participantIds, receipt);
}

export async function broadcastPresence(userId: string, online: boolean) {
  const user = await storage.getUser(userId);
  if (!user?.organizationId) return;
  if (online) await touchLastSeen(userId);
  // Limit: peers sharing any conversation
  const parts = await db
    .select({ conversationId: messagingParticipants.conversationId })
    .from(messagingParticipants)
    .where(eq(messagingParticipants.userId, userId));
  if (!parts.length) return;
  const peerRows = await db
    .select({ userId: messagingParticipants.userId })
    .from(messagingParticipants)
    .where(
      inArray(
        messagingParticipants.conversationId,
        parts.map((p) => p.conversationId),
      ),
    );
  const peers = [...new Set(peerRows.map((p) => p.userId))];
  fanoutMessagingPresence(peers, {
    userId,
    online,
    lastSeenAt: (user.lastSeenAt ?? new Date()).toISOString(),
  });
}

export async function getAttachmentForParticipant(input: {
  organizationId: string;
  userId: string;
  attachmentId: string;
}) {
  const [attachment] = await db
    .select()
    .from(messagingAttachments)
    .where(eq(messagingAttachments.id, input.attachmentId))
    .limit(1);
  if (!attachment) throw httpError("Attachment not found", 404);

  const [message] = await db
    .select()
    .from(messagingMessages)
    .where(eq(messagingMessages.id, attachment.messageId))
    .limit(1);
  if (!message || message.organizationId !== input.organizationId) {
    throw httpError("Attachment not found", 404);
  }
  await requireParticipant(message.conversationId, input.userId, input.organizationId);
  return attachment;
}
