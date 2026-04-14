import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Shield, Search, Building2, Users, CreditCard, AlertCircle, CheckCircle, XCircle, DollarSign, History, Package, Sparkles, Loader2, Wrench, ChevronDown, Mail, User, Calendar } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { getTeamRoleDisplayLabel } from "@shared/roleLabels";

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [editDialog, setEditDialog] = useState(false);
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const [editFormData, setEditFormData] = useState({
    tierId: "",
    credits: 0,
    isActive: true,
    enabledModules: [] as string[], // Array of module IDs that are enabled
  });
  const [pricingOverrideDialog, setPricingOverrideDialog] = useState(false);
  const [selectedInstanceForOverride, setSelectedInstanceForOverride] = useState<any>(null);
  const [overrideFormData, setOverrideFormData] = useState({
    overrideMonthlyFee: "",
    overrideAnnualFee: "",
    overrideReason: "",
  });

  // Admin user is now checked in AdminPageWrapper

  // Fetch instances
  const { data: instances = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/instances"],
    retry: false,
  });

  // Use isLoading from instances query for loading state
  const isLoadingAdmin = isLoading;

  // Fetch available tiers for the dropdown
  const { data: configData, isLoading: tiersLoading } = useQuery({
    queryKey: ["/api/pricing/config"],
  });
  
  // Extract tiers from config data - filter only active tiers
  const tiers = (configData?.tiers || []).filter((tier: any) => tier.isActive !== false);
  
  // Fetch all available modules
  const { data: allModules = [], isLoading: modulesLoading, error: modulesError } = useQuery<any[]>({
    queryKey: ["/api/admin/modules"],
    queryFn: async () => {
      const response = await fetch("/api/admin/modules", {
        credentials: "include",
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[AdminDashboard] Failed to fetch modules:", response.status, errorText);
        throw new Error(`Failed to fetch modules: ${response.status} ${response.statusText}`);
      }
      const modules = await response.json();
      console.log("[AdminDashboard] Fetched modules:", modules);
      return modules;
    },
    enabled: editDialog, // Only fetch when edit dialog is open
    retry: false,
  });
  
  // Debug: Log tiers when loaded
  if (configData && tiers.length === 0) {
    console.warn("[AdminDashboard] No active tiers found in config:", configData);
  }

  // Logout is now handled in AdminProfileMenu

  // Pricing override mutations
  const pricingOverrideMutation = useMutation({
    mutationFn: async ({ organizationId, data }: { organizationId: string; data: any }) => {
      const res = await apiRequest("POST", `/api/admin/instances/${organizationId}/pricing-override`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/instances"] });
      toast({ title: "Pricing override updated successfully" });
      setPricingOverrideDialog(false);
      setOverrideFormData({ overrideMonthlyFee: "", overrideAnnualFee: "", overrideReason: "" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update pricing override", description: error.message, variant: "destructive" });
    },
  });

  const moduleOverrideMutation = useMutation({
    mutationFn: async ({ organizationId, moduleId, data }: { organizationId: string; moduleId: string; data: any }) => {
      const res = await apiRequest("POST", `/api/admin/instances/${organizationId}/modules/${moduleId}/override`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/instances"] });
      toast({ title: "Module override updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update module override", description: error.message, variant: "destructive" });
    },
  });

  const { data: overrideHistory = [] } = useQuery({
    queryKey: ["/api/admin/instances", selectedInstanceForOverride?.id, "override-history"],
    queryFn: async () => {
      if (!selectedInstanceForOverride?.id) return [];
      const res = await apiRequest("GET", `/api/admin/instances/${selectedInstanceForOverride.id}/override-history`);
      return res.json();
    },
    enabled: !!selectedInstanceForOverride?.id && pricingOverrideDialog,
  });

  // Update instance mutation
  const updateInstanceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await fetch(`/api/admin/instances/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to update instance");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/instances"] });
      // Also invalidate subscription and billing queries so operator side reflects changes
      queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/inspection-balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/calculate"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/config"] }); // Invalidate to refresh module status
      setEditDialog(false);
      toast({
        title: "Instance Updated",
        description: "Instance settings and modules have been updated successfully. Changes will reflect on the operator side.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Failed to update instance settings",
      });
    },
  });

  // Toggle status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/instances/${id}/toggle-status`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to toggle status");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/instances"] });
      toast({
        title: "Status Updated",
        description: "Instance status has been toggled successfully",
      });
    },
  });

  // Filter instances based on search
  const filteredInstances = instances.filter(
    (instance) =>
      instance.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      instance.owner?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      instance.owner?.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      instance.owner?.lastName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEditClick = async (instance: any) => {
    setSelectedInstance(instance);
    // Get current credit balance for display (use credit batch system only)
    const currentCredits = instance.creditBalance?.total ?? 0;
    
    // Fetch current enabled modules for this instance
    let enabledModuleIds: string[] = [];
    try {
      const modulesResponse = await fetch(`/api/admin/instances/${instance.id}/modules`, {
        credentials: "include",
      });
      if (modulesResponse.ok) {
        const modulesData = await modulesResponse.json();
        enabledModuleIds = (modulesData || [])
          .filter((im: any) => im.isEnabled)
          .map((im: any) => im.moduleId);
      }
    } catch (error) {
      console.error("Error fetching instance modules:", error);
    }
    
    setEditFormData({
      tierId: instance.subscription?.currentTierId || "",
      credits: currentCredits,
      isActive: instance.isActive !== false,
      enabledModules: enabledModuleIds,
    });
    setEditDialog(true);
  };

  const handleEditSubmit = () => {
    if (selectedInstance) {
      updateInstanceMutation.mutate({
        id: selectedInstance.id,
        data: editFormData,
      });
    }
  };

  // Show loading state while fetching instances
  // Note: Admin authentication is handled in AdminPageWrapper
  if (isLoadingAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading instances...</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Search Bar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Registered Instances
            </CardTitle>
            <CardDescription>
              Monitor and manage all registered organizations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by organization name, owner name, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-instances"
              />
            </div>
          </CardContent>
        </Card>

        {/* Instances Accordion */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                Loading instances...
              </div>
            ) : filteredInstances.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No instances found
              </div>
            ) : (
              <div className="w-full">
                {/* Table Header */}
                <div className="border-b bg-muted/50 px-6 py-3">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 flex-shrink-0" /> {/* Spacer for icon */}
                        <div className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                          Organization
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 flex-shrink-0">
                      {/* Owner Column */}
                      <div className="min-w-[180px] hidden lg:block">
                        <div className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                          Owner
                        </div>
                      </div>
                      
                      {/* Subscription Column */}
                      <div className="min-w-[120px] hidden md:block">
                        <div className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                          Subscription
                        </div>
                      </div>
                      
                      {/* Credits Column */}
                      <div className="min-w-[80px] hidden md:block">
                        <div className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                          Credits
                        </div>
                      </div>
                      
                      {/* Status Column */}
                      <div className="min-w-[100px] hidden sm:block">
                        <div className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                          Status
                        </div>
                      </div>
                      
                      {/* Created Date Column */}
                      <div className="min-w-[120px] hidden xl:block">
                        <div className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                          Created
                        </div>
                      </div>
                      
                      {/* Actions Column */}
                      <div className="min-w-[140px] flex-shrink-0 text-right">
                        <div className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                          Actions
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Accordion Items */}
                <Accordion type="multiple" value={expandedRows} onValueChange={setExpandedRows} className="w-full">
                  {filteredInstances.map((instance) => (
                    <OrganizationAccordionItem 
                      key={instance.id} 
                      instance={instance}
                      isExpanded={expandedRows.includes(instance.id)}
                      onEdit={handleEditClick}
                      onToggleStatus={() => toggleStatusMutation.mutate(instance.id)}
                      isToggling={toggleStatusMutation.isPending}
                    />
                  ))}
                </Accordion>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent data-testid="dialog-edit-instance">
          <DialogHeader>
            <DialogTitle>Edit Instance Settings</DialogTitle>
            <DialogDescription>
              Update subscription level, credits, and status for {selectedInstance?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Subscription Tier</Label>
              <Select
                value={editFormData.tierId}
                onValueChange={(value) =>
                  setEditFormData({ ...editFormData, tierId: value })
                }
                disabled={tiersLoading || tiers.length === 0}
              >
                <SelectTrigger data-testid="select-subscription-level">
                  <SelectValue placeholder={tiersLoading ? "Loading tiers..." : tiers.length === 0 ? "No tiers available" : "Select tier"} />
                </SelectTrigger>
                <SelectContent>
                  {tiers.length > 0 && tiers.map((tier: any) => (
                    <SelectItem key={tier.id} value={tier.id}>
                      {tier.name} ({tier.includedInspections} included)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Credits</Label>
              <Input
                type="number"
                value={editFormData.credits}
                onChange={(e) =>
                  setEditFormData({
                    ...editFormData,
                    credits: parseInt(e.target.value) || 0,
                  })
                }
                data-testid="input-credits"
              />
              <p className="text-xs text-muted-foreground">
                Set the total number of credits for this organization
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isActive"
                checked={editFormData.isActive}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, isActive: e.target.checked })
                }
                className="w-4 h-4"
                data-testid="checkbox-is-active"
              />
              <Label htmlFor="isActive">Instance Active</Label>
            </div>
            
            {/* Modules Section */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <div>
                  <Label className="text-base font-semibold">Modules</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Enable or disable modules for this organization. Changes will reflect on the operator portal.
                  </p>
                </div>
              </div>
              
              {modulesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                  <p className="text-sm text-muted-foreground">Loading modules...</p>
                </div>
              ) : modulesError ? (
                <div className="space-y-2 p-4 rounded-lg border border-destructive/50 bg-destructive/5">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <p className="text-sm font-medium text-destructive">Error loading modules</p>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">
                    {modulesError instanceof Error ? modulesError.message : "Unknown error"}
                  </p>
                </div>
              ) : allModules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 px-4 rounded-lg border border-dashed bg-muted/30">
                  <Package className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-muted-foreground text-center">
                    No modules available
                  </p>
                  <p className="text-xs text-muted-foreground text-center mt-1">
                    Please create modules in the Eco Admin section first.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                  {allModules
                    .filter((module: any) => module.isAvailableGlobally !== false)
                    .map((module: any) => {
                      const isEnabled = editFormData.enabledModules.includes(module.id);
                      // Get icon component dynamically based on iconName
                      const getIcon = () => {
                        const iconName = module.iconName?.toLowerCase();
                        if (!iconName) return Package;
                        // Map common icon names to lucide icons
                        const iconMap: Record<string, any> = {
                          wrench: Wrench,
                          users: Users,
                          user: Users,
                          layout: Building2,
                          building: Building2,
                          shield: Shield,
                          creditcard: CreditCard,
                          package: Package,
                          sparkles: Sparkles,
                        };
                        return iconMap[iconName] || Package;
                      };
                      const IconComponent = getIcon();
                      
                      return (
                        <div
                          key={module.id}
                          className={`
                            relative flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer
                            ${isEnabled 
                              ? 'border-primary/50 bg-primary/5 hover:bg-primary/10' 
                              : 'border-border hover:border-primary/30 hover:bg-muted/50'
                            }
                          `}
                          onClick={() => {
                            if (isEnabled) {
                              setEditFormData({
                                ...editFormData,
                                enabledModules: editFormData.enabledModules.filter((id) => id !== module.id),
                              });
                            } else {
                              setEditFormData({
                                ...editFormData,
                                enabledModules: [...editFormData.enabledModules, module.id],
                              });
                            }
                          }}
                        >
                          <div className={`
                            flex items-center justify-center h-10 w-10 rounded-lg transition-colors
                            ${isEnabled 
                              ? 'bg-primary/10 text-primary' 
                              : 'bg-muted text-muted-foreground'
                            }
                          `}>
                            <IconComponent className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Label
                                htmlFor={`module-${module.id}`}
                                className="flex-1 cursor-pointer font-medium text-sm"
                              >
                                {module.name}
                              </Label>
                              {isEnabled && (
                                <Badge variant="default" className="text-xs">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Active
                                </Badge>
                              )}
                            </div>
                            {module.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {module.description}
                              </p>
                            )}
                          </div>
                          <Checkbox
                            id={`module-${module.id}`}
                            checked={isEnabled}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setEditFormData({
                                  ...editFormData,
                                  enabledModules: [...editFormData.enabledModules, module.id],
                                });
                              } else {
                                setEditFormData({
                                  ...editFormData,
                                  enabledModules: editFormData.enabledModules.filter((id) => id !== module.id),
                                });
                              }
                            }}
                            data-testid={`checkbox-module-${module.id}`}
                            className="mt-1"
                          />
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={updateInstanceMutation.isPending}
              data-testid="button-save-instance"
            >
              {updateInstanceMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pricing Override Dialog */}
      <Dialog open={pricingOverrideDialog} onOpenChange={setPricingOverrideDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pricing Override - {selectedInstanceForOverride?.name}</DialogTitle>
            <DialogDescription>
              Set custom pricing overrides for this instance. These will override the standard tier pricing.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="subscription" className="mt-4">
            <TabsList>
              <TabsTrigger value="subscription">Subscription Override</TabsTrigger>
              <TabsTrigger value="modules">Module Overrides</TabsTrigger>
              <TabsTrigger value="history">Override History</TabsTrigger>
            </TabsList>

            <TabsContent value="subscription" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div>
                  <Label>Current Tier</Label>
                  <p className="text-sm text-muted-foreground">
                    {selectedInstanceForOverride?.tierName || "No tier assigned"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="overrideMonthlyFee">Override Monthly Fee</Label>
                    <Input
                      id="overrideMonthlyFee"
                      type="number"
                      step="0.01"
                      placeholder="Leave empty to use standard pricing"
                      value={overrideFormData.overrideMonthlyFee}
                      onChange={(e) => setOverrideFormData({ ...overrideFormData, overrideMonthlyFee: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter amount in major currency units (e.g., 500.00 for £500)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="overrideAnnualFee">Override Annual Fee</Label>
                    <Input
                      id="overrideAnnualFee"
                      type="number"
                      step="0.01"
                      placeholder="Leave empty to use standard pricing"
                      value={overrideFormData.overrideAnnualFee}
                      onChange={(e) => setOverrideFormData({ ...overrideFormData, overrideAnnualFee: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter amount in major currency units (e.g., 5000.00 for £5000)
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="overrideReason">Reason for Override</Label>
                  <Textarea
                    id="overrideReason"
                    placeholder="e.g., Annual contract negotiation - 28% discount"
                    value={overrideFormData.overrideReason}
                    onChange={(e) => setOverrideFormData({ ...overrideFormData, overrideReason: e.target.value })}
                    rows={3}
                  />
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setPricingOverrideDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      pricingOverrideMutation.mutate({
                        organizationId: selectedInstanceForOverride?.id,
                        data: {
                          overrideMonthlyFee: overrideFormData.overrideMonthlyFee ? parseFloat(overrideFormData.overrideMonthlyFee) : null,
                          overrideAnnualFee: overrideFormData.overrideAnnualFee ? parseFloat(overrideFormData.overrideAnnualFee) : null,
                          overrideReason: overrideFormData.overrideReason || null,
                        },
                      });
                    }}
                    disabled={pricingOverrideMutation.isPending}
                  >
                    {pricingOverrideMutation.isPending ? "Saving..." : "Save Override"}
                  </Button>
                </DialogFooter>
              </div>
            </TabsContent>

            <TabsContent value="modules" className="mt-4">
              <p className="text-sm text-muted-foreground mb-4">
                Module override management coming soon. Use subscription override for now.
              </p>
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <div className="space-y-2">
                {overrideHistory.length > 0 ? (
                  <div className="space-y-2">
                    {overrideHistory.map((entry: any) => (
                      <Card key={entry.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <p className="font-semibold text-sm">{entry.overrideType} Override</p>
                              <p className="text-xs text-muted-foreground">{entry.reason || "No reason provided"}</p>
                              <p className="text-xs text-muted-foreground">
                                {entry.changeDate ? format(new Date(entry.changeDate), "PPP p") : "Unknown date"}
                              </p>
                            </div>
                            <div className="text-right text-sm">
                              {entry.newPriceMonthly && (
                                <p>Monthly: {entry.oldPriceMonthly ? `£${(entry.oldPriceMonthly / 100).toFixed(2)}` : "N/A"} → £{(entry.newPriceMonthly / 100).toFixed(2)}</p>
                              )}
                              {entry.newPriceAnnual && (
                                <p>Annual: {entry.oldPriceAnnual ? `£${(entry.oldPriceAnnual / 100).toFixed(2)}` : "N/A"} → £{(entry.newPriceAnnual / 100).toFixed(2)}</p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No override history found</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Organization Accordion Item Component
function OrganizationAccordionItem({ 
  instance, 
  isExpanded,
  onEdit, 
  onToggleStatus, 
  isToggling 
}: { 
  instance: any; 
  isExpanded: boolean;
  onEdit: (instance: any) => void; 
  onToggleStatus: () => void; 
  isToggling: boolean;
}) {
  const { data: teamMembers = [], isLoading: isLoadingMembers } = useQuery<any[]>({
    queryKey: ["/api/admin/instances", instance.id, "users"],
    queryFn: async () => {
      const response = await fetch(`/api/admin/instances/${instance.id}/users`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch team members");
      }
      return response.json();
    },
    enabled: isExpanded,
    retry: false,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default";
      case "tenant":
        return "secondary";
      case "clerk":
      case "operator":
        return "outline";
      case "compliance":
        return "default";
      default:
        return "secondary";
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <Shield className="h-3 w-3" />;
      case "tenant":
        return <User className="h-3 w-3" />;
      case "clerk":
      case "operator":
        return <Users className="h-3 w-3" />;
      case "compliance":
        return <CheckCircle className="h-3 w-3" />;
      default:
        return <User className="h-3 w-3" />;
    }
  };

  // Group team members by role
  const groupedMembers = teamMembers.reduce((acc, member) => {
    const role = member.role || "other";
    if (!acc[role]) {
      acc[role] = [];
    }
    acc[role].push(member);
    return acc;
  }, {} as Record<string, any[]>);

  const roleOrder = ["owner", "operator", "clerk", "compliance", "tenant", "other"];

  return (
    <AccordionItem value={instance.id} className="border-b">
      <AccordionTrigger className="hover:no-underline px-6 py-4">
        <div className="flex items-center justify-between w-full pr-4">
          <div className="flex items-center gap-4 flex-1">
            {/* Organization Column */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base truncate">{instance.name}</div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">ID: {instance.id}</div>
                </div>
              </div>
            </div>
            
            {/* Other Columns */}
            <div className="flex items-center gap-6 flex-shrink-0">
              {/* Owner Column */}
              <div className="min-w-[180px] hidden lg:block">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">
                      {instance.owner?.firstName} {instance.owner?.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{instance.owner?.email}</div>
                  </div>
                </div>
              </div>
              
              {/* Subscription Column */}
              <div className="min-w-[120px] hidden md:block">
                <Badge variant="outline" className="capitalize">
                  {instance.tierName || instance.tierCode || "No Plan"}
                </Badge>
              </div>
              
              {/* Credits Column */}
              <div className="min-w-[80px] hidden md:flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium text-sm">{instance.creditBalance?.total ?? 0}</span>
              </div>
              
              {/* Status Column */}
              <div className="min-w-[100px] hidden sm:block">
                {instance.isActive !== false ? (
                  <Badge variant="default" className="flex items-center gap-1 w-fit">
                    <CheckCircle className="w-3 h-3" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                    <XCircle className="w-3 h-3" />
                    Disabled
                  </Badge>
                )}
              </div>
              
              {/* Created Date Column */}
              <div className="min-w-[120px] hidden xl:flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 flex-shrink-0" />
                <span>{format(new Date(instance.createdAt), "dd MMM yyyy")}</span>
              </div>
              
              {/* Actions Column */}
              <div className="min-w-[140px] flex-shrink-0 flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(instance)}
                  data-testid={`button-edit-${instance.id}`}
                >
                  Edit
                </Button>
                <Button
                  variant={instance.isActive !== false ? "destructive" : "default"}
                  size="sm"
                  onClick={onToggleStatus}
                  disabled={isToggling}
                  data-testid={`button-toggle-${instance.id}`}
                >
                  {instance.isActive !== false ? "Disable" : "Enable"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-6 pb-4">
        <div className="pt-4 border-t bg-muted/30 rounded-lg p-4">
          {isLoadingMembers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
              <span className="text-sm text-muted-foreground">Loading team members...</span>
            </div>
          ) : teamMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No team members found</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-sm">Team Members ({teamMembers.length})</h4>
              </div>
              <div className="grid gap-3">
                {roleOrder
                  .filter(role => groupedMembers[role]?.length > 0)
                  .map(role => (
                    <div key={role} className="space-y-2">
                      <div className="flex items-center gap-2">
                        {getRoleIcon(role)}
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {role === "other" ? "Other" : getTeamRoleDisplayLabel(role)}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {groupedMembers[role].length}
                        </Badge>
                      </div>
                      <div className="grid gap-2 pl-6">
                        {groupedMembers[role].map((member: any) => (
                          <Card key={member.id} className="bg-background/50 border">
                            <CardContent className="p-3">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge variant={getRoleBadgeVariant(member.role)} className="text-xs">
                                      {getRoleIcon(member.role)}
                                      <span className="ml-1">{getTeamRoleDisplayLabel(member.role)}</span>
                                    </Badge>
                                    {member.isActive === false && (
                                      <Badge variant="destructive" className="text-xs">
                                        Inactive
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                      <span className="font-medium text-sm truncate">
                                        {member.firstName} {member.lastName}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                      <span className="text-xs text-muted-foreground truncate">{member.email}</span>
                                    </div>
                                    {member.username && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground ml-5">
                                          Username: <span className="font-medium">{member.username}</span>
                                        </span>
                                      </div>
                                    )}
                                    {member.createdAt && (
                                      <div className="flex items-center gap-2">
                                        <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 ml-5" />
                                        <span className="text-xs text-muted-foreground">
                                          Joined: {format(new Date(member.createdAt), "dd MMM yyyy")}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
