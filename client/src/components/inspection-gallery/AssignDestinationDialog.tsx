import { useEffect, useMemo, useState } from "react";
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
  const [inspectionPointKey, setInspectionPointKey] = useState("");
  const [subPointKey, setSubPointKey] = useState("");

  const destinationsForSection = useMemo(
    () => destinations.filter((d) => d.sectionRef === sectionRef),
    [destinations, sectionRef],
  );

  const inspectionPoints = useMemo(
    () => destinationsForSection.filter((d) => !d.parentFieldKey),
    [destinationsForSection],
  );

  const effectiveInspectionPointKey =
    inspectionPointKey && inspectionPoints.some((f) => f.fieldKey === inspectionPointKey)
      ? inspectionPointKey
      : inspectionPoints[0]?.fieldKey || "";

  const subPoints = useMemo(
    () =>
      destinationsForSection.filter(
        (d) => d.parentFieldKey === effectiveInspectionPointKey,
      ),
    [destinationsForSection, effectiveInspectionPointKey],
  );

  const hasSubPoints = subPoints.length > 0;

  const effectiveSubPointKey =
    hasSubPoints && subPoints.some((s) => s.fieldKey === subPointKey)
      ? subPointKey
      : subPoints[0]?.fieldKey || "";

  const assignFieldKey = hasSubPoints ? effectiveSubPointKey : effectiveInspectionPointKey;

  useEffect(() => {
    if (!open) return;
    const nextSection = initialSectionRef || sectionOptions[0]?.sectionRef || "";
    setSectionRef(nextSection);
    const sectionDests = destinations.filter((d) => d.sectionRef === nextSection);
    const tops = sectionDests.filter((d) => !d.parentFieldKey);
    let nextPoint = tops[0]?.fieldKey || "";
    let nextSub = "";
    if (initialFieldKey) {
      const initial = sectionDests.find((d) => d.fieldKey === initialFieldKey);
      if (initial?.parentFieldKey) {
        nextPoint = initial.parentFieldKey;
        nextSub = initial.fieldKey;
      } else if (initial && !initial.parentFieldKey) {
        nextPoint = initial.fieldKey;
        const kids = sectionDests.filter((d) => d.parentFieldKey === nextPoint);
        nextSub = kids[0]?.fieldKey || "";
      }
    } else {
      const kids = sectionDests.filter((d) => d.parentFieldKey === nextPoint);
      nextSub = kids[0]?.fieldKey || "";
    }
    setInspectionPointKey(nextPoint);
    setSubPointKey(nextSub);
  }, [open, initialSectionRef, initialFieldKey, destinations, sectionOptions]);

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
              ? ` (max ${GALLERY_FIELD_PHOTO_MAX} per inspection point)`
              : ""}
          </p>
          {selectedCount > GALLERY_FIELD_PHOTO_MAX && (
            <p className="text-xs text-destructive">
              Select at most {GALLERY_FIELD_PHOTO_MAX} photos to assign to one inspection point.
            </p>
          )}
          <div className="space-y-2">
            <Label>Section</Label>
            <Select
              value={sectionRef}
              onValueChange={(v) => {
                setSectionRef(v);
                setInspectionPointKey("");
                setSubPointKey("");
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
            <Label>Inspection Point</Label>
            <Select
              value={effectiveInspectionPointKey}
              onValueChange={(v) => {
                setInspectionPointKey(v);
                const kids = destinationsForSection.filter((d) => d.parentFieldKey === v);
                setSubPointKey(kids[0]?.fieldKey || "");
              }}
            >
              <SelectTrigger data-testid="gallery-assign-field">
                <SelectValue placeholder="Select inspection point" />
              </SelectTrigger>
              <SelectContent>
                {inspectionPoints.map((f) => (
                  <SelectItem key={`${f.sectionRef}-${f.fieldKey}`} value={f.fieldKey}>
                    {f.fieldLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasSubPoints && (
            <div className="space-y-2">
              <Label>Sub Inspection Point</Label>
              <Select value={effectiveSubPointKey} onValueChange={setSubPointKey}>
                <SelectTrigger data-testid="gallery-assign-sub-field">
                  <SelectValue placeholder="Select sub inspection point" />
                </SelectTrigger>
                <SelectContent>
                  {subPoints.map((f) => (
                    <SelectItem key={`${f.sectionRef}-${f.fieldKey}`} value={f.fieldKey}>
                      {f.fieldLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
              !assignFieldKey ||
              selectedCount > GALLERY_FIELD_PHOTO_MAX
            }
            onClick={() => onConfirm(sectionRef, assignFieldKey)}
            data-testid="gallery-assign-confirm"
          >
            {busy ? "Saving…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
