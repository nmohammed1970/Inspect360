import { MAINTENANCE_PRICE_BOOK_VAT_LABELS } from "@shared/maintenancePriceBookConstants";
import { sendEmail } from "../resend";
import { storage } from "../storage";
import { publicAppBaseUrl } from "./quoteLifecycle";

type Branding = {
  displayName: string;
  accent: string;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
};

type DetailRow = { label: string; value: string };

export type FinanceEmailLine = {
  name: string;
  description?: string | null;
  quantity: number | string;
  unitPriceMinor: number;
  vatRate: string;
  lineNetMinor: number;
  lineTotalMinor: number;
};

type ReceiptBlock = {
  heroLabel: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: FinanceEmailLine[];
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isHttpsUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https:\/\//i.test(url.trim());
}

function isHexColor(color: string | null | undefined): color is string {
  return typeof color === "string" && /^#[0-9A-Fa-f]{6}$/.test(color.trim());
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
    (MAINTENANCE_PRICE_BOOK_VAT_LABELS as Record<string, string>)[vatRate] || vatRate
  );
}

async function loadBranding(organizationId: string): Promise<Branding> {
  const org = await storage.getOrganization(organizationId);
  return {
    displayName: (org?.brandingName || org?.name || "Inspect360").trim(),
    accent: isHexColor(org?.brandingPrimaryColor) ? org!.brandingPrimaryColor!.trim() : "#00D5CC",
    logoUrl: isHttpsUrl(org?.logoUrl) ? org!.logoUrl!.trim() : null,
    email: org?.brandingEmail || null,
    phone: org?.brandingPhone || null,
  };
}

function renderDetailRows(rows: DetailRow[]): string {
  return rows
    .filter((r) => r.value && String(r.value).trim())
    .map(
      (r) => `
      <div style="margin-bottom: 12px;">
        <span style="font-weight: 600; color: #555;">${escapeHtml(r.label)}:</span>
        <span style="color: #333; margin-left: 8px;">${escapeHtml(r.value)}</span>
      </div>`,
    )
    .join("");
}

function renderReceiptBlock(receipt: ReceiptBlock, accent: string): string {
  const totalFormatted = formatMoneyMinor(receipt.totalMinor, receipt.currency);
  const lineRows =
    receipt.lines.length === 0
      ? `<tr>
          <td colspan="4" style="padding: 14px; color: #888; text-align: center; font-size: 14px;">
            No line items
          </td>
        </tr>`
      : receipt.lines
          .map((line) => {
            const desc = (line.description || "").trim();
            const vat = vatLabel(String(line.vatRate || ""));
            return `<tr>
              <td style="padding: 12px; border-bottom: 1px solid #eee; vertical-align: top;">
                <div style="font-weight: 600; color: #1a1a1a; font-size: 14px;">${escapeHtml(line.name || "Item")}</div>
                ${desc ? `<div style="font-size: 12px; color: #888; margin-top: 2px;">${escapeHtml(desc)}</div>` : ""}
                <div style="font-size: 11px; color: #aaa; margin-top: 2px;">${escapeHtml(vat)}</div>
              </td>
              <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center; vertical-align: top; font-size: 14px; color: #333;">
                ${escapeHtml(String(line.quantity))}
              </td>
              <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; vertical-align: top; font-size: 14px; color: #333; white-space: nowrap;">
                ${escapeHtml(formatMoneyMinor(line.unitPriceMinor, receipt.currency))}
              </td>
              <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; vertical-align: top; font-size: 14px; font-weight: 600; color: #1a1a1a; white-space: nowrap;">
                ${escapeHtml(formatMoneyMinor(line.lineNetMinor, receipt.currency))}
              </td>
            </tr>`;
          })
          .join("");

  return `
    <div style="background: linear-gradient(135deg, ${escapeHtml(accent)} 0%, #3B7A8C 100%); color: #ffffff; padding: 24px; border-radius: 8px; margin-bottom: 24px; text-align: center;">
      <p style="margin: 0 0 8px 0; font-size: 13px; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px;">
        ${escapeHtml(receipt.heroLabel)}
      </p>
      <p style="margin: 0; font-size: 36px; font-weight: 700; line-height: 1.2;">
        ${escapeHtml(totalFormatted)}
      </p>
    </div>

    <div style="margin-bottom: 24px;">
      <h2 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 700; color: ${escapeHtml(accent)}; text-transform: uppercase; letter-spacing: 0.5px;">
        Itemised breakdown
      </h2>
      <table style="width: 100%; border-collapse: collapse; background-color: #fff; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background-color: #f9fafb;">
            <th style="padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #666; font-weight: 600;">Item</th>
            <th style="padding: 10px 12px; text-align: center; font-size: 11px; text-transform: uppercase; color: #666; font-weight: 600;">Qty</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 11px; text-transform: uppercase; color: #666; font-weight: 600;">Unit</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 11px; text-transform: uppercase; color: #666; font-weight: 600;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineRows}
        </tbody>
      </table>
    </div>

    <div style="background-color: #f0fdfa; border: 1px solid ${escapeHtml(accent)}; padding: 16px 20px; border-radius: 8px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #666; font-size: 14px;">Subtotal</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600; font-size: 14px; color: #333;">
            ${escapeHtml(formatMoneyMinor(receipt.subtotalMinor, receipt.currency))}
          </td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #666; font-size: 14px;">VAT</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600; font-size: 14px; color: #333;">
            ${escapeHtml(formatMoneyMinor(receipt.taxMinor, receipt.currency))}
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 0 0 0; font-weight: 700; font-size: 16px; color: #1a1a1a; border-top: 1px dashed #ccc;">Total</td>
          <td style="padding: 10px 0 0 0; text-align: right; font-weight: 700; font-size: 18px; color: ${escapeHtml(accent)}; border-top: 1px dashed #ccc;">
            ${escapeHtml(totalFormatted)}
          </td>
        </tr>
      </table>
    </div>`;
}

