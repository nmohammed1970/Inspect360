/** BILL-08 — photo credit definition (Billing Spec v2.0) */
export const PHOTOS_PER_CREDIT = 300;
export const PHOTO_WARN_THRESHOLD = 280;

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
