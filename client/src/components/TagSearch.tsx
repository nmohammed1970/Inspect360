import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Building, Home, Users, FileText, Package, Wrench, Tag as TagIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Tag } from "@shared/schema";
import { useCompanyModules } from "@/hooks/useCompanyModules";

interface TagSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchResults {
  blocks: any[];
  properties: any[];
  users: any[];
  complianceDocuments: any[];
  assetInventory: any[];
  maintenanceRequests: any[];
}

export function TagSearch({ open, onOpenChange }: TagSearchProps) {
  const [, setLocation] = useLocation();
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const { complianceEnabled, maintenanceEnabled } = useCompanyModules();
  const { data: allTags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  const searchMutation = useMutation({
    mutationFn: async (tagIds: string[]) => {
      const res = await apiRequest("POST", "/api/tags/search", { tagIds });
      return res.json();
    },
    onSuccess: (data) => {
      setSearchResults(data);
    },
  });

  const handleTagSelect = (tag: Tag) => {
    if (selectedTags.find(t => t.id === tag.id)) {
      const newTags = selectedTags.filter(t => t.id !== tag.id);
      setSelectedTags(newTags);
      if (newTags.length > 0) {
        searchMutation.mutate(newTags.map(t => t.id));
      } else {
        setSearchResults(null);
      }
    } else {
      const newTags = [...selectedTags, tag];
      setSelectedTags(newTags);
      searchMutation.mutate(newTags.map(t => t.id));
    }
  };

  const handleClear = () => {
    setSelectedTags([]);
    setSearchResults(null);
  };

  const handleNavigate = (path: string) => {
    setLocation(path);
    onOpenChange(false);
    handleClear();
  };

  const getTotalResults = () => {
    if (!searchResults) return 0;
    return (
      searchResults.blocks.length +
      searchResults.properties.length +
      searchResults.users.length +
      searchResults.complianceDocuments.length +
      (complianceEnabled ? searchResults.complianceDocuments.length : 0) +
      searchResults.maintenanceRequests.length
      (maintenanceEnabled ? searchResults.maintenanceRequests.length : 0)
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search by Tags
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tag Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Select Tags:</label>
              {selectedTags.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  data-testid="button-clear-tags"
                >
                  Clear
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 p-4 border rounded-lg min-h-[60px]">
              {allTags.map(tag => (
                <Badge
                  key={tag.id}
                  variant={selectedTags.find(t => t.id === tag.id) ? "default" : "outline"}
                  className="cursor-pointer gap-1"
                  style={{
                    backgroundColor: selectedTags.find(t => t.id === tag.id) ? tag.color || undefined : undefined,
                    borderColor: tag.color || undefined,
                  }}
                  onClick={() => handleTagSelect(tag)}
                  data-testid={`tag-filter-${tag.id}`}
                >
                  <TagIcon className="h-3 w-3" />
                  {tag.name}
                </Badge>
              ))}
              {allTags.length === 0 && (
                <p className="text-sm text-muted-foreground">No tags available. Create tags in the Properties, Blocks, or other sections.</p>
              )}
            </div>
          </div>

          {/* Search Results */}
          {searchMutation.isPending && (
            <div className="text-center py-8 text-muted-foreground">
              Searching...
            </div>
          )}

          {searchResults && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">
                  Results ({getTotalResults()})
                </h3>
              </div>

              <ScrollArea className="h-[400px] border rounded-lg p-4">
                <div className="space-y-6">
                  {/* Blocks */}
                  {searchResults.blocks.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Building className="h-4 w-4" />
                        Blocks ({searchResults.blocks.length})
                      </div>
                      <div className="space-y-1">
                        {searchResults.blocks.map(block => (
                          <button
                            key={block.id}
                            onClick={() => handleNavigate(`/blocks`)}
                            className="w-full flex items-center justify-between p-2 hover-elevate rounded-md text-left"
                            data-testid={`result-block-${block.id}`}
                          >
                            <div>
                              <p className="font-medium">{block.name}</p>
                              <p className="text-sm text-muted-foreground">{block.address}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Properties */}
                  {searchResults.properties.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Home className="h-4 w-4" />
                        Properties ({searchResults.properties.length})
                      </div>
                      <div className="space-y-1">
                        {searchResults.properties.map(property => (
                          <button
                            key={property.id}
                            onClick={() => handleNavigate(`/properties`)}
                            className="w-full flex items-center justify-between p-2 hover-elevate rounded-md text-left"
                            data-testid={`result-property-${property.id}`}
                          >
                            <div>
                              <p className="font-medium">{property.name}</p>
                              <p className="text-sm text-muted-foreground">{property.address}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Users/Tenants */}
                  {searchResults.users.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Users className="h-4 w-4" />
                        Team Members ({searchResults.users.length})
                      </div>
                      <div className="space-y-1">
                        {searchResults.users.map(user => (
                          <button
                            key={user.id}
                            onClick={() => handleNavigate(`/team`)}
                            className="w-full flex items-center justify-between p-2 hover-elevate rounded-md text-left"
                            data-testid={`result-user-${user.id}`}
                          >
                            <div>
                              <p className="font-medium">{user.firstName} {user.lastName}</p>
                              <p className="text-sm text-muted-foreground">{user.email} • {user.role}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Compliance Documents */}
                  {complianceEnabled && searchResults.complianceDocuments.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <FileText className="h-4 w-4" />
                        Compliance Documents ({searchResults.complianceDocuments.length})
                      </div>
                      <div className="space-y-1">
                        {searchResults.complianceDocuments.map(doc => (
                          <button
                            key={doc.id}
                            onClick={() => handleNavigate(`/compliance`)}
                            className="w-full flex items-center justify-between p-2 hover-elevate rounded-md text-left"
                            data-testid={`result-compliance-${doc.id}`}
                          >
                            <div>
                              <p className="font-medium">{doc.documentType}</p>
                              <p className="text-sm text-muted-foreground">
                                {doc.issueDate && new Date(doc.issueDate).toLocaleDateString()}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Asset Inventory */}
                  {searchResults.assetInventory.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Package className="h-4 w-4" />
                        Asset Inventory ({searchResults.assetInventory.length})
                      </div>
                      <div className="space-y-1">
                        {searchResults.assetInventory.map(asset => (
                          <button
                            key={asset.id}
                            onClick={() => handleNavigate(`/inventory`)}
                            className="w-full flex items-center justify-between p-2 hover-elevate rounded-md text-left"
                            data-testid={`result-asset-${asset.id}`}
                          >
                            <div>
                              <p className="font-medium">{asset.name}</p>
                              <p className="text-sm text-muted-foreground">{asset.category}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Maintenance Requests */}
                  {maintenanceEnabled && searchResults.maintenanceRequests.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Wrench className="h-4 w-4" />
                        Maintenance Requests ({searchResults.maintenanceRequests.length})
                      </div>
                      <div className="space-y-1">
                        {searchResults.maintenanceRequests.map(request => (
                          <button
                            key={request.id}
                            onClick={() => handleNavigate(`/maintenance`)}
                            className="w-full flex items-center justify-between p-2 hover-elevate rounded-md text-left"
                            data-testid={`result-maintenance-${request.id}`}
                          >
                            <div>
                              <p className="font-medium">{request.title}</p>
                              <p className="text-sm text-muted-foreground">{request.status}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {getTotalResults() === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No results found for the selected tags
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {!searchResults && !searchMutation.isPending && selectedTags.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Select one or more tags to search
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
