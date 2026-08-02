import { useQuery, useMutation } from "@tanstack/react-query";
import { useRef, useEffect, useState, useMemo } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard,
  Package,
  TrendingUp,
  ExternalLink,
  Zap,
  AlertCircle,
  CheckCircle2,
  FileText,
  Download,
  X,
  Sparkles,
  Clock,
  ShieldCheck,
  Users,
  Layout,
  Globe,
  Coins,
  ChevronRight,
  ArrowUpRight,
  Loader2,
  Lock,
  ArrowUp,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useLocation, Link } from "wouter";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Slider } from "@/components/ui/slider";
import { motion, AnimatePresence } from "framer-motion";
import { Star, ShoppingCart } from "lucide-react";
import { useBillingState, type BillingPeriod } from "@/hooks/useBillingState";
import {
  TIERS,
  ANNUAL_MULTIPLIER,
  SLIDER_MIN,
  SLIDER_MAX,
  QUOTE_GATE,
  PHOTOS_PER_CREDIT,
  getTierByInspections,
  getNextTier,
  getTierById,
  compareTiers,
  computePlanPrice,
  computePackPricing,
} from "@/config/billingTiers";
import {
  MODULES,
  moduleMonthlyPrice,
  moduleAnnualPrice,
  resolveTenantPortalPrice,
} from "@/config/billingModules";
import { formatBillingDateUtcLocale } from "@shared/billingClock";
import {
  SUPPORTED_BILLING_CURRENCIES,
  BILLING_CURRENCY_SYMBOLS,
  BILLING_FALLBACK_RATES_FROM_GBP,
} from "@shared/billingCurrencies";

