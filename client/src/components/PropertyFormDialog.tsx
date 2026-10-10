import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/TagInput";
import { AddressInput } from "@/components/AddressInput";
import type { Tag } from "@shared/schema";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  PropertyLayoutFields,
  attachFloorPlanToProperty,
  type PropertyLayoutValue,
} from "@/components/PropertyLayoutFields";
import { cn } from "@/lib/utils";

const PROPERTY_TYPE_NONE = "__property_type_none__";

const PROPERTY_TYPES = [
  { value: "apartment", label: "Apartment" },
  { value: "house", label: "House" },
  { value: "studio", label: "Studio" },
  { value: "townhouse", label: "Townhouse" },
  { value: "flat", label: "Flat" },
  { value: "maisonette", label: "Maisonette" },
  { value: "bungalow", label: "Bungalow" },
  { value: "detached", label: "Detached" },
  { value: "semi-detached", label: "Semi-Detached" },
  { value: "terraced", label: "Terraced" },
  { value: "penthouse", label: "Penthouse" },
  { value: "duplex", label: "Duplex" },
  { value: "commercial", label: "Commercial" },
  { value: "other", label: "Other" },
] as const;

const propertyTypeValues = new Set(PROPERTY_TYPES.map((t) => t.value));

function normalizePropertyType(value?: string | null): string | undefined {
  if (value == null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  if (propertyTypeValues.has(lower)) return lower;
  const slug = lower.replace(/[\s_]+/g, "-");
  if (propertyTypeValues.has(slug)) return slug;
  const compact = lower.replace(/[\s_-]+/g, "");
  for (const v of propertyTypeValues) {
    if (v.replace(/-/g, "") === compact) return v;
  }
  return undefined;
}

function defaultLayout(): PropertyLayoutValue {
  return {
    bedrooms: 1,
    kitchens: 1,
    bathrooms: 1,
    livingRooms: 1,
    floorPlanUrl: null,
    floorPlanMimeType: null,
    floorPlanFileName: null,
    floorPlanAnalysisStatus: "none",
    floorPlanAnalysisJson: null,
  };
}

export type PropertyFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, dialog opens in edit mode for this property. */
  property?: { id: string } | null;
  /** Prefill block (and address) when creating. */
  defaultBlockId?: string | null;
  onSuccess?: (propertyId?: string) => void;
};

