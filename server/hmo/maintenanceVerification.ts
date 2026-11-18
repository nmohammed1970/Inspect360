import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db";
import { storage as appStorage } from "../storage";
import { maintenanceRequests, workOrders } from "@shared/schema";
import { dispatchHmoNotification } from "./notificationDispatcher";

export function isHmoSourcedMaintenance(mr: {
  source?: string | null;
  aiAnalysisJson?: unknown;
}): boolean {
  if (mr.source === "hmo_finding") return true;
  const aj = (mr.aiAnalysisJson || {}) as Record<string, unknown>;
  return aj.source === "hmo_finding";
}

/** When a linked WO is completed, park HMO MR in awaiting_verification (do not close). */
export async function onWorkOrderCompletedForHmo(input: {
  workOrderId: string;
  organizationId: string;
}): Promise<void> {
  const [wo] = await db
    .select()
    .from(workOrders)
    .where(eq(workOrders.id, input.workOrderId))
    .limit(1);
  if (!wo?.maintenanceRequestId) return;

  const mr = await appStorage.getMaintenanceRequest(wo.maintenanceRequestId);
  if (!mr || mr.organizationId !== input.organizationId) return;
  if (!isHmoSourcedMaintenance(mr)) return;

  if (mr.verificationStatus === "verified") return;

  await appStorage.updateMaintenanceRequest(mr.id, {
    status: "in_progress",
    verificationStatus: "awaiting_verification",
  } as any);
}

export async function verifyHmoMaintenanceRequest(input: {
  organizationId: string;
  maintenanceRequestId: string;
  userId: string;
  action: "verify" | "reject";
  notes?: string | null;
}) {
  const mr = await appStorage.getMaintenanceRequest(input.maintenanceRequestId);
  if (!mr || mr.organizationId !== input.organizationId) {
    throw Object.assign(new Error("Maintenance request not found"), { status: 404 });
  }
  if (!isHmoSourcedMaintenance(mr)) {
    throw Object.assign(new Error("Not an HMO-sourced maintenance request"), { status: 400 });
  }

  if (input.action === "verify") {
    return appStorage.updateMaintenanceRequest(mr.id, {
      status: "completed",
      verificationStatus: "verified",
      verifiedAt: new Date(),
      verifiedBy: input.userId,
      verificationNotes: input.notes ?? null,
    } as any);
  }

  return appStorage.updateMaintenanceRequest(mr.id, {
    status: "open",
    verificationStatus: "rejected",
    verifiedAt: new Date(),
    verifiedBy: input.userId,
    verificationNotes: input.notes ?? null,
  } as any);
}

/** Block owner closing HMO MR until verified (unless already verified). */
export function assertHmoMaintenanceCloseable(
  mr: {
    source?: string | null;
    aiAnalysisJson?: unknown;
    verificationStatus?: string | null;
  },
  intendedStatus?: string | null,
): { ok: true } | { ok: false; message: string } {
  if (!isHmoSourcedMaintenance(mr)) return { ok: true };
  const vs = mr.verificationStatus || "none";
  if (vs === "verified") return { ok: true };
  if (intendedStatus === "completed" || intendedStatus === "closed") {
    return {
      ok: false,
      message:
        "HMO maintenance requests require authorised verification before they can be closed. Use Confirm resolved.",
    };
  }
  return { ok: true };
}

export async function notifyCriticalHmoMaintenance(input: {
  organizationId: string;
  propertyId: string;
  maintenanceRequestId: string;
  title: string;
  priority: string;
  severity?: string | null;
}) {
  const sev = String(input.severity || "").toUpperCase();
  const urgent = input.priority === "urgent" || sev === "CRITICAL";
  if (!urgent) return;

  try {
    const owners = await appStorage.getUsersByOrganizationAndRole(input.organizationId, "owner");
    const compliance = await appStorage.getUsersByOrganizationAndRole(
      input.organizationId,
      "compliance",
    );
    const recipients = [...owners, ...compliance];
    for (const u of recipients) {
      await dispatchHmoNotification({
        organizationId: input.organizationId,
        userId: u.id,
        title: "Critical HMO safety issue",
        message: input.title,
        link: `/maintenance`,
        type: "hmo_critical",
      });
    }
  } catch (err) {
    console.warn("[hmo] critical MR notify failed:", err);
  }
}

export async function countOpenHmoMaintenanceNeedingAttention(organizationId: string) {
  const rows = await db
    .select()
    .from(maintenanceRequests)
    .where(
      and(
        eq(maintenanceRequests.organizationId, organizationId),
        or(
          eq(maintenanceRequests.source, "hmo_finding" as any),
          sql`${maintenanceRequests.aiAnalysisJson}->>'source' = 'hmo_finding'`,
        ),
        or(
          eq(maintenanceRequests.status, "open"),
          eq(maintenanceRequests.status, "in_progress"),
          eq(maintenanceRequests.verificationStatus, "awaiting_verification"),
        ),
      ),
    );
  const now = Date.now();
  return {
    open: rows.length,
    awaitingVerification: rows.filter((r) => r.verificationStatus === "awaiting_verification").length,
    overdue: rows.filter((r) => r.dueDate && new Date(r.dueDate).getTime() < now).length,
  };
}
