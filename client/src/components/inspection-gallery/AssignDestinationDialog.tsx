import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PhotoDestination } from "./types";
import { GALLERY_FIELD_PHOTO_MAX } from "@shared/inspectionGallery";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destinations: PhotoDestination[];
  selectedCount: number;
  title?: string;
  confirmLabel?: string;
  initialSectionRef?: string;
  initialFieldKey?: string;
  onConfirm: (sectionRef: string, fieldKey: string) => void | Promise<void>;
  busy?: boolean;
};

export function AssignDestinationDialog({
  open,
  onOpenChange,
  destinations,
  selectedCount,
  title = "Assign Photos",
  confirmLabel = "Assign Photos",
  initialSectionRef,
  initialFieldKey,
  onConfirm,
  busy,
}: Props) {
  const sectionOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of destinations) {
      if (!map.has(d.sectionRef)) map.set(d.sectionRef, d.sectionLabel);
    }
    return Array.from(map.entries()).map(([sectionRef, sectionLabel]) => ({
      sectionRef,
      sectionLabel,
    }));
  }, [destinations]);

  const [sectionRef, setSectionRef] = useState(
    initialSectionRef || sectionOptions[0]?.sectionRef || "",
  );
  const [fieldKey, setFieldKey] = useState(initialFieldKey || "");

  const fieldsForSection = useMemo(
    () => destinations.filter((d) => d.sectionRef === sectionRef),
    [destinations, sectionRef],
  );

  const effectiveFieldKey =
    fieldKey && fieldsForSection.some((f) => f.fieldKey === fieldKey)
      ? fieldKey
      : fieldsForSection[0]?.fieldKey || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            {selectedCount} photo{selectedCount === 1 ? "" : "s"} selected
            {selectedCount > GALLERY_FIELD_PHOTO_MAX
              ? ` (max ${GALLERY_FIELD_PHOTO_MAX} per field)`
              : ""}
          </p>
          {selectedCount > GALLERY_FIELD_PHOTO_MAX && (
            <p className="text-xs text-destructive">
              Select at most {GALLERY_FIELD_PHOTO_MAX} photos to assign to one section field.
            </p>
          )}
          <div className="space-y-2">
            <Label>Section</Label>
            <Select
              value={sectionRef}
              onValueChange={(v) => {
                setSectionRef(v);
                setFieldKey("");
              }}
            >
              <SelectTrigger data-testid="gallery-assign-section">
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                {sectionOptions.map((s) => (
                  <SelectItem key={s.sectionRef} value={s.sectionRef}>
                    {s.sectionLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Field</Label>
            <Select value={effectiveFieldKey} onValueChange={setFieldKey}>
              <SelectTrigger data-testid="gallery-assign-field">
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                {fieldsForSection.map((f) => (
                  <SelectItem key={`${f.sectionRef}-${f.fieldKey}`} value={f.fieldKey}>
                    {f.fieldLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              busy ||
              !sectionRef ||
              !effectiveFieldKey ||
              selectedCount > GALLERY_FIELD_PHOTO_MAX
            }
            onClick={() => onConfirm(sectionRef, effectiveFieldKey)}
            data-testid="gallery-assign-confirm"
          >
            {busy ? "Saving…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
