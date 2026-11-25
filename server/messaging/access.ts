import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  messagingConversations,
  messagingParticipants,
  type MessagingConversation,
} from "@shared/schema";
import { storage } from "../storage";
import { buildDirectKey, httpError, MessagingHttpError } from "./errors";

export { buildDirectKey, httpError, MessagingHttpError };

export async function requireMessagingUser(userId: string) {
  const user = await storage.getUser(userId);
  if (!user?.organizationId || !user.isActive) {
    throw httpError("No organization found", 403);
  }
  return user as typeof user & { organizationId: string };
}

export async function getConversationInOrg(
  conversationId: string,
  organizationId: string,
): Promise<MessagingConversation | null> {
  const [row] = await db
    .select()
    .from(messagingConversations)
    .where(
      and(
        eq(messagingConversations.id, conversationId),
        eq(messagingConversations.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function requireParticipant(
  conversationId: string,
  userId: string,
  organizationId: string,
): Promise<MessagingConversation> {
  const conversation = await getConversationInOrg(conversationId, organizationId);
  if (!conversation) {
    throw httpError("Conversation not found", 404);
  }
  const [participant] = await db
    .select()
    .from(messagingParticipants)
    .where(
      and(
        eq(messagingParticipants.conversationId, conversationId),
        eq(messagingParticipants.userId, userId),
      ),
    )
    .limit(1);
  if (!participant) {
    throw httpError("Forbidden", 403);
  }
  return conversation;
}

export async function listParticipantUserIds(conversationId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: messagingParticipants.userId })
    .from(messagingParticipants)
    .where(eq(messagingParticipants.conversationId, conversationId));
  return rows.map((r) => r.userId);
}
