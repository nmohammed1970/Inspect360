/**
 * Inspection capture progress: total and completed must use the same field set
 * the UI renders (section instances × template fields + CIP counts/expansions).
 *
 * Do not count raw Object.values(entries) — that includes orphans, stale
 * sectionRefs, and __repeatable_count_* metadata, which can push completed
 * above total (e.g. 176/169 → 104%).
 */

import { isTenantSignatureField } from "./signature";
import {
  listRepeatableInstances,
  sectionShouldExpandAsInstances,
  type GalleryTemplateStructure,
} from "./inspectionGallery";
import { numberedRoomInstanceTitle } from "./propertyRooms";
import {
  cipCountFieldKey,
  expandCipFieldsForCount,
  getCipsForSection,
  isCipCountFieldKey,
  isCipRepeatable,
  resolveCipInstanceCount,
  type CustomInspectionPoint,
  type TemplateStructureWithCips,
} from "./templateCustomInspectionPoints";

export type ProgressFieldLike = {
  id?: string;
  key?: string;
  type?: string;
  label?: string;
  required?: boolean;
};

export type ProgressSectionLike = {
  id: string;
  title: string;
  repeatable?: boolean;
  fields?: ProgressFieldLike[];
  customInspectionPointIds?: string[];
};

export type ProgressEntryLike = {
  id?: string;
  sectionRef?: string;
  fieldKey?: string;
  valueJson?: unknown;
  note?: string | null;
  photos?: string[] | null;
  updatedAt?: string | Date | null;
  createdAt?: string | Date | null;
};

export type ProgressRoomInstance = {
  sectionRef: string;
  title?: string;
};

export function isRepeatableCountFieldKey(fieldKey: string | null | undefined): boolean {
  return typeof fieldKey === "string" && fieldKey.startsWith("__repeatable_count_");
}

/** Meta keys that must never contribute to capture progress. */
export function isProgressMetaFieldKey(fieldKey: string | null | undefined): boolean {
  return isRepeatableCountFieldKey(fieldKey);
}

function resolveFieldId(field: ProgressFieldLike): string | null {
  const id = String(field.id || field.key || "").trim();
  return id || null;
}

/**
 * Whether an entry counts as filled for progress.
 * Photos or a meaningful valueJson count; empty strings / empty objects do not.
 * Notes alone do not mark a field complete.
 */
export function isInspectionEntryComplete(
  entry: ProgressEntryLike | null | undefined,
): boolean {
  if (!entry) return false;
  if (isProgressMetaFieldKey(entry.fieldKey)) return false;

  const photos = entry.photos;
  if (Array.isArray(photos) && photos.some((p) => typeof p === "string" && p.trim())) {
    return true;
  }

  return hasMeaningfulValueJson(entry.valueJson);
}

function hasMeaningfulValueJson(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean" || typeof value === "number") return true;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value !== "object") return true;

  const obj = value as Record<string, unknown>;
  if (typeof obj.audioUrl === "string" && obj.audioUrl.trim()) return true;
  if (Array.isArray(obj.audioUrls) && obj.audioUrls.some((u) => typeof u === "string" && u.trim())) {
    return true;
  }

  // Condition/cleanliness shells from FieldWidget: `{ value, condition?, cleanliness? }`
  // Empty shells must not count as filled (keys alone are not enough).
  const hasConditionShell =
    "value" in obj || "condition" in obj || "cleanliness" in obj;
  if (hasConditionShell) {
    if (hasMeaningfulValueJson(obj.value)) return true;
    if (typeof obj.condition === "string" && obj.condition.trim()) return true;
    if (typeof obj.cleanliness === "string" && obj.cleanliness.trim()) return true;
    return false;
  }

  // Signature / rich objects: any non-empty own key counts
  return Object.keys(obj).length > 0;
}

export function entryLookupKey(sectionRef: string, fieldKey: string): string {
  return `${sectionRef}-${fieldKey}`;
}

/** Dedupe section refs while preserving order (primary first). */
export function uniqueSectionRefs(
  ...groups: Array<string | null | undefined | Array<string | null | undefined>>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    const list = Array.isArray(g) ? g : [g];
    for (const raw of list) {
      const ref = String(raw || "").trim();
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      out.push(ref);
    }
  }
  return out;
}

