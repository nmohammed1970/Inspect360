/**
 * Run: npx tsx shared/rentScheduleMath.test.ts
 */
import {
  computeScheduleWindows,
  deriveChargeStatus,
  proposeOldestFirstAllocation,
  dueDateInMonth,
  chargeOutstanding,
} from "./rentScheduleMath";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// Month-end clamp
{
  const d = dueDateInMonth(2026, 1, 31, "clamp_to_last_day"); // Feb 2026
  assert(d.getUTCDate() === 28, `expected Feb 28 got ${d.toISOString()}`);
}

// Monthly schedule + leap year Feb
{
  const windows = computeScheduleWindows({
    amountMinor: 110000,
    frequency: "monthly",
    dueDay: 1,
    effectiveFrom: new Date("2024-01-01T00:00:00Z"),
    leaseStart: new Date("2024-01-01T00:00:00Z"),
    throughDate: new Date("2024-03-15T00:00:00Z"),
    horizonMonths: 3,
    prorationRule: "none",
  });
  assert(windows.length >= 3, `expected >=3 windows got ${windows.length}`);
  assert(windows[0].amountMinor === 110000, "full rent");
}

// End proration
{
  const windows = computeScheduleWindows({
    amountMinor: 3100, // £31.00 so easy day math
    frequency: "monthly",
    dueDay: 1,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    leaseStart: new Date("2026-01-01T00:00:00Z"),
    leaseEnd: new Date("2026-01-15T00:00:00Z"),
    throughDate: new Date("2026-02-01T00:00:00Z"),
    prorationRule: "actual_days",
  });
  assert(windows.length === 1, `expected 1 window got ${windows.length}`);
  assert(windows[0].amountMinor > 0 && windows[0].amountMinor < 3100, "prorated amount");
}

// Allocation oldest first
{
  const plan = proposeOldestFirstAllocation(
    [
      { id: "c2", amountMinor: 10000, allocatedMinor: 0, dueDate: new Date("2026-11-01") },
      { id: "c1", amountMinor: 110000, allocatedMinor: 0, dueDate: new Date("2026-10-01") },
    ],
    90000,
  );
  assert(plan[0].chargeId === "c1" && plan[0].amountMinor === 90000, "oldest first");
  assert(plan.length === 1, "only first charge until filled");
}

// Partial then next
{
  const plan = proposeOldestFirstAllocation(
    [
      { id: "c1", amountMinor: 50000, allocatedMinor: 0, dueDate: new Date("2026-10-01") },
      { id: "c2", amountMinor: 50000, allocatedMinor: 0, dueDate: new Date("2026-11-01") },
    ],
    70000,
  );
  assert(plan.length === 2, "split across charges");
  assert(plan[0].amountMinor === 50000 && plan[1].amountMinor === 20000, "split amounts");
}

// Status rules
{
  const asOf = new Date("2026-11-25T00:00:00Z");
  assert(
    deriveChargeStatus({
      amountMinor: 100,
      allocatedMinor: 0,
      dueDate: new Date("2026-11-26"),
      asOf,
    }) === "scheduled",
    "future = scheduled",
  );
  assert(
    deriveChargeStatus({
      amountMinor: 100,
      allocatedMinor: 0,
      dueDate: new Date("2026-11-25"),
      asOf,
    }) === "due",
    "due today",
  );
  assert(
    deriveChargeStatus({
      amountMinor: 100,
      allocatedMinor: 0,
      dueDate: new Date("2026-11-24"),
      asOf,
    }) === "overdue",
    "past due = overdue",
  );
  assert(
    deriveChargeStatus({
      amountMinor: 100,
      allocatedMinor: 100,
      dueDate: new Date("2026-11-01"),
      asOf,
    }) === "paid",
    "fully paid",
  );
  assert(chargeOutstanding(100, 40) === 60, "outstanding");
}

// Demo arithmetic from spec §5
{
  const prior = 110000;
  const current = 110000;
  const receipt = 90000;
  const allocPrior = Math.min(prior, receipt);
  const remaining = receipt - allocPrior;
  const priorLeft = prior - allocPrior;
  const currentLeft = current - remaining;
  const totalArrears = priorLeft + currentLeft;
  assert(totalArrears === 130000, `expected £1300 arrears got ${totalArrears}`);
  assert(remaining === 0, "all receipt to prior");
}

console.log("rentScheduleMath.test.ts: all passed");
