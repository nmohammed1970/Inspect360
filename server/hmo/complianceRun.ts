import {
  complianceFindingIsOpen,
  evaluateProvenCompliance,
  findingFingerprint,
  statusFromComplianceFindings,
  type HmoFindingDraft,
  type HmoLicenceExtraction,
} from "@shared/hmo";
import { storage as appStorage } from "../storage";
import { countActiveTenantsForProperty } from "./occupancy";
import {
  createAssessmentWithFindings,
  ensurePropertyProfile,
  getFinding,
  getLatestAssessment,
  listFindings,
  listLicences,
  listRoomProfiles,
  setProfileComplianceStatus,
  updateFindingRecord,
} from "./storage";
import { writeHmoAuditEvent } from "./auditWriter";

const COMPLIANCE_RUN_REASON = "compliance_assessment";

type SafetyKind = "gas" | "electrical" | "fire";

function jsonValue(json: unknown): string {
  if (json && typeof json === "object" && "value" in json) {
    return String((json as { value?: unknown }).value ?? "");
  }
  return "";
}

function resolutionOf(json: unknown): string | null {
  if (json && typeof json === "object" && "resolution" in json) {
    const value = (json as { resolution?: unknown }).resolution;
    return typeof value === "string" ? value : null;
  }
  return null;
}

