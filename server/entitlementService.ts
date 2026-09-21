import { eq } from "drizzle-orm";
import { billingNowUtc } from "@shared/billingClock";
import { entitlementEvents, platformSettings } from "@shared/schema";
import {
  computeExtendedTrialEnd,
  DEFAULT_TRIAL_DAYS,
  resolveEntitlement,
  toUtcDate,
  validateTrialExtensionDays,
  type EntitlementStatus,
} from "@shared/entitlements";
import { db } from "./db";
import { storage } from "./storage";

export async function getOrganizationAccessStatus(
  organizationId: string,
  now: Date = billingNowUtc(),
): Promise<EntitlementStatus | null> {
  const organization = await storage.getOrganization(organizationId);
  if (!organization) return null;
  const batches = await storage.getCreditBatchesByOrganization(organizationId);
  return resolveEntitlement(
    {
      trialEnforced: organization.trialEnforced === true,
      trialStartAt: organization.trialStartAt,
      trialEndAt: organization.trialEndAt,
      batches: batches.map((batch) => ({
        remainingQuantity: batch.remainingQuantity,
        expiresAt: batch.expiresAt,
        metadataJson: batch.metadataJson,
      })),
    },
    now,
  );
}

export async function canAccessFeature(organizationId: string, now?: Date): Promise<boolean> {
  const status = await getOrganizationAccessStatus(organizationId, now);
  return !!status && !status.locked;
}

export function getTrialDaysRemaining(status: EntitlementStatus): number | null {
  if (status.code === "TRIAL_ACTIVE" || status.code === "TRIAL_EXPIRING") {
    return status.daysRemaining;
  }
  return status.code === "TRIAL_EXPIRED" ? 0 : null;
}

export function getCreditDaysRemaining(status: EntitlementStatus): number | null {
  if (status.code === "CREDITS_ACTIVE" || status.code === "CREDITS_EXPIRING") {
    return status.daysRemaining;
  }
  return status.code === "CREDITS_EXPIRED" ? 0 : null;
}

export async function recordEntitlementEvent(input: {
  organizationId: string;
  eventType: "trial_created" | "trial_extended" | "credits_granted";
  actorUserId?: string | null;
  previousTrialEnd?: Date | null;
  newTrialEnd?: Date | null;
  additionalDays?: number | null;
  notes?: string | null;
}): Promise<void> {
  await db.insert(entitlementEvents).values({
    organizationId: input.organizationId,
    eventType: input.eventType,
    actorUserId: input.actorUserId ?? null,
    previousTrialEnd: input.previousTrialEnd ?? null,
    newTrialEnd: input.newTrialEnd ?? null,
    additionalDays: input.additionalDays ?? null,
    notes: input.notes ?? null,
  });
}

export async function extendOrganizationTrial(
  organizationId: string,
  additionalDays: unknown,
  actorUserId: string,
): Promise<EntitlementStatus> {
  const validation = validateTrialExtensionDays(additionalDays);
  if (!validation.ok) {
    const error = new Error(validation.message) as Error & { status: number };
    error.status = 400;
    throw error;
  }

  const organization = await storage.getOrganization(organizationId);
  if (!organization) {
    const error = new Error("Organization not found") as Error & { status: number };
    error.status = 404;
    throw error;
  }

  const now = billingNowUtc();
  const previous = toUtcDate(organization.trialEndAt);
  const next = computeExtendedTrialEnd(previous, now, validation.days);

  await storage.updateOrganization(organizationId, {
    trialEnforced: true,
    trialStartAt: organization.trialStartAt ?? now,
    trialEndAt: next,
  });

  await recordEntitlementEvent({
    organizationId,
    eventType: "trial_extended",
    actorUserId,
    previousTrialEnd: previous,
    newTrialEnd: next,
    additionalDays: validation.days,
    notes: `Trial extended by ${validation.days} day(s)`,
  });

  const status = await getOrganizationAccessStatus(organizationId, now);
  if (!status) {
    throw new Error("Organization not found");
  }
  return status;
}

const DEFAULT_TRIAL_DAYS_KEY = "default_trial_days";

export async function getDefaultTrialDays(): Promise<number> {
  const [row] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, DEFAULT_TRIAL_DAYS_KEY));
  const parsed = validateTrialExtensionDays(row?.value ?? DEFAULT_TRIAL_DAYS);
  return parsed.ok ? parsed.days : DEFAULT_TRIAL_DAYS;
}

export async function setDefaultTrialDays(days: unknown): Promise<number> {
  const parsed = validateTrialExtensionDays(days);
  if (!parsed.ok) {
    const error = new Error(parsed.message) as Error & { status: number };
    error.status = 400;
    throw error;
  }
  const now = new Date();
  await db
    .insert(platformSettings)
    .values({ key: DEFAULT_TRIAL_DAYS_KEY, value: String(parsed.days), updatedAt: now })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value: String(parsed.days), updatedAt: now },
    });
  return parsed.days;
}
