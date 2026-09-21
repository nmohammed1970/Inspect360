/**
 * Expiry email decision tests. No database and no email provider.
 * Run with: npx tsx shared/entitlementNotifications.test.ts
 */

import { addDaysUtc, resolveEntitlement, type CreditBatchSnapshot } from "./entitlements";
import {
  evaluateExpiryNotifications,
  formatCreditExpiryLabel,
  nextNotificationAction,
  type ExpiryNotificationIntent,
} from "./entitlementNotifications";
import { buildExpiryEmail } from "../server/entitlementEmailTemplates";

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

function batch(partial: Partial<CreditBatchSnapshot> & Pick<CreditBatchSnapshot, "remainingQuantity">): CreditBatchSnapshot {
  return { expiresAt: null, metadataJson: null, ...partial };
}

function types(intents: ExpiryNotificationIntent[]): string[] {
  return intents.map((intent) => intent.type);
}

function statusFor(trialDaysFromNow: number | null, credits: CreditBatchSnapshot[], trialEnforced = true) {
  return resolveEntitlement({
    trialEnforced,
    trialStartAt: addDaysUtc(now, -1),
    trialEndAt: trialDaysFromNow === null ? null : addDaysUtc(now, trialDaysFromNow),
    batches: credits,
  }, now);
}

assert(!types(evaluateExpiryNotifications(statusFor(10, []), now)).includes("trial_warning_3d"), "trial 10 days: no warning");
assert(!types(evaluateExpiryNotifications(statusFor(4, []), now)).includes("trial_warning_3d"), "trial 4 days: no warning");
{
  const intents = evaluateExpiryNotifications(statusFor(3, []), now);
  assert(types(intents).join() === "trial_warning_3d", `trial 3 days: ${types(intents).join()}`);
  assert(intents[0]?.daysRemaining === 3, "trial warning days");
  assert(intents[0]?.accessContinues === false, "trial warning without credits");
}
assert(!types(evaluateExpiryNotifications(statusFor(2, []), now)).includes("trial_warning_3d"), "trial 2 days: no second warning");

{
  const expired = evaluateExpiryNotifications(statusFor(-1, []), now);
  assert(types(expired).join() === "trial_expired", `trial expired: ${types(expired).join()}`);
}
{
  const old = evaluateExpiryNotifications(statusFor(-3, []), now);
  assert(old.length === 0, "trial expired outside 48h catch-up");
}
{
  const kept = evaluateExpiryNotifications(statusFor(-1, [batch({ remainingQuantity: 20, expiresAt: addDaysUtc(now, 30) })]), now);
  assert(!types(kept).includes("trial_expired"), "valid credits suppress trial-expired email");
  assert(kept.length === 0, "no credit warning 30 days out");
}
{
  const both = evaluateExpiryNotifications(statusFor(3, [batch({ remainingQuantity: 12, expiresAt: addDaysUtc(now, 30) })]), now);
  assert(types(both).join() === "trial_warning_3d", `trial warning while credits continue: ${types(both).join()}`);
  assert(both[0]?.accessContinues === true, "trial warning notes continued access");
}

{
  const original = addDaysUtc(now, 3).toISOString();
  const extended = addDaysUtc(now, 18).toISOString();
  const before = evaluateExpiryNotifications(statusFor(3, []), now);
  const after = evaluateExpiryNotifications(statusFor(18, []), now);
  assert(before[0]?.eventKey === original, "original trial event key");
  assert(after.length === 0, "extended trial is not on the 3-day mark");
  assert(before[0]?.eventKey !== extended, "extension changes the event key");
}

function creditStatus(days: number, extra: CreditBatchSnapshot[] = []) {
  return resolveEntitlement({
    trialEnforced: true,
    trialStartAt: null,
    trialEndAt: null,
    batches: [batch({ remainingQuantity: 8, expiresAt: addDaysUtc(now, days) }), ...extra],
  }, now);
}

