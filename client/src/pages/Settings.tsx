import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format as formatDate } from "date-fns";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings as SettingsIcon, Tags, Users, Plus, Edit2, Trash2, Plug, UsersIcon, Building2, Upload, X, FileText, ClipboardList, ChevronUp, ChevronDown, Award, Image as ImageIcon, ExternalLink, Calendar, Pencil, DoorOpen, Download, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { insertInspectionCategorySchema, insertComplianceDocumentTypeSchema, insertComplianceDocumentSchema, type InspectionCategory, type ComplianceDocumentType, type ComplianceDocument, type Organization, type User, type OrganizationTrademark } from "@shared/schema";
import InspectionTemplatesContent from "./InspectionTemplates";
import { z } from "zod";
import Team from "./Team";
import FixfloIntegrationSettings from "@/components/FixfloIntegrationSettings";
import SettingsTeamsPanel from "@/components/SettingsTeamsPanel";
import { ObjectUploader } from "@/components/ObjectUploader";
import { AddressInput } from "@/components/AddressInput";

const categoryFormSchema = insertInspectionCategorySchema.extend({
  name: z.string().min(1, "Category name is required"),
  sortOrder: z.coerce.number().min(0, "Sort order must be 0 or greater"),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

type SettingsSection = 'branding' | 'templates' | 'categories' | 'document-types' | 'teams' | 'team' | 'integrations' | 'tenant-portal' | 'data-export';

const settingsMenuItems: { id: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }>; href?: string }[] = [
  { id: 'branding', label: 'Company Branding', icon: Building2 },
  { id: 'templates', label: 'Inspection Templates', icon: ClipboardList },
  { id: 'document-types', label: 'Compliance Documents', icon: FileText },
  { id: 'teams', label: 'Maintenance Team', icon: UsersIcon },
  { id: 'team', label: 'Team Members', icon: Users },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'tenant-portal', label: 'Tenant Portal Configuration', icon: DoorOpen },
  { id: 'data-export', label: 'Data Export', icon: Download },
];

