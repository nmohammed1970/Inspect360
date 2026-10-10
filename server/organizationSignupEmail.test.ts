/**
 * Organization signup admin email builder tests.
 * Run: npx tsx server/organizationSignupEmail.test.ts
 */
import { uniqueAdminEmails } from "@shared/creditRequests";
import { buildOrganizationSignupEmail } from "./organizationSignupEmail";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

const baseInput = {
  organizationName: "Acme Properties",
  organizationId: "org-123",
  organizationCountryCode: "GB",
  organizationCurrency: "GBP",
  subscriptionStatus: "inactive",
  trialEnforced: true,
  trialStartAt: new Date("2026-01-01T00:00:00.000Z"),
  trialEndAt: new Date("2026-01-15T00:00:00.000Z"),
  registeredAt: new Date("2026-01-01T12:30:00.000Z"),
  userFullName: "Jane Owner",
  userEmail: "jane@example.com",
  userPhone: null as string | null,
  userId: "user-456",
  userRole: "owner",
  userSignedUpAt: new Date("2026-01-01T12:30:00.000Z"),
  signupSource: "Public registration",
  adminUrl: "https://portal.inspect360.ai/admin/dashboard",
};

const content = buildOrganizationSignupEmail(baseInput);

assert(
  content.subject === "Inspect360 — New Organization Signup: Acme Properties",
  "subject includes organization name",
);
assert(content.text.includes("Acme Properties"), "text includes organization name");
assert(content.text.includes("org-123"), "text includes organization id");
assert(content.text.includes("jane@example.com"), "text includes user email");
assert(content.text.includes("Jane Owner"), "text includes user name");
assert(content.text.includes("user-456"), "text includes user id");
assert(content.text.includes("Not provided"), "missing phone shows Not provided");
assert(
  content.text.includes("https://portal.inspect360.ai/admin/dashboard"),
  "text includes admin URL",
);
assert(content.html.includes("New Organization Registered"), "html has title");
assert(content.html.includes("View Organization in Admin Portal"), "html has CTA");
assert(content.html.includes("Acme Properties"), "html includes organization name");
assert(content.html.includes("Trial active until"), "html includes trial status");

const withXss = buildOrganizationSignupEmail({
  ...baseInput,
  organizationName: `<script>alert("x")</script>`,
  userFullName: `Bob & "Alice" <carol@x.com>`,
});
assert(!withXss.html.includes("<script>"), "html escapes script tags in org name");
assert(withXss.html.includes("&lt;script&gt;"), "html encodes angle brackets");
assert(withXss.html.includes("&amp;"), "html encodes ampersands");
assert(withXss.html.includes("&quot;"), "html encodes quotes");

const missingOptionals = buildOrganizationSignupEmail({
  organizationName: "Bare Org",
  organizationId: "org-bare",
  userEmail: "owner@bare.test",
  userId: "user-bare",
  adminUrl: "https://portal.inspect360.ai/admin/dashboard",
});
assert(missingOptionals.text.includes("Not provided"), "optional blanks become Not provided");
assert(
  missingOptionals.subject === "Inspect360 — New Organization Signup: Bare Org",
  "subject works with minimal fields",
);

const emails = uniqueAdminEmails([
  { email: "Admin@Inspect360.ai" },
  { email: "admin@inspect360.ai" },
  { email: "  ops@inspect360.ai " },
  { email: "" },
  { email: null },
]);
assert(emails.length === 2, "uniqueAdminEmails dedupes and drops blanks");
assert(emails[0] === "admin@inspect360.ai", "uniqueAdminEmails lowercases");
assert(emails[1] === "ops@inspect360.ai", "uniqueAdminEmails trims");

console.log(`organizationSignupEmail tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
