import { and, eq, gte, sql } from "drizzle-orm";
import {
  communicationCases,
  communicationCategories,
  users,
} from "@shared/schema";
import { db } from "../db";

export async function getCommunicationsAnalytics(
  organizationId: string,
  opts?: { days?: number },
) {
  const days = Math.min(Math.max(opts?.days || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const orgEq = eq(communicationCases.organizationId, organizationId);
  const sinceEq = gte(communicationCases.createdAt, since);

  const [volume] = await db
    .select({
      totalCreated: sql<number>`count(*)`,
      openNow: sql<number>`count(*) filter (where ${communicationCases.status} in ('new','triaged','assigned','in_progress','awaiting_tenant','awaiting_approval','awaiting_third_party'))`,
      resolved: sql<number>`count(*) filter (where ${communicationCases.status} in ('resolved','closed'))`,
      unassigned: sql<number>`count(*) filter (where ${communicationCases.ownerUserId} is null and ${communicationCases.status} in ('new','triaged','assigned','in_progress','awaiting_tenant','awaiting_approval','awaiting_third_party'))`,
      overdue: sql<number>`count(*) filter (where ${communicationCases.status} in ('new','triaged','assigned','in_progress','awaiting_tenant','awaiting_approval','awaiting_third_party') and ((${communicationCases.firstResponseAt} is null and ${communicationCases.firstResponseDueAt} < now()) or (${communicationCases.resolvedAt} is null and ${communicationCases.resolutionDueAt} < now())))`,
      /** Denominator: cases created in window that have first_response_at set OR still open past due */
      firstResponseMet: sql<number>`count(*) filter (where ${communicationCases.firstResponseAt} is not null and ${communicationCases.firstResponseDueAt} is not null and ${communicationCases.firstResponseAt} <= ${communicationCases.firstResponseDueAt})`,
      firstResponseEligible: sql<number>`count(*) filter (where ${communicationCases.firstResponseDueAt} is not null and (${communicationCases.firstResponseAt} is not null or ${communicationCases.firstResponseDueAt} < now()))`,
      medianFirstResponseMinutes: sql<number>`percentile_cont(0.5) within group (order by extract(epoch from (${communicationCases.firstResponseAt} - ${communicationCases.createdAt})) / 60) filter (where ${communicationCases.firstResponseAt} is not null)`,
      medianResolutionMinutes: sql<number>`percentile_cont(0.5) within group (order by extract(epoch from (${communicationCases.resolvedAt} - ${communicationCases.createdAt})) / 60) filter (where ${communicationCases.resolvedAt} is not null)`,
      reopened: sql<number>`count(*) filter (where ${communicationCases.reopenReason} is not null)`,
      duplicatesExcluded: sql<number>`count(*) filter (where ${communicationCases.status} = 'duplicate')`,
      awaitingApproval: sql<number>`count(*) filter (where ${communicationCases.status} = 'awaiting_approval')`,
    })
    .from(communicationCases)
    .where(and(orgEq, sinceEq));

  const byCategory = await db
    .select({
      categoryId: communicationCases.categoryId,
      categoryKey: communicationCategories.key,
      categoryLabel: communicationCategories.label,
      count: sql<number>`count(*)`,
    })
    .from(communicationCases)
    .leftJoin(
      communicationCategories,
      eq(communicationCases.categoryId, communicationCategories.id),
    )
    .where(and(orgEq, sinceEq))
    .groupBy(
      communicationCases.categoryId,
      communicationCategories.key,
      communicationCategories.label,
    )
    .orderBy(sql`count(*) desc`);

  const byOwner = await db
    .select({
      ownerUserId: communicationCases.ownerUserId,
      firstName: users.firstName,
      lastName: users.lastName,
      openCount: sql<number>`count(*) filter (where ${communicationCases.status} in ('new','triaged','assigned','in_progress','awaiting_tenant','awaiting_approval','awaiting_third_party'))`,
      resolvedCount: sql<number>`count(*) filter (where ${communicationCases.status} in ('resolved','closed'))`,
      overdueCount: sql<number>`count(*) filter (where ${communicationCases.status} in ('new','triaged','assigned','in_progress','awaiting_tenant','awaiting_approval','awaiting_third_party') and ((${communicationCases.firstResponseAt} is null and ${communicationCases.firstResponseDueAt} < now()) or (${communicationCases.resolvedAt} is null and ${communicationCases.resolutionDueAt} < now())))`,
    })
    .from(communicationCases)
    .leftJoin(users, eq(communicationCases.ownerUserId, users.id))
    .where(and(orgEq, sinceEq))
    .groupBy(communicationCases.ownerUserId, users.firstName, users.lastName)
    .orderBy(sql`count(*) filter (where ${communicationCases.status} in ('new','triaged','assigned','in_progress','awaiting_tenant','awaiting_approval','awaiting_third_party')) desc`);

  const attention = await db
    .select()
    .from(communicationCases)
    .where(
      and(
        orgEq,
        sql`${communicationCases.status} in ('new','triaged','assigned','in_progress','awaiting_tenant','awaiting_approval','awaiting_third_party')`,
        sql`(
          ${communicationCases.priority} = 'urgent'
          OR (${communicationCases.firstResponseAt} is null and ${communicationCases.firstResponseDueAt} < now())
          OR (${communicationCases.resolvedAt} is null and ${communicationCases.resolutionDueAt} < now())
          OR ${communicationCases.ownerUserId} is null
        )`,
      ),
    )
    .limit(25);

  const firstResponseEligible = Number(volume?.firstResponseEligible || 0);
  const firstResponseMet = Number(volume?.firstResponseMet || 0);
  const slaPercent =
    firstResponseEligible > 0
      ? Math.round((firstResponseMet / firstResponseEligible) * 1000) / 10
      : null;

  return {
    windowDays: days,
    since: since.toISOString(),
    denominators: {
      volume: "Cases created in the selected window",
      slaPercent:
        "firstResponseMet / firstResponseEligible where eligible = cases with a first-response due that were answered or are past due",
      medianFirstResponseMinutes:
        "Median minutes from created_at to first_response_at for cases that received a first response",
    },
    volume: {
      /** Distinct non-duplicate cases created in window (spec §13). */
      totalCreated: Math.max(
        0,
        Number(volume?.totalCreated || 0) - Number(volume?.duplicatesExcluded || 0),
      ),
      openNow: Number(volume?.openNow || 0),
      resolved: Number(volume?.resolved || 0),
      unassigned: Number(volume?.unassigned || 0),
      overdue: Number(volume?.overdue || 0),
      awaitingApproval: Number(volume?.awaitingApproval || 0),
      reopened: Number(volume?.reopened || 0),
    },
    slaPercent,
    medianFirstResponseMinutes:
      volume?.medianFirstResponseMinutes != null
        ? Math.round(Number(volume.medianFirstResponseMinutes))
        : null,
    medianResolutionMinutes:
      volume?.medianResolutionMinutes != null
        ? Math.round(Number(volume.medianResolutionMinutes))
        : null,
    reopenedRate:
      Number(volume?.resolved || 0) > 0
        ? Math.round(
            (Number(volume?.reopened || 0) / Number(volume?.resolved || 0)) * 1000,
          ) / 10
        : null,
    byCategory: byCategory.map((r) => ({
      categoryId: r.categoryId,
      key: r.categoryKey,
      label: r.categoryLabel || "Unknown",
      count: Number(r.count || 0),
    })),
    byTeam: byOwner.map((r) => ({
      ownerUserId: r.ownerUserId,
      name:
        [r.firstName, r.lastName].filter(Boolean).join(" ") ||
        (r.ownerUserId ? "Assigned" : "Unassigned"),
      openCount: Number(r.openCount || 0),
      resolvedCount: Number(r.resolvedCount || 0),
      overdueCount: Number(r.overdueCount || 0),
    })),
    attentionList: attention.map((c) => ({
      id: c.id,
      reference: c.reference,
      subject: c.subject,
      status: c.status,
      priority: c.priority,
      ownerUserId: c.ownerUserId,
      firstResponseDueAt: c.firstResponseDueAt,
      resolutionDueAt: c.resolutionDueAt,
    })),
  };
}