export default function Settings() {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<SettingsSection>('branding');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<InspectionCategory | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [trademarkUrl, setTrademarkUrl] = useState<string | null>(null);
  const [brandingName, setBrandingName] = useState("");
  const [brandingEmail, setBrandingEmail] = useState("");
  const [brandingPhone, setBrandingPhone] = useState("");
  const [brandingAddress, setBrandingAddress] = useState("");
  const [brandingWebsite, setBrandingWebsite] = useState("");
  const [financeEmail, setFinanceEmail] = useState("");
  const [comparisonAlertThreshold, setComparisonAlertThreshold] = useState(20);
  const [tenantPortalCommunityEnabled, setTenantPortalCommunityEnabled] = useState(true);
  const [tenantPortalComparisonEnabled, setTenantPortalComparisonEnabled] = useState(true);
  const [tenantPortalChatbotEnabled, setTenantPortalChatbotEnabled] = useState(true);
  const [tenantPortalMaintenanceEnabled, setTenantPortalMaintenanceEnabled] = useState(true);
  const [checkInApprovalPeriodDays, setCheckInApprovalPeriodDays] = useState(5);

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
      setTrademarkUrl(organization.trademarkUrl || null);
      setBrandingName(organization.brandingName || "");
      setBrandingEmail(organization.brandingEmail || "");
      setBrandingPhone(organization.brandingPhone || "");
      setBrandingAddress(organization.brandingAddress || "");
      setBrandingWebsite(organization.brandingWebsite || "");
      setFinanceEmail(organization.financeEmail || "");
      setComparisonAlertThreshold(organization.comparisonAlertThreshold ?? 20);
      setTenantPortalCommunityEnabled(organization.tenantPortalCommunityEnabled ?? true);
      setTenantPortalComparisonEnabled(organization.tenantPortalComparisonEnabled ?? true);
      setTenantPortalChatbotEnabled(organization.tenantPortalChatbotEnabled ?? true);
      setTenantPortalMaintenanceEnabled(organization.tenantPortalMaintenanceEnabled ?? true);
      setCheckInApprovalPeriodDays(organization.checkInApprovalPeriodDays ?? 5);
    }
  }, [organization]);

  const updateBrandingMutation = useMutation({
    mutationFn: async () => {
      if (!user?.organizationId) return null;
      const response = await apiRequest("PATCH", `/api/organizations/${user.organizationId}/branding`, {
        logoUrl,
        trademarkUrl,
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

  // Fetch organization trademarks
  const { data: trademarks = [], isLoading: trademarksLoading } = useQuery<OrganizationTrademark[]>({
    queryKey: ["/api/organizations", user?.organizationId, "trademarks"],
    enabled: !!user?.organizationId,
  });

  // Create trademark mutation
  const createTrademarkMutation = useMutation({
    mutationFn: async (data: { imageUrl: string; altText?: string }) => {
      if (!user?.organizationId) throw new Error("Organization not found");
      const response = await apiRequest("POST", `/api/organizations/${user.organizationId}/trademarks`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", user?.organizationId, "trademarks"] });
      toast({
        title: "Success",
        description: "Trademark badge added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to add trademark badge",
      });
    },
  });

  // Delete trademark mutation
  const deleteTrademarkMutation = useMutation({
    mutationFn: async (trademarkId: string) => {
      if (!user?.organizationId) throw new Error("Organization not found");
      const res = await apiRequest("DELETE", `/api/organizations/${user.organizationId}/trademarks/${trademarkId}`);
      if (res.status === 204 || res.headers.get("content-length") === "0") {
        return null;
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", user?.organizationId, "trademarks"] });
      toast({
        title: "Success",
        description: "Trademark badge removed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to remove trademark badge",
      });
    },
  });

  // Reorder trademarks mutation
  const reorderTrademarksMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (!user?.organizationId) throw new Error("Organization not found");
      const response = await apiRequest("POST", `/api/organizations/${user.organizationId}/trademarks/reorder`, { orderedIds });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", user?.organizationId, "trademarks"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to reorder trademarks",
      });
    },
  });

  // Move trademark up/down
  const moveTrademarkUp = (index: number) => {
    if (index === 0) return;
    const sortedTrademarks = [...trademarks].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    const newOrder = [...sortedTrademarks];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    reorderTrademarksMutation.mutate(newOrder.map(t => t.id));
  };

  const moveTrademarkDown = (index: number) => {
    const sortedTrademarks = [...trademarks].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    if (index === sortedTrademarks.length - 1) return;
    const newOrder = [...sortedTrademarks];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    reorderTrademarksMutation.mutate(newOrder.map(t => t.id));
  };

  const handleTrademarkUpload = (result: any) => {
    if (result.successful && result.successful.length > 0) {
      const uploadedFile = result.successful[0];
      const fileUrl = uploadedFile.uploadURL || uploadedFile.meta?.extractedFileUrl;
      if (fileUrl) {
        createTrademarkMutation.mutate({ imageUrl: fileUrl });
      }
    }
  };

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
    <div className="container mx-auto p-4 md:p-6 bg-background min-h-screen">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 md:mb-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">
            Settings
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">Manage your organization configuration</p>
        </div>
      </div>

        <div className="flex flex-col lg:flex-row gap-4 md:gap-6">
          {/* Vertical Sidebar Menu */}
          <div className="w-full lg:w-64 shrink-0">
            <Card className="sticky top-8">
              <CardContent className="p-2">
                <nav className="space-y-1">
                  {settingsMenuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeSection === item.id;
                    
                    if (item.href) {
                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left text-sm font-medium transition-colors text-muted-foreground hover-elevate"
                          data-testid={`nav-${item.id}`}
                        >
                          <Icon className="w-4 h-4" />
                          {item.label}
                        </Link>
                      );
                    }
                    
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
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label className="text-base font-medium">Trademark / Certification Badges</Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            Upload multiple trademarks, certification badges, or accreditation logos (max 10)
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {trademarks.length}/10
                        </Badge>
                      </div>
                      
                      {trademarksLoading ? (
                        <div className="text-center py-8 text-muted-foreground">Loading trademarks...</div>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {[...trademarks]
                              .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
                              .map((trademark, index) => (
                                <div 
                                  key={trademark.id} 
                                  className="relative group"
                                  data-testid={`trademark-card-${trademark.id}`}
                                >
                                  <div className="w-full aspect-square rounded-md border border-border overflow-hidden bg-muted flex items-center justify-center">
                                    <img 
                                      src={trademark.imageUrl} 
                                      alt={trademark.altText || "Certification badge"} 
                                      className="w-full h-full object-contain p-2"
                                    />
                                  </div>
                                  <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                      size="icon"
                                      variant="secondary"
                                      className="h-6 w-6"
                                      onClick={() => moveTrademarkUp(index)}
                                      disabled={index === 0 || reorderTrademarksMutation.isPending}
                                      data-testid={`button-move-up-${trademark.id}`}
                                    >
                                      <ChevronUp className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="secondary"
                                      className="h-6 w-6"
                                      onClick={() => moveTrademarkDown(index)}
                                      disabled={index === trademarks.length - 1 || reorderTrademarksMutation.isPending}
                                      data-testid={`button-move-down-${trademark.id}`}
                                    >
                                      <ChevronDown className="w-3 h-3" />
                                    </Button>
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="destructive"
                                    className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => {
                                      if (confirm("Are you sure you want to remove this badge?")) {
                                        deleteTrademarkMutation.mutate(trademark.id);
                                      }
                                    }}
                                    disabled={deleteTrademarkMutation.isPending}
                                    data-testid={`button-remove-trademark-${trademark.id}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              ))}
                            
                            {trademarks.length < 10 && (
                              <ObjectUploader
                                maxNumberOfFiles={1}
                                maxFileSize={5242880}
                                onGetUploadParameters={async () => {
                                  const response = await apiRequest("POST", "/api/upload/generate-upload-url", {
                                    folder: "branding",
                                    fileName: `trademark-${Date.now()}.png`,
                                    contentType: "image/*",
                                  });
                                  const data = await response.json();
                                  return { method: "PUT" as const, url: data.uploadUrl };
                                }}
                                onComplete={handleTrademarkUpload}
                                buttonClassName="w-full aspect-square border-2 border-dashed border-border rounded-md flex flex-col items-center justify-center gap-2 bg-muted/50"
                              >
                                <Upload className="w-6 h-6 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground text-center">Add Badge</span>
                              </ObjectUploader>
                            )}
                          </div>
                          
                          <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
                            <div className="flex items-start gap-2">
                              <Award className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                              <div>
                                <p className="font-medium text-foreground">Displayed on inspection reports</p>
                                <p className="mt-1">
                                  These badges appear as a row on your PDF inspection reports. Use the arrows to reorder how they display.
                                  Common certifications include ARLA, RICS, AIIC, TDS, and other property industry accreditations.
                                </p>
                                <p className="mt-1 text-xs">Recommended size: 200x200 pixels. Max file size: 5MB each.</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
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
                          <AddressInput
                            id="brandingAddress"
                            value={brandingAddress}
                            onChange={(value) => setBrandingAddress(value)}
                            placeholder="Start typing to search for address..."
                            className="mt-1"
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

            {activeSection === 'templates' && (
              <div className="space-y-6">
                <InspectionTemplatesContent embedded />
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
              <ComplianceDocumentsPanel />
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

            {activeSection === 'tenant-portal' && (
              <TenantPortalConfiguration
                organization={organization}
                tenantPortalCommunityEnabled={tenantPortalCommunityEnabled}
                tenantPortalComparisonEnabled={tenantPortalComparisonEnabled}
                tenantPortalChatbotEnabled={tenantPortalChatbotEnabled}
                tenantPortalMaintenanceEnabled={tenantPortalMaintenanceEnabled}
                checkInApprovalPeriodDays={checkInApprovalPeriodDays}
                onCommunityChange={setTenantPortalCommunityEnabled}
                onComparisonChange={setTenantPortalComparisonEnabled}
                onChatbotChange={setTenantPortalChatbotEnabled}
                onMaintenanceChange={setTenantPortalMaintenanceEnabled}
                onApprovalPeriodChange={setCheckInApprovalPeriodDays}
              />
            )}

            {activeSection === 'data-export' && (
              <div className="space-y-6">
                <Card className="border-2 rounded-2xl bg-card/80 backdrop-blur-xl shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-2xl">Export Portfolio Data</CardTitle>
                    <CardDescription className="mt-2">
                      Download a comprehensive Excel report containing all your portfolio data including properties, blocks, inspections, compliance documents, and maintenance records.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div className="p-4 rounded-lg border bg-muted/50">
                        <h3 className="font-semibold mb-2">What's included in the export:</h3>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                          <li>All properties and blocks with their details</li>
                          <li>Complete inspection history and reports</li>
                          <li>Compliance documents and expiry dates</li>
                          <li>Maintenance requests and their status</li>
                          <li>Tenant assignments and lease information</li>
                          <li>Asset inventory records</li>
                        </ul>
                      </div>
                      <Button
                        onClick={async () => {
                          setIsExporting(true);
                          try {
                            const response = await fetch("/api/reports/comprehensive/excel", {
                              method: "GET",
                              credentials: "include",
                            });

                            if (!response.ok) {
                              const errorData = await response.json().catch(() => ({ message: "Failed to generate Excel report" }));
                              throw new Error(errorData.message || "Failed to generate Excel report");
                            }

                            const blob = await response.blob();
                            
                            if (blob.size === 0) {
                              throw new Error("Generated Excel file is empty");
                            }

                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `portfolio-data-export-${new Date().toISOString().split('T')[0]}.xlsx`;
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            document.body.removeChild(a);

                            toast({
                              title: "Export Successful",
                              description: "Your portfolio data has been downloaded successfully.",
                            });
                          } catch (error: any) {
                            console.error("Export error:", error);
                            toast({
                              title: "Export Failed",
                              description: error.message || "Failed to generate Excel report. Please try again.",
                              variant: "destructive",
                            });
                          } finally {
                            setIsExporting(false);
                          }
                        }}
                        disabled={isExporting}
                        size="lg"
                        className="w-full sm:w-auto"
                        data-testid="button-export-portfolio-data"
                      >
                        {isExporting ? (
                          <>
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            Generating Report...
                          </>
                        ) : (
                          <>
                            <Download className="h-5 w-5 mr-2" />
                            Download Portfolio Data Report
                          </>
                        )}
                      </Button>
                      <p className="text-sm text-muted-foreground">
                        The report will be generated as an Excel file (.xlsx) and downloaded to your device. Large portfolios may take a few moments to process.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
    </div>
  );
}

// Tenant Portal Configuration Component
function TenantPortalConfiguration({
  organization,
  tenantPortalCommunityEnabled,
  tenantPortalComparisonEnabled,
  tenantPortalChatbotEnabled,
  tenantPortalMaintenanceEnabled,
  checkInApprovalPeriodDays,
  onCommunityChange,
  onComparisonChange,
  onChatbotChange,
  onMaintenanceChange,
  onApprovalPeriodChange,
}: {
  organization?: Organization;
  tenantPortalCommunityEnabled: boolean;
  tenantPortalComparisonEnabled: boolean;
  tenantPortalChatbotEnabled: boolean;
  tenantPortalMaintenanceEnabled: boolean;
  checkInApprovalPeriodDays: number;
  onCommunityChange: (value: boolean) => void;
  onComparisonChange: (value: boolean) => void;
  onChatbotChange: (value: boolean) => void;
  onMaintenanceChange: (value: boolean) => void;
  onApprovalPeriodChange: (value: number) => void;
}) {
  const { toast } = useToast();
  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  const updateTenantPortalConfigMutation = useMutation({
    mutationFn: async () => {
      if (!user?.organizationId) return null;
      const response = await apiRequest("PATCH", `/api/organizations/${user.organizationId}/tenant-portal-config`, {
        tenantPortalCommunityEnabled,
        tenantPortalComparisonEnabled,
        tenantPortalChatbotEnabled,
        tenantPortalMaintenanceEnabled,
        checkInApprovalPeriodDays,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", user?.organizationId] });
      toast({
        title: "Success",
        description: "Tenant portal configuration updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update tenant portal configuration",
      });
    },
  });

  return (
    <div className="space-y-6">
      <Card className="border-2 rounded-2xl bg-card/80 backdrop-blur-xl shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Tenant Portal Configuration</CardTitle>
          <CardDescription className="mt-2">
            Enable or disable features available to tenants in the tenant portal. Disabled features will be hidden from the tenant interface.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <Label className="text-base font-medium">Community</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Allow tenants to access the community feature where they can interact with other tenants
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={tenantPortalCommunityEnabled}
                  onCheckedChange={onCommunityChange}
                  data-testid="toggle-community"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <Label className="text-base font-medium">Comparison Reports</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Allow tenants to view and sign comparison reports for their properties
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={tenantPortalComparisonEnabled}
                  onCheckedChange={onComparisonChange}
                  data-testid="toggle-comparison"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <Label className="text-base font-medium">AI Chatbot</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Enable the AI chatbot assistant to help tenants with questions and maintenance issues
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={tenantPortalChatbotEnabled}
                  onCheckedChange={onChatbotChange}
                  data-testid="toggle-chatbot"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <Label className="text-base font-medium">Maintenance Requests</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Allow tenants to create and manage maintenance requests through the portal
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={tenantPortalMaintenanceEnabled}
                  onCheckedChange={onMaintenanceChange}
                  data-testid="toggle-maintenance"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-6 space-y-4">
            <div>
              <Label className="text-base font-medium">Check-In Approval Period</Label>
              <p className="text-sm text-muted-foreground mt-1 mb-3">
                Number of days tenants have to review and approve check-in inspections (default: 5 days)
              </p>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={checkInApprovalPeriodDays}
                  onChange={(e) => onApprovalPeriodChange(parseInt(e.target.value) || 5)}
                  className="w-32"
                  data-testid="input-approval-period"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <Button 
              onClick={() => updateTenantPortalConfigMutation.mutate()}
              disabled={updateTenantPortalConfigMutation.isPending}
              data-testid="button-save-tenant-portal-config"
            >
              {updateTenantPortalConfigMutation.isPending ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Compliance Documents Management Panel - Shows actual compliance documents (synced with Compliance page)
function ComplianceDocumentsPanel() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<ComplianceDocument | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  // Use the same API endpoint as Compliance page to ensure sync
  const { data: documents = [], isLoading } = useQuery<ComplianceDocument[]>({
    queryKey: ['/api/compliance'],
    enabled: !!user?.organizationId,
  });

  // Fetch custom document types for the dropdown
  const { data: customDocumentTypes = [] } = useQuery<ComplianceDocumentType[]>({
    queryKey: ['/api/compliance/document-types'],
    enabled: !!user?.organizationId,
  });

  // Default document types
  const DEFAULT_DOCUMENT_TYPES = [
    "Fire Safety Certificate",
    "Building Insurance",
    "Electrical Safety Certificate",
    "Gas Safety Certificate",
    "EPC Certificate",
    "HMO License",
    "Planning Permission",
    "Other",
  ];

  // Combine default and custom document types
  const allDocumentTypes = [
    ...DEFAULT_DOCUMENT_TYPES,
    ...customDocumentTypes.map(t => t.name).filter(name => !DEFAULT_DOCUMENT_TYPES.includes(name))
  ].sort();

  // Form for creating/editing compliance documents
  const uploadFormSchema = insertComplianceDocumentSchema.omit({
    organizationId: true,
    uploadedBy: true,
  }).extend({
    documentUrl: z.string().optional(),
    expiryDate: z.string().optional(),
  });

  type UploadFormValues = z.infer<typeof uploadFormSchema>;

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
      documentType: "",
      documentUrl: "",
      expiryDate: undefined,
    },
  });

  const editForm = useForm({
    resolver: zodResolver(z.object({
      documentType: z.string().min(1, "Please select a document type"),
      expiryDate: z.string().optional(),
    })),
    defaultValues: {
      documentType: "",
      expiryDate: undefined,
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!user?.organizationId) throw new Error("User must belong to an organization");
      const payload: any = {
        ...data,
        organizationId: user.organizationId,
        uploadedBy: user.id,
      };
      if (payload.expiryDate) {
        payload.expiryDate = new Date(payload.expiryDate);
      }
      if (data.documentUrls && data.documentUrls.length > 0) {
        // Handle multiple files
        const results = [];
        for (const url of data.documentUrls) {
          const result = await apiRequest("POST", "/api/compliance", {
            ...payload,
            documentUrl: url,
          });
          results.push(await result.json());
        }
        return results;
      } else if (data.documentUrl) {
        const response = await apiRequest("POST", "/api/compliance", {
          ...payload,
          documentUrl: data.documentUrl,
        });
        return await response.json();
      }
      throw new Error("No document URL provided");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/compliance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/compliance/expiring'] });
      toast({ title: "Document uploaded successfully" });
      setIsCreateDialogOpen(false);
      setUploadedFiles([]);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to upload document",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const payload: any = { ...data };
      if (payload.expiryDate) {
        payload.expiryDate = new Date(payload.expiryDate);
      }
      return await apiRequest('PATCH', `/api/compliance/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/compliance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/compliance/expiring'] });
      toast({ title: "Document updated successfully" });
      setEditingDoc(null);
      editForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update document",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/compliance/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/compliance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/compliance/expiring'] });
      toast({ title: "Document deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete document",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (doc: ComplianceDocument) => {
    if (!doc.expiryDate) {
      return <Badge variant="secondary">No Expiry</Badge>;
    }
    const expiryDate = new Date(doc.expiryDate.toString());
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) {
      return <Badge variant="destructive">Expired</Badge>;
    } else if (daysUntilExpiry <= 30) {
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Due Soon</Badge>;
    } else {
      return <Badge variant="outline" className="border-green-500 text-green-600">Current</Badge>;
    }
  };

  const handleEdit = (doc: ComplianceDocument) => {
    setEditingDoc(doc);
    editForm.reset({
      documentType: doc.documentType,
      expiryDate: doc.expiryDate ? new Date(doc.expiryDate.toString()).toISOString().split('T')[0] : undefined,
    });
  };

  const onEditSubmit = (data: any) => {
    if (editingDoc) {
      updateMutation.mutate({ id: editingDoc.id, data });
    }
  };

  const onSubmit = (data: UploadFormValues) => {
    if (!data.documentType) {
      toast({
        title: "Validation error",
        description: "Please select a document type",
        variant: "destructive",
      });
      return;
    }
    
    if (uploadedFiles.length === 0) {
      toast({
        title: "Validation error",
        description: "Please upload at least one document",
        variant: "destructive",
      });
      return;
    }
    
    uploadMutation.mutate({
      ...data,
      documentUrls: uploadedFiles,
    });
  };

  return (
    <Card className="border-2 rounded-2xl bg-card/80 backdrop-blur-xl shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Compliance Documents</CardTitle>
            <CardDescription className="mt-2">
              Manage compliance documents. Documents added here will also appear in the Compliance section, and vice versa.
            </CardDescription>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Upload Document
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Upload Compliance Document</DialogTitle>
                <DialogDescription>
                  Upload a new compliance document
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="documentType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Document Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select document type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {allDocumentTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expiryDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expiry Date (Optional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div>
                    <Label>Upload File</Label>
                    <div className="mt-2">
                      <ObjectUploader
                        maxNumberOfFiles={1}
                        maxFileSize={10485760}
                        onGetUploadParameters={async () => {
                          const response = await fetch("/api/upload/generate-upload-url", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                          });
                          if (!response.ok) throw new Error("Failed to get upload URL");
                          const data = await response.json();
                          let uploadURL = data.uploadUrl;
                          if (uploadURL.startsWith('/')) {
                            uploadURL = `${window.location.origin}${uploadURL}`;
                          }
                          return { method: "PUT" as const, url: uploadURL };
                        }}
                        onComplete={(result) => {
                          if (result.successful && result.successful.length > 0) {
                            const fileUrl = result.successful[0].uploadURL || result.successful[0].meta?.extractedFileUrl;
                            if (fileUrl) {
                              setUploadedFiles([fileUrl]);
                            }
                          }
                        }}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Choose File
                      </ObjectUploader>
                      {uploadedFiles.length > 0 && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {uploadedFiles.length} file(s) ready to upload
                        </p>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={uploadMutation.isPending || uploadedFiles.length === 0}>
                      {uploadMutation.isPending ? "Uploading..." : "Upload Document"}
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
        ) : documents.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No compliance documents yet.</p>
            <p className="text-sm text-muted-foreground mt-2">
              Upload your first compliance document to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">{doc.documentType}</h3>
                        {getStatusBadge(doc)}
                      </div>
                      {doc.expiryDate && (
                        <p className="text-sm text-muted-foreground">
                          Expires: {formatDate(new Date(doc.expiryDate.toString()), 'PPP')}
                        </p>
                      )}
                      {doc.createdAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Uploaded: {formatDate(new Date(doc.createdAt.toString()), 'PPP')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Dialog open={editingDoc?.id === doc.id} onOpenChange={(open) => !open && setEditingDoc(null)}>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(doc)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit Document</DialogTitle>
                            <DialogDescription>
                              Update the document details
                            </DialogDescription>
                          </DialogHeader>
                          <Form {...editForm}>
                            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                              <FormField
                                control={editForm.control}
                                name="documentType"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Document Type</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                      <FormControl>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select document type" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {allDocumentTypes.map((type) => (
                                          <SelectItem key={type} value={type}>
                                            {type}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={editForm.control}
                                name="expiryDate"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Expiry Date (Optional)</FormLabel>
                                    <FormControl>
                                      <Input type="date" {...field} value={field.value || ""} />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <DialogFooter>
                                <Button type="submit" disabled={updateMutation.isPending}>
                                  {updateMutation.isPending ? "Updating..." : "Update Document"}
                                </Button>
                              </DialogFooter>
                            </form>
                          </Form>
                        </DialogContent>
                      </Dialog>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                      >
                        <a href={`/api/compliance/${doc.id}/view`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this document?")) {
                            deleteMutation.mutate(doc.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
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
