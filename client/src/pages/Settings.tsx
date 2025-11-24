import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings as SettingsIcon, Tags, Users, Plus, Edit2, Trash2, Plug, UsersIcon } from "lucide-react";
import { insertInspectionCategorySchema, type InspectionCategory } from "@shared/schema";
import { z } from "zod";
import Team from "./Team";
import FixfloIntegrationSettings from "@/components/FixfloIntegrationSettings";
import SettingsTeamsPanel from "@/components/SettingsTeamsPanel";

const categoryFormSchema = insertInspectionCategorySchema.extend({
  name: z.string().min(1, "Category name is required"),
  sortOrder: z.coerce.number().min(0, "Sort order must be 0 or greater"),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

export default function Settings() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<InspectionCategory | null>(null);

  // Fetch inspection categories
  const { data: categories, isLoading: categoriesLoading } = useQuery<InspectionCategory[]>({
    queryKey: ["/api/inspection-categories"],
  });

  // Create category mutation
  const createMutation = useMutation({
    mutationFn: async (data: CategoryFormValues) => {
      return await apiRequest("POST", "/api/inspection-categories", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspection-categories"] });
      toast({
        title: "Success",
        description: "Inspection category created successfully",
      });
      setIsCreateDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create category",
      });
    },
  });

  // Update category mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CategoryFormValues> }) => {
      return await apiRequest("PATCH", `/api/inspection-categories/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspection-categories"] });
      toast({
        title: "Success",
        description: "Inspection category updated successfully",
      });
      setEditingCategory(null);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update category",
      });
    },
  });

  // Delete category mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/inspection-categories/${id}`);
      // DELETE endpoints typically return 204 No Content with empty body
      // Only parse JSON if there's content
      if (res.status === 204 || res.headers.get("content-length") === "0") {
        return null;
      }
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspection-categories"] });
      toast({
        title: "Success",
        description: "Inspection category deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete category",
      });
    },
  });

  const createForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: "",
      description: "",
      sortOrder: 0,
    },
  });

  const editForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: "",
      description: "",
      sortOrder: 0,
    },
  });

  // Update edit form when editingCategory changes
  if (editingCategory && editForm.getValues().name !== editingCategory.name) {
    editForm.reset({
      name: editingCategory.name,
      description: editingCategory.description ?? "",
      sortOrder: editingCategory.sortOrder ?? 0,
    });
  }

  const onCreateSubmit = (data: CategoryFormValues) => {
    createMutation.mutate(data);
  };

  const onEditSubmit = (data: CategoryFormValues) => {
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data });
    }
  };

  return (
    <div className="p-8 bg-background min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-2xl bg-primary/10 backdrop-blur-xl">
            <SettingsIcon className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
              Settings
            </h1>
            <p className="text-muted-foreground mt-1">Manage your organization configuration</p>
          </div>
        </div>

        <Tabs defaultValue="categories" className="w-full">
          <TabsList className="grid w-full max-w-3xl grid-cols-4 mb-8">
            <TabsTrigger value="categories" className="gap-2" data-testid="tab-inspection-categories">
              <Tags className="w-4 h-4" />
              Inspection Categories
            </TabsTrigger>
            <TabsTrigger value="teams" className="gap-2" data-testid="tab-teams">
              <UsersIcon className="w-4 h-4" />
              Teams
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-2" data-testid="tab-team-members">
              <Users className="w-4 h-4" />
              Team Members
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-2" data-testid="tab-integrations">
              <Plug className="w-4 h-4" />
              Integrations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="categories" className="space-y-6">
            <Card className="border-2 rounded-2xl bg-card/80 backdrop-blur-xl shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl">Inspection Categories</CardTitle>
                    <CardDescription className="mt-2">
                      Manage inspection item categories for consistent reporting
                    </CardDescription>
                  </div>
                  <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="gap-2" data-testid="button-create-category">
                        <Plus className="w-4 h-4" />
                        Add Category
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create Inspection Category</DialogTitle>
                        <DialogDescription>
                          Add a new category for organizing inspection items
                        </DialogDescription>
                      </DialogHeader>
                      <Form {...createForm}>
                        <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                          <FormField
                            control={createForm.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Category Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g., Kitchen, Bathroom, Living Room" {...field} data-testid="input-category-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={createForm.control}
                            name="description"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Description (Optional)</FormLabel>
                                <FormControl>
                                  <Input placeholder="Brief description of this category" {...field} value={field.value ?? ""} data-testid="input-category-description" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={createForm.control}
                            name="sortOrder"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Sort Order</FormLabel>
                                <FormControl>
                                  <Input type="number" placeholder="0" {...field} data-testid="input-category-sort-order" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <DialogFooter>
                            <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-category">
                              {createMutation.isPending ? "Creating..." : "Create Category"}
                            </Button>
                          </DialogFooter>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {categoriesLoading ? (
                  <div className="text-center py-12 text-muted-foreground">Loading categories...</div>
                ) : !categories || categories.length === 0 ? (
                  <div className="text-center py-12">
                    <Tags className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
                    <p className="text-muted-foreground">No inspection categories yet</p>
                    <p className="text-sm text-muted-foreground/60 mt-1">
                      Create categories to organize your inspection items
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {categories
                      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                      .map((category) => (
                        <Card key={category.id} className="bg-muted/30 hover-elevate" data-testid={`category-card-${category.id}`}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <h3 className="font-semibold text-lg">{category.name}</h3>
                                {category.description && (
                                  <p className="text-sm text-muted-foreground mt-1">{category.description}</p>
                                )}
                                <p className="text-xs text-muted-foreground/60 mt-1">Sort Order: {category.sortOrder || 0}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Dialog open={editingCategory?.id === category.id} onOpenChange={(open) => !open && setEditingCategory(null)}>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => setEditingCategory(category)} data-testid={`button-edit-category-${category.id}`}>
                                      <Edit2 className="w-4 h-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Edit Inspection Category</DialogTitle>
                                      <DialogDescription>
                                        Update the category details
                                      </DialogDescription>
                                    </DialogHeader>
                                    <Form {...editForm}>
                                      <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                                        <FormField
                                          control={editForm.control}
                                          name="name"
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Category Name</FormLabel>
                                              <FormControl>
                                                <Input {...field} data-testid="input-edit-category-name" />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                        <FormField
                                          control={editForm.control}
                                          name="description"
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Description (Optional)</FormLabel>
                                              <FormControl>
                                                <Input {...field} value={field.value ?? ""} data-testid="input-edit-category-description" />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                        <FormField
                                          control={editForm.control}
                                          name="sortOrder"
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Sort Order</FormLabel>
                                              <FormControl>
                                                <Input type="number" {...field} data-testid="input-edit-category-sort-order" />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                        <DialogFooter>
                                          <Button type="submit" disabled={updateMutation.isPending} data-testid="button-update-category">
                                            {updateMutation.isPending ? "Updating..." : "Update Category"}
                                          </Button>
                                        </DialogFooter>
                                      </form>
                                    </Form>
                                  </DialogContent>
                                </Dialog>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    if (confirm("Are you sure you want to delete this category?")) {
                                      deleteMutation.mutate(category.id);
                                    }
                                  }}
                                  disabled={deleteMutation.isPending}
                                  data-testid={`button-delete-category-${category.id}`}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="teams">
            <SettingsTeamsPanel />
          </TabsContent>

          <TabsContent value="team">
            <Team />
          </TabsContent>

          <TabsContent value="integrations">
            <FixfloIntegrationSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
