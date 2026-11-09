import assert from "node:assert/strict";
import type { HmoLicenceExtraction } from "./types";
import {
  computeOverallPropertyStatus,
  evaluateLicenceChecks,
  evaluateOccupancyTotal,
  evaluatePreTenancyCheck,
  evaluateSleepingRoomArea,
  evidenceCompletenessPercent,
  findingFingerprint,
} from "./rules";

function sampleExtraction(overrides: Partial<HmoLicenceExtraction> = {}): HmoLicenceExtraction {
  return {
    document_id: "doc-38-park-view",
    document_type: "HMO_LICENCE",
    extraction_version: "test",
    property_address: { value: "38 Park View, Acton, W3 0PT", confidence: 0.9 },
    licence_number: { value: "19LIC1842", confidence: 0.95 },
    issuing_authority: { value: "London Borough of Ealing", confidence: 0.95 },
    issue_date: { value: "2021-01-14", confidence: 0.9 },
    expiry_date: { value: "2026-01-13", confidence: 0.95 },
    maximum_individuals: { value: 5, confidence: 0.9 },
    holder_name: { value: "Ms Jasbir Sihota", confidence: 0.9 },
    conditions: [],
    referenced_missing_attachments: [
      "Licence conditions / schedules / annexes referenced but not included in upload",
    ],
    warnings: [],
    ...overrides,
  };
}

// AT-style LIC-03 expired
{
  const findings = evaluateLicenceChecks({
    propertyId: "prop-1",
    propertyAddress: "38 Park View, Acton, W3 0PT",
    extraction: sampleExtraction({ expiry_date: { value: "2020-01-01", confidence: 0.99 } }),
    documentId: "doc-38-park-view",
    asOf: new Date("2026-11-05"),
  });
  const lic03 = findings.find((f) => f.check_id === "LIC-03");
  assert.ok(lic03, "LIC-03 present");
  assert.equal(lic03!.severity, "CRITICAL");
  assert.equal(lic03!.status, "REQUIRES_HUMAN_REVIEW");
  assert.match(lic03!.reason, /expired/i);
}

// AT-style LIC-05 missing schedules
{
  const findings = evaluateLicenceChecks({
    propertyId: "prop-1",
    propertyAddress: "38 Park View, Acton, W3 0PT",
    extraction: sampleExtraction(),
    documentId: "doc-38-park-view",
  });
  const lic05 = findings.find((f) => f.check_id === "LIC-05");
  assert.ok(lic05);
  assert.equal(lic05!.status, "EVIDENCE_MISSING");
  assert.equal(lic05!.severity, "HIGH");
}

// OCC unknown — never treat as 0
{
  const occ = evaluateOccupancyTotal({
    propertyId: "prop-1",
    maxPersons: 5,
    confirmedPersons: null,
  });
  assert.equal(occ.check_id, "OCC-01");
  assert.equal(occ.status, "EVIDENCE_MISSING");
  assert.equal(occ.actual_value, "Unknown");
  assert.match(occ.reason, /never compare against 0/i);
}

// Room 6.4 m² below 6.51 single adult baseline
{
  const room = evaluateSleepingRoomArea({
    usableAreaM2: 6.4,
    occupantsAged10OrAbove: 1,
    occupantsUnder10: 0,
  });
  assert.ok(room);
  assert.equal(room!.check_id, "ROOM-01");
  assert.equal(room!.status, "POTENTIAL_RISK");
  assert.equal(room!.severity, "HIGH");
  assert.match(room!.required_value, /6\.51/);
}

// Room below absolute 4.64 m²
{
  const tiny = evaluateSleepingRoomArea({
    usableAreaM2: 4.0,
    occupantsAged10OrAbove: 1,
    occupantsUnder10: 0,
  });
  assert.ok(tiny);
  assert.equal(tiny!.severity, "CRITICAL");
}

// Pre-tenancy insufficient evidence
{
  const blocked = evaluatePreTenancyCheck({
    maxPersons: null,
    confirmedPersons: 2,
    proposedAdditional: 1,
    roomEvidenceComplete: true,
  });
  assert.equal(blocked.decision, "INSUFFICIENT_EVIDENCE");

  const over = evaluatePreTenancyCheck({
    maxPersons: 5,
    confirmedPersons: 5,
    proposedAdditional: 1,
    roomEvidenceComplete: true,
  });
  assert.equal(over.decision, "BLOCK_REVIEW_REQUIRED");

  const ok = evaluatePreTenancyCheck({
    maxPersons: 5,
    confirmedPersons: 3,
    proposedAdditional: 1,
    roomEvidenceComplete: true,
  });
  assert.equal(ok.decision, "ALLOW_FOR_CHECKED_CONSTRAINTS");
}

// Overall status from expired + missing
{
  const findings = evaluateLicenceChecks({
    propertyId: "prop-1",
    propertyAddress: "38 Park View, Acton, W3 0PT",
    extraction: sampleExtraction({ expiry_date: { value: "2020-01-01" } }),
    documentId: "doc-x",
    asOf: new Date("2026-11-05"),
  });
  const overall = computeOverallPropertyStatus(findings);
  assert.equal(overall, "CRITICAL_EXCEPTION");

  const completeness = evidenceCompletenessPercent(findings);
  assert.ok(completeness >= 0 && completeness <= 100);

  const fp = findingFingerprint("prop-1", "LIC-03", null, "prop-1");
  assert.equal(fp, "prop-1::LIC-03::none::prop-1");
}

console.log("shared/hmo/rules.test.ts: all assertions passed");
