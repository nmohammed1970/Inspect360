import { getTeamRoleDisplayLabel } from "@shared/roleLabels";
import { escapeHtml } from "./creditRequestEmailEscape";

export type TeamMemberWelcomeEmailInput = {
  recipientName?: string | null;
  email: string;
  password: string;
  role: string;
  organizationName?: string | null;
  loginUrl: string;
};

export type TeamMemberWelcomeEmailContent = {
  subject: string;
  html: string;
  text: string;
};

function displayName(name: string | null | undefined, email: string): string {
  const trimmed = (name || "").trim();
  return trimmed || email.trim() || "there";
}

function orgLabel(organizationName: string | null | undefined): string {
  const trimmed = (organizationName || "").trim();
  return trimmed || "your organisation";
}

export function buildTeamMemberWelcomeEmail(
  input: TeamMemberWelcomeEmailInput,
): TeamMemberWelcomeEmailContent {
  const email = (input.email || "").trim();
  const password = (input.password || "").trim();
  const name = displayName(input.recipientName, email);
  const organizationName = orgLabel(input.organizationName);
  const roleLabel = getTeamRoleDisplayLabel(input.role) || input.role || "Team Member";
  const loginUrl = (input.loginUrl || "").trim() || "https://portal.inspect360.ai";

  const subject = `Welcome to Inspect360 — ${organizationName}`;

  const text = [
    `Hi ${name},`,
    "",
    `You have been added to ${organizationName} on Inspect360.`,
    "",
    `Organisation / company: ${organizationName}`,
    `Role: ${roleLabel}`,
    "",
    "Your login details:",
    `Portal: ${loginUrl}`,
    `Email: ${email}`,
    `Temporary password: ${password}`,
    "",
    "For your security, please change your password after you first log in.",
    "",
    "If you did not expect this invitation, please contact your organisation administrator.",
    "",
    "— Inspect360",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.06);">
    <p style="margin: 0 0 8px 0; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #3B7A8C;">Inspect360</p>
    <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 700; color: #021F36;">Welcome to ${escapeHtml(organizationName)}</h1>
    <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${escapeHtml(name)},</p>
    <p style="margin: 0 0 20px 0; font-size: 16px; color: #444;">
      You have been added to <strong>${escapeHtml(organizationName)}</strong> on Inspect360 as
      <strong>${escapeHtml(roleLabel)}</strong>. Use the details below to sign in.
    </p>

    <div style="background-color: #f8fafb; border: 1px solid #d7e6ea; padding: 20px; border-radius: 8px; margin: 0 0 20px 0;">
      <p style="margin: 0 0 14px 0; font-size: 12px; color: #3B7A8C; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Your login details</p>
      <p style="margin: 0 0 4px 0; font-size: 13px; color: #888;">Organisation / company</p>
      <p style="margin: 0 0 14px 0; font-size: 15px; font-weight: 600; color: #021F36;">${escapeHtml(organizationName)}</p>
      <p style="margin: 0 0 4px 0; font-size: 13px; color: #888;">Role</p>
      <p style="margin: 0 0 14px 0; font-size: 15px; font-weight: 600; color: #021F36;">${escapeHtml(roleLabel)}</p>
      <p style="margin: 0 0 4px 0; font-size: 13px; color: #888;">Portal</p>
      <p style="margin: 0 0 14px 0; font-size: 15px; word-break: break-all;">
        <a href="${escapeHtml(loginUrl)}" style="color: #048C8A; text-decoration: none;">${escapeHtml(loginUrl)}</a>
      </p>
      <p style="margin: 0 0 4px 0; font-size: 13px; color: #888;">Email</p>
      <p style="margin: 0 0 14px 0; font-size: 15px; font-weight: 600; color: #021F36;">${escapeHtml(email)}</p>
      <p style="margin: 0 0 4px 0; font-size: 13px; color: #888;">Temporary password</p>
      <div style="background-color: #ffffff; border: 1px solid #e0e0e0; padding: 12px; border-radius: 4px;">
        <p style="margin: 0; font-size: 16px; font-weight: 700; color: #048C8A; font-family: 'Courier New', Consolas, monospace; letter-spacing: 1px; word-break: break-all;">${escapeHtml(password)}</p>
      </div>
    </div>

    <div style="background-color: #fff8e8; border-left: 4px solid #e6a800; padding: 14px 16px; border-radius: 4px; margin: 0 0 24px 0;">
      <p style="margin: 0; font-size: 14px; color: #6b5200;">
        <strong>Security note:</strong> Please change your password after you first log in.
      </p>
    </div>

    <div style="text-align: center; margin: 8px 0 24px 0;">
      <a href="${escapeHtml(loginUrl)}"
         style="display: inline-block; background: #04C6BD; color: #021F36; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 15px;">
        Sign in to Inspect360
      </a>
    </div>

    <p style="margin: 0; font-size: 13px; color: #888;">
      If you did not expect this invitation, contact your organisation administrator.
    </p>
    <p style="margin: 16px 0 0 0; font-size: 12px; color: #aaa; text-align: center;">
      © ${new Date().getFullYear()} Inspect360. All rights reserved.
    </p>
  </div>
</body>
</html>`;

  return { subject, html, text };
}
