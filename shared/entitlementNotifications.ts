/**
 * Decides which trial/credit expiry emails are due.
 * Access rules stay in resolveEntitlement. This only maps that status to notices.
 * All instants are UTC. "3 days remaining" uses daysRemainingUntil, same as the dashboard.
 */

import {
  daysRemainingUntil,
  toUtcDate,
  type EntitlementStatus,
} from "./entitlements";

export const EXPIRY_WARNING_EXACT_DAYS = 3;
export const EXPIRY_NOTICE_CATCHUP_MS = 48 * 60 * 60 * 1000;
export const MAX_NOTIFICATION_ATTEMPTS = 3;

export type ExpiryNotificationType =
  | "trial_warning_3d"
  | "credit_warning_3d"
  | "trial_expired"
  | "credit_expired";

export type ExpiryNotificationIntent = {
  type: ExpiryNotificationType;
  eventKey: string;
  expiresAt: string;
  daysRemaining: number | null;
  accessContinues: boolean;
};

export type NotificationClaimState = {
  status: "pending" | "sent" | "failed" | "skipped" | string;
  attempts: number;
};

export type NotificationClaimAction = "send" | "retry" | "skip";

function withinCatchup(expiresAtIso: string, now: Date): boolean {
  const end = toUtcDate(expiresAtIso);
  if (!end) return false;
  const elapsed = now.getTime() - end.getTime();
  return elapsed >= 0 && elapsed <= EXPIRY_NOTICE_CATCHUP_MS;
}

/**
 * Trial warning uses the trial end even when credits currently grant access.
 * Expired emails are emitted only when resolveEntitlement says access is locked.
 */
export function evaluateExpiryNotifications(
  status: EntitlementStatus,
  now: Date,
  options?: { trialEnforced?: boolean },
): ExpiryNotificationIntent[] {
  const intents: ExpiryNotificationIntent[] = [];
  const trialEnforced = options?.trialEnforced !== false;
  const accessContinues = !status.locked && status.paidCredits > 0;

  if (trialEnforced && status.trialEndAt) {
    const trialEnd = toUtcDate(status.trialEndAt);
    if (trialEnd) {
      const trialDays = daysRemainingUntil(trialEnd, now);
      if (trialDays === EXPIRY_WARNING_EXACT_DAYS) {
        intents.push({
          type: "trial_warning_3d",
          eventKey: trialEnd.toISOString(),
          expiresAt: trialEnd.toISOString(),
          daysRemaining: trialDays,
          accessContinues,
        });
      }
    }
  }

  if (status.creditExpiryAt) {
    const creditEnd = toUtcDate(status.creditExpiryAt);
    if (creditEnd && daysRemainingUntil(creditEnd, now) === EXPIRY_WARNING_EXACT_DAYS) {
      intents.push({
        type: "credit_warning_3d",
        eventKey: creditEnd.toISOString(),
        expiresAt: creditEnd.toISOString(),
        daysRemaining: EXPIRY_WARNING_EXACT_DAYS,
        accessContinues: false,
      });
    }
  }

  if (
    trialEnforced &&
    status.locked &&
    status.code === "TRIAL_EXPIRED" &&
    status.trialEndAt &&
    withinCatchup(status.trialEndAt, now)
  ) {
    const trialEnd = toUtcDate(status.trialEndAt);
    if (trialEnd) {
      intents.push({
        type: "trial_expired",
        eventKey: trialEnd.toISOString(),
        expiresAt: trialEnd.toISOString(),
        daysRemaining: 0,
        accessContinues: false,
      });
    }
  }

  if (
    status.locked &&
    status.code === "CREDITS_EXPIRED" &&
    status.creditExpiryAt &&
    withinCatchup(status.creditExpiryAt, now)
  ) {
    const creditEnd = toUtcDate(status.creditExpiryAt);
    if (creditEnd) {
      intents.push({
        type: "credit_expired",
        eventKey: creditEnd.toISOString(),
        expiresAt: creditEnd.toISOString(),
        daysRemaining: 0,
        accessContinues: false,
      });
    }
  }

  return intents;
}

/** Insert winner sends. Failed rows retry until MAX_NOTIFICATION_ATTEMPTS. Sent/skipped never send again. */
export function nextNotificationAction(
  existing: NotificationClaimState | null,
): NotificationClaimAction {
  if (!existing) return "send";
  if (existing.status === "sent" || existing.status === "skipped") return "skip";
  if (existing.status === "failed" && existing.attempts < MAX_NOTIFICATION_ATTEMPTS) return "retry";
  return "skip";
}

/** Usable credit day: stored exclusive end minus 1ms, shown as a UTC calendar date. */
export function formatCreditExpiryLabel(iso: string): string {
  const exclusive = toUtcDate(iso);
  if (!exclusive) return iso;
  const usable = new Date(exclusive.getTime() - 1);
  return usable.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatTrialExpiryLabel(iso: string): string {
  const date = toUtcDate(iso);
  if (!date) return iso;
  const formatted = date.toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatted} UTC`;
}
