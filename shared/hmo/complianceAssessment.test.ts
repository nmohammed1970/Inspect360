import assert from "node:assert/strict";
import type { HmoLicenceExtraction } from "./types";
import {
  evaluateProvenCompliance,
  parseRoomSizeRule,
  statusFromComplianceFindings,
  type ComplianceRoomInput,
} from "./complianceAssessment";

function extraction(overrides: Partial<HmoLicenceExtraction> = {}): HmoLicenceExtraction {
  return {
    document_id: "doc-1",
    document_type: "HMO_LICENCE",
    extraction_version: "test",
    property_address: { value: "38 Park View, Acton, W3 0PT" },
    licence_number: { value: "19LIC1842" },
    issuing_authority: { value: "Ealing Council" },
    issue_date: { value: "2021-01-14" },
    expiry_date: { value: "2027-01-13" },
    maximum_individuals: { value: 5 },
    conditions: [],
    referenced_missing_attachments: [],
    warnings: [],
    rooms: [],
    ...overrides,
  };
}

const asOf = new Date("2026-11-20T12:00:00Z");

function room(partial: Partial<ComplianceRoomInput> & { roomId: string }): ComplianceRoomInput {
  return {
    roomName: "Bedroom 1",
    roomType: "bedroom",
    usableAreaM2: 8,
    ceilingHeightM: 2.3,
    declaredOccupancy: 1,
    sleepingApproved: true,
    humanConfirmed: true,
    ...partial,
  };
}

function ids(findings: { check_id: string; subject_id: string }[]) {
  return findings.map((f) => `${f.check_id}:${f.subject_id}`).sort();
}

{
  const findings = evaluateProvenCompliance({
    propertyId: "prop-1",
    extraction: extraction(),
    documentId: "doc-1",
    asOf,
    confirmedPersons: 4,
    rooms: [room({ roomId: "r1" })],
    safetyEvidence: [],
  });
  assert.deepEqual(findings, [], "clean licence produces no alerts");
}

