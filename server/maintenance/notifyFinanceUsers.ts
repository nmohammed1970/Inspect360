import { storage } from "../storage";

export type FinanceNotifyInput = {
  userIds: string[];
  organizationId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
};

/**
 * Best-effort in-app + websocket notify for maintenance finance events.
 * Dedupes user ids; never throws to callers.
 */
export async function notifyFinanceUsers(input: FinanceNotifyInput): Promise<number> {
  const unique = Array.from(new Set(input.userIds.filter(Boolean)));
  if (unique.length === 0) return 0;

  let sent = 0;
  try {
    const { sendNotificationToUser } = await import("../websocket");
    for (const userId of unique) {
      try {
        const notification = await storage.createNotification({
          userId,
          organizationId: input.organizationId,
          type: input.type,
          title: input.title,
          message: input.message,
          data: input.data ?? null,
        });
        sendNotificationToUser(userId, {
          id: notification.id,
          userId: notification.userId,
          organizationId: notification.organizationId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          isRead: notification.isRead,
          createdAt: notification.createdAt || new Date(),
        });
        sent += 1;
      } catch (err: any) {
        console.warn(
          `[notifyFinanceUsers] failed for ${userId}:`,
          err?.message || err,
        );
      }
    }
  } catch (err: any) {
    console.warn("[notifyFinanceUsers] unexpected:", err?.message || err);
  }
  return sent;
}

export function quoteCustomerDecisionNotifyType(
  decision: "accept" | "decline" | "request_changes",
): string {
  if (decision === "accept") return "quote_customer_accepted";
  if (decision === "decline") return "quote_customer_declined";
  return "quote_customer_changes_requested";
}

export function quoteCustomerDecisionTitle(
  decision: "accept" | "decline" | "request_changes",
): string {
  if (decision === "accept") return "Quotation accepted";
  if (decision === "decline") return "Quotation declined";
  return "Quotation changes requested";
}
