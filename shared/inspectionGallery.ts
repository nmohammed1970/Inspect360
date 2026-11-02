/** Inspection gallery destinations + validation helpers (template snapshot driven). */

import {
  cipInstanceLabel,
  expandCipFieldsForCount,
  getCipsForSection,
  isMetaSection,
  parseCipCountValue,
  parseCipExpandedFieldKey,
  resolveCipInstanceCount,
  resolveFieldLabelFromTemplateStructure,
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

/**
 * Reserved field key for images uploaded into a Section Gallery that are not yet
 * assigned to a specific inspection point. Stored on assignments only (not entries.photos).
 */
export const SECTION_GALLERY_FIELD_KEY = "__section_gallery__";

export function isSectionGalleryFieldKey(fieldKey: string | null | undefined): boolean {
  return String(fieldKey || "").trim() === SECTION_GALLERY_FIELD_KEY;
}

export type GalleryAssignmentLike = {
  sectionRef?: string | null;
  fieldKey?: string | null;
};

export type GalleryImageScopeLike = {
  assignments?: GalleryAssignmentLike[] | null;
};

/** True when any assignment belongs to this section instance (exact or alias refs). */
export function matchesSectionScope(
  image: GalleryImageScopeLike | null | undefined,
  sectionRef: string,
  aliasRefs: string[] = [],
): boolean {
  const refs = new Set(
    [sectionRef, ...aliasRefs]
      .map((r) => String(r || "").trim())
      .filter(Boolean),
  );
  if (!refs.size) return false;
  const assignments = image?.assignments || [];
  return assignments.some((a) => refs.has(String(a.sectionRef || "").trim()));
}

/** Resolve section id from a sectionRef (`sectionId` or `sectionId/instance`). */
export function sectionIdFromRef(sectionRef: string): string {
  const ref = String(sectionRef || "").trim();
  if (!ref) return "";
  const slash = ref.indexOf("/");
  return slash > 0 ? ref.slice(0, slash) : ref;
}

/** Room-type sections Capture may force-expand even when template.repeatable is false. */
export function isPropertyLayoutRoomSection(
  section: GalleryTemplateSection | null | undefined,
): boolean {
  if (!section) return false;
  const roomType = matchSectionToRoomType(section as any);
  return (
    roomType === "kitchens" ||
    roomType === "livingRooms" ||
    roomType === "bedrooms" ||
    roomType === "bathrooms"
  );
}

/**
 * Whether gallery destination listing should emit per-instance refs.
 * Matches Capture: template.repeatable OR property-layout room section with
 * a stored count / property rooms.
 */
export function sectionShouldExpandAsInstances(
  section: GalleryTemplateSection | null | undefined,
  structure: GalleryTemplateStructure | null | undefined,
  repeatableCounts: Record<string, number> = {},
): boolean {
  if (!section?.id) return false;
  if (section.repeatable) return true;
  if (!isPropertyLayoutRoomSection(section)) return false;
  const raw = Number(repeatableCounts[section.id]);
  if (Number.isFinite(raw) && raw >= 1) return true;
  return propertyRoomsForSection(structure, section).length > 0;
}

/**
 * Human-readable section/instance label for a sectionRef (exact or alias).
 * Used for Section Gallery badges so UUID room paths show as "Bedroom 1".
 * Also resolves Capture forced-repeatable Kitchen/Living refs
 * (e.g. section_xxx/Kitchen Overview 1 → "Kitchen Overview 1").
 */
function looksLikeRoomIdSuffix(instancePart: string): boolean {
  const part = String(instancePart || "").trim();
  if (!part) return false;
  // UUID room ids and opaque ids — never show these as badge text
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part)) {
    return true;
  }
  if (/^(room_|rm_)/i.test(part)) return true;
  return false;
}