{
  const findings = evaluateProvenCompliance({
    propertyId: "prop-1",
    extraction: extraction({ expiry_date: { value: "2026-01-13" } }),
    documentId: "doc-1",
    asOf,
    confirmedPersons: 5,
    rooms: [room({ roomId: "r1" })],
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.check_id, "LIC-03");
  assert.match(findings[0]!.reason, /13 January 2026/);
}

{
  const findings = evaluateProvenCompliance({
    propertyId: "prop-1",
    extraction: extraction({ expiry_date: { value: "2026-11-20" } }),
    documentId: "doc-1",
    asOf,
    confirmedPersons: 5,
    rooms: [room({ roomId: "r1" })],
  });
  assert.equal(findings.length, 0, "expiry today is still valid");
}

{
  const findings = evaluateProvenCompliance({
    propertyId: "prop-1",
    extraction: extraction(),
    documentId: "doc-1",
    asOf,
    confirmedPersons: 6,
    rooms: [room({ roomId: "r1" })],
  });
  assert.equal(findings[0]!.check_id, "OCC-01");
  assert.match(findings[0]!.reason, /allows 5/);
}

{
  const findings = evaluateProvenCompliance({
    propertyId: "prop-1",
    extraction: extraction(),
    documentId: "doc-1",
    asOf,
    confirmedPersons: null,
    rooms: [room({ roomId: "r1", usableAreaM2: 4 })],
  });
  assert.ok(findings.every((f) => f.check_id !== "OCC-01"), "unknown occupancy is not a proven breach");
}

{
  const findings = evaluateProvenCompliance({
    propertyId: "prop-1",
    extraction: extraction(),
    documentId: "doc-1",
    asOf,
    confirmedPersons: 1,
    rooms: [room({ roomId: "r1", usableAreaM2: 6.5, humanConfirmed: true })],
  });
  assert.equal(findings.filter((f) => f.check_id === "ROOM-01").length, 1);
}

{
  const findings = evaluateProvenCompliance({
    propertyId: "prop-1",
    extraction: extraction(),
    documentId: "doc-1",
    asOf,
    confirmedPersons: 1,
    rooms: [room({ roomId: "r1", usableAreaM2: 3, humanConfirmed: false })],
  });
  assert.equal(findings.length, 0, "unconfirmed floor-plan size is ignored");
}

{
  const findings = evaluateProvenCompliance({
    propertyId: "prop-1",
    extraction: extraction({
      conditions: [
        {
          condition_text: "Each sleeping room must be at least 10 m².",
          category: "occupancy",
        },
      ],
    }),
    documentId: "doc-1",
    asOf,
    confirmedPersons: 1,
    rooms: [room({ roomId: "r1", usableAreaM2: 8 })],
  });
  const roomAlert = findings.find((f) => f.check_id === "ROOM-01" && f.subject_id === "r1");
  assert.ok(roomAlert);
  assert.match(roomAlert!.reason, /at least 10 m²/);
}

{
  const findings = evaluateProvenCompliance({
    propertyId: "prop-1",
    extraction: extraction({
      rooms: [{ room_identifier: "Bedroom 1", floor_area_m2: 12, authorised_occupants: 1 }],
    }),
    documentId: "doc-1",
    asOf,
    confirmedPersons: 1,
    rooms: [],
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.status, "EVIDENCE_MISSING");
}

{
  const findings = evaluateProvenCompliance({
    propertyId: "prop-1",
    extraction: extraction({
      conditions: [
        { condition_text: "Provide a fire blanket in the kitchen.", category: "fire" },
      ],
    }),
    documentId: "doc-1",
    asOf,
    confirmedPersons: 1,
    rooms: [room({ roomId: "r1" })],
    safetyEvidence: [{ kind: "fire", label: "Fire safety", present: false }],
  });
  assert.equal(findings.length, 0, "uncheckable prose does not become an alert");
}

{
  const findings = evaluateProvenCompliance({
    propertyId: "prop-1",
    extraction: extraction({
      conditions: [{ condition_text: "Maintain a current gas safety certificate.", category: "gas" }],
    }),
    documentId: "doc-1",
    asOf,
    confirmedPersons: 1,
    rooms: [room({ roomId: "r1" })],
    safetyEvidence: [{ kind: "gas", label: "Gas safety", present: false }],
  });
  assert.deepEqual(ids(findings), ["SAF-01:gas"]);
}

{
  const findings = evaluateProvenCompliance({
    propertyId: "prop-1",
    extraction: extraction({
      conditions: [{ condition_text: "Gas safety certificate required.", category: "gas" }],
    }),
    documentId: "doc-1",
    asOf,
    confirmedPersons: 1,
    rooms: [room({ roomId: "r1" })],
    safetyEvidence: [
      { kind: "gas", label: "Gas safety", present: true, expiresAt: "2027-01-01" },
    ],
  });
  assert.equal(findings.length, 0);
}

{
  const rule = parseRoomSizeRule("Sleeping rooms shall be greater than 10 square metres.");
  assert.deepEqual(rule, { min: 10, strict: true });
  const findings = evaluateProvenCompliance({
    propertyId: "prop-1",
    extraction: extraction({
      conditions: [
        { condition_text: "Sleeping rooms shall be greater than 10 square metres." },
      ],
    }),
    documentId: "doc-1",
    asOf,
    confirmedPersons: 1,
    rooms: [room({ roomId: "r1", usableAreaM2: 10 })],
  });
  assert.equal(findings.length, 1);
}

assert.equal(
  statusFromComplianceFindings([]),
  "VERIFIED_COMPLIANT",
);
assert.equal(
  statusFromComplianceFindings([
    { status: "CONFIRMED_NON_COMPLIANT", severity: "CRITICAL", resolution: "force_closed" },
  ]),
  "VERIFIED_COMPLIANT",
);
assert.equal(
  statusFromComplianceFindings([
    { status: "CONFIRMED_NON_COMPLIANT", severity: "HIGH", resolution: null },
  ]),
  "ACTION_REQUIRED",
);
assert.equal(
  statusFromComplianceFindings([
    { status: "EVIDENCE_MISSING", severity: "HIGH", resolution: null },
  ]),
  "REVIEW_REQUIRED",
);

console.log("complianceAssessment.test.ts ok");
