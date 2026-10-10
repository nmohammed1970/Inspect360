import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { PreviewableImage } from "@/components/ImagePreview";
import { Loader2 } from "lucide-react";
import type { GalleryImage } from "./types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspectionId: string;
  /** Already assigned to the current field — shown disabled/preselected */
  alreadyUrls?: string[];
  maxSelectable?: number;
  destinationLabel?: string;
  onConfirm: (images: GalleryImage[]) => void | Promise<void>;
  busy?: boolean;
};

export function GalleryPickDialog({
  open,
  onOpenChange,
  inspectionId,
  alreadyUrls = [],
  maxSelectable = 10,
  destinationLabel,
  onConfirm,
  busy,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, refetch } = useQuery<{ images: GalleryImage[] }>({
    queryKey: ["/api/inspections", inspectionId, "gallery"],
    queryFn: async () => {
      const res = await fetch(`/api/inspections/${inspectionId}/gallery`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load gallery");
      return res.json();
    },
    enabled: open && !!inspectionId,
  });

  const images = data?.images || [];
  const already = useMemo(() => new Set(alreadyUrls), [alreadyUrls]);

  const remainingSlots = Math.max(0, maxSelectable - alreadyUrls.length);

  const toggle = (id: string, objectUrl: string) => {
    if (already.has(objectUrl)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < remainingSlots) next.add(id);
      return next;
    });
  };

  const selectedImages = images.filter((i) => selected.has(i.id));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setSelected(new Set());
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Choose from Gallery</DialogTitle>
          {destinationLabel && (
            <p className="text-sm text-muted-foreground">Current location: {destinationLabel}</p>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}
          {isError && (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-destructive">Unable to load gallery.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          )}
          {!isLoading && !isError && images.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">
              No photos in this inspection gallery yet. Upload photos from the Gallery tab first.
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {images.map((image) => {
              const used = already.has(image.objectUrl);
              const isSelected = selected.has(image.id);
              return (
                <button
                  key={image.id}
                  type="button"
                  disabled={used || (!isSelected && selected.size >= remainingSlots)}
                  onClick={() => toggle(image.id, image.objectUrl)}
                  className={cn(
                    "relative rounded-lg border overflow-hidden text-left",
                    isSelected && "ring-2 ring-primary",
                    used && "opacity-60",
                  )}
                >
                  <div className="absolute top-2 left-2 z-10">
                    <Checkbox checked={used || isSelected} disabled={used} />
                  </div>
                  <PreviewableImage
                    src={image.objectUrl}
                    alt={image.fileName || "Photo"}
                    className="w-full aspect-square object-cover pointer-events-none"
                  />
                  <div className="p-1.5">
                    {used ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Already added
                      </Badge>
                    ) : image.assignments[0] ? (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {image.assignments[0].label}
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">Unassigned</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || selectedImages.length === 0}
            onClick={() => onConfirm(selectedImages)}
          >
            {busy ? "Adding…" : `Add ${selectedImages.length || ""} Photo${selectedImages.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