/** Lightweight billing analytics — wire to a real pipeline when available */
function trackBillingEvent(name: string, props?: Record<string, unknown>) {
  try {
    window.dispatchEvent(new CustomEvent("inspect360:billing", { detail: { name, ...props, at: Date.now() } }));
    if (typeof (window as any).gtag === "function") {
      (window as any).gtag("event", name, props);
    }
    console.info(`[billing-analytics] ${name}`, props || {});
  } catch { /* no-op */ }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Tier {
  id: string;
  name: string;
  code: string;
  description: string;
  includedInspections: number;
  basePriceMonthly: number;
  basePriceAnnual: number;
  tierOrder: number;
  isActive?: boolean;
}

interface PricingResult {
  tier: {
    id: string;
    name: string;
    code: string;
    included_inspections: number;
    base_price: number;
    currency: string;
  };
  additional_inspections?: {
    count: number;
    recommended_pack: string;
    pack_price: number;
    price_per_inspection: number;
  } | null;
  currency: string;
  recommendedPacks: any[];
  modules: any[];
  upgrade_recommendation?: {
    recommended_tier: string;
    savings: number;
    message: string;
  } | null;
  calculations: {
    baseMonthly: number;
    baseAnnual: number;
    modulesMonthly: number;
    modulesAnnual: number;
    totalMonthly: number;
    totalAnnual: number;
  };
}

// ---------------------------------------------------------------------------
// Currency helpers — supported list locked in shared/billingCurrencies.ts
// ---------------------------------------------------------------------------

const FALLBACK_RATES: Record<string, number> = { ...BILLING_FALLBACK_RATES_FROM_GBP };
const CURRENCY_SYMBOLS: Record<string, string> = { ...BILLING_CURRENCY_SYMBOLS };

const getPerInspectionPriceFromConfig = (tierName: string, selectedCurrency: string, config: any): number => {
  try {
    if (config?.tierPricing && config?.tiers) {
      const tier = config.tiers.find((t: any) => t.name === tierName);
      if (tier) {
        let pricingRow = config.tierPricing.find((p: any) => p.tierId === tier.id && p.currencyCode === selectedCurrency);
        if (pricingRow?.perInspectionPrice) return pricingRow.perInspectionPrice;

        pricingRow = config.tierPricing.find((p: any) => p.tierId === tier.id && p.currencyCode === "GBP");
        if (pricingRow?.perInspectionPrice) {
          const rate = FALLBACK_RATES[selectedCurrency.toUpperCase()] || 1.0;
          return Math.round(pricingRow.perInspectionPrice * rate);
        }
      }
    }
  } catch { }
  let basePrice = 550;
  switch (tierName) {
    case "Starter": basePrice = 1200; break;
    case "Growth": basePrice = 1000; break;
    case "Professional": basePrice = 900; break;
    case "Enterprise": basePrice = 550; break;
  }
  const rate = FALLBACK_RATES[selectedCurrency.toUpperCase()] || 1.0;
  return Math.round(basePrice * rate);
};

const formatCurrencyValue = (amount: number, currency: string) => {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const currencyInMajor = amount > 1000 ? amount / 100 : amount;
  return `${symbol}${currencyInMajor.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatMajor = (amount: number, currency: string) => {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const MODULE_ICONS: Record<string, React.ReactNode> = {
  tenant_portal: <Users className="h-5 w-5" />,
  dispute_portal: <ShieldCheck className="h-5 w-5" />,
  retention_ext: <Clock className="h-5 w-5" />,
  ivy_tenant: <Sparkles className="h-5 w-5" />,
  ivy_hq: <Layout className="h-5 w-5" />,
  white_label: <Globe className="h-5 w-5" />,
};

// ---------------------------------------------------------------------------
// Main Billing Page
// ---------------------------------------------------------------------------

export default function Billing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  const {
    currentPlan,
    selectedPlan,
    billingPeriod,
    setBillingPeriod,
    inspectionsNeeded,
    setInspectionsNeeded,
    setInspectionsNeededRaw,
    ctaState,
    showUpgradeBanner,
    usageRatio,
    inspectionsLeft,
    inspectionsTotal,
    trialAvailable,
    trialUsed,
    subscription,
    balance,
    isLoading: subLoading,
  } = useBillingState();

  // Currency
  const organizationCurrency = (user as any)?.organizationCurrency || (user as any)?.organization?.preferredCurrency || "GBP";
  const [selectedCurrency, setSelectedCurrency] = useState<string>(organizationCurrency);
  useEffect(() => {
    const orgCurrency = (user as any)?.organizationCurrency || (user as any)?.organization?.preferredCurrency;
    if (orgCurrency && orgCurrency !== selectedCurrency) setSelectedCurrency(orgCurrency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Debounced inspections for API calls (UI updates immediately; keep API ≤100ms per spec)
  const [debouncedInspections, setDebouncedInspections] = useState<number>(SLIDER_MIN);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedInspections(inspectionsNeeded), 100);
    return () => clearTimeout(timer);
  }, [inspectionsNeeded]);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/pricing/calculate"], exact: false });
  }, [inspectionsNeeded, selectedCurrency]);

  // Slider ref
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  const getPositionPercent = (value: number) => ((value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;

  // Quotation dialog
  const [quotationDialogOpen, setQuotationDialogOpen] = useState(false);
  const [exactInspectionsCount, setExactInspectionsCount] = useState<number>(QUOTE_GATE);
  const [quotationNotes, setQuotationNotes] = useState<string>("");

  // --- Queries ---
  const { data: config } = useQuery<{ tiers: Tier[]; currencies: any[]; tierPricing?: any[] }>({
    queryKey: ["/api/pricing/config"],
  });

  const { data: pricing, isError, error: pricingError } = useQuery<PricingResult>({
    queryKey: ["/api/pricing/calculate", debouncedInspections, selectedCurrency, billingPeriod],
    queryFn: async () => {
      const cacheBuster = `&_t=${Date.now()}`;
      const res = await fetch(`/api/pricing/calculate?inspections=${debouncedInspections}&currency=${selectedCurrency}${cacheBuster}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache, no-store, must-revalidate", Pragma: "no-cache", Expires: "0" },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: "API Error" }));
        throw new Error(errData.message || "Failed to calculate pricing");
      }
      return res.json();
    },
    enabled: !!selectedCurrency && debouncedInspections >= 0,
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnReconnect: true,
  });

  const { data: myModules } = useQuery<any[]>({ queryKey: ["/api/marketplace/my-modules"] });
  const { data: quotationData, refetch: refetchQuotation } = useQuery<{ request: any; quotation: any }>({
    queryKey: ["/api/quotations/pending"],
    retry: false,
  });

  // --- Mutations ---
  const quotationRequestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/quotations/request", {
        requestedInspections: exactInspectionsCount,
        currency: selectedCurrency,
        preferredBillingPeriod: billingPeriod,
        customerNotes: quotationNotes || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Quotation Request Submitted", description: "We've received your request. Our team will prepare a custom quote for you." });
      setQuotationDialogOpen(false);
      setQuotationNotes("");
      refetchQuotation();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to submit quotation request", variant: "destructive" });
    },
  });

  const quotationCheckoutMutation = useMutation({
    mutationFn: async (quotationId: string) => {
      const res = await apiRequest("POST", "/api/billing/quotation-checkout", { quotationId });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
      else toast({ title: "Error", description: "Failed to initiate checkout", variant: "destructive" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to initiate checkout", variant: "destructive" });
    },
  });

  // --- Pricing breakdown (reactive to slider) ---
  const pricingBreakdown = useMemo(() => {
    if (pricing?.calculations) {
      let tierPrice = billingPeriod === "monthly" ? pricing.calculations.baseMonthly : pricing.calculations.baseAnnual;
      let additionalInspections = 0;
      let additionalCost = 0;
      const currentTierName = pricing?.tier?.name || "";
      const tierIncluded = pricing?.tier?.included_inspections || 0;

      if (pricing.additional_inspections) {
        additionalInspections = pricing.additional_inspections.count || 0;
        const pricePerInspectionMinor = Math.round((pricing.additional_inspections.price_per_inspection || 0) * 100);
        additionalCost = additionalInspections * pricePerInspectionMinor;
      } else {
        additionalInspections = Math.max(0, inspectionsNeeded - tierIncluded);
        const perInspectionPrice = getPerInspectionPriceFromConfig(currentTierName, selectedCurrency, config);
        additionalCost = additionalInspections * perInspectionPrice;
      }

      const totalCost = tierPrice + additionalCost;

      return { tierPrice, additionalInspections, additionalCost, currentTierName, tierIncluded, moduleCost: 0, totalCost, tierCodeForCheckout: pricing?.tier?.code || "" };
    }

    // Fallback local calculation
    const activeTiers = (config?.tiers || []).filter((t: Tier) => t.isActive !== false);
    const sortedTiers = [...activeTiers].sort((a: Tier, b: Tier) => a.includedInspections - b.includedInspections);
    const minCount = Math.max(inspectionsNeeded, SLIDER_MIN);

    let detectedTier: Tier | undefined;
    if (minCount >= QUOTE_GATE) {
      detectedTier = undefined; // quote only — no local price
    } else {
      for (let i = 0; i < sortedTiers.length; i++) {
        const cur = sortedTiers[i];
        const next = sortedTiers[i + 1];
        if (!next) { if (minCount >= cur.includedInspections) { detectedTier = cur; break; } }
        else if (minCount >= cur.includedInspections && minCount < next.includedInspections) { detectedTier = cur; break; }
      }
      if (!detectedTier && sortedTiers.length > 0) detectedTier = sortedTiers[sortedTiers.length - 1];
    }

    let tierPrice = 0, additionalInspections = 0, additionalCost = 0, currentTierName = "", tierIncluded = 0, tierCodeForCheckout = "";

    if (detectedTier) {
      currentTierName = detectedTier.name;
      tierIncluded = detectedTier.includedInspections;
      tierCodeForCheckout = detectedTier.code;
      const basePrice = billingPeriod === "monthly" ? detectedTier.basePriceMonthly : detectedTier.basePriceAnnual;
      const rate = FALLBACK_RATES[selectedCurrency.toUpperCase()] || 1.0;
      tierPrice = selectedCurrency === "GBP" ? basePrice : Math.round(basePrice * rate);
      additionalInspections = Math.max(0, minCount - tierIncluded);
      additionalCost = additionalInspections * getPerInspectionPriceFromConfig(currentTierName, selectedCurrency, config);
    }

    return { tierPrice, additionalInspections, additionalCost, currentTierName, tierIncluded, moduleCost: 0, totalCost: tierPrice + additionalCost, tierCodeForCheckout };
  }, [inspectionsNeeded, billingPeriod, selectedCurrency, config?.tiers, config?.tierPricing, pricing]);

  const checkoutMutation = useMutation({
    mutationFn: async (planCode: string) => {
      const rate = FALLBACK_RATES[selectedCurrency.toUpperCase()] || 1.0;
      const price = computePlanPrice(inspectionsNeeded, billingPeriod);
      // Prefer config formula (n × rate); fall back to API breakdown
      const tierPriceMajor = price
        ? (billingPeriod === "annual" ? price.annual : price.monthly)
        : (pricingBreakdown.tierPrice > 1000 ? pricingBreakdown.tierPrice / 100 : pricingBreakdown.tierPrice);
      const tierPriceMinor = Math.round(tierPriceMajor * rate * 100);
      const res = await apiRequest("POST", "/api/billing/checkout", {
        planCode,
        billingPeriod,
        currency: selectedCurrency,
        inspectionCount: inspectionsNeeded,
        totalPrice: tierPriceMinor,
        tierPrice: tierPriceMinor,
        additionalCost: 0,
        moduleCost: 0,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
      else toast({ title: "Stripe Error", description: "We couldn't generate a checkout link. Please check your Stripe configuration.", variant: "destructive" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to initiate checkout", variant: "destructive" });
    },
  });

  // Process payment callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const paymentStatus = params.get("payment");
    const isSuccess = paymentStatus === "success" || params.get("success") === "true";

    if (isSuccess && sessionId) {
      const processSession = async () => {
        window.history.replaceState({}, "", window.location.pathname);
        try {
          const response = await apiRequest("POST", "/api/billing/process-session", { sessionId });
          const data = await response.json();
          if (data.creditsGranted) toast({ title: "Purchase Successful", description: `Successfully added ${data.creditsGranted} inspection credits to your account!` });
          else if (data.processed) toast({ title: "Purchase Processed", description: "Your purchase has been processed successfully." });
          else toast({ title: "Success", description: data.message || "Your purchase has been processed successfully." });
        } catch (e: any) {
          toast({ title: "Processing Error", description: e.message || "We encountered an issue processing your purchase. Please contact support.", variant: "destructive" });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
        queryClient.invalidateQueries({ queryKey: ["/api/billing/inspection-balance"] });
        queryClient.invalidateQueries({ queryKey: ["/api/pricing/calculate"] });
        queryClient.invalidateQueries({ queryKey: ["/api/billing/addon-packs"] });
        if (user?.organizationId) queryClient.invalidateQueries({ queryKey: [`/api/organizations/${user.organizationId}`] });
      };
      processSession();
    } else if (isSuccess && !sessionId) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast, user?.organizationId]);

  // Spec pricing: monthly = n × rate; annual = n × rate × 12 × 0.8 (instant, no API wait)
  const configPrice = useMemo(
    () => computePlanPrice(inspectionsNeeded, billingPeriod),
    [inspectionsNeeded, billingPeriod]
  );

  const displayMonthly = configPrice?.monthly ?? (pricingBreakdown.totalCost > 1000 ? pricingBreakdown.totalCost / 100 : pricingBreakdown.totalCost);
  const displayAnnual = configPrice
    ? configPrice.annual
    : displayMonthly * 12 * ANNUAL_MULTIPLIER;
  const annualSaving = displayMonthly * 12 - displayAnnual;
  const chargedToday = billingPeriod === "annual" ? displayAnnual : displayMonthly;
  const monthlyEquivalent = billingPeriod === "annual" ? displayAnnual / 12 : displayMonthly;

  // Unit price for selected plan
  const selectedTierConfig = getTierByInspections(inspectionsNeeded);
  const unitPriceGBP = selectedTierConfig.rate;
  const unitPriceConverted = unitPriceGBP !== null
    ? unitPriceGBP * (FALLBACK_RATES[selectedCurrency.toUpperCase()] || 1.0)
    : null;

  // Upgrade banner data
  const nextTierConfig = currentPlan.tier !== "none" ? getNextTier(currentPlan.tier) : null;
  const currentTierConfig = currentPlan.tier !== "none" ? getTierById(currentPlan.tier) : null;
  const upgradeDelta =
    nextTierConfig?.rate != null && currentTierConfig?.rate != null && currentPlan.includedPerMonth > 0
      ? nextTierConfig.min * nextTierConfig.rate - currentPlan.includedPerMonth * currentTierConfig.rate
      : null;

  // Fire analytics when upgrade banner renders
  useEffect(() => {
    if (showUpgradeBanner && nextTierConfig) {
      trackBillingEvent("upgrade_banner_rendered", {
        currentTier: currentPlan.tier,
        nextTier: nextTierConfig.id,
        used: currentPlan.usedThisPeriod,
        included: currentPlan.includedPerMonth,
      });
    }
  }, [showUpgradeBanner, nextTierConfig?.id, currentPlan.tier, currentPlan.usedThisPeriod, currentPlan.includedPerMonth]);

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <div className="container mx-auto p-4 md:p-6 space-y-8 mb-24">

      {/* Page Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">Billing &amp; Subscription</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your organization&apos;s plan, usage, and billing history.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg border border-border">
              <button
                onClick={() => setBillingPeriod("annual")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all relative ${billingPeriod === "annual" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Annual
                <Badge className="absolute -top-2 -right-2 bg-emerald-500 text-white border-none py-0 px-1.5 text-[9px]">Save 20%</Badge>
              </button>
              <button
                onClick={() => setBillingPeriod("monthly")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${billingPeriod === "monthly" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Monthly
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Header stat cards — all read from currentPlan                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Current Plan */}
        <Card className="hover-elevate transition-smooth border-primary/10">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Current Plan</p>
                <h3 className="text-lg font-bold">
                  {currentPlan.status === "none"
                    ? "No active plan"
                    : currentPlan.status === "past_due"
                      ? `${currentPlan.tierName} · Payment failed`
                      : `${currentPlan.tierName} · ${currentPlan.billingPeriod === "annual" ? "Annual" : "Monthly"}`}
                </h3>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Inspections Left — "X of Y" */}
        <Card className="hover-elevate transition-smooth border-primary/10">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Credits Left</p>
                <h3 className="text-lg font-bold">
                  {inspectionsLeft} of {inspectionsTotal}
                </h3>
                {currentPlan.topUpCredits > 0 && currentPlan.includedPerMonth > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Includes {currentPlan.includedPerMonth} plan + {currentPlan.topUpCredits} bonus
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Renews / Ends */}
        <Card className="hover-elevate transition-smooth border-primary/10">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {currentPlan.status === "canceled" ? "Ends" : "Renews"}
                </p>
                <h3 className="text-lg font-bold">
                  {currentPlan.renewsOn
                    ? formatBillingDateUtcLocale(currentPlan.renewsOn)
                    : "N/A"}
                </h3>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Usage-triggered upgrade banner (BILL-05)                           */}
      {/* ------------------------------------------------------------------ */}
      {showUpgradeBanner && nextTierConfig && nextTierConfig.rate !== null && (
        <div className="bg-gradient-to-r from-primary/10 to-emerald-500/10 border border-primary/20 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-semibold text-sm">
              You&apos;ve used {currentPlan.usedThisPeriod} of {currentPlan.includedPerMonth} credits this month.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {nextTierConfig.label} gives you {nextTierConfig.min} for{" "}
              {upgradeDelta != null
                ? `${formatMajor(Math.abs(upgradeDelta) * (FALLBACK_RATES[selectedCurrency.toUpperCase()] || 1.0), selectedCurrency)}${upgradeDelta >= 0 ? " more" : " less"}`
                : "a better rate"}{" "}
              — and drops your rate to{" "}
              {formatMajor(nextTierConfig.rate * (FALLBACK_RATES[selectedCurrency.toUpperCase()] || 1.0), selectedCurrency)} per inspection.
            </p>
          </div>
          <Button
            variant="default"
            className="shrink-0"
            onClick={() => {
              trackBillingEvent("upgrade_banner_clicked", {
                currentTier: currentPlan.tier,
                nextTier: nextTierConfig.id,
              });
              setInspectionsNeededRaw(nextTierConfig.min);
              document.getElementById("pricing-slider-section")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <ArrowUp className="h-4 w-4 mr-2" />
            Move to {nextTierConfig.label}
          </Button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Empty state / trial bridge (BILL-06)                               */}
      {/* ------------------------------------------------------------------ */}
      {trialAvailable && (
        <div className="bg-gradient-to-br from-primary/5 to-emerald-500/5 border border-primary/20 rounded-2xl p-8 text-center space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto">
            <Sparkles className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-bold">Run 3 inspections free</h2>
          <p className="text-muted-foreground max-w-md mx-auto">No card required. Your reports are yours to keep.</p>
          <div className="flex flex-col items-center gap-2">
            <Button
              size="lg"
              className="px-8"
              onClick={() => {
                trackBillingEvent("trial_cta_clicked");
                toast({ title: "Free trial ready", description: "You can run up to 3 inspections for free — no card required." });
                window.location.href = "/inspections";
              }}
            >
              Run 3 inspections free
            </Button>
            <button
              className="text-sm text-primary hover:underline"
              onClick={() => document.getElementById("pricing-slider-section")?.scrollIntoView({ behavior: "smooth" })}
            >
              Or choose a plan
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Pricing Slider Section                                             */}
      {/* ------------------------------------------------------------------ */}
      <section id="pricing-slider-section" className="bg-card rounded-3xl p-8 border border-border shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 flex gap-3">
          <div className="flex items-center gap-2 bg-muted/30 p-1.5 rounded-xl border border-border">
            <Coins className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
              <SelectTrigger className="h-7 w-20 border-none bg-transparent font-bold focus:ring-0 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_BILLING_CURRENCIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code} ({BILLING_CURRENCY_SYMBOLS[code]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="max-w-4xl mx-auto space-y-8 py-4">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">How many inspections do you need per month?</h2>
            <p className="text-sm text-muted-foreground">Each inspection includes up to {PHOTOS_PER_CREDIT} photos.</p>
          </div>

          <div className="space-y-8 py-4">
            {/* Slider with all tier ticks */}
            <div className="relative pt-8 pb-12">
              {/* Floating value label */}
              <div
                className="absolute -top-4 bg-primary text-white px-4 py-1.5 rounded-full font-bold text-base shadow-lg z-10 whitespace-nowrap"
                style={{ left: `${getPositionPercent(inspectionsNeeded)}%`, transform: "translateX(-50%)", pointerEvents: "none" }}
              >
                {inspectionsNeeded >= QUOTE_GATE ? "200+" : inspectionsNeeded}
              </div>

              <div className="relative w-full" ref={sliderContainerRef}>
                <Slider
                  value={[Math.min(Math.max(inspectionsNeeded, SLIDER_MIN), SLIDER_MAX)]}
                  onValueChange={(v) => setInspectionsNeeded(v[0])}
                  min={SLIDER_MIN}
                  max={SLIDER_MAX}
                  step={1}
                  aria-label={`Inspections per month: ${inspectionsNeeded}. Selected plan: ${selectedPlan.tierName}`}
                  className="[&_[role=slider]]:h-6 [&_[role=slider]]:w-6 [&_[role=slider]]:bg-background [&_[role=slider]]:border-primary [&_[role=slider]]:border-2 [&_[role=slider]]:-translate-x-1/2"
                />
                <span className="sr-only" aria-live="polite">
                  Selected plan: {selectedPlan.tierName}, {inspectionsNeeded} inspections per month
                  {unitPriceConverted != null ? `, ${formatMajor(unitPriceConverted, selectedCurrency)} per inspection` : ""}
                </span>

                {/* Tier boundary markers — 10 / 30 / 75 / 200 (200 = Enterprise quote gate) */}
                <div className="absolute top-0 left-0 right-0 h-1" style={{ marginTop: "12px" }}>
                  {TIERS.map((tier) => (
                    <div
                      key={tier.id}
                      className="absolute flex flex-col items-center gap-1"
                      style={{ left: `${getPositionPercent(tier.min)}%`, transform: "translateX(-50%)", pointerEvents: "none" }}
                    >
                      <div className="w-0.5 h-6 bg-primary/30" />
                      <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap mt-1">
                        {tier.min >= QUOTE_GATE ? "200+" : tier.min}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tier labels under slider */}
              <div className="absolute top-20 left-0 right-0 mt-4 h-8">
                {TIERS.map((tier) => {
                  const pos = getPositionPercent(tier.min);
                  return (
                    <div
                      key={tier.id}
                      className="flex flex-col items-center absolute"
                      style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
                    >
                      <span className="text-xs font-medium text-foreground whitespace-nowrap">{tier.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected plan details — reads from selectedPlan, not currentPlan */}
            <div className="bg-muted/30 rounded-xl p-6 space-y-2 border border-border">
              <div className="text-sm space-y-1">
                <p className="font-semibold">
                  Selected plan:{" "}
                  {inspectionsNeeded >= QUOTE_GATE
                    ? "Enterprise — 200+ inspections/month (quote)"
                    : `${selectedPlan.tierName} — ${inspectionsNeeded} inspections/month`}
                </p>
                {unitPriceConverted !== null && inspectionsNeeded < QUOTE_GATE && (
                  <p className="text-primary font-medium">
                    {formatMajor(unitPriceConverted, selectedCurrency)} per inspection · AI analysis included
                  </p>
                )}
              </div>
            </div>

            {/* Pricing Breakdown — prefer config n×rate so UI never waits on API */}
            {isError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 text-center mb-2">
                <p className="text-xs text-muted-foreground">Live pricing API unavailable — showing configured rates.</p>
              </div>
            )}

            {inspectionsNeeded < QUOTE_GATE && configPrice && (
              <div className="bg-card rounded-2xl p-8 border border-border shadow-sm space-y-4">
                <div className="space-y-3">
                  {/* Annual display: 3 lines per spec — uses n × rate formula */}
                  {billingPeriod === "annual" ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Billed annually</span>
                        <span className="font-bold text-2xl">{formatMajor(chargedToday * (FALLBACK_RATES[selectedCurrency.toUpperCase()] || 1.0), selectedCurrency)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-sm">Monthly equivalent</span>
                        <span className="text-sm text-muted-foreground">{formatMajor(monthlyEquivalent * (FALLBACK_RATES[selectedCurrency.toUpperCase()] || 1.0), selectedCurrency)}/mo</span>
                      </div>
                      {annualSaving > 0 && (
                        <p className="text-sm font-medium text-emerald-600">
                          You save {formatMajor(annualSaving * (FALLBACK_RATES[selectedCurrency.toUpperCase()] || 1.0), selectedCurrency)} a year
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Monthly charge</span>
                        <span className="font-bold text-2xl">{formatMajor(chargedToday * (FALLBACK_RATES[selectedCurrency.toUpperCase()] || 1.0), selectedCurrency)}</span>
                      </div>
                      {annualSaving > 0 && (
                        <button
                          onClick={() => setBillingPeriod("annual")}
                          className="text-sm font-medium text-emerald-600 hover:underline"
                        >
                          Switch to annual and save {formatMajor(annualSaving * (FALLBACK_RATES[selectedCurrency.toUpperCase()] || 1.0), selectedCurrency)}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* CTA Button */}
                <div className="pt-4">
                  {ctaState.action === "quote" ? null : currentPlan.status === "past_due" ? (
                    <Button className="w-full h-12 rounded-xl" onClick={async () => {
                      const res = await apiRequest("POST", "/api/billing/portal");
                      const data = await res.json();
                      if (data.url) window.location.href = data.url;
                    }}>
                      Update payment method <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        const planCode = pricingBreakdown.tierCodeForCheckout || selectedPlan.tier;
                        checkoutMutation.mutate(planCode);
                      }}
                      disabled={ctaState.disabled || checkoutMutation.isPending || !pricingBreakdown.tierCodeForCheckout}
                      className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold transition-all shadow-md active:scale-95"
                    >
                      {checkoutMutation.isPending ? (
                        <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Processing...</span>
                      ) : (
                        <span className="flex items-center gap-2">{ctaState.label} <ChevronRight className="h-4 w-4" /></span>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Quote section for 200+ */}
            {inspectionsNeeded >= QUOTE_GATE && (
              <div className="bg-card rounded-2xl p-8 border border-border shadow-sm space-y-4">
                <QuotationPanel quotationData={quotationData} quotationCheckoutMutation={quotationCheckoutMutation} onRequestQuote={() => { setExactInspectionsCount(Math.max(inspectionsNeeded, QUOTE_GATE)); setQuotationDialogOpen(true); }} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Module cards — tier-aware (BILL-09)                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {MODULES.map((mod) => {
          const unlocked = compareTiers(selectedPlan.tier, mod.minTier) >= 0;
          const lockLabel = TIERS.find((t) => t.id === mod.minTier)?.label || mod.minTier;
          const monthly =
            mod.id === "tenant_portal"
              ? resolveTenantPortalPrice(currentPlan.unitsUnderMgmt)
              : moduleMonthlyPrice(mod.id, currentPlan.unitsUnderMgmt);
          const annual = monthly != null ? moduleAnnualPrice(monthly) : null;
          const rateFx = FALLBACK_RATES[selectedCurrency.toUpperCase()] || 1.0;

          return (
            <Card key={mod.id} className={`group transition-smooth border-border ${unlocked ? "hover-elevate border-dashed" : "opacity-60 border-dashed"}`}>
              <CardHeader className="p-6">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-4 transition-colors ${unlocked ? "bg-muted text-muted-foreground group-hover:bg-primary/5 group-hover:text-primary" : "bg-muted/50 text-muted-foreground/50"}`}>
                  {unlocked ? (MODULE_ICONS[mod.id] || <Package className="h-5 w-5" />) : <Lock className="h-5 w-5" />}
                </div>
                <CardTitle className="text-base">{mod.label}</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  {unlocked ? mod.description : `${lockLabel} and above`}
                </CardDescription>
                {unlocked && monthly != null && (
                  <div className="pt-3 text-sm">
                    <span className="font-semibold">{formatMajor(monthly * rateFx, selectedCurrency)}/mo</span>
                    {annual != null && (
                      <span className="text-muted-foreground text-xs ml-2">
                        or {formatMajor(annual * rateFx, selectedCurrency)}/yr
                      </span>
                    )}
                    {mod.id === "tenant_portal" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Based on {currentPlan.unitsUnderMgmt} units under management
                      </p>
                    )}
                  </div>
                )}
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Add-On Packs (BILL-04) — real volume ladder                        */}
      {/* ------------------------------------------------------------------ */}
      <AddOnPackPurchaseSection currentPlanTier={currentPlan.tier} selectedCurrency={selectedCurrency} />

      {/* Stripe Portal / Manage Billing — before FAQ */}
      <ManageBillingMethodCard />

      {/* ------------------------------------------------------------------ */}
      {/* FAQ — 8 items (v2)                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="max-w-3xl mx-auto py-8">
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold">Frequently Asked Questions</h2>
          <p className="text-sm text-muted-foreground mt-1">Everything you need to know about billing and subscriptions.</p>
        </div>
        <Accordion type="single" collapsible className="w-full space-y-3">
          <AccordionItem value="faq-1" className="border rounded-xl px-4 bg-card shadow-sm">
            <AccordionTrigger className="hover:no-underline py-4 text-sm font-semibold">What happens if I exceed my monthly allowance?</AccordionTrigger>
            <AccordionContent className="pb-4 text-sm text-muted-foreground leading-relaxed">
              If you exhaust your credits, you can instantly upgrade to a higher tier or buy fixed Add-On Packs. Your account is never frozen; we&apos;ll simply notify you to top up.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-2" className="border rounded-xl px-4 bg-card shadow-sm">
            <AccordionTrigger className="hover:no-underline py-4 text-sm font-semibold">How does the Annual discount work?</AccordionTrigger>
            <AccordionContent className="pb-4 text-sm text-muted-foreground leading-relaxed">
              Pre-paying annually grants a 20% discount: annual bill = monthly × 12 × 0.80.
              Example: Growth 30 is £129/month, or £1,238.40/year (not the undiscounted list of £1,548).
              Annual plans also receive their full yearly credit allocation upfront.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-3" className="border rounded-xl px-4 bg-card shadow-sm">
            <AccordionTrigger className="hover:no-underline py-4 text-sm font-semibold">Do unused inspections roll over?</AccordionTrigger>
            <AccordionContent className="pb-4 text-sm text-muted-foreground leading-relaxed">
              Purchased Add-On Pack credits do not expire and roll over month to month. Your base tier allowance resets each billing period.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-4" className="border rounded-xl px-4 bg-card shadow-sm">
            <AccordionTrigger className="hover:no-underline py-4 text-sm font-semibold">Can I change plan mid-month?</AccordionTrigger>
            <AccordionContent className="pb-4 text-sm text-muted-foreground leading-relaxed">
              Yes — upgrades and downgrades take effect immediately. Stripe prorates the rest of the period and invoices now:
              upgrades charge the net difference today; downgrades issue account credit toward future invoices
              (no cash refund). Your next renewal is the full new plan price. Leftover inspection credits convert
              to bonus and still expire on their original date; you also receive the new plan&apos;s full quota.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-5" className="border rounded-xl px-4 bg-card shadow-sm">
            <AccordionTrigger className="hover:no-underline py-4 text-sm font-semibold">How do I cancel?</AccordionTrigger>
            <AccordionContent className="pb-4 text-sm text-muted-foreground leading-relaxed">
              You can cancel anytime from the{" "}
              <button className="text-primary hover:underline font-medium" onClick={async () => {
                try {
                  const res = await apiRequest("POST", "/api/billing/portal");
                  const data = await res.json();
                  if (data.url) window.location.href = data.url;
                } catch { }
              }}>Stripe billing portal</button>.
              Your plan remains active until the end of the current billing period. All your inspection data is retained.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-6" className="border rounded-xl px-4 bg-card shadow-sm">
            <AccordionTrigger className="hover:no-underline py-4 text-sm font-semibold">Can I export my inspection data if I leave?</AccordionTrigger>
            <AccordionContent className="pb-4 text-sm text-muted-foreground leading-relaxed">
              Absolutely. Your inspection reports, photos, and property data belong to you. You can export everything as PDF reports or structured data at any time, whether or not you have an active subscription.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-7" className="border rounded-xl px-4 bg-card shadow-sm">
            <AccordionTrigger className="hover:no-underline py-4 text-sm font-semibold">What counts as one inspection?</AccordionTrigger>
            <AccordionContent className="pb-4 text-sm text-muted-foreground leading-relaxed">
              One inspection credit includes up to {PHOTOS_PER_CREDIT} photos. Larger inspections consume additional credits: 1–{PHOTOS_PER_CREDIT} photos = 1 credit, 301–600 = 2 credits, 601–900 = 3 credits, and so on.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-8" className="border rounded-xl px-4 bg-card shadow-sm">
            <AccordionTrigger className="hover:no-underline py-4 text-sm font-semibold">How long do you keep my photos and reports?</AccordionTrigger>
            <AccordionContent className="pb-4 text-sm text-muted-foreground leading-relaxed">
              We retain photos and reports for 24 months by default. Longer retention is available via the Extended Evidence Retention module (48 months, 72 months, or unlimited).
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Quotation Request Dialog */}
      <Dialog open={quotationDialogOpen} onOpenChange={setQuotationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Custom Quote</DialogTitle>
            <DialogDescription>For 200+ inspections per month, we&apos;ll prepare a custom Enterprise pricing quote tailored to your needs.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="inspections">Number of Inspections Needed</Label>
              <Input id="inspections" type="number" min={QUOTE_GATE} value={exactInspectionsCount} onChange={(e) => setExactInspectionsCount(Number(e.target.value))} placeholder="e.g., 200, 500, 1000" />
              <p className="text-xs text-muted-foreground">Minimum {QUOTE_GATE} inspections required for Enterprise quotes</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="billing-period">Preferred Billing Period</Label>
              <Select value={billingPeriod} onValueChange={(v: BillingPeriod) => setBillingPeriod(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annual">Annual (Save 20%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes (Optional)</Label>
              <Textarea id="notes" value={quotationNotes} onChange={(e) => setQuotationNotes(e.target.value)} placeholder="Any specific requirements or questions..." rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuotationDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => quotationRequestMutation.mutate()} disabled={quotationRequestMutation.isPending || exactInspectionsCount < QUOTE_GATE}>
              {quotationRequestMutation.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>) : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quotation Panel (200+ / Enterprise)
// ---------------------------------------------------------------------------

function QuotationPanel({ quotationData, quotationCheckoutMutation, onRequestQuote }: {
  quotationData: { request: any; quotation: any } | undefined;
  quotationCheckoutMutation: any;
  onRequestQuote: () => void;
}) {
  const pendingRequest = quotationData?.request;
  const quotation = quotationData?.quotation;

  if (quotation && quotation.status === "sent") {
    const priceInMajor = quotation.quotedPrice / 100;
    const symbol = CURRENCY_SYMBOLS[quotation.currency] || quotation.currency;
    return (
      <div className="p-6 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="font-semibold text-lg text-emerald-900 dark:text-emerald-100">Your Custom Quote is Ready!</p>
            <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">{quotation.quotedInspections} inspections per month</p>
          </div>
          <Badge className="bg-emerald-500">Quote Ready</Badge>
        </div>
        <div className="mb-4">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-emerald-900 dark:text-emerald-100">{symbol}{priceInMajor.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-sm text-emerald-700 dark:text-emerald-300">/{quotation.billingPeriod === "annual" ? "year" : "month"}</span>
          </div>
          {quotation.customerNotes && <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-2">{quotation.customerNotes}</p>}
        </div>
        <Button onClick={() => quotationCheckoutMutation.mutate(quotation.id)} disabled={quotationCheckoutMutation.isPending} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
          {quotationCheckoutMutation.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>) : (<>Subscribe Now <ChevronRight className="h-4 w-4 ml-2" /></>)}
        </Button>
      </div>
    );
  }

  if (pendingRequest) {
    return (
      <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-4 w-4 text-amber-600" />
          <p className="font-semibold text-sm text-amber-900 dark:text-amber-100">Quotation Request Pending</p>
        </div>
        <p className="text-xs text-amber-700 dark:text-amber-300">We&apos;ve received your request for {pendingRequest.requestedInspections} inspections. Our team is preparing a custom quote for you.</p>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">Requested on {new Date(pendingRequest.createdAt).toLocaleDateString()}</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800">
      <p className="font-semibold text-sm text-amber-900 dark:text-amber-100 mb-2">Enterprise — Custom Quote Required</p>
      <p className="text-xs text-amber-700 dark:text-amber-300 mb-4">For 200+ inspections per month, we&apos;ll prepare a custom pricing quote. Enterprise pricing is by quote only.</p>
      <Button onClick={onRequestQuote} className="w-full bg-amber-600 hover:bg-amber-700 text-white">Request a quote</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manage Billing Method Card
// ---------------------------------------------------------------------------

function ManageBillingMethodCard() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const openStripePortal = async () => {
    try {
      setIsLoading(true);
      const res = await apiRequest("POST", "/api/billing/portal");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else throw new Error("No portal URL returned");
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to open billing portal. Please try again or contact support.", variant: "destructive" });
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-muted/20 border-border">
      <CardContent className="flex flex-col md:flex-row items-center justify-between p-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-background border border-border flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold text-sm">Manage Billing Method</p>
            <p className="text-xs text-muted-foreground">Update credit cards, download historic PDF invoices, or cancel subscription.</p>
          </div>
        </div>
        <Button variant="outline" className="h-10 px-6 gap-2" onClick={openStripePortal} disabled={isLoading}>
          {isLoading ? "Loading..." : (<>Stripe Portal <ArrowUpRight className="h-4 w-4" /></>)}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Add-On Pack Purchase Section (BILL-04 — v2 volume ladder)
// ---------------------------------------------------------------------------

function AddOnPackPurchaseSection({ currentPlanTier, selectedCurrency }: { currentPlanTier: string; selectedCurrency: string }) {
  const { toast } = useToast();
  const { data: addonPacksData, isLoading } = useQuery<any>({ queryKey: ["/api/billing/addon-packs"] });
  const { data: balance } = useQuery<any>({ queryKey: ["/api/billing/inspection-balance"] });

  const purchaseMutation = useMutation({
    mutationFn: async (packId: string) => {
      const res = await apiRequest("POST", `/api/billing/addon-packs/${packId}/purchase`);
      return res.json();
    },
    onSuccess: (data) => { if (data.url) window.location.href = data.url; },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to initiate purchase", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Add-On Inspection Packs</CardTitle>
          <CardDescription>Loading available packs...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Enterprise / none: no self-serve packs (contract overage)
  if (currentPlanTier === "none" || currentPlanTier === "enterprise") return null;
  if (!addonPacksData?.packs?.length) return null;

  const rateFx = FALLBACK_RATES[selectedCurrency.toUpperCase()] || 1.0;
  const currency = addonPacksData.currency || selectedCurrency || "GBP";
  const tierConfig = getTierById(currentPlanTier);
  const tierLabel = tierConfig?.label || addonPacksData.currentTier?.name || "Current";

  const packsWithLadder = [...addonPacksData.packs]
    .map((pack: any) => {
      const qty = pack.inspectionQuantity as number;
      const priced = computePackPricing(currentPlanTier, qty);
      const totalMajor = priced != null ? priced.total * rateFx : pack.totalPackPrice / 100;
      const unitMajor = priced != null ? priced.displayRate * rateFx : pack.pricePerInspection / 100;
      return { ...pack, unitMajor, totalMajor };
    })
    .sort((a: any, b: any) => a.inspectionQuantity - b.inspectionQuantity);

  const largestPack = packsWithLadder[packsWithLadder.length - 1];
  const smallestPack = packsWithLadder[0];
  const bestValuePack =
    packsWithLadder.find((p: any) => p.id === addonPacksData.bestValuePackId) || largestPack;

  let savingsVsSmallest = 0;
  if (bestValuePack && smallestPack && bestValuePack.id !== smallestPack.id) {
    const countInSmall = Math.ceil(bestValuePack.inspectionQuantity / smallestPack.inspectionQuantity);
    savingsVsSmallest = countInSmall * smallestPack.totalMajor - bestValuePack.totalMajor;
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle>Need More Inspections?</CardTitle>
        <CardDescription>
          Priced at your <span className="font-semibold">{tierLabel}</span> rate
          {balance && (
            <span className="ml-2">
              · Used this month: <span className="font-semibold">{balance.totalUsed || 0}</span> / <span className="font-semibold">{balance.tierQuotaIncluded || 0}</span>
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 items-stretch">
          {packsWithLadder.map((pack: any) => {
            const isBestValue = pack.id === bestValuePack?.id;
            const showSavings = isBestValue && savingsVsSmallest > 0.5;
            return (
              <Card
                key={pack.id}
                className={`relative flex h-full flex-col border-2 transition-all hover:shadow-lg ${isBestValue ? "border-primary bg-primary/5" : "border-border"}`}
              >
                {isBestValue && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-white px-3 py-1 flex items-center gap-1">
                      <ArrowDown className="h-3 w-3" />
                      LOWEST RATE
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-3">
                  <CardTitle className="text-xl">{pack.name}</CardTitle>
                  <CardDescription className="text-sm">{pack.inspectionQuantity} inspections</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <div>
                    <div className="text-3xl font-bold">{formatMajor(pack.totalMajor, currency)}</div>
                    <div className="text-sm text-muted-foreground">{formatMajor(pack.unitMajor, currency)} per inspection</div>
                  </div>
                  {/* Reserved line so Buy Now stays aligned across cards */}
                  <p className={`min-h-[2.5rem] text-xs font-medium ${showSavings ? "text-emerald-600" : "invisible"}`}>
                    {showSavings
                      ? `Save ${formatMajor(savingsVsSmallest, currency)} against buying ${Math.ceil(bestValuePack.inspectionQuantity / smallestPack.inspectionQuantity)} ${smallestPack.inspectionQuantity}-packs.`
                      : "\u00a0"}
                  </p>
                  <Button
                    className="mt-auto w-full"
                    variant={isBestValue ? "default" : "outline"}
                    onClick={() => purchaseMutation.mutate(pack.id)}
                    disabled={purchaseMutation.isPending}
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    {purchaseMutation.isPending ? "Processing..." : "Buy Now"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ArrowDown({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
    </svg>
  );
}
