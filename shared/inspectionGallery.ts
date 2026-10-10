/** Inspection gallery destinations + validation helpers (template snapshot driven). */

export const GALLERY_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const GALLERY_MAX_BYTES = 50 * 1024 * 1024;
/** Max images accepted in one gallery/register API request (and per upload selection). */
export const GALLERY_REGISTER_BATCH_MAX = 500;
/** Max photos a user may select/upload to the gallery in one action. */
export const GALLERY_UPLOAD_SELECT_MAX = 500;
export const GALLERY_FIELD_PHOTO_MAX = 10;

export type GalleryTemplateField = {
  id?: string;
  key?: string;
  label?: string;
  type?: string;
};

export type GalleryTemplateSection = {
  id: string;
  title?: string;
  repeatable?: boolean;
  fields?: GalleryTemplateField[];
};

export type GalleryTemplateStructure = {
  sections?: GalleryTemplateSection[];
  [key: string]: unknown;
};

export type PhotoDestination = {
  sectionId: string;
  sectionRef: string;
  sectionLabel: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: "photo" | "photo_array";
};

export function isPhotoFieldType(type: string | undefined | null): type is "photo" | "photo_array" {
  return type === "photo" || type === "photo_array";
}

export function isAllowedGalleryMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  const normalized = mime.toLowerCase().split(";")[0].trim();
  return (GALLERY_ALLOWED_MIME_TYPES as readonly string[]).includes(normalized);
}

export function normalizeObjectUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let fileUrl = raw.trim();
  if (!fileUrl) return null;
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    try {
      const urlObj = new URL(fileUrl);
      const match = urlObj.pathname.match(/\/objects\/.*/);
      fileUrl = match ? match[0] : `/objects${urlObj.pathname}`;
    } catch {
      fileUrl = fileUrl.includes("/objects/")
        ? `/objects/${fileUrl.split("/objects/")[1]}`
        : fileUrl;
    }
  }
  if (!fileUrl.startsWith("/objects/")) {
    if (fileUrl.startsWith("/")) fileUrl = `/objects${fileUrl}`;
    else return null;
  }
  return fileUrl.split("?")[0];
}

function fieldKeyOf(field: GalleryTemplateField): string | null {
  const key = (field.id || field.key || "").trim();
  return key || null;
}

/**
 * Build assignable photo destinations from a frozen template snapshot and
 * current repeatable instance counts (sectionId → count).
 */
export function listPhotoDestinations(
  structure: GalleryTemplateStructure | null | undefined,
  repeatableCounts: Record<string, number> = {},
): PhotoDestination[] {
  const sections = Array.isArray(structure?.sections) ? structure!.sections! : [];
  const destinations: PhotoDestination[] = [];

  for (const section of sections) {
    if (!section?.id) continue;
    const photoFields = (section.fields || []).filter((f) => isPhotoFieldType(f.type));
    if (!photoFields.length) continue;

    const title = (section.title || section.id).trim() || section.id;

    if (section.repeatable) {
      const rawCount = Number(repeatableCounts[section.id] ?? 1);
      const count = Number.isFinite(rawCount)
        ? Math.max(1, Math.min(50, Math.floor(rawCount)))
        : 1;
      for (let i = 1; i <= count; i++) {
        const instanceLabel = `${title} ${i}`;
        const sectionRef = `${section.id}/${instanceLabel}`;
        for (const field of photoFields) {
          const fk = fieldKeyOf(field);
          if (!fk || !isPhotoFieldType(field.type)) continue;
          destinations.push({
            sectionId: section.id,
            sectionRef,
            sectionLabel: instanceLabel,
            fieldKey: fk,
            fieldLabel: (field.label || fk).trim() || fk,
            fieldType: field.type,
          });
        }
      }
    } else {
      for (const field of photoFields) {
        const fk = fieldKeyOf(field);
        if (!fk || !isPhotoFieldType(field.type)) continue;
        destinations.push({
          sectionId: section.id,
          sectionRef: section.id,
          sectionLabel: title,
          fieldKey: fk,
          fieldLabel: (field.label || fk).trim() || fk,
          fieldType: field.type,
        });
      }
    }
  }

  return destinations;
}

export function assertDestinationValid(
  structure: GalleryTemplateStructure | null | undefined,
  sectionRef: string,
  fieldKey: string,
  repeatableCounts: Record<string, number> = {},
): PhotoDestination | null {
  const dest = listPhotoDestinations(structure, repeatableCounts).find(
    (d) => d.sectionRef === sectionRef && d.fieldKey === fieldKey,
  );
  return dest || null;
}

export function formatDestinationLabel(dest: Pick<PhotoDestination, "sectionLabel" | "fieldLabel">): string {
  return `${dest.sectionLabel} → ${dest.fieldLabel}`;
}

/** Extract repeatable counts from seeded inspection entries. */
export function extractRepeatableCountsFromEntries(
  entries: Array<{ fieldKey?: string | null; valueJson?: unknown }> | null | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!entries) return counts;
  for (const entry of entries) {
    const fk = entry.fieldKey || "";
    if (!fk.startsWith("__repeatable_count_")) continue;
    const sectionId = fk.replace("__repeatable_count_", "");
    const raw =
      typeof entry.valueJson === "object" &&
      entry.valueJson !== null &&
      "value" in (entry.valueJson as object)
        ? Number((entry.valueJson as any).value)
        : Number(entry.valueJson);
    if (Number.isFinite(raw) && raw >= 1) {
      counts[sectionId] = Math.max(1, Math.min(50, Math.floor(raw)));
    }
  }
  return counts;
}