assert(evaluateExpiryNotifications(creditStatus(10), now).length === 0, "credits 10 days: no warning");
{
  const intents = evaluateExpiryNotifications(creditStatus(3), now);
  assert(types(intents).join() === "credit_warning_3d", `credits 3 days: ${types(intents).join()}`);
  assert(intents[0]?.eventKey === addDaysUtc(now, 3).toISOString(), "credit warning uses earliest expiry");
}
assert(!types(evaluateExpiryNotifications(creditStatus(2), now)).includes("credit_warning_3d"), "credits 2 days: no duplicate warning");

{
  const intents = evaluateExpiryNotifications(creditStatus(-1), now);
  assert(types(intents).join() === "credit_expired", `credits expired: ${types(intents).join()}`);
}
{
  const replaced = evaluateExpiryNotifications(resolveEntitlement({
    trialEnforced: true,
    trialStartAt: null,
    trialEndAt: null,
    batches: [
      batch({ remainingQuantity: 8, expiresAt: addDaysUtc(now, -1) }),
      batch({ remainingQuantity: 15, expiresAt: addDaysUtc(now, 20) }),
    ],
  }, now), now);
  assert(!types(replaced).includes("credit_expired"), "replacement credits suppress expiry email");
}
{
  const oldKey = addDaysUtc(now, 3).toISOString();
  const moved = evaluateExpiryNotifications(creditStatus(26), now);
  assert(moved.length === 0, "moved credit expiry is not warned yet");
  assert(oldKey !== addDaysUtc(now, 26).toISOString(), "new credit expiry is a different event");
}
{
  const intents = evaluateExpiryNotifications(resolveEntitlement({
    trialEnforced: true,
    trialStartAt: null,
    trialEndAt: null,
    batches: [
      batch({ remainingQuantity: 4, expiresAt: addDaysUtc(now, 3) }),
      batch({ remainingQuantity: 9, expiresAt: addDaysUtc(now, 40) }),
    ],
  }, now), now);
  assert(intents.length === 1 && intents[0]?.type === "credit_warning_3d", "multiple batches warn on the earliest expiry");
  assert(intents[0]?.eventKey === addDaysUtc(now, 3).toISOString(), "earliest batch is the event key");
}

{
  const once = evaluateExpiryNotifications(statusFor(3, []), now);
  const twice = evaluateExpiryNotifications(statusFor(3, []), now);
  assert(once.length === 1 && twice.length === 1 && once[0]?.eventKey === twice[0]?.eventKey, "repeat evaluation is the same event");
  assert(nextNotificationAction(null) === "send", "first claim sends");
  assert(nextNotificationAction({ status: "sent", attempts: 1 }) === "skip", "sent is not repeated");
  assert(nextNotificationAction({ status: "failed", attempts: 1 }) === "retry", "failed retries");
  assert(nextNotificationAction({ status: "failed", attempts: 2 }) === "retry", "second failure still retries");
  assert(nextNotificationAction({ status: "failed", attempts: 3 }) === "skip", "third failure stops");
  assert(nextNotificationAction({ status: "skipped", attempts: 1 }) === "skip", "skipped stays skipped");
}

{
  const exclusive = "2026-10-01T00:00:00.000Z";
  const stillOpen = evaluateExpiryNotifications(resolveEntitlement({
    trialEnforced: true,
    trialStartAt: null,
    trialEndAt: null,
    batches: [batch({ remainingQuantity: 10, expiresAt: exclusive })],
  }, new Date("2026-09-30T23:00:00.000Z")), new Date("2026-09-30T23:00:00.000Z"));
  assert(!types(stillOpen).includes("credit_expired"), "30 Sep 23:00 UTC is still inside the usable day");
  const closed = evaluateExpiryNotifications(resolveEntitlement({
    trialEnforced: true,
    trialStartAt: null,
    trialEndAt: null,
    batches: [batch({ remainingQuantity: 10, expiresAt: exclusive })],
  }, new Date(exclusive)), new Date(exclusive));
  assert(types(closed).join() === "credit_expired", "exclusive end instant expires credits");
  assert(formatCreditExpiryLabel(exclusive) === "30 September 2026", `usable label ${formatCreditExpiryLabel(exclusive)}`);
}

