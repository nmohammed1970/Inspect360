/**
 * Inspect360 billing clock — LOCKED to UTC.
 *
 * Billing systems must never leave timezone undefined.
 *
 * Policy:
 * - All renewal / period-end / credit-expiry *decisions* use UTC instants.
 * - Source of truth for paid subscriptions: Stripe `current_period_end`
 *   (Unix seconds → UTC Date). We mirror that into `subscription_renewal_date`.
 * - Server local timezone and customer browser timezone must NOT affect
 *   whether a period has ended or credits have expired.
 * - UI may *display* in the viewer's locale, but must convert from UTC and
 *   ideally label the date as UTC (or show an unambiguous ISO instant).
 *
 * Do NOT use:
 * - `toLocaleDateString()` without `timeZone: "UTC"` for billing decisions
 * - `setMonth` / `setFullYear` in local time when advancing renewal dates
 * - Customer-preferred timezone for charging or credit expiry
 */

export const BILLING_TIMEZONE = "UTC" as const;

/** Human-readable policy for docs / FAQ */
export const BILLING_CLOCK_POLICY = {
  timezone: BILLING_TIMEZONE,
  stripeSource:
    "Stripe current_period_end (Unix timestamp, UTC) is the period-end source of truth for active paid subs.",
  storage:
    "subscription_renewal_date and credit expires_at are stored/compared as absolute instants interpreted in UTC.",
  comparisons:
    "Renewal/expiry due when instant <= billingNowUtc(). Rule: expiresAt <= now using UTC timestamps only — never local TZ calendar dates.",
  display:
    "Show renewal to users via formatBillingDateUtc() (UTC calendar date) or full ISO-8601 with Z.",
  notUsed: [
    "Server OS timezone",
    "Customer/browser timezone for eligibility",
    "Organization 'local office hours' timezone",
  ],
} as const;

/** Current billing instant (UTC). Prefer this over bare `new Date()` in billing paths. */
export function billingNowUtc(): Date {
  return new Date(); // Date is always an absolute UTC instant; helpers below use getUTC*
}

/** Parse Stripe period end (seconds since epoch) → UTC Date */
export function fromStripePeriodEndUnix(unixSeconds: number): Date {
  return new Date(Math.trunc(unixSeconds) * 1000);
}

/** True when renewal/expiry instant is at or before `now`.
 *  UTC timestamps only: both sides are absolute instants (Date / ISO with Z).
 *  Equivalent rule: `expiresAt <= now` in UTC — never compare local calendar dates.
 */
export function isAtOrPastBillingInstant(
  instant: Date | string | null | undefined,
  now: Date = billingNowUtc(),
): boolean {
  if (!instant) return false;
  const t = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  if (Number.isNaN(t)) return false;
  return t <= now.getTime();
}

/**
 * Advance a renewal instant by N calendar months in UTC
 * (avoids local-TZ setMonth shifting the wall clock).
 */
export function addBillingMonthsUtc(instant: Date, months: number): Date {
  const y = instant.getUTCFullYear();
  const m = instant.getUTCMonth();
  const day = instant.getUTCDate();
  const hh = instant.getUTCHours();
  const mm = instant.getUTCMinutes();
  const ss = instant.getUTCSeconds();
  const ms = instant.getUTCMilliseconds();

  // Anchor on day 1 first to avoid overflow when computing target month length
  const targetMonthStart = Date.UTC(y, m + months, 1, hh, mm, ss, ms);
  const target = new Date(targetMonthStart);
  const daysInTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(day, daysInTarget);
  return new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      clampedDay,
      hh,
      mm,
      ss,
      ms,
    ),
  );
}

/** Advance renewal by N years in UTC. */
export function addBillingYearsUtc(instant: Date, years: number): Date {
  return addBillingMonthsUtc(instant, years * 12);
}

/** Next renewal from a previous renewal + billing cycle (UTC). */
export function nextRenewalUtc(
  previousRenewal: Date,
  billingCycle: "monthly" | "annual",
): Date {
  return billingCycle === "annual"
    ? addBillingYearsUtc(previousRenewal, 1)
    : addBillingMonthsUtc(previousRenewal, 1);
}

/**
 * Whole UTC calendar days remaining until renewal (ceil of ms).
 * Used for display / module pro-rata estimates — Stripe still owns money math.
 */
export function utcDaysRemaining(
  renewal: Date | string,
  now: Date = billingNowUtc(),
): number {
  const end = renewal instanceof Date ? renewal : new Date(renewal);
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** ISO-8601 UTC string for APIs / logs (always ends with Z). */
export function toBillingIsoUtc(instant: Date | string): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  return d.toISOString();
}

/**
 * Display a billing date as a UTC calendar date (YYYY-MM-DD) with "UTC" label.
 * Use for Billing UI renewal lines so local TZ cannot shift the day.
 */
export function formatBillingDateUtc(instant: Date | string): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day} UTC`;
}

/**
 * Locale-aware display that still forces timeZone UTC
 * (same calendar day everywhere).
 */
export function formatBillingDateUtcLocale(
  instant: Date | string,
  locale?: string,
): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return "";
  return (
    d.toLocaleDateString(locale, {
      timeZone: BILLING_TIMEZONE,
      year: "numeric",
      month: "short",
      day: "numeric",
    }) + " UTC"
  );
}
