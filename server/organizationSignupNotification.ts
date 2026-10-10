import { uniqueAdminEmails } from "@shared/creditRequests";
import type { Organization, User } from "@shared/schema";
import { buildOrganizationSignupEmail } from "./organizationSignupEmail";
import { sendEmail } from "./resend";
import { storage } from "./storage";

export type OrganizationSignupSource = "register" | "organization_setup";

export type NotifyOrganizationSignupResult = {
  ok: boolean;
  reason?: "no_admins" | "send_partial_failure" | "send_failed" | "build_failed";
  recipientsAttempted?: number;
  recipientsFailed?: number;
};

function fullName(user: User): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.username || "";
}

function signupSourceLabel(source: OrganizationSignupSource): string {
  return source === "register" ? "Public registration" : "Organization setup";
}

/**
 * Notify platform administrators that a new organization was created.
 * Never throws — signup/org-create HTTP success must not depend on email delivery.
 */
export async function notifyAdminsOfOrganizationSignup(params: {
  organization: Organization;
  user: User;
  source: OrganizationSignupSource;
}): Promise<NotifyOrganizationSignupResult> {
  const { organization, user, source } = params;

  try {
    const admins = await storage.getAllAdmins();
    const recipients = uniqueAdminEmails(admins);

    if (recipients.length === 0) {
      console.warn(
        `[OrgSignupNotify] No administrators to notify for org=${organization.id} source=${source}`,
      );
      return { ok: false, reason: "no_admins" };
    }

    const baseUrl = (process.env.BASE_URL || "https://portal.inspect360.ai").replace(/\/$/, "");
    let content;
    try {
      content = buildOrganizationSignupEmail({
        organizationName: organization.name,
        organizationId: organization.id,
        organizationCountryCode: organization.countryCode,
        organizationCurrency: organization.preferredCurrency,
        subscriptionStatus: organization.subscriptionStatus,
        trialEnforced: organization.trialEnforced,
        trialStartAt: organization.trialStartAt,
        trialEndAt: organization.trialEndAt,
        registeredAt: organization.createdAt ?? new Date(),
        userFullName: fullName(user),
        userEmail: user.email,
        userPhone: user.phone,
        userId: user.id,
        userRole: user.role,
        userSignedUpAt: user.createdAt ?? organization.createdAt ?? new Date(),
        signupSource: signupSourceLabel(source),
        adminUrl: `${baseUrl}/admin/dashboard`,
      });
    } catch (error: any) {
      console.error(
        `[OrgSignupNotify] Failed to build email for org=${organization.id}:`,
        error?.message || error,
      );
      return { ok: false, reason: "build_failed" };
    }

    const errors: string[] = [];
    for (const email of recipients) {
      try {
        await sendEmail({
          to: email,
          subject: content.subject,
          html: content.html,
          text: content.text,
        });
      } catch (error: any) {
        console.error(
          `[OrgSignupNotify] Email failed for recipient (org=${organization.id} source=${source}):`,
          error?.message || error,
        );
        errors.push(email);
      }
    }

    if (errors.length === recipients.length) {
      return {
        ok: false,
        reason: "send_failed",
        recipientsAttempted: recipients.length,
        recipientsFailed: errors.length,
      };
    }

    if (errors.length > 0) {
      console.warn(
        `[OrgSignupNotify] Partial failure org=${organization.id} failed=${errors.length}/${recipients.length}`,
      );
      return {
        ok: false,
        reason: "send_partial_failure",
        recipientsAttempted: recipients.length,
        recipientsFailed: errors.length,
      };
    }

    console.log(
      `[OrgSignupNotify] Sent org=${organization.id} source=${source} recipients=${recipients.length}`,
    );
    return { ok: true, recipientsAttempted: recipients.length, recipientsFailed: 0 };
  } catch (error: any) {
    console.error(
      `[OrgSignupNotify] Unexpected failure org=${organization?.id} source=${source}:`,
      error?.message || error,
    );
    return { ok: false, reason: "send_failed" };
  }
}
