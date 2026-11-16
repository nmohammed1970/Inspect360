import { db } from "../db";
import { hmoAuditEvents } from "@shared/schema";

export type HmoAuditInput = {
  organizationId: string;
  actorType: string;
  actorId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  beforeHash?: string | null;
  afterHash?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function writeHmoAuditEvent(input: HmoAuditInput) {
  const [row] = await db
    .insert(hmoAuditEvents)
    .values({
      organizationId: input.organizationId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      beforeHash: input.beforeHash ?? null,
      afterHash: input.afterHash ?? null,
      correlationId: input.correlationId ?? null,
      metadata: input.metadata ?? null,
    })
    .returning();
  return row;
}
