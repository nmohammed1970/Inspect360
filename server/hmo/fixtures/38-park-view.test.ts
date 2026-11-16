import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { heuristicExtractLicence } from "../extraction";
import {
  computeOverallPropertyStatus,
  evaluateLicenceChecks,
  evidenceCompletenessPercent,
} from "@shared/hmo";
import { hashContent } from "../documentPipeline";
import { scoreAddressMatch } from "../addressMatcher";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureText = readFileSync(join(__dirname, "38-park-view-licence.txt"), "utf8");

{
  const extraction = heuristicExtractLicence(fixtureText, "doc-38-park-view");
  assert.equal(extraction.licence_number.value, "19LIC1842");
  assert.match(String(extraction.property_address.value || ""), /38\s+Park\s+View/i);
  assert.match(String(extraction.issuing_authority.value || ""), /Ealing/i);
  assert.equal(extraction.expiry_date.value, "2026-01-13");
  assert.equal(extraction.issue_date.value, "2021-01-14");
  assert.equal(extraction.maximum_individuals.value, 5);
  assert.match(String(extraction.holder_name.value || ""), /Jasbir\s+Sihota/i);
  assert.ok(
    (extraction.referenced_missing_attachments || []).length > 0,
    "schedules/conditions flagged missing",
  );
  assert.equal(hashContent(fixtureText).length, 64);
}

{
  const extraction = heuristicExtractLicence(fixtureText, "doc-38-park-view");
  const findings = evaluateLicenceChecks({
    propertyId: "prop-38",
    propertyAddress: "38 Park View, Acton, W3 0PT",
    extraction,
    documentId: "doc-38-park-view",
    asOf: new Date("2026-11-05"),
  });
  const lic03 = findings.find((f) => f.check_id === "LIC-03");
  const lic05 = findings.find((f) => f.check_id === "LIC-05");
  assert.ok(lic03);
  assert.equal(lic03!.severity, "CRITICAL");
  assert.equal(lic03!.status, "REQUIRES_HUMAN_REVIEW");
  assert.ok(lic05);
  assert.equal(lic05!.status, "EVIDENCE_MISSING");
  const overall = computeOverallPropertyStatus(findings);
  assert.notEqual(overall, "VERIFIED_COMPLIANT");
  assert.ok(evidenceCompletenessPercent(findings) < 100);
}

{
  const postcodeOnly = scoreAddressMatch({
    propertyAddress: "99 Other Street, Acton, W3 0PT",
    extractedAddress: "Somewhere Else, W3 0PT",
  });
  assert.equal(postcodeOnly.matched, false);
  assert.equal(postcodeOnly.requiresManualSelect, true);
  assert.equal(postcodeOnly.postcodeOnly, true);
}

console.log("38-park-view fixture tests OK");
