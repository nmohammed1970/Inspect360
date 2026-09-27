import { escapeHtml } from "./creditRequestEmailEscape";

export type CreditRequestEmailInput = {
  organizationName: string;
  requesterName: string;
  requesterEmail: string;
  contactPhone?: string | null;
  creditsRequested: number;
  message: string;
  requestedAt: Date;
  adminUrl: string;
};

export type CreditRequestEmailContent = {
  subject: string;
  html: string;
  text: string;
};

export function buildCreditRequestEmail(input: CreditRequestEmailInput): CreditRequestEmailContent {
  const organization = input.organizationName.trim() || "Organization";
  const name = input.requesterName.trim() || "User";
  const email = input.requesterEmail.trim();
  const phone = (input.contactPhone || "").trim() || "—";
  const units = String(input.creditsRequested);
  const message = input.message.trim();
  const when = input.requestedAt.toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const subject = `New Credit Purchase Request - ${organization}`;
  const text = [
    "New Credit Purchase Request",
    "",
    `Organization: ${organization}`,
    `Requested By: ${name}`,
    `Email: ${email}`,
    `Contact Number: ${phone}`,
    `Properties / Units: ${units}`,
    `Request Date: ${when} UTC`,
    "",
    "Message:",
    message,
    "",
    "Status: REQUESTED",
    "",
    "Note: Allocate credits based on the reported property / unit count.",
    "",
    `Review: ${input.adminUrl}`,
  ].join("\n");

  const row = (label: string, value: string) =>
    `<p style="margin:0 0 8px 0;"><strong>${escapeHtml(label)}</strong><br>${escapeHtml(value)}</p>`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: #ffffff; border-radius: 8px; padding: 32px;">
    <p style="margin: 0 0 8px 0; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #3B7A8C;">Inspect360</p>
    <h1 style="margin: 0 0 16px 0; font-size: 20px;">New Credit Purchase Request</h1>
    ${row("Organization", organization)}
    ${row("Requested By", name)}
    ${row("Email", email)}
    ${row("Contact Number", phone)}
    ${row("Properties / Units", units)}
    ${row("Request Date", `${when} UTC`)}
    <p style="margin:16px 0 8px 0;"><strong>Message</strong></p>
    <p style="margin:0 0 16px 0; white-space: pre-wrap;">${escapeHtml(message)}</p>
    ${row("Status", "REQUESTED")}
    <p style="margin:16px 0 0 0; font-size: 13px; color: #555;">Allocate credits based on the reported property / unit count.</p>
    <p style="margin: 28px 0 0 0;">
      <a href="${escapeHtml(input.adminUrl)}" style="display: inline-block; background: #04C6BD; color: #021F36; text-decoration: none; font-weight: 600; padding: 12px 18px; border-radius: 6px;">Review request</a>
    </p>
  </div>
</body>
</html>`;

  return { subject, html, text };
}
