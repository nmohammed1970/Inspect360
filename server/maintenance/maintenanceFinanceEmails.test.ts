/**
 * Run: DATABASE_URL=postgresql://u:p@localhost:5432/x npx tsx server/maintenance/maintenanceFinanceEmails.test.ts
 */
import { __test } from "./maintenanceFinanceEmails";

const {
  escapeHtml,
  formatMoneyMinor,
  buildFinanceEmailHtml,
  vatLabel,
  OWNER_DECISION_LABELS,
} = __test;

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
check(vatLabel("standard_20").includes("20"), "vat label standard");
check(OWNER_DECISION_LABELS.approve === "Approved", "decision label Approved");
check(OWNER_DECISION_LABELS.reject === "Rejected", "decision label Rejected");
check(OWNER_DECISION_LABELS.request_changes === "Changes requested", "decision label Changes requested");

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
  detailTitle: "Quotation details",
  details: [
    { label: "Reference", value: "Q-2026-00089" },
    { label: "Decision", value: "Approved" },
  ],
  ctaLabel: "Open quotation",
  ctaUrl: "https://app.example/work-orders/wo1/quotes/q1",
});

check(html.includes("Quotation approved"), "headline present");
check(html.includes("Acme Lettings"), "org name present");
check(html.includes("Q-2026-00089"), "reference present");
check(html.includes("Approved"), "decision Approved casing");
check(!html.includes(">approve<") && !html.includes("Decision:</span>\n        <span style=\"color: #333; margin-left: 8px;\">approve"), "no raw approve");
check(!html.includes("Version"), "no Version in summary email");
check(!html.includes(" · v1") && !html.includes(">v1<"), "no version number");
check(html.includes("Open quotation"), "CTA present");
check(html.includes("https://app.example/work-orders/wo1/quotes/q1"), "CTA url present");
check(!html.includes("<script>"), "no raw script");

const receiptHtml = buildFinanceEmailHtml({
  branding: {
    displayName: "Receipt Org",
    accent: "#00D5CC",
    logoUrl: null,
    email: null,
    phone: null,
  },
  headline: "Quotation approved",
  greeting: "Hello,",
  intro: "An owner has approved this quotation. The itemised breakdown is below.",
  detailTitle: "Quotation details",
  details: [
    { label: "Reference", value: "Q-2026-00002" },
    { label: "Decision", value: "Approved" },
    { label: "Work", value: "Boiler repair" },
  ],
  receipt: {
    heroLabel: "Proposed total",
    currency: "GBP",
    subtotalMinor: 16750,
    taxMinor: 3350,
    totalMinor: 20100,
    totalLabel: "Total proposed",
    lines: [
      {
        name: "Labour call-out",
        description: "Diagnosis",
        quantity: 2,
        unitPriceMinor: 5000,
        vatRate: "standard_20",
        lineNetMinor: 10000,
        lineTotalMinor: 12000,
      },
    ],
  },
  ctaLabel: "Open quotation",
  ctaUrl: "https://app.example/work-orders/wo1/quotes/q1",
});

const heroAmount = formatMoneyMinor(20100, "GBP");
check(receiptHtml.includes("Proposed total"), "hero label");
check(receiptHtml.includes(heroAmount), "hero amount formatted");
check(receiptHtml.includes("Itemised breakdown"), "line table heading");
check(receiptHtml.includes("Labour call-out"), "line name present");
check(receiptHtml.includes("Total proposed"), "Total proposed footer label");
check(receiptHtml.includes("Approved"), "Approved in details");
check(!receiptHtml.includes("Version"), "no Version in receipt email");
check(!receiptHtml.includes("v1"), "no v1 in receipt email");
check(receiptHtml.includes("Subtotal"), "subtotal label");
check(receiptHtml.includes("VAT"), "vat label in totals");
check(receiptHtml.includes("Boiler repair"), "work in meta");

const customerQuote = buildFinanceEmailHtml({
  branding: {
    displayName: "Customer Org",
    accent: "#00D5CC",
    logoUrl: null,
    email: null,
    phone: null,
  },
  headline: "Quotation ready for your review",
  greeting: "Hello Sam,",
  intro: "Please review.",
  details: [{ label: "Reference", value: "Q-2026-00002" }],
  receipt: {
    heroLabel: "Proposed total",
    currency: "GBP",
    subtotalMinor: 10000,
    taxMinor: 2000,
    totalMinor: 12000,
    totalLabel: "Total proposed",
    lines: [
      {
        name: "Parts",
        quantity: 1,
        unitPriceMinor: 10000,
        vatRate: "standard_20",
        lineNetMinor: 10000,
        lineTotalMinor: 12000,
      },
    ],
  },
  ctaLabel: "View & respond",
  ctaUrl: "https://app.example/public/quotes/tok",
});
check(customerQuote.includes("Q-2026-00002"), "customer ref");
check(!customerQuote.includes(" · v"), "customer email no version suffix");
check(customerQuote.includes("Total proposed"), "customer Total proposed");

console.log(`maintenanceFinanceEmails: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
