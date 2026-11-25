import { db } from "../db";
import { financialAuditEvents } from "@shared/schema";

export async function writeFinancialAudit(input: {
  organizationId: string;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}) {
  await db.insert(financialAuditEvents).values({
    organizationId: input.organizationId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actorUserId: input.actorUserId || null,
    beforeJson: input.before ?? null,
    afterJson: input.after ?? null,
    reason: input.reason || null,
  });
}

export async function listFinancialAudit(
  organizationId: string,
  opts?: { entityType?: string; entityId?: string; limit?: number },
) {
  const { eq, and, desc } = await import("drizzle-orm");
  const conditions = [eq(financialAuditEvents.organizationId, organizationId)];
  if (opts?.entityType) conditions.push(eq(financialAuditEvents.entityType, opts.entityType));
  if (opts?.entityId) conditions.push(eq(financialAuditEvents.entityId, opts.entityId));
  return db
    .select()
    .from(financialAuditEvents)
    .where(and(...conditions))
    .orderBy(desc(financialAuditEvents.createdAt))
    .limit(opts?.limit ?? 100);
}
