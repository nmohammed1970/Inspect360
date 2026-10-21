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
  if ("value" in obj) {
    return hasMeaningfulValueJson(obj.value);
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

export type InspectionProgress = {
  totalFields: number;
  completedFields: number;
  progress: number;
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

  const bump = (sectionRef: string, fieldKey: string) => {
    total += 1;
    const entry = entriesMap[entryLookupKey(sectionRef, fieldKey)];
    if (isInspectionEntryComplete(entry ?? { sectionRef, fieldKey })) {
      completed += 1;
    }
  };

  for (const section of sections) {
    if (!section?.id) continue;
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
        bump(sectionRef, fieldKey);
      }

      for (const cip of cips) {
        if (isCipRepeatable(cip)) {
          bump(sectionRef, cipCountFieldKey(cip.id));
        }
        const count = resolveCipInstanceCount(
          cip,
          entriesMap[entryLookupKey(sectionRef, cipCountFieldKey(cip.id))]?.valueJson,
        );
        for (const expanded of expandCipFieldsForCount(cip, count)) {
          if (shouldSkipField(expanded, excludeTenantSignatures)) continue;
          bump(sectionRef, expanded.id);
        }
      }
    }
  }

  const progress = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
  return {
    totalFields: total,
    completedFields: Math.min(completed, total),
    progress,
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
