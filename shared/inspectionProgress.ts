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
  sectionRef?: string;
  fieldKey?: string;
  valueJson?: unknown;
  photos?: string[] | null;
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

export function normalizeProgressEntriesMap(
  entries: Record<string, ProgressEntryLike> | ProgressEntryLike[] | null | undefined,
): Record<string, ProgressEntryLike> {
  if (!entries) return {};
  if (Array.isArray(entries)) {
    const map: Record<string, ProgressEntryLike> = {};
    for (const entry of entries) {
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
    map[key] = entry;
  }
  return map;
}

/**
 * SectionRef paths for each rendered instance of a section (matches capture UI).
 */
export function resolveSectionInstanceRefs(
  section: ProgressSectionLike,
  repeatableCounts: Record<string, number>,
  propertyRoomInstances: ProgressRoomInstance[] = [],
): string[] {
  if (!section.repeatable) return [section.id];

  const count = repeatableCounts[section.id] ?? 1;
  if (count <= 0) return [];

  const roomInsts = propertyRoomInstances.filter((r) =>
    String(r.sectionRef || "").startsWith(`${section.id}/`),
  );

  const refs: string[] = [];
  for (let i = 0; i < count; i++) {
    refs.push(
      roomInsts[i]?.sectionRef || `${section.id}/${section.title} ${i + 1}`,
    );
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

  const bump = (sectionId: string, sectionRef: string, fieldKey: string) => {
    total += 1;
    const sec = ensureSection(sectionId);
    sec.totalFields += 1;
    const entry = entriesMap[entryLookupKey(sectionRef, fieldKey)];
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
    );
    const cips: CustomInspectionPoint[] = getCipsForSection(structure, section as any);

    for (const sectionRef of instanceRefs) {
      for (const field of section.fields || []) {
        if (shouldSkipField(field, excludeTenantSignatures)) continue;
        const fieldKey = resolveFieldId(field);
        if (!fieldKey) continue;
        bump(section.id, sectionRef, fieldKey);
      }

      for (const cip of cips) {
        if (isCipRepeatable(cip)) {
          bump(section.id, sectionRef, cipCountFieldKey(cip.id));
        }
        const count = resolveCipInstanceCount(
          cip,
          entriesMap[entryLookupKey(sectionRef, cipCountFieldKey(cip.id))]?.valueJson,
        );
        for (const expanded of expandCipFieldsForCount(cip, count)) {
          if (shouldSkipField(expanded, excludeTenantSignatures)) continue;
          bump(section.id, sectionRef, expanded.id);
        }
      }
    }
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
  for (const ref of refs) {
    const entry = entriesMap[entryLookupKey(ref, fieldKey)];
    if (entry) return entry;
  }
  return undefined;
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
    );
    const roomInsts = propertyRoomInstances.filter((r) =>
      String(r.sectionRef || "").startsWith(`${section.id}/`),
    );
    const cips: CustomInspectionPoint[] = getCipsForSection(structure, section as any);

    instanceRefs.forEach((sectionRef, instanceIndex) => {
      const synthetic = `${section.id}/${section.title} ${instanceIndex + 1}`;
      const roomRef = roomInsts[instanceIndex]?.sectionRef;
      const aliasRefs = [synthetic, roomRef]
        .map((r) => String(r || "").trim())
        .filter((r) => r && r !== sectionRef);
      const lookupRefs = [sectionRef, ...aliasRefs];
      const sectionLabel = section.repeatable
        ? roomInsts[instanceIndex]?.title ||
          `${section.title} ${instanceIndex + 1}`
        : section.title;

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
