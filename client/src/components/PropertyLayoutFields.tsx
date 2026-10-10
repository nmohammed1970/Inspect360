import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ObjectUploader } from "@/components/ObjectUploader";
import { PreviewableImage } from "@/components/ImagePreview";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ROOM_COUNT_MAX,
  ROOM_COUNT_MIN,
  formatRoomCountsSummary,
  type AiLayoutSuggestion,
  type FloorPlanAnalysisStatus,
  type PropertyRoomCounts,
  type RoomTypeKey,
} from "@shared/propertyLayout";
import {
  FileText,
  Loader2,
  Minus,
  Plus,
  Trash2,
  Upload,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const FLOOR_PLAN_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

export type PropertyLayoutValue = PropertyRoomCounts & {
  floorPlanUrl?: string | null;
  floorPlanMimeType?: string | null;
  floorPlanFileName?: string | null;
  floorPlanAnalysisStatus?: FloorPlanAnalysisStatus | null;
  floorPlanAnalysisJson?: {
    suggestion?: AiLayoutSuggestion;
    error?: string;
    disclaimer?: string;
  } | null;
};

type PropertyLayoutFieldsProps = {
  value: PropertyLayoutValue;
  onChange: (next: PropertyLayoutValue) => void;
  /** When set, floor-plan attach/analyse hit property APIs. Omit for create-before-save. */
  propertyId?: string | null;
  disabled?: boolean;
  className?: string;
  /**
   * When true (create modal), floor plan is held until save; analysis runs after create.
   * Parent should call `runPostCreateFloorPlanPipeline` after create.
   */
};

function RoomStepper({
  label,
  value,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={disabled || value <= ROOM_COUNT_MIN}
          onClick={() => onChange(Math.max(ROOM_COUNT_MIN, value - 1))}
          aria-label={`Decrease ${label}`}
          data-testid={`${testId}-minus`}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <div
          className="min-w-[2.5rem] flex-1 h-9 rounded-md border bg-background flex items-center justify-center text-sm font-semibold tabular-nums"
          data-testid={`${testId}-value`}
          aria-live="polite"
        >
          {value}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={disabled || value >= ROOM_COUNT_MAX}
          onClick={() => onChange(Math.min(ROOM_COUNT_MAX, value + 1))}
          aria-label={`Increase ${label}`}
          data-testid={`${testId}-plus`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function applySuggestionToValue(
  value: PropertyLayoutValue,
  suggestion: AiLayoutSuggestion,
  dirty: Partial<Record<RoomTypeKey, boolean>>,
): PropertyLayoutValue {
  const next = { ...value };
  (["bedrooms", "kitchens", "bathrooms", "livingRooms"] as RoomTypeKey[]).forEach((key) => {
    if (!dirty[key]) next[key] = suggestion[key];
  });
  return next;
}

/** Persist a pre-uploaded floor plan onto a property after create (AI already ran on upload). */
export async function attachFloorPlanToProperty(input: {
  propertyId: string;
  documentUrl: string;
  mimeType?: string | null;
  fileName?: string | null;
}): Promise<void> {
  await apiRequest("POST", `/api/properties/${input.propertyId}/floor-plan`, {
    documentUrl: input.documentUrl,
    mimeType: input.mimeType,
    fileName: input.fileName,
  });
}

export function PropertyLayoutFields({
  value,
  onChange,
  propertyId,
  disabled,
  className,
}: PropertyLayoutFieldsProps) {
  const { toast } = useToast();
  const [dirty, setDirty] = useState<Partial<Record<RoomTypeKey, boolean>>>({});
  const [analysing, setAnalysing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const analyseInFlight = useRef(false);

  const suggestion = value.floorPlanAnalysisJson?.suggestion;
  const status = value.floorPlanAnalysisStatus || "none";
  const isPdf =
    (value.floorPlanMimeType || "").includes("pdf") ||
    (value.floorPlanFileName || "").toLowerCase().endsWith(".pdf");

  useEffect(() => {
    if (status === "processing") setAnalysing(true);
    else if (status === "complete" || status === "failed") setAnalysing(false);
  }, [status]);

  const setCount = (key: RoomTypeKey, n: number) => {
    setDirty((d) => ({ ...d, [key]: true }));
    onChange({ ...value, [key]: n });
  };

  const normalizeUploadedUrl = (raw: string | undefined | null): string | null => {
    if (!raw) return null;
    let fileUrl = raw;
    if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
      try {
        const urlObj = new URL(fileUrl);
        const match = urlObj.pathname.match(/\/objects\/.*/);
        fileUrl = match ? match[0] : `/objects${urlObj.pathname}`;
      } catch {
        fileUrl = fileUrl.includes("/objects/")
          ? `/objects/${fileUrl.split("/objects/")[1]}`
          : fileUrl;
      }
    }
    if (!fileUrl.startsWith("/objects/")) {
      if (fileUrl.startsWith("/")) fileUrl = `/objects${fileUrl}`;
      else return null;
    }
    return fileUrl.split("?")[0];
  };

  const runAnalyse = async (base: PropertyLayoutValue) => {
    if (!base.floorPlanUrl || analyseInFlight.current) return;
    analyseInFlight.current = true;
    setAnalysing(true);
    onChange({ ...base, floorPlanAnalysisStatus: "processing" });
    try {
      let suggestion: AiLayoutSuggestion | undefined;
      let analysisJson: PropertyLayoutValue["floorPlanAnalysisJson"] = null;
      let nextCounts: Partial<PropertyRoomCounts> = {};

      if (propertyId) {
        const res = await apiRequest(
          "POST",
          `/api/properties/${propertyId}/floor-plan/analyse`,
          {},
        );
        const updated = await res.json();
        analysisJson = updated.floorPlanAnalysisJson;
        suggestion = updated.floorPlanAnalysisJson?.suggestion;
        nextCounts = {
          bedrooms: updated.bedrooms,
          kitchens: updated.kitchens,
          bathrooms: updated.bathrooms,
          livingRooms: updated.livingRooms,
        };
        if (updated.floorPlanAnalysisStatus === "failed") {
          onChange({
            ...base,
            floorPlanAnalysisStatus: "failed",
            floorPlanAnalysisJson: analysisJson,
          });
          toast({
            title: "Analysis couldn't read this plan",
            description:
              analysisJson?.error ||
              "Enter room counts manually. Your floor plan is still uploaded.",
            variant: "destructive",
          });
          queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId] });
          return;
        }
        queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId] });
        queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      } else {
        const res = await apiRequest("POST", "/api/floor-plan/analyse", {
          documentUrl: base.floorPlanUrl,
          mimeType: base.floorPlanMimeType,
          fileName: base.floorPlanFileName,
        });
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error(
            "Server returned a non-JSON response. Restart the app server and try again.",
          );
        }
        const result = await res.json();
        suggestion = result.suggestion;
        analysisJson = result.analysis ?? { suggestion: result.suggestion };
        nextCounts = {
          bedrooms: result.bedrooms,
          kitchens: result.kitchens,
          bathrooms: result.bathrooms,
          livingRooms: result.livingRooms,
        };
      }

      if (!suggestion) {
        onChange({
          ...base,
          floorPlanAnalysisStatus: "failed",
          floorPlanAnalysisJson: {
            error: "We couldn't analyse the floor plan automatically.",
          },
        });
        toast({
          title: "Analysis couldn't read this plan",
          description: "Enter room counts manually.",
          variant: "destructive",
        });
        return;
      }

      const next: PropertyLayoutValue = {
        ...base,
        floorPlanAnalysisStatus: "complete",
        floorPlanAnalysisJson: analysisJson,
        bedrooms: nextCounts.bedrooms ?? base.bedrooms,
        kitchens: nextCounts.kitchens ?? base.kitchens,
        bathrooms: nextCounts.bathrooms ?? base.bathrooms,
        livingRooms: nextCounts.livingRooms ?? base.livingRooms,
      };
      const withDirtyGuard = applySuggestionToValue(next, suggestion, dirty);
      onChange(withDirtyGuard);
      toast({
        title: "Floor plan analysed",
        description: `Room counts updated: ${formatRoomCountsSummary(withDirtyGuard)}`,
      });
    } catch (e: any) {
      onChange({
        ...base,
        floorPlanAnalysisStatus: "failed",
        floorPlanAnalysisJson: {
          error: e?.message || "We couldn't analyse the floor plan automatically.",
        },
      });
      toast({
        title: "Analysis failed",
        description: e?.message || "Enter room counts manually.",
        variant: "destructive",
      });
    } finally {
      analyseInFlight.current = false;
      setAnalysing(false);
    }
  };

  const handleUploadComplete = async (result: {
    successful: Array<{
      uploadURL?: string;
      source?: string;
      name?: string;
      type?: string;
      data?: File;
    }>;
  }) => {
    const file = result.successful?.[0];
    if (!file) {
      setUploading(false);
      return;
    }
    const path = normalizeUploadedUrl(file.uploadURL || file.source);
    if (!path) {
      toast({
        title: "Upload issue",
        description: "Could not resolve floor plan URL. Please try again.",
        variant: "destructive",
      });
      setUploading(false);
      return;
    }

    const mime = file.type || file.data?.type || null;
    const fileName = file.name || file.data?.name || null;

    let next: PropertyLayoutValue = {
      ...value,
      floorPlanUrl: path,
      floorPlanMimeType: mime,
      floorPlanFileName: fileName,
      floorPlanAnalysisStatus: "processing",
      floorPlanAnalysisJson: null,
    };

    if (propertyId) {
      try {
        const res = await apiRequest("POST", `/api/properties/${propertyId}/floor-plan`, {
          documentUrl: path,
          mimeType: mime,
          fileName,
        });
        const updated = await res.json();
        next = {
          ...next,
          floorPlanUrl: updated.floorPlanUrl,
          floorPlanMimeType: updated.floorPlanMimeType,
          floorPlanFileName: updated.floorPlanFileName,
        };
        queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId] });
      } catch (e: any) {
        toast({
          title: "Unable to save floor plan",
          description: e?.message || "Please try again.",
          variant: "destructive",
        });
        setUploading(false);
        return;
      }
    }

    onChange(next);
    setUploading(false);
    toast({ title: "Floor plan uploaded", description: "Running AI analysis…" });
    await runAnalyse(next);
  };

  const removeFloorPlan = async () => {
    if (propertyId && value.floorPlanUrl) {
      try {
        await apiRequest("DELETE", `/api/properties/${propertyId}/floor-plan`);
        onChange({
          ...value,
          floorPlanUrl: null,
          floorPlanMimeType: null,
          floorPlanFileName: null,
          floorPlanAnalysisStatus: "none",
          floorPlanAnalysisJson: null,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId] });
        toast({ title: "Floor plan removed" });
        return;
      } catch (e: any) {
        toast({
          title: "Unable to remove floor plan",
          description: e?.message,
          variant: "destructive",
        });
        return;
      }
    }
    onChange({
      ...value,
      floorPlanUrl: null,
      floorPlanMimeType: null,
      floorPlanFileName: null,
      floorPlanAnalysisStatus: "none",
      floorPlanAnalysisJson: null,
    });
  };

  return (
    <div className={cn("space-y-4 min-w-0", className)} data-testid="section-property-layout">
      <div className="rounded-xl border border-dashed bg-muted/20 p-3 sm:p-4 space-y-3 min-w-0 overflow-hidden">
        <div className="min-w-0">
          <Label className="text-sm font-medium">Property Floor Plan (Optional)</Label>
        </div>

        {value.floorPlanUrl ? (
          <div className="space-y-3 min-w-0">
            <div className="rounded-lg border bg-background p-3 space-y-3 min-w-0">
              <div className="flex justify-center">
                {isPdf ? (
                  <div className="w-full max-w-[200px] h-28 rounded-md border flex flex-col items-center justify-center bg-muted/40">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <span className="text-xs mt-1 text-muted-foreground truncate max-w-full px-2">
                      {value.floorPlanFileName || "PDF"}
                    </span>
                  </div>
                ) : (
                  <PreviewableImage
                    src={value.floorPlanUrl}
                    alt="Floor plan"
                    title="Floor plan"
                    className="w-full max-w-[240px] h-32 object-contain rounded-md border bg-muted/40"
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <p className="text-sm font-medium truncate flex-1 min-w-0">
                  {value.floorPlanFileName || "Floor plan uploaded"}
                </p>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {status === "complete"
                    ? "Analysed"
                    : status === "processing" || analysing
                      ? "Analysing…"
                      : status === "failed"
                        ? "Analysis failed"
                        : "Uploaded"}
                </Badge>
              </div>
              <div className="flex flex-col gap-2 w-full">
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={25 * 1024 * 1024}
                  accept={FLOOR_PLAN_ACCEPT}
                  onGetUploadParameters={async () => {
                    setUploading(true);
                    const response = await fetch("/api/objects/upload", {
                      method: "POST",
                      credentials: "include",
                    });
                    const { uploadURL } = await response.json();
                    return { method: "PUT" as const, url: uploadURL };
                  }}
                  onComplete={async (result) => {
                    if (value.floorPlanUrl && !window.confirm("Replace existing floor plan?")) {
                      setUploading(false);
                      return;
                    }
                    await handleUploadComplete(result);
                  }}
                  buttonVariant="outline"
                  buttonClassName="w-full h-9"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Replace
                </ObjectUploader>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-full"
                  disabled={disabled}
                  onClick={removeFloorPlan}
                  data-testid="button-remove-floor-plan"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Remove
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-5 gap-2 min-w-0">
            <ObjectUploader
              maxNumberOfFiles={1}
              maxFileSize={25 * 1024 * 1024}
              accept={FLOOR_PLAN_ACCEPT}
              onGetUploadParameters={async () => {
                setUploading(true);
                const response = await fetch("/api/objects/upload", {
                  method: "POST",
                  credentials: "include",
                });
                const { uploadURL } = await response.json();
                return { method: "PUT" as const, url: uploadURL };
              }}
              onComplete={handleUploadComplete}
              buttonVariant="outline"
              buttonClassName="w-full max-w-xs"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Upload Floor Plan
            </ObjectUploader>
            <p className="text-xs text-muted-foreground text-center px-2">
              JPG, PNG, WebP, HEIC, or PDF · max 25MB
            </p>
          </div>
        )}

        {(analysing || status === "processing") && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span>Analysing floor plan and updating room counts…</span>
          </div>
        )}

        {status === "failed" && value.floorPlanAnalysisJson?.error && (
          <p className="text-sm text-destructive break-words">
            {value.floorPlanAnalysisJson.error}
          </p>
        )}

        {suggestion && status === "complete" && (
          <p className="text-xs text-muted-foreground" data-testid="text-ai-layout-applied">
            AI filled: {formatRoomCountsSummary(suggestion)}. Adjust the steppers below if needed.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 min-w-0">
        <RoomStepper
          label="Bedrooms"
          value={value.bedrooms}
          onChange={(n) => setCount("bedrooms", n)}
          disabled={disabled || analysing}
          testId="stepper-bedrooms"
        />
        <RoomStepper
          label="Kitchens"
          value={value.kitchens}
          onChange={(n) => setCount("kitchens", n)}
          disabled={disabled || analysing}
          testId="stepper-kitchens"
        />
        <RoomStepper
          label="Bathrooms"
          value={value.bathrooms}
          onChange={(n) => setCount("bathrooms", n)}
          disabled={disabled || analysing}
          testId="stepper-bathrooms"
        />
        <RoomStepper
          label="Living Rooms"
          value={value.livingRooms}
          onChange={(n) => setCount("livingRooms", n)}
          disabled={disabled || analysing}
          testId="stepper-living-rooms"
        />
      </div>
    </div>
  );
}
