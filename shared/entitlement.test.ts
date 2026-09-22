/**
 * Entitlement status machine tests. Injected clock — no database.
 * Run with: npx tsx shared/entitlement.test.ts
 */

import {
  DEFAULT_TRIAL_DAYS,
  EXPIRY_WARNING_DAYS,
  MAX_TRIAL_EXTENSION_DAYS,
  MS_PER_DAY,
  addDaysUtc,
  computeExtendedTrialEnd,
  daysRemainingUntil,
  isLockedApiPath,
  isLockedAppPath,
  parseCreditExpiryInput,
  resolveEntitlement,
  validateTrialExtensionDays,
  type CreditBatchSnapshot,
} from "./entitlements";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

const now = new Date("2026-09-19T15:00:00.000Z");

function trialEndFrom(start: Date): Date {
  return addDaysUtc(start, DEFAULT_TRIAL_DAYS);
}

function batch(partial: Partial<CreditBatchSnapshot> & Pick<CreditBatchSnapshot, "remainingQuantity">): CreditBatchSnapshot {
  return {
    expiresAt: null,
    metadataJson: null,
    ...partial,
  };
}

// A — new org, trial active, no paid credits
{
  const start = now;
  const end = trialEndFrom(start);
  const status = resolveEntitlement({
    trialEnforced: true,
    trialStartAt: start,
    trialEndAt: end,
    batches: [batch({ remainingQuantity: 5, expiresAt: end, metadataJson: { kind: "signup_bonus", adminNotes: "Signup reward" } })],
  }, now);
  assert(status.code === "TRIAL_ACTIVE", `A expected TRIAL_ACTIVE, got ${status.code}`);
  assert(status.locked === false, "A should not lock");
  assert(status.paidCredits === 0, "A signup bonus is not paid");
  assert(status.daysRemaining === DEFAULT_TRIAL_DAYS, `A days remaining ${status.daysRemaining}`);
}

// B — 5 days remaining warns
{
  const end = addDaysUtc(now, EXPIRY_WARNING_DAYS);
  const status = resolveEntitlement({
    trialEnforced: true,
    trialStartAt: addDaysUtc(now, -2),
    trialEndAt: end,
    batches: [],
  }, now);
  assert(status.code === "TRIAL_EXPIRING", `B expected TRIAL_EXPIRING, got ${status.code}`);
  assert(status.warning === "trial", "B warning");
  assert(status.daysRemaining === 5, `B days ${status.daysRemaining}`);
  assert(!status.locked, "B still allowed");
}

// 1 day remaining
{
  const end = new Date(now.getTime() + 60 * 60 * 1000);
  const status = resolveEntitlement({
    trialEnforced: true,
    trialStartAt: addDaysUtc(now, -6),
    trialEndAt: end,
    batches: [],
  }, now);
  assert(status.code === "TRIAL_EXPIRING", `1-day expected TRIAL_EXPIRING, got ${status.code}`);
  assert(status.daysRemaining === 1, `1-day remaining ${status.daysRemaining}`);
}

// C — trial expired
{
  const status = resolveEntitlement({
    trialEnforced: true,
    trialStartAt: addDaysUtc(now, -8),
    trialEndAt: addDaysUtc(now, -1),
    batches: [],
  }, now);
  assert(status.code === "TRIAL_EXPIRED", `C expected TRIAL_EXPIRED, got ${status.code}`);
  assert(status.locked, "C locked");
}

// Exact trial end instant is locked
{
  const end = now;
  const status = resolveEntitlement({
    trialEnforced: true,
    trialStartAt: addDaysUtc(now, -7),
    trialEndAt: end,
    batches: [],
  }, now);
  assert(status.locked && status.code === "TRIAL_EXPIRED", "end instant is not usable");
}

// D — expired trial but valid paid credits
{
  const expiry = addDaysUtc(now, 20);
  const status = resolveEntitlement({
    trialEnforced: true,
    trialStartAt: addDaysUtc(now, -10),
    trialEndAt: addDaysUtc(now, -3),
    batches: [batch({ remainingQuantity: 100, expiresAt: expiry })],
  }, now);
  assert(status.code === "CREDITS_ACTIVE", `D expected CREDITS_ACTIVE, got ${status.code}`);
  assert(!status.locked, "D unlocked");
  assert(status.paidCredits === 100, "D balance");
  assert(status.trialEndAt === addDaysUtc(now, -3).toISOString(), "D keeps trial end while credits are active");
}

