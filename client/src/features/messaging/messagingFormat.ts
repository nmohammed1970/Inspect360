import type { MessagingMessage, MessagingUserSummary } from "./types";

export function formatMessageTime(value?: string | Date | null) {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatMessageDay(value?: string | Date | null) {
  if (!value) return "";
  const d = new Date(value);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function lastSeenLabel(user?: MessagingUserSummary | null) {
  if (!user) return "";
  if (user.online) return "Online";
  if (!user.lastSeenAt) return "Offline";
  return `Last seen ${new Date(user.lastSeenAt).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  })}`;
}

export function receiptStatus(
  message: MessagingMessage,
  selfId: string,
): "sent" | "delivered" | "read" {
  if (message.senderId !== selfId) return "sent";
  const others = message.receipts.filter((r) => r.userId !== selfId);
  if (others.some((r) => r.readAt)) return "read";
  if (others.some((r) => r.deliveredAt)) return "delivered";
  return "sent";
}

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "🙏"];
export const COMPOSER_EMOJIS = ["😀", "🙂", "😅", "🙏", "👍", "✅", "🔥", "🎉"];
