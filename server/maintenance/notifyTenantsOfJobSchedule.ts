import { sendEmail } from "../resend";
import { storage } from "../storage";

export type NotifyTenantsOfJobScheduleInput = {
  organizationId: string;
  workOrderId: string;
  propertyId: string;
  scheduledAt: Date;
  jobTitle?: string | null;
  propertyName?: string | null;
  propertyAddress?: string | null;
  isReschedule?: boolean;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatScheduledAt(date: Date): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/**
 * Email + in-app notify active property tenants about a scheduled visit.
 * Best-effort — never throws to callers.
 */
export async function notifyTenantsOfJobSchedule(
  input: NotifyTenantsOfJobScheduleInput,
): Promise<{ notified: number; emailed: number; warning?: string }> {
  try {
    const assignments = await storage.getTenantAssignmentsByProperty(
      input.propertyId,
      input.organizationId,
    );
    const activeTenants = assignments.filter((ta: any) => ta.assignment?.isActive);

    if (activeTenants.length === 0) {
      return {
        notified: 0,
        emailed: 0,
        warning: "No active tenant on file for this property",
      };
    }

    const whenLabel = formatScheduledAt(input.scheduledAt);
    const title = (input.jobTitle || "Maintenance visit").trim();
    const locationLabel = [input.propertyName, input.propertyAddress]
      .filter(Boolean)
      .join(" · ");
    const verb = input.isReschedule ? "rescheduled" : "scheduled";
    const subject = input.isReschedule
      ? `Maintenance visit rescheduled: ${title}`
      : `Maintenance visit scheduled: ${title}`;

    const text = [
      `A maintenance visit has been ${verb}.`,
      "",
      `Job: ${title}`,
      `When: ${whenLabel}`,
      locationLabel ? `Location: ${locationLabel}` : null,
      "",
      "Please ensure access is available at the scheduled time.",
    ]
      .filter((line) => line != null)
      .join("\n");

    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111">
        <p style="margin:0 0 12px">A maintenance visit has been ${escapeHtml(verb)}.</p>
        <p style="margin:0 0 8px"><strong>${escapeHtml(title)}</strong></p>
        <ul style="margin:0 0 16px;padding-left:18px">
          <li>When: ${escapeHtml(whenLabel)}</li>
          ${locationLabel ? `<li>Location: ${escapeHtml(locationLabel)}</li>` : ""}
        </ul>
        <p style="margin:0">Please ensure access is available at the scheduled time.</p>
      </div>
    `.trim();

    let notified = 0;
    let emailed = 0;
    let hadEmail = false;

    const { sendNotificationToUser } = await import("../websocket");

    for (const tenant of activeTenants) {
      const tenantUserId = tenant.id as string | undefined;
      if (!tenantUserId) continue;

      try {
        const notification = await storage.createNotification({
          userId: tenantUserId,
          organizationId: input.organizationId,
          type: "work_order_scheduled",
          title: input.isReschedule ? "Maintenance visit rescheduled" : "Maintenance visit scheduled",
          message: `${title} — ${whenLabel}`,
          data: {
            workOrderId: input.workOrderId,
            propertyId: input.propertyId,
            scheduledAt: input.scheduledAt.toISOString(),
            propertyName: input.propertyName || null,
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
        notified += 1;
      } catch (notifErr: any) {
        console.warn(
          `[notifyTenantsOfJobSchedule] In-app notify failed for ${tenantUserId}:`,
          notifErr?.message || notifErr,
        );
      }

      const email = (tenant.email || "").trim();
      if (!email) continue;
      hadEmail = true;
      try {
        await sendEmail({ to: email, subject, html, text });
        emailed += 1;
      } catch (emailErr: any) {
        console.warn(
          `[notifyTenantsOfJobSchedule] Email failed for ${email}:`,
          emailErr?.message || emailErr,
        );
      }
    }

    if (!hadEmail) {
      return {
        notified,
        emailed,
        warning: "No tenant email on file",
      };
    }

    return { notified, emailed };
  } catch (err: any) {
    console.warn(
      "[notifyTenantsOfJobSchedule] Unexpected failure:",
      err?.message || err,
    );
    return {
      notified: 0,
      emailed: 0,
      warning: "Tenant notification failed",
    };
  }
}
