/** HMO Compliance Intelligence — shared vocabularies and contracts. */

export const HMO_CHECK_IDS = [
  "LIC-01",
  "LIC-02",
  "LIC-03",
  "LIC-04",
  "LIC-05",
  "OCC-01",
  "OCC-02",
  "OCC-03",
  "ROOM-01",
  "ROOM-02",
  "AMEN-01",
  "SAF-01",
  "COND-01",
  "LOC-01",
  "PLAN-01",
  "MGMT-01",
] as const;

export type HmoCheckId = (typeof HMO_CHECK_IDS)[number];

export const HMO_FINDING_STATUSES = [
  "VERIFIED_COMPLIANT",
  "CONFIRMED_NON_COMPLIANT",
  "POTENTIAL_RISK",
  "EVIDENCE_MISSING",
  "NOT_APPLICABLE",
  "REQUIRES_HUMAN_REVIEW",
] as const;

export type HmoFindingStatus = (typeof HMO_FINDING_STATUSES)[number];

export const HMO_SEVERITIES = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFORMATIONAL",
] as const;

export type HmoSeverity = (typeof HMO_SEVERITIES)[number];

export const HMO_PROPERTY_STATUSES = [
  "CRITICAL_EXCEPTION",
  "ACTION_REQUIRED",
  "REVIEW_REQUIRED",
  "VERIFIED_COMPLIANT",
  "NOT_ASSESSED",
] as const;

export type HmoPropertyStatus = (typeof HMO_PROPERTY_STATUSES)[number];

export const HMO_CASE_STATES = [
  "OPEN",
  "TRIAGED",
  "IN_PROGRESS",
  "AWAITING_EVIDENCE",
  "AWAITING_REVIEW",
  "READY_FOR_SIGNOFF",
  "VERIFIED_CLOSED",
  "REOPENED",
  "CANCELLED_AS_DUPLICATE",
] as const;

export type HmoCaseState = (typeof HMO_CASE_STATES)[number];

export const HMO_TASK_STATES = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "EVIDENCE_REQUESTED",
  "EVIDENCE_RECEIVED",
  "AWAITING_VERIFICATION",
  "VERIFIED_CLOSED",
  "REOPENED",
  "CANCELLED",
] as const;

export type HmoTaskState = (typeof HMO_TASK_STATES)[number];

export const HMO_LICENCE_LIFECYCLE = [
  "DRAFT",
  "CURRENT",
  "EXPIRED_DOCUMENT",
  "RENEWAL_PENDING_EVIDENCE",
  "SUPERSEDED",
  "UNDER_REVIEW",
] as const;

export type HmoLicenceLifecycle = (typeof HMO_LICENCE_LIFECYCLE)[number];

export const HMO_PERMISSIONS = [
  "hmo.case.read",
  "hmo.case.assign",
  "hmo.case.write",
  "hmo.critical.close",
  "hmo.rule.approve",
  "hmo.occupancy.read",
  "hmo.notification.send",
  "hmo.licence.upload",
  "hmo.licence.confirm",
  "hmo.assessment.run",
] as const;

export type HmoPermission = (typeof HMO_PERMISSIONS)[number];

export type HmoExtractedField<T = string | number | null> = {
  value: T;
  confidence?: number | null;
  source_pages?: number[];
};

export type HmoLicenceExtraction = {
  document_id: string;
  document_type: "HMO_LICENCE" | string;
  extraction_version: string;
  property_address: HmoExtractedField<string | null>;
  licence_number: HmoExtractedField<string | null>;
  issuing_authority: HmoExtractedField<string | null>;
  issue_date: HmoExtractedField<string | null>;
  expiry_date: HmoExtractedField<string | null>;
  maximum_individuals: HmoExtractedField<number | null>;
  holder_name?: HmoExtractedField<string | null>;
  manager_name?: HmoExtractedField<string | null>;
  conditions: Array<{
    condition_text: string;
    source_pages?: number[];
    normalisation_status?: string;
  }>;
  referenced_missing_attachments: string[];
  warnings: string[];
};

export type HmoFindingDraft = {
  check_id: HmoCheckId;
  subject_id: string;
  rule_version_id: string | null;
  status: HmoFindingStatus;
  severity: HmoSeverity;
  actual_value: string;
  required_value: string;
  reason: string;
  evidence_refs: Array<{ document_id?: string; page?: number }>;
  confidence: number;
  human_review_required: boolean;
  suggested_action_code: string;
};

export type PreTenancyDecision =
  | "ALLOW_FOR_CHECKED_CONSTRAINTS"
  | "BLOCK_REVIEW_REQUIRED"
  | "INSUFFICIENT_EVIDENCE";

/** England national sleeping-room floor-area baselines (Housing Act 2004 Sch.4 ¶1A). */
export const ENGLAND_SLEEPING_ROOM_BASELINES = {
  onePersonAged10OrAboveM2: 6.51,
  twoPersonsAged10OrAboveM2: 10.22,
  oneChildUnder10M2: 4.64,
  minSleepingRoomM2: 4.64,
  ignoreFloorAreaBelowCeilingM: 1.5,
  ruleCode: "ENG-HA2004-SCH4-1A",
  sourceUrl:
    "https://www.legislation.gov.uk/ukpga/2004/34/schedule/4/paragraph/1A",
} as const;
