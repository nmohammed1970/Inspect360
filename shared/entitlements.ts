/**
 * Single source of truth for trial length, expiry warnings, and access status.
 * All decisions take an explicit `now` so tests do not depend on the wall clock.
 * Callers must pass a UTC instant (billingNowUtc).
 */

export const DEFAULT_TRIAL_DAYS = 7;
export const EXPIRY_WARNING_DAYS = 5;
export const MAX_TRIAL_EXTENSION_DAYS = 365;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Backend paths that require an active trial or paid credits. */
export const LOCKED_API_PREFIXES = [
  "/api/properties",
  "/api/blocks",
  "/api/inspections",
  "/api/comparison-reports",
  "/api/comparisons",
  "/api/maintenance",
] as const;

/** App routes for the same modules, including tenant equivalents. */
export const LOCKED_APP_PATHS = [
  "/properties",
  "/blocks",
  "/inspections",
  "/comparisons",
  "/maintenance",
  "/tenant/maintenance",
  "/tenant/log-request",
  "/tenant/requests",
  "/tenant/comparison-reports",
  "/tenant/inspection-review",
  "/tenant/check-in-review",
] as const;

export type EntitlementCode =
  | "LEGACY_ACCESS"
  | "TRIAL_ACTIVE"
  | "TRIAL_EXPIRING"
  | "TRIAL_EXPIRED"
  | "CREDITS_ACTIVE"
  | "CREDITS_EXPIRING"
  | "CREDITS_EXPIRED";

export type LockCode = "TRIAL_EXPIRED" | "CREDITS_EXPIRED";

export type CreditBatchSnapshot = {
  remainingQuantity: number;
  expiresAt: Date | string | null;
  metadataJson?: { kind?: string; adminNotes?: string } | null;
};

export type EntitlementInput = {
  trialEnforced: boolean;
  trialStartAt: Date | string | null;
  trialEndAt: Date | string | null;
  batches: CreditBatchSnapshot[];
};

export type EntitlementStatus = {
  code: EntitlementCode;
  locked: boolean;
  label: string;
  daysRemaining: number | null;
  trialStartAt: string | null;
  trialEndAt: string | null;
  creditExpiryAt: string | null;
  paidCredits: number;
  warning: "trial" | "credits" | null;
};

export function addDaysUtc(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * MS_PER_DAY);
}

export function toUtcDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whole days left until `end`. 0 once `now >= end`. At least 1 while still in the future. */
export function daysRemainingUntil(end: Date, now: Date): number {
  if (now.getTime() >= end.getTime()) return 0;
  return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / MS_PER_DAY));
}

export function isSignupBonusBatch(
  metadata: { kind?: string; adminNotes?: string } | null | undefined,
): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  if (metadata.kind === "signup_bonus") return true;
  const notes = String(metadata.adminNotes || "").toLowerCase();
  return notes.includes("signup reward");
}

function isStillValid(expiresAt: Date | string | null | undefined, now: Date): boolean {
  if (!expiresAt) return true;
  const expiry = toUtcDate(expiresAt);
  if (!expiry) return false;
  return expiry.getTime() > now.getTime();
}

export function isLockedApiPath(path: string): boolean {
  const bare = path.split("?")[0];
  return LOCKED_API_PREFIXES.some((prefix) => bare === prefix || bare.startsWith(`${prefix}/`));
}

export function isLockedAppPath(path: string): boolean {
  const bare = path.split("?")[0];
  return LOCKED_APP_PATHS.some((prefix) => bare === prefix || bare.startsWith(`${prefix}/`));
}

export function lockPayload(code: LockCode): { code: LockCode; message: string } {
  if (code === "CREDITS_EXPIRED") {
    return { code, message: "Your credits have expired." };
  }
  return { code, message: "Your trial period has expired." };
}

/**
 * Calendar date the admin picks is fully usable.
 * `2026-09-30` is stored as `2026-10-01T00:00:00.000Z` (exclusive end).
 * A full ISO instant is accepted as-is when it is in the future.
 */
export function parseCreditExpiryInput(
  value: unknown,
  now: Date,
): { ok: true; expiresAt: Date } | { ok: false; message: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, message: "Credit expiration date is required" };
  }
  const trimmed = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  let expiresAt: Date;
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (
      utc.getUTCFullYear() !== year ||
      utc.getUTCMonth() !== month - 1 ||
      utc.getUTCDate() !== day
    ) {
      return { ok: false, message: "Credit expiration date is invalid" };
    }
    expiresAt = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
  } else {
    expiresAt = new Date(trimmed);
    if (Number.isNaN(expiresAt.getTime())) {
      return { ok: false, message: "Credit expiration date is invalid" };
    }
  }
  if (expiresAt.getTime() <= now.getTime()) {
    return { ok: false, message: "Credit expiration date must be in the future" };
  }
  return { ok: true, expiresAt };
}

