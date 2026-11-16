import { storage as appStorage } from "../storage";
import * as feedbackStorage from "./storage";
import { feedbackTypeLabel } from "@shared/feedbackLabels";

async function sendEmailSafe(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean }> {
  try {
    const { sendEmail } = await import("../resend");
    await sendEmail(input);
    return { ok: true };
  } catch (error) {
    console.error("[feedback] email failed:", error);
    return { ok: false };
  }
}

async function teamEmails(): Promise<string[]> {
  const emails = new Set<string>();
  try {
    const members = await feedbackStorage.listActiveFeatureAdmins();
    for (const m of members) if (m.email) emails.add(m.email.toLowerCase());
  } catch {
    /* ignore */
  }
  try {
    const legacy = await appStorage.getCentralTeamConfig();
    for (const c of legacy || []) {
      if (c.isActive && c.notificationEmail) emails.add(String(c.notificationEmail).toLowerCase());
    }
  } catch {
    /* ignore */
  }
  return [...emails];
}

export async function notifyTeamNewFeedback(input: {
  reference: string;
  type: string;
  subject: string;
  organizationName?: string | null;
  reporterName?: string | null;
  reporterEmail?: string | null;
  description: string;
  adminUrl: string;
}) {
  const recipients = await teamEmails();
  const excerpt = input.description.slice(0, 400);
  for (const to of recipients) {
    await sendEmailSafe({
      to,
      subject: `[Feedback ${input.reference}] ${feedbackTypeLabel(input.type)}: ${input.subject}`,
      html: `
        <h2>New feedback submission</h2>
        <p><strong>Reference:</strong> ${input.reference}</p>
        <p><strong>Type:</strong> ${feedbackTypeLabel(input.type)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>
        <p><strong>From:</strong> ${escapeHtml(input.reporterName || "")} (${escapeHtml(input.reporterEmail || "")})</p>
        <p><strong>Organisation:</strong> ${escapeHtml(input.organizationName || "N/A")}</p>
        <hr />
        <p>${escapeHtml(excerpt)}</p>
        <p><a href="${input.adminUrl}">Open in Eco-Admin</a></p>
      `,
    });
  }
}

export async function notifyReporterPublicReply(input: {
  toEmail: string;
  reference: string;
  subject: string;
  portalUrl: string;
  reporterUserId?: string | null;
  organizationId?: string | null;
}) {
  if (input.toEmail) {
    await sendEmailSafe({
      to: input.toEmail,
      subject: `Update on your feedback ${input.reference}`,
      html: `
        <p>The Inspect360 team has replied to your feedback <strong>${input.reference}</strong> (${escapeHtml(input.subject)}).</p>
        <p><a href="${input.portalUrl}">View the conversation</a></p>
      `,
    });
  }
  if (input.reporterUserId && input.organizationId) {
    try {
      await appStorage.createNotification({
        userId: input.reporterUserId,
        organizationId: input.organizationId,
        type: "feedback_reply",
        title: `Reply on ${input.reference}`,
        message: "The Inspect360 team replied to your feedback.",
        data: { reference: input.reference, link: input.portalUrl },
      } as any);
    } catch (error) {
      console.warn("[feedback] in-app notification skipped:", error);
    }
  }
}

export async function notifyTeamFollowUp(input: {
  reference: string;
  subject: string;
  excerpt: string;
  adminUrl: string;
  assigneeUserId?: string | null;
  reopened?: boolean;
}) {
  const recipients = await teamEmails();
  const title = input.reopened
    ? `[Feedback ${input.reference}] Reopened — user follow-up`
    : `[Feedback ${input.reference}] User follow-up`;
  for (const to of recipients) {
    await sendEmailSafe({
      to,
      subject: title,
      html: `
        <h2>${input.reopened ? "Case reopened" : "User follow-up"}</h2>
        <p><strong>Reference:</strong> ${input.reference}</p>
        <p><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>
        <p>${escapeHtml(input.excerpt.slice(0, 400))}</p>
        <p><a href="${input.adminUrl}">Open in Eco-Admin</a></p>
      `,
    });
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
