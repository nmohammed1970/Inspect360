/**
 * Financial calculation unit tests (Nov 2026 billing).
 * Run: npx tsx shared/billingFinancialMath.test.ts
 */
import assert from "node:assert/strict";
import {
  AUTO_TOPUP_MAX_PER_MONTH,
  INSPECTION_FLOOR_MINOR,
  PHOTOS_PER_CREDIT,
  assertIntegerMinor,
  inspectionCreditsForPhotos,
  isPastFailureReadonly,
  isYearlyExactly10x,
  meetsInspectionFloor,
  monthlySmsFromYearly,
  perInspectionMinor,
  priceVersionFrozenAfterPublish,
  proratedPackInspectionCredits,
  shouldSkipWebhookEvent,
  smsCreditsForMessage,
  yearlyFromMonthlyMinor,
} from "./billingFinancialMath";

let passed = 0;
let failed = 0;
function check(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("FAIL:", msg);
  }
}

// --- Photos / credits: normal, min, max, boundary, invalid ---
check(PHOTOS_PER_CREDIT === 500, "PHOTOS_PER_CREDIT=500");
check(inspectionCreditsForPhotos(1) === 1, "1 photo → 1 credit");
check(inspectionCreditsForPhotos(500) === 1, "500 photos → 1 credit");
check(inspectionCreditsForPhotos(501) === 2, "501 photos → 2 credits");
check(inspectionCreditsForPhotos(1000) === 2, "1000 → 2");
check(inspectionCreditsForPhotos(1001) === 3, "1001 → 3");
check(inspectionCreditsForPhotos(0) === 1, "0 photos → 1 (min charge)");
check(inspectionCreditsForPhotos(-5) === 1, "negative → 1");
check(inspectionCreditsForPhotos(NaN) === 1, "NaN → 1");
check(inspectionCreditsForPhotos("abc") === 1, "invalid string → 1");
check(inspectionCreditsForPhotos(499.9) === 1, "499.9 floors to 499 → 1");
check(inspectionCreditsForPhotos(Number.MAX_SAFE_INTEGER) >= 1, "max safe int handled");

// --- SMS segments ---
check(smsCreditsForMessage("") === 1, "empty SMS → 1");
check(smsCreditsForMessage("hi") === 1, "short → 1");
check(smsCreditsForMessage("a".repeat(160)) === 1, "160 → 1");
check(smsCreditsForMessage("a".repeat(161)) === 2, "161 → 2");
check(smsCreditsForMessage("a".repeat(306)) === 2, "306 → 2");
check(smsCreditsForMessage("a".repeat(307)) === 3, "307 → 3");
check(smsCreditsForMessage(null as any) === 1, "null body → 1");
check(smsCreditsForMessage("😀".repeat(160)) === 1, "160 unicode code points → 1");
check(smsCreditsForMessage("😀".repeat(161)) === 2, "161 unicode → 2");

// --- Yearly 10× ---
check(yearlyFromMonthlyMinor(4900) === 49000, "4900 → 49000");
check(yearlyFromMonthlyMinor(0) === 0, "0 → 0");
check(yearlyFromMonthlyMinor(-1) === null, "negative monthly invalid");
check(yearlyFromMonthlyMinor(12.5) === null, "non-integer monthly invalid");
check(yearlyFromMonthlyMinor("x") === null, "string monthly invalid");
check(isYearlyExactly10x(11900, 119000), "pro yearly 10×");
check(!isYearlyExactly10x(11900, 100000), "bad yearly rejected");

// --- Floor £2.95 ---
check(INSPECTION_FLOOR_MINOR === 295, "floor 295p");
check(perInspectionMinor(4900, 5) === 980, "4900/5=980");
check(perInspectionMinor(295, 1) === 295, "exactly floor");
check(perInspectionMinor(294, 1) === 294, "below floor value");
check(meetsInspectionFloor(4900, 5), "essentials meets floor");
check(!meetsInspectionFloor(2000, 10), "2000/10 below floor");
check(perInspectionMinor(100, 0) === null, "0 inspections → null");
check(perInspectionMinor(-100, 5) === null, "negative amount → null");
check(perInspectionMinor(100.5, 5) === null, "non-integer amount → null");

