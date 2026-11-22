/**
 * Run: npx tsx server/maintenance/maintenanceFinanceEmails.test.ts
 */
import { __test } from "./maintenanceFinanceEmails";

const { escapeHtml, formatMoneyMinor, buildFinanceEmailHtml } = __test;

let passed = 0;
let failed = 0;
function check(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("FAIL:", msg);
  }
}

check(escapeHtml(`<script>alert("x")</script>`) === `&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;`, "escapes html");
check(formatMoneyMinor(20100, "GBP").includes("201"), "formats GBP total");
check(formatMoneyMinor(0, "EUR").includes("0"), "formats zero");

const html = buildFinanceEmailHtml({
  branding: {
    displayName: "Acme Lettings",
    accent: "#00D5CC",
    logoUrl: null,
    email: "bills@acme.test",
    phone: null,
  },
  headline: "Quotation approved",
  greeting: "Hello,",
  intro: "An owner has approved this quotation.",
  detailTitle: "Quotation summary",
  details: [
    { label: "Reference", value: "Q-2026-00089" },
    { label: "Version", value: "v1" },
    { label: "Decision", value: "approve" },
  ],
  ctaLabel: "Open quotation",
  ctaUrl: "https://app.example/work-orders/wo1/quotes/q1",
});

check(html.includes("Quotation approved"), "headline present");
check(html.includes("Acme Lettings"), "org name present");
check(html.includes("Q-2026-00089"), "reference present");
check(html.includes("Open quotation"), "CTA present");
check(html.includes("https://app.example/work-orders/wo1/quotes/q1"), "CTA url present");
check(html.includes("border-left: 4px solid #00D5CC"), "accent detail card");
check(!html.includes("<script>"), "no raw script");

const withLogo = buildFinanceEmailHtml({
  branding: {
    displayName: "Logo Co",
    accent: "#0d9488",
    logoUrl: "https://cdn.example/logo.png",
    email: null,
    phone: null,
  },
  headline: "Invoice from Logo Co",
  greeting: "Hello Sam,",
  intro: "Please find your invoice.",
  details: [{ label: "Amount due", value: "£201.00" }],
  ctaLabel: "View invoice",
  ctaUrl: "https://app.example/public/invoices/tok",
});
check(withLogo.includes('src="https://cdn.example/logo.png"'), "logo img when https");
check(withLogo.includes("£201.00"), "amount in body");

console.log(`maintenanceFinanceEmails: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
