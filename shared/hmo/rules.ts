import {
  ENGLAND_SLEEPING_ROOM_BASELINES,
  type HmoCheckId,
  type HmoFindingDraft,
  type HmoLicenceExtraction,
  type HmoPropertyStatus,
  type HmoFindingStatus,
  type HmoSeverity,
  type PreTenancyDecision,
} from "./types";

function normalizeAddress(raw: string | null | undefined): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function postcodeOf(raw: string | null | undefined): string | null {
  const m = String(raw || "")
    .toUpperCase()
    .match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/);
  return m ? m[1]!.replace(/\s+/g, " ") : null;
}

function draft(
  partial: Omit<HmoFindingDraft, "rule_version_id" | "evidence_refs" | "confidence"> &
    Partial<Pick<HmoFindingDraft, "rule_version_id" | "evidence_refs" | "confidence">>,
): HmoFindingDraft {
  return {
    rule_version_id: null,
    evidence_refs: [],
    confidence: 0.9,
    ...partial,
  };
}

export type LicenceAssessmentInput = {
  propertyId: string;
  propertyAddress: string | null;
  propertyUprn?: string | null;
  landlordName?: string | null;
  extraction: HmoLicenceExtraction;
  documentId: string;
  asOf?: Date;
};

/** Deterministic LIC-01..05 (+ stubs for remaining checks as EVIDENCE_MISSING). */
export function evaluateLicenceChecks(input: LicenceAssessmentInput): HmoFindingDraft[] {
  const { extraction, propertyId, propertyAddress, documentId } = input;
  const asOf = input.asOf || new Date();
  const findings: HmoFindingDraft[] = [];

  // LIC-01 address match
  const licAddr = extraction.property_address?.value || null;
  const normLic = normalizeAddress(licAddr);
  const normProp = normalizeAddress(propertyAddress);
  const pcLic = postcodeOf(licAddr);
  const pcProp = postcodeOf(propertyAddress);
  if (!normLic || !normProp) {
    findings.push(
      draft({
        check_id: "LIC-01",
        subject_id: propertyId,
        status: "REQUIRES_HUMAN_REVIEW",
        severity: "HIGH",
        actual_value: licAddr || "Missing licence address",
        required_value: propertyAddress || "Missing property address",
        reason: "Cannot verify address match without both licence and property addresses",
        human_review_required: true,
        suggested_action_code: "CONFIRM_PROPERTY_MATCH",
        evidence_refs: [{ document_id: documentId }],
        confidence: 0.5,
      }),
    );
  } else if (normLic === normProp || (normLic.includes(normProp) || normProp.includes(normLic))) {
    findings.push(
      draft({
        check_id: "LIC-01",
        subject_id: propertyId,
        status: "VERIFIED_COMPLIANT",
        severity: "INFORMATIONAL",
        actual_value: licAddr || "",
        required_value: propertyAddress || "",
        reason: "Licence address matches property record",
        human_review_required: false,
        suggested_action_code: "NONE",
        evidence_refs: [{ document_id: documentId }],
        confidence: extraction.property_address?.confidence ?? 0.9,
      }),
    );
  } else if (pcLic && pcProp && pcLic === pcProp) {
    findings.push(
      draft({
        check_id: "LIC-01",
        subject_id: propertyId,
        status: "REQUIRES_HUMAN_REVIEW",
        severity: "HIGH",
        actual_value: licAddr || "",
        required_value: propertyAddress || "",
        reason:
          "Postcodes match but full address does not — never auto-match on postcode alone; manual selection required",
        human_review_required: true,
        suggested_action_code: "CONFIRM_PROPERTY_MATCH",
        evidence_refs: [{ document_id: documentId }],
        confidence: 0.6,
      }),
    );
  } else {
    findings.push(
      draft({
        check_id: "LIC-01",
        subject_id: propertyId,
        status: "REQUIRES_HUMAN_REVIEW",
        severity: "CRITICAL",
        actual_value: licAddr || "",
        required_value: propertyAddress || "",
        reason: "Licence address does not match property; stop automatic linking",
        human_review_required: true,
        suggested_action_code: "CONFIRM_PROPERTY_MATCH",
        evidence_refs: [{ document_id: documentId }],
        confidence: 0.85,
      }),
    );
  }

  // LIC-02 issuer / number
  const licenceNo = extraction.licence_number?.value || null;
  const authority = extraction.issuing_authority?.value || null;
  if (!licenceNo || !authority) {
    findings.push(
      draft({
        check_id: "LIC-02",
        subject_id: propertyId,
        status: "EVIDENCE_MISSING",
        severity: "HIGH",
        actual_value: `number=${licenceNo ?? "null"}; authority=${authority ?? "null"}`,
        required_value: "Licence number and issuing authority",
        reason: "Upload is not independently authenticated; issuer/number incomplete",
        human_review_required: true,
        suggested_action_code: "VERIFY_LICENCE_AUTHENTICITY",
        evidence_refs: [{ document_id: documentId }],
      }),
    );
  } else {
    findings.push(
      draft({
        check_id: "LIC-02",
        subject_id: propertyId,
        status: "REQUIRES_HUMAN_REVIEW",
        severity: "MEDIUM",
        actual_value: `${authority} / ${licenceNo}`,
        required_value: "Issuer, number, scheme present with verification status",
        reason:
          "Fields extracted from upload; independent council authentication not performed",
        human_review_required: true,
        suggested_action_code: "VERIFY_LICENCE_AUTHENTICITY",
        evidence_refs: [{ document_id: documentId }],
        confidence: extraction.licence_number?.confidence ?? 0.9,
      }),
    );
  }

  // LIC-03 expiry
  const expiryRaw = extraction.expiry_date?.value || null;
  const expiry = expiryRaw ? new Date(expiryRaw) : null;
  if (!expiry || Number.isNaN(expiry.getTime())) {
    findings.push(
      draft({
        check_id: "LIC-03",
        subject_id: propertyId,
        status: "EVIDENCE_MISSING",
        severity: "HIGH",
        actual_value: String(expiryRaw),
        required_value: "Valid expiry date on current licensing position",
        reason: "Expiry date missing or invalid",
        human_review_required: true,
        suggested_action_code: "VERIFY_LICENSING_STATUS",
        evidence_refs: [{ document_id: documentId }],
      }),
    );
  } else if (expiry.getTime() < asOf.getTime()) {
    findings.push(
      draft({
        check_id: "LIC-03",
        subject_id: propertyId,
        status: "REQUIRES_HUMAN_REVIEW",
        severity: "CRITICAL",
        actual_value: `Uploaded document expires ${expiryRaw}`,
        required_value: "Current licensing position verified",
        reason:
          "Uploaded licence expired; current replacement/application not supplied — do not assert unlawful operation",
        human_review_required: true,
        suggested_action_code: "VERIFY_LICENSING_STATUS",
        evidence_refs: [{ document_id: documentId, page: 5 }],
        confidence: 0.99,
      }),
    );
  } else {
    findings.push(
      draft({
        check_id: "LIC-03",
        subject_id: propertyId,
        status: "VERIFIED_COMPLIANT",
        severity: "INFORMATIONAL",
        actual_value: `Expires ${expiryRaw}`,
        required_value: "Document within dated validity window",
        reason: "Uploaded document expiry is in the future (document status only)",
        human_review_required: false,
        suggested_action_code: "NONE",
        evidence_refs: [{ document_id: documentId }],
      }),
    );
  }

  // LIC-04 holder
  const holder = extraction.holder_name?.value || null;
  const landlord = input.landlordName || null;
  if (!holder) {
    findings.push(
      draft({
        check_id: "LIC-04",
        subject_id: propertyId,
        status: "EVIDENCE_MISSING",
        severity: "MEDIUM",
        actual_value: "Missing holder name",
        required_value: "Named licence holder / manager",
        reason: "Holder not extracted",
        human_review_required: true,
        suggested_action_code: "VERIFY_HOLDER_MANAGER",
        evidence_refs: [{ document_id: documentId }],
      }),
    );
  } else if (
    landlord &&
    normalizeAddress(holder) !== normalizeAddress(landlord) &&
    !normalizeAddress(holder).includes(normalizeAddress(landlord).split(" ")[0] || "")
  ) {
    findings.push(
      draft({
        check_id: "LIC-04",
        subject_id: propertyId,
        status: "POTENTIAL_RISK",
        severity: "HIGH",
        actual_value: holder,
        required_value: landlord,
        reason: "Licence holder differs from recorded landlord/contact — investigate",
        human_review_required: true,
        suggested_action_code: "VERIFY_HOLDER_MANAGER",
        evidence_refs: [{ document_id: documentId }],
      }),
    );
  } else {
    findings.push(
      draft({
        check_id: "LIC-04",
        subject_id: propertyId,
        status: "REQUIRES_HUMAN_REVIEW",
        severity: "LOW",
        actual_value: holder,
        required_value: landlord || "CRM holder/manager",
        reason: "Holder extracted; confirm against CRM management records",
        human_review_required: true,
        suggested_action_code: "VERIFY_HOLDER_MANAGER",
        evidence_refs: [{ document_id: documentId }],
      }),
    );
  }

  // LIC-05 missing schedules
  const missing = extraction.referenced_missing_attachments || [];
  if (missing.length > 0) {
    findings.push(
      draft({
        check_id: "LIC-05",
        subject_id: propertyId,
        status: "EVIDENCE_MISSING",
        severity: "HIGH",
        actual_value: missing.join("; "),
        required_value: "Complete schedules, annexes and licence variations",
        reason: "Referenced attachments/schedules are missing from the upload",
        human_review_required: true,
        suggested_action_code: "OBTAIN_FULL_CONDITIONS",
        evidence_refs: [{ document_id: documentId }],
        confidence: 0.95,
      }),
    );
  } else {
    findings.push(
      draft({
        check_id: "LIC-05",
        subject_id: propertyId,
        status: "VERIFIED_COMPLIANT",
        severity: "INFORMATIONAL",
        actual_value: "No missing attachment references detected",
        required_value: "Complete schedules present",
        reason: "No referenced missing attachments flagged by extraction",
        human_review_required: false,
        suggested_action_code: "NONE",
        evidence_refs: [{ document_id: documentId }],
      }),
    );
  }

  // Remaining checks — evidence missing until P2/P3 data exists
  const stubs: Array<{ id: HmoCheckId; label: string }> = [
    { id: "OCC-01", label: "Confirmed occupancy vs maximum" },
    { id: "OCC-02", label: "Household restrictions" },
    { id: "OCC-03", label: "Per-room occupancy" },
    { id: "ROOM-01", label: "Sleeping-room floor area" },
    { id: "ROOM-02", label: "Unauthorised room conversion" },
    { id: "AMEN-01", label: "Amenity provision" },
    { id: "SAF-01", label: "Safety certificates" },
    { id: "COND-01", label: "Condition / HHSRS hazards" },
    { id: "LOC-01", label: "Local licensing standards" },
    { id: "PLAN-01", label: "Planning authorisation" },
    { id: "MGMT-01", label: "Licence display / notices" },
  ];
  for (const s of stubs) {
    findings.push(
      draft({
        check_id: s.id,
        subject_id: propertyId,
        status: "EVIDENCE_MISSING",
        severity: "MEDIUM",
        actual_value: "Unknown",
        required_value: s.label,
        reason: `${s.label} not assessed — required property/evidence records not yet supplied`,
        human_review_required: true,
        suggested_action_code: "COLLECT_EVIDENCE",
        confidence: 1,
      }),
    );
  }

  return findings;
}

