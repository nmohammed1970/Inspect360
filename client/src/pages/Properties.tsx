import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/TagInput";
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
import { Plus, Building2, MapPin, Search, Package, ClipboardCheck, Users, FileText, ArrowLeft, Pencil } from "lucide-react";
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

  const { data: properties = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/properties"],
  });

  const { data: blocks = [] } = useQuery<any[]>({
    queryKey: ["/api/blocks"],
  });

  // Fetch block details if filtering by block
  const { data: selectedBlock } = useQuery<any>({
    queryKey: ["/api/blocks", urlBlockId],
    enabled: !!urlBlockId,
  });

  // Filter properties by block (from URL) and search query
  const filteredProperties = useMemo(() => {
    let filtered = properties;
    
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
    
    return filtered;
  }, [properties, urlBlockId, searchQuery]);

  // Prepopulate form when dialog opens and we have a selected block (only for new properties, not edits)
  useEffect(() => {
    if (dialogOpen && !editingProperty && urlBlockId && selectedBlock) {
      setAddress(selectedBlock.address || "");
      setBlockId(urlBlockId);
    }
  }, [dialogOpen, editingProperty, urlBlockId, selectedBlock]);

  const createProperty = useMutation({
    mutationFn: async (data: { name: string; address: string; blockId?: string }) => {
      return await apiRequest("POST", "/api/properties", data);
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/properties"] });
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
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/properties"] });
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
    setDialogOpen(true);
  };

  const handleOpenEdit = (property: any) => {
    setEditingProperty(property);
    setName(property.name);
    setAddress(property.address);
    setBlockId(property.blockId || undefined);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingProperty(null);
    setName("");
    setAddress("");
    setBlockId(undefined);
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
    // Don't send blockId if "none" or undefined
    const finalBlockId = blockId === "none" ? undefined : blockId;
    
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
            <Button className="bg-accent" data-testid="button-create-property" onClick={handleOpenCreate}>
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
                <Textarea
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
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

      {/* Search Filter */}
      {properties.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search properties by name or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-properties"
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
