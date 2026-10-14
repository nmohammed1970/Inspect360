/**
 * Per-inspection custom inspection points (including one-level sub-points).
 * Mutates an inspection's templateSnapshotJson only (not org templates).
 *
 * Kinds:
 * - photo_condition → photo_array + condition/cleanliness (Door Condition style)
 * - choice → select with inspector-defined options (Meter Readings style)
 */

export type CustomPointKind = "photo_condition" | "choice";

export interface CustomPointFieldBase {
  id: string;
  key: string;
  label: string;
  required: false;
  custom: true;
  addedAt: string;
  clientRequestId?: string;
  /** When set, this point is nested under another custom point in the same section. */
  parentFieldId?: string;
  /**
   * For repeatable rooms (Bedroom 1, Kitchen 2, …): full sectionRef this point
   * belongs to (e.g. `section_bedrooms/room-uuid` or `section_bedrooms/Bedroom 1`).
   * When set, the point is shown only on that instance — not on every bedroom.
   */
  instanceSectionRef?: string;
}

export interface CustomPhotoConditionPointField extends CustomPointFieldBase {
  type: "photo_array";
  includeCondition: true;
  includeCleanliness: true;
}

export interface CustomChoicePointField extends CustomPointFieldBase {
  type: "select";
  options: string[];
  placeholder?: string;
}

export type CustomPointField = CustomPhotoConditionPointField | CustomChoicePointField;

export interface SnapshotSectionLike {
  id: string;
  title?: string;
  fields?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface TemplateSnapshotLike {
  sections?: SnapshotSectionLike[];
  [key: string]: unknown;
}

export class CustomPointValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomPointValidationError";
  }
}

export function normalizeCustomPointLabel(name: unknown): string {
  if (typeof name !== "string") {
    throw new CustomPointValidationError("Inspection point name is required");
  }
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    throw new CustomPointValidationError("Inspection point name cannot be empty");
  }
  if (trimmed.length > 200) {
    throw new CustomPointValidationError("Inspection point name must be 200 characters or fewer");
  }
  return trimmed;
}

export function normalizeCustomPointKind(kind: unknown): CustomPointKind {
  if (kind === undefined || kind === null || kind === "") {
    return "photo_condition";
  }
  if (kind === "photo_condition" || kind === "photo_array" || kind === "photo") {
    return "photo_condition";
  }
  if (kind === "choice" || kind === "select") {
    return "choice";
  }
  throw new CustomPointValidationError(
    "Inspection point type must be photo & condition or choice list",
  );
}

/** Normalize choice-list options: trim, drop empties, dedupe (case-insensitive). */
export function normalizeCustomPointOptions(options: unknown): string[] {
  if (!Array.isArray(options)) {
    throw new CustomPointValidationError("Choice list requires at least one option");
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of options) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    if (trimmed.length > 100) {
      throw new CustomPointValidationError("Each option must be 100 characters or fewer");
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }
  if (normalized.length < 1) {
    throw new CustomPointValidationError("Add at least one option for the choice list");
  }
  if (normalized.length > 50) {
    throw new CustomPointValidationError("Choice lists support up to 50 options");
  }
  return normalized;
}

export function isSignOffSection(section: {
  id?: string;
  title?: string;
  fields?: Array<{ type?: string }>;
}): boolean {
  const id = (section.id || "").toLowerCase();
  const title = (section.title || "").toLowerCase().replace(/[\s_-]+/g, "");
  if (id.includes("signoff") || id.includes("sign_off") || title === "signoff" || title.includes("signoff")) {
    return true;
  }
  const fields = section.fields || [];
  if (fields.length === 0) return false;
  return fields.every((f) => f.type === "signature");
}

export function isGeneralInfoSection(section: {
  id?: string;
  title?: string;
}): boolean {
  const id = (section.id || "").toLowerCase().replace(/[\s_-]+/g, "");
  const title = (section.title || "").toLowerCase().replace(/[\s_-]+/g, "");
  return (
    id.includes("generalinfo") ||
    id.includes("generalinformation") ||
    title === "generalinformation" ||
    title === "generalinfo" ||
    title === "generaloverview" ||
    (title.includes("general") && (title.includes("info") || title.includes("overview")))
  );
}