export function validateTrialExtensionDays(
  days: unknown,
): { ok: true; days: number } | { ok: false; message: string } {
  const value = typeof days === "number" ? days : Number(days);
  if (!Number.isInteger(value) || value <= 0) {
    return { ok: false, message: "Additional days must be a positive integer" };
  }
  if (value > MAX_TRIAL_EXTENSION_DAYS) {
    return { ok: false, message: `Additional days cannot exceed ${MAX_TRIAL_EXTENSION_DAYS}` };
  }
  return { ok: true, days: value };
}

/** Stack on a future end. If the trial is already over (or missing), start from now. */
export function computeExtendedTrialEnd(
  currentEnd: Date | null,
  now: Date,
  additionalDays: number,
): Date {
  const base = currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
  return addDaysUtc(base, additionalDays);
}

export function resolveEntitlement(input: EntitlementInput, now: Date): EntitlementStatus {
  const trialStart = toUtcDate(input.trialStartAt);
  const trialEnd = toUtcDate(input.trialEndAt);
  const paidBatches = input.batches.filter((batch) => !isSignupBonusBatch(batch.metadataJson));
  const activePaid = paidBatches.filter(
    (batch) => batch.remainingQuantity > 0 && isStillValid(batch.expiresAt, now),
  );
  const paidCredits = activePaid.reduce((sum, batch) => sum + batch.remainingQuantity, 0);

  let earliestExpiry: Date | null = null;
  for (const batch of activePaid) {
    const expiry = toUtcDate(batch.expiresAt);
    if (expiry && (!earliestExpiry || expiry.getTime() < earliestExpiry.getTime())) {
      earliestExpiry = expiry;
    }
  }

  const base = {
    trialStartAt: trialStart ? trialStart.toISOString() : null,
    trialEndAt: trialEnd ? trialEnd.toISOString() : null,
    creditExpiryAt: earliestExpiry ? earliestExpiry.toISOString() : null,
    paidCredits,
  };

  if (paidCredits > 0) {
    const days = earliestExpiry ? daysRemainingUntil(earliestExpiry, now) : null;
    const expiring = days !== null && days > 0 && days <= EXPIRY_WARNING_DAYS;
    return {
      ...base,
      code: expiring ? "CREDITS_EXPIRING" : "CREDITS_ACTIVE",
      locked: false,
      label: expiring ? "Credits Expiring Soon" : "Credits Active",
      daysRemaining: days,
      warning: expiring ? "credits" : null,
    };
  }

  if (!input.trialEnforced) {
    return {
      ...base,
      code: "LEGACY_ACCESS",
      locked: false,
      label: "Legacy access",
      daysRemaining: null,
      warning: null,
      creditExpiryAt: null,
    };
  }

  if (trialEnd && trialEnd.getTime() > now.getTime()) {
    const days = daysRemainingUntil(trialEnd, now);
    const expiring = days <= EXPIRY_WARNING_DAYS;
    return {
      ...base,
      code: expiring ? "TRIAL_EXPIRING" : "TRIAL_ACTIVE",
      locked: false,
      label: expiring ? "Trial Expiring Soon" : "Trial Active",
      daysRemaining: days,
      warning: expiring ? "trial" : null,
      creditExpiryAt: null,
    };
  }

  if (paidBatches.length > 0) {
    let latestExpiry: Date | null = null;
    for (const batch of paidBatches) {
      if (batch.remainingQuantity <= 0) continue;
      const expiry = toUtcDate(batch.expiresAt);
      if (!expiry) continue;
      if (!latestExpiry || expiry.getTime() > latestExpiry.getTime()) latestExpiry = expiry;
    }
    return {
      ...base,
      code: "CREDITS_EXPIRED",
      locked: true,
      label: "Credits Expired",
      daysRemaining: 0,
      warning: null,
      creditExpiryAt: latestExpiry ? latestExpiry.toISOString() : null,
    };
  }

  return {
    ...base,
    code: "TRIAL_EXPIRED",
    locked: true,
    label: "Trial Expired",
    daysRemaining: 0,
    warning: null,
    creditExpiryAt: null,
  };
}
