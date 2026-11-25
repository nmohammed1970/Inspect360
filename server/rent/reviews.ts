import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { rentAccounts, rentReviews, rentScheduleVersions, tenantAssignments } from "@shared/schema";
import { createScheduleVersion, httpError } from "./service";
import { writeFinancialAudit } from "./audit";
import { assessEnglandEligibility } from "@shared/rentEnglandRules";

export { assessEnglandEligibility };

export async function listRentReviews(organizationId: string) {
  return db
    .select()
    .from(rentReviews)
    .where(eq(rentReviews.organizationId, organizationId))
    .orderBy(desc(rentReviews.createdAt))
    .limit(200);
}

export async function createRentReview(
  organizationId: string,
  accountId: string,
  input: {
    proposedAmountMinor?: number;
    proposedEffectiveDate?: string;
    actorUserId?: string | null;
  },
) {
  const [account] = await db
    .select()
    .from(rentAccounts)
    .where(and(eq(rentAccounts.id, accountId), eq(rentAccounts.organizationId, organizationId)))
    .limit(1);
  if (!account) throw httpError(404, "Account not found");

  const [schedule] = await db
    .select()
    .from(rentScheduleVersions)
    .where(
      and(eq(rentScheduleVersions.accountId, accountId), eq(rentScheduleVersions.status, "approved")),
    )
    .orderBy(desc(rentScheduleVersions.effectiveFrom))
    .limit(1);

  const [assignment] = await db
    .select()
    .from(tenantAssignments)
    .where(eq(tenantAssignments.id, account.tenancyId))
    .limit(1);

  const proposedEffective = input.proposedEffectiveDate
    ? new Date(input.proposedEffectiveDate)
    : new Date(Date.now() + 90 * 86400000);

  const assessment = assessEnglandEligibility({
    leaseStartDate: assignment?.leaseStartDate || null,
    lastIncreaseEffective: schedule?.effectiveFrom || null,
    proposedEffectiveDate: proposedEffective,
  });

  const [review] = await db
    .insert(rentReviews)
    .values({
      organizationId,
      accountId,
      currentAmountMinor: schedule?.amountMinor || 0,
      proposedAmountMinor: input.proposedAmountMinor || null,
      status: assessment.eligible ? "draft" : "eligibility_check",
      eligibilityNotes: assessment.reasons.join("; "),
      proposedEffectiveDate: proposedEffective,
      createdBy: input.actorUserId || null,
    })
    .returning();

  return { review, assessment };
}

export async function submitRentReview(
  organizationId: string,
  reviewId: string,
  input: {
    action: "mark_manual_review" | "submit_approval" | "approve" | "reject" | "activate";
    proposedAmountMinor?: number;
    proposedEffectiveDate?: string;
    noticeServedAt?: string;
    notes?: string;
    actorUserId?: string | null;
  },
) {
  const [review] = await db
    .select()
    .from(rentReviews)
    .where(and(eq(rentReviews.id, reviewId), eq(rentReviews.organizationId, organizationId)))
    .limit(1);
  if (!review) throw httpError(404, "Review not found");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.proposedAmountMinor != null) patch.proposedAmountMinor = input.proposedAmountMinor;
  if (input.proposedEffectiveDate) patch.proposedEffectiveDate = new Date(input.proposedEffectiveDate);
  if (input.noticeServedAt) patch.noticeServedAt = new Date(input.noticeServedAt);
  if (input.notes) patch.eligibilityNotes = input.notes;

  if (input.action === "mark_manual_review") {
    patch.status = "manual_review";
  } else if (input.action === "submit_approval") {
    patch.status = "awaiting_approval";
  } else if (input.action === "reject") {
    patch.status = "rejected";
  } else if (input.action === "approve") {
    patch.status = "approved";
    patch.approvedBy = input.actorUserId || null;
    patch.approvedAt = new Date();
  } else if (input.action === "activate") {
    // Only activate with approved status + future/valid effective date — never auto-serve notices
    if (review.status !== "approved" && review.status !== "notice_ready") {
      throw httpError(400, "Review must be approved before activation");
    }
    const amount = input.proposedAmountMinor ?? review.proposedAmountMinor;
    const effective = input.proposedEffectiveDate
      ? new Date(input.proposedEffectiveDate)
      : review.proposedEffectiveDate;
    if (!amount || !effective) throw httpError(400, "Proposed amount and effective date required");

    const [account] = await db
      .select()
      .from(rentAccounts)
      .where(eq(rentAccounts.id, review.accountId))
      .limit(1);
    const [assignment] = account
      ? await db
          .select()
          .from(tenantAssignments)
          .where(eq(tenantAssignments.id, account.tenancyId))
          .limit(1)
      : [null];

    const assessment = assessEnglandEligibility({
      leaseStartDate: assignment?.leaseStartDate || null,
      lastIncreaseEffective: review.effectiveAt || null,
      proposedEffectiveDate: effective,
      noticeServedAt: (input.noticeServedAt
        ? new Date(input.noticeServedAt)
        : review.noticeServedAt) as Date | null,
    });
    if (!assessment.eligible) {
      throw httpError(400, `Cannot activate: ${assessment.reasons.join("; ")}`);
    }

    const version = await createScheduleVersion(review.accountId, {
      amountMinor: amount,
      frequency: "monthly",
      dueDay: assignment?.rentDueDay || 1,
      effectiveFrom: effective,
      approve: true,
      actorUserId: input.actorUserId,
      notes: `Rent review ${review.id}`,
    });

    patch.status = "effective";
    patch.effectiveAt = effective;
    patch.scheduleVersionId = version.id;
  }

  const [updated] = await db
    .update(rentReviews)
    .set(patch as any)
    .where(eq(rentReviews.id, reviewId))
    .returning();

  await writeFinancialAudit({
    organizationId,
    entityType: "rent_review",
    entityId: reviewId,
    action: input.action,
    actorUserId: input.actorUserId,
    after: updated,
    reason: input.notes,
  });

  return updated;
}

/** Seed eligibility-check reviews for accounts due for annual review. */
export async function seedUpcomingReviews(organizationId: string) {
  const accounts = await db
    .select()
    .from(rentAccounts)
    .where(and(eq(rentAccounts.organizationId, organizationId), eq(rentAccounts.status, "active")));

  let created = 0;
  for (const account of accounts) {
    const [schedule] = await db
      .select()
      .from(rentScheduleVersions)
      .where(
        and(
          eq(rentScheduleVersions.accountId, account.id),
          eq(rentScheduleVersions.status, "approved"),
        ),
      )
      .orderBy(desc(rentScheduleVersions.effectiveFrom))
      .limit(1);
    if (!schedule) continue;

    const anniversary = new Date(schedule.effectiveFrom);
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    const soon = new Date();
    soon.setUTCMonth(soon.getUTCMonth() + 3);
    if (anniversary > soon) continue;

    const existing = await db
      .select()
      .from(rentReviews)
      .where(
        and(
          eq(rentReviews.accountId, account.id),
          inArray(rentReviews.status, [
            "eligibility_check",
            "draft",
            "awaiting_approval",
            "approved",
            "manual_review",
          ]),
        ),
      )
      .limit(1);
    if (existing.length) continue;

    await createRentReview(organizationId, account.id, {
      proposedEffectiveDate: anniversary.toISOString(),
    });
    created += 1;
  }
  return { created };
}
