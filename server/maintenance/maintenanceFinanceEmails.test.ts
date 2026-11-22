/**
 * Run: DATABASE_URL=postgresql://u:p@localhost:5432/x npx tsx server/maintenance/maintenanceFinanceEmails.test.ts
 */
import { __test } from "./maintenanceFinanceEmails";

const { escapeHtml, formatMoneyMinor, buildFinanceEmailHtml, vatLabel } = __test;

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

const receiptHtml = buildFinanceEmailHtml({
  branding: {
    displayName: "Receipt Org",
    accent: "#00D5CC",
    logoUrl: null,
    email: null,
    phone: null,
  },
  headline: "Quotation ready for your review",
  greeting: "Hello Alex,",
  intro: "Receipt Org has prepared a quotation for your review.",
  introExtra: "A PDF copy is attached for your records.",
  detailTitle: "Quotation details",
  details: [
    { label: "Reference", value: "Q-1 · v1" },
    { label: "Work", value: "Boiler repair <test>" },
  ],
  receipt: {
    heroLabel: "Proposed total",
    currency: "GBP",
    subtotalMinor: 16750,
    taxMinor: 3350,
    totalMinor: 20100,
    lines: [
      {
        name: 'Labour <script>x</script>',
        description: "Call-out & diagnosis",
        quantity: 2,
        unitPriceMinor: 5000,
        vatRate: "standard_20",
        lineNetMinor: 10000,
        lineTotalMinor: 12000,
      },
      {
        name: "Parts",
        description: null,
        quantity: 1,
        unitPriceMinor: 6750,
        vatRate: "standard_20",
        lineNetMinor: 6750,
        lineTotalMinor: 8100,
      },
    ],
  },
  note: "Please respond before the link expires.",
  ctaLabel: "View & respond",
  ctaUrl: "https://app.example/public/quotes/tok",
});

const heroAmount = formatMoneyMinor(20100, "GBP");
check(receiptHtml.includes("Proposed total"), "hero label");
check(receiptHtml.includes(heroAmount), "hero amount formatted");
check(receiptHtml.includes("Itemised breakdown"), "line table heading");
check(receiptHtml.includes("Labour &lt;script&gt;x&lt;/script&gt;"), "line name escaped");
check(!receiptHtml.includes("<script>x</script>"), "no raw script in line name");
check(receiptHtml.includes("Boiler repair &lt;test&gt;"), "meta work escaped");
check(receiptHtml.includes("Subtotal"), "subtotal label");
check(receiptHtml.includes("VAT"), "vat label in totals");
check(receiptHtml.includes(">Total<") || receiptHtml.includes(">Total</td>"), "total label");
check(receiptHtml.includes(formatMoneyMinor(16750, "GBP")), "subtotal amount");
check(receiptHtml.includes(formatMoneyMinor(3350, "GBP")), "vat amount");
check(receiptHtml.includes("A PDF copy is attached"), "intro extra present");
check(receiptHtml.includes("View &amp; respond") || receiptHtml.includes("View & respond"), "CTA present");

const invoiceReceipt = buildFinanceEmailHtml({
  branding: {
    displayName: "Invoice Org",
    accent: "#00D5CC",
    logoUrl: null,
    email: "accounts@invoice.test",
    phone: null,
  },
  headline: "Invoice from Invoice Org",
  greeting: "Hello,",
  intro: "Please find your invoice.",
  details: [{ label: "Invoice", value: "INV-9" }],
  receipt: {
    heroLabel: "Amount due",
    currency: "GBP",
    subtotalMinor: 10000,
    taxMinor: 2000,
    totalMinor: 12000,
    lines: [
      {
        name: "Emergency call-out",
        quantity: 1,
        unitPriceMinor: 10000,
        vatRate: "standard_20",
        lineNetMinor: 10000,
        lineTotalMinor: 12000,
      },
    ],
  },
  ctaLabel: "View invoice",
  ctaUrl: "https://app.example/public/invoices/tok",
});
check(invoiceReceipt.includes("Amount due"), "invoice hero label");
check(invoiceReceipt.includes("Emergency call-out"), "invoice line name");
check(invoiceReceipt.includes(formatMoneyMinor(12000, "GBP")), "invoice total");

console.log(`maintenanceFinanceEmails: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
