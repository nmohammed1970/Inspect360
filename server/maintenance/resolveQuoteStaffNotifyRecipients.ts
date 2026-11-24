import type { MaintenanceQuote } from "@shared/schema";
import { storage } from "../storage";

export type QuoteStaffNotifyRecipient = {
  userId?: string;
  email?: string;
  source: "owner_admin" | "prepared_by" | "assignee" | "contractor";
};

/**
 * Resolve staff who should be emailed / notified when a customer responds to a quote.
 * Dedupes by email (case-insensitive) and by userId.
 */
export async function resolveQuoteStaffNotifyRecipients(
  quote: Pick<
    MaintenanceQuote,
    "organizationId" | "workOrderId" | "preparedByUserId"
  >,
): Promise<{
  /** Owners + maintenance_admins with email (capped by caller). */
  ownersAdmins: QuoteStaffNotifyRecipient[];
  /** Field staff: preparer, assignee user, contractor contact. */
  fieldStaff: QuoteStaffNotifyRecipient[];
  /** Unique user ids for in-app notifications (owners/admins + field users). */
  notifyUserIds: string[];
}> {
  const ownersAdmins: QuoteStaffNotifyRecipient[] = [];
  const fieldStaff: QuoteStaffNotifyRecipient[] = [];
  const seenEmails = new Set<string>();
  const seenUserIds = new Set<string>();

  const addEmail = (email: string | null | undefined): string | null => {
    const normalized = (email || "").trim().toLowerCase();
    if (!normalized || seenEmails.has(normalized)) return null;
    seenEmails.add(normalized);
    return (email || "").trim();
  };

  const addUserId = (userId: string | null | undefined) => {
    if (!userId || seenUserIds.has(userId)) return;
    seenUserIds.add(userId);
  };

  const orgUsers = await storage.getUsersByOrganization(quote.organizationId);
  for (const u of orgUsers || []) {
    if (u.role !== "owner" && u.role !== "maintenance_admin") continue;
    const email = addEmail(u.email);
    if (email) {
      ownersAdmins.push({ userId: u.id, email, source: "owner_admin" });
    }
    addUserId(u.id);
  }

  if (quote.preparedByUserId) {
    try {
      const preparer = await storage.getUser(quote.preparedByUserId);
      if (preparer) {
        const email = addEmail(preparer.email);
        if (email) {
          fieldStaff.push({
            userId: preparer.id,
            email,
            source: "prepared_by",
          });
        } else if (!seenUserIds.has(preparer.id)) {
          fieldStaff.push({ userId: preparer.id, source: "prepared_by" });
        }
        addUserId(preparer.id);
      }
    } catch {
      // best-effort
    }
  }

  try {
    const workOrder = await storage.getWorkOrder(quote.workOrderId);
    if (workOrder?.assignedToId) {
      try {
        const assignee = await storage.getUser(workOrder.assignedToId);
        if (assignee) {
          const email = addEmail(assignee.email);
          if (email) {
            fieldStaff.push({
              userId: assignee.id,
              email,
              source: "assignee",
            });
          } else if (!seenUserIds.has(assignee.id)) {
            fieldStaff.push({ userId: assignee.id, source: "assignee" });
          }
          addUserId(assignee.id);
        }
      } catch {
        // assignedToId may be a contact id — ignore user lookup miss
      }
    }

    if (workOrder?.contractorId) {
      try {
        const contact = await storage.getContact(workOrder.contractorId);
        const email = addEmail(contact?.email);
        if (email) {
          fieldStaff.push({
            userId: contact?.linkedUserId || undefined,
            email,
            source: "contractor",
          });
        }
        if (contact?.linkedUserId) {
          addUserId(contact.linkedUserId);
        }
      } catch {
        // best-effort
      }
    }
  } catch {
    // best-effort
  }

  return {
    ownersAdmins,
    fieldStaff,
    notifyUserIds: Array.from(seenUserIds),
  };
}
