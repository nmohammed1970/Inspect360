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
  switch (item.type) {
    case "checkbox":
      return response.valueJson === true;
    case "text": {
      const v = response.valueJson;
      return typeof v === "string" && v.trim().length > 0;
    }
    case "photo":
      return Array.isArray(response.photoUrls) && response.photoUrls.length > 0;
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