function unionPhotoUrls(
  ...lists: Array<string[] | null | undefined>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      if (typeof raw !== "string") continue;
      const p = raw.trim();
      if (!p || seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

function hasMeaningfulEntryValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return false;
}

function entryTimestampMs(entry: ProgressEntryLike | null | undefined): number {
  if (!entry) return 0;
  const raw = entry.updatedAt || entry.createdAt;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Scalar text used for prefix/completeness comparisons across duplicate rows. */
export function extractEntryScalarText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && !Array.isArray(value) && "value" in (value as object)) {
    return extractEntryScalarText((value as { value?: unknown }).value);
  }
  return null;
}

/**
 * Prefer the more complete text when one value is a stale keystroke prefix of the other
 * (e.g. "P" vs "Property is in fair condition"). Returns null when incomparable.
 */
export function preferMoreCompleteValue(a: unknown, b: unknown): unknown | null {
  const sa = extractEntryScalarText(a);
  const sb = extractEntryScalarText(b);
  if (sa == null || sb == null) return null;
  const ta = sa.trim();
  const tb = sb.trim();
  if (!ta && tb) return b;
  if (!tb && ta) return a;
  if (ta === tb) return null;
  if (tb.startsWith(ta) && ta.length < tb.length) return b;
  if (ta.startsWith(tb) && tb.length < ta.length) return a;
  return null;
}

/**
 * Pick the better of two rows for the same logical field.
 * Completeness beats a newer stale keystroke; otherwise prefer latest updatedAt.
 */
export function preferInspectionEntry<T extends ProgressEntryLike>(a: T, b: T): T {
  const complete = preferMoreCompleteValue(a.valueJson, b.valueJson);
  if (complete !== null) {
    if (complete === a.valueJson) return a;
    if (complete === b.valueJson) return b;
  }

  const aNote = typeof a.note === "string" ? a.note.trim() : "";
  const bNote = typeof b.note === "string" ? b.note.trim() : "";
  if (aNote && bNote && aNote !== bNote) {
    if (bNote.startsWith(aNote) && aNote.length < bNote.length) return b;
    if (aNote.startsWith(bNote) && bNote.length < aNote.length) return a;
  } else if (!aNote && bNote) {
    // keep going — notes alone don't decide when values differ by timestamp
  }

  const aPhotos = Array.isArray(a.photos) ? a.photos.length : 0;
  const bPhotos = Array.isArray(b.photos) ? b.photos.length : 0;

  const aMs = entryTimestampMs(a);
  const bMs = entryTimestampMs(b);
  if (bMs !== aMs) return bMs > aMs ? b : a;

  if (bPhotos !== aPhotos) return bPhotos > aPhotos ? b : a;
  if (bNote.length !== aNote.length) return bNote.length > aNote.length ? b : a;

  const aText = extractEntryScalarText(a.valueJson) || "";
  const bText = extractEntryScalarText(b.valueJson) || "";
  if (bText.length !== aText.length) return bText.length > aText.length ? b : a;

  return b;
}

/**
 * Collapse duplicate sectionRef+fieldKey rows (offline sync can create them).
 * Keeps the most complete / newest value so PDF/report don't show stale "P".
 */
export function dedupeInspectionEntries<T extends ProgressEntryLike>(
  entries: T[] | null | undefined,
): T[] {
  if (!entries?.length) return [];
  const map = new Map<string, T>();
  for (const entry of entries) {
    const sectionRef = String(entry.sectionRef || "").trim();
    const fieldKey = String(entry.fieldKey || "").trim();
    if (!sectionRef || !fieldKey) continue;
    const key = entryLookupKey(sectionRef, fieldKey);
    const existing = map.get(key);
    map.set(key, existing ? preferInspectionEntry(existing, entry) : entry);
  }
  return Array.from(map.values());
}

/**
 * Merge UUID / synthetic / Overview alias rows into one logical entry under
 * `primarySectionRef`. Photos are unioned; value/note prefer the most complete
 * (not a stale keystroke prefix) then newest row. Prevents dual-key splits.
 */
