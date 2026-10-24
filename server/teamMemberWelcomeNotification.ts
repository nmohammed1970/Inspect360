import { buildTeamMemberWelcomeEmail } from "./teamMemberWelcomeEmail";
import { sendEmail } from "./resend";

export type NotifyTeamMemberWelcomeInput = {
  recipientName?: string | null;
  email: string;
  password: string;
  role: string;
  organizationName?: string | null;
  loginUrl?: string;
};

export type NotifyTeamMemberWelcomeResult = {
  sent: boolean;
  error?: string;
};

/**
 * Sends welcome credentials to a newly created staff team member.
 * Never throws — callers should treat email as best-effort.
 * Skips tenants (they use the dedicated tenant credentials flow).
 */
export async function notifyTeamMemberWelcome(
  input: NotifyTeamMemberWelcomeInput,
): Promise<NotifyTeamMemberWelcomeResult> {
  const email = (input.email || "").trim();
  const password = (input.password || "").trim();
  const role = (input.role || "").trim().toLowerCase();

  if (role === "tenant") {
    return { sent: false, error: "skipped_tenant" };
  }
  if (!email) {
    return { sent: false, error: "missing_email" };
  }
  if (!password) {
    return { sent: false, error: "missing_password" };
  }

  const loginUrl =
    (input.loginUrl || "").trim() ||
    process.env.BASE_URL ||
    "https://portal.inspect360.ai";

  try {
    const content = buildTeamMemberWelcomeEmail({
      recipientName: input.recipientName,
      email,
      password,
      role: input.role,
      organizationName: input.organizationName,
      loginUrl,
    });

    await sendEmail({
      to: email,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });

    return { sent: true };
  } catch (error: any) {
    const message = error?.message || String(error);
    console.error(`[notifyTeamMemberWelcome] Failed to email ${email}:`, message);
    return { sent: false, error: message };
  }
}
