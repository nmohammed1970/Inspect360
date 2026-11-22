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

function buildFinanceEmailHtml(input: {
  branding: Branding;
  headline: string;
  greeting: string;
  intro: string;
  detailTitle?: string;
  details: DetailRow[];
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
    <p style="margin: 0 0 24px 0; font-size: 16px; color: #444;">${escapeHtml(input.intro)}</p>

    <div style="background-color: #f8f9fa; border-left: 4px solid ${escapeHtml(accent)}; padding: 20px; border-radius: 4px; margin-bottom: 24px;">
      ${input.detailTitle ? `<h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1a1a1a;">${escapeHtml(input.detailTitle)}</h2>` : ""}
      ${renderDetailRows(input.details)}
    </div>

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
  totalMinor: number;
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
  const intro = input.isResend
    ? `${branding.displayName} has sent an updated quotation. Please review the details and respond using the button below. A PDF copy is attached.`
    : `${branding.displayName} has prepared a quotation for your review. Please check the details and respond using the button below. A PDF copy is attached for your records.`;

  const html = buildFinanceEmailHtml({
    branding,
    headline,
    greeting: `Hello ${name},`,
    intro,
    detailTitle: "Quotation details",
    details: [
      { label: "Reference", value: `${input.quoteReference} · v${input.versionNumber}` },
      { label: "Proposed total", value: formatMoneyMinor(input.totalMinor, input.currency) },
      ...(input.issueTitle ? [{ label: "Work", value: input.issueTitle }] : []),
      ...(input.locationLabel ? [{ label: "Location", value: input.locationLabel }] : []),
      ...(input.expiresAt
        ? [
            {
              label: "Link expires",
              value: input.expiresAt.toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            },
          ]
        : []),
    ],
    note: "You can accept, decline, or request changes on the secure page — no login required.",
    ctaLabel: "View & respond",
    ctaUrl: input.publicLink,
  });

  await sendEmail({
    to: input.to,
    subject: `${headline} — ${input.quoteReference}`,
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
  totalMinor: number;
  dueAt?: Date | null;
  publicLink: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
  baseUrl?: string;
}): Promise<void> {
  const branding = await loadBranding(input.organizationId);
  const name = (input.recipientName || "").trim() || "there";
  const headline = `Invoice from ${branding.displayName}`;

  const html = buildFinanceEmailHtml({
    branding,
    headline,
    greeting: `Hello ${name},`,
    intro: `Please find your invoice from ${branding.displayName}. A PDF copy is attached, and you can also view it online using the button below.`,
    detailTitle: "Invoice details",
    details: [
      { label: "Invoice", value: input.invoiceReference },
      { label: "Amount due", value: formatMoneyMinor(input.totalMinor, input.currency) },
      ...(input.dueAt
        ? [
            {
              label: "Due by",
              value: input.dueAt.toLocaleDateString("en-GB", { dateStyle: "medium" }),
            },
          ]
        : []),
    ],
    note: "If you have questions about this invoice, please reply to the organisation contact listed below.",
    ctaLabel: "View invoice",
    ctaUrl: input.publicLink,
  });

  await sendEmail({
    to: input.to,
    subject: `${headline} — ${input.invoiceReference}`,
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
};
