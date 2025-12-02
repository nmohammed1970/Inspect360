import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings as SettingsIcon, Tags, Users, Plus, Edit2, Trash2, Plug, UsersIcon, Building2, Upload, X } from "lucide-react";
import { insertInspectionCategorySchema, type InspectionCategory, type Organization, type User } from "@shared/schema";
import { z } from "zod";
import Team from "./Team";
import FixfloIntegrationSettings from "@/components/FixfloIntegrationSettings";
import SettingsTeamsPanel from "@/components/SettingsTeamsPanel";
import { ObjectUploader } from "@/components/ObjectUploader";

const categoryFormSchema = insertInspectionCategorySchema.extend({
  name: z.string().min(1, "Category name is required"),
  sortOrder: z.coerce.number().min(0, "Sort order must be 0 or greater"),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

export default function Settings() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<InspectionCategory | null>(null);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [brandingName, setBrandingName] = useState("");
  const [brandingEmail, setBrandingEmail] = useState("");
  const [brandingPhone, setBrandingPhone] = useState("");
  const [brandingAddress, setBrandingAddress] = useState("");
  const [brandingWebsite, setBrandingWebsite] = useState("");
  const [financeEmail, setFinanceEmail] = useState("");

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  const { data: organization, isLoading: orgLoading } = useQuery<Organization>({
    queryKey: ["/api/organizations", user?.organizationId],
    enabled: !!user?.organizationId,
  });

  useEffect(() => {
    if (organization) {
      setLogoUrl(organization.logoUrl || null);
      setBrandingName(organization.brandingName || "");
      setBrandingEmail(organization.brandingEmail || "");
      setBrandingPhone(organization.brandingPhone || "");
      setBrandingAddress(organization.brandingAddress || "");
      setBrandingWebsite(organization.brandingWebsite || "");
      setFinanceEmail(organization.financeEmail || "");
    }
  }, [organization]);

  const updateBrandingMutation = useMutation({
    mutationFn: async () => {
      if (!user?.organizationId) return null;
      const response = await apiRequest("PATCH", `/api/organizations/${user.organizationId}/branding`, {
        logoUrl,
        brandingName: brandingName || null,
        brandingEmail: brandingEmail || null,
        brandingPhone: brandingPhone || null,
        brandingAddress: brandingAddress || null,
        brandingWebsite: brandingWebsite || null,
        financeEmail: financeEmail || null,
      });
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all organization queries to ensure sidebar and other components refresh
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", user?.organizationId] });
      toast({
        title: "Success",
        description: "Company branding updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update branding",
      });
    },
  });

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

  const getUploadParameters = async () => {
    const response = await apiRequest("POST", "/api/upload/generate-upload-url", {
      folder: "branding",
      fileName: `logo-${Date.now()}.png`,
      contentType: "image/*",
    });
    const data = await response.json();
    return {
      method: "PUT" as const,
      url: data.uploadUrl,
    };
  };

  const handleUploadComplete = (result: any) => {
    if (result.successful && result.successful.length > 0) {
      const uploadedFile = result.successful[0];
      const fileUrl = uploadedFile.uploadURL || uploadedFile.meta?.extractedFileUrl;
      if (fileUrl) {
        setLogoUrl(fileUrl);
      }
    }
  };

  const removeLogo = () => {
    setLogoUrl(null);
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

        <Tabs defaultValue="branding" className="w-full">
          <TabsList className="grid w-full max-w-4xl grid-cols-5 mb-8">
            <TabsTrigger value="branding" className="gap-2" data-testid="tab-company-branding">
              <Building2 className="w-4 h-4" />
              Company Branding
            </TabsTrigger>
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

          <TabsContent value="branding" className="space-y-6">
            <Card className="border-2 rounded-2xl bg-card/80 backdrop-blur-xl shadow-lg">
              <CardHeader>
                <CardTitle className="text-2xl">Company Branding</CardTitle>
                <CardDescription className="mt-2">
                  Customize your company logo and contact details. These will appear on inspection reports, tenant portals, and contractor portals.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {orgLoading ? (
                  <div className="text-center py-12 text-muted-foreground">Loading...</div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <Label className="text-base font-medium">Company Logo</Label>
                      <div className="flex items-start gap-6">
                        {logoUrl ? (
                          <div className="relative">
                            <div className="w-40 h-40 rounded-md border border-border overflow-hidden bg-muted flex items-center justify-center">
                              <img 
                                src={logoUrl} 
                                alt="Company logo" 
                                className="w-full h-full object-contain"
                              />
                            </div>
                            <Button
                              size="icon"
                              variant="destructive"
                              className="absolute -top-2 -right-2"
                              onClick={removeLogo}
                              data-testid="button-remove-logo"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <ObjectUploader
                            maxNumberOfFiles={1}
                            maxFileSize={5242880}
                            onGetUploadParameters={getUploadParameters}
                            onComplete={handleUploadComplete}
                            buttonClassName="h-40 w-40 border-2 border-dashed border-border rounded-md flex flex-col items-center justify-center gap-2 bg-muted/50"
                          >
                            <Upload className="w-10 h-10 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Upload Logo</span>
                          </ObjectUploader>
                        )}
                        <div className="flex-1 text-sm text-muted-foreground">
                          <p>Your company logo will appear on:</p>
                          <ul className="list-disc list-inside mt-2 space-y-1">
                            <li>All inspection reports and PDF exports</li>
                            <li>Tenant portal header</li>
                            <li>Contractor portal header</li>
                            <li>Inventory clerk portal header</li>
                            <li>Email communications</li>
                          </ul>
                          <p className="mt-2 text-xs">Recommended size: 400x400 pixels. Max file size: 5MB.</p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border pt-6 space-y-4">
                      <Label className="text-base font-medium">Company Details</Label>
                      <div className="grid gap-4">
                        <div>
                          <Label htmlFor="brandingName" className="text-sm">Company Name (for reports)</Label>
                          <Input
                            id="brandingName"
                            value={brandingName}
                            onChange={(e) => setBrandingName(e.target.value)}
                            placeholder="Your company name"
                            className="mt-1"
                            data-testid="input-branding-name"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            This name will appear on official documents and reports
                          </p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="brandingEmail" className="text-sm">Contact Email</Label>
                            <Input
                              id="brandingEmail"
                              type="email"
                              value={brandingEmail}
                              onChange={(e) => setBrandingEmail(e.target.value)}
                              placeholder="contact@company.com"
                              className="mt-1"
                              data-testid="input-branding-email"
                            />
                          </div>
                          <div>
                            <Label htmlFor="brandingPhone" className="text-sm">Contact Phone</Label>
                            <Input
                              id="brandingPhone"
                              value={brandingPhone}
                              onChange={(e) => setBrandingPhone(e.target.value)}
                              placeholder="+44 20 1234 5678"
                              className="mt-1"
                              data-testid="input-branding-phone"
                            />
                          </div>
                        </div>
                        
                        <div>
                          <Label htmlFor="brandingAddress" className="text-sm">Company Address</Label>
                          <Textarea
                            id="brandingAddress"
                            value={brandingAddress}
                            onChange={(e) => setBrandingAddress(e.target.value)}
                            placeholder="123 Business Street, City, Country, Postcode"
                            className="mt-1"
                            rows={2}
                            data-testid="input-branding-address"
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor="brandingWebsite" className="text-sm">Website</Label>
                          <Input
                            id="brandingWebsite"
                            value={brandingWebsite}
                            onChange={(e) => setBrandingWebsite(e.target.value)}
                            placeholder="www.yourcompany.com"
                            className="mt-1"
                            data-testid="input-branding-website"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border pt-6 space-y-4">
                      <Label className="text-base font-medium">Finance Department</Label>
                      <div className="grid gap-4">
                        <div>
                          <Label htmlFor="financeEmail" className="text-sm">Finance Email</Label>
                          <Input
                            id="financeEmail"
                            type="email"
                            value={financeEmail}
                            onChange={(e) => setFinanceEmail(e.target.value)}
                            placeholder="finance@yourcompany.com"
                            className="mt-1"
                            data-testid="input-finance-email"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Comparison reports with liability summaries can be sent to this email for deposit processing
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border pt-6">
                      <Button 
                        onClick={() => updateBrandingMutation.mutate()}
                        disabled={updateBrandingMutation.isPending}
                        data-testid="button-save-branding"
                      >
                        {updateBrandingMutation.isPending ? "Saving..." : "Save Branding Settings"}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

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
