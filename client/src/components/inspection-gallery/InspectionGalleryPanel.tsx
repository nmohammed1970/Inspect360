import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { PreviewableImage } from "@/components/ImagePreview";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AssignDestinationDialog } from "./AssignDestinationDialog";
import { runGalleryUploads } from "./uploadGalleryFiles";
import type { GalleryImage, PhotoDestination, UploadJob } from "./types";
import { Camera, ImagePlus, Loader2, Trash2, Calendar, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";
import {
  GALLERY_FIELD_PHOTO_MAX,
  GALLERY_REGISTER_BATCH_MAX,
  GALLERY_UPLOAD_SELECT_MAX,
  SECTION_GALLERY_FIELD_KEY,
  matchesSectionScope,
} from "@shared/inspectionGallery";
import { captureDeviceGps } from "./captureDeviceGps";

type FilterKey = "all" | "unassigned" | "assigned";

type Props = {
  inspectionId: string;
  canEdit?: boolean;
  onEntriesChanged?: () => void;
  /** When set, panel shows only images for this section instance (Section Gallery). */
  scopeSectionRef?: string;
  scopeAliasRefs?: string[];
  scopeLabel?: string;
  /** Tighter chrome when embedded in a dialog. */
  embedded?: boolean;
};

export function InspectionGalleryPanel({
  inspectionId,
  canEdit = true,
  onEntriesChanged,
  scopeSectionRef,
  scopeAliasRefs = [],
  scopeLabel,
  embedded = false,
}: Props) {
  const { toast } = useToast();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const formatGalleryDateTime = (iso: string | null | undefined) => {
    if (!iso) return null;
    try {
      return locale.formatDateTime(new Date(iso));
    } catch {
      return null;
    }
  };

  const [filter, setFilter] = useState<FilterKey>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [uploading, setUploading] = useState(false);

  const galleryQuery = useQuery<{ images: GalleryImage[] }>({
    queryKey: ["/api/inspections", inspectionId, "gallery"],
    queryFn: async () => {
      const res = await fetch(`/api/inspections/${inspectionId}/gallery`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load gallery");
      return res.json();
    },
  });

  const destinationsQuery = useQuery<{ destinations: PhotoDestination[] }>({
    queryKey: ["/api/inspections", inspectionId, "gallery", "destinations"],
    queryFn: async () => {
      const res = await fetch(`/api/inspections/${inspectionId}/gallery/destinations`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load destinations");
      return res.json();
    },
  });

  const allImages = galleryQuery.data?.images || [];
  const isScoped = Boolean(scopeSectionRef?.trim());
  const scopeRef = String(scopeSectionRef || "").trim();

  const images = useMemo(() => {
    if (!isScoped) return allImages;
    return allImages.filter((img) => matchesSectionScope(img, scopeRef, scopeAliasRefs));
  }, [allImages, isScoped, scopeRef, scopeAliasRefs]);

  // Section Gallery: Assign/Move only offers points under this section instance.
  const destinations = useMemo(() => {
    const all = destinationsQuery.data?.destinations || [];
    if (!isScoped) return all;
    const refs = new Set(
      [scopeRef, ...scopeAliasRefs].map((r) => String(r || "").trim()).filter(Boolean),
    );
    return all.filter((d) => refs.has(d.sectionRef));
  }, [destinationsQuery.data?.destinations, isScoped, scopeRef, scopeAliasRefs]);

  const assignInitialSectionRef = useMemo(() => {
    if (!isScoped) return undefined;
    return destinations[0]?.sectionRef || scopeRef;
  }, [isScoped, destinations, scopeRef]);

  const filtered = useMemo(() => {
    if (filter === "unassigned") return images.filter((i) => i.assignments.length === 0);
    if (filter === "assigned") return images.filter((i) => i.assignments.length > 0);
    return images;
  }, [images, filter]);

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ["/api/inspections", inspectionId, "gallery"],
    });
    await queryClient.invalidateQueries({
      queryKey: [`/api/inspections/${inspectionId}/entries`],
    });
    onEntriesChanged?.();
  }, [inspectionId, onEntriesChanged, queryClient]);

  const assignMutation = useMutation({
    mutationFn: async ({
      imageIds,
      sectionRef,
      fieldKey,
    }: {
      imageIds: string[];
      sectionRef: string;
      fieldKey: string;
    }) => {
      const res = await apiRequest("POST", `/api/inspections/${inspectionId}/gallery/assign`, {
        imageIds,
        sectionRef,
        fieldKey,
      });
      return res.json();
    },
    onSuccess: async () => {
      setAssignOpen(false);
      setSelected(new Set());
      await invalidate();
      toast({ title: "Photos assigned" });
    },
    onError: (e: any) => {
      toast({ title: "Unable to assign", description: e.message, variant: "destructive" });
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({
      imageIds,
      sectionRef,
      fieldKey,
      from,
    }: {
      imageIds: string[];
      sectionRef: string;
      fieldKey: string;
      from: { sectionRef: string; fieldKey: string };
    }) => {
      const res = await apiRequest("POST", `/api/inspections/${inspectionId}/gallery/move`, {
        imageIds,
        from,
        to: { sectionRef, fieldKey },
      });
      return res.json();
    },
    onSuccess: async () => {
      setMoveOpen(false);
      setSelected(new Set());
      await invalidate();
      toast({ title: "Photos moved" });
    },
    onError: (e: any) => {
      toast({ title: "Unable to move", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (imageIds: string[]) => {
      const res = await apiRequest("POST", `/api/inspections/${inspectionId}/gallery/delete`, {
        imageIds,
      });
      return res.json();
    },
    onSuccess: async (result) => {
      setDeleteOpen(false);
      setSelected(new Set());
      await invalidate();
      toast({
        title: "Photos deleted",
        description:
          result.assignmentCount > 0
            ? `Removed from ${result.assignmentCount} inspection field(s).`
            : undefined,
      });
    },
    onError: (e: any) => {
      toast({ title: "Unable to delete", description: e.message, variant: "destructive" });
    },
  });

  const registerAndRefresh = async (
    successful: Array<{ objectUrl: string; fileName: string; mimeType: string; byteSize: number }>,
  ) => {
    if (!successful.length) return;
    const gps = await captureDeviceGps();
    const assign =
      isScoped && scopeRef
        ? { sectionRef: scopeRef, fieldKey: SECTION_GALLERY_FIELD_KEY }
        : null;
    // Server accepts at most GALLERY_REGISTER_BATCH_MAX images per request.
    for (let i = 0; i < successful.length; i += GALLERY_REGISTER_BATCH_MAX) {
      const chunk = successful.slice(i, i + GALLERY_REGISTER_BATCH_MAX);
      await apiRequest("POST", `/api/inspections/${inspectionId}/gallery/register`, {
        images: chunk.map((s) => ({
          objectUrl: s.objectUrl,
          fileName: s.fileName,
          mimeType: s.mimeType,
          byteSize: s.byteSize,
          captureLatitude: gps?.latitude ?? null,
          captureLongitude: gps?.longitude ?? null,
        })),
        assign,
        capture: gps
          ? { latitude: gps.latitude, longitude: gps.longitude }
          : null,
      });
    }
    await invalidate();
  };

  const handleFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList || !canEdit) return;
    const files = Array.from(fileList);
    if (!files.length) return;
    if (files.length > GALLERY_UPLOAD_SELECT_MAX) {
      toast({
        title: "Too many photos",
        description: `You can select at most ${GALLERY_UPLOAD_SELECT_MAX} photos at a time. Please select fewer and try again.`,
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const { jobs, successful } = await runGalleryUploads(files, setUploadJobs);
      await registerAndRefresh(successful);
      const failed = jobs.filter((j) => j.status === "failed").length;
      toast({
        title: successful.length ? "Upload complete" : "Upload failed",
        description: failed
          ? `${successful.length} uploaded, ${failed} failed.`
          : `${successful.length} photo(s) added to gallery.`,
        variant: failed && !successful.length ? "destructive" : "default",
      });
      // Clear progress strip once registration succeeds (or nothing to register).
      if (!failed) setUploadJobs([]);
    } catch (e: any) {
      toast({
        title: "Could not add photos to gallery",
        description: e?.message || "Registration failed after upload.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const retryFailed = async () => {
    // Re-prompt file picker — original File objects are not retained after failure batches
    fileInputRef.current?.click();
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected(new Set(filtered.map((i) => i.id)));
  };

  const selectedImages = images.filter((i) => selected.has(i.id));
  const moveFrom =
    selectedImages.length === 1 && selectedImages[0].assignments.length === 1
      ? {
          sectionRef: selectedImages[0].assignments[0].sectionRef,
          fieldKey: selectedImages[0].assignments[0].fieldKey,
        }
      : selectedImages[0]?.assignments[0]
        ? {
            sectionRef: selectedImages[0].assignments[0].sectionRef,
            fieldKey: selectedImages[0].assignments[0].fieldKey,
          }
        : null;

  const uploadProgress =
    uploadJobs.length === 0
      ? 0
      : (uploadJobs.filter((j) => j.status === "done").length / uploadJobs.length) * 100;

  if (galleryQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading gallery…
      </div>
    );
  }

  if (galleryQuery.isError) {
    return (
      <div className="rounded-lg border p-6 text-center space-y-3">
        <p className="text-sm text-destructive">Unable to load gallery.</p>
        <Button type="button" variant="outline" onClick={() => galleryQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const title = isScoped
    ? `Section Gallery${scopeLabel ? ` — ${scopeLabel}` : ""}`
    : "Inspection Gallery";

  return (
    <div
      className={cn("space-y-4 min-w-0", embedded && "space-y-3")}
      data-testid={isScoped ? "section-gallery-panel" : "inspection-gallery-panel"}
    >
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="min-w-0 space-y-0.5">
          <h2
            className={cn(
              "font-semibold tracking-tight font-heading",
              embedded ? "text-base" : "text-lg",
            )}
          >
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {images.length} photo{images.length === 1 ? "" : "s"}
            {filter !== "all" ? ` · showing ${filtered.length}` : ""}
            {isScoped && allImages.length > images.length
              ? ` · ${allImages.length} in inspection`
              : ""}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
            >
              <Camera className="h-4 w-4 mr-1.5" />
              Take Photo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              data-testid="gallery-upload-button"
            >
              <ImagePlus className="h-4 w-4 mr-1.5" />
              Add Photos
            </Button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {(uploading || uploadJobs.length > 0) && (
        <div className="rounded-card border bg-card p-3 space-y-2 shadow-card">
          <div className="flex justify-between text-sm">
            <span>
              {uploading ? "Uploading…" : "Upload finished"}{" "}
              {uploadJobs.filter((j) => j.status === "done").length}/{uploadJobs.length}
            </span>
            {uploadJobs.some((j) => j.status === "failed") && (
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={retryFailed}>
                Retry Failed
              </Button>
            )}
          </div>
          <Progress value={uploadProgress} className="h-2" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "unassigned", "assigned"] as FilterKey[]).map((key) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={filter === key ? "default" : "outline"}
            onClick={() => setFilter(key)}
            className="capitalize"
          >
            {key}
          </Button>
        ))}
        {filtered.length > 0 && canEdit && (
          <Button type="button" size="sm" variant="ghost" onClick={selectAllFiltered}>
            Select all ({filtered.length})
          </Button>
        )}
      </div>

      {selected.size > 0 && canEdit && (
        <div className="sticky top-0 z-10 flex flex-col gap-2 rounded-card border bg-card/95 backdrop-blur-sm p-3 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-medium">{selected.size} selected</Badge>
            <Button
              type="button"
              size="sm"
              variant="brand"
              disabled={selected.size > GALLERY_FIELD_PHOTO_MAX}
              onClick={() => setAssignOpen(true)}
              data-testid="gallery-assign-open"
              title={
                selected.size > GALLERY_FIELD_PHOTO_MAX
                  ? `Select at most ${GALLERY_FIELD_PHOTO_MAX} photos to assign to one field`
                  : undefined
              }
            >
              Assign
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!moveFrom || selected.size > GALLERY_FIELD_PHOTO_MAX}
              onClick={() => setMoveOpen(true)}
              title={
                selected.size > GALLERY_FIELD_PHOTO_MAX
                  ? `Select at most ${GALLERY_FIELD_PHOTO_MAX} photos to move to one field`
                  : undefined
              }
            >
              Move
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              title="Delete"
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
          {selected.size > GALLERY_FIELD_PHOTO_MAX && (
            <p className="text-xs text-destructive" data-testid="gallery-assign-limit-hint">
              A section field can have at most {GALLERY_FIELD_PHOTO_MAX} photos. Deselect some to
              enable Assign.
            </p>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-10 text-center space-y-3"
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (canEdit) handleFiles(e.dataTransfer.files);
          }}
        >
          <ImagePlus className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="font-medium">No photos yet</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {isScoped
              ? `Upload photos for ${scopeLabel || "this section"}. They appear here and in the Inspection Gallery until assigned to a point.`
              : "Upload photos, take a photo, or add images while completing inspection sections."}
          </p>
          {canEdit && (
            <Button type="button" onClick={() => fileInputRef.current?.click()}>
              Upload Photos
            </Button>
          )}
        </div>
      ) : (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (canEdit) handleFiles(e.dataTransfer.files);
          }}
        >
          {filtered.map((image) => {
            const isSelected = selected.has(image.id);
            const primary = image.assignments[0];
            const capturedAtLabel = formatGalleryDateTime(image.createdAt);
            return (
              <div
                key={image.id}
                className={cn(
                  "relative rounded-lg border overflow-hidden bg-card group",
                  isSelected && "ring-2 ring-primary",
                )}
              >
                <div className="absolute top-2 left-2 z-10">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(image.id)}
                    className="bg-background/90"
                    aria-label={`Select ${image.fileName || "photo"}`}
                  />
                </div>
                <PreviewableImage
                  src={image.objectUrl}
                  alt={image.fileName || "Gallery photo"}
                  title={image.fileName || "Gallery photo"}
                  className="w-full aspect-square object-cover"
                />
                <div className="p-2 space-y-1.5">
                  <p className="text-xs truncate font-medium">{image.fileName || "Photo"}</p>
                  {primary ? (
                    <Badge variant="secondary" className="text-[10px] font-normal max-w-full truncate">
                      {primary.label}
                      {image.assignments.length > 1 ? ` +${image.assignments.length - 1}` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      Not assigned
                    </Badge>
                  )}
                  <div className="space-y-0.5 text-[10px] text-muted-foreground leading-snug">
                    {capturedAtLabel && (
                      <p className="flex items-start gap-1 min-w-0">
                        <Calendar className="h-3 w-3 shrink-0 mt-0.5" aria-hidden />
                        <span className="truncate" title={capturedAtLabel}>
                          {capturedAtLabel}
                        </span>
                      </p>
                    )}
                    {image.inspectorName && (
                      <p className="flex items-start gap-1 min-w-0">
                        <User className="h-3 w-3 shrink-0 mt-0.5" aria-hidden />
                        <span className="truncate" title={image.inspectorName}>
                          {image.inspectorName}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AssignDestinationDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        destinations={destinations}
        selectedCount={selected.size}
        busy={assignMutation.isPending}
        initialSectionRef={assignInitialSectionRef}
        onConfirm={(sectionRef, fieldKey) =>
          assignMutation.mutate({ imageIds: Array.from(selected), sectionRef, fieldKey })
        }
      />

      {moveFrom && (
        <AssignDestinationDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          destinations={destinations}
          selectedCount={selected.size}
          title="Move Photos"
          confirmLabel="Move Photos"
          busy={moveMutation.isPending}
          initialSectionRef={assignInitialSectionRef}
          onConfirm={(sectionRef, fieldKey) =>
            moveMutation.mutate({
              imageIds: Array.from(selected),
              sectionRef,
              fieldKey,
              from: moveFrom,
            })
          }
        />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selected.size} photo{selected.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes them from the inspection gallery and from any assigned inspection
              fields. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(Array.from(selected))}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