// E — credits remain but expiry passed
{
  const status = resolveEntitlement({
    trialEnforced: true,
    trialStartAt: addDaysUtc(now, -20),
    trialEndAt: addDaysUtc(now, -13),
    batches: [batch({ remainingQuantity: 100, expiresAt: addDaysUtc(now, -1) })],
  }, now);
  assert(status.code === "CREDITS_EXPIRED", `E expected CREDITS_EXPIRED, got ${status.code}`);
  assert(status.locked, "E locked");
  assert(status.paidCredits === 0, "E paid balance ignores expired");
}

// F — credits expire in 5 days
{
  const expiry = addDaysUtc(now, 5);
  const status = resolveEntitlement({
    trialEnforced: true,
    trialStartAt: null,
    trialEndAt: null,
    batches: [batch({ remainingQuantity: 40, expiresAt: expiry })],
  }, now);
  assert(status.code === "CREDITS_EXPIRING", `F expected CREDITS_EXPIRING, got ${status.code}`);
  assert(status.daysRemaining === 5, `F days ${status.daysRemaining}`);
  assert(!status.locked, "F still allowed");
}

// G — credits expire in under 24h
{
  const expiry = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const status = resolveEntitlement({
    trialEnforced: true,
    trialStartAt: null,
    trialEndAt: addDaysUtc(now, -1),
    batches: [batch({ remainingQuantity: 8, expiresAt: expiry })],
  }, now);
  assert(status.code === "CREDITS_EXPIRING", `G expected CREDITS_EXPIRING, got ${status.code}`);
  assert(status.daysRemaining === 1, `G days ${status.daysRemaining}`);
}

// H — credit expiry instant reached today
{
  const status = resolveEntitlement({
    trialEnforced: true,
    trialStartAt: null,
    trialEndAt: null,
    batches: [batch({ remainingQuantity: 8, expiresAt: now })],
  }, now);
  assert(status.code === "CREDITS_EXPIRED", `H expected CREDITS_EXPIRED, got ${status.code}`);
}

// Calendar date 30 Sep is usable through that UTC day
{
  const parsed = parseCreditExpiryInput("2026-09-30", new Date("2026-09-19T00:00:00.000Z"));
  assert(parsed.ok, "parse 30 Sep");
  if (parsed.ok) {
    assert(parsed.expiresAt.toISOString() === "2026-10-01T00:00:00.000Z", `stored ${parsed.expiresAt.toISOString()}`);
    const stillValid = resolveEntitlement({
      trialEnforced: true,
      trialStartAt: null,
      trialEndAt: null,
      batches: [batch({ remainingQuantity: 10, expiresAt: parsed.expiresAt })],
    }, new Date("2026-09-30T23:00:00.000Z"));
    assert(stillValid.code === "CREDITS_EXPIRING" && !stillValid.locked, "30 Sep still active");
    const gone = resolveEntitlement({
      trialEnforced: true,
      trialStartAt: null,
      trialEndAt: null,
      batches: [batch({ remainingQuantity: 10, expiresAt: parsed.expiresAt })],
    }, new Date("2026-10-01T00:00:00.000Z"));
    assert(gone.code === "CREDITS_EXPIRED", "1 Oct expired");
  }
}

// I — extend active trial stacks on current end
{
  const current = addDaysUtc(now, 3);
  const next = computeExtendedTrialEnd(current, now, 7);
  assert(next.getTime() === current.getTime() + 7 * MS_PER_DAY, "I stacks on future end");
}

// Extend with no previous trial starts from now
{
  const next = computeExtendedTrialEnd(null, now, 7);
  assert(next.getTime() === now.getTime() + 7 * MS_PER_DAY, "null trial starts from now");
}
{
  const current = addDaysUtc(now, -2);
  const next = computeExtendedTrialEnd(current, now, 7);
  assert(next.getTime() === now.getTime() + 7 * MS_PER_DAY, "J restarts from now");
  const status = resolveEntitlement({
    trialEnforced: true,
    trialStartAt: addDaysUtc(now, -10),
    trialEndAt: next,
    batches: [],
  }, now);
  assert(status.code === "TRIAL_ACTIVE" && !status.locked, "J trial active again");
}

