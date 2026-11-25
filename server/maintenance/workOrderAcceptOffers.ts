import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  workOrderAcceptTokens,
  workOrders,
  type WorkOrderAcceptToken,
} from "@shared/schema";
import {
  appendWorkOrderEvent,
  generateShareTokenRaw,
  hashShareToken,
  publicAppBaseUrl,
} from "./quoteLifecycle";
import { resolveWorkOrderAssigneeIds } from "../workOrderAccess";

export const WO_ACCEPT_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function workOrderAcceptUrl(rawToken: string, req?: { protocol?: string; get?: (h: string) => string }): string {
  return `${publicAppBaseUrl(req)}/public/work-orders/accept/${rawToken}`;
}

export async function findValidAcceptToken(rawToken: string): Promise<WorkOrderAcceptToken | null> {
  const tokenHash = hashShareToken(rawToken);
  const [row] = await db
    .select()
    .from(workOrderAcceptTokens)
    .where(eq(workOrderAcceptTokens.tokenHash, tokenHash))
    .limit(1);
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

export async function revokeActiveAcceptTokens(workOrderId: string): Promise<void> {
  await db
    .update(workOrderAcceptTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(workOrderAcceptTokens.workOrderId, workOrderId),
        isNull(workOrderAcceptTokens.revokedAt),
      ),
    );
}

export type TeamMemberOfferRow = {
  id: string;
  userId?: string | null;
  contactId?: string | null;
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  contact?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedUserId?: string | null;
  } | null;
};

export async function createAcceptTokenForMember(input: {
  organizationId: string;
  workOrderId: string;
  member: TeamMemberOfferRow;
  ttlMs?: number;
}): Promise<{ rawToken: string; tokenRow: WorkOrderAcceptToken }> {
  const rawToken = generateShareTokenRaw();
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? WO_ACCEPT_TOKEN_TTL_MS));
  const [tokenRow] = await db
    .insert(workOrderAcceptTokens)
    .values({
      organizationId: input.organizationId,
      workOrderId: input.workOrderId,
      teamMemberId: input.member.id,
      userId: input.member.userId || null,
      contactId: input.member.contactId || null,
      tokenHash: hashShareToken(rawToken),
      expiresAt,
    })
    .returning();
  return { rawToken, tokenRow };
}

export function memberDisplayName(member: TeamMemberOfferRow): string {
  const person = member.user || member.contact;
  if (!person) return "Team member";
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
  return name || "Team member";
}

export function memberEmail(member: TeamMemberOfferRow): string | null {
  const email = member.user?.email || member.contact?.email;
  return email?.trim() || null;
}

export function memberPhone(member: TeamMemberOfferRow): string | null {
  const phone = member.user?.phone || member.contact?.phone;
  return phone?.trim() || null;
}

/**
 * Atomically assign the work order to the first acceptor.
 * Returns the updated work order, or null if already assigned / not pending.
 */
export async function acceptWorkOrderOffer(input: {
  tokenRow: WorkOrderAcceptToken;
  member: TeamMemberOfferRow;
}): Promise<
  | { ok: true; workOrder: typeof workOrders.$inferSelect }
  | { ok: false; reason: "already_assigned" | "not_pending" | "failed" }
> {
  const { assignedToId, contractorId } = resolveWorkOrderAssigneeIds(input.member);
  if (!assignedToId) {
    return { ok: false, reason: "failed" };
  }

  const [workOrder] = await db
    .update(workOrders)
    .set({
      assignedToId,
      contractorId,
      status: "assigned",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workOrders.id, input.tokenRow.workOrderId),
        eq(workOrders.organizationId, input.tokenRow.organizationId),
        eq(workOrders.status, "pending_acceptance"),
        isNull(workOrders.assignedToId),
      ),
    )
    .returning();

  if (!workOrder) {
    const existing = await storage.getWorkOrder(input.tokenRow.workOrderId);
    if (existing?.assignedToId) {
      return { ok: false, reason: "already_assigned" };
    }
    return { ok: false, reason: "not_pending" };
  }

  await db
    .update(workOrderAcceptTokens)
    .set({ acceptedAt: new Date() })
    .where(eq(workOrderAcceptTokens.id, input.tokenRow.id));

  await db
    .update(workOrderAcceptTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(workOrderAcceptTokens.workOrderId, input.tokenRow.workOrderId),
        isNull(workOrderAcceptTokens.revokedAt),
        ne(workOrderAcceptTokens.id, input.tokenRow.id),
      ),
    );

  await appendWorkOrderEvent({
    organizationId: input.tokenRow.organizationId,
    workOrderId: input.tokenRow.workOrderId,
    eventType: "assignment_accepted",
    actorUserId: input.member.userId || input.member.contact?.linkedUserId || null,
    payload: {
      teamMemberId: input.member.id,
      assignedToId,
      contractorId,
      acceptTokenId: input.tokenRow.id,
    },
  });

  if (workOrder.maintenanceRequestId && assignedToId) {
    void import("../messaging/maintenanceThreads").then(
      ({ scheduleAddUserToMaintenanceDiscussion }) =>
        scheduleAddUserToMaintenanceDiscussion({
          organizationId: input.tokenRow.organizationId,
          maintenanceRequestId: workOrder.maintenanceRequestId!,
          userId: assignedToId,
        }),
    );
  }

  return { ok: true, workOrder };
}

