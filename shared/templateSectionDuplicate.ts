/** Deep-clone a template section for the template builder duplicate action. */

export type DuplicatableTemplateField = {
  id: string;
  key: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  validation?: unknown;
  depends_on?: string;
  includeCondition?: boolean;
  includeCleanliness?: boolean;
  [key: string]: unknown;
};

export type DuplicatableTemplateSection = {
  id: string;
  title: string;
  description?: string;
  repeatable?: boolean;
  /** Opt-in CIP allow-list; preserved on duplicate via section spread. */
  customInspectionPointIds?: string[];
  fields: DuplicatableTemplateField[];
  [key: string]: unknown;
};

function newTemplateEntityId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * - new section id
 * - title gets `_COPY` suffix
 * - every field gets new id/key
 * - options/validation cloned; depends_on remapped within the section
 * - repeatable / description / field flags preserved
 */
export function duplicateTemplateSection<T extends DuplicatableTemplateSection>(section: T): T {
  const oldToNewFieldKey = new Map<string, string>();

  const clonedFields = (section.fields || []).map((field, index) => {
    const newId = `${newTemplateEntityId("field")}_${index}`;
    const oldKey = String(field.key || field.id || "").trim();
    const oldId = String(field.id || field.key || "").trim();
    if (oldKey) oldToNewFieldKey.set(oldKey, newId);
    if (oldId && oldId !== oldKey) oldToNewFieldKey.set(oldId, newId);

    return {
      ...field,
      id: newId,
      key: newId,
      options: Array.isArray(field.options) ? [...field.options] : field.options,
      validation:
        field.validation && typeof field.validation === "object" && !Array.isArray(field.validation)
          ? { ...(field.validation as Record<string, unknown>) }
          : field.validation,
    };
  });

  for (const field of clonedFields) {
    if (field.depends_on && oldToNewFieldKey.has(String(field.depends_on))) {
      field.depends_on = oldToNewFieldKey.get(String(field.depends_on));
    }
  }

  const baseTitle = String(section.title || "Section").trim() || "Section";
  return {
    ...section,
    id: newTemplateEntityId("section"),
    title: `${baseTitle}_COPY`,
    description: section.description,
    repeatable: section.repeatable,
    fields: clonedFields,
  };
}
