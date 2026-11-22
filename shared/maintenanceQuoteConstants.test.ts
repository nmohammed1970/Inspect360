/**
 * Run: npx tsx shared/maintenanceQuoteConstants.test.ts
 */
import { assertQuoteTransition, canTransitionQuote } from "./maintenanceQuoteConstants";

let passed = 0;
let failed = 0;
function check(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("FAIL:", msg);
  }
}

check(canTransitionQuote("draft", "pending_owner_approval", "staff"), "staff submit");
check(!canTransitionQuote("draft", "sent", "owner"), "no draft→sent");
check(!canTransitionQuote("pending_owner_approval", "sent", "owner"), "no pending→sent");
check(canTransitionQuote("pending_owner_approval", "owner_approved", "owner"), "owner approve");
check(!canTransitionQuote("pending_owner_approval", "owner_approved", "staff"), "staff cannot approve");
check(canTransitionQuote("owner_approved", "sent", "owner"), "owner send");
check(!canTransitionQuote("owner_approved", "accepted", "owner"), "no owner skip customer");
check(canTransitionQuote("sent", "accepted", "customer"), "customer accept");
check(canTransitionQuote("accepted", "converted", "owner"), "convert");
check(canTransitionQuote("owner_rejected", "superseded", "staff"), "revise path");

try {
  assertQuoteTransition("draft", "sent", "owner");
  check(false, "assert should throw");
} catch {
  check(true, "assert throws on illegal");
}

console.log(`maintenanceQuoteConstants: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