function buildFinanceEmailHtml(input: {
  branding: Branding;
  headline: string;
  greeting: string;
  intro: string;
  introExtra?: string | null;
  detailTitle?: string;
  details: DetailRow[];
  receipt?: ReceiptBlock | null;
  note?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}): string {
  const { branding } = input;
  const accent = branding.accent;
  const logoBlock = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.displayName)}" style="max-height: 56px; max-width: 180px; margin: 0 auto 12px; display: block;" />`
    : `<div style="width: 64px; height: 64px; background: linear-gradient(135deg, ${escapeHtml(accent)} 0%, #3B7A8C 100%); border-radius: 50%; margin: 0 auto 16px;"></div>`;

  const cta =
    input.ctaLabel && input.ctaUrl
      ? `<div style="text-align: center; margin: 32px 0;">
          <a href="${escapeHtml(input.ctaUrl)}"
             style="display: inline-block; background: linear-gradient(135deg, ${escapeHtml(accent)} 0%, #3B7A8C 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
            ${escapeHtml(input.ctaLabel)}
          </a>
        </div>`
      : "";

  const contactBits = [branding.email, branding.phone].filter(Boolean).join(" · ");
  const receiptHtml = input.receipt ? renderReceiptBlock(input.receipt, accent) : "";
  const detailsHtml =
    input.details.length > 0
      ? `<div style="background-color: #f8f9fa; border-left: 4px solid ${escapeHtml(accent)}; padding: 20px; border-radius: 4px; margin-bottom: 24px;">
          ${input.detailTitle ? `<h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1a1a1a;">${escapeHtml(input.detailTitle)}</h2>` : ""}
          ${renderDetailRows(input.details)}
        </div>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(input.headline)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 28px;">
      ${logoBlock}
      <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: ${escapeHtml(accent)}; letter-spacing: 0.02em;">
        ${escapeHtml(branding.displayName)}
      </p>
      <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #1a1a1a;">${escapeHtml(input.headline)}</h1>
    </div>

    <p style="margin: 0 0 12px 0; font-size: 16px;">${escapeHtml(input.greeting)}</p>
    <p style="margin: 0 0 12px 0; font-size: 16px; color: #444;">${escapeHtml(input.intro)}</p>
    ${input.introExtra ? `<p style="margin: 0 0 24px 0; font-size: 15px; color: #555;">${escapeHtml(input.introExtra)}</p>` : `<div style="margin-bottom: 12px;"></div>`}

    ${receiptHtml}
    ${detailsHtml}

    ${input.note ? `<p style="margin: 0 0 8px 0; font-size: 14px; color: #555;">${escapeHtml(input.note)}</p>` : ""}
    ${cta}

    <div style="border-top: 1px solid #e5e5e5; padding-top: 20px; margin-top: 28px;">
      <p style="margin: 0 0 6px 0; font-size: 13px; color: #888; text-align: center;">
        Sent by <strong style="color: ${escapeHtml(accent)};">${escapeHtml(branding.displayName)}</strong> via Inspect360
      </p>
      ${contactBits ? `<p style="margin: 0 0 6px 0; font-size: 12px; color: #aaa; text-align: center;">${escapeHtml(contactBits)}</p>` : ""}
      <p style="margin: 0; font-size: 11px; color: #aaa; text-align: center;">
        © ${new Date().getFullYear()} Inspect360. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function mapEmailLines(
  lines: Array<{
    name?: string | null;
    description?: string | null;
    quantity?: number | string | null;
    unitPriceMinor?: number | null;
    vatRate?: string | null;
    lineNetMinor?: number | null;
    lineTotalMinor?: number | null;
  }>,
): FinanceEmailLine[] {
  return lines.map((line) => ({
    name: (line.name || "").trim() || "Item",
    description: line.description ?? null,
    quantity: line.quantity == null ? 0 : line.quantity,
    unitPriceMinor: Number(line.unitPriceMinor) || 0,
    vatRate: String(line.vatRate || "standard_20"),
    lineNetMinor: Number(line.lineNetMinor) || 0,
    lineTotalMinor: Number(line.lineTotalMinor) || 0,
  }));
}

