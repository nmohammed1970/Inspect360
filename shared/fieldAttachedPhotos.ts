/**
 * Optional multi-photo evidence on non-image template fields.
 * Default OFF: missing / false → no attached photo picker.
 */

export const MEDIA_FIELD_TYPES = new Set(["photo", "photo_array", "video"]);

export type FieldWithAttachedPhotos = {
  type?: string | null;
  allowMultiplePhotos?: boolean | null;
};

/** True when the template enables attached multi-photos and the field is not already media. */
export function fieldAllowsMultiplePhotos(
  field: FieldWithAttachedPhotos | null | undefined,
): boolean {
  if (!field || field.allowMultiplePhotos !== true) return false;
  const type = typeof field.type === "string" ? field.type : "";
  return !MEDIA_FIELD_TYPES.has(type);
}

/** Whether Template Builder should show the Allow Multiple Photos toggle. */
export function fieldCanConfigureAttachedPhotos(
  field: FieldWithAttachedPhotos | null | undefined,
): boolean {
  if (!field) return false;
  const type = typeof field.type === "string" ? field.type : "";
  return !MEDIA_FIELD_TYPES.has(type);
}
