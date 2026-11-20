import {
  ENGLAND_SLEEPING_ROOM_BASELINES,
  type HmoFindingDraft,
  type HmoLicenceExtraction,
  type HmoPropertyStatus,
} from "./types";

/**
 * Proven-breach assessment for the property badge.
 * Passing checks are omitted. Conditions we cannot compare to property data
 * are omitted and do not block Compliant.
 */

export type ComplianceRoomInput = {
  roomId: string;
  roomName?: string | null;
  roomType?: string | null;
  usableAreaM2: number | null;
  ceilingHeightM?: number | null;
  /** People the room is recorded as permitting. Used for the national size band. */
  declaredOccupancy?: number | null;
  sleepingApproved?: boolean | null;
  humanConfirmed: boolean;
};

export type ComplianceSafetyEvidence = {
  kind: "gas" | "electrical" | "fire";
  label: string;
  present: boolean;
  expiresAt?: string | null;
};

export type ProvenComplianceInput = {
  propertyId: string;
  extraction: HmoLicenceExtraction;
  documentId: string;
  asOf?: Date;
  /** Column fallback when the extraction field is empty. */
  maxPersons?: number | null;
  expiryDate?: string | null;
  confirmedPersons: number | null;
  rooms: ComplianceRoomInput[];
  /** Pass an array after documents were looked up. Omit to skip safety checks. */
  safetyEvidence?: ComplianceSafetyEvidence[] | null;
};

export type SizeRule = { min: number; strict: boolean };

const AREA_UNIT =
  /(\d+(?:\.\d+)?)\s*(?:m²|m2|sq\.?\s*m(?:etres|eters)?|square\s+met(?:re|er)s)/i;
const MIN_WORDS =
  /at least|minimum|min\.|not less than|no smaller than|not smaller than|greater than|more than|must be|shall be|should be/i;
const ROOM_CTX =
  /sleeping|bedroom|bed\s*room|habitable|floor\s*area|usable\s*area|room\s*size/i;

function draft(
  partial: Omit<HmoFindingDraft, "rule_version_id" | "evidence_refs" | "confidence"> &
    Partial<Pick<HmoFindingDraft, "rule_version_id" | "evidence_refs" | "confidence">>,
): HmoFindingDraft {
  return {
    rule_version_id: null,
    evidence_refs: [],
    confidence: 0.95,
    ...partial,
  };
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Calendar day YYYY-MM-DD. Date-only values stay on that day. */
export function calendarDay(value: unknown, asOfFallback?: Date): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return asOfFallback ? null : null;
  return parsed.toISOString().slice(0, 10);
}

function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function sentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.;])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isStrict(sentence: string): boolean {
  return (
    /greater than|more than/i.test(sentence) && !/or greater|or more|at least/i.test(sentence)
  );
}

export function parseRoomSizeRule(text: string): SizeRule | null {
  let best: SizeRule | null = null;
  for (const sentence of sentences(text)) {
    if (!ROOM_CTX.test(sentence) || !MIN_WORDS.test(sentence)) continue;
    const match = sentence.match(AREA_UNIT);
    if (!match) continue;
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n <= 0 || n > 200) continue;
    const strict = isStrict(sentence);
    if (!best || n > best.min || (n === best.min && strict)) {
      best = { min: n, strict };
    }
  }
  return best;
}

export function parseCeilingRule(text: string): SizeRule | null {
  let best: SizeRule | null = null;
  for (const sentence of sentences(text)) {
    if (!/ceiling/i.test(sentence) || !MIN_WORDS.test(sentence)) continue;
    const match = sentence.match(/(\d+(?:\.\d+)?)\s*(?:metres|meters|m)\b/i);
    if (!match) continue;
    const after = sentence.slice((match.index || 0) + match[0].length, (match.index || 0) + match[0].length + 2);
    if (/^2|²/i.test(after)) continue;
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n < 1.5 || n > 5) continue;
    const strict = isStrict(sentence);
    if (!best || n > best.min || (n === best.min && strict)) {
      best = { min: n, strict };
    }
  }
  return best;
}

