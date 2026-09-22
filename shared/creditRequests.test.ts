/**
 * Credit request rules. No database.
 * Run with: npx tsx shared/creditRequests.test.ts
 */

import { buildCreditRequestEmail } from "../server/creditRequestEmail";
import {
  MAX_CREDIT_REQUEST,
  MAX_CREDIT_REQUEST_MESSAGE,
  applyGrant,
  exceedsHourlyLimit,
  isDuplicateSubmission,
  parseCreditRequestCreate,
  resolveRequestIdentity,
  uniqueAdminEmails,
} from "./creditRequests";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function credits(value: unknown) {
  return parseCreditRequestCreate({ creditsRequested: value, message: "Need credits for inspections." });
}

assert(!credits(5).ok, "5 rejected");
assert(!credits(4).ok, "4 rejected");
assert(!credits(0).ok, "0 rejected");
assert(!credits(-1).ok, "negative rejected");
assert(!credits(5.5).ok, "decimal rejected");
assert(!credits("abc").ok, "letters rejected");
assert(!credits("").ok, "empty credits rejected");
assert(!credits("6.0").ok, "decimal string rejected");
assert(credits(6).ok && credits(6).ok && (credits(6) as { creditsRequested: number }).creditsRequested === 6, "6 accepted");
assert(credits(100).ok, "100 accepted");
assert(credits("50").ok, "numeric string accepted");
assert(!credits(MAX_CREDIT_REQUEST + 1).ok, "above maximum rejected");

const emptyMessage = parseCreditRequestCreate({ creditsRequested: 10, message: "   " });
assert(!emptyMessage.ok && emptyMessage.ok === false && emptyMessage.message === "Please enter a message.", "blank message");
const longMessage = parseCreditRequestCreate({ creditsRequested: 10, message: "a".repeat(MAX_CREDIT_REQUEST_MESSAGE + 1) });
assert(!longMessage.ok, "oversized message");
const trimmed = parseCreditRequestCreate({ creditsRequested: 10, message: "  Need credits.  " });
assert(trimmed.ok && trimmed.ok && trimmed.message === "Need credits.", "message trimmed");

const spoofed = parseCreditRequestCreate({
  creditsRequested: 10,
  message: "Need credits.",
  status: "GRANTED",
  organizationId: "other-org",
  requestedByUserId: "other-user",
  requesterEmail: "other@example.com",
});
assert(spoofed.ok, "body with spoofed fields still parses credits");
assert(spoofed.ok && !("status" in spoofed), "status is not taken from the body");

const identity = resolveRequestIdentity({
  id: "user-a",
  email: "owner@acme.test",
  firstName: "John",
  lastName: "Smith",
  organizationId: "org-a",
  organizationName: "ABC Ltd",
});
assert(identity.status === "REQUESTED", "status is always REQUESTED");
assert(identity.organizationId === "org-a" && identity.requestedByUserId === "user-a", "identity comes from the account");
assert(identity.requesterEmail === "owner@acme.test" && identity.requesterName === "John Smith", "name and email come from the account");
assert(identity.organizationName === "ABC Ltd", "organization name comes from the account");

const now = new Date("2026-09-21T12:00:00.000Z");
assert(isDuplicateSubmission({
  creditsRequested: 10,
  message: "Need credits.",
  createdAt: new Date(now.getTime() - 30_000),
}, { creditsRequested: 10, message: "Need credits." }, now), "identical request inside 60 seconds is a duplicate");
assert(!isDuplicateSubmission({
  creditsRequested: 10,
  message: "Need credits.",
  createdAt: new Date(now.getTime() - 61_000),
}, { creditsRequested: 10, message: "Need credits." }, now), "same request after the window is allowed");
assert(!isDuplicateSubmission({
  creditsRequested: 20,
  message: "Need credits.",
  createdAt: new Date(now.getTime() - 10_000),
}, { creditsRequested: 10, message: "Need credits." }, now), "different amount is not a duplicate");
assert(exceedsHourlyLimit(10), "hour cap");
assert(!exceedsHourlyLimit(9), "under hour cap");

const emails = uniqueAdminEmails([
  { email: "Admin@Inspect360.com" },
  { email: "admin@inspect360.com" },
  { email: "second@inspect360.com" },
  { email: "  " },
]);
assert(emails.length === 2 && emails[0] === "admin@inspect360.com" && emails[1] === "second@inspect360.com", "admin emails deduped");

const granted = applyGrant("REQUESTED", "admin-1", now);
assert(granted.ok && granted.status === "GRANTED" && granted.grantedBy === "admin-1" && granted.grantedAt === now, "grant records admin and time");
assert(granted.ok && granted.eventType === "CREDIT_REQUEST_GRANTED", "grant audit event");
const again = applyGrant("GRANTED", "admin-1", now);
assert(!again.ok && again.ok === false && again.statusCode === 409, "cannot grant twice");
const noAdmin = applyGrant("REQUESTED", "", now);
assert(!noAdmin.ok, "grant requires an admin");

const mail = buildCreditRequestEmail({
  organizationName: "ABC Ltd",
  requesterName: "John Smith",
  requesterEmail: "john@example.com",
  creditsRequested: 100,
  message: "I need credits <script>alert(1)</script>",
  requestedAt: now,
  adminUrl: "https://portal.inspect360.ai/admin/credit-requests",
});
assert(mail.subject === "New Credit Request - ABC Ltd", "subject includes organization");
assert(mail.text.includes("John Smith") && mail.text.includes("john@example.com"), "email names the requester");
assert(mail.text.includes("100") && mail.text.includes("REQUESTED"), "email includes credits and status");
assert(mail.html.includes("&lt;script&gt;"), "message is escaped");
assert(!mail.html.includes("<script>alert"), "raw script is not rendered");

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