// K — second extension does not restart from original
{
  const original = addDaysUtc(now, 2);
  const first = computeExtendedTrialEnd(original, now, 7);
  const second = computeExtendedTrialEnd(first, now, 7);
  assert(second.getTime() === original.getTime() + 14 * MS_PER_DAY, "K two extensions stack");
}

// Grandfathered org is not locked at zero credits
{
  const status = resolveEntitlement({
    trialEnforced: false,
    trialStartAt: null,
    trialEndAt: null,
    batches: [],
  }, now);
  assert(status.code === "LEGACY_ACCESS" && !status.locked, `legacy got ${status.code}`);
}

// Null-expiry paid credits stay active
{
  const status = resolveEntitlement({
    trialEnforced: false,
    trialStartAt: null,
    trialEndAt: null,
    batches: [batch({ remainingQuantity: 12, expiresAt: null })],
  }, now);
  assert(status.code === "CREDITS_ACTIVE" && status.paidCredits === 12, "legacy credits active");
}

// Newly assigned credits after expiry
{
  const status = resolveEntitlement({
    trialEnforced: true,
    trialStartAt: addDaysUtc(now, -20),
    trialEndAt: addDaysUtc(now, -10),
    batches: [
      batch({ remainingQuantity: 50, expiresAt: addDaysUtc(now, -1) }),
      batch({ remainingQuantity: 20, expiresAt: addDaysUtc(now, 30) }),
    ],
  }, now);
  assert(status.code === "CREDITS_ACTIVE" && status.paidCredits === 20, "new grant restores access");
}

// Invalid extension values
assert(!validateTrialExtensionDays(0).ok, "zero days rejected");
assert(!validateTrialExtensionDays(-3).ok, "negative rejected");
assert(!validateTrialExtensionDays(1.5).ok, "fraction rejected");
assert(!validateTrialExtensionDays(MAX_TRIAL_EXTENSION_DAYS + 1).ok, "too large rejected");
assert(validateTrialExtensionDays(7).ok, "7 days accepted");
assert(!parseCreditExpiryInput("", now).ok, "missing expiry rejected");
assert(!parseCreditExpiryInput("2020-01-01", now).ok, "past expiry rejected");

// Route isolation
assert(isLockedApiPath("/api/properties"), "properties locked");
assert(isLockedApiPath("/api/properties/abc"), "property id locked");
assert(isLockedApiPath("/api/blocks"), "blocks locked");
assert(isLockedApiPath("/api/inspections/1/complete"), "inspection action locked");
assert(isLockedApiPath("/api/comparison-reports"), "comparison reports locked");
assert(isLockedApiPath("/api/comparisons/1"), "comparisons locked");
assert(isLockedApiPath("/api/maintenance"), "maintenance locked");
assert(isLockedApiPath("/api/work-orders"), "work orders locked");
assert(isLockedApiPath("/api/analytics/work-orders"), "analytics locked");
assert(isLockedApiPath("/api/tenant/maintenance-requests"), "tenant maintenance locked");
assert(isLockedAppPath("/disputes"), "disputes app locked");
assert(isLockedAppPath("/analytics"), "analytics app locked");
assert(!isLockedApiPath("/api/dashboard/stats"), "dashboard stats open");
assert(!isLockedApiPath("/api/billing/inspection-balance"), "billing open");
assert(!isLockedApiPath("/api/entitlement"), "entitlement open");
assert(!isLockedApiPath("/api/admin/instances"), "admin open");
assert(!isLockedApiPath("/api/marketplace/modules"), "marketplace browse open");
assert(isLockedAppPath("/inspections/1/report"), "inspection page locked");
assert(!isLockedAppPath("/dashboard"), "dashboard page open");
assert(!isLockedAppPath("/reports"), "reports hub open");

assert(daysRemainingUntil(addDaysUtc(now, 4), now) === 4, "4 day ceil");
assert(daysRemainingUntil(now, now) === 0, "zero at instant");

if (failed > 0) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
