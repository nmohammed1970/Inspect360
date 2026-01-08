import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Shield, Search, Building2, Users, CreditCard, AlertCircle, CheckCircle, XCircle, DollarSign, History } from "lucide-react";
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
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [editDialog, setEditDialog] = useState(false);
  const [editFormData, setEditFormData] = useState({
    tierId: "",
    creditsRemaining: 0,
    isActive: true,
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

  // Fetch available tiers for the dropdown
  const { data: tiers = [] } = useQuery<any[]>({
    queryKey: ["/api/pricing/config"],
    select: (data: any) => data?.tiers || [],
  });

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
      setEditDialog(false);
      toast({
        title: "Instance Updated",
        description: "Instance settings have been updated successfully",
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

  const handleEditClick = (instance: any) => {
    setSelectedInstance(instance);
    setEditFormData({
      tierId: instance.subscription?.currentTierId || "",
      creditsRemaining: instance.creditsRemaining || 0,
      isActive: instance.isActive !== false,
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

  // Show loading state while checking authentication
  if (isLoadingAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!adminUser) {
    navigate("/admin/login");
    return null;
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

        {/* Instances Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading instances...
                    </TableCell>
                  </TableRow>
                ) : filteredInstances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No instances found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInstances.map((instance) => (
                    <TableRow key={instance.id} data-testid={`row-instance-${instance.id}`}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{instance.name}</div>
                          <div className="text-xs text-muted-foreground">{instance.id}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {instance.owner?.firstName} {instance.owner?.lastName}
                          </div>
                          <div className="text-xs text-muted-foreground">{instance.owner?.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {instance.tierName || instance.tierCode || "No Plan"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-muted-foreground" />
                          {instance.creditBalance?.total ?? instance.creditsRemaining ?? 0}
                          {instance.creditsRemaining && instance.creditBalance?.total && instance.creditsRemaining !== instance.creditBalance.total && (
                            <span className="text-xs text-muted-foreground">(legacy: {instance.creditsRemaining})</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(instance.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditClick(instance)}
                          data-testid={`button-edit-${instance.id}`}
                        >
                          Edit
                        </Button>
                        <Button
                          variant={instance.isActive !== false ? "destructive" : "default"}
                          size="sm"
                          onClick={() => toggleStatusMutation.mutate(instance.id)}
                          disabled={toggleStatusMutation.isPending}
                          data-testid={`button-toggle-${instance.id}`}
                        >
                          {instance.isActive !== false ? "Disable" : "Enable"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
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
              >
                <SelectTrigger data-testid="select-subscription-level">
                  <SelectValue placeholder="Select tier" />
                </SelectTrigger>
                <SelectContent>
                  {tiers.map((tier: any) => (
                    <SelectItem key={tier.id} value={tier.id}>
                      {tier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Credits Remaining</Label>
              <Input
                type="number"
                value={editFormData.creditsRemaining}
                onChange={(e) =>
                  setEditFormData({
                    ...editFormData,
                    creditsRemaining: parseInt(e.target.value) || 0,
                  })
                }
                data-testid="input-credits"
              />
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