export function mergeEntriesAcrossRefs<T extends ProgressEntryLike>(
  entriesMap: Record<string, T | undefined>,
  fieldKey: string,
  primarySectionRef: string,
  aliasRefs: string[] = [],
): T | undefined {
  const key = String(fieldKey || "").trim();
  const primary = String(primarySectionRef || "").trim();
  if (!key || !primary) return undefined;

  const refs = uniqueSectionRefs(primary, aliasRefs);
  const found: T[] = [];
  for (const ref of refs) {
    const entry =
      entriesMap[entryLookupKey(ref, key)] ||
      (entriesMap[`${ref}-${key}`] as T | undefined);
    if (entry) found.push(entry);
  }
  if (!found.length) return undefined;

  const preferred = found.reduce((best, row) => preferInspectionEntry(best, row));
  const primaryRow =
    found.find((e) => String(e.sectionRef || "").trim() === primary) || null;

  let valueJson = preferred.valueJson;
  if (!hasMeaningfulEntryValue(valueJson)) {
    for (const e of found) {
      if (hasMeaningfulEntryValue(e.valueJson)) {
        valueJson = e.valueJson;
        break;
      }
    }
  }

  let note = preferred.note;
  if (!(typeof note === "string" && note.trim())) {
    for (const e of found) {
      if (typeof e.note === "string" && e.note.trim()) {
        note = e.note;
        break;
      }
    }
  }

  const photos = unionPhotoUrls(...found.map((e) => e.photos));
  const markedForReview = found.some((e) => !!(e as { markedForReview?: boolean }).markedForReview);

  return {
    ...preferred,
    id: primaryRow?.id || preferred.id,
    sectionRef: primary,
    fieldKey: key,
    valueJson,
    note: note ?? preferred.note,
    photos: photos.length ? photos : preferred.photos ?? null,
    ...(markedForReview ? { markedForReview: true } : {}),
  } as T;
}

export function normalizeProgressEntriesMap(
  entries: Record<string, ProgressEntryLike> | ProgressEntryLike[] | null | undefined,
): Record<string, ProgressEntryLike> {
  if (!entries) return {};
  if (Array.isArray(entries)) {
    const map: Record<string, ProgressEntryLike> = {};
    for (const entry of dedupeInspectionEntries(entries)) {
      const sectionRef = String(entry.sectionRef || "").trim();
      const fieldKey = String(entry.fieldKey || "").trim();
      if (!sectionRef || !fieldKey || isProgressMetaFieldKey(fieldKey)) continue;
      map[entryLookupKey(sectionRef, fieldKey)] = entry;
    }
    return map;
  }
  const map: Record<string, ProgressEntryLike> = {};
  for (const [key, entry] of Object.entries(entries)) {
    if (!entry) continue;
    const fieldKey = String(entry.fieldKey || "").trim();
    if (isProgressMetaFieldKey(fieldKey)) continue;
    const sectionRef = String(entry.sectionRef || "").trim();
    const lookup = sectionRef && fieldKey ? entryLookupKey(sectionRef, fieldKey) : key;
    const existing = map[lookup];
    map[lookup] = existing ? preferInspectionEntry(existing, entry) : entry;
    if (key !== lookup) map[key] = map[lookup]!;
  }
  return map;
}

/**
 * SectionRef paths for each rendered instance of a section (matches capture UI
 * + gallery: template.repeatable OR forced property-layout room sections).
 */
export function resolveSectionInstanceRefs(
  section: ProgressSectionLike,
  repeatableCounts: Record<string, number>,
  propertyRoomInstances: ProgressRoomInstance[] = [],
  templateStructure?: GalleryTemplateStructure | TemplateStructureWithCips | null,
): string[] {
  const roomInsts = propertyRoomInstances.filter((r) =>
    String(r.sectionRef || "").startsWith(`${section.id}/`),
  );
  const structure = (templateStructure || null) as GalleryTemplateStructure | null;

  const shouldExpand =
    !!section.repeatable ||
    roomInsts.length > 0 ||
    (structure
      ? sectionShouldExpandAsInstances(section as any, structure, repeatableCounts)
      : false);

  if (!shouldExpand) return [section.id];

  // Capture-supplied property rooms win (already scoped to this section).
  if (roomInsts.length > 0) {
    const count = repeatableCounts[section.id] ?? roomInsts.length;
    if (count <= 0) return [];
    const refs: string[] = [];
    for (let i = 0; i < count; i++) {
      refs.push(
        roomInsts[i]?.sectionRef || `${section.id}/${section.title} ${i + 1}`,
      );
    }
    return refs;
  }

  // Fall back to gallery instance enumeration (forced room types + snapshot rooms).
  if (structure) {
    const instances = listRepeatableInstances(
      structure,
      section.id,
      repeatableCounts,
      !section.repeatable,
    );
    if (instances.length > 0) {
      return instances.map((inst) => inst.sectionRef);
    }
  }

  const count = repeatableCounts[section.id] ?? 1;
  if (count <= 0) return [];
  const refs: string[] = [];
  for (let i = 0; i < count; i++) {
    refs.push(`${section.id}/${section.title} ${i + 1}`);
  }
  return refs;
}

