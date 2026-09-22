/**
 * Work-order certificate extraction helpers. Run with:
 * npx tsx shared/workOrderCertificates.test.ts
 */
import {
  parseCertificateExpiryDate,
  isAllowedCertificateMime,
  matchCertificateType,
  validateExtractionPayload,
  decideExtractionStatus,
  MAX_CERTIFICATE_BYTES,
  isExpiryDateInPast,
  localTodayYmd,
} from "./workOrderCertificates";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

assert(parseCertificateExpiryDate("2027-06-15") === "2027-06-15", "ISO date");
assert(parseCertificateExpiryDate("15/06/2027") === "2027-06-15", "DMY slash");
assert(parseCertificateExpiryDate("15-06-2027") === "2027-06-15", "DMY dash");
assert(parseCertificateExpiryDate("none") === null, "none → null");
assert(parseCertificateExpiryDate("unknown") === null, "unknown → null");
assert(parseCertificateExpiryDate("") === null, "empty → null");
assert(parseCertificateExpiryDate(null) === null, "null → null");
assert(parseCertificateExpiryDate("2027-13-40") === null, "invalid month/day");

assert(isAllowedCertificateMime("application/pdf"), "pdf allowed");
assert(isAllowedCertificateMime("image/jpeg"), "jpeg allowed");
assert(isAllowedCertificateMime("image/png"), "png allowed");
assert(isAllowedCertificateMime("image/webp"), "webp allowed");
assert(isAllowedCertificateMime("image/jpeg; charset=binary"), "mime with params");
assert(!isAllowedCertificateMime("application/msword"), "doc rejected");
assert(!isAllowedCertificateMime(""), "empty mime rejected");
assert(!isAllowedCertificateMime(null), "null mime rejected");

assert(MAX_CERTIFICATE_BYTES === 25 * 1024 * 1024, "25MB limit");

const known = ["Gas Safety Certificate", "EPC Certificate", "Electrical Safety Certificate"];
assert(
  matchCertificateType("Gas Safety Certificate", known) === "Gas Safety Certificate",
  "exact type match",
);
assert(
  matchCertificateType("gas safety", known) === "Gas Safety Certificate",
  "fuzzy contains match",
);
assert(matchCertificateType("Asbestos Survey", known) === "Asbestos Survey", "unknown kept");
assert(matchCertificateType("n/a", known) === null, "n/a type → null");
assert(matchCertificateType(null, known) === null, "null type → null");

const high = validateExtractionPayload({
  certificateType: "Gas Safety Certificate",
  expiryDate: "2028-01-01",
  confidence: 95,
});
assert(high.certificateType === "Gas Safety Certificate", "validate type");
assert(high.expiryDate === "2028-01-01", "validate expiry");
assert(high.confidence === 95, "validate confidence");
assert(decideExtractionStatus(high) === "ready_to_confirm", "high confidence → ready");

const low = validateExtractionPayload({
  certificate_type: "EPC",
  expiry_date: "01/12/2029",
  confidence: 40,
});
assert(low.expiryDate === "2029-12-01", "snake_case expiry parsed");
assert(decideExtractionStatus(low) === "needs_info", "low confidence → needs_info");

const missingExpiry = validateExtractionPayload({
  certificateType: "Gas Safety Certificate",
  confidence: 99,
});
assert(decideExtractionStatus(missingExpiry) === "needs_info", "missing expiry → needs_info");

const clamped = validateExtractionPayload({ confidence: 150 });
assert(clamped.confidence === 100, "confidence clamped to 100");

const neg = validateExtractionPayload({ confidence: -5 });
assert(neg.confidence === 0, "confidence clamped to 0");

assert(isExpiryDateInPast("2020-01-01") === true, "past expiry detected");
assert(isExpiryDateInPast(localTodayYmd()) === false, "today not past");
assert(isExpiryDateInPast("2099-12-31") === false, "future not past");
assert(isExpiryDateInPast(null) === false, "null not past");

console.log(`workOrderCertificates.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