function staffQuoteUrl(
  baseUrl: string,
  workOrderId: string,
  quoteId: string,
): string {
  return `${baseUrl}/work-orders/${workOrderId}/quotes/${quoteId}`;
}

export async function sendQuoteOwnerDecisionEmail(input: {
  to: string;
  organizationId: string;
  workOrderId: string;
  quoteId: string;
  quoteReference: string;
  versionNumber: number;
  decision: "approve" | "reject" | "request_changes";
  reason?: string | null;
  baseUrl?: string;
}): Promise<void> {
  const branding = await loadBranding(input.organizationId);
  const base = input.baseUrl || publicAppBaseUrl();
  const headlines = {
    approve: "Quotation approved",
    reject: "Quotation rejected",
    request_changes: "Changes requested on quotation",
  } as const;
  const intros = {
    approve:
      "Good news — an owner has approved this quotation. You can now send it to the customer when ready.",
    reject: "An owner has rejected this quotation. Please review the reason and create a revision if needed.",
    request_changes:
      "An owner has requested changes before this quotation can be approved. Please update the draft and resubmit.",
  } as const;

  const html = buildFinanceEmailHtml({
    branding,
    headline: headlines[input.decision],
    greeting: "Hello,",
    intro: intros[input.decision],
    detailTitle: "Quotation summary",
    details: [
      { label: "Reference", value: input.quoteReference },
      { label: "Version", value: `v${input.versionNumber}` },
      { label: "Decision", value: input.decision.replace(/_/g, " ") },
      ...(input.reason?.trim()
        ? [{ label: "Reason", value: input.reason.trim() }]
        : []),
    ],
    ctaLabel: "Open quotation",
    ctaUrl: staffQuoteUrl(base, input.workOrderId, input.quoteId),
  });

  await sendEmail({
    to: input.to,
    subject: `${headlines[input.decision]} — ${input.quoteReference}`,
    html,
  });
}

export async function sendQuoteToCustomerEmail(input: {
  to: string;
  recipientName?: string | null;
  organizationId: string;
  quoteReference: string;
  versionNumber: number;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: FinanceEmailLine[] | Array<Record<string, unknown>>;
  publicLink: string;
  expiresAt?: Date | null;
  isResend?: boolean;
  locationLabel?: string | null;
  issueTitle?: string | null;
  attachments?: Array<{ filename: string; content: Buffer }>;
}): Promise<void> {
  const branding = await loadBranding(input.organizationId);
  const name = (input.recipientName || "").trim() || "there";
  const headline = input.isResend
    ? "Updated quotation for your review"
    : "Quotation ready for your review";
  const totalLabel = formatMoneyMinor(input.totalMinor, input.currency);
  const intro = input.isResend
    ? `${branding.displayName} has sent an updated quotation (${input.quoteReference}). Please review the revised itemised breakdown and proposed total of ${totalLabel} below.`
    : `${branding.displayName} has prepared a quotation (${input.quoteReference}) for your review. The itemised work and proposed total of ${totalLabel} are summarised below.`;
  const introExtra =
    "A PDF copy is attached for your records. You can accept, decline, or request changes using the secure link — no login required.";

  const expiryLine = input.expiresAt
    ? input.expiresAt.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const html = buildFinanceEmailHtml({
    branding,
    headline,
    greeting: `Hello ${name},`,
    intro,
    introExtra,
    detailTitle: "Quotation details",
    details: [
      { label: "Reference", value: `${input.quoteReference} · v${input.versionNumber}` },
      ...(input.issueTitle ? [{ label: "Work", value: input.issueTitle }] : []),
      ...(input.locationLabel ? [{ label: "Location", value: input.locationLabel }] : []),
      ...(expiryLine ? [{ label: "Link expires", value: expiryLine }] : []),
    ],
    receipt: {
      heroLabel: "Proposed total",
      currency: input.currency,
      subtotalMinor: input.subtotalMinor,
      taxMinor: input.taxMinor,
      totalMinor: input.totalMinor,
      lines: mapEmailLines(input.lines as FinanceEmailLine[]),
    },
    note: expiryLine
      ? `Please respond before the link expires on ${expiryLine}.`
      : "Please review and respond at your earliest convenience.",
    ctaLabel: "View & respond",
    ctaUrl: input.publicLink,
  });

  await sendEmail({
    to: input.to,
    subject: `${headline} — ${input.quoteReference} (${totalLabel})`,
    html,
    attachments: input.attachments,
  });
}

