import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings as SettingsIcon, Tags, Users, Plus, Edit2, Trash2, Plug, UsersIcon, Building2, Upload, X, FileText } from "lucide-react";
import { insertInspectionCategorySchema, insertComplianceDocumentTypeSchema, type InspectionCategory, type ComplianceDocumentType, type Organization, type User } from "@shared/schema";
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

type SettingsSection = 'branding' | 'categories' | 'document-types' | 'teams' | 'team' | 'integrations';

const settingsMenuItems: { id: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'branding', label: 'Company Branding', icon: Building2 },
  { id: 'categories', label: 'Inspection Categories', icon: Tags },
  { id: 'document-types', label: 'Document Types', icon: FileText },
  { id: 'teams', label: 'Teams', icon: UsersIcon },
  { id: 'team', label: 'Team Members', icon: Users },
  { id: 'integrations', label: 'Integrations', icon: Plug },
];

export default function Settings() {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<SettingsSection>('branding');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<InspectionCategory | null>(null);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [brandingName, setBrandingName] = useState("");
  const [brandingEmail, setBrandingEmail] = useState("");
  const [brandingPhone, setBrandingPhone] = useState("");
  const [brandingAddress, setBrandingAddress] = useState("");
  const [brandingWebsite, setBrandingWebsite] = useState("");
  const [financeEmail, setFinanceEmail] = useState("");
  const [comparisonAlertThreshold, setComparisonAlertThreshold] = useState(20);

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
      setComparisonAlertThreshold(organization.comparisonAlertThreshold ?? 20);
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
        comparisonAlertThreshold,
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
      <div className="max-w-7xl mx-auto">
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

        <div className="flex gap-6">
          {/* Vertical Sidebar Menu */}
          <div className="w-64 shrink-0">
            <Card className="sticky top-8">
              <CardContent className="p-2">
                <nav className="space-y-1">
                  {settingsMenuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveSection(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover-elevate'
                        }`}
                        data-testid={`nav-${item.id}`}
                      >
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </button>
                    );
                  })}
                </nav>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0">
            {activeSection === 'branding' && (
              <div className="space-y-6">
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

                    <div className="border-t border-border pt-6 space-y-4">
                      <Label className="text-base font-medium">Comparison Report Settings</Label>
                      <div className="grid gap-4">
                        <div>
                          <Label htmlFor="comparisonAlertThreshold" className="text-sm">Condition/Cleanliness Alert Threshold (%)</Label>
                          <Input
                            id="comparisonAlertThreshold"
                            type="number"
                            min={1}
                            max={100}
                            value={comparisonAlertThreshold}
                            onChange={(e) => setComparisonAlertThreshold(parseInt(e.target.value) || 20)}
                            className="mt-1 w-32"
                            data-testid="input-comparison-alert-threshold"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Display an alert in comparison reports when the condition or cleanliness score drops by more than this percentage between check-in and check-out inspections
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
              </div>
            )}

            {activeSection === 'categories' && (
              <div className="space-y-6">
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
              </div>
            )}

            {activeSection === 'document-types' && (
              <ComplianceDocumentTypesPanel />
            )}

            {activeSection === 'teams' && (
              <SettingsTeamsPanel />
            )}

            {activeSection === 'team' && (
              <Team />
            )}

            {activeSection === 'integrations' && (
              <FixfloIntegrationSettings />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Compliance Document Types Management Panel
function ComplianceDocumentTypesPanel() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<ComplianceDocumentType | null>(null);

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  const { data: documentTypes = [], isLoading } = useQuery<ComplianceDocumentType[]>({
    queryKey: ["/api/compliance/document-types"],
    enabled: !!user?.organizationId,
  });

  const createForm = useForm({
    resolver: zodResolver(insertComplianceDocumentTypeSchema.omit({ organizationId: true })),
    defaultValues: {
      name: "",
      description: "",
      sortOrder: 0,
      isActive: true,
    },
  });

  const editForm = useForm({
    resolver: zodResolver(insertComplianceDocumentTypeSchema.partial().omit({ organizationId: true })),
    defaultValues: {
      name: "",
      description: "",
      sortOrder: 0,
      isActive: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!user?.organizationId) throw new Error("User must belong to an organization");
      const response = await apiRequest("POST", "/api/compliance/document-types", {
        ...data,
        organizationId: user.organizationId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/document-types"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance"] });
      toast({ title: "Document type created successfully" });
      setIsCreateDialogOpen(false);
      createForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create document type",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/compliance/document-types/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/document-types"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance"] });
      toast({ title: "Document type updated successfully" });
      setEditingType(null);
      editForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update document type",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/compliance/document-types/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/document-types"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance"] });
      toast({ title: "Document type deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete document type",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const onCreateSubmit = (data: any) => {
    createMutation.mutate(data);
  };

  const onEditSubmit = (data: any) => {
    if (editingType) {
      updateMutation.mutate({ id: editingType.id, data });
    }
  };

  const handleEdit = (type: ComplianceDocumentType) => {
    setEditingType(type);
    editForm.reset({
      name: type.name,
      description: type.description || "",
      sortOrder: type.sortOrder || 0,
      isActive: type.isActive,
    });
  };

  return (
    <Card className="border-2 rounded-2xl bg-card/80 backdrop-blur-xl shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Compliance Document Types</CardTitle>
            <CardDescription className="mt-2">
              Manage custom document types for compliance documents. These will appear in the document type dropdown when uploading compliance documents.
            </CardDescription>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-create-document-type">
                <Plus className="w-4 h-4" />
                Add Document Type
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Document Type</DialogTitle>
                <DialogDescription>
                  Add a new custom document type for compliance documents
                </DialogDescription>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                  <FormField
                    control={createForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Document Type Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Asbestos Certificate, Legionella Certificate" {...field} data-testid="input-document-type-name" />
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
                          <Textarea placeholder="Brief description of this document type" {...field} value={field.value ?? ""} data-testid="input-document-type-description" />
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
                          <Input type="number" {...field} value={field.value ?? 0} data-testid="input-document-type-sort-order" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-document-type-submit">
                      {createMutation.isPending ? "Creating..." : "Create Document Type"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : documentTypes.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No custom document types yet.</p>
            <p className="text-sm text-muted-foreground mt-2">
              Create your first custom document type to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {documentTypes.map((type) => (
              <Card key={type.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{type.name}</h3>
                        {!type.isActive && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                      {type.description && (
                        <p className="text-sm text-muted-foreground mt-1">{type.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        Sort Order: {type.sortOrder || 0}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Dialog open={editingType?.id === type.id} onOpenChange={(open) => !open && setEditingType(null)}>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(type)}
                            data-testid={`button-edit-document-type-${type.id}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit Document Type</DialogTitle>
                            <DialogDescription>
                              Update the document type details
                            </DialogDescription>
                          </DialogHeader>
                          <Form {...editForm}>
                            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                              <FormField
                                control={editForm.control}
                                name="name"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Document Type Name</FormLabel>
                                    <FormControl>
                                      <Input {...field} data-testid="input-edit-document-type-name" />
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
                                      <Textarea {...field} value={field.value ?? ""} data-testid="input-edit-document-type-description" />
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
                                      <Input type="number" {...field} value={field.value ?? 0} data-testid="input-edit-document-type-sort-order" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={editForm.control}
                                name="isActive"
                                render={({ field }) => (
                                  <FormItem className="flex items-center gap-2">
                                    <FormControl>
                                      <input
                                        type="checkbox"
                                        checked={field.value ?? true}
                                        onChange={(e) => field.onChange(e.target.checked)}
                                        className="rounded"
                                        data-testid="checkbox-edit-document-type-active"
                                      />
                                    </FormControl>
                                    <FormLabel>Active</FormLabel>
                                  </FormItem>
                                )}
                              />
                              <DialogFooter>
                                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-update-document-type">
                                  {updateMutation.isPending ? "Updating..." : "Update Document Type"}
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
                          if (confirm("Are you sure you want to delete this document type?")) {
                            deleteMutation.mutate(type.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-document-type-${type.id}`}
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
  );
}