async function loadSafetyEvidence(orgId: string, propertyId: string) {
  const safetyEvidence: Array<{
    kind: SafetyKind;
    label: string;
    present: boolean;
    expiresAt: string | null;
  }> = [];
  const docs = await appStorage.getComplianceDocuments(orgId);
  const forProperty = (docs || []).filter(
    (d: any) => !d.propertyId || d.propertyId === propertyId,
  );
  const kinds: Array<{ kind: SafetyKind; match: RegExp; label: string }> = [
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
  return safetyEvidence;
}

async function buildDrafts(params: {
  orgId: string;
  propertyId: string;
}): Promise<{ drafts: HmoFindingDraft[]; documentId: string; licenceVersionId: string }> {
  const licences = await listLicences(params.orgId, params.propertyId);
  const licence = licences[0];
  if (!licence) {
    throw Object.assign(new Error("Save the licence details before running assessment"), {
      status: 400,
    });
  }
  const version =
    licence.versions?.find((v) => v.id === licence.currentVersionId) || licence.versions?.[0];
  const extraction = (version?.extractedJson || null) as HmoLicenceExtraction | null;
  if (!version || !extraction) {
    throw Object.assign(new Error("Licence has no saved details to assess"), { status: 400 });
  }

  const profiles = await listRoomProfiles(params.orgId, params.propertyId);
  const rooms = (profiles || []).map((r) => ({
    roomId: r.id,
    roomName: r.roomName,
    roomType: r.roomType,
    usableAreaM2: typeof r.measuredUsableAreaM2 === "number" ? r.measuredUsableAreaM2 : null,
    ceilingHeightM: typeof r.ceilingHeightM === "number" ? r.ceilingHeightM : null,
    declaredOccupancy:
      typeof r.declaredPermittedOccupancy === "number" ? r.declaredPermittedOccupancy : null,
    sleepingApproved: r.sleepingApproved !== false,
    humanConfirmed: r.humanConfirmed === true,
  }));

  const confirmedPersons = await countActiveTenantsForProperty(params.propertyId, params.orgId);
  let safetyEvidence: Awaited<ReturnType<typeof loadSafetyEvidence>> | null = null;
  try {
    safetyEvidence = await loadSafetyEvidence(params.orgId, params.propertyId);
  } catch {
    safetyEvidence = null;
  }

  const documentId = version.originalDocumentId || version.id || extraction.document_id || version.id;
  const drafts = evaluateProvenCompliance({
    propertyId: params.propertyId,
    extraction,
    documentId,
    maxPersons: licence.maxPersons,
    expiryDate: licence.expiryDate ? new Date(licence.expiryDate).toISOString() : null,
    confirmedPersons,
    rooms,
    safetyEvidence,
  });

  return { drafts, documentId, licenceVersionId: version.id };
}

async function recompute(orgId: string, propertyId: string, userId: string | null) {
  const latest = await getLatestAssessment(orgId, propertyId);
  if (!latest || latest.runReason !== COMPLIANCE_RUN_REASON) {
    return latest?.overallStatus || "NOT_ASSESSED";
  }
  const findings = await listFindings(orgId, propertyId, { assessmentId: latest.id });
  const overallStatus = statusFromComplianceFindings(
    findings.map((f) => ({
      status: f.status,
      severity: f.severity,
      resolution: resolutionOf(f.actualJson),
    })),
  );
  await setProfileComplianceStatus({
    organizationId: orgId,
    propertyId,
    assessmentId: latest.id,
    overallStatus,
    userId,
  });
  return overallStatus;
}

export async function runComplianceAssessment(input: {
  orgId: string;
  propertyId: string;
  userId?: string | null;
}) {
  const { orgId, propertyId, userId } = input;
  await ensurePropertyProfile(orgId, propertyId, userId);

  const property = await appStorage.getProperty(propertyId);
  if (!property || property.organizationId !== orgId) {
    throw Object.assign(new Error("Property not found"), { status: 404 });
  }

  const { drafts, licenceVersionId } = await buildDrafts({ orgId, propertyId });
  const previous = await listFindings(orgId, propertyId);
  const latestByFingerprint = new Map<string, (typeof previous)[number]>();
  for (const finding of previous) {
    if (!latestByFingerprint.has(finding.fingerprint)) {
      latestByFingerprint.set(finding.fingerprint, finding);
    }
  }

  const prepared = drafts.map((draft) => {
    const fingerprint = findingFingerprint(
      propertyId,
      draft.check_id,
      draft.rule_version_id,
      draft.subject_id,
    );
    const prior = latestByFingerprint.get(fingerprint);
    const carry =
      prior &&
      resolutionOf(prior.actualJson) === "force_closed" &&
      jsonValue(prior.actualJson) === draft.actual_value &&
      jsonValue(prior.requiredJson) === draft.required_value
        ? prior
        : null;
    return { draft, fingerprint, carry };
  });

  const overallStatus = statusFromComplianceFindings(
    prepared.map((row) => ({
      status: row.carry ? "VERIFIED_COMPLIANT" : row.draft.status,
      severity: row.draft.severity,
      resolution: row.carry ? "force_closed" : null,
    })),
  );

  const created = await createAssessmentWithFindings({
    organizationId: orgId,
    propertyId,
    licenceVersionId,
    userId,
    runReason: COMPLIANCE_RUN_REASON,
    overallStatus,
    evidenceCompleteness: prepared.some(
      (row) => !row.carry && row.draft.status === "EVIDENCE_MISSING",
    )
      ? 50
      : 100,
    findings: prepared.map((row) => row.draft),
    snapshotHash: null,
  });

  for (const row of created.findings) {
    const match = prepared.find((item) => item.fingerprint === row.fingerprint);
    const openStatus = match?.draft.status || row.status;
    const carried = match?.carry;
    const prevMeta = (carried?.actualJson || {}) as Record<string, unknown>;
    await updateFindingRecord(orgId, row.id, {
      status: carried ? "VERIFIED_COMPLIANT" : row.status,
      actualJson: {
        value: jsonValue(row.actualJson) || match?.draft.actual_value || "",
        openStatus,
        resolution: carried ? "force_closed" : null,
        resolutionNote: carried ? prevMeta.resolutionNote ?? null : null,
        resolvedAt: carried ? prevMeta.resolvedAt ?? new Date().toISOString() : null,
        resolvedBy: carried ? prevMeta.resolvedBy ?? null : null,
      },
    });
  }

  const finalStatus = await recompute(orgId, propertyId, userId || null);
  const findings = await listFindings(orgId, propertyId, { assessmentId: created.assessment.id });
  const openAlertCount = findings.filter((f) =>
    complianceFindingIsOpen({ status: f.status, resolution: resolutionOf(f.actualJson) }),
  ).length;

  return {
    assessment: created.assessment,
    findings,
    overallStatus: finalStatus,
    openAlertCount,
    alertCount: findings.length,
  };
}

export async function resolveComplianceFinding(input: {
  orgId: string;
  findingId: string;
  userId: string;
  action: "recheck" | "force" | "reopen";
  note?: string | null;
}) {
  const finding = await getFinding(input.orgId, input.findingId);
  if (!finding || !finding.propertyId) return null;

  const property = await appStorage.getProperty(finding.propertyId);
  if (!property || property.organizationId !== input.orgId) return null;

  const latest = await getLatestAssessment(input.orgId, finding.propertyId);
  if (!latest || latest.id !== finding.assessmentId || latest.runReason !== COMPLIANCE_RUN_REASON) {
    throw Object.assign(new Error("Run assessment again before changing this alert"), {
      status: 400,
    });
  }

  const prev = (finding.actualJson || {}) as Record<string, unknown>;
  const openStatus =
    typeof prev.openStatus === "string" && prev.openStatus
      ? prev.openStatus
      : finding.status;

  if (input.action === "force") {
    const note = String(input.note || "").trim();
    if (!note) {
      throw Object.assign(new Error("Add a short note to resolve this alert"), { status: 400 });
    }
    const updated = await updateFindingRecord(input.orgId, finding.id, {
      status: "VERIFIED_COMPLIANT",
      actualJson: {
        ...prev,
        value: jsonValue(finding.actualJson),
        openStatus,
        resolution: "force_closed",
        resolutionNote: note,
        resolvedAt: new Date().toISOString(),
        resolvedBy: input.userId,
      },
    });
    const overallStatus = await recompute(input.orgId, finding.propertyId, input.userId);
    await writeHmoAuditEvent({
      organizationId: input.orgId,
      actorType: "user",
      actorId: input.userId,
      action: "hmo.alert.force_closed",
      entityType: "hmo_finding",
      entityId: finding.id,
      metadata: { note, overallStatus },
    });
    return { stillFailing: false, message: null, overallStatus, finding: updated };
  }

  if (input.action === "reopen") {
    const updated = await updateFindingRecord(input.orgId, finding.id, {
      status: openStatus,
      actualJson: {
        ...prev,
        value: jsonValue(finding.actualJson),
        openStatus,
        resolution: null,
        resolutionNote: null,
        resolvedAt: null,
        resolvedBy: null,
      },
    });
    const overallStatus = await recompute(input.orgId, finding.propertyId, input.userId);
    await writeHmoAuditEvent({
      organizationId: input.orgId,
      actorType: "user",
      actorId: input.userId,
      action: "hmo.alert.reopened",
      entityType: "hmo_finding",
      entityId: finding.id,
      metadata: { overallStatus },
    });
    return { stillFailing: true, message: finding.explanation, overallStatus, finding: updated };
  }

  const { drafts } = await buildDrafts({ orgId: input.orgId, propertyId: finding.propertyId });
  const match = drafts.find(
    (d) => d.check_id === finding.checkId && d.subject_id === finding.subjectRef,
  );
  if (!match) {
    const updated = await updateFindingRecord(input.orgId, finding.id, {
      status: "VERIFIED_COMPLIANT",
      explanation: "This check now passes.",
      actualJson: {
        ...prev,
        value: jsonValue(finding.actualJson),
        openStatus,
        resolution: "recheck_passed",
        resolutionNote: null,
        resolvedAt: new Date().toISOString(),
        resolvedBy: input.userId,
      },
    });
    const overallStatus = await recompute(input.orgId, finding.propertyId, input.userId);
    await writeHmoAuditEvent({
      organizationId: input.orgId,
      actorType: "user",
      actorId: input.userId,
      action: "hmo.alert.recheck_passed",
      entityType: "hmo_finding",
      entityId: finding.id,
      metadata: { overallStatus },
    });
    return { stillFailing: false, message: null, overallStatus, finding: updated };
  }

  const updated = await updateFindingRecord(input.orgId, finding.id, {
    status: match.status,
    explanation: match.reason,
    requiredJson: { value: match.required_value },
    actualJson: {
      value: match.actual_value,
      openStatus: match.status,
      resolution: null,
      resolutionNote: null,
      resolvedAt: null,
      resolvedBy: null,
    },
  });
  const overallStatus = await recompute(input.orgId, finding.propertyId, input.userId);
  return {
    stillFailing: true,
    message: match.reason,
    overallStatus,
    finding: updated,
  };
}
