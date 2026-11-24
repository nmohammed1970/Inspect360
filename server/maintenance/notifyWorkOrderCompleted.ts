import { randomBytes } from "crypto";
import { sendEmail } from "../resend";
import { storage } from "../storage";
import { publicAppBaseUrl } from "./quoteLifecycle";

export type NotifyWorkOrderCompletedInput = {
  organizationId: string;
  workOrderId: string;
  propertyId?: string | null;
  jobTitle?: string | null;
  propertyName?: string | null;
  propertyAddress?: string | null;
  req?: { protocol?: string; get?: (h: string) => string };
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * After WO → completed: create feedback invite, notify admins, email tenants with form link.
 * Best-effort — never throws to callers.
 */
export async function notifyWorkOrderCompleted(
  input: NotifyWorkOrderCompletedInput,
): Promise<{ feedbackToken?: string; adminsNotified: number; tenantsNotified: number }> {
  const title = (input.jobTitle || "Maintenance job").trim();
  const locationLabel = [input.propertyName, input.propertyAddress].filter(Boolean).join(" · ");
  let feedbackToken: string | undefined;
  let adminsNotified = 0;
  let tenantsNotified = 0;

  try {
    const existing = await storage.getMaintenanceJobFeedbackByWorkOrderId(input.workOrderId);
    if (existing) {
      feedbackToken = existing.token;
    } else {
      const token = randomBytes(32).toString("base64url");
      const row = await storage.createMaintenanceJobFeedback({
        organizationId: input.organizationId,
        workOrderId: input.workOrderId,
        token,
      });
      feedbackToken = row.token;
    }
  } catch (err: any) {
    console.warn("[notifyWorkOrderCompleted] feedback invite failed:", err?.message || err);
  }

  const base = publicAppBaseUrl(input.req);
  const feedbackUrl = feedbackToken ? `${base}/maintenance-feedback/${feedbackToken}` : null;

  try {
    const orgUsers = await storage.getUsersByOrganization(input.organizationId);
    const admins = orgUsers.filter(
      (u) =>
        (u.role === "owner" || u.role === "maintenance_admin") &&
        (u as any).isActive !== false,
    );
    const { notifyFinanceUsers } = await import("./notifyFinanceUsers");
    adminsNotified = await notifyFinanceUsers({
      userIds: admins.map((u) => u.id),
      organizationId: input.organizationId,
      type: "work_order_completed",
      title: "Job completed",
      message: `${title}${locationLabel ? ` — ${locationLabel}` : ""}`,
      data: {
        workOrderId: input.workOrderId,
        propertyId: input.propertyId || null,
        feedbackUrl,
      },
    });

    for (const admin of admins) {
      if (!admin.email) continue;
      try {
        await sendEmail({
          to: admin.email,
          subject: `Job completed: ${title}`,
          text: [
            `A maintenance job has been marked completed.`,
            "",
            `Job: ${title}`,
            locationLabel ? `Location: ${locationLabel}` : null,
            "",
            "Review it in Maintenance Feedback once the customer responds.",
          ]
            .filter((line) => line != null)
            .join("\n"),
          html: `
            <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111">
              <p style="margin:0 0 12px">A maintenance job has been marked completed.</p>
              <p style="margin:0 0 8px"><strong>${escapeHtml(title)}</strong></p>
              ${locationLabel ? `<p style="margin:0 0 12px">Location: ${escapeHtml(locationLabel)}</p>` : ""}
              <p style="margin:0">Review feedback in the portal under <strong>Maintenance Feedback</strong>.</p>
            </div>
          `.trim(),
        });
      } catch (emailErr: any) {
        console.warn(
          "[notifyWorkOrderCompleted] admin email failed:",
          emailErr?.message || emailErr,
        );
      }
    }
  } catch (err: any) {
    console.warn("[notifyWorkOrderCompleted] admin notify failed:", err?.message || err);
  }

  if (!input.propertyId || !feedbackUrl) {
    return { feedbackToken, adminsNotified, tenantsNotified };
  }

  try {
    const assignments = await storage.getTenantAssignmentsByProperty(
      input.propertyId,
      input.organizationId,
    );
    const activeTenants = assignments.filter((ta: any) => ta.assignment?.isActive);
    const { sendNotificationToUser } = await import("../websocket");

    for (const tenant of activeTenants) {
      const tenantUserId = tenant.id as string | undefined;
      if (!tenantUserId) continue;

      try {
        const notification = await storage.createNotification({
          userId: tenantUserId,
          organizationId: input.organizationId,
          type: "work_order_completed_feedback",
          title: "Job completed — share feedback",
          message: `${title} is done. Tell us how it went.`,
          data: {
            workOrderId: input.workOrderId,
            propertyId: input.propertyId,
            feedbackUrl,
          },
        });
        sendNotificationToUser(tenantUserId, {
          id: notification.id,
          userId: notification.userId,
          organizationId: notification.organizationId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          isRead: notification.isRead,
          createdAt: notification.createdAt || new Date(),
        });
        tenantsNotified += 1;
      } catch (nErr: any) {
        console.warn(
          "[notifyWorkOrderCompleted] tenant notify failed:",
          nErr?.message || nErr,
        );
      }

      const email = (tenant as any).email as string | undefined;
      if (!email) continue;
      try {
        await sendEmail({
          to: email,
          subject: `Job completed: ${title}`,
          text: [
            `Your maintenance job has been completed.`,
            "",
            `Job: ${title}`,
            locationLabel ? `Location: ${locationLabel}` : null,
            "",
            "Please rate the work and tell us how we could improve:",
            feedbackUrl,
          ]
            .filter((line) => line != null)
            .join("\n"),
          html: `
            <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111">
              <p style="margin:0 0 12px">Your maintenance job has been completed.</p>
              <p style="margin:0 0 8px"><strong>${escapeHtml(title)}</strong></p>
              ${locationLabel ? `<p style="margin:0 0 12px">Location: ${escapeHtml(locationLabel)}</p>` : ""}
              <p style="margin:0 0 16px">Please rate the work and tell us how we could improve.</p>
              <p style="margin:0">
                <a href="${escapeHtml(feedbackUrl)}"
                   style="display:inline-block;background:#0f766e;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">
                  Leave feedback
                </a>
              </p>
            </div>
          `.trim(),
        });
      } catch (emailErr: any) {
        console.warn(
          "[notifyWorkOrderCompleted] tenant email failed:",
          emailErr?.message || emailErr,
        );
      }
    }
  } catch (err: any) {
    console.warn("[notifyWorkOrderCompleted] tenant loop failed:", err?.message || err);
  }

  return { feedbackToken, adminsNotified, tenantsNotified };
}
