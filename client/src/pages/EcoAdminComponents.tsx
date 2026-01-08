// This file contains the new Eco-Admin components for the 2026 pricing model
// These components are imported into EcoAdmin.tsx

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Edit, Trash2, Save, X, Download, Clock, CheckCircle2, XCircle, AlertCircle, User, Mail, Phone, Building2, Calendar, Eye, MessageSquare } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

// Currency Management Component
export function CurrencyManagement() {
  const { toast } = useToast();
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});

  const { data: currencies, isLoading } = useQuery({
    queryKey: ["/api/admin/currencies"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/currencies", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/currencies"] });
      toast({ title: "Currency created successfully" });
      setFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to create currency", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ code, data }: { code: string; data: any }) => {
      return await apiRequest("PATCH", `/api/admin/currencies/${code}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/currencies"] });
      toast({ title: "Currency updated successfully" });
      setEditingCode(null);
      setFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to update currency", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <div>Loading currencies...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingCode ? "Edit Currency" : "Create Currency"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Currency Code (ISO 4217)</Label>
              <Input
                value={formData.code || ""}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="GBP, USD, EUR"
                disabled={!!editingCode}
              />
            </div>
            <div className="space-y-2">
              <Label>Symbol</Label>
              <Input
                value={formData.symbol || ""}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                placeholder="£, $, €"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Default for Region (optional)</Label>
              <Input
                value={formData.defaultForRegion || ""}
                onChange={(e) => setFormData({ ...formData, defaultForRegion: e.target.value })}
                placeholder="UK, US, EU"
              />
            </div>
            <div className="space-y-2">
              <Label>Conversion Rate (to master currency)</Label>
              <Input
                type="number"
                step="0.0001"
                value={formData.conversionRate || ""}
                onChange={(e) => setFormData({ ...formData, conversionRate: e.target.value })}
                placeholder="1.0000"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.isActive ?? true}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
            />
            <Label>Active</Label>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => {
              if (editingCode) {
                updateMutation.mutate({ code: editingCode, data: formData });
              } else {
                createMutation.mutate(formData);
              }
            }}>
              <Save className="h-4 w-4 mr-2" />
              {editingCode ? "Update" : "Create"}
            </Button>
            {editingCode && (
              <Button variant="outline" onClick={() => {
                setEditingCode(null);
                setFormData({});
              }}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Currencies</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {currencies && currencies.length > 0 ? (
              currencies.map((currency: any) => (
                <div key={currency.code} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{currency.code}</h3>
                      <Badge>{currency.symbol}</Badge>
                      {currency.isActive && <Badge variant="default">Active</Badge>}
                      {currency.defaultForRegion && <Badge variant="outline">{currency.defaultForRegion}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">Rate: {currency.conversionRate}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => {
                    setEditingCode(currency.code);
                    setFormData(currency);
                  }}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">No currencies configured</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Subscription Tier Management Component
export function SubscriptionTierManagement() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [pricingFormData, setPricingFormData] = useState<any>({});

  const { data: tiers, isLoading } = useQuery({
    queryKey: ["/api/admin/subscription-tiers"],
  });

  const { data: currencies } = useQuery({
    queryKey: ["/api/admin/currencies"],
  });

  const { data: tierPricing, isLoading: pricingLoading } = useQuery({
    queryKey: ["/api/admin/subscription-tiers", selectedTierId, "pricing"],
    queryFn: async () => {
      if (!selectedTierId) return [];
      const res = await apiRequest("GET", `/api/admin/subscription-tiers/${selectedTierId}/pricing`);
      return res.json();
    },
    enabled: !!selectedTierId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/subscription-tiers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscription-tiers"] });
      toast({ title: "Tier created successfully" });
      setFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to create tier", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PATCH", `/api/admin/subscription-tiers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscription-tiers"] });
      toast({ title: "Tier updated successfully" });
      setEditingId(null);
      setFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to update tier", description: error.message, variant: "destructive" });
    },
  });

  const createPricingMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", `/api/admin/subscription-tiers/${selectedTierId}/pricing`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscription-tiers", selectedTierId, "pricing"] });
      toast({ title: "Pricing created successfully" });
      setPricingFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to create pricing", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <div>Loading tiers...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit Tier" : "Create Tier"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tier Name</Label>
              <Input
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Starter, Growth, Professional..."
              />
            </div>
            <div className="space-y-2">
              <Label>Tier Code</Label>
              <Input
                value={formData.code || ""}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toLowerCase() })}
                placeholder="starter, growth, professional..."
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tier Order</Label>
              <Input
                type="number"
                value={formData.tierOrder || ""}
                onChange={(e) => setFormData({ ...formData, tierOrder: parseInt(e.target.value) })}
                placeholder="1-5"
              />
            </div>
            <div className="space-y-2">
              <Label>Included Inspections</Label>
              <Input
                type="number"
                value={formData.includedInspections || ""}
                onChange={(e) => setFormData({ ...formData, includedInspections: parseInt(e.target.value) })}
                placeholder="10, 30, 75..."
              />
            </div>
            <div className="space-y-2">
              <Label>Annual Discount %</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.annualDiscountPercentage || "16.70"}
                onChange={(e) => setFormData({ ...formData, annualDiscountPercentage: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Base Monthly Price (GBP, in pence)</Label>
              <Input
                type="number"
                value={formData.basePriceMonthly || ""}
                onChange={(e) => setFormData({ ...formData, basePriceMonthly: parseInt(e.target.value) })}
                placeholder="19900 = £199.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Base Annual Price (GBP, in pence)</Label>
              <Input
                type="number"
                value={formData.basePriceAnnual || ""}
                onChange={(e) => setFormData({ ...formData, basePriceAnnual: parseInt(e.target.value) })}
                placeholder="199000 = £1990.00"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Tier description..."
            />
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.isActive ?? true}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              />
              <Label>Active</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.requiresCustomPricing ?? false}
                onChange={(e) => setFormData({ ...formData, requiresCustomPricing: e.target.checked })}
              />
              <Label>Requires Custom Pricing</Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => {
              if (editingId) {
                updateMutation.mutate({ id: editingId, data: formData });
              } else {
                createMutation.mutate(formData);
              }
            }}>
              <Save className="h-4 w-4 mr-2" />
              {editingId ? "Update" : "Create"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={() => {
                setEditingId(null);
                setFormData({});
              }}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription Tiers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tiers && tiers.length > 0 ? (
              tiers.map((tier: any) => (
                <div key={tier.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{tier.name}</h3>
                        <Badge>{tier.code}</Badge>
                        {tier.isActive && <Badge variant="default">Active</Badge>}
                        {tier.requiresCustomPricing && <Badge variant="outline">Custom Pricing</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {tier.includedInspections} inspections • Order: {tier.tierOrder}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Base: £{tier.basePriceMonthly / 100}/mo • £{tier.basePriceAnnual / 100}/yr
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => {
                        setEditingId(tier.id);
                        setFormData(tier);
                      }}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSelectedTierId(tier.id)}>
                        Manage Pricing
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">No tiers configured</p>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedTierId && (
        <Card>
          <CardHeader>
            <CardTitle>Multi-Currency Pricing for {tiers?.find((t: any) => t.id === selectedTierId)?.name}</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setSelectedTierId(null)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={pricingFormData.currencyCode || ""} onValueChange={(v) => setPricingFormData({ ...pricingFormData, currencyCode: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies?.filter((c: any) => c.isActive).map((c: any) => (
                      <SelectItem key={c.code} value={c.code}>{c.code} ({c.symbol})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Monthly Price (in minor units)</Label>
                <Input
                  type="number"
                  value={pricingFormData.priceMonthly || ""}
                  onChange={(e) => setPricingFormData({ ...pricingFormData, priceMonthly: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Annual Price (in minor units)</Label>
                <Input
                  type="number"
                  value={pricingFormData.priceAnnual || ""}
                  onChange={(e) => setPricingFormData({ ...pricingFormData, priceAnnual: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Per-Inspection Price (minor units)</Label>
                <Input
                  type="number"
                  value={pricingFormData.perInspectionPrice || ""}
                  onChange={(e) => setPricingFormData({ ...pricingFormData, perInspectionPrice: parseInt(e.target.value) })}
                />
              </div>
            </div>
            <Button onClick={() => {
              createPricingMutation.mutate(pricingFormData);
            }}>
              <Save className="h-4 w-4 mr-2" />
              Add Pricing
            </Button>

            {pricingLoading ? (
              <div>Loading pricing...</div>
            ) : (
              <div className="space-y-2 mt-4">
                <h4 className="font-semibold">Existing Pricing</h4>
                {tierPricing && tierPricing.length > 0 ? (
                  tierPricing.map((p: any) => {
                    const symbol = p.currencyCode === "GBP" ? "£" : p.currencyCode === "USD" ? "$" : p.currencyCode === "AED" ? "د.إ" : p.currencyCode;
                    return (
                      <div key={p.id} className="flex items-center justify-between p-2 border rounded">
                        <span>{p.currencyCode}: {symbol}{(p.priceMonthly / 100).toFixed(2)}/mo • {symbol}{(p.priceAnnual / 100).toFixed(2)}/yr • Per-inspection {symbol}{((p.perInspectionPrice || 0) / 100).toFixed(2)}</span>
                        <Button size="sm" variant="ghost" onClick={async () => {
                          await apiRequest("DELETE", `/api/admin/subscription-tiers/${selectedTierId}/pricing/${p.id}`);
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/subscription-tiers", selectedTierId, "pricing"] });
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">No pricing configured</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Add-On Pack Management Component
export function AddonPackManagement() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [pricingFormData, setPricingFormData] = useState<any>({});

  const { data: packs, isLoading } = useQuery({
    queryKey: ["/api/admin/addon-packs"],
  });

  const { data: tiers } = useQuery({
    queryKey: ["/api/admin/subscription-tiers"],
  });

  const { data: currencies } = useQuery({
    queryKey: ["/api/admin/currencies"],
  });

  const { data: packPricing, isLoading: pricingLoading } = useQuery({
    queryKey: ["/api/admin/addon-packs", selectedPackId, "pricing"],
    queryFn: async () => {
      if (!selectedPackId) return [];
      const res = await apiRequest("GET", `/api/admin/addon-packs/${selectedPackId}/pricing`);
      return res.json();
    },
    enabled: !!selectedPackId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/addon-packs", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-packs"] });
      toast({ title: "Pack created successfully" });
      setFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to create pack", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PATCH", `/api/admin/addon-packs/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-packs"] });
      toast({ title: "Pack updated successfully" });
      setEditingId(null);
      setFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to update pack", description: error.message, variant: "destructive" });
    },
  });

  const [editingPricingId, setEditingPricingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/addon-packs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-packs"] });
      toast({ title: "Pack deleted successfully" });
      setDeleteConfirmOpen(null);
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete pack", description: error.message, variant: "destructive" });
    },
  });

  const createPricingMutation = useMutation({
    mutationFn: async (data: any) => {
      const totalPackPrice = data.pricePerInspection * (packs?.find((p: any) => p.id === selectedPackId)?.inspectionQuantity || 0);
      return await apiRequest("POST", `/api/admin/addon-packs/${selectedPackId}/pricing`, {
        ...data,
        totalPackPrice
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-packs", selectedPackId, "pricing"] });
      toast({ title: "Pricing created successfully" });
      setPricingFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to create pricing", description: error.message, variant: "destructive" });
    },
  });

  const updatePricingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const totalPackPrice = data.pricePerInspection * (packs?.find((p: any) => p.id === selectedPackId)?.inspectionQuantity || 0);
      return await apiRequest("PATCH", `/api/admin/addon-packs/${selectedPackId}/pricing/${id}`, {
        ...data,
        totalPackPrice
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-packs", selectedPackId, "pricing"] });
      toast({ title: "Pricing updated successfully" });
      setEditingPricingId(null);
      setPricingFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to update pricing", description: error.message, variant: "destructive" });
    },
  });

  const deletePricingMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/addon-packs/${selectedPackId}/pricing/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-packs", selectedPackId, "pricing"] });
      toast({ title: "Pricing deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete pricing", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <div>Loading packs...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit Pack" : "Create Pack"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Pack Name</Label>
              <Input
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="20 Pack, 50 Pack..."
              />
            </div>
            <div className="space-y-2">
              <Label>Inspection Quantity</Label>
              <Input
                type="number"
                value={formData.inspectionQuantity || ""}
                onChange={(e) => setFormData({ ...formData, inspectionQuantity: parseInt(e.target.value) })}
                placeholder="20, 50, 100..."
              />
            </div>
            <div className="space-y-2">
              <Label>Pack Order</Label>
              <Input
                type="number"
                value={formData.packOrder || ""}
                onChange={(e) => setFormData({ ...formData, packOrder: parseInt(e.target.value) })}
                placeholder="1, 2, 3..."
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.isActive ?? true}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
            />
            <Label>Active</Label>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => {
              if (editingId) {
                updateMutation.mutate({ id: editingId, data: formData });
              } else {
                createMutation.mutate(formData);
              }
            }}>
              <Save className="h-4 w-4 mr-2" />
              {editingId ? "Update" : "Create"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={() => {
                setEditingId(null);
                setFormData({});
              }}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Add-On Packs</CardTitle>
          <CardDescription>Manage all add-on inspection packs. Edit, delete, or manage pricing for each pack.</CardDescription>
        </CardHeader>
        <CardContent>
          {packs && packs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pack Name</TableHead>
                  <TableHead>Inspection Quantity</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packs.map((pack: any) => (
                  <TableRow key={pack.id}>
                    <TableCell className="font-medium">{pack.name}</TableCell>
                    <TableCell>{pack.inspectionQuantity} credits</TableCell>
                    <TableCell>{pack.packOrder}</TableCell>
                    <TableCell>
                      {pack.isActive ? (
                        <Badge variant="default">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => {
                          setEditingId(pack.id);
                          setFormData(pack);
                        }}>
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setSelectedPackId(pack.id)}>
                          Pricing
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive" 
                          onClick={() => setDeleteConfirmOpen(pack.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No packs configured</p>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmOpen} onOpenChange={(open) => !open && setDeleteConfirmOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Pack</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this pack? This action cannot be undone. 
              If there are active purchases for this pack, it cannot be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteConfirmOpen && deleteMutation.mutate(deleteConfirmOpen)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedPackId && (
        <Card>
          <CardHeader>
            <CardTitle>Tier-Based Pricing for {packs?.find((p: any) => p.id === selectedPackId)?.name}</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setSelectedPackId(null)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Tier</Label>
                <Select value={pricingFormData.tierId || ""} onValueChange={(v) => setPricingFormData({ ...pricingFormData, tierId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiers?.filter((t: any) => t.isActive).map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={pricingFormData.currencyCode || ""} onValueChange={(v) => setPricingFormData({ ...pricingFormData, currencyCode: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies?.filter((c: any) => c.isActive).map((c: any) => (
                      <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Price per Inspection</Label>
                <Input
                  type="number"
                  value={pricingFormData.pricePerInspection || ""}
                  onChange={(e) => setPricingFormData({ ...pricingFormData, pricePerInspection: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Total Pack Price (auto-calculated)</Label>
                <Input
                  type="number"
                  disabled
                  value={pricingFormData.pricePerInspection && packs?.find((p: any) => p.id === selectedPackId)?.inspectionQuantity
                    ? pricingFormData.pricePerInspection * packs.find((p: any) => p.id === selectedPackId).inspectionQuantity
                    : ""}
                />
              </div>
            </div>
            <Button onClick={() => {
              if (editingPricingId) {
                updatePricingMutation.mutate({ id: editingPricingId, data: pricingFormData });
              } else {
                createPricingMutation.mutate(pricingFormData);
              }
            }}>
              <Save className="h-4 w-4 mr-2" />
              {editingPricingId ? "Update Pricing" : "Add Pricing"}
            </Button>
            {editingPricingId && (
              <Button variant="outline" onClick={() => {
                setEditingPricingId(null);
                setPricingFormData({});
              }}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}

            {pricingLoading ? (
              <div>Loading pricing...</div>
            ) : (
              <div className="space-y-2 mt-4">
                <h4 className="font-semibold">Existing Pricing</h4>
                {packPricing && packPricing.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tier</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead>Price per Inspection</TableHead>
                        <TableHead>Total Pack Price</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packPricing.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell>{tiers?.find((t: any) => t.id === p.tierId)?.name || "Unknown"}</TableCell>
                          <TableCell>{p.currencyCode}</TableCell>
                          <TableCell>{(p.pricePerInspection / 100).toFixed(2)}</TableCell>
                          <TableCell>{(p.totalPackPrice / 100).toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => {
                                  setEditingPricingId(p.id);
                                  setPricingFormData({
                                    tierId: p.tierId,
                                    currencyCode: p.currencyCode,
                                    pricePerInspection: p.pricePerInspection
                                  });
                                }}
                              >
                                <Edit className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => deletePricingMutation.mutate(p.id)}
                                disabled={deletePricingMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No pricing configured</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Extensive Inspection Management Component
export function ExtensiveInspectionManagement() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [pricingFormData, setPricingFormData] = useState<any>({});

  const { data: types, isLoading } = useQuery({
    queryKey: ["/api/admin/extensive-inspections"],
  });

  const { data: tiers } = useQuery({
    queryKey: ["/api/admin/subscription-tiers"],
  });

  const { data: currencies } = useQuery({
    queryKey: ["/api/admin/currencies"],
  });

  const { data: typePricing, isLoading: pricingLoading } = useQuery({
    queryKey: ["/api/admin/extensive-inspections", selectedTypeId, "pricing"],
    queryFn: async () => {
      if (!selectedTypeId) return [];
      const res = await apiRequest("GET", `/api/admin/extensive-inspections/${selectedTypeId}/pricing`);
      return res.json();
    },
    enabled: !!selectedTypeId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/extensive-inspections", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/extensive-inspections"] });
      toast({ title: "Extensive inspection type created successfully" });
      setFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to create type", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PATCH", `/api/admin/extensive-inspections/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/extensive-inspections"] });
      toast({ title: "Type updated successfully" });
      setEditingId(null);
      setFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to update type", description: error.message, variant: "destructive" });
    },
  });

  const createPricingMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", `/api/admin/extensive-inspections/${selectedTypeId}/pricing`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/extensive-inspections", selectedTypeId, "pricing"] });
      toast({ title: "Pricing created successfully" });
      setPricingFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to create pricing", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <div>Loading extensive inspection types...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit Type" : "Create Extensive Inspection Type"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type Name</Label>
              <Input
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Fire Assessment, Full Building Survey..."
              />
            </div>
            <div className="space-y-2">
              <Label>Image Count (default: 800)</Label>
              <Input
                type="number"
                value={formData.imageCount || 800}
                onChange={(e) => setFormData({ ...formData, imageCount: parseInt(e.target.value) })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Description of this inspection type..."
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.isActive ?? true}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
            />
            <Label>Active</Label>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => {
              if (editingId) {
                updateMutation.mutate({ id: editingId, data: formData });
              } else {
                createMutation.mutate(formData);
              }
            }}>
              <Save className="h-4 w-4 mr-2" />
              {editingId ? "Update" : "Create"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={() => {
                setEditingId(null);
                setFormData({});
              }}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Extensive Inspection Types</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {types && types.length > 0 ? (
              types.map((type: any) => (
                <div key={type.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{type.name}</h3>
                        {type.isActive && <Badge variant="default">Active</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {type.imageCount || 800} images
                      </p>
                      {type.description && (
                        <p className="text-sm text-muted-foreground mt-1">{type.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => {
                        setEditingId(type.id);
                        setFormData(type);
                      }}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSelectedTypeId(type.id)}>
                        Manage Pricing
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">No extensive inspection types configured</p>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedTypeId && (
        <Card>
          <CardHeader>
            <CardTitle>Tier-Based Pricing for {types?.find((t: any) => t.id === selectedTypeId)?.name}</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setSelectedTypeId(null)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Tier</Label>
                <Select value={pricingFormData.tierId || ""} onValueChange={(v) => setPricingFormData({ ...pricingFormData, tierId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiers?.filter((t: any) => t.isActive).map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={pricingFormData.currencyCode || ""} onValueChange={(v) => setPricingFormData({ ...pricingFormData, currencyCode: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies?.filter((c: any) => c.isActive).map((c: any) => (
                      <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Price per Inspection</Label>
                <Input
                  type="number"
                  value={pricingFormData.pricePerInspection || ""}
                  onChange={(e) => setPricingFormData({ ...pricingFormData, pricePerInspection: parseInt(e.target.value) })}
                />
              </div>
            </div>
            <Button onClick={() => {
              createPricingMutation.mutate(pricingFormData);
            }}>
              <Save className="h-4 w-4 mr-2" />
              Add Pricing
            </Button>

            {pricingLoading ? (
              <div>Loading pricing...</div>
            ) : (
              <div className="space-y-2 mt-4">
                <h4 className="font-semibold">Existing Pricing</h4>
                {typePricing && typePricing.length > 0 ? (
                  typePricing.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between p-2 border rounded">
                      <span>
                        {tiers?.find((t: any) => t.id === p.tierId)?.name} • {p.currencyCode}: {p.pricePerInspection / 100} per inspection
                      </span>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        await apiRequest("DELETE", `/api/admin/extensive-inspections/${selectedTypeId}/pricing/${p.id}`);
                        queryClient.invalidateQueries({ queryKey: ["/api/admin/extensive-inspections", selectedTypeId, "pricing"] });
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No pricing configured</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Module Management Component
export function ModuleManagement() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [pricingFormData, setPricingFormData] = useState<any>({});
  const [limitFormData, setLimitFormData] = useState<any>({});

  const { data: modules, isLoading } = useQuery({
    queryKey: ["/api/admin/modules"],
  });

  const { data: currencies } = useQuery({
    queryKey: ["/api/admin/currencies"],
  });

  const { data: modulePricing, isLoading: pricingLoading } = useQuery({
    queryKey: ["/api/admin/modules", selectedModuleId, "pricing"],
    queryFn: async () => {
      if (!selectedModuleId) return [];
      const res = await apiRequest("GET", `/api/admin/modules/${selectedModuleId}/pricing`);
      return res.json();
    },
    enabled: !!selectedModuleId,
  });

  const { data: moduleLimits, isLoading: limitsLoading } = useQuery({
    queryKey: ["/api/admin/modules", selectedModuleId, "limits"],
    queryFn: async () => {
      if (!selectedModuleId) return [];
      const res = await apiRequest("GET", `/api/admin/modules/${selectedModuleId}/limits`);
      return res.json();
    },
    enabled: !!selectedModuleId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/modules", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/modules"] });
      toast({ title: "Module created successfully" });
      setFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to create module", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PATCH", `/api/admin/modules/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/modules"] });
      toast({ title: "Module updated successfully" });
      setEditingId(null);
      setFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to update module", description: error.message, variant: "destructive" });
    },
  });

  const createPricingMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", `/api/admin/modules/${selectedModuleId}/pricing`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/modules", selectedModuleId, "pricing"] });
      toast({ title: "Pricing created successfully" });
      setPricingFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to create pricing", description: error.message, variant: "destructive" });
    },
  });

  const createLimitMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", `/api/admin/modules/${selectedModuleId}/limits`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/modules", selectedModuleId, "limits"] });
      toast({ title: "Limit created successfully" });
      setLimitFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to create limit", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <div>Loading modules...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit Module" : "Create Module"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Module Name</Label>
              <Input
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="White Labelling, Tenant Portal..."
              />
            </div>
            <div className="space-y-2">
              <Label>Module Key (unique identifier)</Label>
              <Input
                value={formData.moduleKey || ""}
                onChange={(e) => setFormData({ ...formData, moduleKey: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                placeholder="white_label, tenant_portal..."
                disabled={!!editingId}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Icon Name</Label>
              <Input
                value={formData.iconName || ""}
                onChange={(e) => setFormData({ ...formData, iconName: e.target.value })}
                placeholder="wrench, users, layout..."
              />
            </div>
            <div className="space-y-2">
              <Label>Display Order</Label>
              <Input
                type="number"
                value={formData.displayOrder || ""}
                onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Module description..."
            />
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.isAvailableGlobally ?? true}
                onChange={(e) => setFormData({ ...formData, isAvailableGlobally: e.target.checked })}
              />
              <Label>Available Globally</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.defaultEnabled ?? false}
                onChange={(e) => setFormData({ ...formData, defaultEnabled: e.target.checked })}
              />
              <Label>Default Enabled</Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => {
              if (editingId) {
                updateMutation.mutate({ id: editingId, data: formData });
              } else {
                createMutation.mutate(formData);
              }
            }}>
              <Save className="h-4 w-4 mr-2" />
              {editingId ? "Update" : "Create"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={() => {
                setEditingId(null);
                setFormData({});
              }}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {modules && modules.length > 0 ? (
              modules.map((module: any) => (
                <div key={module.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{module.name}</h3>
                        <Badge variant="outline">{module.moduleKey}</Badge>
                        {module.isAvailableGlobally && <Badge variant="default">Available</Badge>}
                        {module.defaultEnabled && <Badge variant="secondary">Default Enabled</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{module.description}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => {
                        setEditingId(module.id);
                        setFormData(module);
                      }}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSelectedModuleId(module.id)}>
                        Manage Pricing & Limits
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">No modules configured</p>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedModuleId && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Multi-Currency Pricing for {modules?.find((m: any) => m.id === selectedModuleId)?.name}</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setSelectedModuleId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={pricingFormData.currencyCode || ""} onValueChange={(v) => setPricingFormData({ ...pricingFormData, currencyCode: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies?.filter((c: any) => c.isActive).map((c: any) => (
                        <SelectItem key={c.code} value={c.code}>{c.code} ({c.symbol})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Monthly Price (in minor units)</Label>
                  <Input
                    type="number"
                    value={pricingFormData.priceMonthly || ""}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, priceMonthly: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Annual Price (in minor units)</Label>
                  <Input
                    type="number"
                    value={pricingFormData.priceAnnual || ""}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, priceAnnual: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <Button onClick={() => {
                createPricingMutation.mutate(pricingFormData);
              }}>
                <Save className="h-4 w-4 mr-2" />
                Add Pricing
              </Button>

              {pricingLoading ? (
                <div>Loading pricing...</div>
              ) : (
                <div className="space-y-2 mt-4">
                  <h4 className="font-semibold">Existing Pricing</h4>
                  {modulePricing && modulePricing.length > 0 ? (
                    modulePricing.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between p-2 border rounded">
                        <span>
                          {(() => {
                            const symbol = p.currencyCode === "GBP" ? "£" : p.currencyCode === "USD" ? "$" : p.currencyCode === "AED" ? "د.إ" : p.currencyCode;
                            return `${p.currencyCode}: ${symbol}${(p.priceMonthly / 100).toFixed(2)}/mo • ${symbol}${(p.priceAnnual / 100).toFixed(2)}/yr`;
                          })()}
                        </span>
                        <Button size="sm" variant="ghost" onClick={async () => {
                          await apiRequest("DELETE", `/api/admin/modules/${selectedModuleId}/pricing/${p.id}`);
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/modules", selectedModuleId, "pricing"] });
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No pricing configured</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usage Limits & Overage Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Limit Type</Label>
                  <Input
                    value={limitFormData.limitType || ""}
                    onChange={(e) => setLimitFormData({ ...limitFormData, limitType: e.target.value })}
                    placeholder="active_tenants, work_orders..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Included Quantity</Label>
                  <Input
                    type="number"
                    value={limitFormData.includedQuantity || ""}
                    onChange={(e) => setLimitFormData({ ...limitFormData, includedQuantity: parseInt(e.target.value) })}
                    placeholder="500, 100..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Overage Price (per unit)</Label>
                  <Input
                    type="number"
                    value={limitFormData.overagePrice || ""}
                    onChange={(e) => setLimitFormData({ ...limitFormData, overagePrice: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Overage Currency</Label>
                  <Select value={limitFormData.overageCurrency || ""} onValueChange={(v) => setLimitFormData({ ...limitFormData, overageCurrency: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies?.filter((c: any) => c.isActive).map((c: any) => (
                        <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={() => {
                createLimitMutation.mutate(limitFormData);
              }}>
                <Save className="h-4 w-4 mr-2" />
                Add Limit
              </Button>

              {limitsLoading ? (
                <div>Loading limits...</div>
              ) : (
                <div className="space-y-2 mt-4">
                  <h4 className="font-semibold">Existing Limits</h4>
                  {moduleLimits && moduleLimits.length > 0 ? (
                    moduleLimits.map((l: any) => (
                      <div key={l.id} className="flex items-center justify-between p-2 border rounded">
                        <span>
                          {l.limitType}: {l.includedQuantity} included • {l.overagePrice / 100} {l.overageCurrency} per overage unit
                        </span>
                        <Button size="sm" variant="ghost" onClick={async () => {
                          await apiRequest("DELETE", `/api/admin/modules/${selectedModuleId}/limits/${l.id}`);
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/modules", selectedModuleId, "limits"] });
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No limits configured</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Module Bundle Management Component
export function ModuleBundleManagement() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [pricingFormData, setPricingFormData] = useState<any>({});
  const [selectedModuleToAdd, setSelectedModuleToAdd] = useState<string>("");

  const { data: bundles, isLoading } = useQuery({
    queryKey: ["/api/admin/module-bundles"],
  });

  const { data: modules } = useQuery({
    queryKey: ["/api/admin/modules"],
  });

  const { data: currencies } = useQuery({
    queryKey: ["/api/admin/currencies"],
  });

  const { data: bundleModules, isLoading: modulesLoading } = useQuery({
    queryKey: ["/api/admin/module-bundles", selectedBundleId, "modules"],
    queryFn: async () => {
      if (!selectedBundleId) return [];
      const res = await apiRequest("GET", `/api/admin/module-bundles/${selectedBundleId}/modules`);
      return res.json();
    },
    enabled: !!selectedBundleId,
  });

  const { data: bundlePricing, isLoading: pricingLoading } = useQuery({
    queryKey: ["/api/admin/module-bundles", selectedBundleId, "pricing"],
    queryFn: async () => {
      if (!selectedBundleId) return [];
      const res = await apiRequest("GET", `/api/admin/module-bundles/${selectedBundleId}/pricing`);
      return res.json();
    },
    enabled: !!selectedBundleId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/module-bundles", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/module-bundles"] });
      toast({ title: "Bundle created successfully" });
      setFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to create bundle", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PATCH", `/api/admin/module-bundles/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/module-bundles"] });
      toast({ title: "Bundle updated successfully" });
      setEditingId(null);
      setFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to update bundle", description: error.message, variant: "destructive" });
    },
  });

  const addModuleMutation = useMutation({
    mutationFn: async (moduleId: string) => {
      return await apiRequest("POST", `/api/admin/module-bundles/${selectedBundleId}/modules`, { moduleId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/module-bundles", selectedBundleId, "modules"] });
      toast({ title: "Module added to bundle" });
      setSelectedModuleToAdd("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to add module", description: error.message, variant: "destructive" });
    },
  });

  const createPricingMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", `/api/admin/module-bundles/${selectedBundleId}/pricing`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/module-bundles", selectedBundleId, "pricing"] });
      toast({ title: "Pricing created successfully" });
      setPricingFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Failed to create pricing", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <div>Loading bundles...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit Bundle" : "Create Bundle"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Bundle Name</Label>
              <Input
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Platform Bundle, Essential Bundle..."
              />
            </div>
            <div className="space-y-2">
              <Label>Discount Percentage</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.discountPercentage || ""}
                onChange={(e) => setFormData({ ...formData, discountPercentage: e.target.value })}
                placeholder="12, 20..."
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Bundle description..."
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.isActive ?? true}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
            />
            <Label>Active</Label>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => {
              if (editingId) {
                updateMutation.mutate({ id: editingId, data: formData });
              } else {
                createMutation.mutate(formData);
              }
            }}>
              <Save className="h-4 w-4 mr-2" />
              {editingId ? "Update" : "Create"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={() => {
                setEditingId(null);
                setFormData({});
              }}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Module Bundles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {bundles && bundles.length > 0 ? (
              bundles.map((bundle: any) => (
                <div key={bundle.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{bundle.name}</h3>
                        {bundle.isActive && <Badge variant="default">Active</Badge>}
                        {bundle.discountPercentage && <Badge variant="secondary">{bundle.discountPercentage}% off</Badge>}
                      </div>
                      {bundle.description && (
                        <p className="text-sm text-muted-foreground mt-1">{bundle.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => {
                        setEditingId(bundle.id);
                        setFormData(bundle);
                      }}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSelectedBundleId(bundle.id)}>
                        Manage Modules & Pricing
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">No bundles configured</p>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedBundleId && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Modules in {bundles?.find((b: any) => b.id === selectedBundleId)?.name}</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setSelectedBundleId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Select value={selectedModuleToAdd} onValueChange={setSelectedModuleToAdd}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select module to add" />
                  </SelectTrigger>
                  <SelectContent>
                    {modules?.filter((m: any) => 
                      !bundleModules?.some((bm: any) => bm.moduleId === m.id)
                    ).map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={() => {
                  if (selectedModuleToAdd) {
                    addModuleMutation.mutate(selectedModuleToAdd);
                  }
                }}>
                  <Save className="h-4 w-4 mr-2" />
                  Add Module
                </Button>
              </div>

              {modulesLoading ? (
                <div>Loading modules...</div>
              ) : (
                <div className="space-y-2 mt-4">
                  <h4 className="font-semibold">Bundle Modules</h4>
                  {bundleModules && bundleModules.length > 0 ? (
                    bundleModules.map((bm: any) => {
                      const module = modules?.find((m: any) => m.id === bm.moduleId);
                      return (
                        <div key={bm.moduleId} className="flex items-center justify-between p-2 border rounded">
                          <span>{module?.name || bm.moduleId}</span>
                          <Button size="sm" variant="ghost" onClick={async () => {
                            await apiRequest("DELETE", `/api/admin/module-bundles/${selectedBundleId}/modules/${bm.moduleId}`);
                            queryClient.invalidateQueries({ queryKey: ["/api/admin/module-bundles", selectedBundleId, "modules"] });
                          }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">No modules in bundle</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Multi-Currency Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={pricingFormData.currencyCode || ""} onValueChange={(v) => setPricingFormData({ ...pricingFormData, currencyCode: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies?.filter((c: any) => c.isActive).map((c: any) => (
                        <SelectItem key={c.code} value={c.code}>{c.code} ({c.symbol})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Monthly Price</Label>
                  <Input
                    type="number"
                    value={pricingFormData.priceMonthly || ""}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, priceMonthly: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Annual Price</Label>
                  <Input
                    type="number"
                    value={pricingFormData.priceAnnual || ""}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, priceAnnual: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Savings Monthly (optional)</Label>
                  <Input
                    type="number"
                    value={pricingFormData.savingsMonthly || ""}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, savingsMonthly: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <Button onClick={() => {
                createPricingMutation.mutate(pricingFormData);
              }}>
                <Save className="h-4 w-4 mr-2" />
                Add Pricing
              </Button>

              {pricingLoading ? (
                <div>Loading pricing...</div>
              ) : (
                <div className="space-y-2 mt-4">
                  <h4 className="font-semibold">Existing Pricing</h4>
                  {bundlePricing && bundlePricing.length > 0 ? (
                    bundlePricing.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between p-2 border rounded">
                        <span>
                          {(() => {
                            const symbol = p.currencyCode === "GBP" ? "£" : p.currencyCode === "USD" ? "$" : p.currencyCode === "AED" ? "د.إ" : p.currencyCode;
                            return `${p.currencyCode}: ${symbol}${(p.priceMonthly / 100).toFixed(2)}/mo • ${symbol}${(p.priceAnnual / 100).toFixed(2)}/yr${p.savingsMonthly ? ` • Savings: ${symbol}${(p.savingsMonthly / 100).toFixed(2)}/mo` : ""}`;
                          })()}
                        </span>
                        <Button size="sm" variant="ghost" onClick={async () => {
                          await apiRequest("DELETE", `/api/admin/module-bundles/${selectedBundleId}/pricing/${p.id}`);
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/module-bundles", selectedBundleId, "pricing"] });
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No pricing configured</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export function PricingPreview() {
  const { toast } = useToast();
  const [selectedCurrency, setSelectedCurrency] = useState("GBP");

  const { data: currencies } = useQuery({
    queryKey: ["/api/admin/currencies"],
  });

  const currencySymbol = currencies?.find((c: any) => c.code === selectedCurrency)?.symbol || selectedCurrency;

  const { data: preview, isLoading } = useQuery({
    queryKey: ["/api/admin/pricing-preview", selectedCurrency],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/pricing-preview?currency=${selectedCurrency}`);
      return res.json();
    },
  });

  const formatPrice = (price: number) => {
    return (price / 100).toFixed(2);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pricing Preview</CardTitle>
          <CardDescription>View complete pricing structure as it will appear to customers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label>Currency:</Label>
            <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies?.map((c: any) => (
                  <SelectItem key={c.code} value={c.code}>{c.code} ({c.symbol})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => {
              toast({ title: "Export functionality coming soon" });
            }}>
              <Download className="h-4 w-4 mr-2" />
              Export Pricing Sheet
            </Button>
          </div>

          {isLoading ? (
            <div>Loading pricing preview...</div>
          ) : preview ? (
            <div className="space-y-8">
              {/* Subscription Tiers */}
              <div>
                <h3 className="font-semibold mb-4 text-lg">Subscription Tiers</h3>
                <div className="space-y-2">
                  {preview.tiers?.filter((t: any) => t.isActive).map((tier: any) => (
                    <div key={tier.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{tier.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {tier.includedInspections} inspections included
                          </p>
                          {tier.description && (
                            <p className="text-sm text-muted-foreground mt-1">{tier.description}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">
                            {currencySymbol}{formatPrice(tier.pricing?.priceMonthly || tier.basePriceMonthly)}/month
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {currencySymbol}{formatPrice(tier.pricing?.priceAnnual || tier.basePriceAnnual)}/year
                          </p>
                          {tier.annualDiscountPercentage && (
                            <p className="text-xs text-green-600">
                              Save {tier.annualDiscountPercentage}% annually
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add-On Packs */}
              {preview.addonPacks && preview.addonPacks.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-4 text-lg">Add-On Inspection Packs</h3>
                  <div className="space-y-4">
                    {preview.addonPacks.filter((p: any) => p.isActive).map((pack: any) => (
                      <div key={pack.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">{pack.name}</h4>
                          <Badge>{pack.inspectionQuantity} inspections</Badge>
                        </div>
                        <div className="space-y-2">
                          {pack.pricing?.filter((p: any) => p.pricing).map((tierPricing: any) => (
                            <div key={tierPricing.tierId} className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">{tierPricing.tierName}:</span>
                              <span>
                                {currencySymbol}{formatPrice(tierPricing.pricing.pricePerInspection)} per inspection
                                {" • "}
                                {currencySymbol}{formatPrice(tierPricing.pricing.totalPackPrice)} total
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Modules */}
              {preview.modules && preview.modules.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-4 text-lg">Premium Modules</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {preview.modules.filter((m: any) => m.isAvailableGlobally).map((module: any) => (
                      <div key={module.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">{module.name}</h4>
                            {module.description && (
                              <p className="text-sm text-muted-foreground mt-1">{module.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 text-right">
                          <p className="font-semibold">
                            {currencySymbol}{formatPrice(module.pricing?.priceMonthly || 0)}/month
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {currencySymbol}{formatPrice(module.pricing?.priceAnnual || 0)}/year
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Module Bundles */}
              {preview.bundles && preview.bundles.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-4 text-lg">Module Bundles</h3>
                  <div className="space-y-2">
                    {preview.bundles.filter((b: any) => b.isActive).map((bundle: any) => (
                      <div key={bundle.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{bundle.name}</h4>
                              {bundle.discountPercentage && (
                                <Badge variant="secondary">{bundle.discountPercentage}% off</Badge>
                              )}
                            </div>
                            {bundle.description && (
                              <p className="text-sm text-muted-foreground mt-1">{bundle.description}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">
                              {currencySymbol}{formatPrice(bundle.pricing?.priceMonthly || 0)}/month
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {currencySymbol}{formatPrice(bundle.pricing?.priceAnnual || 0)}/year
                            </p>
                            {bundle.pricing?.savingsMonthly && (
                              <p className="text-xs text-green-600">
                                Save {currencySymbol}{formatPrice(bundle.pricing.savingsMonthly)}/month
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// Quotations Management Component
export function QuotationsManagement() {
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [quoteFormData, setQuoteFormData] = useState({
    quotedPrice: "",
    quotedInspections: "",
    billingPeriod: "monthly" as "monthly" | "annual",
    adminNotes: "",
    customerNotes: "",
  });

  const { data: quotations, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/quotations", selectedStatus],
    queryFn: async () => {
      const params = selectedStatus !== "all" ? `?status=${selectedStatus}` : "";
      const res = await apiRequest("GET", `/api/admin/quotations${params}`);
      return res.json();
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/admin/quotations/stats"],
  });

  const { data: requestDetails } = useQuery({
    queryKey: ["/api/admin/quotations", selectedRequest?.id],
    queryFn: async () => {
      if (!selectedRequest?.id) return null;
      const res = await apiRequest("GET", `/api/admin/quotations/${selectedRequest.id}`);
      return res.json();
    },
    enabled: !!selectedRequest?.id,
  });

  const createQuoteMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/admin/quotations/${selectedRequest.id}/quote`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Quote created successfully" });
      setQuoteDialogOpen(false);
      setQuoteFormData({ quotedPrice: "", quotedInspections: "", billingPeriod: "monthly", adminNotes: "", customerNotes: "" });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to create quote", description: error.message, variant: "destructive" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/quotations/${selectedRequest.id}/assign`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Quotation assigned to you" });
      refetch();
    },
  });

  const markContactedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/quotations/${selectedRequest.id}/contacted`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Marked as contacted" });
      refetch();
    },
  });

  const handleCreateQuote = () => {
    if (!selectedRequest) return;
    const existingQuote = quotations?.find((q: any) => q.id === selectedRequest.id)?.quotation;
    if (existingQuote) {
      setQuoteFormData({
        quotedPrice: (existingQuote.quotedPrice / 100).toString(),
        quotedInspections: existingQuote.quotedInspections.toString(),
        billingPeriod: existingQuote.billingPeriod,
        adminNotes: existingQuote.adminNotes || "",
        customerNotes: existingQuote.customerNotes || "",
      });
    } else {
      setQuoteFormData({
        quotedPrice: "",
        quotedInspections: selectedRequest.requestedInspections?.toString() || "",
        billingPeriod: selectedRequest.preferredBillingPeriod || "monthly",
        adminNotes: "",
        customerNotes: "",
      });
    }
    setQuoteDialogOpen(true);
  };

  const handleSubmitQuote = () => {
    createQuoteMutation.mutate({
      quotedPrice: Math.round(parseFloat(quoteFormData.quotedPrice) * 100),
      quotedInspections: parseInt(quoteFormData.quotedInspections),
      billingPeriod: quoteFormData.billingPeriod,
      adminNotes: quoteFormData.adminNotes || undefined,
      customerNotes: quoteFormData.customerNotes || undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pending: { label: "Pending", className: "bg-amber-500" },
      quoted: { label: "Quoted", className: "bg-blue-500" },
      accepted: { label: "Accepted", className: "bg-emerald-500" },
      cancelled: { label: "Cancelled", className: "bg-gray-500" },
      rejected: { label: "Rejected", className: "bg-red-500" },
    };
    const variant = variants[status] || { label: status, className: "bg-gray-500" };
    return <Badge className={variant.className}>{variant.label}</Badge>;
  };

  const formatCurrency = (amount: number, currency: string) => {
    const symbols: Record<string, string> = { GBP: "£", USD: "$", AED: "د.إ", EUR: "€" };
    const symbol = symbols[currency] || currency;
    return `${symbol}${(amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (isLoading) return <div>Loading quotations...</div>;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-600">{stats?.pending || 0}</div>
            <div className="text-sm text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{stats?.quoted || 0}</div>
            <div className="text-sm text-muted-foreground">Quoted</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-emerald-600">{stats?.accepted || 0}</div>
            <div className="text-sm text-muted-foreground">Accepted</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-gray-600">{stats?.cancelled || 0}</div>
            <div className="text-sm text-muted-foreground">Cancelled</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Quotation Requests</CardTitle>
          <div className="flex gap-2">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="quoted">Quoted</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => {
              fetch("/api/admin/quotations/export", { credentials: "include" })
                .then(res => res.blob())
                .then(blob => {
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `quotations-${new Date().toISOString().split('T')[0]}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                  toast({ title: "Export started" });
                });
            }}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Inspections</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotations?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No quotation requests found
                  </TableCell>
                </TableRow>
              ) : (
                quotations?.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>{format(new Date(item.createdAt), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-medium">{item.organization?.name || "Unknown"}</TableCell>
                    <TableCell>{item.organization?.owner?.email || "N/A"}</TableCell>
                    <TableCell>{item.requestedInspections}</TableCell>
                    <TableCell>{item.preferredBillingPeriod}</TableCell>
                    <TableCell>{item.currency}</TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell>
                      {item.assignedAdmin ? `${item.assignedAdmin.firstName} ${item.assignedAdmin.lastName}` : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedRequest(item);
                            setDetailsDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {item.status === "pending" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedRequest(item);
                              handleCreateQuote();
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Quote Dialog */}
      <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create/Update Quote</DialogTitle>
            <DialogDescription>
              Create a custom quote for {selectedRequest?.organization?.name || "this organization"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quoted Price ({selectedRequest?.currency || "GBP"})</Label>
                <Input
                  type="number"
                  value={quoteFormData.quotedPrice}
                  onChange={(e) => setQuoteFormData({ ...quoteFormData, quotedPrice: e.target.value })}
                  placeholder="200.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Quoted Inspections</Label>
                <Input
                  type="number"
                  value={quoteFormData.quotedInspections}
                  onChange={(e) => setQuoteFormData({ ...quoteFormData, quotedInspections: e.target.value })}
                  placeholder="600"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Billing Period</Label>
              <Select
                value={quoteFormData.billingPeriod}
                onValueChange={(v: "monthly" | "annual") => setQuoteFormData({ ...quoteFormData, billingPeriod: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Internal Notes (Admin Only)</Label>
              <Textarea
                value={quoteFormData.adminNotes}
                onChange={(e) => setQuoteFormData({ ...quoteFormData, adminNotes: e.target.value })}
                placeholder="Internal notes not visible to customer..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Customer Notes (Visible to Customer)</Label>
              <Textarea
                value={quoteFormData.customerNotes}
                onChange={(e) => setQuoteFormData({ ...quoteFormData, customerNotes: e.target.value })}
                placeholder="Notes visible to customer in billing page..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitQuote} disabled={createQuoteMutation.isPending}>
              {createQuoteMutation.isPending ? "Saving..." : "Save Quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Quotation Request Details</DialogTitle>
            <DialogDescription>
              Full details for {selectedRequest?.organization?.name || "this request"}
            </DialogDescription>
          </DialogHeader>
          {requestDetails && (
            <div className="space-y-6 py-4">
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="organization">Organization</TabsTrigger>
                  <TabsTrigger value="activity">Activity Log</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Request ID</Label>
                      <p className="font-medium">{requestDetails.request.id}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <div>{getStatusBadge(requestDetails.request.status)}</div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Requested Inspections</Label>
                      <p className="font-medium">{requestDetails.request.requestedInspections}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Preferred Billing</Label>
                      <p className="font-medium">{requestDetails.request.preferredBillingPeriod}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Currency</Label>
                      <p className="font-medium">{requestDetails.request.currency}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Created</Label>
                      <p className="font-medium">{format(new Date(requestDetails.request.createdAt), "PPp")}</p>
                    </div>
                  </div>
                  {requestDetails.quotation && (
                    <div className="border-t pt-4">
                      <h3 className="font-semibold mb-2">Current Quote</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-muted-foreground">Quoted Price</Label>
                          <p className="font-medium text-lg">
                            {formatCurrency(requestDetails.quotation.quotedPrice, requestDetails.quotation.currency)}
                          </p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Quoted Inspections</Label>
                          <p className="font-medium">{requestDetails.quotation.quotedInspections}</p>
                        </div>
                      </div>
                      {requestDetails.quotation.customerNotes && (
                        <div className="mt-2">
                          <Label className="text-muted-foreground">Customer Notes</Label>
                          <p className="text-sm">{requestDetails.quotation.customerNotes}</p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 pt-4 border-t">
                    {requestDetails.request.status === "pending" && (
                      <>
                        <Button onClick={handleCreateQuote}>Create Quote</Button>
                        <Button variant="outline" onClick={() => assignMutation.mutate()}>
                          Assign to Me
                        </Button>
                        <Button variant="outline" onClick={() => markContactedMutation.mutate()}>
                          Mark as Contacted
                        </Button>
                      </>
                    )}
                    {requestDetails.request.status === "quoted" && (
                      <Button onClick={handleCreateQuote}>Update Quote</Button>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="organization" className="space-y-4">
                  {requestDetails.organization && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-muted-foreground">Organization Name</Label>
                          <p className="font-medium">{requestDetails.organization.name}</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Country</Label>
                          <p className="font-medium">{requestDetails.organization.countryCode || "N/A"}</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Registration Date</Label>
                          <p className="font-medium">
                            {format(new Date(requestDetails.organization.createdAt), "PP")}
                          </p>
                        </div>
                      </div>
                      {requestDetails.organization.owner && (
                        <div className="border-t pt-4">
                          <h3 className="font-semibold mb-2">Contact Person</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-muted-foreground">Name</Label>
                              <p className="font-medium">
                                {requestDetails.organization.owner.firstName} {requestDetails.organization.owner.lastName}
                              </p>
                            </div>
                            <div>
                              <Label className="text-muted-foreground">Email</Label>
                              <p className="font-medium">{requestDetails.organization.owner.email}</p>
                            </div>
                          </div>
                        </div>
                      )}
                      {requestDetails.organization.instanceSubscription && (
                        <div className="border-t pt-4">
                          <h3 className="font-semibold mb-2">Current Subscription</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-muted-foreground">Billing Cycle</Label>
                              <p className="font-medium">{requestDetails.organization.instanceSubscription.billingCycle}</p>
                            </div>
                            <div>
                              <Label className="text-muted-foreground">Status</Label>
                              <p className="font-medium">{requestDetails.organization.instanceSubscription.subscriptionStatus}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>
                <TabsContent value="activity" className="space-y-2">
                  {requestDetails.activityLog?.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No activity logged yet</p>
                  ) : (
                    requestDetails.activityLog?.map((log: any) => (
                      <div key={log.id} className="flex items-start gap-3 p-3 border rounded-lg">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                          {log.performedByType === "admin" ? <User className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{log.action}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(log.createdAt), "PPp")}
                            </span>
                          </div>
                          {log.details && Object.keys(log.details).length > 0 && (
                            <pre className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

