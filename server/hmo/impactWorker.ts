import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { hmoPropertyProfiles, hmoRuleImpactRuns } from "@shared/schema";
import { dispatchHmoNotification } from "./notificationDispatcher";
import { writeHmoAuditEvent } from "./auditWriter";
import * as hmoStorage from "./storage";

/**
 * Drain queued rule-impact runs: mark the selective property cohort for review
 * and raise Rules review needed alerts. Guidance-only rules do not force Non-compliant.
 * Assessment runs are disabled.
 */
export async function processQueuedRuleImpactRuns(limit = 5) {
  const queued = await db
    .select()
    .from(hmoRuleImpactRuns)
    .where(eq(hmoRuleImpactRuns.status, "QUEUED"))
    .limit(limit);

  const results = [];
  for (const run of queued) {
    results.push(await processRuleImpactRun(run.id));
  }
  return results;
}

export async function processRuleImpactRun(runId: string) {
  const [run] = await db
    .select()
    .from(hmoRuleImpactRuns)
    .where(eq(hmoRuleImpactRuns.id, runId))
    .limit(1);
  if (!run) return { runId, status: "missing" as const };
  if (run.status === "COMPLETED") return { runId, status: "already_completed" as const };

  await db
    .update(hmoRuleImpactRuns)
    .set({ status: "RUNNING", startedAt: new Date() })
    .where(eq(hmoRuleImpactRuns.id, runId));

  const summary = (run.summaryJson || {}) as {
    propertyIds?: string[];
    selective?: boolean;
  };
  const propertyIds = Array.isArray(summary.propertyIds) ? summary.propertyIds : [];
  const ruleVersions = await hmoStorage.listRuleVersions(run.organizationId);
  const rule = ruleVersions.find((r) => r.id === run.ruleVersionId);
  const guidanceOnly =
    String(rule?.classification || "").toLowerCase().includes("guidance") ||
    Boolean((rule?.requirementsJson as any)?.guidanceOnly);

  let completed = 0;
  const errors: string[] = [];
  const reviewedPropertyIds: string[] = [];

  for (const propertyId of propertyIds) {
    try {
      await writeHmoAuditEvent({
        organizationId: run.organizationId,
        actorType: "system",
        actorId: null,
        action: "hmo.rules.review_needed",
        entityType: "property",
        entityId: propertyId,
        metadata: {
          ruleVersionId: run.ruleVersionId,
          impactRunId: run.id,
          guidanceOnly,
        },
      });

      const profile = await hmoStorage.ensurePropertyProfile(run.organizationId, propertyId);
      if (
        profile.overallStatus === "VERIFIED_COMPLIANT" ||
        profile.overallStatus === "NOT_ASSESSED"
      ) {
        await db
          .update(hmoPropertyProfiles)
          .set({ overallStatus: "REVIEW_REQUIRED", updatedAt: new Date() })
          .where(
            and(
              eq(hmoPropertyProfiles.organizationId, run.organizationId),
              eq(hmoPropertyProfiles.propertyId, propertyId),
            ),
          );
      }

      await dispatchHmoNotification({
        organizationId: run.organizationId,
        userId: profile.complianceOwnerId || run.createdBy,
        title: "Rules review needed",
        message: guidanceOnly
          ? "An approved guidance update may affect this property. Review applicability — no automatic non-compliance."
          : "An approved council rule change may affect this property. Review findings and confirm applicability.",
        link: `/properties/${propertyId}?tab=hmo`,
        type: "hmo_rules_review",
      });

      completed += 1;
      reviewedPropertyIds.push(propertyId);
    } catch (error: any) {
      errors.push(`${propertyId}: ${error?.message || "failed"}`);
    }
  }

  await db
    .update(hmoRuleImpactRuns)
    .set({
      status: "COMPLETED",
      completedCount: completed,
      completedAt: new Date(),
      summaryJson: {
        ...summary,
        propertyIds,
        selective: true,
        reviewedPropertyIds,
        guidanceOnly,
        errors,
      },
    })
    .where(eq(hmoRuleImpactRuns.id, runId));

  return { runId, status: "COMPLETED" as const, completed, errors };
}