function shouldSkipField(
  field: ProgressFieldLike,
  excludeTenantSignatures: boolean,
): boolean {
  if (!excludeTenantSignatures) return false;
  if (field.type !== "signature") return false;
  return isTenantSignatureField(field);
}

export type ComputeInspectionProgressInput = {
  sections: ProgressSectionLike[];
  entries: Record<string, ProgressEntryLike> | ProgressEntryLike[];
  repeatableCounts?: Record<string, number>;
  propertyRoomInstances?: ProgressRoomInstance[];
  /** Full template snapshot (needed for CIP allow-lists). */
  templateStructure?: TemplateStructureWithCips | null;
  /** When true, skip tenant signature fields (hidden in capture UI). */
  excludeTenantSignatures?: boolean;
};

export type SectionProgress = {
  sectionId: string;
  totalFields: number;
  completedFields: number;
  /** Fields still incomplete in this section (for tab badges). */
  remainingFields: number;
};

export type InspectionProgress = {
  totalFields: number;
  completedFields: number;
  progress: number;
  /** Per template section id — same field set as overall progress. */
  bySection: Record<string, SectionProgress>;
};

/**
 * Progress aligned to what capture actually shows.
 * completedFields never exceeds totalFields; progress is capped at 100.
 */
export function computeInspectionCaptureProgress(
  input: ComputeInspectionProgressInput,
): InspectionProgress {
  const sections = Array.isArray(input.sections) ? input.sections : [];
  const repeatableCounts = input.repeatableCounts || {};
  const propertyRoomInstances = input.propertyRoomInstances || [];
  const excludeTenantSignatures = !!input.excludeTenantSignatures;
  const entriesMap = normalizeProgressEntriesMap(input.entries);
  const structure = input.templateStructure ?? null;

  let total = 0;
  let completed = 0;
  const bySection: Record<string, SectionProgress> = {};

  const ensureSection = (sectionId: string) => {
    if (!bySection[sectionId]) {
      bySection[sectionId] = {
        sectionId,
        totalFields: 0,
        completedFields: 0,
        remainingFields: 0,
      };
    }
    return bySection[sectionId]!;
  };

  const bump = (
    sectionId: string,
    sectionRef: string,
    fieldKey: string,
    aliasRefs: string[] = [],
  ) => {
    total += 1;
    const sec = ensureSection(sectionId);
    sec.totalFields += 1;
    const entry =
      lookupEntryAcrossRefs(entriesMap, [sectionRef, ...aliasRefs], fieldKey) ||
      entriesMap[entryLookupKey(sectionRef, fieldKey)];
    if (isInspectionEntryComplete(entry ?? { sectionRef, fieldKey })) {
      completed += 1;
      sec.completedFields += 1;
    }
  };

  for (const section of sections) {
    if (!section?.id) continue;
    ensureSection(section.id);
    const instanceRefs = resolveSectionInstanceRefs(
      section,
      repeatableCounts,
      propertyRoomInstances,
      structure,
    );
    const roomInsts = propertyRoomInstances.filter((r) =>
      String(r.sectionRef || "").startsWith(`${section.id}/`),
    );
    const galleryInstances = structure
      ? listRepeatableInstances(
          structure as GalleryTemplateStructure,
          section.id,
          repeatableCounts,
          !section.repeatable,
        )
      : [];
    const cips: CustomInspectionPoint[] = getCipsForSection(structure, section as any);

    instanceRefs.forEach((sectionRef, instanceIndex) => {
      const galleryInst = galleryInstances.find((g) => g.sectionRef === sectionRef);
      const synthetic = `${section.id}/${section.title} ${instanceIndex + 1}`;
      const roomRef = roomInsts[instanceIndex]?.sectionRef;
      const aliasRefs = uniqueSectionRefs(
        galleryInst?.aliasRefs || [],
        synthetic,
        roomRef,
      ).filter((r) => r !== sectionRef);
      for (const field of section.fields || []) {
        if (shouldSkipField(field, excludeTenantSignatures)) continue;
        const fieldKey = resolveFieldId(field);
        if (!fieldKey) continue;
        bump(section.id, sectionRef, fieldKey, aliasRefs);
      }

      for (const cip of cips) {
        if (isCipRepeatable(cip)) {
          bump(section.id, sectionRef, cipCountFieldKey(cip.id), aliasRefs);
        }
        const count = resolveCipInstanceCount(
          cip,
          lookupEntryAcrossRefs(
            entriesMap,
            [sectionRef, ...aliasRefs],
            cipCountFieldKey(cip.id),
          )?.valueJson,
        );
        for (const expanded of expandCipFieldsForCount(cip, count)) {
          if (shouldSkipField(expanded, excludeTenantSignatures)) continue;
          bump(section.id, sectionRef, expanded.id, aliasRefs);
        }
      }
    });
  }

  for (const sec of Object.values(bySection)) {
    sec.completedFields = Math.min(sec.completedFields, sec.totalFields);
    sec.remainingFields = Math.max(0, sec.totalFields - sec.completedFields);
  }

  const progress = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
  return {
    totalFields: total,
    completedFields: Math.min(completed, total),
    progress,
    bySection,
  };
}