export function PropertyFormDialog({
  open,
  onOpenChange,
  property = null,
  defaultBlockId = null,
  onSuccess,
}: PropertyFormDialogProps) {
  const { toast } = useToast();
  const [editingProperty, setEditingProperty] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState<string | undefined>();
  const [propertyTypeExtra, setPropertyTypeExtra] = useState<{ value: string; label: string } | null>(null);
  const [blockId, setBlockId] = useState<string | undefined>();
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [layout, setLayout] = useState<PropertyLayoutValue>(defaultLayout());
  const [isHydrating, setIsHydrating] = useState(false);

  const { data: blocks = [] } = useQuery<any[]>({
    queryKey: ["/api/blocks"],
    enabled: open,
  });

  const resetForm = () => {
    setEditingProperty(null);
    setName("");
    setAddress("");
    setPropertyType(undefined);
    setPropertyTypeExtra(null);
    setBlockId(undefined);
    setSelectedTags([]);
    setLayout(defaultLayout());
  };

  const updatePropertyTags = async (propertyId: string, tags: Tag[]) => {
    try {
      const res = await fetch(`/api/properties/${propertyId}/tags`, { credentials: "include" });
      const currentTags = res.ok ? await res.json() : [];

      for (const currentTag of currentTags) {
        if (!tags.find((t) => t.id === currentTag.id)) {
          await apiRequest("DELETE", `/api/properties/${propertyId}/tags/${currentTag.id}`);
        }
      }

      for (const tag of tags) {
        if (!currentTags.find((t: Tag) => t.id === tag.id)) {
          await apiRequest("POST", `/api/properties/${propertyId}/tags/${tag.id}`);
        }
      }

      queryClient.setQueriesData<Record<string, Tag[]>>(
        { queryKey: ["/api/properties/tags"] },
        (old) => ({
          ...(old || {}),
          [propertyId]: tags,
        }),
      );
    } catch (error) {
      console.error("Error updating property tags:", error);
    }
  };

  const createProperty = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/properties", data);
      const created = await res.json();
      if (selectedTags.length > 0 && created?.id) {
        await updatePropertyTags(created.id, selectedTags);
      }
      if (created?.id && layout.floorPlanUrl) {
        try {
          await attachFloorPlanToProperty({
            propertyId: created.id,
            documentUrl: layout.floorPlanUrl,
            mimeType: layout.floorPlanMimeType,
            fileName: layout.floorPlanFileName,
          });
          await apiRequest("PATCH", `/api/properties/${created.id}`, {
            bedrooms: layout.bedrooms,
            kitchens: layout.kitchens,
            bathrooms: layout.bathrooms,
            livingRooms: layout.livingRooms,
          });
        } catch {
          /* create body may already include floor plan URL / counts */
        }
      }
      return created;
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/properties/tags"] });
      toast({
        title: "Property created",
        description: "Property created successfully",
      });
      onOpenChange(false);
      resetForm();
      onSuccess?.(created?.id);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create property",
        variant: "destructive",
      });
    },
  });

  const updateProperty = useMutation({
    mutationFn: async (data: {
      id: string;
      name: string;
      address: string;
      propertyType?: string | null;
      blockId?: string | null;
      layout?: PropertyLayoutValue;
    }) => {
      const body: Record<string, unknown> = {
        name: data.name,
        address: data.address,
        blockId: data.blockId,
      };
      if (data.propertyType !== undefined) {
        body.propertyType = data.propertyType;
      }
      if (data.layout) {
        body.bedrooms = data.layout.bedrooms;
        body.kitchens = data.layout.kitchens;
        body.bathrooms = data.layout.bathrooms;
        body.livingRooms = data.layout.livingRooms;
      }
      return await apiRequest("PATCH", `/api/properties/${data.id}`, body);
    },
    onSuccess: async (_, variables) => {
      await updatePropertyTags(variables.id, selectedTags);
      await queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/properties", variables.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/properties/tags"] });
      toast({
        title: "Success",
        description: "Property updated successfully",
      });
      onOpenChange(false);
      resetForm();
      onSuccess?.(variables.id);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update property",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const hydrate = async () => {
      setIsHydrating(true);
      try {
        if (property?.id) {
          let propertyData: any = property;
          try {
            const propertyRes = await fetch(`/api/properties/${property.id}?_t=${Date.now()}`, {
              credentials: "include",
              cache: "no-store",
            });
            if (propertyRes.ok) {
              propertyData = await propertyRes.json();
            }
          } catch (error) {
            console.error("Error fetching latest property details:", error);
          }
          if (cancelled) return;

          const rawType = propertyData.propertyType ?? propertyData.property_type ?? null;
          const normalized = normalizePropertyType(rawType);
          const rawTrimmed =
            rawType != null && String(rawType).trim() !== "" ? String(rawType).trim() : null;

          setEditingProperty(propertyData);
          setName(propertyData.name || "");
          setAddress(propertyData.address || "");
          if (normalized) {
            setPropertyType(normalized);
            setPropertyTypeExtra(null);
          } else if (rawTrimmed) {
            const slug = rawTrimmed.toLowerCase().replace(/[\s_]+/g, "-");
            if (propertyTypeValues.has(slug)) {
              setPropertyType(slug);
              setPropertyTypeExtra(null);
            } else {
              setPropertyType(slug);
              setPropertyTypeExtra({ value: slug, label: rawTrimmed });
            }
          } else {
            setPropertyType(undefined);
            setPropertyTypeExtra(null);
          }
          setBlockId(propertyData.blockId || undefined);
          setLayout({
            bedrooms: propertyData.bedrooms ?? 1,
            kitchens: propertyData.kitchens ?? 1,
            bathrooms: propertyData.bathrooms ?? 1,
            livingRooms: propertyData.livingRooms ?? 1,
            floorPlanUrl: propertyData.floorPlanUrl ?? null,
            floorPlanMimeType: propertyData.floorPlanMimeType ?? null,
            floorPlanFileName: propertyData.floorPlanFileName ?? null,
            floorPlanAnalysisStatus: propertyData.floorPlanAnalysisStatus ?? "none",
            floorPlanAnalysisJson: propertyData.floorPlanAnalysisJson ?? null,
          });

          try {
            const res = await fetch(`/api/properties/${property.id}/tags`, { credentials: "include" });
            if (res.ok) {
              const tags = await res.json();
              if (!cancelled) setSelectedTags(tags);
            } else if (!cancelled) {
              setSelectedTags([]);
            }
          } catch (error) {
            console.error("Error fetching property tags:", error);
            if (!cancelled) setSelectedTags([]);
          }
        } else {
          resetForm();
          const initialBlockId = defaultBlockId || undefined;
          setBlockId(initialBlockId);
          if (initialBlockId) {
            const blockFromUrl = blocks.find((b: any) => b.id === initialBlockId);
            setAddress(blockFromUrl?.address || "");
          }
        }
      } finally {
        if (!cancelled) setIsHydrating(false);
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
    // Re-hydrate when dialog opens or target property changes
    // eslint-disable-next-line react-hooks/exhaustive-deps -- blocks used only for create prefill; avoid reset loops
  }, [open, property?.id, defaultBlockId]);

  useEffect(() => {
    if (!open || editingProperty || !defaultBlockId || address) return;
    const selected = blocks.find((b: any) => b.id === defaultBlockId);
    if (selected?.address) {
      setAddress(selected.address);
      setBlockId(defaultBlockId);
    }
  }, [open, editingProperty, defaultBlockId, blocks, address]);

  const handleClose = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) resetForm();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !address) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const finalBlockId = blockId === "none" ? null : blockId || undefined;
    const noneOrUnset = propertyType === undefined;

    if (editingProperty) {
      const forApi = noneOrUnset
        ? null
        : normalizePropertyType(propertyType) ?? propertyType ?? null;
      updateProperty.mutate({
        id: editingProperty.id,
        name,
        address,
        propertyType: forApi,
        blockId: finalBlockId,
        layout,
      });
    } else {
      const forApi = noneOrUnset
        ? undefined
        : normalizePropertyType(propertyType) ?? propertyType;
      createProperty.mutate({
        name,
        address,
        propertyType: forApi,
        blockId: finalBlockId,
        bedrooms: layout.bedrooms,
        kitchens: layout.kitchens,
        bathrooms: layout.bathrooms,
        livingRooms: layout.livingRooms,
        floorPlanUrl: layout.floorPlanUrl || undefined,
        floorPlanMimeType: layout.floorPlanMimeType || undefined,
        floorPlanFileName: layout.floorPlanFileName || undefined,
      });
    }
  };

  const isPending = createProperty.isPending || updateProperty.isPending || isHydrating;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "!flex !flex-col !overflow-hidden max-w-xl w-full max-h-[min(90vh,calc(100dvh-2rem))] gap-4",
        )}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{editingProperty ? "Edit Property" : "Create New Property"}</DialogTitle>
        </DialogHeader>
        <form
          id="property-form"
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 pr-1"
        >
          <div>
            <Label htmlFor="name" required>
              Property Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Flat 12, Unit 5B"
              data-testid="input-property-name"
              required
            />
          </div>
          <div>
            <Label htmlFor="block">Block (Optional)</Label>
            <Select
              value={blockId}
              onValueChange={(value) => {
                setBlockId(value);
                if (value && value !== "none") {
                  const selected = blocks.find((b: any) => b.id === value);
                  if (selected?.address) {
                    setAddress(selected.address);
                  }
                }
              }}
            >
              <SelectTrigger data-testid="select-block">
                <SelectValue placeholder="Select a block" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Block</SelectItem>
                {blocks.map((block: any) => (
                  <SelectItem key={block.id} value={block.id}>
                    {block.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              Assign this property to a building/block for better organization. Selecting a block fills the address.
            </p>
          </div>
          <div>
            <Label htmlFor="address" required>
              Address
            </Label>
            <AddressInput
              id="address"
              value={address}
              onChange={setAddress}
              placeholder="Start typing to search..."
              data-testid="input-property-address"
              required
            />
          </div>

          <div className="border-t pt-4">
            <PropertyLayoutFields
              value={layout}
              onChange={setLayout}
              propertyId={editingProperty?.id || null}
            />
          </div>

          <div>
            <Label htmlFor="propertyType">Property Type</Label>
            <Select
              value={propertyType ?? PROPERTY_TYPE_NONE}
              onValueChange={(v) => {
                if (v === PROPERTY_TYPE_NONE) {
                  setPropertyType(undefined);
                  setPropertyTypeExtra(null);
                  return;
                }
                setPropertyType(v);
                setPropertyTypeExtra(null);
              }}
            >
              <SelectTrigger data-testid="select-property-type">
                <SelectValue placeholder="Select property type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PROPERTY_TYPE_NONE}>Select property type</SelectItem>
                {propertyTypeExtra && (
                  <SelectItem value={propertyTypeExtra.value}>
                    {propertyTypeExtra.label} (saved)
                  </SelectItem>
                )}
                {PROPERTY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pb-1">
            <Label>Tags</Label>
            <TagInput
              selectedTags={selectedTags}
              onTagsChange={setSelectedTags}
              placeholder="Add tags to organize this property..."
            />
          </div>
        </form>
        <Button
          type="submit"
          form="property-form"
          className="w-full shrink-0"
          disabled={isPending}
          data-testid="button-submit-property"
        >
          {editingProperty
            ? updateProperty.isPending
              ? "Updating..."
              : "Update Property"
            : createProperty.isPending
              ? "Creating..."
              : "Create Property"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
