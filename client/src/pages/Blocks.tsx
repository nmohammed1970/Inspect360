import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building, Pencil, Trash2, Users, CheckCircle2, Calendar, AlertTriangle, Search, Package, ClipboardCheck, FileText, Home, Wrench } from "lucide-react";
import { QuickAddMaintenanceSheet } from "@/components/QuickAddMaintenanceSheet";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { TagInput } from "@/components/TagInput";
import { TagFilter } from "@/components/TagFilter";
import { AddressInput } from "@/components/AddressInput";
import type { Tag } from "@shared/schema";
import { Tag as TagIcon } from "lucide-react";

interface BlockStats {
  totalProperties: number;
  totalUnits: number;
  occupiedUnits: number;
  occupancyRate: number;
  complianceRate: number;
  inspectionsDue: number;
  overdueInspections: number;
}

interface Block {
  id: string;
  organizationId: string;
  name: string;
  address: string;
  notes?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  stats?: BlockStats;
  tags?: Tag[];
}

export default function Blocks() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [filterTags, setFilterTags] = useState<Tag[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [maintenanceBlockId, setMaintenanceBlockId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: blocks = [], isLoading } = useQuery<Block[]>({
    queryKey: ["/api/blocks"],
  });

  // Fetch tags for all blocks
  const blockIds = useMemo(() => blocks.map(b => b.id).sort().join(','), [blocks]);
  const { data: blockTagsMap = {} } = useQuery<Record<string, Tag[]>>({
    queryKey: ["/api/blocks/tags", blockIds],
    enabled: blocks.length > 0,
    queryFn: async () => {
      const tagPromises = blocks.map(async (block) => {
        try {
          const res = await fetch(`/api/blocks/${block.id}/tags`, { credentials: "include" });
          if (res.ok) {
            const tags = await res.json();
            return { blockId: block.id, tags };
          }
        } catch (error) {
          console.error(`Error fetching tags for block ${block.id}:`, error);
        }
        return { blockId: block.id, tags: [] };
      });
      
      const results = await Promise.all(tagPromises);
      return results.reduce((acc, { blockId, tags }) => {
        acc[blockId] = tags;
        return acc;
      }, {} as Record<string, Tag[]>);
    },
  });

  // Merge tags into blocks
  const blocksWithTags = useMemo(() => {
    return blocks.map(block => ({
      ...block,
      tags: blockTagsMap[block.id] || [],
    }));
  }, [blocks, blockTagsMap]);

  // Filter blocks by search query and tags
  const filteredBlocks = useMemo(() => {
    let filtered = blocksWithTags;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(block => 
        block.name.toLowerCase().includes(query) ||
        block.address.toLowerCase().includes(query)
      );
    }

    // Filter by tags (show blocks that have ALL selected tags)
    if (filterTags.length > 0) {
      filtered = filtered.filter(block => {
        if (!block.tags || block.tags.length === 0) return false;
        return filterTags.every(filterTag =>
          block.tags!.some(blockTag => blockTag.id === filterTag.id)
        );
      });
    }

    return filtered;
  }, [blocksWithTags, searchQuery, filterTags]);

  const createBlockMutation = useMutation({
    mutationFn: async (data: { name: string; address: string; notes?: string }) => {
      const res = await apiRequest("POST", "/api/blocks", data);
      return await res.json();
    },
    onSuccess: async (newBlock) => {
      // Add tags to the new block if any are selected
      if (selectedTags.length > 0) {
        await updateBlockTags(newBlock.id, selectedTags);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks/tags"] });
      toast({ title: "Block created successfully" });
      handleCloseDialog();
    },
    onError: (error: any) => {
      console.error("Block creation error:", error);
      const message = error?.message || "Failed to create block";
      toast({ title: message, variant: "destructive" });
    },
  });

  const updateBlockMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; address: string; notes?: string }) => {
      return apiRequest("PATCH", `/api/blocks/${data.id}`, { 
        name: data.name, 
        address: data.address, 
        notes: data.notes 
      });
    },
    onSuccess: async (_, variables) => {
      // Update tags for the block
      await updateBlockTags(variables.id, selectedTags);
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks/tags"] });
      toast({ title: "Block updated successfully" });
      handleCloseDialog();
    },
    onError: () => {
      toast({ title: "Failed to update block", variant: "destructive" });
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/blocks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks/tags"] });
      toast({ title: "Block deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete block", variant: "destructive" });
    },
  });

  const handleOpenCreate = () => {
    setEditingBlock(null);
    setName("");
    setAddress("");
    setNotes("");
    setSelectedTags([]);
    setIsCreateOpen(true);
  };

  const handleOpenEdit = async (block: Block) => {
    setEditingBlock(block);
    setName(block.name);
    setAddress(block.address);
    setNotes(block.notes || "");
    
    // Fetch tags for this block
    try {
      const res = await fetch(`/api/blocks/${block.id}/tags`, { credentials: "include" });
      if (res.ok) {
        const tags = await res.json();
        setSelectedTags(tags);
      }
    } catch (error) {
      console.error("Error fetching block tags:", error);
    }
    
    setIsCreateOpen(true);
  };

  const handleCloseDialog = () => {
    setIsCreateOpen(false);
    setEditingBlock(null);
    setName("");
    setAddress("");
    setNotes("");
    setSelectedTags([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !address) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (editingBlock) {
      updateBlockMutation.mutate({
        id: editingBlock.id,
        name,
        address,
        notes: notes || undefined
      });
    } else {
      createBlockMutation.mutate({
        name,
        address,
        notes: notes || undefined
      });
    }
  };

  const updateBlockTags = async (blockId: string, tags: Tag[]) => {
    // Get current tags for the block
    try {
      const res = await fetch(`/api/blocks/${blockId}/tags`, { credentials: "include" });
      const currentTags = res.ok ? await res.json() : [];
      
      // Remove tags that are no longer selected
      for (const currentTag of currentTags) {
        if (!tags.find(t => t.id === currentTag.id)) {
          await apiRequest("DELETE", `/api/blocks/${blockId}/tags/${currentTag.id}`);
        }
      }
      
      // Add new tags
      for (const tag of tags) {
        if (!currentTags.find((t: Tag) => t.id === tag.id)) {
          await apiRequest("POST", `/api/blocks/${blockId}/tags/${tag.id}`);
        }
      }
    } catch (error) {
      console.error("Error updating block tags:", error);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this block? This cannot be undone.")) {
      deleteBlockMutation.mutate(id);
    }
  };

  return (
    <div className="container mx-auto p-6 md:p-8 lg:p-12 space-y-8">
      {/* Modern Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Blocks & Buildings</h1>
          <p className="text-lg text-muted-foreground">Manage your property complexes and building blocks</p>
        </div>
        <Button onClick={handleOpenCreate} size="lg" className="transition-smooth" data-testid="button-create-block">
          <Plus className="mr-2 h-5 w-5" />
          New Block
        </Button>
      </div>

      {/* Modern Search Filter */}
      {blocks.length > 0 && (
        <div className="space-y-4">
          <div className="max-w-2xl">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
              <Input
                placeholder="Search blocks by name or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 text-base glass-card border-border/50"
                data-testid="input-search-blocks"
              />
            </div>
          </div>
          <TagFilter
            selectedTags={filterTags}
            onTagsChange={setFilterTags}
            placeholder="Filter by tags..."
          />
        </div>
      )}

      {/* Content Area */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground">Loading blocks...</p>
          </div>
        </div>
      ) : blocks.length === 0 ? (
        <Card className="glass-card-strong">
          <CardContent className="flex flex-col items-center justify-center py-16 md:py-24">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Building className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-2xl font-semibold mb-3">No blocks yet</h3>
            <p className="text-muted-foreground text-center mb-6 max-w-md">
              Create your first building block to organize properties and streamline management
            </p>
            <Button onClick={handleOpenCreate} size="lg" className="transition-smooth" data-testid="button-create-first-block">
              <Plus className="mr-2 h-5 w-5" />
              Create Block
            </Button>
          </CardContent>
        </Card>
      ) : filteredBlocks.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No blocks found</h3>
            <p className="text-muted-foreground text-center mb-6">
              Try adjusting your search query
            </p>
            <Button variant="outline" onClick={() => setSearchQuery("")} className="transition-smooth">
              Clear Search
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBlocks.map((block) => (
            <Card key={block.id} data-testid={`card-block-${block.id}`} className="glass-card card-hover-lift overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/blocks/${block.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 cursor-pointer group">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-smooth">
                        <Building className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-xl font-bold truncate">{block.name}</CardTitle>
                    </div>
                    <CardDescription className="line-clamp-2 cursor-pointer mt-3 text-base">{block.address}</CardDescription>
                  </Link>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        setMaintenanceBlockId(block.id);
                      }}
                      className="transition-smooth"
                      data-testid={`button-maintenance-block-${block.id}`}
                      title="Log Maintenance"
                    >
                      <Wrench className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        handleOpenEdit(block);
                      }}
                      className="transition-smooth"
                      data-testid={`button-edit-block-${block.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        handleDelete(block.id);
                      }}
                      className="transition-smooth"
                      data-testid={`button-delete-block-${block.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 pt-0">
                {/* Divider */}
                <div className="h-px bg-border/30" />

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-5">
                  {/* Occupancy */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-chart-3/10 flex items-center justify-center">
                        <Users className="h-4 w-4 text-chart-3" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">Occupancy</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold" data-testid={`badge-occupancy-${block.id}`}>
                        {block.stats?.occupancyRate || 0}%
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {block.stats?.occupiedUnits || 0}/{block.stats?.totalUnits || 0}
                      </span>
                    </div>
                  </div>

                  {/* Compliance */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${(block.stats?.complianceRate || 0) >= 80 ? 'bg-accent/10' : 'bg-destructive/10'}`}>
                        <CheckCircle2 className={`h-4 w-4 ${(block.stats?.complianceRate || 0) >= 80 ? 'text-accent' : 'text-destructive'}`} />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">Compliance</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-2xl font-bold ${(block.stats?.complianceRate || 0) >= 80 ? 'text-accent' : 'text-destructive'}`} data-testid={`badge-compliance-${block.id}`}>
                        {block.stats?.complianceRate || 0}%
                      </span>
                    </div>
                  </div>

                  {/* Due Soon */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Calendar className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">Due Soon</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold" data-testid={`badge-due-${block.id}`}>
                        {block.stats?.inspectionsDue || 0}
                      </span>
                    </div>
                  </div>

                  {/* Overdue */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${(block.stats?.overdueInspections || 0) > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
                        <AlertTriangle className={`h-4 w-4 ${(block.stats?.overdueInspections || 0) > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">Overdue</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-2xl font-bold ${(block.stats?.overdueInspections || 0) > 0 ? 'text-destructive' : ''}`} data-testid={`badge-overdue-${block.id}`}>
                        {block.stats?.overdueInspections || 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {block.notes && (
                  <>
                    <div className="h-px bg-border/30" />
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Notes</span>
                      <p className="text-sm text-foreground line-clamp-2">{block.notes}</p>
                    </div>
                  </>
                )}

                {/* Tags */}
                {block.tags && block.tags.length > 0 && (
                  <>
                    <div className="h-px bg-border/30" />
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-muted-foreground">Tags</span>
                      <div className="flex flex-wrap gap-1.5">
                        {block.tags.map(tag => (
                          <Badge
                            key={tag.id}
                            variant="secondary"
                            className="gap-1 text-xs"
                            style={{ backgroundColor: tag.color || undefined }}
                            data-testid={`tag-${block.id}-${tag.id}`}
                          >
                            <TagIcon className="h-3 w-3" />
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                
                {/* Quick Actions */}
                <div className="h-px bg-border/30" />
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  <Link href={`/properties?blockId=${block.id}`} className="w-full">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex flex-col h-auto py-2 px-0.5 w-full min-w-0"
                      data-testid={`button-properties-${block.id}`}
                    >
                      <Home className="h-4 w-4 mb-1 shrink-0" />
                      <span className="text-[10px] leading-tight text-center w-full">Properties</span>
                    </Button>
                  </Link>
                  <Link href={`/asset-inventory?blockId=${block.id}`} className="w-full">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex flex-col h-auto py-2 px-0.5 w-full min-w-0"
                      data-testid={`button-inventory-${block.id}`}
                    >
                      <Package className="h-4 w-4 mb-1 shrink-0" />
                      <span className="text-[10px] leading-tight text-center w-full">Inventory</span>
                    </Button>
                  </Link>
                  <Link href={`/inspections?blockId=${block.id}&create=true`} className="w-full">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex flex-col h-auto py-2 px-0.5 w-full min-w-0"
                      data-testid={`button-inspect-${block.id}`}
                    >
                      <ClipboardCheck className="h-4 w-4 mb-1 shrink-0" />
                      <span className="text-[10px] leading-tight text-center w-full">Inspect</span>
                    </Button>
                  </Link>
                  <Link href={`/blocks/${block.id}/tenants`} className="w-full">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex flex-col h-auto py-2 px-0.5 w-full min-w-0"
                      data-testid={`button-tenants-${block.id}`}
                    >
                      <Users className="h-4 w-4 mb-1 shrink-0" />
                      <span className="text-[10px] leading-tight text-center w-full">Tenants</span>
                    </Button>
                  </Link>
                  <Link href={`/compliance?blockId=${block.id}`} className="w-full">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex flex-col h-auto py-2 px-0.5 w-full min-w-0"
                      data-testid={`button-compliance-${block.id}`}
                    >
                      <FileText className="h-4 w-4 mb-1 shrink-0" />
                      <span className="text-[10px] leading-tight text-center w-full">Compliance</span>
                    </Button>
                  </Link>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="flex flex-col h-auto py-2 px-0.5 w-full min-w-0"
                    data-testid={`button-maintenance-${block.id}`}
                    onClick={() => setMaintenanceBlockId(block.id)}
                  >
                    <Wrench className="h-4 w-4 mb-1 shrink-0" />
                    <span className="text-[10px] leading-tight text-center w-full">Maint.</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBlock ? "Edit Block" : "Create New Block"}</DialogTitle>
            <DialogDescription>
              {editingBlock ? "Update the block details below" : "Add a new building block to your organization"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Block Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Block A, East Wing, Tower 1"
                data-testid="input-block-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address *</Label>
              <AddressInput
                id="address"
                value={address}
                onChange={setAddress}
                placeholder="123 Main Street, City, Postcode"
                data-testid="input-block-address"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional information about this block"
                rows={3}
                data-testid="input-block-notes"
              />
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <TagInput
                selectedTags={selectedTags}
                onTagsChange={setSelectedTags}
                placeholder="Add tags to organize this block..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleCloseDialog} data-testid="button-cancel">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createBlockMutation.isPending || updateBlockMutation.isPending}
                data-testid="button-submit-block"
              >
                {editingBlock ? "Update" : "Create"} Block
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <QuickAddMaintenanceSheet
        open={!!maintenanceBlockId}
        onOpenChange={(open) => !open && setMaintenanceBlockId(null)}
        blockId={maintenanceBlockId || undefined}
      />
    </div>
  );
}