/** Derive repeatable counts from saved __repeatable_count_* rows (e.g. review page). */
export function repeatableCountsFromEntries(
  entries: ProgressEntryLike[] | null | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!Array.isArray(entries)) return counts;
  for (const entry of entries) {
    const fk = entry.fieldKey;
    if (!isRepeatableCountFieldKey(fk)) continue;
    const sectionId = String(fk).replace("__repeatable_count_", "");
    if (!sectionId) continue;
    const raw = entry.valueJson;
    let n = 1;
    if (typeof raw === "number" && Number.isFinite(raw)) n = Math.max(0, Math.floor(raw));
    else if (raw && typeof raw === "object" && "value" in (raw as object)) {
      const v = Number((raw as { value: unknown }).value);
      if (Number.isFinite(v)) n = Math.max(0, Math.floor(v));
    }
    counts[sectionId] = n;
  }
  return counts;
}

export { isCipCountFieldKey };

export type RequiredIncompleteField = {
  sectionId: string;
  sectionRef: string;
  /** Extra refs that may hold the same instance entry (UUID vs Title N). */
  aliasRefs: string[];
  fieldKey: string;
  fieldLabel: string;
  sectionLabel: string;
  /** Stable key for UI highlight maps: `${sectionRef}-${fieldKey}`. */
  entryKey: string;
};

function isFieldRequired(field: ProgressFieldLike): boolean {
  const raw = (field as { required?: unknown }).required;
  if (raw === true || raw === 1) return true;
  if (typeof raw === "string") return raw.trim().toLowerCase() === "true";
  return false;
}

function isMediaRequiredFieldType(type: string | undefined): boolean {
  const t = String(type || "").toLowerCase();
  return t === "photo" || t === "photo_array" || t === "video" || t === "signature";
}

function entryHasMedia(entry: ProgressEntryLike | undefined): boolean {
  if (!entry) return false;
  const photos = entry.photos;
  if (Array.isArray(photos) && photos.some((p) => typeof p === "string" && p.trim())) {
    return true;
  }
  const v = entry.valueJson;
  if (typeof v === "string" && v.trim()) return true;
  if (Array.isArray(v) && v.some((p) => typeof p === "string" && p.trim())) return true;
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (typeof obj.signature === "string" && obj.signature.trim()) return true;
    if (typeof obj.dataUrl === "string" && obj.dataUrl.trim()) return true;
    if (typeof obj.url === "string" && obj.url.trim()) return true;
  }
  return false;
}

/** Required-field completeness: media types need media, not just condition shells. */
function isRequiredEntrySatisfied(
  field: ProgressFieldLike,
  entry: ProgressEntryLike | undefined,
): boolean {
  if (isMediaRequiredFieldType(field.type)) {
    return entryHasMedia(entry);
  }
  return isInspectionEntryComplete(entry ?? null);
}

function lookupEntryAcrossRefs(
  entriesMap: Record<string, ProgressEntryLike>,
  refs: string[],
  fieldKey: string,
): ProgressEntryLike | undefined {
  const list = uniqueSectionRefs(refs);
  if (!list.length) return undefined;
  return mergeEntriesAcrossRefs(entriesMap, fieldKey, list[0]!, list.slice(1));
}

/**
 * Required template fields (incl. CIP expansions) that are still blank.
 * Same instance / CIP expansion rules as capture progress.
 */
