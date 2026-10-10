import { escapeHtml } from "./creditRequestEmailEscape";

const NOT_PROVIDED = "Not provided";

export type OrganizationSignupEmailInput = {
  organizationName: string;
  organizationId: string;
  organizationCountryCode?: string | null;
  organizationCurrency?: string | null;
  subscriptionStatus?: string | null;
  trialEnforced?: boolean | null;
  trialStartAt?: Date | null;
  trialEndAt?: Date | null;
  registeredAt?: Date | null;
  userFullName?: string | null;
  userEmail: string;
  userPhone?: string | null;
  userId: string;
  userRole?: string | null;
  userSignedUpAt?: Date | null;
  signupSource?: string | null;
  adminUrl: string;
};

export type OrganizationSignupEmailContent = {
  subject: string;
  html: string;
  text: string;
};

function display(value: string | null | undefined): string {
  const trimmed = (value || "").trim();
  return trimmed || NOT_PROVIDED;
}

function formatUtc(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return NOT_PROVIDED;
  const when = date.toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${when} UTC`;
}

function formatTrialStatus(input: OrganizationSignupEmailInput): string {
  if (input.trialEnforced && input.trialEndAt) {
    return `Trial active until ${formatUtc(input.trialEndAt)}`;
  }
  if (input.subscriptionStatus) {
    return `Subscription: ${input.subscriptionStatus}`;
  }
  return NOT_PROVIDED;
}

export function buildOrganizationSignupEmail(
  input: OrganizationSignupEmailInput,
): OrganizationSignupEmailContent {
  const organizationName = display(input.organizationName) === NOT_PROVIDED
    ? "Organization"
    : input.organizationName.trim();
  const organizationId = display(input.organizationId);
  const country = display(input.organizationCountryCode);
  const currency = display(input.organizationCurrency);
  const contactEmail = display(input.userEmail);
  const contactPhone = display(input.userPhone);
  const registeredAt = formatUtc(input.registeredAt);
  const trialStatus = formatTrialStatus(input);
  const userName = display(input.userFullName);
  const userEmail = display(input.userEmail);
  const userPhone = display(input.userPhone);
  const userId = display(input.userId);
  const userRole = display(input.userRole);
  const userSignedUpAt = formatUtc(input.userSignedUpAt ?? input.registeredAt);
  const signupSource = display(input.signupSource);
  const adminUrl = (input.adminUrl || "").trim();

  const subject = `Inspect360 — New Organization Signup: ${organizationName}`;

  const text = [
    "New Organization Registered",
    "",
    "A new organization has successfully registered with Inspect360.",
    "",
    "Organization Details",
    `Organization name: ${organizationName}`,
    `Organization reference: ${organizationId}`,
    `Contact email: ${contactEmail}`,
    `Contact number: ${contactPhone}`,
    `Country / region: ${country}`,
    `Preferred currency: ${currency}`,
    `Registration date: ${registeredAt}`,
    `Current status: ${trialStatus}`,
    "",
    "Registered By",
    `Full name: ${userName}`,
    `Email: ${userEmail}`,
    `Contact number: ${userPhone}`,
    `User reference: ${userId}`,
    `Assigned role: ${userRole}`,
    `Signup date: ${userSignedUpAt}`,
    `Signup source: ${signupSource}`,
    "",
    adminUrl ? `View in Admin Portal: ${adminUrl}` : "",
  ]
    .filter((line, index, arr) => !(line === "" && arr[index - 1] === ""))
    .join("\n");

  const row = (label: string, value: string) =>
    `<p style="margin:0 0 8px 0;"><strong>${escapeHtml(label)}</strong><br>${escapeHtml(value)}</p>`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: #ffffff; border-radius: 8px; padding: 32px;">
    <p style="margin: 0 0 8px 0; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #3B7A8C;">Inspect360</p>
    <h1 style="margin: 0 0 12px 0; font-size: 20px;">New Organization Registered</h1>
    <p style="margin: 0 0 20px 0; color: #555;">A new organization has successfully registered with Inspect360.</p>
    <h2 style="margin: 0 0 12px 0; font-size: 16px;">Organization Details</h2>
    ${row("Organization name", organizationName)}
    ${row("Organization reference", organizationId)}
    ${row("Contact email", contactEmail)}
    ${row("Contact number", contactPhone)}
    ${row("Country / region", country)}
    ${row("Preferred currency", currency)}
    ${row("Registration date", registeredAt)}
    ${row("Current status", trialStatus)}
    <h2 style="margin: 24px 0 12px 0; font-size: 16px;">Registered By</h2>
    ${row("Full name", userName)}
    ${row("Email", userEmail)}
    ${row("Contact number", userPhone)}
    ${row("User reference", userId)}
    ${row("Assigned role", userRole)}
    ${row("Signup date", userSignedUpAt)}
    ${row("Signup source", signupSource)}
    ${
      adminUrl
        ? `<p style="margin: 28px 0 0 0;">
      <a href="${escapeHtml(adminUrl)}" style="display: inline-block; background: #04C6BD; color: #021F36; text-decoration: none; font-weight: 600; padding: 12px 18px; border-radius: 6px;">View Organization in Admin Portal</a>
    </p>`
        : ""
    }
    <p style="margin: 28px 0 0 0; font-size: 12px; color: #888;">This notification was sent to Inspect360 platform administrators.</p>
  </div>
</body>
</html>`;

  return { subject, html, text };
}
