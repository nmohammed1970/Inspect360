import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Edit, Trash2, Save, X, Package, CreditCard, Globe, Loader2 } from "lucide-react";
import type { Plan, CreditBundle, CountryPricingOverride } from "@shared/schema";

export default function EcoAdmin() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("plans");
  const [, navigate] = useLocation();

  // Fetch admin user for authentication
  const { data: adminUser, isLoading: isLoadingAdmin } = useQuery({
    queryKey: ["/api/admin/me"],
    retry: false,
  });

  // Show loading state while checking authentication
  if (isLoadingAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin h-12 w-12 text-primary mx-auto mb-4" />
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
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-title">Eco Admin Dashboard</h1>
        <p className="text-muted-foreground" data-testid="text-subtitle">
          Manage subscription plans, credit bundles, and multi-currency pricing
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="plans" data-testid="tab-plans">
            <Package className="h-4 w-4 mr-2" />
            Subscription Plans
          </TabsTrigger>
          <TabsTrigger value="bundles" data-testid="tab-bundles">
            <CreditCard className="h-4 w-4 mr-2" />
            Credit Bundles
          </TabsTrigger>
          <TabsTrigger value="pricing" data-testid="tab-pricing">
            <Globe className="h-4 w-4 mr-2" />
            Multi-Currency Pricing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-6">
          <PlansManagement />
        </TabsContent>

        <TabsContent value="bundles" className="mt-6">
          <BundlesManagement />
        </TabsContent>

        <TabsContent value="pricing" className="mt-6">
          <CountryPricingManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlansManagement() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Plan>>({});

  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/admin/plans"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Plan>) => {
      return await apiRequest("/api/admin/plans", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      toast({ title: "Plan created successfully" });
      setFormData({});
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create plan", 
        description: error.message || "Invalid data provided",
        variant: "destructive" 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Plan> }) => {
      return await apiRequest(`/api/admin/plans/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      toast({ title: "Plan updated successfully" });
      setEditingId(null);
      setFormData({});
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update plan", 
        description: error.message || "Invalid data provided",
        variant: "destructive" 
      });
    },
  });

  const handleSave = () => {
    if (!formData.code || !formData.name || !formData.monthlyPriceGbp || !formData.includedCredits) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }

    // Build clean payload - strip read-only fields
    const payload = {
      code: formData.code,
      name: formData.name,
      monthlyPriceGbp: formData.monthlyPriceGbp,
      includedCredits: formData.includedCredits,
      softCap: formData.softCap || 5000,
      isCustom: formData.isCustom || false,
      isActive: formData.isActive !== undefined ? formData.isActive : true,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const startEdit = (plan: Plan) => {
    setEditingId(plan.id);
    setFormData(plan);
  };

  if (isLoading) {
    return <div>Loading plans...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {editingId ? "Edit Plan" : "Create New Plan"}
          </CardTitle>
          <CardDescription>
            Configure subscription plan details and pricing (GBP base currency)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Plan Code</Label>
              <Input
                id="code"
                value={formData.code || ""}
                onChange={(e) => setFormData({ ...formData, code: e.target.value as any })}
                placeholder="starter, professional, etc."
                data-testid="input-plan-code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Plan Name</Label>
              <Input
                id="name"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Starter Plan"
                data-testid="input-plan-name"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Monthly Price (GBP Pence)</Label>
              <Input
                id="price"
                type="number"
                value={formData.monthlyPriceGbp || ""}
                onChange={(e) => setFormData({ ...formData, monthlyPriceGbp: parseInt(e.target.value) })}
                placeholder="4900 = £49.00"
                data-testid="input-monthly-price"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="credits">Included Credits</Label>
              <Input
                id="credits"
                type="number"
                value={formData.includedCredits || ""}
                onChange={(e) => setFormData({ ...formData, includedCredits: parseInt(e.target.value) })}
                placeholder="50"
                data-testid="input-included-credits"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="softCap">Soft Cap (Fair Usage)</Label>
              <Input
                id="softCap"
                type="number"
                value={formData.softCap || 5000}
                onChange={(e) => setFormData({ ...formData, softCap: parseInt(e.target.value) })}
                placeholder="5000"
                data-testid="input-soft-cap"
              />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.isActive ?? true}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                data-testid="checkbox-active"
              />
              <span>Active</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.isCustom ?? false}
                onChange={(e) => setFormData({ ...formData, isCustom: e.target.checked })}
                data-testid="checkbox-custom"
              />
              <span>Custom Plan</span>
            </label>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} data-testid="button-save-plan">
              <Save className="h-4 w-4 mr-2" />
              {editingId ? "Update Plan" : "Create Plan"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={() => {
                setEditingId(null);
                setFormData({});
              }} data-testid="button-cancel-edit">
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Plans</CardTitle>
          <CardDescription>All subscription plans in the system</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {plans && plans.length > 0 ? (
              plans.map((plan) => (
                <div key={plan.id} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`card-plan-${plan.id}`}>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold" data-testid={`text-plan-name-${plan.id}`}>{plan.name}</h3>
                      <Badge variant="outline" data-testid={`badge-plan-code-${plan.id}`}>{plan.code}</Badge>
                      {plan.isActive && <Badge data-testid={`badge-active-${plan.id}`}>Active</Badge>}
                      {plan.isCustom && <Badge variant="secondary" data-testid={`badge-custom-${plan.id}`}>Custom</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground" data-testid={`text-plan-details-${plan.id}`}>
                      £{(plan.monthlyPriceGbp / 100).toFixed(2)}/month · {plan.includedCredits} credits · Soft Cap: {plan.softCap}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => startEdit(plan)} data-testid={`button-edit-plan-${plan.id}`}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8" data-testid="text-no-plans">No plans created yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BundlesManagement() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<CreditBundle>>({});

  const { data: bundles, isLoading } = useQuery<CreditBundle[]>({
    queryKey: ["/api/admin/bundles"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<CreditBundle>) => {
      return await apiRequest("/api/admin/bundles", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bundles"] });
      toast({ title: "Bundle created successfully" });
      setFormData({});
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create bundle", 
        description: error.message || "Invalid data provided",
        variant: "destructive" 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreditBundle> }) => {
      return await apiRequest(`/api/admin/bundles/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bundles"] });
      toast({ title: "Bundle updated successfully" });
      setEditingId(null);
      setFormData({});
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update bundle", 
        description: error.message || "Invalid data provided",
        variant: "destructive" 
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/bundles/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bundles"] });
      toast({ title: "Bundle deleted successfully" });
    },
  });

  const handleSave = () => {
    if (!formData.name || !formData.credits || !formData.priceGbp || !formData.priceUsd || !formData.priceAed) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }

    // Build clean payload - strip read-only fields
    const payload = {
      name: formData.name,
      credits: formData.credits,
      priceGbp: formData.priceGbp,
      priceUsd: formData.priceUsd,
      priceAed: formData.priceAed,
      sortOrder: formData.sortOrder || 0,
      isPopular: formData.isPopular || false,
      discountLabel: formData.discountLabel || null,
      isActive: formData.isActive !== undefined ? formData.isActive : true,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const startEdit = (bundle: CreditBundle) => {
    setEditingId(bundle.id);
    setFormData(bundle);
  };

  if (isLoading) {
    return <div>Loading bundles...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {editingId ? "Edit Credit Bundle" : "Create New Credit Bundle"}
          </CardTitle>
          <CardDescription>
            Configure add-on credit packages with multi-currency pricing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bundle-name">Bundle Name</Label>
              <Input
                id="bundle-name"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="100 Credits Pack"
                data-testid="input-bundle-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bundle-credits">Credits</Label>
              <Input
                id="bundle-credits"
                type="number"
                value={formData.credits || ""}
                onChange={(e) => setFormData({ ...formData, credits: parseInt(e.target.value) })}
                placeholder="100"
                data-testid="input-bundle-credits"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price-gbp">Price (GBP Pence)</Label>
              <Input
                id="price-gbp"
                type="number"
                value={formData.priceGbp || ""}
                onChange={(e) => setFormData({ ...formData, priceGbp: parseInt(e.target.value) })}
                placeholder="40000 = £400"
                data-testid="input-price-gbp"
              />
              <p className="text-xs text-muted-foreground">
                {formData.priceGbp && formData.credits 
                  ? `£${(formData.priceGbp / 100 / formData.credits).toFixed(2)} per credit`
                  : ""}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price-usd">Price (USD Cents)</Label>
              <Input
                id="price-usd"
                type="number"
                value={formData.priceUsd || ""}
                onChange={(e) => setFormData({ ...formData, priceUsd: parseInt(e.target.value) })}
                placeholder="50000 = $500"
                data-testid="input-price-usd"
              />
              <p className="text-xs text-muted-foreground">
                {formData.priceUsd && formData.credits 
                  ? `$${(formData.priceUsd / 100 / formData.credits).toFixed(2)} per credit`
                  : ""}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price-aed">Price (AED Fils)</Label>
              <Input
                id="price-aed"
                type="number"
                value={formData.priceAed || ""}
                onChange={(e) => setFormData({ ...formData, priceAed: parseInt(e.target.value) })}
                placeholder="180000 = AED 1800"
                data-testid="input-price-aed"
              />
              <p className="text-xs text-muted-foreground">
                {formData.priceAed && formData.credits 
                  ? `AED ${(formData.priceAed / 100 / formData.credits).toFixed(2)} per credit`
                  : ""}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sort-order">Sort Order</Label>
              <Input
                id="sort-order"
                type="number"
                value={formData.sortOrder || 0}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) })}
                placeholder="0"
                data-testid="input-sort-order"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount-label">Discount Label (optional)</Label>
              <Input
                id="discount-label"
                value={formData.discountLabel || ""}
                onChange={(e) => setFormData({ ...formData, discountLabel: e.target.value || null })}
                placeholder="Best Value"
                data-testid="input-discount-label"
              />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.isActive ?? true}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                data-testid="checkbox-bundle-active"
              />
              <span>Active</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.isPopular ?? false}
                onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })}
                data-testid="checkbox-popular"
              />
              <span>Mark as Popular</span>
            </label>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} data-testid="button-save-bundle">
              <Save className="h-4 w-4 mr-2" />
              {editingId ? "Update Bundle" : "Create Bundle"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={() => {
                setEditingId(null);
                setFormData({});
              }} data-testid="button-cancel-bundle-edit">
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Credit Bundles</CardTitle>
          <CardDescription>All add-on credit packages in the system</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {bundles && bundles.length > 0 ? (
              bundles.map((bundle) => (
                <div key={bundle.id} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`card-bundle-${bundle.id}`}>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold" data-testid={`text-bundle-name-${bundle.id}`}>{bundle.name}</h3>
                      <Badge data-testid={`badge-bundle-credits-${bundle.id}`}>{bundle.credits} Credits</Badge>
                      {bundle.isPopular && <Badge variant="secondary" data-testid={`badge-popular-${bundle.id}`}>Popular</Badge>}
                      {bundle.isActive && <Badge data-testid={`badge-bundle-active-${bundle.id}`}>Active</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground" data-testid={`text-bundle-pricing-${bundle.id}`}>
                      £{(bundle.priceGbp / 100).toFixed(2)} · ${(bundle.priceUsd / 100).toFixed(2)} · AED {(bundle.priceAed / 100).toFixed(2)}
                    </p>
                    {bundle.discountLabel && (
                      <Badge variant="outline" className="text-xs" data-testid={`badge-discount-${bundle.id}`}>{bundle.discountLabel}</Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => startEdit(bundle)} data-testid={`button-edit-bundle-${bundle.id}`}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => {
                      if (confirm("Are you sure you want to delete this bundle?")) {
                        deleteMutation.mutate(bundle.id);
                      }
                    }} data-testid={`button-delete-bundle-${bundle.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8" data-testid="text-no-bundles">No bundles created yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CountryPricingManagement() {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<CountryPricingOverride>>({});

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ["/api/admin/plans"],
  });

  const { data: overrides, isLoading } = useQuery<CountryPricingOverride[]>({
    queryKey: ["/api/admin/country-pricing"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<CountryPricingOverride>) => {
      return await apiRequest("/api/admin/country-pricing", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/country-pricing"] });
      toast({ title: "Country pricing created successfully" });
      setFormData({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/country-pricing/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/country-pricing"] });
      toast({ title: "Country pricing deleted successfully" });
    },
  });

  const handleSave = () => {
    if (!formData.countryCode || !formData.planId || !formData.currency || !formData.monthlyPriceMinorUnits) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }

    createMutation.mutate(formData);
  };

  if (isLoading) {
    return <div>Loading country pricing...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Country Pricing Override</CardTitle>
          <CardDescription>
            Configure region-specific pricing for subscription plans
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="country-code">Country Code (ISO 3166-1 alpha-2)</Label>
              <Input
                id="country-code"
                value={formData.countryCode || ""}
                onChange={(e) => setFormData({ ...formData, countryCode: e.target.value.toUpperCase() })}
                placeholder="US, AE, etc."
                maxLength={2}
                data-testid="input-country-code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-select">Plan</Label>
              <select
                id="plan-select"
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={formData.planId || ""}
                onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
                data-testid="select-plan"
              >
                <option value="">Select a plan</option>
                {plans?.map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={formData.currency || ""}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value as any })}
                data-testid="select-currency"
              >
                <option value="">Select currency</option>
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
                <option value="AED">AED</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly-price">Monthly Price (Minor Units)</Label>
              <Input
                id="monthly-price"
                type="number"
                value={formData.monthlyPriceMinorUnits || ""}
                onChange={(e) => setFormData({ ...formData, monthlyPriceMinorUnits: parseInt(e.target.value) })}
                placeholder="4900 for £49 or $49"
                data-testid="input-monthly-price-minor"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topup-price">Top-up Price per Credit (Minor Units)</Label>
              <Input
                id="topup-price"
                type="number"
                value={formData.topupPricePerCreditMinorUnits || ""}
                onChange={(e) => setFormData({ ...formData, topupPricePerCreditMinorUnits: parseInt(e.target.value) || null })}
                placeholder="75 for £0.75"
                data-testid="input-topup-price"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="credits-override">Included Credits Override (optional)</Label>
            <Input
              id="credits-override"
              type="number"
              value={formData.includedCreditsOverride || ""}
              onChange={(e) => setFormData({ ...formData, includedCreditsOverride: parseInt(e.target.value) || null })}
              placeholder="Leave empty to use plan default"
              data-testid="input-credits-override"
            />
          </div>

          <Button onClick={handleSave} data-testid="button-save-pricing">
            <Plus className="h-4 w-4 mr-2" />
            Create Country Pricing
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Country Pricing Overrides</CardTitle>
          <CardDescription>All region-specific pricing configurations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {overrides && overrides.length > 0 ? (
              overrides.map((override) => {
                const plan = plans?.find(p => p.id === override.planId);
                return (
                  <div key={override.id} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`card-override-${override.id}`}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" data-testid={`badge-country-${override.id}`}>{override.countryCode}</Badge>
                        <h3 className="font-semibold" data-testid={`text-plan-name-override-${override.id}`}>{plan?.name || "Unknown Plan"}</h3>
                        <Badge data-testid={`badge-currency-${override.id}`}>{override.currency}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground" data-testid={`text-override-details-${override.id}`}>
                        Monthly: {override.currency} {(override.monthlyPriceMinorUnits / 100).toFixed(2)}
                        {override.topupPricePerCreditMinorUnits && (
                          ` · Top-up: ${override.currency} ${(override.topupPricePerCreditMinorUnits / 100).toFixed(2)}/credit`
                        )}
                        {override.includedCreditsOverride && ` · Credits: ${override.includedCreditsOverride}`}
                      </p>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => {
                      if (confirm("Are you sure you want to delete this override?")) {
                        deleteMutation.mutate(override.id);
                      }
                    }} data-testid={`button-delete-override-${override.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            ) : (
              <p className="text-center text-muted-foreground py-8" data-testid="text-no-overrides">No country pricing overrides created yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
