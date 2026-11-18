import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { inspections, inspectionTemplates } from "@shared/schema";
import { dispatchHmoNotification } from "./notificationDispatcher";
import * as hmoStorage from "./storage";
import { storage as appStorage } from "../storage";

/** Idempotent HMO inspection due reminders (7d / 1d) via hmo_jobs. */
export async function processHmoInspectionRemindersForOrg(
  organizationId: string,
  asOf = new Date(),
) {
  const rows = await db
    .select({
      id: inspections.id,
      propertyId: inspections.propertyId,
      scheduledDate: inspections.scheduledDate,
      status: inspections.status,
      templateName: inspectionTemplates.name,
    })
    .from(inspections)
    .innerJoin(
      inspectionTemplates,
      and(
        eq(inspections.templateId, inspectionTemplates.id),
        eq(inspectionTemplates.organizationId, organizationId),
        eq(inspectionTemplates.isHmoTemplate, true),
      ),
    )
    .where(eq(inspections.organizationId, organizationId));

  let raised = 0;
  const dayKey = asOf.toISOString().slice(0, 10);
  for (const insp of rows) {
    if (!insp.scheduledDate || !insp.propertyId) continue;
    if (insp.status === "completed" || insp.status === "reviewed") continue;
    const days = Math.ceil(
      (new Date(insp.scheduledDate).getTime() - asOf.getTime()) / (24 * 60 * 60 * 1000),
    );
    let window: 7 | 1 | "missed" | null = null;
    if (days < 0) window = "missed";
    else if (days <= 1) window = 1;
    else if (days <= 7) window = 7;
    if (!window) continue;

    const idempotencyKey = `hmo_insp:${insp.id}:${window}:${dayKey}`;
    const prior = await hmoStorage.getJobByIdempotencyKey(organizationId, idempotencyKey);
    if (prior) continue;
    await hmoStorage.createJob({
      organizationId,
      propertyId: insp.propertyId,
      jobType: "HMO_INSPECTION_REMINDER",
      idempotencyKey,
      status: "COMPLETED",
      resultJson: {
        inspectionId: insp.id,
        window,
        scheduledDate: new Date(insp.scheduledDate).toISOString().slice(0, 10),
        templateName: insp.templateName,
      },
    } as any);

    const owners = await appStorage.getUsersByOrganizationAndRole(organizationId, "owner");
    const title =
      window === "missed"
        ? "HMO inspection missed / overdue"
        : `HMO inspection due in ${window} day${window === 1 ? "" : "s"}`;
    const message = `${insp.templateName || "HMO inspection"} scheduled ${new Date(insp.scheduledDate)
      .toISOString()
      .slice(0, 10)}`;
    for (const u of owners.slice(0, 5)) {
      await dispatchHmoNotification({
        organizationId,
        userId: u.id,
        title,
        message,
        link: `/inspections/${insp.id}`,
        type: "hmo_inspection",
      });
    }
    raised += 1;
  }
  return { raised };
}
