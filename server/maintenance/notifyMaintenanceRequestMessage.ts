import { storage } from "../storage";

const MAX_STAFF_NOTIFY = 5;

/**
 * Notify counterparties when a discussion message is posted on a maintenance request.
 * Best-effort — never throws.
 */
export async function notifyMaintenanceRequestMessage(input: {
  organizationId: string;
  maintenanceRequestId: string;
  messageId: string;
  requestTitle: string;
  authorUserId: string;
  authorRole: string | null | undefined;
  reportedBy: string;
  assignedTo?: string | null;
}): Promise<void> {
  try {
    const { sendNotificationToUser } = await import("../websocket");
    const titleSnippet = (input.requestTitle || "Maintenance request").slice(0, 80);
    const isTenantAuthor = input.authorRole === "tenant";

    const notifyIds = new Set<string>();

    if (isTenantAuthor) {
      const orgUsers = await storage.getUsersByOrganization(input.organizationId);
      const staff = (orgUsers || []).filter(
        (u: any) =>
          (u.role === "owner" || u.role === "maintenance_admin") &&
          u.isActive !== false &&
          u.id !== input.authorUserId,
      );
      for (const u of staff.slice(0, MAX_STAFF_NOTIFY)) {
        notifyIds.add(u.id);
      }
      if (input.assignedTo && input.assignedTo !== input.authorUserId) {
        try {
          const assigned = await storage.getUser(input.assignedTo);
          if (
            assigned &&
            (assigned.role === "owner" || assigned.role === "maintenance_admin")
          ) {
            notifyIds.add(assigned.id);
          }
        } catch {
          // ignore
        }
      }
    } else {
      if (input.reportedBy && input.reportedBy !== input.authorUserId) {
        notifyIds.add(input.reportedBy);
      }
    }

    for (const userId of notifyIds) {
      try {
        const notification = await storage.createNotification({
          userId,
          organizationId: input.organizationId,
          type: "maintenance_request_message",
          title: isTenantAuthor
            ? "Tenant replied on maintenance request"
            : "New message on your maintenance request",
          message: titleSnippet,
          data: {
            maintenanceRequestId: input.maintenanceRequestId,
            messageId: input.messageId,
          },
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
      } catch (err: any) {
        console.warn(
          `[notifyMaintenanceRequestMessage] failed for ${userId}:`,
          err?.message || err,
        );
      }
    }
  } catch (err: any) {
    console.warn(
      "[notifyMaintenanceRequestMessage] unexpected:",
      err?.message || err,
    );
  }
}
