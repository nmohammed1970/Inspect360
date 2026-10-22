import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Trash2, Sparkles } from "lucide-react";
import {
  floorAreaM2,
  floorAreaFt2,
  formatLengthInput,
  formatMillimetresAsFeetInches,
  parseLengthInputToMillimetres,
  metresToMm,
  countsFromRooms,
  resolveSystemCategoryForLabel,
  roomTypeFromCategorySlug,
  type LengthUnit,
  type AreaUnit,
  type AiProposedRoom,
} from "@shared/propertyRooms";
import type { PropertyRoomCounts } from "@shared/propertyLayout";

export type DraftRoom = {
  /** Client-only key for React lists before save */
  clientKey: string;
  id?: string;
  categoryId: string;
  name: string;
  widthMm: number | null;
  lengthMm: number | null;
  ceilingHeightMm: number | null;
  source: "manual" | "ai";
  aiConfidence?: "high" | "medium" | "low" | null;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
};

type PropertyRoomsEditorProps = {
  propertyId?: string | null;
  rooms: DraftRoom[];
  onChange: (rooms: DraftRoom[]) => void;
  /** When AI returns proposed rooms, parent sets this to open review */
  aiProposedRooms?: AiProposedRoom[] | null;
  onAiProposedConsumed?: () => void;
  onCountsDerived?: (counts: PropertyRoomCounts) => void;
  disabled?: boolean;
  className?: string;
};

function newClientKey() {
  return `tmp_${Math.random().toString(36).slice(2, 10)}`;
}

