import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/TagInput";
import { TagFilter } from "@/components/TagFilter";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Building2, MapPin, Search, Package, ClipboardCheck, Users, FileText, ArrowLeft, Pencil, Tag as TagIcon } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link, useSearch } from "wouter";

export default function Properties() {
  const { toast } = useToast();
  const searchParams = useSearch();
  const urlBlockId = new URLSearchParams(searchParams).get("blockId");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [blockId, setBlockId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTags, setFilterTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);

  const { data: properties = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/properties"],
  });

  const { data: blocks = [] } = useQuery<any[]>({
    queryKey: ["/api/blocks"],
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

  // Prepopulate form when dialog opens and we have a selected block (only for new properties, not edits)
  useEffect(() => {
    if (dialogOpen && !editingProperty && urlBlockId && selectedBlock) {
      setAddress(selectedBlock.address || "");
      setBlockId(urlBlockId);
    }
  }, [dialogOpen, editingProperty, urlBlockId, selectedBlock]);

  const createProperty = useMutation({
    mutationFn: async (data: { name: string; address: string; blockId?: string }) => {
      const res = await apiRequest("POST", "/api/properties", data);
      return await res.json();
    },
    onSuccess: async (property: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/properties/tags"] });
      
      // Update tags for the newly created property
      if (selectedTags.length > 0 && property?.id) {
        await updatePropertyTags(property.id, selectedTags);
      }
      
      toast({
        title: "Success",
        description: "Property created successfully",
      });
      handleCloseDialog();
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
    mutationFn: async (data: { id: string; name: string; address: string; blockId?: string }) => {
      return await apiRequest("PATCH", `/api/properties/${data.id}`, {
        name: data.name,
        address: data.address,
        blockId: data.blockId,
      });
    },
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/properties/tags"] });
      
      // Update tags for the property (always update, even if empty, to handle removals)
      await updatePropertyTags(variables.id, selectedTags);
      
      toast({
        title: "Success",
        description: "Property updated successfully",
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update property",
        variant: "destructive",
      });
    },
  });

  const handleOpenCreate = () => {
    setEditingProperty(null);
    setName("");
    setAddress("");
    setBlockId(urlBlockId || undefined);
    setSelectedTags([]);
    setDialogOpen(true);
  };

  const handleOpenEdit = async (property: any) => {
    setEditingProperty(property);
    setName(property.name);
    setAddress(property.address);
    setBlockId(property.blockId || undefined);
    
    // Fetch tags for this property
    try {
      const res = await fetch(`/api/properties/${property.id}/tags`, { credentials: "include" });
      if (res.ok) {
        const tags = await res.json();
        setSelectedTags(tags);
      }
    } catch (error) {
      console.error("Error fetching property tags:", error);
    }
    
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingProperty(null);
    setName("");
    setAddress("");
    setBlockId(undefined);
    setSelectedTags([]);
  };

  const updatePropertyTags = async (propertyId: string, tags: Tag[]) => {
    // Get current tags for the property
    try {
      const res = await fetch(`/api/properties/${propertyId}/tags`, { credentials: "include" });
      const currentTags = res.ok ? await res.json() : [];
      
      // Remove tags that are no longer selected
      for (const currentTag of currentTags) {
        if (!tags.find(t => t.id === currentTag.id)) {
          await apiRequest("DELETE", `/api/properties/${propertyId}/tags/${currentTag.id}`);
        }
      }
      
      // Add new tags
      for (const tag of tags) {
        if (!currentTags.find((t: Tag) => t.id === tag.id)) {
          await apiRequest("POST", `/api/properties/${propertyId}/tags/${tag.id}`);
        }
      }
    } catch (error) {
      console.error("Error updating property tags:", error);
    }
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
    // Convert "none" to null to explicitly remove block assignment, undefined means don't change
    const finalBlockId = blockId === "none" ? null : (blockId || undefined);
    
    if (editingProperty) {
      updateProperty.mutate({ id: editingProperty.id, name, address, blockId: finalBlockId });
    } else {
      createProperty.mutate({ name, address, blockId: finalBlockId });
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {urlBlockId && selectedBlock && (
        <Link href={`/blocks/${urlBlockId}`}>
          <Button variant="ghost" className="mb-4" data-testid="button-back-to-block">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to {selectedBlock.name}
          </Button>
        </Link>
      )}
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {urlBlockId && selectedBlock ? `${selectedBlock.name} - Properties` : "Properties"}
          </h1>
          <p className="text-muted-foreground">
            {urlBlockId && selectedBlock 
              ? `Properties in ${selectedBlock.name}` 
              : "Manage your building portfolio"
            }
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: '#00D2BD' }} className="hover:opacity-90" data-testid="button-create-property" onClick={handleOpenCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Add Property
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingProperty ? "Edit Property" : "Create New Property"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Property Name *</Label>
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
                <Label htmlFor="address">Address *</Label>
                <AddressInput
                  id="address"
                  value={address}
                  onChange={setAddress}
                  placeholder="123 Main St, City, State ZIP"
                  data-testid="input-property-address"
                  required
                />
              </div>
              <div>
                <Label htmlFor="block">Block (Optional)</Label>
                <Select value={blockId} onValueChange={setBlockId}>
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
                  Assign this property to a building/block for better organization
                </p>
              </div>
              
              <div className="space-y-2">
                <Label>Tags</Label>
                <TagInput
                  selectedTags={selectedTags}
                  onTagsChange={setSelectedTags}
                  placeholder="Add tags to organize this property..."
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={createProperty.isPending || updateProperty.isPending}
                data-testid="button-submit-property"
              >
                {editingProperty 
                  ? (updateProperty.isPending ? "Updating..." : "Update Property")
                  : (createProperty.isPending ? "Creating..." : "Create Property")
                }
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Tag Filter */}
      {properties.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search properties by name or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-properties"
            />
          </div>
          <TagFilter
            selectedTags={filterTags}
            onTagsChange={setFilterTags}
            placeholder="Filter by tags..."
          />
        </div>
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProperties.map((property: any) => {
            const propertyBlock = blocks.find((b: any) => b.id === property.blockId);
            return (
              <Card key={property.id} className="hover-elevate" data-testid={`card-property-${property.id}`}>
                <Link href={`/properties/${property.id}`}>
                  <CardHeader className="cursor-pointer">
                    <CardTitle className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-primary" />
                        {property.name}
                      </div>
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
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 cursor-pointer pb-4">
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
                <CardContent className="pt-0 border-t">
                  <div className="flex items-center justify-around pt-4">
                    <Link href={`/asset-inventory?propertyId=${property.id}`}>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="flex flex-col h-auto py-2 px-3"
                        data-testid={`button-inventory-${property.id}`}
                      >
                        <Package className="h-4 w-4 mb-1" />
                        <span className="text-xs">Inventory</span>
                      </Button>
                    </Link>
                    <Link href={`/inspections?propertyId=${property.id}&create=true`}>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="flex flex-col h-auto py-2 px-3"
                        data-testid={`button-inspect-${property.id}`}
                      >
                        <ClipboardCheck className="h-4 w-4 mb-1" />
                        <span className="text-xs">Inspect</span>
                      </Button>
                    </Link>
                    <Link href={`/properties/${property.id}/tenants`}>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="flex flex-col h-auto py-2 px-3"
                        data-testid={`button-tenants-${property.id}`}
                      >
                        <Users className="h-4 w-4 mb-1" />
                        <span className="text-xs">Tenants</span>
                      </Button>
                    </Link>
                    <Link href={`/compliance?propertyId=${property.id}`}>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="flex flex-col h-auto py-2 px-3"
                        data-testid={`button-compliance-${property.id}`}
                      >
                        <FileText className="h-4 w-4 mb-1" />
                        <span className="text-xs">Compliance</span>
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
