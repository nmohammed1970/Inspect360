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
  /** Nested under a custom parent inspection point when set. */
  parentFieldId?: string;
};

export type GalleryTemplateSection = {
  id: string;
  title?: string;
  repeatable?: boolean;
  fields?: GalleryTemplateField[];
};

export type GalleryTemplateStructure = {
  sections?: GalleryTemplateSection[];
  /** Stable property-room instance paths: `{sectionId}/{roomId}` */
  propertyRoomInstances?: Array<{
    roomId?: string;
    sectionRef: string;
    title?: string;
  }>;
  [key: string]: unknown;
};

export type PhotoDestination = {
  sectionId: string;
  sectionRef: string;
  sectionLabel: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: "photo" | "photo_array";
  parentFieldKey?: string | null;
  parentFieldLabel?: string | null;
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

function parentFieldKeyOf(field: GalleryTemplateField): string | null {
  const parent = typeof field.parentFieldId === "string" ? field.parentFieldId.trim() : "";
  return parent || null;
}

function pushPhotoDestination(
  destinations: PhotoDestination[],
  opts: {
    sectionId: string;
    sectionRef: string;
    sectionLabel: string;
    field: GalleryTemplateField;
    fieldsByKey: Map<string, GalleryTemplateField>;
  },
) {
  const fk = fieldKeyOf(opts.field);
  if (!fk || !isPhotoFieldType(opts.field.type)) return;
  const parentKey = parentFieldKeyOf(opts.field);
  const parent = parentKey ? opts.fieldsByKey.get(parentKey) : undefined;
  destinations.push({
    sectionId: opts.sectionId,
    sectionRef: opts.sectionRef,
    sectionLabel: opts.sectionLabel,
    fieldKey: fk,
    fieldLabel: (opts.field.label || fk).trim() || fk,
    fieldType: opts.field.type,
    parentFieldKey: parentKey,
    parentFieldLabel: parent
      ? (parent.label || parentKey || "").trim() || parentKey
      : null,
  });
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

  const roomsBySection = new Map<
    string,
    Array<{ sectionRef: string; title: string }>
  >();
  const roomInstances = Array.isArray(structure?.propertyRoomInstances)
    ? structure!.propertyRoomInstances!
    : [];
  for (const room of roomInstances) {
    const ref = String(room?.sectionRef || "").trim();
    if (!ref.includes("/")) continue;
    const sectionId = ref.split("/")[0]!;
    const list = roomsBySection.get(sectionId) || [];
    list.push({
      sectionRef: ref,
      title: (room.title || ref.split("/")[1] || sectionId).trim(),
    });
    roomsBySection.set(sectionId, list);
  }

  for (const section of sections) {
    if (!section?.id) continue;
    const photoFields = (section.fields || []).filter((f) => isPhotoFieldType(f.type));
    if (!photoFields.length) continue;

    const fieldsByKey = new Map<string, GalleryTemplateField>();
    for (const field of section.fields || []) {
      const key = fieldKeyOf(field);
      if (key) fieldsByKey.set(key, field);
    }

    const title = (section.title || section.id).trim() || section.id;

    if (section.repeatable) {
      const propertyRooms = roomsBySection.get(section.id);
      if (propertyRooms?.length) {
        // Property rooms: stable sectionRef = `{sectionId}/{roomId}`
        for (const room of propertyRooms) {
          for (const field of photoFields) {
            pushPhotoDestination(destinations, {
              sectionId: section.id,
              sectionRef: room.sectionRef,
              sectionLabel: room.title,
              field: field,
              fieldsByKey,
            });
          }
        }
      } else {
        const rawCount = Number(repeatableCounts[section.id] ?? 1);
        const count = Number.isFinite(rawCount)
          ? Math.max(1, Math.min(50, Math.floor(rawCount)))
          : 1;
        for (let i = 1; i <= count; i++) {
          const instanceLabel = `${title} ${i}`;
          const sectionRef = `${section.id}/${instanceLabel}`;
          for (const field of photoFields) {
            pushPhotoDestination(destinations, {
              sectionId: section.id,
              sectionRef,
              sectionLabel: instanceLabel,
              field: field,
              fieldsByKey,
            });
          }
        }
      }
    } else {
      for (const field of photoFields) {
        pushPhotoDestination(destinations, {
          sectionId: section.id,
          sectionRef: section.id,
          sectionLabel: title,
          field: field,
          fieldsByKey,
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
  if (dest) return dest;

  // Fallback: accept stable property-room refs (`sectionId/roomId`) even when
  // propertyRoomInstances is missing from an older snapshot. Reject Title-N
  // refs (e.g. "Bedrooms 9") — those must match listPhotoDestinations counts.
  const ref = String(sectionRef || "").trim();
  const slash = ref.indexOf("/");
  if (slash <= 0) return null;
  const sectionId = ref.slice(0, slash);
  const instancePart = ref.slice(slash + 1).trim();
  if (!sectionId || !instancePart) return null;

  const sections = Array.isArray(structure?.sections) ? structure!.sections! : [];
  const section = sections.find((s) => s.id === sectionId);
  if (!section?.repeatable) return null;

  const sectionTitle = (section.title || section.id).trim() || section.id;
  if (new RegExp(`^${escapeRegExp(sectionTitle)}\\s+\\d+$`).test(instancePart)) {
    return null;
  }

  const field = (section.fields || []).find((f) => fieldKeyOf(f) === fieldKey);
  if (!field || !isPhotoFieldType(field.type)) return null;

  const parentKey = parentFieldKeyOf(field);
  const parent = parentKey
    ? (section.fields || []).find((f) => fieldKeyOf(f) === parentKey)
    : undefined;

  return {
    sectionId,
    sectionRef: ref,
    sectionLabel: instancePart,
    fieldKey,
    fieldLabel: (field.label || fieldKey).trim() || fieldKey,
    fieldType: field.type,
    parentFieldKey: parentKey,
    parentFieldLabel: parent
      ? (parent.label || parentKey || "").trim() || parentKey
      : null,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatDestinationLabel(
  dest: Pick<PhotoDestination, "sectionLabel" | "fieldLabel" | "parentFieldLabel">,
): string {
  const pointLabel = dest.parentFieldLabel
    ? `${dest.parentFieldLabel} › ${dest.fieldLabel}`
    : dest.fieldLabel;
  return `${dest.sectionLabel} → ${pointLabel}`;
}

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
