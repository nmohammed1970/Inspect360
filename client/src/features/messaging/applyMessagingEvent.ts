import type { QueryClient } from "@tanstack/react-query";
import type {
  MessagingConversation,
  MessagingMessage,
  MessagingReceipt,
} from "./types";

export type MessagingWsPayload = {
  type: string;
  event?: "created" | "updated" | "deleted" | string;
  message?: MessagingMessage;
  receipt?: MessagingReceipt & { messageId: string };
  conversationId?: string;
  userId?: string;
  isTyping?: boolean;
  online?: boolean;
  lastSeenAt?: string | null;
  count?: number;
};

function messagesKey(conversationId: string) {
  return ["/api/messaging/conversations", conversationId, "messages"] as const;
}

function isViewingConversation(conversationId: string): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  if (document.hidden || document.visibilityState === "hidden") return false;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === `/messages/${conversationId}`;
}

function upsertMessageInList(
  messages: MessagingMessage[],
  incoming: MessagingMessage,
): MessagingMessage[] {
  const byId = messages.findIndex((m) => m.id === incoming.id);
  if (byId >= 0) {
    const next = [...messages];
    next[byId] = { ...next[byId], ...incoming, pending: false, failed: false };
    return next;
  }
  if (incoming.clientMessageId) {
    const byClient = messages.findIndex(
      (m) => m.clientMessageId && m.clientMessageId === incoming.clientMessageId,
    );
    if (byClient >= 0) {
      const next = [...messages];
      next[byClient] = { ...incoming, pending: false, failed: false };
      return next;
    }
  }
  return [...messages, { ...incoming, pending: false, failed: false }];
}

function patchConversationListOnCreate(
  queryClient: QueryClient,
  message: MessagingMessage,
  selfId: string,
) {
  const queries = queryClient.getQueriesData<MessagingConversation[]>({
    queryKey: ["/api/messaging/conversations"],
  });

  for (const [key, list] of queries) {
    if (!Array.isArray(list)) continue;
    const idx = list.findIndex((c) => c.id === message.conversationId);
    if (idx < 0) {
      queryClient.invalidateQueries({ queryKey: ["/api/messaging/conversations"] });
      continue;
    }

    const viewing = isViewingConversation(message.conversationId);
    const fromOther = message.senderId !== selfId;
    const conv = list[idx]!;
    const unreadCount =
      fromOther && !viewing ? (conv.unreadCount || 0) + 1 : viewing ? 0 : conv.unreadCount;

    const updated: MessagingConversation = {
      ...conv,
      maintenanceRequestId: conv.maintenanceRequestId,
      maintenanceRequest: conv.maintenanceRequest,
      lastMessageAt: message.createdAt,
      lastMessage: {
        id: message.id,
        body: message.deletedAt ? null : message.body,
        senderId: message.senderId,
        createdAt: message.createdAt,
        deletedAt: message.deletedAt,
      },
      unreadCount,
    };

    const next = [...list];
    next.splice(idx, 1);
    next.unshift(updated);
    queryClient.setQueryData(key, next);
  }
}

function patchConversationPreviewOnly(
  queryClient: QueryClient,
  message: MessagingMessage,
) {
  const queries = queryClient.getQueriesData<MessagingConversation[]>({
    queryKey: ["/api/messaging/conversations"],
  });
  for (const [key, list] of queries) {
    if (!Array.isArray(list)) continue;
    const idx = list.findIndex((c) => c.id === message.conversationId);
    if (idx < 0) continue;
    const conv = list[idx]!;
    const updated: MessagingConversation = {
      ...conv,
      lastMessage: {
        id: message.id,
        body: message.deletedAt ? null : message.body,
        senderId: message.senderId,
        createdAt: message.createdAt,
        deletedAt: message.deletedAt,
      },
    };
    const next = [...list];
    next[idx] = updated;
    queryClient.setQueryData(key, next);
  }
}

/** Apply a messaging WS payload to React Query caches. Returns true if handled. */
export function applyMessagingEvent(
  queryClient: QueryClient,
  data: MessagingWsPayload,
  selfId: string,
): boolean {
  if (data.type === "messaging_unread_count" && typeof data.count === "number") {
    queryClient.setQueryData(["/api/messaging/unread-count"], { count: data.count });
    return true;
  }

  if (data.type === "messaging_typing" || data.type === "messaging_presence") {
    window.dispatchEvent(new CustomEvent("inspect360:messaging", { detail: data }));
    return true;
  }

  if (data.type === "messaging_receipt" && data.receipt?.messageId) {
    const receipt = data.receipt;
    const queries = queryClient.getQueriesData<{
      messages: MessagingMessage[];
      nextCursor: string | null;
    }>({
      queryKey: ["/api/messaging/conversations"],
    });
    for (const [key, page] of queries) {
      if (!page?.messages) continue;
      const keyArr = key as unknown[];
      // messages key: ["/api/messaging/conversations", id, "messages"]
      if (keyArr[2] !== "messages") continue;
      let changed = false;
      const messages = page.messages.map((m) => {
        if (m.id !== receipt.messageId) return m;
        changed = true;
        const others = (m.receipts || []).filter((r) => r.userId !== receipt.userId);
        return { ...m, receipts: [...others, receipt] };
      });
      if (changed) {
        queryClient.setQueryData(key, { ...page, messages });
      }
    }
    return true;
  }

  if (data.type === "messaging_message" && data.message) {
    const message = data.message;
    const event = data.event || "created";
    const key = messagesKey(message.conversationId);

    queryClient.setQueryData(
      key,
      (
        prev:
          | { messages: MessagingMessage[]; nextCursor: string | null }
          | undefined,
      ) => {
        if (!prev?.messages) {
          // Thread not loaded — skip; list patch still runs
          return prev;
        }
        if (event === "deleted" || event === "updated") {
          return {
            ...prev,
            messages: upsertMessageInList(prev.messages, message),
          };
        }
        return {
          ...prev,
          messages: upsertMessageInList(prev.messages, message),
        };
      },
    );

    if (event === "created") {
      patchConversationListOnCreate(queryClient, message, selfId);
    } else {
      patchConversationPreviewOnly(queryClient, message);
    }

    // Forward for typing-page listeners / sound already handled by caller
    window.dispatchEvent(new CustomEvent("inspect360:messaging", { detail: data }));
    return true;
  }

  return false;
}

export function upsertOptimisticMessage(
  queryClient: QueryClient,
  conversationId: string,
  message: MessagingMessage,
) {
  const key = messagesKey(conversationId);
  queryClient.setQueryData(
    key,
    (
      prev: { messages: MessagingMessage[]; nextCursor: string | null } | undefined,
    ) => {
      if (!prev) {
        return { messages: [message], nextCursor: null };
      }
      return { ...prev, messages: upsertMessageInList(prev.messages, message) };
    },
  );
}

export function markOptimisticFailed(
  queryClient: QueryClient,
  conversationId: string,
  clientMessageId: string,
) {
  const key = messagesKey(conversationId);
  queryClient.setQueryData(
    key,
    (
      prev: { messages: MessagingMessage[]; nextCursor: string | null } | undefined,
    ) => {
      if (!prev?.messages) return prev;
      return {
        ...prev,
        messages: prev.messages.map((m) =>
          m.clientMessageId === clientMessageId
            ? { ...m, pending: false, failed: true }
            : m,
        ),
      };
    },
  );
}