export function resolveSectionInstanceLabel(
  structure: GalleryTemplateStructure | null | undefined,
  sectionRef: string,
  repeatableCounts: Record<string, number> = {},
): string | null {
  const ref = String(sectionRef || "").trim();
  if (!ref) return null;
  const sections = Array.isArray(structure?.sections) ? structure!.sections! : [];
  const sectionId = sectionIdFromRef(ref);
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return null;

  const sectionTitle = (section.title || section.id).trim() || section.id;
  const hasInstancePath = ref.includes("/");

  // Plain non-instance ref
  if (!hasInstancePath) {
    return sectionTitle;
  }

  // Instance path: expand using the same forced-repeatable rules as assign
  const force =
    !section.repeatable && sectionActsAsRepeatableForInstanceRef(section, ref);
  if (!section.repeatable && !force) {
    // Unknown instance path on a truly non-repeatable section — use trailing name
    const part = ref.slice(ref.indexOf("/") + 1).trim();
    return part || sectionTitle;
  }

  const instances = listRepeatableInstances(
    structure,
    sectionId,
    repeatableCounts,
    force,
  );
  const matched = instances.find(
    (inst) => inst.sectionRef === ref || inst.aliasRefs.includes(ref),
  );
  if (matched?.sectionLabel) return matched.sectionLabel;

  const instancePart = ref.slice(ref.indexOf("/") + 1).trim();
  if (!instancePart) return sectionTitle;

  // Exact section-title N → prefer layout/property-room label when available
  const titleNumMatch = instancePart.match(
    new RegExp(`^${escapeRegExp(sectionTitle)}\\s+(\\d+)$`, "i"),
  );
  if (titleNumMatch) {
    const idx = Math.floor(Number(titleNumMatch[1]));
    const inst = instances[idx - 1];
    if (inst?.sectionLabel) return inst.sectionLabel;
    if (Number.isFinite(idx) && idx >= 1) {
      return numberedRoomInstanceTitle(null, sectionTitle, idx - 1);
    }
  }

  // Loose "Kitchen Overview 1" while section title is "Kitchen": prefer the
  // same sectionLabel destinations/Capture use (room title or "Kitchen 1"),
  // so badges and Assign never disagree on vocabulary.
  const looseNum = instancePart.match(/^(.+)\s+(\d+)$/);
  if (looseNum && !looksLikeRoomIdSuffix(instancePart)) {
    const idx = Math.floor(Number(looseNum[2]));
    const inst = instances[idx - 1];
    if (inst?.sectionLabel) return inst.sectionLabel;
    if (Number.isFinite(idx) && idx >= 1) {
      return numberedRoomInstanceTitle(instancePart, sectionTitle, idx - 1);
    }
  }

  if (!looksLikeRoomIdSuffix(instancePart)) {
    return instancePart;
  }

  // Opaque room id with no matched instance — fall back to section title + index
  // is unavailable; use section title alone rather than raw UUID.
  return sectionTitle;
}

/**
 * Human label for a gallery assignment badge (section pool or point).
 * Never returns raw `sectionId/…` paths when a readable name can be derived.
 */
export function resolveGalleryAssignmentLabel(
  structure: GalleryTemplateStructure | null | undefined,
  sectionRef: string,
  fieldKey: string,
  repeatableCounts: Record<string, number> = {},
): string {
  const ref = String(sectionRef || "").trim();
  const key = String(fieldKey || "").trim();
  const sectionLabel =
    resolveSectionInstanceLabel(structure, ref, repeatableCounts) ||
    (ref.includes("/") ? ref.slice(ref.indexOf("/") + 1).trim() : ref) ||
    ref;

  if (!key || isSectionGalleryFieldKey(key)) {
    return sectionLabel;
  }

  const fieldLabel =
    resolveFieldLabelFromTemplateStructure(structure as any, key) || key;
  return formatDestinationLabel({
    sectionLabel,
    fieldLabel,
    fieldKey: key,
  });
}

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
/**
 * Capture forces Kitchen/Living (and bed/bath) repeatable via property layout
 * even when the frozen template left them non-repeatable. When the client sends
 * an instance-style sectionRef (`sectionId/...`), treat those room-type sections
 * as repeatable for gallery assign validation only.
 */
export function sectionActsAsRepeatableForInstanceRef(
  section: GalleryTemplateSection | null | undefined,
  sectionRef: string,
): boolean {
  if (!section) return false;
  if (section.repeatable) return true;
  if (!String(sectionRef || "").includes("/")) return false;
  const roomType = matchSectionToRoomType(section as any);
  return (
    roomType === "kitchens" ||
    roomType === "livingRooms" ||
    roomType === "bedrooms" ||
    roomType === "bathrooms"
  );
}