function below(actual: number, rule: SizeRule): boolean {
  return rule.strict ? actual <= rule.min : actual < rule.min;
}

function rulePhrase(rule: SizeRule, unit: string): string {
  return rule.strict ? `greater than ${rule.min} ${unit}` : `at least ${rule.min} ${unit}`;
}

function conditionText(extraction: HmoLicenceExtraction): string {
  return (extraction.conditions || [])
    .map((c) => `${c.condition_text || ""} ${c.original_text || ""}`.trim())
    .filter(Boolean)
    .join("\n");
}

export type SafetyKind = "gas" | "electrical" | "fire";

export function safetyKindsRequired(extraction: HmoLicenceExtraction): SafetyKind[] {
  const out = new Set<SafetyKind>();
  for (const c of extraction.conditions || []) {
    const text = `${c.condition_text || ""} ${c.original_text || ""}`;
    const cat = String(c.category || "").toLowerCase();
    if (cat === "gas" || /gas\s+safety|\bgas\s+certificate\b|\bcp12\b/i.test(text)) {
      out.add("gas");
    }
    if (
      cat === "electrical" ||
      /\beicr\b|electrical\s+(safety|certificate|installation)/i.test(text)
    ) {
      out.add("electrical");
    }
    if (/\bfire\s+(alarm|certificate|risk)|smoke\s+alarm|heat\s+detector/i.test(text)) {
      out.add("fire");
    }
  }
  return [...out];
}

function normName(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a));
}

function isSleepingRoom(room: ComplianceRoomInput): boolean {
  if (room.sleepingApproved === false) return false;
  const label = `${room.roomName || ""} ${room.roomType || ""}`.toLowerCase();
  if (/bed|sleep/.test(label)) return true;
  if (
    /kitchen|bath|wc|toilet|shower|ensuite|en-suite|living|lounge|hall|store|cupboard|utility|dining/.test(
      label,
    )
  ) {
    return false;
  }
  return true;
}

function nationalMinM2(occupants: number): number {
  if (occupants >= 2) return ENGLAND_SLEEPING_ROOM_BASELINES.twoPersonsAged10OrAboveM2;
  if (occupants <= 0) return ENGLAND_SLEEPING_ROOM_BASELINES.oneChildUnder10M2;
  return ENGLAND_SLEEPING_ROOM_BASELINES.onePersonAged10OrAboveM2;
}

function roomLabel(room: ComplianceRoomInput): string {
  return room.roomName?.trim() || "Sleeping room";
}

