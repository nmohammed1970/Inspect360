import { sendWsPayloadToUser, isUserConnected } from "../websocket";

/**
 * In-process WS fanout (single Node instance).
 * Multi-node deploys will need a shared pub/sub (e.g. Redis) so connections
 * on other processes receive the same payloads.
 */
export function fanoutToUsers(userIds: string[], payload: Record<string, unknown>) {
  const unique = [...new Set(userIds)];
  for (const userId of unique) {
    sendWsPayloadToUser(userId, payload);
  }
}

export function fanoutMessagingMessage(
  participantIds: string[],
  message: unknown,
  event: "created" | "updated" | "deleted" = "created",
) {
  fanoutToUsers(participantIds, {
    type: "messaging_message",
    event,
    message,
  });
}

export function fanoutMessagingReceipt(
  participantIds: string[],
  receipt: unknown,
) {
  fanoutToUsers(participantIds, {
    type: "messaging_receipt",
    receipt,
  });
}

export function fanoutMessagingTyping(
  participantIds: string[],
  payload: { conversationId: string; userId: string; isTyping: boolean },
) {
  fanoutToUsers(
    participantIds.filter((id) => id !== payload.userId),
    { type: "messaging_typing", ...payload },
  );
}

export function fanoutMessagingUnread(userId: string, count: number) {
  sendWsPayloadToUser(userId, {
    type: "messaging_unread_count",
    count,
  });
}

export function fanoutMessagingPresence(
  userIds: string[],
  payload: { userId: string; online: boolean; lastSeenAt: string | null },
) {
  fanoutToUsers(
    userIds.filter((id) => id !== payload.userId),
    { type: "messaging_presence", ...payload },
  );
}

export { isUserConnected };