export function listRepeatableInstances(
  structure: GalleryTemplateStructure | null | undefined,
  sectionId: string,
  repeatableCounts: Record<string, number> = {},
  /** When true, also expand Kitchen/Living/etc that Capture forced repeatable. */
  forceRoomTypeRepeatable = false,
): RepeatableInstanceRef[] {
  const sections = Array.isArray(structure?.sections) ? structure!.sections! : [];
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return [];
  if (!section.repeatable && !forceRoomTypeRepeatable) return [];
  if (
    !section.repeatable &&
    forceRoomTypeRepeatable &&
    !sectionActsAsRepeatableForInstanceRef(section, `${sectionId}/x`)
  ) {
    return [];
  }

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
    const sectionLabel = numberedRoomInstanceTitle(room?.title, title, i);
    const aliasRefs: string[] = [];
    const pushAlias = (ref: string | null | undefined) => {
      const r = String(ref || "").trim();
      if (!r || r === sectionRef || aliasRefs.includes(r)) return;
      aliasRefs.push(r);
    };
    pushAlias(synthetic);
    pushAlias(room?.sectionRef);
    // Display-title paths Capture/gallery may have stored historically
    // (e.g. "Kitchen Overview" / "Kitchen Overview 1" vs UUID / "Kitchen 1").
    pushAlias(`${section.id}/${sectionLabel}`);
    if (!/\s+\d+\s*$/.test(sectionLabel)) {
      pushAlias(`${section.id}/${sectionLabel} ${i + 1}`);
    }
    out.push({
      index: i,
      sectionRef,
      sectionLabel,
      aliasRefs,
    });
  }
  return out;
}

/**
 * Resolve the canonical (primary) instance ref + aliases for any sectionRef
 * that belongs to a repeatable / forced-repeatable room instance.
 * Used to stop dual-key splits (UUID vs Title N vs Overview N).
 */
