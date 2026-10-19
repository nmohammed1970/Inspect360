import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, ImagePlus, ListChecks, Loader2, X } from "lucide-react";
import type {
  CompletionChecklistItem,
  CompletionChecklistSnapshot,
  WorkOrderCompletionChecklistResponse,
} from "@shared/schema";
import {
  computeCompletionChecklistProgress,
  isChecklistItemComplete,
  itemAllowsPhotoEvidence,
  itemRequiresPhotoEvidence,
  normalizeCompletionChecklistItem,
  normalizeCompletionChecklistItems,
  type CompletionChecklistProgress,
} from "@shared/completionChecklist";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export type WorkOrderCompletionChecklistPayload = {
  snapshot: CompletionChecklistSnapshot | null;
  responses: WorkOrderCompletionChecklistResponse[];
  progress: CompletionChecklistProgress;
};

async function uploadObject(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/objects/upload-direct", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Upload failed");
  }
  const data = await res.json();
  const url = data.objectPath || data.url || data.path;
  if (!url) throw new Error("Upload did not return a path");
  return url as string;
}

type Props = {
  workOrderId: string;
  readOnly?: boolean;
  className?: string;
  compact?: boolean;
};

export function WorkOrderCompletionChecklistPanel({
  workOrderId,
  readOnly = false,
  className,
  compact = false,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["/api/work-orders", workOrderId, "completion-checklist"] as const;

  const { data, isLoading, isError } = useQuery<WorkOrderCompletionChecklistPayload>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/${workOrderId}/completion-checklist`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load checklist");
      return res.json();
    },
    enabled: !!workOrderId,
  });

  const upsertMutation = useMutation({
    mutationFn: async (args: {
      itemId: string;
      valueJson?: unknown;
      photoUrls?: string[];
    }) => {
      const res = await apiRequest(
        "PUT",
        `/api/work-orders/${workOrderId}/completion-checklist/items/${args.itemId}`,
        {
          valueJson: args.valueJson ?? null,
          photoUrls: args.photoUrls,
        },
      );
      return res.json() as Promise<WorkOrderCompletionChecklistResponse>;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Could not save step",
        description: err.message,
      });
    },
  });

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="py-6 flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading checklist…
        </CardContent>
      </Card>
    );
  }

  if (isError || !data?.snapshot?.items?.length) {
    return null;
  }

  const { snapshot: rawSnapshot, responses } = data;
  const items = normalizeCompletionChecklistItems(rawSnapshot.items);
  const snapshot = { ...rawSnapshot, items };
  const byItem = new Map(responses.map((r) => [r.itemId, r]));
  const progress =
    data.progress ?? computeCompletionChecklistProgress(snapshot, responses);
  const pct =
    progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  const saveItem = (
    item: CompletionChecklistItem,
    patch: { valueJson?: unknown; photoUrls?: string[] },
  ) => {
    if (readOnly) return;
    const existing = byItem.get(item.id);
    upsertMutation.mutate({
      itemId: item.id,
      valueJson: patch.valueJson !== undefined ? patch.valueJson : existing?.valueJson,
      photoUrls: patch.photoUrls !== undefined ? patch.photoUrls : existing?.photoUrls ?? [],
    });
  };

  const onPhotoFiles = async (item: CompletionChecklistItem, files: FileList | null) => {
    if (!files?.length || readOnly) return;
    try {
      const existing = byItem.get(item.id);
      const urls = [...(existing?.photoUrls || [])];
      for (const file of Array.from(files)) {
        urls.push(await uploadObject(file));
      }
      saveItem(item, { photoUrls: urls });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Photo upload failed",
        description: err?.message || "Try again",
      });
    }
  };

  return (
    <Card className={cn(className)} data-testid="work-order-completion-checklist-panel">
      <CardHeader className={compact ? "pb-2 pt-4 px-4" : undefined}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className={cn("flex items-center gap-2", compact ? "text-base" : "text-lg")}>
              <ListChecks className="h-5 w-5" />
              {snapshot.name || "Completion checklist"}
            </CardTitle>
            {!compact && (
              <CardDescription className="mt-1">
                Required steps must be finished before this work order can be marked completed.
              </CardDescription>
            )}
          </div>
          <Badge variant={progress.requiredIncomplete > 0 ? "secondary" : "default"}>
            {progress.completed}/{progress.total}
          </Badge>
        </div>
        <Progress value={pct} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className={cn("space-y-4", compact && "px-4 pb-4")}>
        {items.map((rawItem) => {
          const item = normalizeCompletionChecklistItem(rawItem);
          const response = byItem.get(item.id);
          const done = isChecklistItemComplete(item, response);
          const showText = item.type === "text";
          const showPhoto = itemAllowsPhotoEvidence(item);
          const photoLabel =
            item.type === "photo" ? "Add photo" : "Add photo evidence";

          return (
            <div
              key={item.id}
              className={cn(
                "rounded-md border p-3 space-y-2",
                done && "border-green-600/30 bg-green-50/40 dark:bg-green-950/20",
              )}
            >
              <div className="flex items-start gap-2">
                {done ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                ) : (
                  <span className="h-4 w-4 mt-0.5 shrink-0 rounded-full border" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{item.label}</span>
                    {item.required && (
                      <Badge variant="outline" className="text-[10px]">
                        Required
                      </Badge>
                    )}
                    {itemRequiresPhotoEvidence(item) && item.type !== "photo" && (
                      <Badge variant="outline" className="text-[10px]">
                        Photo required
                      </Badge>
                    )}
                  </div>
                  {item.helpText && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.helpText}</p>
                  )}
                </div>
              </div>

              {item.type === "checkbox" && (
                <label className="flex items-center gap-2 text-sm pl-6 cursor-pointer">
                  <Checkbox
                    checked={response?.valueJson === true}
                    disabled={readOnly || upsertMutation.isPending}
                    onCheckedChange={(v) => saveItem(item, { valueJson: v === true })}
                  />
                  Done
                </label>
              )}

              {showText && (
                <div className="pl-6">
                  <Input
                    defaultValue={
                      typeof response?.valueJson === "string" ? response.valueJson : ""
                    }
                    key={`${item.id}-${response?.updatedAt || "empty"}`}
                    disabled={readOnly || upsertMutation.isPending}
                    placeholder="Enter answer"
                    onBlur={(e) => {
                      const next = e.target.value;
                      const prev =
                        typeof response?.valueJson === "string" ? response.valueJson : "";
                      if (next !== prev) saveItem(item, { valueJson: next });
                    }}
                  />
                </div>
              )}

              {showPhoto && (
                <div className="pl-6 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {(response?.photoUrls || []).map((url) => (
                      <div key={url} className="relative group">
                        <a href={url} target="_blank" rel="noreferrer">
                          <img
                            src={url}
                            alt=""
                            className="h-16 w-16 object-cover rounded border"
                          />
                        </a>
                        {!readOnly && (
                          <button
                            type="button"
                            className="absolute -top-1 -right-1 rounded-full bg-destructive text-destructive-foreground p-0.5 opacity-0 group-hover:opacity-100"
                            onClick={() =>
                              saveItem(item, {
                                photoUrls: (response?.photoUrls || []).filter((u) => u !== url),
                              })
                            }
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {!readOnly && (
                    <label className="inline-flex items-center gap-1.5 text-sm border rounded-md px-3 py-1.5 cursor-pointer hover:bg-muted">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        multiple
                        onChange={(e) => {
                          void onPhotoFiles(item, e.target.files);
                          e.target.value = "";
                        }}
                      />
                      <Camera className="h-3.5 w-3.5" />
                      <ImagePlus className="h-3.5 w-3.5" />
                      {photoLabel}
                    </label>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function useWorkOrderCompletionChecklist(workOrderId: string | undefined) {
  return useQuery<WorkOrderCompletionChecklistPayload>({
    queryKey: ["/api/work-orders", workOrderId, "completion-checklist"],
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/${workOrderId}/completion-checklist`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load checklist");
      return res.json();
    },
    enabled: !!workOrderId,
  });
}
