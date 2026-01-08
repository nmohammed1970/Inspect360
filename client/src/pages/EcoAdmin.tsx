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
import { Plus, Edit, Trash2, Save, X, Package, CreditCard, Globe, Loader2, Settings, Gift, Info, MessageSquarePlus, Bug, Lightbulb, TrendingUp, Clock, Eye, CheckCircle2, XCircle, AlertCircle, Filter, Download, FileText } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import type { Plan, CreditBundle, CountryPricingOverride } from "@shared/schema";
import { 
  CurrencyManagement, 
  SubscriptionTierManagement, 
  AddonPackManagement, 
  ExtensiveInspectionManagement, 
  PricingPreview,
  QuotationsManagement
} from "./EcoAdminComponents";

export default function EcoAdmin() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("plans");
  const [, navigate] = useLocation();

  // Admin user is now checked in AdminPageWrapper

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-title">Eco Admin Dashboard</h1>
        <p className="text-muted-foreground" data-testid="text-subtitle">
          Manage subscription plans, credit bundles, and multi-currency pricing
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="currencies" data-testid="tab-currencies">
            <Globe className="h-4 w-4 mr-2" />
            Currencies
          </TabsTrigger>
          <TabsTrigger value="tiers" data-testid="tab-tiers">
            <Package className="h-4 w-4 mr-2" />
            Tiers
          </TabsTrigger>
          <TabsTrigger value="addon-packs" data-testid="tab-addon-packs">
            <CreditCard className="h-4 w-4 mr-2" />
            Add-On Packs
          </TabsTrigger>
          <TabsTrigger value="extensive" data-testid="tab-extensive">
            <Info className="h-4 w-4 mr-2" />
            Extensive
          </TabsTrigger>
          <TabsTrigger value="pricing-preview" data-testid="tab-pricing-preview">
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </TabsTrigger>
          <TabsTrigger value="quotations" data-testid="tab-quotations">
            <FileText className="h-4 w-4 mr-2" />
            Quotations
          </TabsTrigger>
          <TabsTrigger value="plans" data-testid="tab-plans">
            <Package className="h-4 w-4 mr-2" />
            Legacy Plans
          </TabsTrigger>
          <TabsTrigger value="pricing" data-testid="tab-pricing">
            <Globe className="h-4 w-4 mr-2" />
            Country Pricing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="currencies" className="mt-6">
          <CurrencyManagement />
        </TabsContent>

        <TabsContent value="tiers" className="mt-6">
          <SubscriptionTierManagement />
        </TabsContent>

        <TabsContent value="addon-packs" className="mt-6">
          <AddonPackManagement />
        </TabsContent>

        <TabsContent value="extensive" className="mt-6">
          <ExtensiveInspectionManagement />
        </TabsContent>

        <TabsContent value="pricing-preview" className="mt-6">
          <PricingPreview />
        </TabsContent>

        <TabsContent value="quotations" className="mt-6">
          <QuotationsManagement />
        </TabsContent>

        <TabsContent value="plans" className="mt-6">
          <PlansManagement />
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
      annualPriceGbp: formData.annualPriceGbp || null,
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

          <div className="grid grid-cols-2 gap-4 mb-4">
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
              <Label htmlFor="annual-price">Annual Price (GBP Pence - Optional)</Label>
              <Input
                id="annual-price"
                type="number"
                value={formData.annualPriceGbp || ""}
                onChange={(e) => setFormData({ ...formData, annualPriceGbp: parseInt(e.target.value) || null })}
                placeholder="52920 = £529.20 (save 10%)"
                data-testid="input-annual-price"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
                        Monthly: {override.currency === "GBP" ? "£" : override.currency === "USD" ? "$" : override.currency === "AED" ? "د.إ" : override.currency}{" "}
                        {(override.monthlyPriceMinorUnits / 100).toFixed(2)}
                        {override.topupPricePerCreditMinorUnits && (
                          ` · Top-up: ${override.currency === "GBP" ? "£" : override.currency === "USD" ? "$" : override.currency === "AED" ? "د.إ" : override.currency}${(override.topupPricePerCreditMinorUnits / 100).toFixed(2)}/credit`
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

function RegistrationSettings() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Registration Defaults
          </CardTitle>
          <CardDescription>
            Default settings applied when new users register for Inspect360
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold" data-testid="text-welcome-credits-title">Welcome Credits</h3>
                  <p className="text-sm text-muted-foreground">Credits given to new registrations</p>
                </div>
              </div>
              <div className="mt-4">
                <Badge variant="default" className="text-lg px-3 py-1" data-testid="badge-welcome-credits">
                  5 Inspection Credits
                </Badge>
              </div>
            </div>

            <div className="p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                  <Package className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold" data-testid="text-default-templates-title">Default Templates</h3>
                  <p className="text-sm text-muted-foreground">Inspection templates included</p>
                </div>
              </div>
              <div className="mt-4">
                <Badge variant="secondary" className="text-lg px-3 py-1" data-testid="badge-default-templates">
                  BTR Inspection Templates
                </Badge>
              </div>
            </div>
          </div>

          <div className="p-4 border rounded-lg border-primary/20 bg-primary/5">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-medium text-sm">New User Registration Benefits</h4>
                <p className="text-sm text-muted-foreground mt-1" data-testid="text-registration-info">
                  When a new owner registers for Inspect360, they automatically receive:
                </p>
                <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                  <li data-testid="text-benefit-credits">5 free inspection credits to get started</li>
                  <li data-testid="text-benefit-templates">Pre-configured BTR inspection templates (Check In, Check Out, Periodic, Maintenance)</li>
                  <li data-testid="text-benefit-sample">Sample block and property data for demonstration</li>
                  <li data-testid="text-benefit-org">Automatic organization setup with their company name</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Configuration Notes</CardTitle>
          <CardDescription>Important information about the credit system</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 border rounded-lg">
              <Badge variant="outline" className="mt-0.5">Credit Usage</Badge>
                  <p className="text-sm text-muted-foreground" data-testid="text-credit-usage-info">
                 1 credit is consumed per AI-powered photo analysis during inspections. Welcome credits allow new users to complete approximately 5 AI photo analyses for free.
               </p>
            </div>
            <div className="flex items-start gap-3 p-3 border rounded-lg">
              <Badge variant="outline" className="mt-0.5">Credit Purchase</Badge>
              <p className="text-sm text-muted-foreground" data-testid="text-credit-purchase-info">
                Users can purchase additional credits through the Credit Bundles configured in this dashboard, with multi-currency support for GBP, USD, and AED.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface FeedbackSubmission {
  id: string;
  userId: string;
  organizationId: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  category: "bug" | "feature" | "improvement";
  status: "new" | "in_review" | "in_progress" | "completed" | "rejected";
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  user?: { username: string; firstName: string; lastName: string };
  organization?: { name: string };
}

function FeedbackManagement() {
  const { toast } = useToast();
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackSubmission | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [newStatus, setNewStatus] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const { data: feedback = [], isLoading } = useQuery<FeedbackSubmission[]>({
    queryKey: ["/api/admin/feedback"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, resolutionNotes }: { id: string; status: string; resolutionNotes?: string }) => {
      return await apiRequest("PATCH", `/api/admin/feedback/${id}`, { status, resolutionNotes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback"] });
      toast({ title: "Feedback updated successfully" });
      setSelectedFeedback(null);
      setResolutionNotes("");
      setNewStatus("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update feedback", 
        description: error.message || "An error occurred",
        variant: "destructive" 
      });
    },
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "bug":
        return <Bug className="h-4 w-4" />;
      case "feature":
        return <Lightbulb className="h-4 w-4" />;
      case "improvement":
        return <TrendingUp className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case "bug":
        return "Bug Report";
      case "feature":
        return "Feature Request";
      case "improvement":
        return "Improvement";
      default:
        return category;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "new":
        return <Clock className="h-4 w-4" />;
      case "in_review":
        return <Eye className="h-4 w-4" />;
      case "in_progress":
        return <AlertCircle className="h-4 w-4" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4" />;
      case "rejected":
        return <XCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "new":
        return "secondary";
      case "in_review":
        return "outline";
      case "in_progress":
        return "default";
      case "completed":
        return "default";
      case "rejected":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "new":
        return "New";
      case "in_review":
        return "In Review";
      case "in_progress":
        return "In Progress";
      case "completed":
        return "Completed";
      case "rejected":
        return "Rejected";
      default:
        return status;
    }
  };

  const getPriorityBadgeVariant = (priority: string) => {
    switch (priority) {
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "secondary";
    }
  };

  const filteredFeedback = feedback.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
    if (priorityFilter !== "all" && item.priority !== priorityFilter) return false;
    return true;
  });

  const statusCounts = {
    new: feedback.filter((f) => f.status === "new").length,
    in_review: feedback.filter((f) => f.status === "in_review").length,
    in_progress: feedback.filter((f) => f.status === "in_progress").length,
    completed: feedback.filter((f) => f.status === "completed").length,
    rejected: feedback.filter((f) => f.status === "rejected").length,
  };

  const handleUpdateStatus = () => {
    if (!selectedFeedback || !newStatus) return;
    updateMutation.mutate({
      id: selectedFeedback.id,
      status: newStatus,
      resolutionNotes: resolutionNotes || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            User Feedback
          </CardTitle>
          <CardDescription>
            Manage feedback, feature requests, and bug reports from users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4 mb-6">
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">New</span>
              </div>
              <p className="text-2xl font-bold mt-1" data-testid="count-new">{statusCounts.new}</p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">In Review</span>
              </div>
              <p className="text-2xl font-bold mt-1" data-testid="count-in-review">{statusCounts.in_review}</p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">In Progress</span>
              </div>
              <p className="text-2xl font-bold mt-1" data-testid="count-in-progress">{statusCounts.in_progress}</p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Completed</span>
              </div>
              <p className="text-2xl font-bold mt-1" data-testid="count-completed">{statusCounts.completed}</p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Rejected</span>
              </div>
              <p className="text-2xl font-bold mt-1" data-testid="count-rejected">{statusCounts.rejected}</p>
            </Card>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-category-filter">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="bug">Bug Report</SelectItem>
                <SelectItem value="feature">Feature Request</SelectItem>
                <SelectItem value="improvement">Improvement</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-priority-filter">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredFeedback.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquarePlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No feedback found matching your filters</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredFeedback.map((item) => (
                <Card 
                  key={item.id} 
                  className={`cursor-pointer transition-colors ${selectedFeedback?.id === item.id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => {
                    setSelectedFeedback(item);
                    setNewStatus(item.status);
                    setResolutionNotes(item.resolutionNotes || "");
                  }}
                  data-testid={`card-feedback-admin-${item.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge variant={getStatusBadgeVariant(item.status) as any} className="gap-1">
                            {getStatusIcon(item.status)}
                            {getStatusLabel(item.status)}
                          </Badge>
                          <Badge variant="outline" className="gap-1">
                            {getCategoryIcon(item.category)}
                            {getCategoryLabel(item.category)}
                          </Badge>
                          <Badge variant={getPriorityBadgeVariant(item.priority) as any}>
                            {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                          </Badge>
                        </div>
                        <h3 className="font-semibold">{item.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>By: {item.user?.firstName} {item.user?.lastName} ({item.user?.username})</span>
                          <span>Org: {item.organization?.name}</span>
                          <span>{format(new Date(item.createdAt), "MMM d, yyyy")}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedFeedback && (
        <Card>
          <CardHeader>
            <CardTitle>Update Feedback Status</CardTitle>
            <CardDescription>
              Update the status and add resolution notes for: {selectedFeedback.title}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Current Status</Label>
                <Badge variant={getStatusBadgeVariant(selectedFeedback.status) as any} className="gap-1">
                  {getStatusIcon(selectedFeedback.status)}
                  {getStatusLabel(selectedFeedback.status)}
                </Badge>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-status">New Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger id="new-status" data-testid="select-new-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resolution-notes">Resolution Notes (visible to user)</Label>
              <Textarea
                id="resolution-notes"
                placeholder="Add notes about the resolution or next steps..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={3}
                data-testid="input-resolution-notes"
              />
            </div>

            <div className="p-3 bg-muted rounded-md">
              <h4 className="font-medium text-sm mb-2">Full Description</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedFeedback.description}</p>
            </div>

            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSelectedFeedback(null);
                  setNewStatus("");
                  setResolutionNotes("");
                }}
                data-testid="button-cancel-update"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUpdateStatus}
                disabled={updateMutation.isPending || newStatus === selectedFeedback.status}
                data-testid="button-update-status"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Update Status
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