export async function sendQuoteCustomerResponseEmail(input: {
  to: string;
  organizationId: string;
  workOrderId: string;
  quoteId: string;
  quoteReference: string;
  decision: "accept" | "decline" | "request_changes";
  reason?: string | null;
  baseUrl?: string;
}): Promise<void> {
  const branding = await loadBranding(input.organizationId);
  const base = input.baseUrl || publicAppBaseUrl();
  const headlines = {
    accept: "Customer accepted quotation",
    decline: "Customer declined quotation",
    request_changes: "Customer requested changes",
  } as const;
  const intros = {
    accept:
      "The customer has accepted this quotation. Work can now be authorised and you may convert it to an invoice when ready.",
    decline:
      "The customer has declined this quotation. Review their feedback and create a revision if appropriate.",
    request_changes:
      "The customer has asked for changes. Please revise the quotation, resubmit for owner approval, then send again.",
  } as const;

  const html = buildFinanceEmailHtml({
    branding,
    headline: headlines[input.decision],
    greeting: "Hello,",
    intro: intros[input.decision],
    detailTitle: "Response summary",
    details: [
      { label: "Reference", value: input.quoteReference },
      { label: "Customer decision", value: input.decision.replace(/_/g, " ") },
      ...(input.reason?.trim()
        ? [{ label: "Their note", value: input.reason.trim() }]
        : []),
    ],
    ctaLabel: "Open quotation",
    ctaUrl: staffQuoteUrl(base, input.workOrderId, input.quoteId),
  });

  await sendEmail({
    to: input.to,
    subject: `${headlines[input.decision]} — ${input.quoteReference}`,
    html,
  });
}

export async function sendInvoiceToCustomerEmail(input: {
  to: string;
  recipientName?: string | null;
  organizationId: string;
  workOrderId: string;
  invoiceId: string;
  invoiceReference: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: FinanceEmailLine[] | Array<Record<string, unknown>>;
  dueAt?: Date | null;
  publicLink: string;
  locationLabel?: string | null;
  issueTitle?: string | null;
  attachments?: Array<{ filename: string; content: Buffer }>;
  baseUrl?: string;
}): Promise<void> {
  const branding = await loadBranding(input.organizationId);
  const name = (input.recipientName || "").trim() || "there";
  const headline = `Invoice from ${branding.displayName}`;
  const totalLabel = formatMoneyMinor(input.totalMinor, input.currency);
  const dueLine = input.dueAt
    ? input.dueAt.toLocaleDateString("en-GB", { dateStyle: "medium" })
    : null;

  const intro = `Please find your invoice ${input.invoiceReference} from ${branding.displayName}. The amount due is ${totalLabel}${dueLine ? `, payable by ${dueLine}` : ""}.`;
  const introExtra =
    "The itemised charges are summarised below, and a PDF copy is attached for your records. You can also view the full invoice online.";

  const html = buildFinanceEmailHtml({
    branding,
    headline,
    greeting: `Hello ${name},`,
    intro,
    introExtra,
    detailTitle: "Invoice details",
    details: [
      { label: "Invoice", value: input.invoiceReference },
      ...(input.issueTitle ? [{ label: "Work", value: input.issueTitle }] : []),
      ...(input.locationLabel ? [{ label: "Location", value: input.locationLabel }] : []),
      ...(dueLine ? [{ label: "Due by", value: dueLine }] : []),
    ],
    receipt: {
      heroLabel: "Amount due",
      currency: input.currency,
      subtotalMinor: input.subtotalMinor,
      taxMinor: input.taxMinor,
      totalMinor: input.totalMinor,
      lines: mapEmailLines(input.lines as FinanceEmailLine[]),
    },
    note: "If you have questions about this invoice, please contact the organisation using the details below.",
    ctaLabel: "View invoice",
    ctaUrl: input.publicLink,
  });

  await sendEmail({
    to: input.to,
    subject: `${headline} — ${input.invoiceReference} (${totalLabel})`,
    html,
    attachments: input.attachments,
  });
}

/** Exported for light smoke checks / tests. */
export const __test = {
  escapeHtml,
  formatMoneyMinor,
  buildFinanceEmailHtml,
  loadBranding,
  mapEmailLines,
  vatLabel,
};