export function isCustomPointField(field: {
  custom?: unknown;
  id?: string;
  key?: string;
} | null | undefined): boolean {
  if (!field) return false;
  if (field.custom === true) return true;
  const id = typeof field.id === "string" ? field.id : "";
  const key = typeof field.key === "string" ? field.key : "";
  return id.startsWith("field_custom_") || key.startsWith("field_custom_");
}

export function getFieldId(field: { id?: unknown; key?: unknown } | null | undefined): string {
  if (!field) return "";
  if (typeof field.id === "string" && field.id) return field.id;
  if (typeof field.key === "string" && field.key) return field.key;
  return "";
}

export function getParentFieldId(field: { parentFieldId?: unknown } | null | undefined): string | null {
  if (!field || typeof field.parentFieldId !== "string") return null;
  const id = field.parentFieldId.trim();
  return id || null;
}

export function getInstanceSectionRef(
  field: { instanceSectionRef?: unknown } | null | undefined,
): string | null {
  if (!field || typeof field.instanceSectionRef !== "string") return null;
  const ref = field.instanceSectionRef.trim();
  return ref || null;
}

/**
 * Whether a field should render for a repeatable instance.
 * Template (non-custom) fields always show. Custom points with
 * `instanceSectionRef` only show on that instance.
 * Legacy unscoped custom points: if entries exist for specific instances,
 * only show on those; otherwise show on every instance.
 */
export function fieldVisibleForInstance(
  field: {
    custom?: unknown;
    instanceSectionRef?: unknown;
    parentFieldId?: unknown;
    id?: unknown;
    key?: unknown;
  } | null | undefined,
  instanceSectionRef: string,
  allFields?: Array<{
    id?: unknown;
    key?: unknown;
    instanceSectionRef?: unknown;
    parentFieldId?: unknown;
    custom?: unknown;
  }> | null,
  entrySectionRefsForField?: string[] | null,
): boolean {
  if (!field) return false;
  if (!isCustomPointField(field as any)) return true;

  const ownScope = getInstanceSectionRef(field);
  if (ownScope) return ownScope === instanceSectionRef;

  const parentId = getParentFieldId(field);
  if (parentId && allFields?.length) {
    const parent = allFields.find((f) => getFieldId(f) === parentId);
    const parentScope = getInstanceSectionRef(parent as any);
    if (parentScope) return parentScope === instanceSectionRef;
  }

  const refs = (entrySectionRefsForField || [])
    .map((r) => String(r || "").trim())
    .filter(Boolean);
  if (refs.length > 0) {
    return refs.includes(instanceSectionRef);
  }

  // Legacy unscoped with no entries yet — keep visible everywhere
  return true;
}

/** Top-level fields only (excludes nested sub-points). */
export function getTopLevelFields<T extends { parentFieldId?: unknown }>(
  fields: T[] | null | undefined,
): T[] {
  return (fields || []).filter((f) => !getParentFieldId(f));
}

/** Direct children of a custom parent point. */
export function getChildFields<T extends { parentFieldId?: unknown; id?: unknown; key?: unknown }>(
  fields: T[] | null | undefined,
  parentFieldId: string,
): T[] {
  if (!parentFieldId) return [];
  return (fields || []).filter((f) => getParentFieldId(f) === parentFieldId);
}

export function canAddCustomPointsToSection(section: {
  id?: string;
  title?: string;
  fields?: Array<{ type?: string }>;
}): boolean {
  return !isSignOffSection(section) && !isGeneralInfoSection(section);
}

