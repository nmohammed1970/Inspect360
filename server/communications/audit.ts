import { eq, desc, and } from "drizzle-orm";
import { communicationAuditEvents } from "@shared/schema";
import { db } from "../db";

export type AuditActor = {
  actorType?: "user" | "system" | "tenant" | "webhook";
  actorId?: string | null;
};

export async function writeCommunicationAudit(params: {
  organizationId: string;
  caseId: string;
  eventType: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  correlationId?: string | null;
  actor?: AuditActor;
}) {
  const [row] = await db
    .insert(communicationAuditEvents)
    .values({
      organizationId: params.organizationId,
      caseId: params.caseId,
      actorType: params.actor?.actorType || "user",
      actorId: params.actor?.actorId ?? null,
      eventType: params.eventType,
      beforeJson: params.before ?? null,
      afterJson: params.after ?? null,
      reason: params.reason ?? null,
      correlationId: params.correlationId ?? null,
    })
    .returning();
  return row;
}

export async function listCaseAudit(organizationId: string, caseId: string) {
  return db
    .select()
    .from(communicationAuditEvents)
    .where(
      and(
        eq(communicationAuditEvents.organizationId, organizationId),
        eq(communicationAuditEvents.caseId, caseId),
      ),
    )
    .orderBy(desc(communicationAuditEvents.createdAt));
}
