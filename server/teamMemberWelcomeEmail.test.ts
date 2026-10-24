/**
 * Team member welcome email builder tests.
 * Run: npx tsx server/teamMemberWelcomeEmail.test.ts
 */
import { buildTeamMemberWelcomeEmail } from "./teamMemberWelcomeEmail";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

const content = buildTeamMemberWelcomeEmail({
  recipientName: "John Doe",
  email: "john.doe@example.com",
  password: "TempPass123!",
  role: "clerk",
  organizationName: "Foxtons",
  loginUrl: "https://portal.inspect360.ai",
});

assert(
  content.subject === "Welcome to Inspect360 — Foxtons",
  "subject includes organisation name",
);
assert(content.text.includes("John Doe"), "text greets recipient");
assert(content.text.includes("john.doe@example.com"), "text includes email");
assert(content.text.includes("TempPass123!"), "text includes password");
assert(content.text.includes("Inventory Clerk / Inspector"), "text includes role label");
assert(content.text.includes("Organisation / company: Foxtons"), "text includes company label");
assert(content.text.includes("change your password"), "text includes security note");
assert(content.text.includes("https://portal.inspect360.ai"), "text includes login URL");
assert(content.html.includes("Welcome to Foxtons"), "html has company in title");
assert(content.html.includes("Organisation / company"), "html has company field label");
assert(content.html.includes("Security note"), "html has security note");
assert(content.html.includes("Sign in to Inspect360"), "html has CTA");
assert(content.html.includes("TempPass123!"), "html includes password");

const withXss = buildTeamMemberWelcomeEmail({
  recipientName: `<script>alert("x")</script>`,
  email: `evil@x.com`,
  password: `pass&<>"`,
  role: "owner",
  organizationName: `Org & "Co" <bad>`,
  loginUrl: "https://portal.inspect360.ai",
});
assert(!withXss.html.includes("<script>"), "html escapes script tags in name");
assert(withXss.html.includes("&lt;script&gt;"), "html encodes angle brackets");
assert(withXss.html.includes("&amp;"), "html encodes ampersands in password/org");
assert(withXss.html.includes("&quot;"), "html encodes quotes");

const noName = buildTeamMemberWelcomeEmail({
  email: "solo@example.com",
  password: "secret",
  role: "compliance",
  loginUrl: "https://portal.inspect360.ai",
});
assert(noName.text.includes("Hi solo@example.com"), "falls back to email for greeting");
assert(
  noName.subject === "Welcome to Inspect360 — your organisation",
  "falls back org label when missing",
);
assert(noName.text.includes("Compliance Officer"), "compliance role label");

console.log(`teamMemberWelcomeEmail tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