function generateCustomFieldId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `field_custom_${crypto.randomUUID()}`;
  }
  return `field_custom_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildCustomPointField(opts: {
  label: string;
  kind?: CustomPointKind | string;
  options?: unknown;
  fieldId?: string;
  clientRequestId?: string;
  addedAt?: string;
  parentFieldId?: string;
  instanceSectionRef?: string;
}): CustomPointField {
  const label = normalizeCustomPointLabel(opts.label);
  const id = opts.fieldId || generateCustomFieldId();
  const kind = normalizeCustomPointKind(opts.kind);
  const instanceSectionRef =
    typeof opts.instanceSectionRef === "string" ? opts.instanceSectionRef.trim() : "";
  const base = {
    id,
    key: id,
    label,
    required: false as const,
    custom: true as const,
    addedAt: opts.addedAt || new Date().toISOString(),
    ...(opts.clientRequestId ? { clientRequestId: opts.clientRequestId } : {}),
    ...(opts.parentFieldId ? { parentFieldId: opts.parentFieldId } : {}),
    ...(instanceSectionRef ? { instanceSectionRef } : {}),
  };

  if (kind === "choice") {
    return {
      ...base,
      type: "select",
      options: normalizeCustomPointOptions(opts.options),
      placeholder: "Select an option",
    };
  }

  return {
    ...base,
    type: "photo_array",
    includeCondition: true,
    includeCleanliness: true,
  };
}

function walkSectionFields(
  snapshot: TemplateSnapshotLike | null | undefined,
  visitor: (field: Record<string, unknown>, section: SnapshotSectionLike) => void | boolean,
): void {
  if (!snapshot?.sections) return;
  for (const section of snapshot.sections) {
    for (const field of section.fields || []) {
      if (visitor(field, section) === false) return;
    }
  }
}

export function resolveFieldLabelFromSnapshot(
  snapshot: TemplateSnapshotLike | null | undefined,
  fieldKey: string,
): string | null {
  if (!snapshot?.sections || !fieldKey) return null;
  let found: string | null = null;
  walkSectionFields(snapshot, (field) => {
    const id = typeof field.id === "string" ? field.id : undefined;
    const key = typeof field.key === "string" ? field.key : undefined;
    if (id === fieldKey || key === fieldKey) {
      const label = typeof field.label === "string" ? field.label.trim() : "";
      const parentId = getParentFieldId(field);
      if (parentId) {
        let parentLabel = "";
        walkSectionFields(snapshot, (pf) => {
          if (getFieldId(pf) === parentId) {
            parentLabel = typeof pf.label === "string" ? pf.label.trim() : "";
            return false;
          }
        });
        found = parentLabel ? `${parentLabel} › ${label || fieldKey}` : label || null;
      } else {
        found = label || null;
      }
      return false;
    }
  });
  return found;
}

export function appendCustomPointToSnapshot(
  snapshot: TemplateSnapshotLike | null | undefined,
  opts: {
    sectionId: string;
    label: string;
    kind?: CustomPointKind | string;
    options?: unknown;
    fieldId?: string;
    clientRequestId?: string;
    parentFieldId?: string;
    /** Full sectionRef for a repeatable room instance (Bedroom 1, etc.). */
    instanceSectionRef?: string;
  },
): { snapshot: TemplateSnapshotLike; field: CustomPointField; created: boolean } {
  if (!snapshot || !Array.isArray(snapshot.sections)) {
    throw new CustomPointValidationError("Inspection template snapshot is missing or invalid");
  }
  if (!opts.sectionId || typeof opts.sectionId !== "string") {
    throw new CustomPointValidationError("Section is required");
  }

  const sectionIndex = snapshot.sections.findIndex((s) => s.id === opts.sectionId);
  if (sectionIndex < 0) {
    throw new CustomPointValidationError("Section not found on this inspection");
  }

  const section = snapshot.sections[sectionIndex];
  if (isSignOffSection(section as any)) {
    throw new CustomPointValidationError("Custom inspection points cannot be added to Sign-Off");
  }
  if (isGeneralInfoSection(section as any)) {
    throw new CustomPointValidationError(
      "Custom inspection points cannot be added to General Information",
    );
  }

  const existingFields = Array.isArray(section.fields) ? [...section.fields] : [];
  const parentFieldId = opts.parentFieldId?.trim() || undefined;
  let instanceSectionRef =
    typeof opts.instanceSectionRef === "string" ? opts.instanceSectionRef.trim() : "";

  if (parentFieldId) {
    const parent = existingFields.find((f) => getFieldId(f) === parentFieldId);
    if (!parent || !isCustomPointField(parent as any)) {
      throw new CustomPointValidationError("Parent inspection point not found");
    }
    if (getParentFieldId(parent as any)) {
      throw new CustomPointValidationError(
        "Sub-points can only be added under a top-level custom inspection point",
      );
    }
    // Sub-points inherit the parent's room instance scope
    const parentScope = getInstanceSectionRef(parent as any);
    if (parentScope) {
      instanceSectionRef = parentScope;
    }
  }

  if (instanceSectionRef) {
    const baseSectionId = instanceSectionRef.split("/")[0] || "";
    if (baseSectionId && baseSectionId !== opts.sectionId) {
      throw new CustomPointValidationError(
        "Room instance does not belong to this section",
      );
    }
  }

  if (opts.clientRequestId) {
    const existing = existingFields.find(
      (f) => typeof f.clientRequestId === "string" && f.clientRequestId === opts.clientRequestId,
    );
    if (existing && typeof existing.id === "string") {
      return {
        snapshot,
        field: existing as unknown as CustomPointField,
        created: false,
      };
    }
  }

  const field = buildCustomPointField({
    label: opts.label,
    kind: opts.kind,
    options: opts.options,
    fieldId: opts.fieldId,
    clientRequestId: opts.clientRequestId,
    parentFieldId,
    instanceSectionRef: instanceSectionRef || undefined,
  });

  let nextFields: Array<Record<string, unknown>>;
  if (parentFieldId) {
    // Insert after the last existing child of this parent (or right after the parent).
    const parentIndex = existingFields.findIndex((f) => getFieldId(f) === parentFieldId);
    let insertAt = parentIndex + 1;
    while (
      insertAt < existingFields.length &&
      getParentFieldId(existingFields[insertAt] as any) === parentFieldId
    ) {
      insertAt += 1;
    }
    nextFields = [
      ...existingFields.slice(0, insertAt),
      field,
      ...existingFields.slice(insertAt),
    ];
  } else {
    nextFields = [...existingFields, field];
  }

  const nextSections = snapshot.sections.map((s, i) => {
    if (i !== sectionIndex) return s;
    return {
      ...s,
      fields: nextFields,
    };
  });

  return {
    snapshot: {
      ...snapshot,
      sections: nextSections,
    },
    field,
    created: true,
  };
}

export function removeCustomPointFromSnapshot(
  snapshot: TemplateSnapshotLike | null | undefined,
  opts: { sectionId: string; fieldId: string },
): { snapshot: TemplateSnapshotLike; fieldId: string; removedFieldIds: string[]; removed: boolean } {
  if (!snapshot || !Array.isArray(snapshot.sections)) {
    throw new CustomPointValidationError("Inspection template snapshot is missing or invalid");
  }
  if (!opts.sectionId || typeof opts.sectionId !== "string") {
    throw new CustomPointValidationError("Section is required");
  }
  if (!opts.fieldId || typeof opts.fieldId !== "string") {
    throw new CustomPointValidationError("Inspection point is required");
  }

  const sectionIndex = snapshot.sections.findIndex((s) => s.id === opts.sectionId);
  if (sectionIndex < 0) {
    throw new CustomPointValidationError("Section not found on this inspection");
  }

  const section = snapshot.sections[sectionIndex];
  const existingFields = Array.isArray(section.fields) ? section.fields : [];
  const field = existingFields.find((f) => {
    const id = getFieldId(f);
    return id === opts.fieldId;
  });

  if (!field) {
    return { snapshot, fieldId: opts.fieldId, removedFieldIds: [], removed: false };
  }

  if (!isCustomPointField(field as any)) {
    throw new CustomPointValidationError("Only custom inspection points can be removed");
  }

  // Cascade: remove the point and any direct children
  const removedFieldIds = existingFields
    .filter((f) => {
      const id = getFieldId(f);
      return id === opts.fieldId || getParentFieldId(f as any) === opts.fieldId;
    })
    .map((f) => getFieldId(f))
    .filter(Boolean);

  const removeSet = new Set(removedFieldIds);
  const nextFields = existingFields.filter((f) => !removeSet.has(getFieldId(f)));

  const nextSections = snapshot.sections.map((s, i) => {
    if (i !== sectionIndex) return s;
    return {
      ...s,
      fields: nextFields,
    };
  });

  return {
    snapshot: {
      ...snapshot,
      sections: nextSections,
    },
    fieldId: opts.fieldId,
    removedFieldIds,
    removed: true,
  };
}
