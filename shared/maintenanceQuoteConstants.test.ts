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

check(canTransitionQuote("draft", "sent", "staff"), "staff send from draft");
check(canTransitionQuote("draft", "sent", "owner"), "owner send from draft");
check(!canTransitionQuote("draft", "accepted", "owner"), "no draft→accepted");
check(!canTransitionQuote("draft", "sent", "customer"), "customer cannot send");
check(canTransitionQuote("sent", "accepted", "customer"), "customer accept");
check(canTransitionQuote("sent", "declined", "customer"), "customer decline");
check(
  canTransitionQuote("sent", "customer_changes_requested", "customer"),
  "customer request changes",
);
check(!canTransitionQuote("sent", "accepted", "owner"), "owner cannot accept");
check(canTransitionQuote("accepted", "converted", "owner"), "owner convert");
check(canTransitionQuote("accepted", "converted", "staff"), "staff convert");
check(canTransitionQuote("declined", "superseded", "staff"), "revise from declined");
check(
  canTransitionQuote("customer_changes_requested", "superseded", "owner"),
  "revise from customer changes",
);

try {
  assertQuoteTransition("draft", "accepted", "owner");
  check(false, "assert should throw");
} catch {
  check(true, "assert throws on illegal");
}

console.log(`maintenanceQuoteConstants: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
