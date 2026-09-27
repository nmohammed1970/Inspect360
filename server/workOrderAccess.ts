/**
 * Shared Work Order authorization — session-derived identity only.
 * Do not accept client-supplied user/assignee IDs for access decisions.
 */

export type WorkOrderIdentity = {
  userId: string;
  organizationId: string;
  role: string;
  /** Contact IDs linked to this user (linkedUserId or matching email). */
  contactIds: string[];
};

export type WorkOrderAccessFields = {
  organizationId: string;
  contractorId?: string | null;
  assignedToId?: string | null;
};

/** Org-wide list (owner/compliance) vs personal assignee list (clerk/contractor). */
export function listScopeForUser(role: string | undefined | null): "org" | "assignee" {
  if (role === "clerk" || role === "contractor") return "assignee";
  return "org";
}

export function isOrgWideWorkOrderRole(role: string | undefined | null): boolean {
  return listScopeForUser(role) === "org";
}

/** Whether this assignee identity matches the work order assignment fields. */
export function isAssigneeMatch(
  identity: Pick<WorkOrderIdentity, "userId" | "contactIds">,
  workOrder: Pick<WorkOrderAccessFields, "assignedToId" | "contractorId">,
): boolean {
  const personalIds = new Set<string>([identity.userId, ...identity.contactIds].filter(Boolean));
  if (workOrder.assignedToId && personalIds.has(workOrder.assignedToId)) {
    return true;
  }
  if (workOrder.contractorId && identity.contactIds.includes(workOrder.contractorId)) {
    return true;
  }
  return false;
}

/**
 * Whether the authenticated identity may read/mutate this work order.
 * Always requires matching organizationId.
 */
export function canAccessWorkOrder(
  identity: WorkOrderIdentity,
  workOrder: WorkOrderAccessFields,
): boolean {
  if (!identity.organizationId || workOrder.organizationId !== identity.organizationId) {
    return false;
  }

  if (isOrgWideWorkOrderRole(identity.role)) {
    return true;
  }

  // Clerks and contractors: match by user id, linked contact id, or contractorId
  if (identity.role === "clerk" || identity.role === "contractor") {
    return isAssigneeMatch(identity, workOrder);
  }

  return false;
}

const ASSIGNEE_STATUSES = ["assigned", "in_progress", "waiting_parts", "completed"] as const;
const OWNER_EXTRA_STATUSES = ["rejected"] as const;

export function isAllowedWorkOrderStatus(
  role: string | undefined | null,
  status: string,
): boolean {
  if (ASSIGNEE_STATUSES.includes(status as (typeof ASSIGNEE_STATUSES)[number])) {
    return role === "owner" || role === "clerk" || role === "contractor";
  }
  if (OWNER_EXTRA_STATUSES.includes(status as (typeof OWNER_EXTRA_STATUSES)[number])) {
    return role === "owner";
  }
  return false;
}

/** Collect contact IDs for a user from a pre-fetched org contact list. */
export function contactIdsForUser(
  userId: string,
  userEmail: string | null | undefined,
  orgContacts: Array<{
    id: string;
    linkedUserId?: string | null;
    email?: string | null;
    type?: string | null;
  }>,
): string[] {
  const emailNorm = userEmail?.trim().toLowerCase() || "";
  const ids = new Set<string>();
  for (const c of orgContacts) {
    if (c.linkedUserId && c.linkedUserId === userId) {
      ids.add(c.id);
      continue;
    }
    // Match by email for staff/contractor contacts (not tenants)
    if (
      emailNorm &&
      c.email &&
      c.email.trim().toLowerCase() === emailNorm &&
      c.type !== "tenant"
    ) {
      ids.add(c.id);
    }
  }
  return Array.from(ids);
}

export function buildWorkOrderIdentity(input: {
  userId: string;
  organizationId: string;
  role: string;
  email?: string | null;
  orgContacts: Array<{
    id: string;
    linkedUserId?: string | null;
    email?: string | null;
    type?: string | null;
  }>;
}): WorkOrderIdentity {
  return {
    userId: input.userId,
    organizationId: input.organizationId,
    role: input.role,
    contactIds: contactIdsForUser(input.userId, input.email, input.orgContacts),
  };
}

/**
 * Resolve who to store on a work order from a team member row.
 * Prefer the linked user account when a contact is selected so clerk portals match.
 */
export function resolveWorkOrderAssigneeIds(member: {
  userId?: string | null;
  contactId?: string | null;
  contact?: { linkedUserId?: string | null } | null;
}): { assignedToId: string | null; contractorId: string | null } {
  const contractorId = member.contactId || null;
  const assignedToId =
    member.userId ||
    member.contact?.linkedUserId ||
    member.contactId ||
    null;
  return { assignedToId, contractorId };
}
