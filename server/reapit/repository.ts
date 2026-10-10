import { and, desc, eq, sql } from "drizzle-orm";
import {
  reapitConnections,
  reapitEntityMappings,
  reapitJobs,
  reapitSyncRuns,
  reapitWebhookEvents,
  type ReapitConnection,
  type ReapitEntityMapping,
  type ReapitJob,
  type ReapitSyncRun,
} from "@shared/schema";
import { db, pool } from "../db";
import type { ReapitEntityType, SyncCounters, TokenBundle } from "./types";
import { decryptSecret, encryptSecret } from "./crypto";

export async function getConnectionByOrg(organizationId: string): Promise<ReapitConnection | undefined> {
  const [row] = await db.select().from(reapitConnections).where(eq(reapitConnections.organizationId, organizationId));
  return row;
}

export async function getConnectionByCustomerId(customerId: string): Promise<ReapitConnection | undefined> {
  const [row] = await db
    .select()
    .from(reapitConnections)
    .where(eq(reapitConnections.reapitCustomerId, customerId));
  return row;
}

export async function upsertConnection(input: {
  organizationId: string;
  reapitCustomerId?: string | null;
  status: string;
  tokens?: TokenBundle | null;
  lastError?: string | null;
}): Promise<ReapitConnection> {
  const existing = await getConnectionByOrg(input.organizationId);
  const encryptedTokens =
    input.tokens === undefined
      ? existing?.encryptedTokens
      : input.tokens
        ? encryptSecret(JSON.stringify(input.tokens))
        : null;
  const values = {
    organizationId: input.organizationId,
    reapitCustomerId: input.reapitCustomerId ?? existing?.reapitCustomerId ?? null,
    status: input.status,
    encryptedTokens,
    lastError: input.lastError ?? null,
    connectedAt: input.status === "connected" ? new Date() : existing?.connectedAt ?? null,
    disconnectedAt: input.status === "disconnected" ? new Date() : null,
    updatedAt: new Date(),
  };
  if (existing) {
    const [row] = await db
      .update(reapitConnections)
      .set(values)
      .where(eq(reapitConnections.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db.insert(reapitConnections).values(values).returning();
  return row;
}

export function readTokens(connection: ReapitConnection): TokenBundle | null {
  if (!connection.encryptedTokens) return null;
  try {
    return JSON.parse(decryptSecret(connection.encryptedTokens)) as TokenBundle;
  } catch (error) {
    console.error("[Reapit] Failed to decrypt tokens");
    return null;
  }
}

export async function findMapping(
  organizationId: string,
  entityType: ReapitEntityType,
  reapitId: string,
): Promise<ReapitEntityMapping | undefined> {
  const [row] = await db
    .select()
    .from(reapitEntityMappings)
    .where(
      and(
        eq(reapitEntityMappings.organizationId, organizationId),
        eq(reapitEntityMappings.entityType, entityType),
        eq(reapitEntityMappings.reapitId, reapitId),
      ),
    );
  return row;
}

export async function findMappingByLocal(
  organizationId: string,
  entityType: ReapitEntityType,
  inspect360Table: string,
  inspect360Id: string,
): Promise<ReapitEntityMapping | undefined> {
  const [row] = await db
    .select()
    .from(reapitEntityMappings)
    .where(
      and(
        eq(reapitEntityMappings.organizationId, organizationId),
        eq(reapitEntityMappings.entityType, entityType),
        eq(reapitEntityMappings.inspect360Table, inspect360Table),
        eq(reapitEntityMappings.inspect360Id, inspect360Id),
      ),
    );
  return row;
}

export async function upsertMapping(input: {
  organizationId: string;
  entityType: ReapitEntityType;
  reapitId: string;
  inspect360Table: string;
  inspect360Id: string;
}): Promise<ReapitEntityMapping> {
  const existing = await findMapping(input.organizationId, input.entityType, input.reapitId);
  if (existing) {
    const [row] = await db
      .update(reapitEntityMappings)
      .set({
        inspect360Table: input.inspect360Table,
        inspect360Id: input.inspect360Id,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reapitEntityMappings.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(reapitEntityMappings)
    .values({
      ...input,
      lastSyncedAt: new Date(),
    })
    .returning();
  return row;
}

export async function createSyncRun(organizationId: string, type: string): Promise<ReapitSyncRun> {
  const [row] = await db
    .insert(reapitSyncRuns)
    .values({ organizationId, type, status: "queued", countersJson: {} })
    .returning();
  return row;
}

export async function updateSyncRun(
  id: string,
  patch: Partial<{
    status: string;
    countersJson: SyncCounters;
    errorMessage: string | null;
    startedAt: Date;
    finishedAt: Date;
  }>,
): Promise<void> {
  await db
    .update(reapitSyncRuns)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(reapitSyncRuns.id, id));
}

export async function listSyncRuns(organizationId: string, limit = 20): Promise<ReapitSyncRun[]> {
  return db
    .select()
    .from(reapitSyncRuns)
    .where(eq(reapitSyncRuns.organizationId, organizationId))
    .orderBy(desc(reapitSyncRuns.createdAt))
    .limit(limit);
}

export async function mappingCounts(organizationId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({
      entityType: reapitEntityMappings.entityType,
      count: sql<number>`count(*)::int`,
    })
    .from(reapitEntityMappings)
    .where(eq(reapitEntityMappings.organizationId, organizationId))
    .groupBy(reapitEntityMappings.entityType);
  const out: Record<string, number> = {};
  for (const row of rows) out[row.entityType] = Number(row.count);
  return out;
}

export async function insertWebhookEvent(input: {
  eventId: string;
  topicId: string;
  organizationId?: string | null;
  reapitEntityId?: string | null;
  reapitCustomerId?: string | null;
  payloadJson?: unknown;
}): Promise<{ inserted: boolean }> {
  try {
    await db.insert(reapitWebhookEvents).values({
      eventId: input.eventId,
      topicId: input.topicId,
      organizationId: input.organizationId ?? null,
      reapitEntityId: input.reapitEntityId ?? null,
      reapitCustomerId: input.reapitCustomerId ?? null,
      payloadJson: input.payloadJson as any,
      status: "pending",
    });
    return { inserted: true };
  } catch (error: any) {
    if (String(error.message || "").includes("reapit_webhook_events_event_id") || error.code === "23505") {
      return { inserted: false };
    }
    throw error;
  }
}

export async function markWebhookEvent(eventId: string, status: string, errorMessage?: string | null) {
  await db
    .update(reapitWebhookEvents)
    .set({
      status,
      errorMessage: errorMessage ?? null,
      processedAt: status === "processed" ? new Date() : null,
    })
    .where(eq(reapitWebhookEvents.eventId, eventId));
}

export async function enqueueJob(input: {
  organizationId?: string | null;
  kind: string;
  payloadJson?: Record<string, unknown>;
  runAfter?: Date;
}): Promise<void> {
  await db.insert(reapitJobs).values({
    organizationId: input.organizationId ?? null,
    kind: input.kind,
    payloadJson: input.payloadJson || {},
    runAfter: input.runAfter || new Date(),
    status: "queued",
  });
}

export async function claimNextJob(): Promise<ReapitJob | undefined> {
  const result = await pool.query(
    `
    UPDATE reapit_jobs SET
      status = 'running',
      locked_at = NOW(),
      attempts = attempts + 1,
      updated_at = NOW()
    WHERE id = (
      SELECT id FROM reapit_jobs
      WHERE status = 'queued' AND COALESCE(run_after, NOW()) <= NOW()
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
    `,
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    id: row.id,
    organizationId: row.organization_id,
    kind: row.kind,
    status: row.status,
    runAfter: row.run_after,
    attempts: row.attempts,
    payloadJson: row.payload_json || {},
    errorMessage: row.error_message,
    lockedAt: row.locked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function finishJob(id: string, status: "done" | "queued" | "failed", errorMessage?: string | null, runAfter?: Date) {
  await db
    .update(reapitJobs)
    .set({
      status,
      errorMessage: errorMessage ?? null,
      runAfter: runAfter ?? new Date(),
      lockedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(reapitJobs.id, id));
}
