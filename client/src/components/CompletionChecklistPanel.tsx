import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, ImagePlus, ListChecks, Loader2, X } from "lucide-react";
import type {
  CompletionChecklistItem,
  CompletionChecklistResponse,
  CompletionChecklistSnapshot,
} from "@shared/schema";
import {
  computeCompletionChecklistProgress,
  isChecklistItemComplete,
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

export type InspectionCompletionChecklistPayload = {
  snapshot: CompletionChecklistSnapshot | null;
  responses: CompletionChecklistResponse[];
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
  inspectionId: string;
  /** When true, no edits (managers viewing completed work, tenants). */
  readOnly?: boolean;
  className?: string;
  /** Compact title for embedding in capture. */
  compact?: boolean;
};

export function CompletionChecklistPanel({
  inspectionId,
  readOnly = false,
  className,
  compact = false,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["/api/inspections", inspectionId, "completion-checklist"] as const;

  const { data, isLoading, isError } = useQuery<InspectionCompletionChecklistPayload>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/inspections/${inspectionId}/completion-checklist`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load checklist");
      return res.json();
    },
    enabled: !!inspectionId,
  });

  const upsertMutation = useMutation({
    mutationFn: async (args: {
      itemId: string;
      valueJson?: unknown;
      photoUrls?: string[];
    }) => {
      const res = await apiRequest(
        "PUT",
        `/api/inspections/${inspectionId}/completion-checklist/items/${args.itemId}`,
        {
          valueJson: args.valueJson ?? null,
          photoUrls: args.photoUrls,
        },
      );
      return res.json() as Promise<CompletionChecklistResponse>;
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

  const { snapshot, responses } = data;
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
    <Card className={cn(className)} data-testid="completion-checklist-panel">
      <CardHeader className={compact ? "pb-2 pt-4 px-4" : undefined}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className={cn("flex items-center gap-2", compact ? "text-base" : "text-lg")}>
              <ListChecks className="h-5 w-5" />
              {snapshot.name || "Completion checklist"}
            </CardTitle>
            {!compact && (
              <CardDescription className="mt-1">
                Finish these steps before leaving the site. Incomplete required steps show a warning
                at complete — they do not block finishing.
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
        {snapshot.items.map((item) => {
          const response = byItem.get(item.id);
          const done = isChecklistItemComplete(item, response);
          const showText = item.type === "text" || item.type === "text_with_photo";
          const showPhoto = item.type === "photo" || item.type === "text_with_photo";
          const photoLabel =
            item.type === "text_with_photo" ? "Add photo evidence" : "Add photo";

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
                  </div>
                  {item.helpText && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.helpText}</p>
                  )}
                  {item.type === "text_with_photo" && item.required && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Answer and photo evidence are both required for this step.
                    </p>
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

/** Hook helper for complete-anyway soft gate. */
export function useInspectionCompletionChecklist(inspectionId: string | undefined) {
  return useQuery<InspectionCompletionChecklistPayload>({
    queryKey: ["/api/inspections", inspectionId, "completion-checklist"],
    queryFn: async () => {
      const res = await fetch(`/api/inspections/${inspectionId}/completion-checklist`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load checklist");
      return res.json();
    },
    enabled: !!inspectionId,
  });
}
