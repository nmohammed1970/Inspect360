/**
 * Run: npx tsx shared/rentPeriodMath.test.ts
 */
import { computeRentPeriodWindows } from "./rentPeriodMath";

let passed = 0;
let failed = 0;
function assert(c: boolean, m: string) {
  if (c) passed++;
  else {
    failed++;
    console.error("FAIL:", m);
  }
}

const windows = computeRentPeriodWindows(
  {
    isActive: true,
    monthlyRent: "1200",
    leaseStartDate: new Date("2026-09-15T00:00:00Z"),
    leaseEndDate: null,
    rentDueDay: 1,
  },
  new Date("2026-11-01T00:00:00Z"),
);

assert(windows.length >= 2, "generates multiple months");
assert(windows[0].dueDate.toISOString().startsWith("2026-10-01"), "first due is 1 Oct (no Sept proration)");
assert(windows[0].amountDue === "1200.00", "full monthly amount");

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
