/**
 * Per-field landlord report visibility (template structureJson).
 * Default OFF: missing / false → internal report only.
 */

export type FieldWithLandlordVisibility = {
  visibleToLandlord?: boolean | null;
};

/** True only when the template explicitly enables landlord visibility. */
export function isFieldVisibleToLandlord(
  field: FieldWithLandlordVisibility | null | undefined,
): boolean {
  return field?.visibleToLandlord === true;
}