export function computeOverallPropertyStatus(
  findings: Array<{ status: HmoFindingStatus; severity: HmoSeverity }>,
): HmoPropertyStatus {
  if (!findings.length) return "NOT_ASSESSED";

  const hasCriticalReview = findings.some(
    (f) => f.severity === "CRITICAL" && f.status !== "VERIFIED_COMPLIANT" && f.status !== "NOT_APPLICABLE",
  );
  if (hasCriticalReview) return "CRITICAL_EXCEPTION";

  const hasNonCompliant = findings.some((f) => f.status === "CONFIRMED_NON_COMPLIANT");
  if (hasNonCompliant) return "ACTION_REQUIRED";

  const blockingUnknown = findings.some(
    (f) =>
      f.status === "EVIDENCE_MISSING" ||
      f.status === "REQUIRES_HUMAN_REVIEW" ||
      f.status === "POTENTIAL_RISK",
  );
  if (blockingUnknown) return "REVIEW_REQUIRED";

  const allOk = findings.every(
    (f) => f.status === "VERIFIED_COMPLIANT" || f.status === "NOT_APPLICABLE",
  );
  return allOk ? "VERIFIED_COMPLIANT" : "REVIEW_REQUIRED";
}

export function evidenceCompletenessPercent(
  findings: Array<{ status: HmoFindingStatus }>,
): number {
  if (!findings.length) return 0;
  const known = findings.filter(
    (f) => f.status !== "EVIDENCE_MISSING" && f.status !== "REQUIRES_HUMAN_REVIEW",
  ).length;
  return Math.round((known / findings.length) * 100);
}

