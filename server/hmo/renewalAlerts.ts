import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { hmoLicences, hmoPropertyProfiles } from "@shared/schema";
import { dispatchHmoNotification } from "./notificationDispatcher";
import { writeHmoAuditEvent } from "./auditWriter";
import * as hmoStorage from "./storage";

export const DEFAULT_RENEWAL_WINDOWS_DAYS = [90, 60, 30, 7] as const;

export type RenewalWindow = 90 | 60 | 30 | 7 | "expired";

function daysUntil(expiry: Date, asOf: Date): number {
  const ms = expiry.getTime() - asOf.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function windowForDays(days: number): RenewalWindow | null {
  if (days < 0) return "expired";
  if (days <= 7) return 7;
  if (days <= 30) return 30;
  if (days <= 60) return 60;
  if (days <= 90) return 90;
  return null;
}

function renewalCopy(window: RenewalWindow, expiryIso: string): { title: string; message: string } {
  if (window === "expired") {
    return {
      title: "HMO licence document expired — verify position",
      message: `The uploaded licence expired on ${expiryIso}. Verify the current licensing or application position with the council. This is not an automatic finding of unlawful operation.`,
    };
  }
  return {
    title: `HMO licence renewal due within ${window} days`,
    message: `Uploaded licence expires on ${expiryIso}. Start renewal evidence collection and confirm application status before expiry.`,
  };
}

function getWindowsFromSettings(slaJson: Record<string, unknown> | null | undefined): number[] {
  const raw = slaJson?.renewalWindowsDays;
  if (Array.isArray(raw) && raw.every((n) => typeof n === "number")) {
    return raw as number[];
  }
  return [...DEFAULT_RENEWAL_WINDOWS_DAYS];
}

/** Scan org licences and raise renewal / expiry alerts (idempotent per day+window). */
export async function processRenewalAlertsForOrg(organizationId: string, asOf = new Date()) {
  const settings = await hmoStorage.getOrCreateOrgSettings(organizationId);
  const windows = getWindowsFromSettings(settings.slaJson as Record<string, unknown> | null);
  const maxWindow = Math.max(...windows, 90);

  const licences = await db
    .select()
    .from(hmoLicences)
    .where(
      and(
        eq(hmoLicences.organizationId, organizationId),
        isNotNull(hmoLicences.expiryDate),
      ),
    );

  let raised = 0;
  for (const lic of licences) {
    if (!lic.expiryDate) continue;
    const days = daysUntil(new Date(lic.expiryDate), asOf);
    const window = windowForDays(days);
    if (!window) continue;
    if (window !== "expired" && !windows.includes(window)) continue;
    if (window !== "expired" && days > maxWindow) continue;

    const expiryIso = new Date(lic.expiryDate).toISOString().slice(0, 10);
    const dayKey = asOf.toISOString().slice(0, 10);
    const idempotencyKey = `renewal:${lic.id}:${window}:${dayKey}`;

    const prior = await hmoStorage.createJob({
      organizationId,
      propertyId: lic.propertyId,
      jobType: "RENEWAL_ALERT",
      licenceVersionId: lic.currentVersionId,
      idempotencyKey,
      status: "QUEUED",
      progress: 0,
      resultJson: null,
    });
    // Idempotent: job already completed for this day+window
    if (prior.status === "COMPLETED") {
      continue;
    }
    await hmoStorage.updateJob(organizationId, prior.id, {
      status: "COMPLETED",
      progress: 100,
      resultJson: {
        window,
        daysUntilExpiry: days,
        expiryDate: expiryIso,
        licenceId: lic.id,
      },
    });

    if (window === "expired") {
      await db
        .update(hmoLicences)
        .set({ lifecycleStatus: "EXPIRED_DOCUMENT", updatedAt: new Date() })
        .where(eq(hmoLicences.id, lic.id));
    } else if (lic.lifecycleStatus === "CURRENT" || lic.lifecycleStatus === "UNDER_REVIEW") {
      await db
        .update(hmoLicences)
        .set({ lifecycleStatus: "RENEWAL_PENDING_EVIDENCE", updatedAt: new Date() })
        .where(eq(hmoLicences.id, lic.id));
    }

    const copy = renewalCopy(window, expiryIso);
    const profile = await hmoStorage.ensurePropertyProfile(organizationId, lic.propertyId);
    const ownerId = profile.complianceOwnerId || lic.createdBy || settings.createdBy || null;

    await dispatchHmoNotification({
      organizationId,
      userId: ownerId,
      title: copy.title,
      message: copy.message,
      link: `/properties/${lic.propertyId}?tab=hmo`,
      type: "hmo_renewal",
    });

    await writeHmoAuditEvent({
      organizationId,
      actorType: "system",
      actorId: null,
      action: "hmo.renewal.alert",
      entityType: "hmo_licence",
      entityId: lic.id,
      metadata: { window, daysUntilExpiry: days, expiryDate: expiryIso },
    });

    raised += 1;
  }

  return { organizationId, raised, scanned: licences.length };
}

/** Process renewal alerts for every org that has HMO profiles. */
export async function processAllRenewalAlerts(asOf = new Date()) {
  const orgs = await db
    .selectDistinct({ organizationId: hmoPropertyProfiles.organizationId })
    .from(hmoPropertyProfiles);

  const results = [];
  for (const row of orgs) {
    try {
      results.push(await processRenewalAlertsForOrg(row.organizationId, asOf));
    } catch (error) {
      console.error("[hmo] renewal alerts failed for org", row.organizationId, error);
      results.push({ organizationId: row.organizationId, raised: 0, scanned: 0, error: true });
    }
  }
  return results;
}

export function computeRenewalWindowLabel(expiryDate: Date | string | null | undefined, asOf = new Date()): {
  window: RenewalWindow | null;
  daysUntilExpiry: number | null;
} {
  if (!expiryDate) return { window: null, daysUntilExpiry: null };
  const days = daysUntil(new Date(expiryDate), asOf);
  return { window: windowForDays(days), daysUntilExpiry: days };
}