export function PropertyRoomsEditor({
  propertyId,
  rooms,
  onChange,
  aiProposedRooms,
  onAiProposedConsumed,
  onCountsDerived,
  disabled,
  className,
}: PropertyRoomsEditorProps) {
  const { toast } = useToast();
  // Default to feet (floor plans commonly print ft/in); user can switch
  const [unit, setUnit] = useState<LengthUnit>("ft");
  const areaUnit: AreaUnit = unit === "ft" || unit === "in" ? "ft2" : "m2";
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRooms, setReviewRooms] = useState<AiProposedRoom[]>([]);

  const { data: categories = [], isLoading: catsLoading } = useQuery<Category[]>({
    queryKey: ["/api/room-categories"],
  });

  useEffect(() => {
    if (aiProposedRooms && aiProposedRooms.length > 0) {
      setReviewRooms(aiProposedRooms);
      setReviewOpen(true);
    }
  }, [aiProposedRooms]);

  const onCountsDerivedRef = useRef(onCountsDerived);
  onCountsDerivedRef.current = onCountsDerived;
  const lastCountsKey = useRef("");
  useEffect(() => {
    if (!categories.length) return;
    const counts = countsFromRooms(
      rooms.map((r) => {
        const cat = categories.find((c) => c.id === r.categoryId);
        return {
          categorySlug: cat?.slug,
          categoryName: cat?.name,
          name: r.name,
        };
      }),
    );
    const key = `${counts.bedrooms}-${counts.kitchens}-${counts.bathrooms}-${counts.livingRooms}`;
    if (key === lastCountsKey.current) return;
    lastCountsKey.current = key;
    onCountsDerivedRef.current?.(counts);
  }, [rooms, categories]);

  const createCategory = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/room-categories", { name });
      return res.json();
    },
    onSuccess: async (cat: Category) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/room-categories"] });
      setAddCategoryOpen(false);
      setNewCategoryName("");
      toast({ title: "Category added", description: cat.name });
    },
    onError: (e: Error) => {
      toast({
        title: "Could not add category",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const findCategoryForAi = (
    cats: Category[],
    categoryName: string,
    roomName?: string,
  ): Category | undefined => {
    const resolved = resolveSystemCategoryForLabel(roomName || categoryName, categoryName);
    const roomType = resolved.roomType;
    return (
      cats.find((c) => c.slug === resolved.slug) ||
      cats.find((c) => c.name.toLowerCase() === resolved.name.toLowerCase()) ||
      (roomType !== "other"
        ? cats.find((c) => roomTypeFromCategorySlug(c.slug) === roomType)
        : undefined) ||
      cats.find((c) => c.slug === "other") ||
      cats[0]
    );
  };

  const applyAiReview = async () => {
    // Create missing categories first (rare — system seeds usually cover AI labels)
    const ensured = [...categories];
    for (const pr of reviewRooms) {
      const resolved = resolveSystemCategoryForLabel(pr.name, pr.category);
      const hit = findCategoryForAi(ensured, resolved.name, pr.name);
      if (!hit || (hit.slug === "other" && resolved.slug !== "other")) {
        try {
          const res = await apiRequest("POST", "/api/room-categories", {
            name: resolved.name.slice(0, 120) || "Other",
          });
          const cat = await res.json();
          ensured.push(cat);
        } catch {
          /* duplicate race */
        }
      }
    }
    await queryClient.invalidateQueries({ queryKey: ["/api/room-categories"] });
    const freshRes = await fetch("/api/room-categories", { credentials: "include" });
    const freshCats: Category[] = freshRes.ok ? await freshRes.json() : ensured;

    const mapped: DraftRoom[] = reviewRooms.map((pr, idx) => {
      const resolved = resolveSystemCategoryForLabel(pr.name, pr.category);
      const cat = findCategoryForAi(freshCats, resolved.name, pr.name);
      return {
        clientKey: newClientKey(),
        categoryId: cat?.id || "",
        name: pr.name,
        widthMm: metresToMm(pr.widthM),
        lengthMm: metresToMm(pr.lengthM),
        ceilingHeightMm: null,
        source: "ai" as const,
        aiConfidence: pr.confidence ?? null,
        sortOrder: idx,
      };
    });

    const manualKept = rooms.filter((r) => r.source === "manual");
    onChange([...manualKept, ...mapped]);
    setReviewOpen(false);
    onAiProposedConsumed?.();
    toast({
      title: "AI rooms applied",
      description: `${mapped.length} room(s) added. Review dimensions before saving.`,
    });
  };

  const updateRoom = (clientKey: string, patch: Partial<DraftRoom>) => {
    onChange(rooms.map((r) => (r.clientKey === clientKey ? { ...r, ...patch } : r)));
  };

  const removeRoom = (clientKey: string) => {
    onChange(rooms.filter((r) => r.clientKey !== clientKey));
  };

  const addRoom = () => {
    const fallback = categories.find((c) => c.slug === "bedroom") || categories[0];
    if (!fallback) {
      toast({
        title: "No categories",
        description: "Add a room category first.",
        variant: "destructive",
      });
      return;
    }
    const sameCategoryCount = rooms.filter((r) => r.categoryId === fallback.id).length;
    onChange([
      ...rooms,
      {
        clientKey: newClientKey(),
        categoryId: fallback.id,
        name: `${fallback.name} ${sameCategoryCount + 1}`,
        widthMm: null,
        lengthMm: null,
        ceilingHeightMm: null,
        source: "manual",
      },
    ]);
  };

  const unitOptions: LengthUnit[] = ["ft", "in", "m", "cm", "mm"];

  const dimDisplay = (mm: number | null) => formatLengthInput(mm, unit);
  const dimUnitLabel = unit === "ft" ? "ft/in" : unit;

  const setDim = (clientKey: string, field: "widthMm" | "lengthMm" | "ceilingHeightMm", raw: string) => {
    if (raw.trim() === "") {
      updateRoom(clientKey, { [field]: null });
      return;
    }
    const mm = parseLengthInputToMillimetres(raw, unit);
    if (mm == null) return;
    updateRoom(clientKey, { [field]: mm });
  };

  return (
    <div className={cn("space-y-4", className)} data-testid="property-rooms-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Rooms &amp; areas</h3>
          <p className="text-sm text-muted-foreground">
            Name, category, and floor dimensions (width × length). Dimensions are optional.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={unit} onValueChange={(v) => setUnit(v as LengthUnit)}>
            <SelectTrigger className="w-[100px] h-9" data-testid="select-length-unit">
              <SelectValue>{unit === "ft" ? "ft/in" : unit}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {unitOptions.map((u) => (
                <SelectItem key={u} value={u}>
                  {u === "ft" ? "ft/in" : u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddCategoryOpen(true)}
            disabled={disabled}
            data-testid="button-add-room-category"
          >
            Add category
          </Button>
          <Button
            type="button"
            variant="brand"
            size="sm"
            onClick={addRoom}
            disabled={disabled || catsLoading}
            data-testid="button-add-room"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add room
          </Button>
        </div>
      </div>

      {catsLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading categories…
        </div>
      ) : rooms.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No rooms configured yet. Add rooms manually or upload a floor plan for AI suggestions.
        </div>
      ) : (
        <div className="space-y-3 max-h-[min(50vh,420px)] overflow-y-auto pr-1">
          {rooms.map((room) => {
            const area =
              areaUnit === "ft2"
                ? floorAreaFt2(room.widthMm, room.lengthMm)
                : floorAreaM2(room.widthMm, room.lengthMm);
            return (
              <div
                key={room.clientKey}
                className="rounded-lg border bg-card p-3 sm:p-4 space-y-3"
                data-testid={`room-card-${room.clientKey}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    {room.source === "ai" && (
                      <Badge variant="info" className="gap-1 shrink-0">
                        <Sparkles className="h-3 w-3" />
                        AI{room.aiConfidence ? ` · ${room.aiConfidence}` : ""}
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={disabled}
                    onClick={() => removeRoom(room.clientKey)}
                    aria-label="Remove room"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Room name</Label>
                    <Input
                      value={room.name}
                      disabled={disabled}
                      onChange={(e) => updateRoom(room.clientKey, { name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select
                      value={room.categoryId}
                      disabled={disabled}
                      onValueChange={(v) => {
                        const cat = categories.find((c) => c.id === v);
                        const nextIndex =
                          rooms.filter((r) => r.categoryId === v && r.clientKey !== room.clientKey)
                            .length + 1;
                        updateRoom(room.clientKey, {
                          categoryId: v,
                          name: room.name.trim()
                            ? room.name
                            : cat
                              ? `${cat.name} ${nextIndex}`
                              : room.name,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label>Width ({dimUnitLabel})</Label>
                    <Input
                      inputMode="text"
                      value={dimDisplay(room.widthMm)}
                      disabled={disabled}
                      onChange={(e) => setDim(room.clientKey, "widthMm", e.target.value)}
                      placeholder={unit === "ft" ? "12'3\"" : "—"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Length ({dimUnitLabel})</Label>
                    <Input
                      inputMode="text"
                      value={dimDisplay(room.lengthMm)}
                      disabled={disabled}
                      onChange={(e) => setDim(room.clientKey, "lengthMm", e.target.value)}
                      placeholder={unit === "ft" ? "8'9\"" : "—"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Room height ({dimUnitLabel})</Label>
                    <Input
                      inputMode="text"
                      value={dimDisplay(room.ceilingHeightMm)}
                      disabled={disabled}
                      onChange={(e) => setDim(room.clientKey, "ceilingHeightMm", e.target.value)}
                      placeholder={unit === "ft" ? "Optional e.g. 8'0\"" : "Optional"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Floor area</Label>
                    <div className="h-10 rounded-md border bg-muted/40 px-3 flex items-center text-sm tabular-nums">
                      {area == null ? "—" : `${area} ${areaUnit === "ft2" ? "ft²" : "m²"}`}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {propertyId && (
        <p className="text-xs text-muted-foreground">
          Rooms are saved when you update the property.
        </p>
      )}

      <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add room category</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Name</Label>
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. Conservatory"
              data-testid="input-new-category-name"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddCategoryOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="brand"
              disabled={!newCategoryName.trim() || createCategory.isPending}
              onClick={() => createCategory.mutate(newCategoryName)}
            >
              {createCategory.isPending ? "Saving…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reviewOpen}
        onOpenChange={(o) => {
          setReviewOpen(o);
          if (!o) onAiProposedConsumed?.();
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review AI-detected rooms</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Confirm or edit before applying. Manual rooms you already added are kept; AI rooms
            replace previous AI suggestions.
          </p>
          <div className="space-y-2 py-2">
            {reviewRooms.map((r, i) => (
              <div key={i} className="rounded-md border p-3 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={r.name}
                    onChange={(e) => {
                      const next = [...reviewRooms];
                      next[i] = { ...r, name: e.target.value };
                      setReviewRooms(next);
                    }}
                    className="flex-1"
                  />
                  <Badge variant={r.confidence === "low" ? "warning" : "secondary"}>
                    {r.confidence || "n/a"}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setReviewRooms(reviewRooms.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  value={r.category}
                  onChange={(e) => {
                    const next = [...reviewRooms];
                    next[i] = { ...r, category: e.target.value };
                    setReviewRooms(next);
                  }}
                  placeholder="Category"
                />
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>
                    W:{" "}
                    {r.widthM != null
                      ? formatMillimetresAsFeetInches(metresToMm(r.widthM)) || `${r.widthM} m`
                      : "—"}{" "}
                    · L:{" "}
                    {r.lengthM != null
                      ? formatMillimetresAsFeetInches(metresToMm(r.lengthM)) || `${r.lengthM} m`
                      : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReviewOpen(false);
                onAiProposedConsumed?.();
              }}
            >
              Discard
            </Button>
            <Button
              type="button"
              variant="brand"
              disabled={reviewRooms.length === 0}
              onClick={() => void applyAiReview()}
              data-testid="button-apply-ai-rooms"
            >
              Apply to property
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function draftRoomsToPayload(rooms: DraftRoom[]) {
  return rooms
    .filter((r) => r.categoryId && r.name.trim())
    .map((r, idx) => ({
      id: r.id,
      categoryId: r.categoryId,
      name: r.name.trim(),
      widthMm: r.widthMm,
      lengthMm: r.lengthMm,
      ceilingHeightMm: r.ceilingHeightMm,
      sortOrder: idx,
      source: r.source,
      aiConfidence: r.aiConfidence ?? null,
    }));
}

export function roomsFromApi(
  rows: Array<{
    id: string;
    categoryId: string;
    name: string;
    widthMm?: number | null;
    lengthMm?: number | null;
    ceilingHeightMm?: number | null;
    source?: string;
    aiConfidence?: string | null;
  }>,
): DraftRoom[] {
  return rows.map((r) => ({
    clientKey: r.id,
    id: r.id,
    categoryId: r.categoryId,
    name: r.name,
    widthMm: r.widthMm ?? null,
    lengthMm: r.lengthMm ?? null,
    ceilingHeightMm: r.ceilingHeightMm ?? null,
    source: r.source === "ai" ? "ai" : "manual",
    aiConfidence:
      r.aiConfidence === "high" || r.aiConfidence === "medium" || r.aiConfidence === "low"
        ? r.aiConfidence
        : null,
  }));
}