{
  const sameDay = evaluateExpiryNotifications(statusFor(3, [batch({ remainingQuantity: 5, expiresAt: addDaysUtc(now, 3) })]), now);
  assert(types(sameDay).sort().join() === "credit_warning_3d,trial_warning_3d", `both due in 3 days: ${types(sameDay).join()}`);
  assert(!types(sameDay).some((type) => type.endsWith("expired")), "warnings do not include expiry emails");
}
{
  const creditFirst = evaluateExpiryNotifications(statusFor(10, [batch({ remainingQuantity: 5, expiresAt: addDaysUtc(now, 3) })]), now);
  assert(types(creditFirst).join() === "credit_warning_3d", `credits due sooner than trial: ${types(creditFirst).join()}`);
}
{
  const bothEnded = evaluateExpiryNotifications(statusFor(-1, [batch({ remainingQuantity: 5, expiresAt: addDaysUtc(now, -1) })]), now);
  assert(types(bothEnded).join() === "credit_expired", `both ended: ${types(bothEnded).join()}`);
  assert(!types(bothEnded).includes("trial_expired"), "credit expiry is the lock reason when paid credits existed");
}
{
  const bonus = evaluateExpiryNotifications(resolveEntitlement({
    trialEnforced: true,
    trialStartAt: addDaysUtc(now, -4),
    trialEndAt: addDaysUtc(now, 10),
    batches: [batch({
      remainingQuantity: 5,
      expiresAt: addDaysUtc(now, 3),
      metadataJson: { kind: "signup_bonus" },
    })],
  }, now), now);
  assert(!types(bonus).includes("credit_warning_3d"), "signup bonus is not a paid credit warning");
}
{
  const legacy = evaluateExpiryNotifications(statusFor(3, [], false), now, { trialEnforced: false });
  assert(legacy.length === 0, "unenforced trial does not email");
}
{
  const never = evaluateExpiryNotifications(resolveEntitlement({
    trialEnforced: true,
    trialStartAt: null,
    trialEndAt: null,
    batches: [batch({ remainingQuantity: 40, expiresAt: null })],
  }, now), now);
  assert(never.length === 0, "credits with no expiry do not email");
}
assert(nextNotificationAction({ status: "pending", attempts: 1 }) === "skip", "in-flight pending is not sent twice");

{
  const mail = buildExpiryEmail({
    productName: "Northwind",
    recipientName: "Ada <script>",
    organizationName: "Northwind",
    loginUrl: "https://portal.example.test",
    intent: {
      type: "trial_warning_3d",
      eventKey: addDaysUtc(now, 3).toISOString(),
      expiresAt: addDaysUtc(now, 3).toISOString(),
      daysRemaining: 3,
      accessContinues: false,
    },
  });
  assert(mail.subject === "Your Northwind trial expires in 3 days", mail.subject);
  assert(mail.text.includes("3 days remaining"), "warning copy includes days remaining");
  assert(mail.html.includes("&lt;script&gt;"), "template escapes html in the name");
  assert(!mail.html.includes("<script>"), "raw script tag is not inserted");
}
for (const type of ["trial_warning_3d", "credit_warning_3d", "trial_expired", "credit_expired"] as const) {
  const mail = buildExpiryEmail({
    productName: "Inspect360",
    recipientName: "Ada",
    organizationName: "Acme",
    loginUrl: "https://portal.example.test",
    intent: {
      type,
      eventKey: addDaysUtc(now, type.endsWith("expired") ? -1 : 3).toISOString(),
      expiresAt: addDaysUtc(now, type.endsWith("expired") ? -1 : 3).toISOString(),
      daysRemaining: type.endsWith("expired") ? 0 : 3,
      accessContinues: false,
    },
  });
  assert(mail.subject.length > 0 && mail.text.includes("administrator"), `${type} tells the user to contact an administrator`);
}
{
  const acrossDst = addDaysUtc(new Date("2026-03-28T00:00:00.000Z"), 3);
  assert(acrossDst.toISOString() === "2026-03-31T00:00:00.000Z", "UTC day count ignores local daylight saving");
}

if (failed > 0) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
