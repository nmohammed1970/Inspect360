/**
 * Shared rules for who may be assigned to perform an inspection,
 * and whether a user may access an inspection as its performer.
 */
import { storage } from "./storage";
import type { Inspection, User } from "@shared/schema";

export const INSPECTION_PERFORMER_ROLES = ["clerk", "contractor", "tenant"] as const;
export type InspectionPerformerRole = (typeof INSPECTION_PERFORMER_ROLES)[number];

export type ValidateAssigneeResult =
  | { ok: true; user: User }
  | { ok: false; status: number; message: string };

/**
 * Validate that `assigneeId` may be set as inspections.inspectorId.
 * Tenants must be assigned to the inspection property (block inspections cannot use tenants).
 */
export async function validateInspectionAssignee(opts: {
  assigneeId: string;
  organizationId: string;
  propertyId?: string | null;
  blockId?: string | null;
}): Promise<ValidateAssigneeResult> {
  const { assigneeId, organizationId, propertyId, blockId } = opts;
  const assignee = await storage.getUser(assigneeId);
  if (!assignee || assignee.isActive === false) {
    return { ok: false, status: 400, message: "Invalid assignment — user not found or inactive" };
  }

  if (!INSPECTION_PERFORMER_ROLES.includes(assignee.role as InspectionPerformerRole)) {
    return {
      ok: false,
      status: 400,
      message: "Invalid assignment — must be an inspector, contractor, or tenant",
    };
  }

  if (assignee.role === "tenant") {
    if (blockId && !propertyId) {
      return {
        ok: false,
        status: 400,
        message: "Tenants can only be assigned to property inspections, not block inspections",
      };
    }
    if (!propertyId) {
      return {
        ok: false,
        status: 400,
        message: "Select a property before assigning a tenant",
      };
    }
    // Tenants may lack organizationId on the user row; verify via property assignment.
    const propertyTenants = await storage.getTenantAssignmentsByProperty(
      propertyId,
      organizationId,
    );
    const match = propertyTenants.find((t: any) => t.id === assigneeId && t.assignment?.isActive !== false);
    if (!match) {
      return {
        ok: false,
        status: 400,
        message: "Selected tenant is not assigned to this property",
      };
    }
    return { ok: true, user: assignee };
  }

  // Clerk / contractor must belong to the same organization
  if (assignee.organizationId !== organizationId) {
    return {
      ok: false,
      status: 400,
      message: "Invalid assignment — must be a team member in your organization",
    };
  }

  return { ok: true, user: assignee };
}

/** True when the user is the assigned performer (inspectorId). */
export function isInspectionPerformer(
  user: Pick<User, "id">,
  inspection: Pick<Inspection, "inspectorId">,
): boolean {
  return !!inspection.inspectorId && inspection.inspectorId === user.id;
}

/**
 * Can this user read/write the inspection as a performer (capture flow)?
 * Owners/compliance always can (org-scoped separately).
 */
export function canPerformInspection(
  user: Pick<User, "id" | "role">,
  inspection: Pick<Inspection, "inspectorId">,
): boolean {
  if (user.role === "owner" || user.role === "compliance") return true;
  return isInspectionPerformer(user, inspection);
}

/**
 * Tenant review access (check-in/out sent for signature) — separate from performer capture.
 */
export function canTenantReviewInspection(
  user: Pick<User, "role">,
  inspection: Pick<Inspection, "type" | "tenantApprovalStatus" | "propertyId">,
  tenancyPropertyId: string | null | undefined,
): boolean {
  if (user.role !== "tenant") return false;
  if (!tenancyPropertyId || tenancyPropertyId !== inspection.propertyId) return false;
  const isReviewableType = inspection.type === "check_in" || inspection.type === "check_out";
  const wasSentForReview =
    inspection.tenantApprovalStatus === "pending" ||
    inspection.tenantApprovalStatus === "signed" ||
    inspection.tenantApprovalStatus === "approved" ||
    inspection.tenantApprovalStatus === "disputed";
  return isReviewableType && wasSentForReview;
}
