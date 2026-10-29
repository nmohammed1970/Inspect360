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
import { fieldAllowsMultiplePhotos } from "./fieldAttachedPhotos";
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
  allowMultiplePhotos?: boolean | null;
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

/** Native photo fields or non-media fields with Allow Multiple Photos enabled. */
export function isAssignablePhotoField(field: GalleryTemplateField | null | undefined): boolean {
  if (!field) return false;
  if (isPhotoFieldType(field.type)) return true;
  return fieldAllowsMultiplePhotos(field);
}

function destinationFieldType(field: GalleryTemplateField): "photo" | "photo_array" {
  if (field.type === "photo") return "photo";
  return "photo_array";
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
  if (!fk || !isAssignablePhotoField(opts.field)) return;
  destinations.push({
    sectionId: opts.sectionId,
    sectionRef: opts.sectionRef,
    sectionLabel: opts.sectionLabel,
    fieldKey: fk,
    fieldLabel: (opts.field.label || fk).trim() || fk,
    fieldType: destinationFieldType(opts.field),
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

export type RepeatableInstanceRef = {
  index: number;
  sectionRef: string;
  sectionLabel: string;
  /** Other refs that may have been used for the same instance (synthetic Title N ↔ room id). */
  aliasRefs: string[];
};

function propertyRoomsForSection(
  structure: GalleryTemplateStructure | null | undefined,
  section: GalleryTemplateSection,
): Array<{ sectionRef: string; title: string }> {
  const sectionIds = new Set(
    (Array.isArray(structure?.sections) ? structure!.sections! : [])
      .map((s) => s.id)
      .filter(Boolean),
  );
  const roomInstances = Array.isArray(structure?.propertyRoomInstances)
    ? structure!.propertyRoomInstances!
    : [];
  let propertyRooms: Array<{ sectionRef: string; title: string }> = [];
  for (const room of roomInstances) {
    const ref = String(room?.sectionRef || "").trim();
    if (!ref.includes("/")) continue;
    const sectionId = ref.split("/")[0]!;
    if (!sectionIds.has(sectionId) || sectionId !== section.id) continue;
    propertyRooms.push({
      sectionRef: ref,
      title: (room.title || ref.split("/")[1] || sectionId).trim(),
    });
  }
  const sectionRoomType = matchSectionToRoomType(section as any);
  if (sectionRoomType) {
    propertyRooms = propertyRooms.filter((room) => {
      return roomTypeFromRoomLike({ name: room.title }) === sectionRoomType;
    });
  }
  return propertyRooms;
}

/**
 * Repeatable instance refs shared by Capture UI and gallery destinations so
 * sectionRef keys stay identical (photos show on the field after assign).
 */
export function listRepeatableInstances(
  structure: GalleryTemplateStructure | null | undefined,
  sectionId: string,
  repeatableCounts: Record<string, number> = {},
): RepeatableInstanceRef[] {
  const sections = Array.isArray(structure?.sections) ? structure!.sections! : [];
  const section = sections.find((s) => s.id === sectionId);
  if (!section?.repeatable) return [];

  const title = (section.title || section.id).trim() || section.id;
  const propertyRooms = propertyRoomsForSection(structure, section);
  const instanceCount = resolveRepeatableInstanceCount(
    section.id,
    repeatableCounts,
    propertyRooms.length,
  );

  const out: RepeatableInstanceRef[] = [];
  for (let i = 0; i < instanceCount; i++) {
    const room = propertyRooms[i];
    const synthetic = `${section.id}/${title} ${i + 1}`;
    const sectionRef = room?.sectionRef || synthetic;
    const aliasRefs: string[] = [];
    if (sectionRef !== synthetic) aliasRefs.push(synthetic);
    if (room?.sectionRef && room.sectionRef !== sectionRef) aliasRefs.push(room.sectionRef);
    out.push({
      index: i,
      sectionRef,
      sectionLabel: numberedRoomInstanceTitle(room?.title, title, i),
      aliasRefs,
    });
  }
  return out;
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
  const destinations: PhotoDestination[] = [];

  for (const section of sections) {
    if (!section?.id) continue;
    // Native photo fields + non-media fields with Allow Multiple Photos
    const photoFields = (section.fields || []).filter(
      (f) => isAssignablePhotoField(f) && !!(f.id || f.key),
    );
    const title = (section.title || section.id).trim() || section.id;

    if (section.repeatable) {
      const instances = listRepeatableInstances(structure, section.id, repeatableCounts);
      for (const inst of instances) {
        for (const field of photoFields) {
          pushPhotoDestination(destinations, {
            sectionId: section.id,
            sectionRef: inst.sectionRef,
            sectionLabel: inst.sectionLabel,
            field,
          });
        }
        if (structure) {
          pushCipDestinations(
            destinations,
            structure,
            section.id,
            inst.sectionRef,
            inst.sectionLabel,
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
      if (cip && baseField && isAssignablePhotoField(baseField)) {
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
          fieldType: destinationFieldType(baseField),
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
  const titleNumMatch = instancePart.match(
    new RegExp(`^${escapeRegExp(sectionTitle)}\\s+(\\d+)$`, "i"),
  );

  const field = (section.fields || []).find((f) => fieldKeyOf(f) === fieldKey);
  if (!field || !isAssignablePhotoField(field)) return null;

  // Capture often sends synthetic "{Title} N" while destinations use property-room
  // UUID paths. Accept the client sectionRef when it names a valid instance so
  // entry keys match the Capture UI (photos actually appear on the field).
  if (titleNumMatch) {
    const instanceIndex = Math.floor(Number(titleNumMatch[1]));
    if (!Number.isFinite(instanceIndex) || instanceIndex < 1 || instanceIndex > 50) {
      return null;
    }

    const instances = listRepeatableInstances(structure, sectionId, repeatableCounts);
    const inst = instances[instanceIndex - 1];
    if (!inst) return null;

    return {
      sectionId,
      sectionRef: ref,
      sectionLabel: inst.sectionLabel,
      fieldKey,
      fieldLabel: (field.label || fieldKey).trim() || fieldKey,
      fieldType: destinationFieldType(field),
    };
  }

  // UUID / custom room path — accept when it matches a known instance or any
  // in-range property-room style ref for this repeatable section.
  const instances = listRepeatableInstances(structure, sectionId, repeatableCounts);
  const matchedInst = instances.find(
    (inst) => inst.sectionRef === ref || inst.aliasRefs.includes(ref),
  );
  if (!matchedInst && instances.length > 0) {
    // Unknown room path: still allow if field is assignable (legacy room ids).
    return {
      sectionId,
      sectionRef: ref,
      sectionLabel: instancePart,
      fieldKey,
      fieldLabel: (field.label || fieldKey).trim() || fieldKey,
      fieldType: destinationFieldType(field),
    };
  }
  if (!matchedInst && instances.length === 0) return null;

  return {
    sectionId,
    sectionRef: ref,
    sectionLabel: matchedInst?.sectionLabel || instancePart,
    fieldKey,
    fieldLabel: (field.label || fieldKey).trim() || fieldKey,
    fieldType: destinationFieldType(field),
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