// Rounding: 1000/3 = 333.333… → 333
check(perInspectionMinor(1000, 3) === 333, "round half-ish via Math.round(1000/3)=333");
check(perInspectionMinor(5, 2) === 3, "5/2 → 3");

// --- Pack proration ---
const start = Date.UTC(2026, 0, 1);
const end = Date.UTC(2026, 6, 1); // 181 days-ish
const mid = Date.UTC(2026, 3, 1); // ~half year
const half = proratedPackInspectionCredits({
  inspectionsForFullPeriod: 30,
  periodStartMs: start,
  periodEndMs: end,
  nowMs: mid,
});
check(half >= 14 && half <= 16, `half-year pack credits ~15 got ${half}`);
check(
  proratedPackInspectionCredits({
    inspectionsForFullPeriod: 30,
    periodStartMs: start,
    periodEndMs: end,
    nowMs: end,
  }) === 0,
  "at period end → 0 credits",
);
check(
  proratedPackInspectionCredits({
    inspectionsForFullPeriod: 30,
    periodStartMs: start,
    periodEndMs: end,
    nowMs: end + 1,
  }) === 0,
  "after period end → 0",
);
check(
  proratedPackInspectionCredits({
    inspectionsForFullPeriod: 30,
    periodStartMs: start,
    periodEndMs: end,
    nowMs: start,
  }) === 30,
  "at period start → full 30",
);
check(
  proratedPackInspectionCredits({
    inspectionsForFullPeriod: 0,
    periodStartMs: start,
    periodEndMs: end,
    nowMs: mid,
  }) === 0,
  "0 inspections → 0",
);
check(
  proratedPackInspectionCredits({
    inspectionsForFullPeriod: -3,
    periodStartMs: start,
    periodEndMs: end,
    nowMs: mid,
  }) === 0,
  "negative inspections → 0",
);

// --- SMS monthly grant ---
check(monthlySmsFromYearly(120) === 10, "120/12=10");
check(monthlySmsFromYearly(100) === 8, "floor(100/12)=8");
check(monthlySmsFromYearly(1) === 1, "1 → max(1,floor)=1");
check(monthlySmsFromYearly(0) === 0, "0 → 0");
check(monthlySmsFromYearly(-5) === 0, "negative → 0");

// --- Payment failure read-only ---
const now = Date.UTC(2026, 5, 15);
check(
  !isPastFailureReadonly({ firstFailureAtMs: now - 3 * 86400000, nowMs: now }),
  "3 days past due → not read-only",
);
check(
  isPastFailureReadonly({ firstFailureAtMs: now - 7 * 86400000, nowMs: now }),
  "7 days → read-only",
);
check(
  isPastFailureReadonly({ firstFailureAtMs: now - 8 * 86400000, nowMs: now }),
  "8 days → read-only",
);
check(
  !isPastFailureReadonly({ firstFailureAtMs: null, nowMs: now }),
  "no failure → not read-only",
);

// --- Webhook idempotency ---
check(shouldSkipWebhookEvent(null) === false, "no row → process");
check(shouldSkipWebhookEvent({ processedAt: null }) === false, "unprocessed → process");
check(shouldSkipWebhookEvent({ processedAt: new Date() }) === true, "processed → skip");
check(shouldSkipWebhookEvent({ processedAt: "2026-01-01" }) === true, "string processedAt → skip");

// --- Price freeze ---
check(
  priceVersionFrozenAfterPublish({ beforeVersionId: "v1", afterVersionId: "v1" }),
  "sub keeps v1 after publish",
);
check(
  !priceVersionFrozenAfterPublish({ beforeVersionId: "v1", afterVersionId: "v2" }),
  "rewriting version is a freeze violation",
);

check(AUTO_TOPUP_MAX_PER_MONTH === 3, "auto top-up cap 3");
check(assertIntegerMinor(100), "100 is integer minor");
check(!assertIntegerMinor(10.5), "10.5 not integer minor");
check(!assertIntegerMinor(NaN), "NaN not integer minor");

console.log(`billingFinancialMath.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