export function listRequiredIncompleteFields(
  input: ComputeInspectionProgressInput,
): RequiredIncompleteField[] {
  const sections = Array.isArray(input.sections) ? input.sections : [];
  const repeatableCounts = input.repeatableCounts || {};
  const propertyRoomInstances = input.propertyRoomInstances || [];
  const excludeTenantSignatures = !!input.excludeTenantSignatures;
  const entriesMap = normalizeProgressEntriesMap(input.entries);
  const structure = input.templateStructure ?? null;
  const missing: RequiredIncompleteField[] = [];

  for (const section of sections) {
    if (!section?.id) continue;
    const instanceRefs = resolveSectionInstanceRefs(
      section,
      repeatableCounts,
      propertyRoomInstances,
      structure,
    );
    const roomInsts = propertyRoomInstances.filter((r) =>
      String(r.sectionRef || "").startsWith(`${section.id}/`),
    );
    const galleryInstances = structure
      ? listRepeatableInstances(
          structure as GalleryTemplateStructure,
          section.id,
          repeatableCounts,
          !section.repeatable,
        )
      : [];
    const cips: CustomInspectionPoint[] = getCipsForSection(structure, section as any);

    instanceRefs.forEach((sectionRef, instanceIndex) => {
      const galleryInst = galleryInstances.find((g) => g.sectionRef === sectionRef);
      const synthetic = `${section.id}/${section.title} ${instanceIndex + 1}`;
      const roomRef = roomInsts[instanceIndex]?.sectionRef;
      const aliasRefs = uniqueSectionRefs(
        galleryInst?.aliasRefs || [],
        synthetic,
        roomRef,
      ).filter((r) => r !== sectionRef);
      const lookupRefs = [sectionRef, ...aliasRefs];
      const sectionLabel =
        galleryInst?.sectionLabel ||
        (instanceRefs.length > 1 || section.repeatable
          ? numberedRoomInstanceTitle(
              roomInsts[instanceIndex]?.title,
              section.title,
              instanceIndex,
            )
          : section.title);

      const pushIfMissing = (field: ProgressFieldLike, fieldKey: string, fieldLabel: string) => {
        if (!isFieldRequired(field)) return;
        if (shouldSkipField(field, excludeTenantSignatures)) return;
        const entry = lookupEntryAcrossRefs(entriesMap, lookupRefs, fieldKey);
        if (isRequiredEntrySatisfied(field, entry)) return;
        missing.push({
          sectionId: section.id,
          sectionRef,
          aliasRefs,
          fieldKey,
          fieldLabel: fieldLabel || fieldKey,
          sectionLabel,
          entryKey: entryLookupKey(sectionRef, fieldKey),
        });
      };

      for (const field of section.fields || []) {
        const fieldKey = resolveFieldId(field);
        if (!fieldKey) continue;
        pushIfMissing(field, fieldKey, String(field.label || fieldKey).trim() || fieldKey);
      }

      for (const cip of cips) {
        const count = resolveCipInstanceCount(
          cip,
          lookupEntryAcrossRefs(entriesMap, lookupRefs, cipCountFieldKey(cip.id))?.valueJson,
        );
        for (const expanded of expandCipFieldsForCount(cip, count)) {
          if (shouldSkipField(expanded, excludeTenantSignatures)) continue;
          pushIfMissing(
            expanded,
            expanded.id,
            String(expanded.label || expanded.id).trim() || expanded.id,
          );
        }
      }
    });
  }

  return missing;
}

/** Short toast / alert copy for missing required fields. */
export function formatRequiredIncompleteMessage(
  missing: RequiredIncompleteField[],
): string {
  if (!missing.length) return "";
  if (missing.length === 1) {
    const f = missing[0]!;
    return `Please fill required field: ${f.sectionLabel} → ${f.fieldLabel}`;
  }
  const preview = missing
    .slice(0, 5)
    .map((f) => `${f.sectionLabel} → ${f.fieldLabel}`)
    .join("; ");
  const more = missing.length > 5 ? ` (+${missing.length - 5} more)` : "";
  return `Please fill ${missing.length} required fields: ${preview}${more}`;
}

/** True when any required field is still blank. */
export function hasRequiredIncompleteFields(
  input: ComputeInspectionProgressInput,
): boolean {
  return listRequiredIncompleteFields(input).length > 0;
}
