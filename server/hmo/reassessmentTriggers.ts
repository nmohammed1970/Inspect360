import * as hmoStorage from "./storage";
import { runAssessment } from "./assessmentRunner";

/**
 * Thin idempotent hooks that re-run assessment for a property when live inputs change.
 * Skips when there is no confirmed licence version.
 */
export async function triggerPropertyReassessment(params: {
  organizationId: string;
  propertyId: string;
  userId?: string | null;
  reason: string;
}) {
  const licences = await hmoStorage.listLicences(params.organizationId, params.propertyId);
  const confirmed =
    licences
      .flatMap((l) => l.versions || [])
      .find((v) => v.status === "CONFIRMED" || v.confirmedAt) || null;
  const versionId =
    confirmed?.id ||
    licences[0]?.currentVersionId ||
    licences[0]?.versions?.[0]?.id ||
    null;
  if (!versionId) {
    return { triggered: false as const, reason: "no_licence_version" };
  }
  if (!confirmed && !licences[0]?.versions?.some((v) => v.confirmedAt)) {
    return { triggered: false as const, reason: "licence_not_confirmed" };
  }

  const idempotencyKey = `reassess:${params.propertyId}:${params.reason}:${versionId}:${new Date()
    .toISOString()
    .slice(0, 13)}`;

  const job = await hmoStorage.createJob({
    organizationId: params.organizationId,
    propertyId: params.propertyId,
    jobType: "ASSESSMENT",
    userId: params.userId,
    licenceVersionId: versionId,
    idempotencyKey,
    status: "RUNNING",
    progress: 10,
  });
  if (job.status === "COMPLETED" && job.resultJson) {
    return { triggered: false as const, reason: "idempotent_skip", jobId: job.id };
  }

  try {
    const result = await runAssessment({
      orgId: params.organizationId,
      propertyId: params.propertyId,
      licenceVersionId: versionId,
      userId: params.userId,
      reason: params.reason,
    });
    await hmoStorage.updateJob(params.organizationId, job.id, {
      status: "COMPLETED",
      progress: 100,
      assessmentId: result.assessment.id,
      resultJson: {
        assessmentId: result.assessment.id,
        overallStatus: result.overallStatus,
      },
    });
    return { triggered: true as const, assessmentId: result.assessment.id, jobId: job.id };
  } catch (error: any) {
    await hmoStorage.updateJob(params.organizationId, job.id, {
      status: "FAILED",
      progress: 100,
      errorMessage: error?.message || "Reassessment failed",
    });
    throw error;
  }
}
