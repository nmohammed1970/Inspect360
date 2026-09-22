import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Loader2, Save } from "lucide-react";

type UnitPricing = {
  id?: string;
  pricePerUnitMonthly: string;
  pricePerUnitAnnual: string;
  currencyCode: string;
  featuresIncluded: string;
  updatedAt?: string | null;
};

type Currency = {
  code: string;
  symbol: string;
  isActive: boolean;
};

const EMPTY: UnitPricing = {
  pricePerUnitMonthly: "0",
  pricePerUnitAnnual: "0",
  currencyCode: "GBP",
  featuresIncluded: "",
};

export default function AdminUnitPricing() {
  const { toast } = useToast();
  const [form, setForm] = useState<UnitPricing>(EMPTY);

  const { data, isLoading } = useQuery<UnitPricing>({
    queryKey: ["/api/admin/unit-pricing"],
    retry: false,
  });

  const { data: currencies = [] } = useQuery<Currency[]>({
    queryKey: ["/api/admin/currencies"],
    retry: false,
  });

  useEffect(() => {
    if (data) {
      setForm({
        id: data.id,
        pricePerUnitMonthly: String(data.pricePerUnitMonthly ?? "0"),
        pricePerUnitAnnual: String(data.pricePerUnitAnnual ?? "0"),
        currencyCode: data.currencyCode || "GBP",
        featuresIncluded: data.featuresIncluded ?? "",
        updatedAt: data.updatedAt,
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: UnitPricing) => {
      const response = await fetch("/api/admin/unit-pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          pricePerUnitMonthly: payload.pricePerUnitMonthly,
          pricePerUnitAnnual: payload.pricePerUnitAnnual,
          currencyCode: payload.currencyCode,
          featuresIncluded: payload.featuresIncluded,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to save unit pricing");
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/unit-pricing"] });
      toast({
        title: "Saved",
        description: "Unit pricing record updated",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: error.message,
      });
    },
  });

  const currencyOptions =
    currencies.length > 0
      ? currencies.filter((c) => c.isActive !== false)
      : [
          { code: "GBP", symbol: "£", isActive: true },
          { code: "USD", symbol: "$", isActive: true },
          { code: "AED", symbol: "د.إ", isActive: true },
        ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Unit Pricing</h1>
        <p className="text-muted-foreground">
          Platform default per-unit monthly and annual pricing. Instances start from this sheet until you customize them under Manage → Unit pricing.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Price sheet</CardTitle>
          <CardDescription>
            Platform default price sheet. Customize rates per organization from Dashboard → Manage → Unit pricing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price-monthly">Per unit price / month</Label>
              <Input
                id="price-monthly"
                type="number"
                min="0"
                step="0.01"
                value={form.pricePerUnitMonthly}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, pricePerUnitMonthly: e.target.value }))
                }
                data-testid="input-unit-price-monthly"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price-annual">Per unit price / annum</Label>
              <Input
                id="price-annual"
                type="number"
                min="0"
                step="0.01"
                value={form.pricePerUnitAnnual}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, pricePerUnitAnnual: e.target.value }))
                }
                data-testid="input-unit-price-annual"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Select
              value={form.currencyCode}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, currencyCode: value }))
              }
            >
              <SelectTrigger id="currency" data-testid="select-unit-pricing-currency">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {currencyOptions.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="features">Features included</Label>
            <Textarea
              id="features"
              rows={8}
              placeholder="List included features…"
              value={form.featuresIncluded}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, featuresIncluded: e.target.value }))
              }
              data-testid="textarea-unit-pricing-features"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              {form.updatedAt
                ? `Last updated ${new Date(form.updatedAt).toLocaleString()}`
                : "Not saved yet"}
            </p>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending}
              data-testid="button-save-unit-pricing"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