export function resolveInstanceRefFamily(
  structure: GalleryTemplateStructure | null | undefined,
  sectionRef: string,
  repeatableCounts: Record<string, number> = {},
): { primary: string; aliasRefs: string[]; allRefs: string[] } | null {
  const ref = String(sectionRef || "").trim();
  if (!ref) return null;

  const sectionId = sectionIdFromRef(ref);
  const sections = Array.isArray(structure?.sections) ? structure!.sections! : [];
  const section = sections.find((s) => s.id === sectionId);
  if (!section) {
    return { primary: ref, aliasRefs: [], allRefs: [ref] };
  }

  const force =
    !section.repeatable &&
    sectionActsAsRepeatableForInstanceRef(
      section,
      ref.includes("/") ? ref : `${sectionId}/x`,
    );
  if (!section.repeatable && !force) {
    return { primary: section.id, aliasRefs: [], allRefs: [section.id] };
  }

  const instances = listRepeatableInstances(
    structure,
    sectionId,
    repeatableCounts,
    force,
  );

  const matched = instances.find(
    (inst) => inst.sectionRef === ref || inst.aliasRefs.includes(ref),
  );
  if (matched) {
    const allRefs = [matched.sectionRef, ...matched.aliasRefs].filter(
      (r, i, arr) => r && arr.indexOf(r) === i,
    );
    return {
      primary: matched.sectionRef,
      aliasRefs: allRefs.filter((r) => r !== matched.sectionRef),
      allRefs,
    };
  }

  // Loose "Kitchen Overview 1" → instance index N
  if (ref.includes("/")) {
    const part = ref.slice(ref.indexOf("/") + 1).trim();
    const loose = part.match(/^(.+)\s+(\d+)$/);
    if (loose) {
      const idx = Math.floor(Number(loose[2]));
      const inst = instances[idx - 1];
      if (inst && Number.isFinite(idx) && idx >= 1) {
        const allRefs = [inst.sectionRef, ...inst.aliasRefs, ref].filter(
          (r, i, arr) => r && arr.indexOf(r) === i,
        );
        return {
          primary: inst.sectionRef,
          aliasRefs: allRefs.filter((r) => r !== inst.sectionRef),
          allRefs,
        };
      }
    }
  }

  return { primary: ref, aliasRefs: [], allRefs: [ref] };
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
    const expand = sectionShouldExpandAsInstances(section, structure, repeatableCounts);

    if (expand) {
      const instances = listRepeatableInstances(
        structure,
        section.id,
        repeatableCounts,
        !section.repeatable,
      );
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

/**
 * Resolve a valid section-pool destination for Section Gallery uploads
 * (fieldKey === SECTION_GALLERY_FIELD_KEY). Not listed in point Assign dialogs.
 */
export function assertSectionGalleryDestination(
  structure: GalleryTemplateStructure | null | undefined,
  sectionRef: string,
  repeatableCounts: Record<string, number> = {},
): PhotoDestination | null {
  const ref = String(sectionRef || "").trim();
  if (!ref) return null;
  const sections = Array.isArray(structure?.sections) ? structure!.sections! : [];
  const sectionId = sectionIdFromRef(ref);
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return null;

  if (sectionActsAsRepeatableForInstanceRef(section, ref)) {
    const instances = listRepeatableInstances(
      structure,
      sectionId,
      repeatableCounts,
      !section.repeatable,
    );
    const matched = instances.find(
      (inst) => inst.sectionRef === ref || inst.aliasRefs.includes(ref),
    );
    if (matched) {
      return {
        sectionId,
        sectionRef: matched.sectionRef,
        sectionLabel: matched.sectionLabel,
        fieldKey: SECTION_GALLERY_FIELD_KEY,
        fieldLabel: "Section Gallery",
        fieldType: "photo_array",
      };
    }
    // Synthetic Title N for a valid in-range instance (section title or room title)
    const title = (section.title || section.id).trim() || section.id;
    const instancePart = ref.includes("/") ? ref.slice(ref.indexOf("/") + 1).trim() : "";
    const titleNumMatch = instancePart.match(
      new RegExp(`^${escapeRegExp(title)}\\s+(\\d+)$`, "i"),
    );
    if (titleNumMatch) {
      const idx = Math.floor(Number(titleNumMatch[1]));
      const inst = instances[idx - 1];
      if (inst) {
        return {
          sectionId,
          sectionRef: inst.sectionRef,
          sectionLabel: inst.sectionLabel,
          fieldKey: SECTION_GALLERY_FIELD_KEY,
          fieldLabel: "Section Gallery",
          fieldType: "photo_array",
        };
      }
    }
    // Property rooms often use display titles like "Kitchen Overview 1" while the
    // template section title is just "Kitchen" — accept in-range "… N" refs.
    const looseNum = instancePart.match(/^(.+)\s+(\d+)$/);
    if (looseNum) {
      const idx = Math.floor(Number(looseNum[2]));
      const inst = instances[idx - 1];
      if (inst && Number.isFinite(idx) && idx >= 1) {
        return {
          sectionId,
          sectionRef: inst.sectionRef,
          sectionLabel: inst.sectionLabel,
          fieldKey: SECTION_GALLERY_FIELD_KEY,
          fieldLabel: "Section Gallery",
          fieldType: "photo_array",
        };
      }
    }
    return null;
  }

  // Non-repeatable: sectionRef must be the section id
  if (ref !== section.id) return null;
  return {
    sectionId: section.id,
    sectionRef: section.id,
    sectionLabel: (section.title || section.id).trim() || section.id,
    fieldKey: SECTION_GALLERY_FIELD_KEY,
    fieldLabel: "Section Gallery",
    fieldType: "photo_array",
  };
}

export function assertDestinationValid(
  structure: GalleryTemplateStructure | null | undefined,
  sectionRef: string,
  fieldKey: string,
  repeatableCounts: Record<string, number> = {},
  cipCounts?: CipCountMap,
): PhotoDestination | null {
  if (isSectionGalleryFieldKey(fieldKey)) {
    return assertSectionGalleryDestination(structure, sectionRef, repeatableCounts);
  }

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

  const ref = String(sectionRef || "").trim();
  const familyForList = resolveInstanceRefFamily(structure, ref, repeatableCounts);
  const dest = listPhotoDestinations(structure, repeatableCounts, countsForList).find(
    (d) =>
      d.fieldKey === fieldKey &&
      (d.sectionRef === ref ||
        (familyForList && d.sectionRef === familyForList.primary)),
  );
  if (dest) return dest;

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
        const family = resolveInstanceRefFamily(structure, ref, repeatableCounts);
        const primaryRef = family?.primary || ref;
        const sectionLabel =
          resolveSectionInstanceLabel(structure, primaryRef, repeatableCounts) ||
          (section.title || sectionId).trim() ||
          sectionId;
        return {
          sectionId,
          sectionRef: primaryRef,
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
  if (!sectionActsAsRepeatableForInstanceRef(section, ref)) return null;

  const sectionTitle = (section!.title || section!.id).trim() || section!.id;
  const titleNumMatch = instancePart.match(
    new RegExp(`^${escapeRegExp(sectionTitle)}\\s+(\\d+)$`, "i"),
  );
  // e.g. section title "Kitchen" but Capture sends "Kitchen Overview 1"
  const looseTitleNumMatch = titleNumMatch
    ? null
    : instancePart.match(/^(.+)\s+(\d+)$/);

  const field = (section!.fields || []).find((f) => fieldKeyOf(f) === fieldKey);
  if (!field || !isAssignablePhotoField(field)) return null;

  const forceRoomType = !section!.repeatable;
  // Capture often sends synthetic "{Title} N" while destinations use property-room
  // UUID paths. Accept the client sectionRef when it names a valid instance so
  // entry keys match the Capture UI (photos actually appear on the field).
  const numberedMatch = titleNumMatch || looseTitleNumMatch;
  if (numberedMatch) {
    const instanceIndex = Math.floor(Number(numberedMatch[numberedMatch.length - 1]));
    if (!Number.isFinite(instanceIndex) || instanceIndex < 1 || instanceIndex > 50) {
      return null;
    }

    const instances = listRepeatableInstances(
      structure,
      sectionId,
      repeatableCounts,
      forceRoomType,
    );
    const inst = instances[instanceIndex - 1];
    if (!inst) return null;

    // Same display vocabulary as Capture / listPhotoDestinations.
    return {
      sectionId,
      sectionRef: inst.sectionRef,
      sectionLabel: inst.sectionLabel,
      fieldKey,
      fieldLabel: (field.label || fieldKey).trim() || fieldKey,
      fieldType: destinationFieldType(field),
    };
  }

  // UUID / custom room path — accept when it matches a known instance or any
  // in-range property-room style ref for this repeatable section.
  const instances = listRepeatableInstances(
    structure,
    sectionId,
    repeatableCounts,
    forceRoomType,
  );
  const matchedInst = instances.find(
    (inst) => inst.sectionRef === ref || inst.aliasRefs.includes(ref),
  );
  if (!matchedInst && instances.length > 0) {
    // Legacy unknown room id: canonicalize into the family when possible.
    const family = resolveInstanceRefFamily(structure, ref, repeatableCounts);
    const fallbackInst =
      (family &&
        instances.find(
          (inst) =>
            inst.sectionRef === family.primary ||
            inst.aliasRefs.includes(family.primary),
        )) ||
      null;
    return {
      sectionId,
      sectionRef: fallbackInst?.sectionRef || family?.primary || ref,
      sectionLabel:
        fallbackInst?.sectionLabel ||
        resolveSectionInstanceLabel(structure, ref, repeatableCounts) ||
        instancePart,
      fieldKey,
      fieldLabel: (field.label || fieldKey).trim() || fieldKey,
      fieldType: destinationFieldType(field),
    };
  }
  if (!matchedInst && instances.length === 0) return null;

  return {
    sectionId,
    sectionRef: matchedInst!.sectionRef,
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
  dest: Pick<PhotoDestination, "sectionLabel" | "fieldLabel" | "fieldKey">,
): string {
  if (isSectionGalleryFieldKey(dest.fieldKey) || dest.fieldLabel === "Section Gallery") {
    return dest.sectionLabel;
  }
  return `${dest.sectionLabel} → ${dest.fieldLabel}`;
}

/** Point-assign destinations only (excludes section-pool sentinel). */
export function listPointPhotoDestinations(
  structure: GalleryTemplateStructure | null | undefined,
  repeatableCounts: Record<string, number> = {},
  cipCounts?: CipCountMap,
): PhotoDestination[] {
  return listPhotoDestinations(structure, repeatableCounts, cipCounts).filter(
    (d) => !isSectionGalleryFieldKey(d.fieldKey),
  );
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
