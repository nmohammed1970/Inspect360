import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagFilter } from "@/components/TagFilter";
import type { Tag } from "@shared/schema";
import { Plus, Building2, MapPin, Search, Package, ClipboardCheck, Users, FileText, ArrowLeft, Pencil, Tag as TagIcon, Filter, X, Trash2, Banknote } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link, useSearch } from "wouter";
import { ClearFiltersButton } from "@/components/ClearFiltersButton";
import { FiltersSection } from "@/components/FiltersSection";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { CardQuickActions } from "@/components/CardQuickActions";
import type { CardQuickAction } from "@/components/CardQuickActions";
import { PropertyFormDialog } from "@/components/PropertyFormDialog";
import { PageHeader } from "@/components/PageHeader";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { pagePad, cardGrid } from "@/lib/responsive";
import { useCompanyModules } from "@/hooks/useCompanyModules";

function isActiveTenantAssignment(ta: any): boolean {
  const nested = ta.assignment;
  const raw =
    nested?.isActive !== undefined && nested?.isActive !== null
      ? nested.isActive
      : ta.isActive !== undefined && ta.isActive !== null
        ? ta.isActive
        : ta.is_active;
  if (raw === false || raw === 0 || raw === "false" || raw === "f") return false;
  if (raw === true || raw === 1 || raw === "true" || raw === "t") return true;
  if (raw === null || raw === undefined) return true;
  return ta.status === "active" || ta.status === "current";
}

function isPendingInspection(insp: { status?: string | null }): boolean {
  return insp.status === "scheduled" || insp.status === "in_progress";
}

function getPropertyDeleteBlockReason(
  propertyId: string,
  tenantAssignments: any[],
  inspections: any[],
): string | null {
  const activeTenants = tenantAssignments.filter(
    (ta) => ta.propertyId === propertyId && isActiveTenantAssignment(ta),
  ).length;
  const pendingInspections = inspections.filter(
    (insp) => insp.propertyId === propertyId && isPendingInspection(insp),
  ).length;

  const reasons: string[] = [];
  if (activeTenants > 0) {
    reasons.push(`${activeTenants} active tenant${activeTenants === 1 ? "" : "s"}`);
  }
  if (pendingInspections > 0) {
    reasons.push(`${pendingInspections} pending inspection${pendingInspections === 1 ? "" : "s"}`);
  }
  if (reasons.length === 0) return null;
  return `This property is in use (${reasons.join(", ")}). Remove linked items before deleting.`;
}

