import type {
  CompletionChecklistItem,
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

export function isChecklistItemComplete(
  item: CompletionChecklistItem,
  response: CompletionChecklistResponseLike | undefined | null,
): boolean {
  if (!response) return false;
  const hasText =
    typeof response.valueJson === "string" && response.valueJson.trim().length > 0;
  const hasPhoto =
    Array.isArray(response.photoUrls) && response.photoUrls.length > 0;

  switch (item.type) {
    case "checkbox":
      return response.valueJson === true;
    case "text":
      return hasText;
    case "photo":
      return hasPhoto;
    case "text_with_photo":
      // Text always required to count as done; required steps also need photo evidence.
      if (!hasText) return false;
      if (item.required) return hasPhoto;
      return true;
    default:
      return false;
  }
}

export function computeCompletionChecklistProgress(
  snapshot: CompletionChecklistSnapshot | null | undefined,
  responses: CompletionChecklistResponseLike[] | null | undefined,
): CompletionChecklistProgress {
  const items = snapshot?.items ?? [];
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
    items: Array.isArray(checklist.itemsJson) ? checklist.itemsJson : [],
  };
}
