/**
 * Run: npx tsx shared/rentEnglandRules.test.ts
 */
import { assessEnglandEligibility } from "./rentEnglandRules";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

{
  const r = assessEnglandEligibility({
    leaseStartDate: new Date("2026-06-01T00:00:00Z"),
    proposedEffectiveDate: new Date("2026-10-01T00:00:00Z"),
    asOf: new Date("2026-09-01T00:00:00Z"),
  });
  assert(!r.eligible, "should block first-year increase");
  assert(r.reasons.some((x) => x.includes("12 months")), "mentions 12 months");
}

{
  const r = assessEnglandEligibility({
    leaseStartDate: new Date("2024-01-01T00:00:00Z"),
    lastIncreaseEffective: new Date("2026-01-01T00:00:00Z"),
    proposedEffectiveDate: new Date("2026-06-01T00:00:00Z"),
    noticeServedAt: new Date("2026-03-01T00:00:00Z"),
    asOf: new Date("2026-03-15T00:00:00Z"),
  });
  assert(!r.eligible, "should block more than once per year");
}

{
  const r = assessEnglandEligibility({
    leaseStartDate: new Date("2024-01-01T00:00:00Z"),
    lastIncreaseEffective: new Date("2025-01-01T00:00:00Z"),
    proposedEffectiveDate: new Date("2026-06-01T00:00:00Z"),
    noticeServedAt: new Date("2026-03-01T00:00:00Z"),
    asOf: new Date("2026-03-15T00:00:00Z"),
  });
  assert(r.eligible, `should allow lawful review: ${r.reasons.join("; ")}`);
}

console.log("rentEnglandRules.test.ts: all passed");
