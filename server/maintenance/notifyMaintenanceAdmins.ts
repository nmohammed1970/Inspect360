import { sendEmail } from "../resend";
import { storage } from "../storage";

export type NotifyMaintenanceAdminsInput = {
  organizationId: string;
  requestId: string;
  title: string;
  priority?: string | null;
  description?: string | null;
  propertyId?: string | null;
  blockId?: string | null;
  reportedByUserId?: string | null;
  source?: string | null;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function baseAppUrl(): string {
  return (process.env.BASE_URL || "https://portal.inspect360.ai").replace(/\/$/, "");
}

/**
 * Email all active maintenance_admin users when a request is logged.
 * Best-effort — never throws to callers.
 */
export async function notifyMaintenanceAdminsOfNewRequest(
  input: NotifyMaintenanceAdminsInput,
): Promise<{ sent: number; failed: number }> {
  try {
    const admins = await storage.getUsersByOrganizationAndRole(
      input.organizationId,
      "maintenance_admin",
    );
    const recipients = admins.filter(
      (u) => u.isActive !== false && !!(u.email || "").trim(),
    );

    if (recipients.length === 0) {
      return { sent: 0, failed: 0 };
    }

    let locationLabel = "";
    try {
      if (input.propertyId) {
        const property = await storage.getProperty(input.propertyId);
        if (property?.name) locationLabel = property.name;
        if (property?.address) {
          locationLabel = locationLabel
            ? `${locationLabel} · ${property.address}`
            : property.address;
        }
      }
      if (input.blockId) {
        const block = await storage.getBlock(input.blockId);
        if (block?.name) {
          locationLabel = locationLabel
            ? `${locationLabel} · ${block.name}`
            : block.name;
        }
      }
    } catch {
      // location is optional enrichment
    }

    let reporterLabel = "";
    if (input.reportedByUserId) {
      try {
        const reporter = await storage.getUser(input.reportedByUserId);
        if (reporter) {
          reporterLabel =
            [reporter.firstName, reporter.lastName].filter(Boolean).join(" ").trim() ||
            reporter.email ||
            "";
        }
      } catch {
        // optional
      }
    }

    const link = `${baseAppUrl()}/maintenance`;
    const priority = (input.priority || "medium").replace(/_/g, " ");
    const subject = `New maintenance request: ${input.title}`;

    const text = [
      "A new maintenance request was logged.",
      "",
      `Title: ${input.title}`,
      `Priority: ${priority}`,
      locationLabel ? `Location: ${locationLabel}` : null,
      reporterLabel ? `Reported by: ${reporterLabel}` : null,
      input.source ? `Source: ${input.source}` : null,
      input.description ? `\n${input.description}` : null,
      "",
      `Open maintenance: ${link}`,
    ]
      .filter((line) => line != null)
      .join("\n");

    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111">
        <p style="margin:0 0 12px">A new maintenance request was logged.</p>
        <p style="margin:0 0 8px"><strong>${escapeHtml(input.title)}</strong></p>
        <ul style="margin:0 0 16px;padding-left:18px">
          <li>Priority: ${escapeHtml(priority)}</li>
          ${locationLabel ? `<li>Location: ${escapeHtml(locationLabel)}</li>` : ""}
          ${reporterLabel ? `<li>Reported by: ${escapeHtml(reporterLabel)}</li>` : ""}
          ${input.source ? `<li>Source: ${escapeHtml(input.source)}</li>` : ""}
        </ul>
        ${
          input.description
            ? `<p style="margin:0 0 16px;white-space:pre-wrap">${escapeHtml(input.description)}</p>`
            : ""
        }
        <p style="margin:0">
          <a href="${escapeHtml(link)}" style="color:#0f766e;font-weight:600">Open maintenance</a>
        </p>
      </div>
    `.trim();

    let sent = 0;
    let failed = 0;
    for (const admin of recipients) {
      try {
        await sendEmail({
          to: admin.email!.trim(),
          subject,
          html,
          text,
        });
        sent += 1;
      } catch (err: any) {
        failed += 1;
        console.warn(
          `[notifyMaintenanceAdmins] Failed for ${admin.email}:`,
          err?.message || err,
        );
      }
    }

    return { sent, failed };
  } catch (err: any) {
    console.warn(
      "[notifyMaintenanceAdmins] Unexpected failure:",
      err?.message || err,
    );
    return { sent: 0, failed: 0 };
  }
}
