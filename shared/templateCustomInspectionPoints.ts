/**
 * Template-level Custom Inspection Points (CIPs).
 * Defined in template structureJson.customInspectionPoints; each content section
 * opts in via section.customInspectionPointIds, then expands per section instance
 * ("How many {Door}?" → N field blocks).
 */

import type { BooleanOptionColors, FieldOption } from "./fieldOptionColors";

export type TemplateFieldLike = {
  id?: string;
  key?: string;
  label?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  options?: FieldOption[];
  /** Palette ids for Yes/No (`boolean`) fields. */
  booleanColors?: BooleanOptionColors;
  validation?: unknown;
  depends_on?: string;
  includeCondition?: boolean;
  includeCleanliness?: boolean;
  /** When true, field appears on landlord PDF. Default false (internal only). */
  visibleToLandlord?: boolean;
  [key: string]: unknown;
};

export type CustomInspectionPoint = {
  id: string;
  label: string;
  /** When true (default), capture asks "How many {name}?". When false, always one instance. */
  repeatable?: boolean;
  fields: TemplateFieldLike[];
};

export type TemplateSectionWithCips = {
  id?: string;
  title?: string;
  fields?: TemplateFieldLike[];
  repeatable?: boolean;
  /** Allow-list of CIP ids enabled for this section. Missing / [] = none (opt-in). */
  customInspectionPointIds?: string[];
  [key: string]: unknown;
};

export type TemplateStructureWithCips = {
  sections?: TemplateSectionWithCips[];
  customInspectionPoints?: CustomInspectionPoint[];
  [key: string]: unknown;
};

export class TemplateCipValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateCipValidationError";
  }
}

export function isMetaSection(section: { id?: string; title?: string } | null | undefined): boolean {
  if (!section) return false;
  const id = String(section.id || "").toLowerCase();
  const title = String(section.title || "").toLowerCase().trim();
  if (
    id.includes("general_info") ||
    id.includes("general-info") ||
    id.includes("signoff") ||
    id.includes("sign_off")
  ) {
    return true;
  }
  if (title === "general information" || title === "sign-off" || title === "sign off") {
    return true;
  }
  return false;
}

export function normalizeCipLabel(name: unknown): string {
  if (typeof name !== "string") {
    throw new TemplateCipValidationError("Custom inspection point name is required");
  }
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    throw new TemplateCipValidationError("Custom inspection point name cannot be empty");
  }
  if (trimmed.length > 200) {
    throw new TemplateCipValidationError("Custom inspection point name must be 200 characters or fewer");
  }
  return trimmed;
}

