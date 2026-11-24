import { eq } from "drizzle-orm";
import { contacts, workOrders } from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";

const MAX_STAFF_NOTIFY = 5;

/**
 * Resolve contractor user ids linked to work orders for this maintenance request.
 */
async function contractorUserIdsForRequest(
  maintenanceRequestId: string,
): Promise<string[]> {
  const ids = new Set<string>();
  try {
    const rows = await db
      .select({
        assignedToId: workOrders.assignedToId,
        contractorId: workOrders.contractorId,
      })
      .from(workOrders)
      .where(eq(workOrders.maintenanceRequestId, maintenanceRequestId));

    for (const row of rows) {
      if (row.assignedToId) {
        try {
          const user = await storage.getUser(row.assignedToId);
          if (user?.role === "contractor" && (user as any).isActive !== false) {
            ids.add(user.id);
          }
        } catch {
          // ignore
        }
      }
      if (row.contractorId) {
        try {
          const [contact] = await db
            .select({ linkedUserId: contacts.linkedUserId })
            .from(contacts)
            .where(eq(contacts.id, row.contractorId))
            .limit(1);
          if (contact?.linkedUserId) {
            const user = await storage.getUser(contact.linkedUserId);
            if (user?.role === "contractor" && (user as any).isActive !== false) {
              ids.add(user.id);
            }
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (err: any) {
    console.warn(
      "[notifyMaintenanceRequestMessage] contractor resolve failed:",
      err?.message || err,
    );
  }
  return Array.from(ids);
}

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
            (assigned.role === "owner" ||
              assigned.role === "maintenance_admin" ||
              assigned.role === "contractor")
          ) {
            notifyIds.add(assigned.id);
          }
        } catch {
          // ignore
        }
      }

      const contractors = await contractorUserIdsForRequest(input.maintenanceRequestId);
      for (const id of contractors) {
        if (id !== input.authorUserId) notifyIds.add(id);
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