export async function loadAcceptOfferContext(rawToken: string) {
  const tokenRow = await findValidAcceptToken(rawToken);
  if (!tokenRow) return null;

  const workOrder = await storage.getWorkOrder(tokenRow.workOrderId);
  if (!workOrder || workOrder.organizationId !== tokenRow.organizationId) {
    return null;
  }

  const request = await storage.getMaintenanceRequest(workOrder.maintenanceRequestId);
  if (!request) return null;

  let propertyName: string | null = null;
  let propertyAddress: string | null = null;
  if (request.propertyId) {
    const property = await storage.getProperty(request.propertyId);
    if (property) {
      propertyName = property.name || null;
      propertyAddress = property.address || null;
    }
  }

  const canAccept =
    workOrder.status === "pending_acceptance" &&
    !workOrder.assignedToId &&
    !tokenRow.acceptedAt &&
    !tokenRow.revokedAt;

  return {
    tokenRow,
    workOrder,
    request,
    propertyName,
    propertyAddress,
    canAccept,
    alreadyAssigned: Boolean(workOrder.assignedToId) || workOrder.status !== "pending_acceptance",
  };
}

/**
 * Create per-member tokens and send email/SMS offers. Never throws to caller for notify failures.
 */
export async function fanOutWorkOrderAcceptOffers(input: {
  organizationId: string;
  workOrderId: string;
  teamId: string;
  createdByUserId: string;
  req?: { protocol?: string; get?: (h: string) => string };
}): Promise<void> {
  const members = (await storage.getTeamMembers(input.teamId)) as TeamMemberOfferRow[];
  if (!members.length) return;

  const workOrder = await storage.getWorkOrder(input.workOrderId);
  if (!workOrder) return;
  const request = await storage.getMaintenanceRequest(workOrder.maintenanceRequestId);
  if (!request) return;

  let propertyName: string | undefined;
  if (request.propertyId) {
    const property = await storage.getProperty(request.propertyId);
    propertyName = property?.name || undefined;
  }

  const { sendWorkOrderAcceptOfferEmail } = await import("../resend");
  const { sendWorkOrderAcceptOfferSms } = await import("../smsService");

  for (const member of members) {
    try {
      const email = memberEmail(member);
      const phone = memberPhone(member);
      if (!email && !phone) continue;

      const { rawToken, tokenRow } = await createAcceptTokenForMember({
        organizationId: input.organizationId,
        workOrderId: input.workOrderId,
        member,
      });
      const acceptUrl = workOrderAcceptUrl(rawToken, input.req);
      const recipientName = memberDisplayName(member);

      if (email && !tokenRow.emailSentAt) {
        try {
          await sendWorkOrderAcceptOfferEmail({
            to: email,
            recipientName,
            acceptUrl,
            workOrder: {
              id: workOrder.id,
              maintenanceTitle: request.title,
              maintenanceDescription: request.description || undefined,
              priority: request.priority,
              propertyName,
              photoUrls: Array.isArray(request.photoUrls) ? request.photoUrls : [],
              slaDue: workOrder.slaDue || null,
              costEstimate: workOrder.costEstimate || null,
            },
          });
          await db
            .update(workOrderAcceptTokens)
            .set({ emailSentAt: new Date() })
            .where(eq(workOrderAcceptTokens.id, tokenRow.id));
        } catch (emailErr: any) {
          console.error(
            `[wo-accept] email failed wo=${input.workOrderId} member=${member.id}:`,
            emailErr?.message || emailErr,
          );
        }
      }

      if (phone) {
        try {
          await sendWorkOrderAcceptOfferSms({
            organizationId: input.organizationId,
            workOrderId: input.workOrderId,
            teamMemberId: member.id,
            phone,
            text: `Inspect360: New job "${request.title}"${propertyName ? ` at ${propertyName}` : ""}. Accept: ${acceptUrl}`,
          });
        } catch (smsErr: any) {
          console.error(
            `[wo-accept] SMS failed wo=${input.workOrderId} member=${member.id}:`,
            smsErr?.message || smsErr,
          );
        }
      }
    } catch (memberErr: any) {
      console.error(
        `[wo-accept] offer failed wo=${input.workOrderId} member=${member.id}:`,
        memberErr?.message || memberErr,
      );
    }
  }
}