function generateCipId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `cip_${crypto.randomUUID()}`;
  }
  return `cip_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateFieldId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `field_${crypto.randomUUID()}`;
  }
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeCustomInspectionPoints(raw: unknown): CustomInspectionPoint[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new TemplateCipValidationError("customInspectionPoints must be an array");
  }
  const out: CustomInspectionPoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const label = normalizeCipLabel((item as any).label);
    const id =
      typeof (item as any).id === "string" && (item as any).id.trim()
        ? String((item as any).id).trim()
        : generateCipId();
    const fieldsRaw = Array.isArray((item as any).fields) ? (item as any).fields : [];
    const fields: TemplateFieldLike[] = fieldsRaw.map((f: any) => {
      const fid =
        typeof f?.id === "string" && f.id.trim()
          ? f.id.trim()
          : typeof f?.key === "string" && f.key.trim()
            ? f.key.trim()
            : generateFieldId();
      return {
        ...f,
        id: fid,
        key: typeof f?.key === "string" && f.key.trim() ? f.key.trim() : fid,
        label: typeof f?.label === "string" ? f.label : "New Field",
        type: typeof f?.type === "string" ? f.type : "short_text",
      };
    });
    const repeatable = (item as any).repeatable !== false;
    out.push({ id, label, fields, repeatable });
  }
  return out;
}

/** CIPs are repeatable by default (How many?). Explicit `false` disables the count question. */
export function isCipRepeatable(cip: { repeatable?: boolean } | null | undefined): boolean {
  return cip?.repeatable !== false;
}

/**
 * Effective instance count for a CIP under a section instance.
 * Non-repeatable CIPs always resolve to 1 (no stored count needed).
 */
export function resolveCipInstanceCount(
  cip: CustomInspectionPoint,
  valueJson: unknown,
): number {
  if (!isCipRepeatable(cip)) return 1;
  return parseCipCountValue(valueJson);
}

export function cipCountFieldKey(cipId: string): string {
  return `__cip_count_${cipId}`;
}

export function isCipCountFieldKey(fieldKey: string | null | undefined): boolean {
  return typeof fieldKey === "string" && fieldKey.startsWith("__cip_count_");
}

export function parseCipCountValue(valueJson: unknown): number {
  if (valueJson == null) return 0;
  if (typeof valueJson === "number" && Number.isFinite(valueJson)) {
    return Math.max(0, Math.min(50, Math.floor(valueJson)));
  }
  if (typeof valueJson === "object" && valueJson !== null && "value" in (valueJson as object)) {
    const n = Number((valueJson as any).value);
    if (Number.isFinite(n)) return Math.max(0, Math.min(50, Math.floor(n)));
  }
  const n = Number(valueJson);
  if (Number.isFinite(n)) return Math.max(0, Math.min(50, Math.floor(n)));
  return 0;
}

/** Expanded field key: `{cipId}__i{n}__{fieldId}` */
export function cipExpandedFieldKey(cipId: string, instanceIndex: number, fieldId: string): string {
  return `${cipId}__i${instanceIndex}__${fieldId}`;
}

export function parseCipExpandedFieldKey(
  fieldKey: string,
): { cipId: string; instanceIndex: number; fieldId: string } | null {
  const marker = "__i";
  const idx = String(fieldKey || "").indexOf(marker);
  if (idx <= 0) return null;
  const cipId = fieldKey.slice(0, idx);
  if (!cipId.startsWith("cip_")) return null;
  const after = fieldKey.slice(idx + marker.length);
  const sep = after.indexOf("__");
  if (sep <= 0) return null;
  const instanceIndex = parseInt(after.slice(0, sep), 10);
  const fieldId = after.slice(sep + 2);
  if (!Number.isFinite(instanceIndex) || instanceIndex < 1 || !fieldId) return null;
  return { cipId, instanceIndex, fieldId };
}

export function cipInstanceLabel(cipLabel: string, instanceIndex: number): string {
  return `${cipLabel} ${instanceIndex}`;
}

export type ExpandedCipField = TemplateFieldLike & {
  id: string;
  key: string;
  label: string;
  cipId: string;
  cipLabel: string;
  cipInstanceIndex: number;
};

export function expandCipFieldsForCount(
  cip: CustomInspectionPoint,
  count: number,
): ExpandedCipField[] {
  const n = Math.max(0, Math.min(50, Math.floor(count)));
  const out: ExpandedCipField[] = [];
  for (let i = 1; i <= n; i++) {
    for (const field of cip.fields || []) {
      const baseId = String(field.id || field.key || "").trim();
      if (!baseId) continue;
      const id = cipExpandedFieldKey(cip.id, i, baseId);
      out.push({
        ...field,
        id,
        key: id,
        label: `${cipInstanceLabel(cip.label, i)} — ${field.label || baseId}`,
        cipId: cip.id,
        cipLabel: cip.label,
        cipInstanceIndex: i,
      });
    }
  }
  return out;
}

export function getCustomInspectionPointsFromStructure(
  structure: TemplateStructureWithCips | null | undefined,
): CustomInspectionPoint[] {
  if (!structure) return [];
  try {
    return normalizeCustomInspectionPoints(structure.customInspectionPoints);
  } catch {
    return [];
  }
}

/** Normalize a section's CIP allow-list; drops non-strings and unknown ids. */
export function normalizeSectionCustomInspectionPointIds(
  raw: unknown,
  validCipIds: Iterable<string>,
): string[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set(
    Array.from(validCipIds, (id) => String(id || "").trim()).filter(Boolean),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || !valid.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * CIPs enabled for a section (opt-in). Meta sections always get none.
 * Missing / empty customInspectionPointIds → [].
 */
export function getCipsForSection(
  structure: TemplateStructureWithCips | null | undefined,
  section: TemplateSectionWithCips | null | undefined,
): CustomInspectionPoint[] {
  if (!structure || !section || isMetaSection(section)) return [];
  const pool = getCustomInspectionPointsFromStructure(structure);
  if (!pool.length) return [];
  const enabled = normalizeSectionCustomInspectionPointIds(
    section.customInspectionPointIds,
    pool.map((c) => c.id),
  );
  if (!enabled.length) return [];
  const byId = new Map(pool.map((c) => [c.id, c]));
  return enabled.map((id) => byId.get(id)!).filter(Boolean);
}

/** Drop unknown CIP ids from every section's allow-list (call on template save). */
export function sanitizeStructureSectionCipIds(
  structure: TemplateStructureWithCips,
): TemplateStructureWithCips {
  const pool = getCustomInspectionPointsFromStructure(structure);
  const validIds = pool.map((c) => c.id);
  const sections = (structure.sections || []).map((section) => ({
    ...section,
    customInspectionPointIds: normalizeSectionCustomInspectionPointIds(
      section.customInspectionPointIds,
      validIds,
    ),
  }));
  return {
    ...structure,
    sections,
    customInspectionPoints: pool,
  };
}

/** Resolve a display label for an entry fieldKey from snapshot (sections + CIP expansions). */
export function resolveFieldLabelFromTemplateStructure(
  structure: TemplateStructureWithCips | null | undefined,
  fieldKey: string,
): string | null {
  if (!structure || !fieldKey) return null;
  if (isCipCountFieldKey(fieldKey)) {
    const cipId = fieldKey.replace("__cip_count_", "");
    const cip = getCustomInspectionPointsFromStructure(structure).find((c) => c.id === cipId);
    return cip ? `How many ${cip.label}?` : null;
  }
  const parsed = parseCipExpandedFieldKey(fieldKey);
  if (parsed) {
    const cip = getCustomInspectionPointsFromStructure(structure).find((c) => c.id === parsed.cipId);
    if (cip) {
      const sub = (cip.fields || []).find(
        (f) => String(f.id || f.key || "") === parsed.fieldId,
      );
      const subLabel = sub?.label || parsed.fieldId;
      return `${cipInstanceLabel(cip.label, parsed.instanceIndex)} — ${subLabel}`;
    }
  }
  for (const section of structure.sections || []) {
    for (const field of section.fields || []) {
      const id = String(field.id || field.key || "");
      if (id === fieldKey) {
        return typeof field.label === "string" ? field.label : null;
      }
    }
  }
  return null;
}
