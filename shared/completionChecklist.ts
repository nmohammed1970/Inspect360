import type {
  CompletionChecklistItem,
  CompletionChecklistPhotoEvidence,
  CompletionChecklistSnapshot,
} from "./schema";

export type CompletionChecklistResponseLike = {
  itemId: string;
  valueJson?: unknown;
  photoUrls?: string[] | null;
};

export type CompletionChecklistProgress = {
  total: number;
  completed: number;
  requiredIncomplete: number;
  requiredTotal: number;
  requiredCompleted: number;
};

/** Normalize legacy text_with_photo and missing photoEvidence. */
export function normalizeCompletionChecklistItem(
  raw: CompletionChecklistItem & { type?: string },
): CompletionChecklistItem {
  const legacyType = raw.type as string;
  if (legacyType === "text_with_photo") {
    return {
      id: raw.id,
      label: raw.label,
      type: "text",
      required: raw.required,
      helpText: raw.helpText,
      photoEvidence: raw.required ? "required" : "optional",
    };
  }
  const type =
    legacyType === "checkbox" || legacyType === "text" || legacyType === "photo"
      ? legacyType
      : "checkbox";
  const photoEvidence: CompletionChecklistPhotoEvidence =
    raw.photoEvidence === "optional" || raw.photoEvidence === "required"
      ? raw.photoEvidence
      : "none";
  return {
    id: raw.id,
    label: raw.label,
    type,
    required: raw.required,
    helpText: raw.helpText,
    photoEvidence: type === "photo" ? "none" : photoEvidence,
  };
}

export function normalizeCompletionChecklistItems(
  items: Array<CompletionChecklistItem & { type?: string }> | null | undefined,
): CompletionChecklistItem[] {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeCompletionChecklistItem);
}

export function itemAllowsPhotoEvidence(item: CompletionChecklistItem): boolean {
  if (item.type === "photo") return true;
  const mode = item.photoEvidence ?? "none";
  return mode === "optional" || mode === "required";
}

export function itemRequiresPhotoEvidence(item: CompletionChecklistItem): boolean {
  if (item.type === "photo") return true;
  return (item.photoEvidence ?? "none") === "required";
}

export function isChecklistItemComplete(
  item: CompletionChecklistItem,
  response: CompletionChecklistResponseLike | undefined | null,
): boolean {
  const normalized = normalizeCompletionChecklistItem(item);
  if (!response) return false;

  const hasText =
    typeof response.valueJson === "string" && response.valueJson.trim().length > 0;
  const hasPhoto =
    Array.isArray(response.photoUrls) && response.photoUrls.length > 0;

  let baseDone = false;
  switch (normalized.type) {
    case "checkbox":
      baseDone = response.valueJson === true;
      break;
    case "text":
      baseDone = hasText;
      break;
    case "photo":
      baseDone = hasPhoto;
      break;
    default:
      baseDone = false;
  }

  if (!baseDone) return false;
  if (itemRequiresPhotoEvidence(normalized) && normalized.type !== "photo") {
    return hasPhoto;
  }
  return true;
}

export function computeCompletionChecklistProgress(
  snapshot: CompletionChecklistSnapshot | null | undefined,
  responses: CompletionChecklistResponseLike[] | null | undefined,
): CompletionChecklistProgress {
  const items = normalizeCompletionChecklistItems(snapshot?.items);
  const byItem = new Map((responses ?? []).map((r) => [r.itemId, r]));

  let completed = 0;
  let requiredTotal = 0;
  let requiredCompleted = 0;

  for (const item of items) {
    const done = isChecklistItemComplete(item, byItem.get(item.id));
    if (done) completed += 1;
    if (item.required) {
      requiredTotal += 1;
      if (done) requiredCompleted += 1;
    }
  }

  return {
    total: items.length,
    completed,
    requiredTotal,
    requiredCompleted,
    requiredIncomplete: Math.max(0, requiredTotal - requiredCompleted),
  };
}

export function buildCompletionChecklistSnapshot(checklist: {
  id: string;
  name: string;
  version: number;
  itemsJson: CompletionChecklistItem[] | null | undefined;
}): CompletionChecklistSnapshot {
  return {
    id: checklist.id,
    name: checklist.name,
    version: checklist.version,
    items: normalizeCompletionChecklistItems(checklist.itemsJson),
  };
}
