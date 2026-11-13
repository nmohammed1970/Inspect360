/**
 * Photo credit band.
 * Nov 2026 Billing Build Guide: 500 photos/credit.
 * (Previous BILL-08 used 300 — superseded for self-serve catalog.)
 */
export const PHOTOS_PER_CREDIT = 500;
export const PHOTO_WARN_THRESHOLD = 480;

/** @deprecated Use PHOTOS_PER_CREDIT */
export const PHOTOS_PER_UNIT = PHOTOS_PER_CREDIT;

/** creditsConsumed = MAX(1, CEIL(photoCount / PHOTOS_PER_CREDIT)) */
export function creditsConsumed(photoCount: number): number {
  const n = Math.max(0, Math.floor(photoCount || 0));
  if (n <= 0) return 1;
  return Math.max(1, Math.ceil(n / PHOTOS_PER_CREDIT));
}

/** @deprecated Use creditsConsumed */
export const unitsConsumed = creditsConsumed;
