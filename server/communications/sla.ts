import { and, desc, eq, isNull } from "drizzle-orm";
import { communicationSlaEvents, type CommunicationCategory } from "@shared/schema";
import { db } from "../db";

export function computeSlaDeadlines(
  category: Pick<CommunicationCategory, "firstResponseHours" | "resolutionHours">,
  from = new Date(),
) {
  const firstResponseDueAt = new Date(
    from.getTime() + Math.max(1, category.firstResponseHours || 4) * 60 * 60 * 1000,
  );
  const resolutionDueAt = new Date(
    from.getTime() + Math.max(1, category.resolutionHours || 48) * 60 * 60 * 1000,
  );
  return { firstResponseDueAt, resolutionDueAt };
}

export async function recordSlaEvent(params: {
  organizationId: string;
  caseId: string;
  timerType: "first_response" | "resolution" | "escalation";
  deadline: Date;
  pauseReason?: string | null;
  escalationLevel?: number;
  pausedAt?: Date | null;
  resumedAt?: Date | null;
}) {
  const [row] = await db
    .insert(communicationSlaEvents)
    .values({
      organizationId: params.organizationId,
      caseId: params.caseId,
      timerType: params.timerType,
      deadline: params.deadline,
      pauseReason: params.pauseReason ?? null,
      escalationLevel: params.escalationLevel ?? 0,
      pausedAt: params.pausedAt ?? null,
      resumedAt: params.resumedAt ?? null,
    })
    .returning();
  return row;
}

export async function pauseSlaTimer(params: {
  organizationId: string;
  caseId: string;
  timerType: string;
  reason: string;
}) {
  const [latest] = await db
    .select()
    .from(communicationSlaEvents)
    .where(
      and(
        eq(communicationSlaEvents.organizationId, params.organizationId),
        eq(communicationSlaEvents.caseId, params.caseId),
        eq(communicationSlaEvents.timerType, params.timerType),
        isNull(communicationSlaEvents.pausedAt),
      ),
    )
    .orderBy(desc(communicationSlaEvents.createdAt))
    .limit(1);

  if (!latest) {
    return recordSlaEvent({
      organizationId: params.organizationId,
      caseId: params.caseId,
      timerType: params.timerType as "first_response" | "resolution" | "escalation",
      deadline: new Date(),
      pauseReason: params.reason,
      pausedAt: new Date(),
    });
  }

  const [row] = await db
    .update(communicationSlaEvents)
    .set({ pausedAt: new Date(), pauseReason: params.reason })
    .where(eq(communicationSlaEvents.id, latest.id))
    .returning();
  return row;
}

export async function resumeSlaTimer(params: {
  organizationId: string;
  caseId: string;
  timerType: string;
}) {
  const [latest] = await db
    .select()
    .from(communicationSlaEvents)
    .where(
      and(
        eq(communicationSlaEvents.organizationId, params.organizationId),
        eq(communicationSlaEvents.caseId, params.caseId),
        eq(communicationSlaEvents.timerType, params.timerType),
      ),
    )
    .orderBy(desc(communicationSlaEvents.createdAt))
    .limit(1);

  if (!latest || !latest.pausedAt) return latest ?? null;

  const pausedMs = Date.now() - new Date(latest.pausedAt).getTime();
  const newDeadline = new Date(new Date(latest.deadline).getTime() + Math.max(0, pausedMs));

  const [row] = await db
    .update(communicationSlaEvents)
    .set({ resumedAt: new Date(), deadline: newDeadline, pausedAt: null })
    .where(eq(communicationSlaEvents.id, latest.id))
    .returning();
  return row;
}

export function isOverdue(dueAt: Date | string | null | undefined, now = new Date()) {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() < now.getTime();
}
