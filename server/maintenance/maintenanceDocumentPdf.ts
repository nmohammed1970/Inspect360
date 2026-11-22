import { withPdfPage } from "../pdfBrowserPool";
import { MAINTENANCE_PRICE_BOOK_VAT_LABELS } from "@shared/maintenancePriceBookConstants";

export type PdfOrgBrand = {
  name: string;
  brandingName?: string | null;
  brandingEmail?: string | null;
  brandingPhone?: string | null;
  brandingAddress?: string | null;
};

export type PdfLine = {
  name: string;
  description?: string | null;
  category?: string | null;
  quantity: number;
  unit?: string | null;
  unitPriceMinor: number;
  vatRate: string;
  lineNetMinor: number;
  lineTaxMinor: number;
  lineTotalMinor: number;
};

export type PdfDocCommon = {
  documentKind: "quote" | "invoice";
  reference: string;
  versionLabel?: string | null;
  currency: string;
  recipientName?: string | null;
  recipientEmail?: string | null;
  recipientAddress?: string | null;
  scopeOrNotes?: string | null;
  locationLabel?: string | null;
  issueTitle?: string | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  status?: string | null;
  generatedAt?: Date;
  lines: PdfLine[];
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoneyMinor(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format((Number(minor) || 0) / 100);
  } catch {
    return `${((Number(minor) || 0) / 100).toFixed(2)} ${currency}`;
  }
}

function vatLabel(vatRate: string): string {
  return (
    (MAINTENANCE_PRICE_BOOK_VAT_LABELS as Record<string, string>)[vatRate] ||
    vatRate
  );
}

export function buildMaintenanceDocumentHtml(
  org: PdfOrgBrand,
  doc: PdfDocCommon,
): string {
  const company = org.brandingName || org.name || "Inspect360";
  const title = doc.documentKind === "quote" ? "Quotation" : "Invoice";
  const when = (doc.generatedAt || new Date()).toLocaleString("en-GB");

  const lineRows = doc.lines
    .map((line) => {
      const detail = [line.category, line.unit].filter(Boolean).join(" · ");
      return `<tr>
        <td>
          <div class="line-name">${escapeHtml(line.name || "Item")}</div>
          ${line.description ? `<div class="muted">${escapeHtml(line.description)}</div>` : ""}
          ${detail ? `<div class="muted">${escapeHtml(detail)} · ${escapeHtml(vatLabel(line.vatRate))}</div>` : ""}
        </td>
        <td class="num">${escapeHtml(String(line.quantity))}</td>
        <td class="num">${escapeHtml(formatMoneyMinor(line.unitPriceMinor, doc.currency))}</td>
        <td class="num">${escapeHtml(formatMoneyMinor(line.lineNetMinor, doc.currency))}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #1a1a1a;
      margin: 0;
      padding: 32px;
      font-size: 12px;
      line-height: 1.45;
    }
    .header {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      border-bottom: 3px solid #0d9488;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .brand { font-size: 20px; font-weight: 700; color: #0f766e; }
    .brand-meta { color: #666; margin-top: 6px; font-size: 11px; }
    .doc-title { text-align: right; }
    .doc-title h1 { margin: 0; font-size: 22px; }
    .doc-title .ref { font-size: 14px; font-weight: 600; margin-top: 4px; }
    .muted { color: #666; font-size: 11px; }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 20px;
    }
    .box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .box h3 {
      margin: 0 0 8px 0;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    th {
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
      border-bottom: 1px solid #cbd5e1;
      padding: 8px 6px;
    }
    td {
      border-bottom: 1px solid #e2e8f0;
      padding: 10px 6px;
      vertical-align: top;
    }
    .line-name { font-weight: 600; }
    .num { text-align: right; white-space: nowrap; }
    .totals {
      width: 280px;
      margin-left: auto;
      margin-top: 16px;
    }
    .totals .row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
    }
    .totals .grand {
      font-size: 14px;
      font-weight: 700;
      border-top: 2px solid #0d9488;
      margin-top: 6px;
      padding-top: 8px;
    }
    .footer {
      margin-top: 28px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      color: #94a3b8;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">${escapeHtml(company)}</div>
      <div class="brand-meta">
        ${org.brandingAddress ? `${escapeHtml(org.brandingAddress)}<br/>` : ""}
        ${org.brandingEmail ? escapeHtml(org.brandingEmail) : ""}
        ${org.brandingPhone ? ` · ${escapeHtml(org.brandingPhone)}` : ""}
      </div>
    </div>
    <div class="doc-title">
      <h1>${escapeHtml(title)}</h1>
      <div class="ref">${escapeHtml(doc.reference)}${doc.versionLabel ? ` · ${escapeHtml(doc.versionLabel)}` : ""}</div>
      ${doc.status ? `<div class="muted">Status: ${escapeHtml(doc.status)}</div>` : ""}
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <h3>${doc.documentKind === "quote" ? "Bill / quote to" : "Bill to"}</h3>
      <div><strong>${escapeHtml(doc.recipientName || "—")}</strong></div>
      ${doc.recipientEmail ? `<div class="muted">${escapeHtml(doc.recipientEmail)}</div>` : ""}
      ${doc.recipientAddress ? `<div class="muted">${escapeHtml(doc.recipientAddress)}</div>` : ""}
    </div>
    <div class="box">
      <h3>Work details</h3>
      ${doc.issueTitle ? `<div><strong>${escapeHtml(doc.issueTitle)}</strong></div>` : ""}
      ${doc.locationLabel ? `<div class="muted">${escapeHtml(doc.locationLabel)}</div>` : ""}
      ${doc.scopeOrNotes ? `<div style="margin-top:8px;white-space:pre-wrap">${escapeHtml(doc.scopeOrNotes)}</div>` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Rate</th>
        <th class="num">Net</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows || `<tr><td colspan="4" class="muted">No line items</td></tr>`}
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${escapeHtml(formatMoneyMinor(doc.subtotalMinor, doc.currency))}</span></div>
    <div class="row"><span>VAT</span><span>${escapeHtml(formatMoneyMinor(doc.taxMinor, doc.currency))}</span></div>
    <div class="row grand"><span>Total</span><span>${escapeHtml(formatMoneyMinor(doc.totalMinor, doc.currency))}</span></div>
  </div>

  <div class="footer">Generated ${escapeHtml(when)} · ${escapeHtml(company)}</div>
</body>
</html>`;
}

export async function renderMaintenancePdf(html: string): Promise<Buffer> {
  const bytes = await withPdfPage(async (page) => {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    return page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
  });
  return Buffer.from(bytes);
}

export function quotePdfFilename(reference: string): string {
  return `${reference.replace(/[^\w.-]+/g, "_")}.pdf`;
}

export function invoicePdfFilename(reference: string): string {
  return `${reference.replace(/[^\w.-]+/g, "_")}.pdf`;
}
