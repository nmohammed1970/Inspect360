import { createHash } from "crypto";
import {
  computeOverallPropertyStatus,
  evaluateLicenceChecks,
  evidenceCompletenessPercent,
  findingFingerprint,
  type HmoLicenceExtraction,
} from "@shared/hmo";
import { storage as appStorage } from "../storage";
import {
  createAssessmentWithFindings,
  createCaseWithTasks,
  ensurePropertyProfile,
  getLicence,
  getLicenceVersion,
  listCases,
} from "./storage";
import { writeHmoAuditEvent } from "./auditWriter";

export type RunAssessmentInput = {
  orgId: string;
  propertyId: string;
  licenceVersionId: string;
  userId?: string | null;
  reason?: string | null;
};

export async function runAssessment(input: RunAssessmentInput) {
  const { orgId, propertyId, licenceVersionId, userId, reason } = input;

  await ensurePropertyProfile(orgId, propertyId, userId);

  const version = await getLicenceVersion(orgId, licenceVersionId);
  if (!version) {
    throw Object.assign(new Error("Licence version not found"), { status: 404 });
  }

  const licence = await getLicence(orgId, version.licenceId);
  if (!licence || licence.propertyId !== propertyId) {
    throw Object.assign(new Error("Licence does not belong to property"), { status: 400 });
  }

  const property = await appStorage.getProperty(propertyId);
  if (!property || property.organizationId !== orgId) {
    throw Object.assign(new Error("Property not found"), { status: 404 });
  }

  const extraction = (version.extractedJson as HmoLicenceExtraction | null) || null;
  if (!extraction) {
    throw Object.assign(new Error("Licence version has no extraction to assess"), { status: 400 });
  }

  const documentId =
    version.originalDocumentId || version.id || extraction.document_id || "unknown-document";

  const drafts = evaluateLicenceChecks({
    propertyId,
    propertyAddress: property.address,
    landlordName: licence.holderName,
    extraction,
    documentId,
  });

  // Validate fingerprints are stable before persist
  for (const d of drafts) {
    findingFingerprint(propertyId, d.check_id, d.rule_version_id, d.subject_id);
  }

  const overallStatus = computeOverallPropertyStatus(drafts);
  const evidenceCompleteness = evidenceCompletenessPercent(drafts);
  const snapshotHash = createHash("sha256")
    .update(
      JSON.stringify({
        licenceVersionId,
        documentId,
        extraction_version: extraction.extraction_version,
        checkIds: drafts.map((d) => d.check_id),
      }),
    )
    .digest("hex")
    .slice(0, 64);

  const { assessment, findings } = await createAssessmentWithFindings({
    organizationId: orgId,
    propertyId,
    licenceVersionId,
    userId,
    runReason: reason || "manual",
    overallStatus,
    evidenceCompleteness,
    findings: drafts,
    snapshotHash,
  });

  const lic03 = findings.find((f) => f.checkId === "LIC-03");
  const lic05 = findings.find((f) => f.checkId === "LIC-05");
  const shouldOpenCase =
    (lic03 && lic03.severity === "CRITICAL" && lic03.status !== "VERIFIED_COMPLIANT") ||
    (lic05 && lic05.status === "EVIDENCE_MISSING");

  let openedCase = null;
  let tasks: Awaited<ReturnType<typeof createCaseWithTasks>>["tasks"] = [];

  if (shouldOpenCase) {
    const existingOpen = (await listCases(orgId, { propertyId })).filter(
      (c) => c.status !== "VERIFIED_CLOSED" && c.status !== "CANCELLED_AS_DUPLICATE",
    );
    if (existingOpen.length === 0) {
      const severity =
        lic03?.severity === "CRITICAL" ? "CRITICAL" : lic05?.severity || "HIGH";
      const created = await createCaseWithTasks({
        organizationId: orgId,
        propertyId,
        userId,
        severity,
        assessmentId: assessment.id,
        findingIds: findings
          .filter(
            (f) =>
              (f.checkId === "LIC-03" && f.severity === "CRITICAL") ||
              (f.checkId === "LIC-05" && f.status === "EVIDENCE_MISSING"),
          )
          .map((f) => f.id),
        seedParkViewTasks: true,
      });
      openedCase = created.case;
      tasks = created.tasks;
    } else {
      openedCase = existingOpen[0]!;
    }
  }

  await writeHmoAuditEvent({
    organizationId: orgId,
    actorType: "user",
    actorId: userId ?? null,
    entityType: "hmo_assessment",
    entityId: assessment.id,
    action: "assessment.run",
    metadata: {
      overallStatus,
      evidenceCompleteness,
      caseId: openedCase?.id ?? null,
      reason: reason || "manual",
    },
  });

  return {
    assessment,
    findings,
    overallStatus,
    evidenceCompleteness,
    case: openedCase,
    tasks,
  };
}
