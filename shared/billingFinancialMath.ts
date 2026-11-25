/**
 * Pure financial helpers for Nov 2026 billing.
 * All money in integer minor units (pence). No floats for money arithmetic.
 */

export const INSPECTION_FLOOR_MINOR = 295; // £2.95
export const YEARLY_MULTIPLIER = 10;
export const PHOTOS_PER_CREDIT = 500;
export const AUTO_TOPUP_MAX_PER_MONTH = 3;
export const PAYMENT_FAILURE_READONLY_DAYS = 7;

/** credits = MAX(1, CEIL(photos / PHOTOS_PER_CREDIT)); 0 photos still costs 1 on first AI/complete. */
export function inspectionCreditsForPhotos(photoCount: unknown): number {
  const n = typeof photoCount === "number" ? photoCount : Number(photoCount);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.ceil(Math.floor(n) / PHOTOS_PER_CREDIT));
}

/** GSM-7 basic alphabet (excluding extension table). */
const GSM7_BASIC = new Set(
  Array.from(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
      "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
  ),
);

/** GSM-7 extension table characters (each costs 2 septets). */
const GSM7_EXTENDED = new Set(Array.from("^{}\\[~]|€"));

function isGsm7Char(ch: string): boolean {
  return GSM7_BASIC.has(ch) || GSM7_EXTENDED.has(ch);
}

function gsm7EncodingUnits(body: string): number {
  let units = 0;
  for (const ch of Array.from(body)) {
    if (GSM7_EXTENDED.has(ch)) units += 2;
    else units += 1;
  }
  return units;
}

function isGsm7Message(body: string): boolean {
  for (const ch of Array.from(body)) {
    if (!isGsm7Char(ch)) return false;
  }
  return true;
}

/**
 * TextMagic-style SMS segment credits:
 * - GSM-7 (incl. extended chars as 2 units): ≤160 → 1; multipart → ceil(units/153)
 * - Unicode: ≤70 → 1; multipart → ceil(units/67)
 */
export function smsCreditsForMessage(body: unknown): number {
  if (typeof body !== "string") return 1;
  if (!body.length) return 1;

  if (isGsm7Message(body)) {
    const units = gsm7EncodingUnits(body);
    if (units <= 160) return 1;
    return Math.ceil(units / 153);
  }

  const units = Array.from(body).length;
  if (units <= 70) return 1;
  return Math.ceil(units / 67);
}

export function yearlyFromMonthlyMinor(monthlyMinor: unknown): number | null {
  const n = typeof monthlyMinor === "number" ? monthlyMinor : Number(monthlyMinor);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n * YEARLY_MULTIPLIER;
}

export function isYearlyExactly10x(monthlyMinor: number, yearlyMinor: number): boolean {
  return yearlyFromMonthlyMinor(monthlyMinor) === yearlyMinor;
}

/** Round half-up via Math.round on integer division for per-inspection pence. */
export function perInspectionMinor(amountMinor: unknown, inspections: unknown): number | null {
  const amount = typeof amountMinor === "number" ? amountMinor : Number(amountMinor);
  const insp = typeof inspections === "number" ? inspections : Number(inspections);
  if (!Number.isFinite(amount) || !Number.isFinite(insp) || insp <= 0) return null;
  if (!Number.isInteger(amount) || amount < 0) return null;
  return Math.round(amount / insp);
}

export function meetsInspectionFloor(
  amountMinor: number,
  inspections: number,
  floorMinor = INSPECTION_FLOOR_MINOR,
): boolean {
  const per = perInspectionMinor(amountMinor, inspections);
  if (per == null) return false;
  return per >= floorMinor;
}

/**
 * Mid-cycle pack inspection credits.
 * credits = floor(inspectionsForFullPeriod * remainingFraction)
 * remainingFraction = clamp((periodEnd - now) / (periodEnd - periodStart), 0..1)
 * If periodEnd missing/past, treat remaining as 1 (full grant for added packs).
 */
export function proratedPackInspectionCredits(input: {
  inspectionsForFullPeriod: number;
  periodStartMs: number;
  periodEndMs: number;
  nowMs: number;
}): number {
  const insp = Math.floor(input.inspectionsForFullPeriod);
  if (!Number.isFinite(insp) || insp <= 0) return 0;
  const { periodStartMs, periodEndMs, nowMs } = input;
  if (!Number.isFinite(periodStartMs) || !Number.isFinite(periodEndMs) || !Number.isFinite(nowMs)) {
    return 0;
  }
  if (periodEndMs <= nowMs) return 0;
  const total = Math.max(1, periodEndMs - periodStartMs);
  const remaining = Math.max(0, Math.min(1, (periodEndMs - nowMs) / total));
  return Math.floor(insp * remaining);
}

/** Monthly SMS grant = max(1, floor(smsPerYear / 12)) when smsPerYear > 0. */
export function monthlySmsFromYearly(smsPerYear: unknown): number {
  const n = typeof smsPerYear === "number" ? smsPerYear : Number(smsPerYear);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.floor(n / 12));
}

export function isPastFailureReadonly(input: {
  firstFailureAtMs: number | null;
  nowMs: number;
  readonlyDays?: number;
}): boolean {
  if (input.firstFailureAtMs == null || !Number.isFinite(input.firstFailureAtMs)) return false;
  const days = input.readonlyDays ?? PAYMENT_FAILURE_READONLY_DAYS;
  const cutoff = input.nowMs - days * 24 * 60 * 60 * 1000;
  return input.firstFailureAtMs <= cutoff;
}

/** Idempotency: event already successfully processed. */
export function shouldSkipWebhookEvent(existing: {
  processedAt: Date | string | null;
} | null): boolean {
  return Boolean(existing?.processedAt);
}

/**
 * Price freeze: publishing a new catalog version must not rewrite
 * an existing subscription's priceVersionId.
 */
export function priceVersionFrozenAfterPublish(input: {
  beforeVersionId: string;
  afterVersionId: string;
}): boolean {
  return input.beforeVersionId === input.afterVersionId;
}

export function assertIntegerMinor(amount: unknown): amount is number {
  return typeof amount === "number" && Number.isInteger(amount) && Number.isFinite(amount);
}
