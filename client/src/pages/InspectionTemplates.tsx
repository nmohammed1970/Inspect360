import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit2, Trash2, FileText, Copy, Eye, Layers, Search, X, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { insertInspectionTemplateSchema, insertTemplateCategorySchema, type InspectionTemplate, type TemplateCategory } from "@shared/schema";
import { z } from "zod";
import { TemplateBuilder } from "../components/TemplateBuilder";

// Form schemas
const templateFormSchema = insertInspectionTemplateSchema.extend({
  name: z.string().min(1, "Template name is required"),
  structureJson: z.any(), // Will be validated by the builder
});

const categoryFormSchema = insertTemplateCategorySchema.extend({
  name: z.string().min(1, "Category name is required"),
});

type TemplateFormValues = z.infer<typeof templateFormSchema>;
type CategoryFormValues = z.infer<typeof categoryFormSchema>;

interface InspectionTemplatesProps {
  embedded?: boolean;
}

export default function InspectionTemplates({ embedded = false }: InspectionTemplatesProps) {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<InspectionTemplate | null>(null);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<InspectionTemplate | null>(null);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterScope, setFilterScope] = useState<string>("all");
  const [filterActive, setFilterActive] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name-asc");

  // Fetch templates (server-side filtering)
  const { data: rawTemplates, isLoading: templatesLoading } = useQuery<InspectionTemplate[]>({
    queryKey: ["/api/inspection-templates", filterCategory, filterScope, filterActive],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterCategory !== "all") params.append("categoryId", filterCategory);
      if (filterScope !== "all") params.append("scope", filterScope);
      if (filterActive !== "all") params.append("active", filterActive);
      const query = params.toString();
      const response = await fetch(`/api/inspection-templates${query ? `?${query}` : ""}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch templates");
      return response.json();
    },
  });

  // Client-side filtering and sorting
  const templates = useMemo(() => {
    if (!rawTemplates) return [];
    
    // Create a copy to avoid mutating rawTemplates
    let filtered = [...rawTemplates];
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.name.toLowerCase().includes(query) ||
        (t.description?.toLowerCase().includes(query))
      );
    }
    
    // Apply sorting (create new sorted array)
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "newest": {
          // Fallback to updatedAt if createdAt is missing
          const aTime = new Date(a.createdAt || a.updatedAt || Date.now()).getTime();
          const bTime = new Date(b.createdAt || b.updatedAt || Date.now()).getTime();
          return bTime - aTime;
        }
        case "oldest": {
          // Fallback to updatedAt if createdAt is missing
          const aTime = new Date(a.createdAt || a.updatedAt || Date.now()).getTime();
          const bTime = new Date(b.createdAt || b.updatedAt || Date.now()).getTime();
          return aTime - bTime;
        }
        case "version":
          return (b.version || 1) - (a.version || 1);
        default:
          return 0;
      }
    });
    
    return sorted;
  }, [rawTemplates, searchQuery, sortBy]);

  // Fetch categories
  const { data: categories } = useQuery<TemplateCategory[]>({
    queryKey: ["/api/template-categories"],
  });

  // Category form
  const categoryForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: "",
      description: "",
      color: "#5AB5E8",
    },
  });

  // Create category mutation
  const createCategoryMutation = useMutation({
    mutationFn: async (data: CategoryFormValues) => {
      return await apiRequest("POST", "/api/template-categories", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/template-categories"] });
      toast({
        title: "Success",
        description: "Category created successfully",
      });
      setIsCategoryDialogOpen(false);
      categoryForm.reset();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create category",
      });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/inspection-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspection-templates"] });
      toast({
        title: "Success",
        description: "Template deleted successfully",
      });
      if (selectedTemplate) {
        setSelectedTemplate(null);
      }
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete template",
      });
    },
  });

  // Clone template mutation
  const cloneTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("POST", `/api/inspection-templates/${id}/clone`, {
        name: undefined, // Let backend auto-generate name
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspection-templates"] });
      toast({
        title: "Success",
        description: "Template cloned successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to clone template",
      });
    },
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return await apiRequest("PUT", `/api/inspection-templates/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspection-templates"] });
      toast({
        title: "Success",
        description: "Template status updated",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update template",
      });
    },
  });

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setIsBuilderOpen(true);
  };

  const handleEditTemplate = (template: InspectionTemplate) => {
    setEditingTemplate(template);
    setIsBuilderOpen(true);
  };

  const handleCloseBuilder = () => {
    setIsBuilderOpen(false);
    setEditingTemplate(null);
  };

  const handleBuilderSave = () => {
    // Cache invalidation is handled by TemplateBuilder
    handleCloseBuilder();
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setFilterCategory("all");
    setFilterScope("all");
    setFilterActive("all");
    setSortBy("name-asc");
  };

  const hasActiveFilters = searchQuery.trim() || filterCategory !== "all" || filterScope !== "all" || filterActive !== "all" || sortBy !== "name-asc";

  const content = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {!embedded && (
            <>
              <h1 className="text-4xl font-semibold tracking-tight">Inspection Templates</h1>
              <p className="text-muted-foreground mt-2">
                Create reusable inspection templates with flexible JSON-based structures
              </p>
            </>
          )}
          {embedded && (
            <>
              <h2 className="text-2xl font-semibold">Inspection Templates</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Create and manage your inspection templates
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setIsCategoryDialogOpen(true)}
            data-testid="button-manage-categories"
          >
            <Layers className="w-4 h-4 mr-2" />
            Categories
          </Button>
          <Button
            onClick={handleCreateTemplate}
            size="lg"
            data-testid="button-create-template"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Template
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="shadow-sm rounded-xl">
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search templates by name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9"
                data-testid="input-search-templates"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearchQuery("")}
                  data-testid="button-clear-search"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Filter Controls Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Category</label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger data-testid="select-filter-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Scope</label>
                <Select value={filterScope} onValueChange={setFilterScope}>
                  <SelectTrigger data-testid="select-filter-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Scopes</SelectItem>
                    <SelectItem value="property">Property</SelectItem>
                    <SelectItem value="block">Block</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Status</label>
                <Select value={filterActive} onValueChange={setFilterActive}>
                  <SelectTrigger data-testid="select-filter-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="true">Active Only</SelectItem>
                    <SelectItem value="false">Inactive Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Sort By</label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger data-testid="select-sort-by">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                    <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="version">Highest Version</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Results Count and Clear Filters */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-sm text-muted-foreground">
                {templatesLoading ? (
                  "Loading..."
                ) : (
                  <span data-testid="text-result-count">
                    Showing <span className="font-semibold text-foreground">{templates?.length || 0}</span> {templates?.length === 1 ? "template" : "templates"}
                    {rawTemplates && templates && rawTemplates.length !== templates.length && (
                      <span className="ml-1">(filtered from {rawTemplates.length})</span>
                    )}
                  </span>
                )}
              </div>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAllFilters}
                  data-testid="button-clear-filters"
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templatesLoading ? (
          // Loading skeletons
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="shadow-sm rounded-xl">
              <CardHeader>
                <Skeleton className="h-6 w-3/4 mb-2" />
                <div className="flex gap-2 mt-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-12" />
                </div>
                <Skeleton className="h-10 w-full mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-full" />
              </CardContent>
            </Card>
          ))
        ) : !templates || templates.length === 0 ? (
          <Card className="col-span-full shadow-sm rounded-xl">
            <CardContent className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              {hasActiveFilters ? (
                <>
                  <h3 className="text-lg font-semibold mb-2">No templates match your filters</h3>
                  <p className="text-muted-foreground mb-6">
                    Try adjusting your search or filter criteria
                  </p>
                  <Button variant="outline" onClick={clearAllFilters} data-testid="button-clear-filters-empty">
                    <X className="w-4 h-4 mr-2" />
                    Clear All Filters
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
                  <p className="text-muted-foreground mb-6">
                    Create your first inspection template to get started
                  </p>
                  <Button onClick={handleCreateTemplate} data-testid="button-create-first-template">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Template
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          templates.map((template) => {
            const category = categories?.find((c) => c.id === template.categoryId);
            return (
              <Card
                key={template.id}
                className="shadow-sm rounded-xl hover-elevate transition-all"
                data-testid={`card-template-${template.id}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate" data-testid={`text-template-name-${template.id}`}>
                        {template.name}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-2">
                        {category && (
                          <Badge variant="outline" style={{ borderColor: category.color || "#5AB5E8" }}>
                            {category.name}
                          </Badge>
                        )}
                        <Badge variant={template.scope === "both" ? "default" : "secondary"}>
                          {template.scope}
                        </Badge>
                        <Badge variant="outline">v{template.version}</Badge>
                      </div>
                    </div>
                    <Switch
                      checked={template.isActive ?? true}
                      onCheckedChange={(checked) => {
                        toggleActiveMutation.mutate({ id: template.id, isActive: checked });
                      }}
                      data-testid={`switch-active-${template.id}`}
                    />
                  </div>
                  {template.description && (
                    <CardDescription className="line-clamp-2 mt-2">
                      {template.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleEditTemplate(template)}
                      data-testid={`button-edit-template-${template.id}`}
                    >
                      <Edit2 className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => cloneTemplateMutation.mutate(template.id)}
                      data-testid={`button-clone-template-${template.id}`}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this template?")) {
                          deleteTemplateMutation.mutate(template.id);
                        }
                      }}
                      data-testid={`button-delete-template-${template.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Template Builder Dialog */}
      {isBuilderOpen && (
        <TemplateBuilder
          template={editingTemplate}
          categories={categories || []}
          onClose={handleCloseBuilder}
          onSave={handleBuilderSave}
        />
      )}

      {/* Category Dialog */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent data-testid="dialog-category-form">
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
            <DialogDescription>
              Create and organize template categories
            </DialogDescription>
          </DialogHeader>
          <Form {...categoryForm}>
            <form onSubmit={categoryForm.handleSubmit((data) => createCategoryMutation.mutate(data))} className="space-y-4">
              <FormField
                control={categoryForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Move-In, Move-Out, Routine"
                        {...field}
                        data-testid="input-category-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={categoryForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe this category..."
                        {...field}
                        value={field.value || ""}
                        data-testid="input-category-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={categoryForm.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <Input
                        type="color"
                        {...field}
                        value={field.value || "#5AB5E8"}
                        data-testid="input-category-color"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCategoryDialogOpen(false)}
                  data-testid="button-cancel-category"
                >
                  Close
                </Button>
                <Button
                  type="submit"
                  disabled={createCategoryMutation.isPending}
                  data-testid="button-save-category"
                >
                  {createCategoryMutation.isPending ? "Creating..." : "Create Category"}
                </Button>
              </DialogFooter>
            </form>
          </Form>

          {/* Existing Categories List */}
          {categories && categories.length > 0 && (
            <div className="mt-6 space-y-2">
              <h4 className="font-medium text-sm">Existing Categories</h4>
              <div className="space-y-2">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted"
                  >
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: cat.color || "#5AB5E8" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{cat.name}</p>
                      {cat.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {cat.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );

  if (embedded) {
    return <div className="space-y-6">{content}</div>;
  }

  return (
    <div className="container mx-auto p-8 space-y-8">
      {content}
    </div>
  );
}
