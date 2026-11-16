import { createHash } from "crypto";
import {
  computeOverallPropertyStatus,
  evaluateLicenceChecks,
  evidenceCompletenessPercent,
  findingFingerprint,
  type HmoAssessmentLiveData,
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
  listRoomProfiles,
} from "./storage";
import { writeHmoAuditEvent } from "./auditWriter";
import { buildOccupancyFromTenancies } from "./occupancy";

export type RunAssessmentInput = {
  orgId: string;
  propertyId: string;
  licenceVersionId: string;
  userId?: string | null;
  reason?: string | null;
  /** When true, skip CONFIRMED gate (e.g. impact worker re-run). Default false. */
  allowUnconfirmed?: boolean;
};

async function assembleLiveData(params: {
  orgId: string;
  propertyId: string;
  userId?: string | null;
  maxPersons: number | null;
}): Promise<HmoAssessmentLiveData> {
  let confirmedPersons: number | null = null;
  try {
    if (params.userId) {
      const occ = await buildOccupancyFromTenancies({
        organizationId: params.orgId,
        propertyId: params.propertyId,
        userId: params.userId,
        maxPersons: params.maxPersons,
      });
      confirmedPersons = occ.confirmedPersons;
    }
  } catch {
    confirmedPersons = null;
  }

  let rooms: HmoAssessmentLiveData["rooms"] = [];
  try {
    const profiles = await listRoomProfiles(params.orgId, params.propertyId);
    rooms = (profiles || []).map((r: any) => ({
      roomId: r.id || r.existingRoomId || String(r.id),
      usableAreaM2:
        typeof r.measuredUsableAreaM2 === "number"
          ? r.measuredUsableAreaM2
          : typeof r.usableAreaM2 === "number"
            ? r.usableAreaM2
            : null,
      ceilingHeightM: typeof r.ceilingHeightM === "number" ? r.ceilingHeightM : null,
      occupantsAged10OrAbove:
        typeof r.occupantsAged10OrAbove === "number"
          ? r.occupantsAged10OrAbove
          : typeof r.declaredPermittedOccupancy === "number"
            ? r.declaredPermittedOccupancy
            : 1,
      occupantsUnder10: typeof r.occupantsUnder10 === "number" ? r.occupantsUnder10 : 0,
      localMinM2: typeof r.localMinM2 === "number" ? r.localMinM2 : null,
    }));
  } catch {
    rooms = [];
  }

  const safetyEvidence: NonNullable<HmoAssessmentLiveData["safetyEvidence"]> = [];
  try {
    const docs = await appStorage.getComplianceDocuments(params.orgId);
    const forProperty = (docs || []).filter(
      (d: any) => !d.propertyId || d.propertyId === params.propertyId,
    );
    const kinds: Array<{ kind: "gas" | "electrical" | "fire"; match: RegExp; label: string }> = [
      { kind: "gas", match: /gas/i, label: "Gas safety" },
      { kind: "electrical", match: /electr|eicr|pat/i, label: "Electrical safety" },
      { kind: "fire", match: /fire|smoke|alarm/i, label: "Fire safety" },
    ];
    for (const k of kinds) {
      const hit = forProperty.find(
        (d: any) =>
          k.match.test(String(d.documentType || "")) ||
          k.match.test(String(d.name || "")) ||
          k.match.test(String(d.title || "")),
      );
      safetyEvidence.push({
        kind: k.kind,
        label: k.label,
        present: Boolean(hit),
        expiresAt: hit?.expiryDate
          ? new Date(hit.expiryDate).toISOString()
          : hit?.expiresAt
            ? new Date(hit.expiresAt).toISOString()
            : null,
      });
    }
  } catch {
    /* leave empty → SAF Needs attention */
  }

  return { confirmedPersons, rooms, safetyEvidence };
}

export async function runAssessment(input: RunAssessmentInput) {
  const { orgId, propertyId, licenceVersionId, userId, reason } = input;

  await ensurePropertyProfile(orgId, propertyId, userId);

  const version = await getLicenceVersion(orgId, licenceVersionId);
  if (!version) {
    throw Object.assign(new Error("Licence version not found"), { status: 404 });
  }

  if (!input.allowUnconfirmed && version.status !== "CONFIRMED" && !version.confirmedAt) {
    throw Object.assign(
      new Error("Confirm extracted licence details before running assessment"),
      { status: 400, code: "LICENCE_NOT_CONFIRMED" },
    );
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

  const maxPersons =
    typeof extraction.maximum_individuals?.value === "number"
      ? extraction.maximum_individuals.value
      : licence.maxPersons ?? null;

  const liveData = await assembleLiveData({
    orgId,
    propertyId,
    userId: userId || null,
    maxPersons,
  });

  const drafts = evaluateLicenceChecks({
    propertyId,
    propertyAddress: property.address,
    landlordName: licence.holderName,
    extraction,
    documentId,
    liveData,
  });

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
        confirmedPersons: liveData.confirmedPersons,
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
  const occ01 = findings.find((f) => f.checkId === "OCC-01");
  const shouldOpenCase =
    (lic03 && lic03.severity === "CRITICAL" && lic03.status !== "VERIFIED_COMPLIANT") ||
    (lic05 && lic05.status === "EVIDENCE_MISSING") ||
    (occ01 && occ01.status === "CONFIRMED_NON_COMPLIANT");

  let openedCase = null;
  let tasks: Awaited<ReturnType<typeof createCaseWithTasks>>["tasks"] = [];

  if (shouldOpenCase) {
    const existingOpen = (await listCases(orgId, { propertyId })).filter(
      (c) => c.status !== "VERIFIED_CLOSED" && c.status !== "CANCELLED_AS_DUPLICATE",
    );
    if (existingOpen.length === 0) {
      const severity =
        lic03?.severity === "CRITICAL" || occ01?.severity === "CRITICAL"
          ? "CRITICAL"
          : lic05?.severity || "HIGH";
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
              (f.checkId === "LIC-05" && f.status === "EVIDENCE_MISSING") ||
              (f.checkId === "OCC-01" && f.status === "CONFIRMED_NON_COMPLIANT"),
          )
          .map((f) => f.id),
      });
      openedCase = created.case;
      tasks = created.tasks;
    }
  }

  await writeHmoAuditEvent({
    organizationId: orgId,
    actorType: userId ? "user" : "system",
    actorId: userId || null,
    action: "hmo.assessment.completed",
    entityType: "hmo_assessment",
    entityId: assessment.id,
    metadata: { overallStatus, evidenceCompleteness, reason: reason || "manual" },
  });

  return {
    assessment,
    findings,
    overallStatus,
    evidenceCompleteness,
    case: openedCase,
    tasks,
    liveData,
  };
}