export function findingFingerprint(
  propertyId: string,
  checkId: string,
  ruleVersionId: string | null,
  subjectRef: string,
): string {
  return [propertyId, checkId, ruleVersionId || "none", subjectRef].join("::");
}

export function evaluateSleepingRoomArea(opts: {
  usableAreaM2: number | null;
  ceilingHeightM?: number | null;
  occupantsAged10OrAbove: number;
  occupantsUnder10: number;
  localMinM2?: number | null;
}): HmoFindingDraft | null {
  const { usableAreaM2, ceilingHeightM, occupantsAged10OrAbove, occupantsUnder10, localMinM2 } =
    opts;
  if (usableAreaM2 == null || !Number.isFinite(usableAreaM2)) return null;

  if (
    ceilingHeightM != null &&
    Number.isFinite(ceilingHeightM) &&
    ceilingHeightM < ENGLAND_SLEEPING_ROOM_BASELINES.ignoreFloorAreaBelowCeilingM
  ) {
    return draft({
      check_id: "ROOM-01",
      subject_id: "room",
      status: "NOT_APPLICABLE",
      severity: "INFORMATIONAL",
      actual_value: `ceiling ${ceilingHeightM}m`,
      required_value: `Ignore floor area below ${ENGLAND_SLEEPING_ROOM_BASELINES.ignoreFloorAreaBelowCeilingM}m`,
      reason: "Floor area with ceiling height below 1.5 m is disregarded",
      human_review_required: false,
      suggested_action_code: "NONE",
      rule_version_id: ENGLAND_SLEEPING_ROOM_BASELINES.ruleCode,
    });
  }

  let required = ENGLAND_SLEEPING_ROOM_BASELINES.minSleepingRoomM2;
  if (occupantsAged10OrAbove >= 2) {
    required = ENGLAND_SLEEPING_ROOM_BASELINES.twoPersonsAged10OrAboveM2;
  } else if (occupantsAged10OrAbove === 1) {
    required = ENGLAND_SLEEPING_ROOM_BASELINES.onePersonAged10OrAboveM2;
  } else if (occupantsUnder10 >= 1) {
    required = ENGLAND_SLEEPING_ROOM_BASELINES.oneChildUnder10M2;
  }
  if (localMinM2 != null && localMinM2 > required) required = localMinM2;

  if (usableAreaM2 < ENGLAND_SLEEPING_ROOM_BASELINES.minSleepingRoomM2) {
    return draft({
      check_id: "ROOM-01",
      subject_id: "room",
      status: "POTENTIAL_RISK",
      severity: "CRITICAL",
      actual_value: `${usableAreaM2} m²`,
      required_value: `≥ ${ENGLAND_SLEEPING_ROOM_BASELINES.minSleepingRoomM2} m² to sleep`,
      reason: "Room smaller than 4.64 m² cannot be used for sleeping under national baseline",
      human_review_required: true,
      suggested_action_code: "MEASURE_SLEEPING_ROOMS",
      rule_version_id: ENGLAND_SLEEPING_ROOM_BASELINES.ruleCode,
    });
  }

  if (usableAreaM2 < required) {
    return draft({
      check_id: "ROOM-01",
      subject_id: "room",
      status: "POTENTIAL_RISK",
      severity: "HIGH",
      actual_value: `${usableAreaM2} m²`,
      required_value: `≥ ${required} m² for declared occupancy`,
      reason:
        localMinM2 != null && localMinM2 >= required
          ? "Below applicable local and/or national sleeping-room minimum"
          : "Below applicable national sleeping-room minimum for declared occupancy",
      human_review_required: true,
      suggested_action_code: "MEASURE_SLEEPING_ROOMS",
      rule_version_id: ENGLAND_SLEEPING_ROOM_BASELINES.ruleCode,
    });
  }

  return draft({
    check_id: "ROOM-01",
    subject_id: "room",
    status: "VERIFIED_COMPLIANT",
    severity: "INFORMATIONAL",
    actual_value: `${usableAreaM2} m²`,
    required_value: `≥ ${required} m²`,
    reason: "Measured usable area meets applicable baseline for declared occupancy",
    human_review_required: false,
    suggested_action_code: "NONE",
    rule_version_id: ENGLAND_SLEEPING_ROOM_BASELINES.ruleCode,
  });
}

