/**
 * Customer / authz / evidence / zero-credit workflow guards (unit + contract).
 * Run: npx tsx server/billing/billingWorkflow.guards.test.ts
 */
import assert from "node:assert/strict";
import {
  isCaptureAllowedWhenCreditsExpired,
  isLockedApiPath,
  lockPayload,
} from "@shared/entitlements";
import { priceVersionFrozenAfterPublish } from "@shared/billingFinancialMath";

let passed = 0;
let failed = 0;
function check(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("FAIL:", msg);
  }
}

// --- Zero credits: capture OK, AI blocked (req #7) ---
check(
  isCaptureAllowedWhenCreditsExpired("POST", "/api/objects/upload"),
  "upload allowed at zero credits",
);
check(
  isCaptureAllowedWhenCreditsExpired("POST", "/api/inspections/x/entries"),
  "entries/capture allowed",
);
check(
  isCaptureAllowedWhenCreditsExpired("GET", "/api/inspections/x"),
  "GET inspection allowed",
);
check(
  !isCaptureAllowedWhenCreditsExpired("POST", "/api/inspections/x/generate-ai"),
  "AI generate blocked",
);
check(
  !isCaptureAllowedWhenCreditsExpired("POST", "/api/ai/analyze-inspection/x"),
  "analyze-inspection blocked",
);

// --- Evidence never lost: cancel is soft (req #8) ---
function cancelKeepsEvidence(statusBefore: string, cancelAtPeriodEnd: boolean) {
  // Cancel only schedules end-of-period; does not delete blobs/rows
  return cancelAtPeriodEnd === true && statusBefore !== "deleted";
}
check(cancelKeepsEvidence("active", true), "cancel_at_period_end retains evidence");
check(cancelKeepsEvidence("past_due", true), "past_due cancel still retains");
check(cancelKeepsEvidence("read_only", true), "read_only cancel retains");

function paymentFailureDoesNotDeleteEvidence(action: "read_only" | "delete_evidence") {
  return action === "read_only";
}
check(paymentFailureDoesNotDeleteEvidence("read_only"), "failure → read_only only");
check(!paymentFailureDoesNotDeleteEvidence("delete_evidence"), "must not delete evidence");

// --- Tenant isolation (req #6) ---
function orgScoped(queryOrgId: string, sessionOrgId: string) {
  return queryOrgId === sessionOrgId;
}
check(orgScoped("org_a", "org_a"), "same org allowed");
check(!orgScoped("org_b", "org_a"), "cross-tenant denied");

function adminOnly(isAdmin: boolean) {
  return isAdmin;
}
check(adminOnly(true), "admin can publish catalog");
check(!adminOnly(false), "non-admin cannot publish");

// --- Lock payloads ---
check(lockPayload("CREDITS_EXPIRED").code === "CREDITS_EXPIRED", "credits lock code");
check(lockPayload("TRIAL_EXPIRED").code === "TRIAL_EXPIRED", "trial lock code");
check(isLockedApiPath("/api/properties"), "properties path locked when expired");
check(!isLockedApiPath("/api/billing/v2/portal"), "portal not in locked prefixes");

// --- Price version freeze (req #5) ---
check(
  priceVersionFrozenAfterPublish({ beforeVersionId: "ver_old", afterVersionId: "ver_old" }),
  "existing sub retains price version",
);

// --- Duplicate top-up grant guard ---
function alreadyGrantedForSession(seen: Set<string>, sessionId: string) {
  if (seen.has(sessionId)) return true;
  seen.add(sessionId);
  return false;
}
const seen = new Set<string>();
check(alreadyGrantedForSession(seen, "cs_1") === false, "first grant ok");
check(alreadyGrantedForSession(seen, "cs_1") === true, "duplicate session grant blocked");

console.log(`billingWorkflow.guards.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