export default function Properties() {
  const { toast } = useToast();
  const searchParams = useSearch();
  const urlBlockId = new URLSearchParams(searchParams).get("blockId");
  const { rentalsEnabled, tenanciesEnabled, complianceEnabled } = useCompanyModules();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTags, setFilterTags] = useState<Tag[]>([]);
  const [propertyToDelete, setPropertyToDelete] = useState<any | null>(null);

  const { data: properties = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/properties"],
  });

  const { data: blocks = [] } = useQuery<any[]>({
    queryKey: ["/api/blocks"],
  });

  const { data: tenantAssignments = [] } = useQuery<any[]>({
    queryKey: ["/api/tenant-assignments"],
  });

  const { data: inspections = [] } = useQuery<any[]>({
    queryKey: ["/api/inspections/my"],
  });

  // Fetch tags for all properties
  const propertyIds = useMemo(() => properties.map(p => p.id).sort().join(','), [properties]);
  const { data: propertyTagsMap = {} } = useQuery<Record<string, Tag[]>>({
    queryKey: ["/api/properties/tags", propertyIds],
    enabled: properties.length > 0,
    queryFn: async () => {
      const tagPromises = properties.map(async (property: any) => {
        try {
          const res = await fetch(`/api/properties/${property.id}/tags`, { credentials: "include" });
          if (res.ok) {
            const tags = await res.json();
            return { propertyId: property.id, tags };
          }
        } catch (error) {
          console.error(`Error fetching tags for property ${property.id}:`, error);
        }
        return { propertyId: property.id, tags: [] };
      });
      
      const results = await Promise.all(tagPromises);
      return results.reduce((acc, { propertyId, tags }) => {
        acc[propertyId] = tags;
        return acc;
      }, {} as Record<string, Tag[]>);
    },
  });

  // Merge tags into properties
  const propertiesWithTags = useMemo(() => {
    return properties.map(property => ({
      ...property,
      tags: propertyTagsMap[property.id] || [],
    }));
  }, [properties, propertyTagsMap]);

  // Fetch block details if filtering by block
  const { data: selectedBlock } = useQuery<any>({
    queryKey: ["/api/blocks", urlBlockId],
    enabled: !!urlBlockId,
  });

  // Filter properties by block (from URL), search query, and tags
  const filteredProperties = useMemo(() => {
    let filtered = propertiesWithTags;
    
    // First filter by blockId from URL if present
    if (urlBlockId) {
      filtered = filtered.filter(property => property.blockId === urlBlockId);
    }
    
    // Then apply search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(property => 
        property.name.toLowerCase().includes(query) ||
        property.address.toLowerCase().includes(query)
      );
    }

    // Filter by tags (show properties that have ALL selected tags)
    if (filterTags.length > 0) {
      filtered = filtered.filter(property => {
        if (!property.tags || property.tags.length === 0) return false;
        return filterTags.every(filterTag =>
          property.tags!.some((propertyTag: Tag) => propertyTag.id === filterTag.id)
        );
      });
    }
    
    return filtered;
  }, [propertiesWithTags, urlBlockId, searchQuery, filterTags]);

  const deleteProperty = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/properties/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/properties/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      toast({ title: "Property deleted successfully" });
      setPropertyToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Cannot delete property",
        description: error.message || "Failed to delete property",
        variant: "destructive",
      });
    },
  });

  const handleOpenCreate = () => {
    setEditingProperty(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (property: any) => {
    setEditingProperty(property);
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className={cn("container mx-auto min-w-0", pagePad)}>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className={cn("container mx-auto min-w-0 space-y-4 md:space-y-6", pagePad)}>
      <PageHeader
        leading={
          urlBlockId && selectedBlock ? (
            <Link href={`/blocks/${urlBlockId}`}>
              <Button variant="ghost" size="sm" data-testid="button-back-to-block">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to {selectedBlock.name}
              </Button>
            </Link>
          ) : undefined
        }
        title={urlBlockId && selectedBlock ? `${selectedBlock.name} - Properties` : "Properties"}
        description={
          urlBlockId && selectedBlock
            ? `Properties in ${selectedBlock.name}`
            : "Manage your building portfolio"
        }
        actions={
          <Button
            variant="brand"
            data-testid="button-create-property"
            onClick={handleOpenCreate}
          >
            <Plus className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Add Property</span>
            <span className="sm:hidden">Add</span>
          </Button>
        }
      />

      <PropertyFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingProperty(null);
        }}
        property={editingProperty}
        defaultBlockId={urlBlockId}
      />

      {properties.length > 0 && (
        <FiltersSection headingId="properties-filters-heading">
          <div className="hidden md:flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-0 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search properties by name or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-8"
                data-testid="input-search-properties"
              />
            </div>
            <TagFilter
              selectedTags={filterTags}
              onTagsChange={setFilterTags}
              placeholder="Filter by tags..."
            />
          </div>

          <div className="flex md:hidden gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search properties..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-8"
                data-testid="input-search-properties-mobile"
              />
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="relative shrink-0 h-8">
                  <Filter className="w-4 h-4 mr-2" />
                  Filters
                  {filterTags.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                  <SheetDescription>
                    Filter properties by tags
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-4 mt-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tags</label>
                    <TagFilter
                      selectedTags={filterTags}
                      onTagsChange={setFilterTags}
                      placeholder="Filter by tags..."
                    />
                  </div>

                  {filterTags.length > 0 && (
                    <ClearFiltersButton
                      className="w-full"
                      onClick={() => setFilterTags([])}
                    />
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </FiltersSection>
      )}

      {properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="w-16 h-16 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No properties yet</p>
            <p className="text-muted-foreground mb-4">Get started by adding your first property</p>
          </CardContent>
        </Card>
      ) : filteredProperties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Search className="w-16 h-16 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No properties found</p>
            <p className="text-muted-foreground mb-4">Try adjusting your search query</p>
            <Button variant="outline" onClick={() => setSearchQuery("")}>
              Clear Search
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className={cardGrid}>
          {filteredProperties.map((property: any) => {
            const propertyBlock = blocks.find((b: any) => b.id === property.blockId);
            return (
              <Card key={property.id} className="hover-elevate flex h-full flex-col" data-testid={`card-property-${property.id}`}>
                <Link href={`/properties/${property.id}`} className="flex flex-1 flex-col min-h-0">
                  <CardHeader className="cursor-pointer">
                    <CardTitle className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="w-5 h-5 text-primary shrink-0" />
                        <span className="truncate">{property.name}</span>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleOpenEdit(property);
                          }}
                          data-testid={`button-edit-property-${property.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {(() => {
                          const deleteBlockedReason = getPropertyDeleteBlockReason(
                            property.id,
                            tenantAssignments,
                            inspections,
                          );
                          const deleteDisabled = !!deleteBlockedReason;
                          return (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className="inline-flex"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }}
                                  >
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8"
                                      disabled={deleteDisabled}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (!deleteDisabled) setPropertyToDelete(property);
                                      }}
                                      data-testid={`button-delete-property-${property.id}`}
                                    >
                                      <Trash2
                                        className={`h-4 w-4 ${deleteDisabled ? "text-muted-foreground" : "text-destructive"}`}
                                      />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                {deleteBlockedReason && (
                                  <TooltipContent className="max-w-xs">
                                    <p>{deleteBlockedReason}</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          );
                        })()}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 cursor-pointer pb-4 flex-1">
                    <p className="text-sm text-muted-foreground">{property.address}</p>
                    {propertyBlock && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {propertyBlock.name}
                      </p>
                    )}
                    {property.tags && property.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {property.tags.map((tag: Tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md"
                            style={{ backgroundColor: tag.color || '#e2e8f0' }}
                            data-testid={`tag-${property.id}-${tag.id}`}
                          >
                            <TagIcon className="h-3 w-3" />
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Link>
                <CardContent className="pt-0 border-t mt-auto">
                  <CardQuickActions
                    className="pt-4"
                    actions={([
                      {
                        id: "inventory",
                        label: "Inventory",
                        icon: Package,
                        href: `/asset-inventory?propertyId=${property.id}`,
                        testId: `button-inventory-${property.id}`,
                      },
                      {
                        id: "inspect",
                        label: "Inspect",
                        icon: ClipboardCheck,
                        href: `/inspections?propertyId=${property.id}&create=true`,
                        testId: `button-inspect-${property.id}`,
                      },
                      tenanciesEnabled && {
                        id: "tenants",
                        label: "Tenants",
                        icon: Users,
                        href: `/properties/${property.id}/tenants`,
                        testId: `button-tenants-${property.id}`,
                      },
                      complianceEnabled && {
                        id: "compliance",
                        label: "Compliance",
                        icon: FileText,
                        href: `/compliance?propertyId=${property.id}`,
                        testId: `button-compliance-${property.id}`,
                      },
                      rentalsEnabled && {
                        id: "rent",
                        label: "Rent",
                        icon: Banknote,
                        href: `/properties/${property.id}?tab=rent-collection`,
                        testId: `button-rent-${property.id}`,
                      },
                    ] as (CardQuickAction | false)[]).filter(Boolean) as CardQuickAction[]}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DeleteConfirmDialog
        open={!!propertyToDelete}
        onOpenChange={(open) => {
          if (!open) setPropertyToDelete(null);
        }}
        title="Delete property?"
        description="This cannot be undone. You are about to delete"
        itemName={propertyToDelete?.name}
        isPending={deleteProperty.isPending}
        onConfirm={() => {
          if (propertyToDelete) deleteProperty.mutate(propertyToDelete.id);
        }}
      />
    </div>
  );
}