export function evaluateOccupancyTotal(opts: {
  propertyId: string;
  maxPersons: number | null;
  confirmedPersons: number | null;
}): HmoFindingDraft {
  const { propertyId, maxPersons, confirmedPersons } = opts;
  if (confirmedPersons == null || !Number.isFinite(confirmedPersons)) {
    return draft({
      check_id: "OCC-01",
      subject_id: propertyId,
      status: "EVIDENCE_MISSING",
      severity: "HIGH",
      actual_value: "Unknown",
      required_value: maxPersons != null ? `≤ ${maxPersons}` : "Applicable maximum",
      reason: "Occupant count unknown — never compare against 0",
      human_review_required: true,
      suggested_action_code: "VERIFY_OCCUPANTS",
    });
  }
  if (maxPersons == null || !Number.isFinite(maxPersons)) {
    return draft({
      check_id: "OCC-01",
      subject_id: propertyId,
      status: "EVIDENCE_MISSING",
      severity: "HIGH",
      actual_value: String(confirmedPersons),
      required_value: "Authoritative licence maximum",
      reason: "Maximum individuals not established",
      human_review_required: true,
      suggested_action_code: "VERIFY_LICENSING_STATUS",
    });
  }
  if (confirmedPersons > maxPersons) {
    return draft({
      check_id: "OCC-01",
      subject_id: propertyId,
      status: "POTENTIAL_RISK",
      severity: "CRITICAL",
      actual_value: String(confirmedPersons),
      required_value: `≤ ${maxPersons}`,
      reason: "Confirmed persons exceed applicable maximum — critical occupancy review",
      human_review_required: true,
      suggested_action_code: "OCCUPANCY_REVIEW",
    });
  }
  return draft({
    check_id: "OCC-01",
    subject_id: propertyId,
    status: "VERIFIED_COMPLIANT",
    severity: "INFORMATIONAL",
    actual_value: String(confirmedPersons),
    required_value: `≤ ${maxPersons}`,
    reason: "Total-only occupancy check passes; room and licence validation remain independent",
    human_review_required: false,
    suggested_action_code: "NONE",
  });
}

export function evaluatePreTenancyCheck(opts: {
  maxPersons: number | null;
  confirmedPersons: number | null;
  proposedAdditional: number;
  roomEvidenceComplete: boolean;
}): { decision: PreTenancyDecision; reason: string } {
  const { maxPersons, confirmedPersons, proposedAdditional, roomEvidenceComplete } = opts;
  if (maxPersons == null || confirmedPersons == null || !roomEvidenceComplete) {
    return {
      decision: "INSUFFICIENT_EVIDENCE",
      reason: "Licence maximum, verified occupants, or room evidence incomplete",
    };
  }
  if (confirmedPersons + proposedAdditional > maxPersons) {
    return {
      decision: "BLOCK_REVIEW_REQUIRED",
      reason: "Proposed allocation would exceed verified licence maximum",
    };
  }
  return {
    decision: "ALLOW_FOR_CHECKED_CONSTRAINTS",
    reason: "Allocation within checked total-occupancy constraint only — not a legal certification",
  };
}
