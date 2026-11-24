import type { User, WorkOrder } from "@shared/schema";
import { storage } from "../storage";

/** Roles allowed in the quote/invoice customer dropdown (not field operatives). */
export const QUOTE_CUSTOMER_ELIGIBLE_ROLES = ["owner", "maintenance_admin"] as const;

export type RecipientSnapshot = {
  recipientUserId: string | null;
  recipientContactId: null;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientAddress: null;
};

export type CustomerCandidate = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  displayName: string;
};

export function isQuoteCustomerEligibleRole(role?: string | null): boolean {
  return (
    !!role &&
    (QUOTE_CUSTOMER_ELIGIBLE_ROLES as readonly string[]).includes(role)
  );
}

export function userDisplayName(user: Pick<User, "firstName" | "lastName" | "email">): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  return (user.email || "").trim() || "User";
}

export function userRecipientSnapshot(user: User): RecipientSnapshot {
  return {
    recipientUserId: user.id,
    recipientContactId: null,
    recipientName: userDisplayName(user),
    recipientEmail: (user.email || "").trim() || null,
    recipientPhone: (user.phone || "").trim() || null,
    recipientAddress: null,
  };
}

export async function listQuoteCustomerCandidates(
  organizationId: string,
): Promise<CustomerCandidate[]> {
  const users = await storage.getUsersByOrganization(organizationId);
  return users
    .filter(
      (u) =>
        u.isActive !== false &&
        isQuoteCustomerEligibleRole(u.role) &&
        !!(u.email || u.firstName || u.lastName),
    )
    .map((u) => ({
      id: u.id,
      firstName: u.firstName || null,
      lastName: u.lastName || null,
      email: u.email || null,
      phone: u.phone || null,
      role: u.role,
      displayName: userDisplayName(u),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Default recipient for a new quote/invoice: WO creator when still an eligible org member.
 */
export async function defaultRecipientForWorkOrder(
  workOrder: Pick<WorkOrder, "createdBy" | "organizationId">,
): Promise<RecipientSnapshot | null> {
  const createdBy = (workOrder.createdBy || "").trim();
  if (!createdBy) return null;

  const user = await storage.getUser(createdBy);
  if (!user || user.organizationId !== workOrder.organizationId) return null;
  if (user.isActive === false) return null;
  if (!isQuoteCustomerEligibleRole(user.role)) return null;

  return userRecipientSnapshot(user);
}

/** Resolve a selected candidate user within the org (for PATCH). */
export async function resolveRecipientUserInOrg(
  organizationId: string,
  userId: string | null | undefined,
): Promise<RecipientSnapshot | null> {
  if (userId === null) {
    return {
      recipientUserId: null,
      recipientContactId: null,
      recipientName: null,
      recipientEmail: null,
      recipientPhone: null,
      recipientAddress: null,
    };
  }
  if (!userId) return null;

  const user = await storage.getUser(userId);
  if (!user || user.organizationId !== organizationId) return null;
  if (user.isActive === false) return null;
  if (!isQuoteCustomerEligibleRole(user.role)) return null;

  return userRecipientSnapshot(user);
}
