/** Inspection gallery destinations + validation helpers (template snapshot driven). */

import {
  cipInstanceLabel,
  expandCipFieldsForCount,
  getCipsForSection,
  isMetaSection,
  parseCipCountValue,
  parseCipExpandedFieldKey,
  resolveCipInstanceCount,
  type CustomInspectionPoint,
} from "./templateCustomInspectionPoints";
import { numberedRoomInstanceTitle, roomTypeFromRoomLike } from "./propertyRooms";
import { matchSectionToRoomType } from "./propertyLayout";

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
  customInspectionPointIds?: string[];
  fields?: GalleryTemplateField[];
};

export type GalleryTemplateStructure = {
  sections?: GalleryTemplateSection[];
  customInspectionPoints?: CustomInspectionPoint[];
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

function pushPhotoDestination(
  destinations: PhotoDestination[],
  opts: {
    sectionId: string;
    sectionRef: string;
    sectionLabel: string;
    field: GalleryTemplateField;
  },
) {
  const fk = fieldKeyOf(opts.field);
  if (!fk || !isPhotoFieldType(opts.field.type)) return;
  destinations.push({
    sectionId: opts.sectionId,
    sectionRef: opts.sectionRef,
    sectionLabel: opts.sectionLabel,
    fieldKey: fk,
    fieldLabel: (opts.field.label || fk).trim() || fk,
    fieldType: opts.field.type,
  });
}

/**
 * Optional per-sectionRef CIP counts: key = `${sectionRef}::${cipId}` → count
 * (or just cipId when count is global — prefer sectionRef-scoped).
 */
export type CipCountMap = Record<string, number>;

function cipCountFor(
  cip: CustomInspectionPoint,
  cipCounts: CipCountMap | undefined,
  sectionRef: string,
): number {
  const scoped = cipCounts?.[`${sectionRef}::${cip.id}`];
  const raw = scoped != null ? scoped : cipCounts?.[cip.id];
  return resolveCipInstanceCount(cip, raw);
}

function pushCipDestinations(
  destinations: PhotoDestination[],
  structure: GalleryTemplateStructure,
  sectionId: string,
  sectionRef: string,
  sectionLabel: string,
  cipCounts?: CipCountMap,
) {
  if (isMetaSection({ id: sectionId, title: sectionLabel })) return;
  const section =
    (structure.sections || []).find((s) => s.id === sectionId) ||
    ({ id: sectionId, title: sectionLabel } as GalleryTemplateSection);
  const cips = getCipsForSection(structure, section);
  for (const cip of cips) {
    const count = cipCountFor(cip, cipCounts, sectionRef);
    if (count < 1) continue;
    for (const field of expandCipFieldsForCount(cip, count)) {
      pushPhotoDestination(destinations, {
        sectionId,
        sectionRef,
        sectionLabel,
        field,
      });
    }
  }
}

function resolveRepeatableInstanceCount(
  sectionId: string,
  repeatableCounts: Record<string, number>,
  propertyRoomCount: number,
): number {
  const raw = Number(repeatableCounts[sectionId]);
  if (Number.isFinite(raw) && raw >= 1) {
    return Math.max(1, Math.min(50, Math.floor(raw)));
  }
  // No stored count: prefer property-room length when present (matches capture UI).
  if (propertyRoomCount > 0) return Math.min(50, propertyRoomCount);
  return 1;
}

/**
 * Build assignable photo destinations from a frozen template snapshot and
 * current repeatable instance counts (sectionId → count).
 * Instance enumeration mirrors Inspection Capture (property rooms + counts).
 * Pass `cipCounts` keyed by `${sectionRef}::${cipId}` for template CIP expansions.
 */
export function listPhotoDestinations(
  structure: GalleryTemplateStructure | null | undefined,
  repeatableCounts: Record<string, number> = {},
  cipCounts?: CipCountMap,
): PhotoDestination[] {
  const sections = Array.isArray(structure?.sections) ? structure!.sections! : [];
  const sectionIds = new Set(sections.map((s) => s.id).filter(Boolean));
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
    // Ignore orphan room paths whose section is not in this inspection template
    if (!sectionIds.has(sectionId)) continue;
    const list = roomsBySection.get(sectionId) || [];
    list.push({
      sectionRef: ref,
      title: (room.title || ref.split("/")[1] || sectionId).trim(),
    });
    roomsBySection.set(sectionId, list);
  }

  for (const section of sections) {
    if (!section?.id) continue;
    // Only fields defined on this template section (no invented points)
    const photoFields = (section.fields || []).filter(
      (f) => isPhotoFieldType(f.type) && !!(f.id || f.key),
    );
    const title = (section.title || section.id).trim() || section.id;

    if (section.repeatable) {
      const sectionRoomType = matchSectionToRoomType(section as any);
      // Drop mis-mapped rooms (e.g. Living Room under Bedrooms from "room" token match)
      let propertyRooms = roomsBySection.get(section.id) || [];
      if (sectionRoomType) {
        propertyRooms = propertyRooms.filter((room) => {
          const roomType = roomTypeFromRoomLike({ name: room.title });
          return roomType === sectionRoomType;
        });
      }
      const instanceCount = resolveRepeatableInstanceCount(
        section.id,
        repeatableCounts,
        propertyRooms.length,
      );

      for (let i = 0; i < instanceCount; i++) {
        const room = propertyRooms[i];
        const sectionRef =
          room?.sectionRef || `${section.id}/${title} ${i + 1}`;
        const sectionLabel = numberedRoomInstanceTitle(
          room?.title,
          title,
          i,
        );
        for (const field of photoFields) {
          pushPhotoDestination(destinations, {
            sectionId: section.id,
            sectionRef,
            sectionLabel,
            field,
          });
        }
        if (structure) {
          pushCipDestinations(
            destinations,
            structure,
            section.id,
            sectionRef,
            sectionLabel,
            cipCounts,
          );
        }
      }
    } else {
      for (const field of photoFields) {
        pushPhotoDestination(destinations, {
          sectionId: section.id,
          sectionRef: section.id,
          sectionLabel: title,
          field,
        });
      }
      if (structure) {
        pushCipDestinations(
          destinations,
          structure,
          section.id,
          section.id,
          title,
          cipCounts,
        );
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
  cipCounts?: CipCountMap,
): PhotoDestination | null {
  // When validating a specific CIP expanded field, ensure that instance is listed
  // even if the CIP count entry is missing/stale (common right after Browse upload).
  const cipParsed = parseCipExpandedFieldKey(fieldKey);
  const countsForList: CipCountMap = { ...(cipCounts || {}) };
  if (cipParsed) {
    const ref = String(sectionRef || "").trim();
    const scopedKey = `${ref}::${cipParsed.cipId}`;
    const current = countsForList[scopedKey] ?? countsForList[cipParsed.cipId] ?? 0;
    if (current < cipParsed.instanceIndex) {
      countsForList[scopedKey] = cipParsed.instanceIndex;
    }
  }

  const dest = listPhotoDestinations(structure, repeatableCounts, countsForList).find(
    (d) => d.sectionRef === sectionRef && d.fieldKey === fieldKey,
  );
  if (dest) return dest;

  const ref = String(sectionRef || "").trim();
  const sections = Array.isArray(structure?.sections) ? structure!.sections! : [];

  // CIP expanded keys: resolve directly from template (works for non-repeatable sections too)
  if (cipParsed && structure) {
    const sectionId = ref.includes("/") ? ref.split("/")[0]! : ref;
    const section =
      sections.find((s) => s.id === sectionId) ||
      ({ id: sectionId, title: sectionId } as GalleryTemplateSection);
    if (!isMetaSection(section)) {
      const cips = getCipsForSection(structure, section);
      const cip = cips.find((c) => c.id === cipParsed.cipId);
      const baseField = (cip?.fields || []).find((f) => fieldKeyOf(f) === cipParsed.fieldId);
      if (cip && baseField && isPhotoFieldType(baseField.type)) {
        const slash = ref.indexOf("/");
        const sectionLabel =
          slash > 0
            ? ref.slice(slash + 1).trim() || (section.title || sectionId)
            : (section.title || sectionId).trim() || sectionId;
        return {
          sectionId,
          sectionRef: ref,
          sectionLabel,
          fieldKey,
          fieldLabel:
            `${cipInstanceLabel(cip.label, cipParsed.instanceIndex)} — ${baseField.label || cipParsed.fieldId}`.trim(),
          fieldType: baseField.type,
        };
      }
    }
  }

  const slash = ref.indexOf("/");
  if (slash <= 0) return null;
  const sectionId = ref.slice(0, slash);
  const instancePart = ref.slice(slash + 1).trim();
  if (!sectionId || !instancePart) return null;

  const section = sections.find((s) => s.id === sectionId);
  if (!section?.repeatable) return null;

  const sectionTitle = (section.title || section.id).trim() || section.id;
  if (new RegExp(`^${escapeRegExp(sectionTitle)}\\s+\\d+$`).test(instancePart)) {
    return null;
  }

  const field = (section.fields || []).find((f) => fieldKeyOf(f) === fieldKey);
  if (!field || !isPhotoFieldType(field.type)) return null;

  return {
    sectionId,
    sectionRef: ref,
    sectionLabel: instancePart,
    fieldKey,
    fieldLabel: (field.label || fieldKey).trim() || fieldKey,
    fieldType: field.type,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatDestinationLabel(
  dest: Pick<PhotoDestination, "sectionLabel" | "fieldLabel">,
): string {
  return `${dest.sectionLabel} → ${dest.fieldLabel}`;
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

/** Build `${sectionRef}::${cipId}` → count from CIP count entries. */
export function extractCipCountsFromEntries(
  entries: Array<{
    sectionRef?: string | null;
    fieldKey?: string | null;
    valueJson?: unknown;
  }> | null | undefined,
): CipCountMap {
  const counts: CipCountMap = {};
  if (!entries) return counts;
  for (const entry of entries) {
    const fk = entry.fieldKey || "";
    if (!fk.startsWith("__cip_count_")) continue;
    const cipId = fk.replace("__cip_count_", "");
    const sectionRef = String(entry.sectionRef || "").trim();
    if (!cipId || !sectionRef) continue;
    counts[`${sectionRef}::${cipId}`] = parseCipCountValue(entry.valueJson);
  }
  return counts;
}
