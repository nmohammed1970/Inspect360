import { eq, and, inArray } from "drizzle-orm";
import { users } from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";

/** Create a staff/tenant notification without leaking sensitive case subject lines. */
export async function notifyCommunicationEvent(params: {
  organizationId: string;
  userIds: string[];
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}) {
  const unique = [...new Set(params.userIds.filter(Boolean))];
  for (const userId of unique) {
    try {
      await storage.createNotification({
        userId,
        organizationId: params.organizationId,
        type: params.type,
        title: params.title,
        message: params.message,
        data: params.data ?? null,
        isRead: false,
      });
    } catch (err) {
      console.error("[communications] notify failed", userId, err);
    }
  }
}

export async function listOrgStaffUserIds(
  organizationId: string,
  roles: string[] = ["owner", "clerk", "maintenance_admin"],
) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.organizationId, organizationId),
        inArray(users.role, roles as any),
      ),
    );
  return rows.map((r) => r.id);
}

export async function notifyCaseAssigned(params: {
  organizationId: string;
  caseId: string;
  reference: string;
  assigneeUserId: string;
}) {
  await notifyCommunicationEvent({
    organizationId: params.organizationId,
    userIds: [params.assigneeUserId],
    type: "communication_assigned",
    title: "Case assigned to you",
    message: `You have been assigned ${params.reference}.`,
    data: { caseId: params.caseId, reference: params.reference },
  });
}

export async function notifyTenantReply(params: {
  organizationId: string;
  caseId: string;
  reference: string;
  ownerUserId?: string | null;
}) {
  const recipients = params.ownerUserId
    ? [params.ownerUserId]
    : await listOrgStaffUserIds(params.organizationId);
  await notifyCommunicationEvent({
    organizationId: params.organizationId,
    userIds: recipients,
    type: "communication_tenant_reply",
    title: "Tenant replied",
    message: `A tenant replied on ${params.reference}.`,
    data: { caseId: params.caseId, reference: params.reference },
  });
}

export async function notifyApprovalRequested(params: {
  organizationId: string;
  caseId: string;
  reference: string;
  eligibleUserId?: string | null;
}) {
  const recipients = params.eligibleUserId
    ? [params.eligibleUserId]
    : await listOrgStaffUserIds(params.organizationId, ["owner"]);
  await notifyCommunicationEvent({
    organizationId: params.organizationId,
    userIds: recipients,
    type: "communication_approval",
    title: "Approval required",
    message: `${params.reference} needs a decision.`,
    data: { caseId: params.caseId, reference: params.reference },
  });
}

export async function notifyCaseOverdue(params: {
  organizationId: string;
  caseId: string;
  reference: string;
  ownerUserId?: string | null;
}) {
  const recipients = params.ownerUserId
    ? [params.ownerUserId]
    : await listOrgStaffUserIds(params.organizationId);
  await notifyCommunicationEvent({
    organizationId: params.organizationId,
    userIds: recipients,
    type: "communication_overdue",
    title: "Case overdue",
    message: `${params.reference} has passed its SLA target.`,
    data: { caseId: params.caseId, reference: params.reference },
  });
}

export async function notifyTenantCaseUpdate(params: {
  organizationId: string;
  tenantUserId: string;
  caseId: string;
  reference: string;
  kind: "reply" | "resolved" | "reopened";
}) {
  const titles = {
    reply: "New reply on your request",
    resolved: "Request resolved",
    reopened: "Request reopened",
  };
  const messages = {
    reply: `Staff replied on ${params.reference}.`,
    resolved: `${params.reference} has been marked resolved.`,
    reopened: `${params.reference} has been reopened.`,
  };
  await notifyCommunicationEvent({
    organizationId: params.organizationId,
    userIds: [params.tenantUserId],
    type: `communication_tenant_${params.kind}`,
    title: titles[params.kind],
    message: messages[params.kind],
    data: { caseId: params.caseId, reference: params.reference },
  });
}