export function evaluateProvenCompliance(input: ProvenComplianceInput): HmoFindingDraft[] {
  const findings: HmoFindingDraft[] = [];
  const { extraction, propertyId, documentId } = input;
  const asOf = input.asOf || new Date();
  const today = calendarDay(asOf) || asOf.toISOString().slice(0, 10);
  const evidence = [{ document_id: documentId }];

  const expiryRaw =
    extraction.expiry_date?.value != null && String(extraction.expiry_date.value).trim()
      ? extraction.expiry_date.value
      : input.expiryDate;
  const expiryDay = calendarDay(expiryRaw);
  if (expiryDay && expiryDay < today) {
    findings.push(
      draft({
        check_id: "LIC-03",
        subject_id: propertyId,
        status: "CONFIRMED_NON_COMPLIANT",
        severity: "CRITICAL",
        actual_value: `Expired ${formatDay(expiryDay)}`,
        required_value: "Expiry date today or in the future",
        reason: `Licence expired on ${formatDay(expiryDay)}.`,
        human_review_required: false,
        suggested_action_code: "VERIFY_LICENSING_STATUS",
        evidence_refs: evidence,
      }),
    );
  }

  const maxPersons =
    asNumber(extraction.maximum_individuals?.value) ?? asNumber(input.maxPersons);
  const tenants = asNumber(input.confirmedPersons);
  if (maxPersons != null && tenants != null && tenants > maxPersons) {
    findings.push(
      draft({
        check_id: "OCC-01",
        subject_id: propertyId,
        status: "CONFIRMED_NON_COMPLIANT",
        severity: "CRITICAL",
        actual_value: `${tenants} active tenants`,
        required_value: `No more than ${maxPersons}`,
        reason: `${tenants} active tenants. The licence allows ${maxPersons}.`,
        human_review_required: false,
        suggested_action_code: "OCCUPANCY_REVIEW",
        evidence_refs: evidence,
      }),
    );
  }

  const prose = conditionText(extraction);
  const sizeRule = parseRoomSizeRule(prose);
  const ceilingRule = parseCeilingRule(prose);
  const licenceRooms = (extraction.rooms || []).filter(
    (r) => asNumber(r.floor_area_m2) != null && asNumber(r.floor_area_m2)! > 0,
  );
  const licenceStatesMinimum = Boolean(sizeRule) || licenceRooms.length > 0;

  const confirmedSleeping = input.rooms.filter(
    (r) =>
      r.humanConfirmed === true &&
      isSleepingRoom(r) &&
      asNumber(r.usableAreaM2) != null,
  );

  if (licenceStatesMinimum && confirmedSleeping.length === 0) {
    findings.push(
      draft({
        check_id: "ROOM-01",
        subject_id: propertyId,
        status: "EVIDENCE_MISSING",
        severity: "HIGH",
        actual_value: "No confirmed room size",
        required_value: sizeRule
          ? rulePhrase(sizeRule, "m²")
          : "Confirmed usable area for each sleeping room named on the licence",
        reason:
          "The licence states a room size, and no confirmed room measurement is saved. Tick Confirm m² on each sleeping room.",
        human_review_required: false,
        suggested_action_code: "MEASURE_SLEEPING_ROOMS",
        evidence_refs: evidence,
      }),
    );
  }

  for (const room of confirmedSleeping) {
    const area = asNumber(room.usableAreaM2)!;
    const ceiling = asNumber(room.ceilingHeightM);
    const occupants = asNumber(room.declaredOccupancy) ?? 1;
    const name = normName(room.roomName);
    const matched = licenceRooms.find((r) => namesMatch(name, normName(r.room_identifier)));
    const licenceArea = matched ? asNumber(matched.floor_area_m2) : null;

    const disregardArea =
      ceiling != null && ceiling < ENGLAND_SLEEPING_ROOM_BASELINES.ignoreFloorAreaBelowCeilingM;

    if (!disregardArea) {
      const national = nationalMinM2(occupants);
      const nationalRule: SizeRule = { min: national, strict: false };
      const absolute: SizeRule = {
        min: ENGLAND_SLEEPING_ROOM_BASELINES.minSleepingRoomM2,
        strict: false,
      };
      let required = nationalRule;
      let source = `the national minimum for ${occupants >= 2 ? `${occupants} people` : "one person"}`;
      if (below(area, absolute) && absolute.min >= required.min) {
        required = absolute;
        source = "the national minimum for a sleeping room";
      }
      if (sizeRule && (sizeRule.min > required.min || (sizeRule.min === required.min && sizeRule.strict))) {
        required = sizeRule;
        source = "the licence";
      }
      if (licenceArea != null) {
        const roomRule: SizeRule = { min: licenceArea, strict: false };
        if (roomRule.min > required.min) {
          required = roomRule;
          source = matched?.room_identifier
            ? `the size stated for ${matched.room_identifier} on the licence`
            : "the size stated on the licence";
        }
      }
      if (below(area, required)) {
        findings.push(
          draft({
            check_id: "ROOM-01",
            subject_id: room.roomId,
            status: "CONFIRMED_NON_COMPLIANT",
            severity: "HIGH",
            actual_value: `${area} m²`,
            required_value: rulePhrase(required, "m²"),
            reason: `${roomLabel(room)} is ${area} m². ${source[0]!.toUpperCase()}${source.slice(1)} requires ${rulePhrase(required, "m²")}.`,
            human_review_required: false,
            suggested_action_code: "MEASURE_SLEEPING_ROOMS",
            evidence_refs: evidence,
            rule_version_id:
              source.startsWith("the national") ? ENGLAND_SLEEPING_ROOM_BASELINES.ruleCode : null,
          }),
        );
      }
    }

    if (ceilingRule && ceiling != null && below(ceiling, ceilingRule)) {
      findings.push(
        draft({
          check_id: "ROOM-01",
          subject_id: `${room.roomId}#ceiling`,
          status: "CONFIRMED_NON_COMPLIANT",
          severity: "HIGH",
          actual_value: `${ceiling} m ceiling`,
          required_value: rulePhrase(ceilingRule, "m"),
          reason: `${roomLabel(room)} ceiling is ${ceiling} m. The licence requires ${rulePhrase(ceilingRule, "m")}.`,
          human_review_required: false,
          suggested_action_code: "MEASURE_SLEEPING_ROOMS",
          evidence_refs: evidence,
        }),
      );
    }

    const authorised = matched ? asNumber(matched.authorised_occupants) : null;
    const declared = asNumber(room.declaredOccupancy);
    if (authorised != null && declared != null && declared > authorised) {
      findings.push(
        draft({
          check_id: "OCC-03",
          subject_id: room.roomId,
          status: "CONFIRMED_NON_COMPLIANT",
          severity: "HIGH",
          actual_value: `${declared} people`,
          required_value: `No more than ${authorised}`,
          reason: `${roomLabel(room)} is recorded as permitting ${declared} people. The licence allows ${authorised} in that room.`,
          human_review_required: false,
          suggested_action_code: "OCCUPANCY_REVIEW",
          evidence_refs: evidence,
        }),
      );
    }
  }

  if (input.safetyEvidence) {
    const required = safetyKindsRequired(extraction);
    for (const kind of required) {
      const hit = input.safetyEvidence.find((s) => s.kind === kind);
      const label = hit?.label || `${kind[0]!.toUpperCase()}${kind.slice(1)} safety`;
      if (!hit || !hit.present) {
        findings.push(
          draft({
            check_id: "SAF-01",
            subject_id: kind,
            status: "CONFIRMED_NON_COMPLIANT",
            severity: "HIGH",
            actual_value: "Not on file",
            required_value: `${label} required by the licence`,
            reason: `${label} is required by the licence and no certificate is on file.`,
            human_review_required: false,
            suggested_action_code: "COLLECT_EVIDENCE",
            evidence_refs: evidence,
          }),
        );
        continue;
      }
      const exp = calendarDay(hit.expiresAt);
      if (exp && exp < today) {
        findings.push(
          draft({
            check_id: "SAF-01",
            subject_id: kind,
            status: "CONFIRMED_NON_COMPLIANT",
            severity: "HIGH",
            actual_value: `Expired ${formatDay(exp)}`,
            required_value: "In-date certificate",
            reason: `${label} is required by the licence and the certificate expired on ${formatDay(exp)}.`,
            human_review_required: false,
            suggested_action_code: "COLLECT_EVIDENCE",
            evidence_refs: evidence,
          }),
        );
      }
    }
  }

  return findings;
}

export function complianceFindingIsOpen(input: {
  status: string;
  resolution?: string | null;
}): boolean {
  if (input.resolution === "force_closed" || input.resolution === "recheck_passed") return false;
  if (input.status === "VERIFIED_COMPLIANT" || input.status === "NOT_APPLICABLE") return false;
  return (
    input.status === "CONFIRMED_NON_COMPLIANT" ||
    input.status === "EVIDENCE_MISSING" ||
    input.status === "POTENTIAL_RISK" ||
    input.status === "REQUIRES_HUMAN_REVIEW"
  );
}

/** Badge status from the latest assessment only. Resolved alerts do not count. */
export function statusFromComplianceFindings(
  findings: Array<{ status: string; severity: string; resolution?: string | null }>,
): HmoPropertyStatus {
  const open = findings.filter((f) => complianceFindingIsOpen(f));
  if (open.length === 0) return "VERIFIED_COMPLIANT";
  if (
    open.some((f) => f.status === "CONFIRMED_NON_COMPLIANT" || f.severity === "CRITICAL")
  ) {
    return "ACTION_REQUIRED";
  }
  return "REVIEW_REQUIRED";
}
