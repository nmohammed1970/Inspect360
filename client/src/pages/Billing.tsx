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
  Loader2
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

interface Tier {
  id: string;
  name: string;
  code: string;
  description: string;
  includedInspections: number;
  basePriceMonthly: number;
  basePriceAnnual: number;
  tierOrder: number;
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

// Tier per-inspection price from config (fallbacks provided)
const getPerInspectionPriceFromConfig = (tierName: string, selectedCurrency: string, config: any): number => {
  try {
    if (config?.tierPricing && config?.tiers) {
      const tier = config.tiers.find((t: any) => t.name === tierName);
      if (tier) {
        const pricingRow = config.tierPricing.find((p: any) => p.tierId === tier.id && p.currencyCode === selectedCurrency);
        if (pricingRow?.perInspectionPrice) {
          return pricingRow.perInspectionPrice;
        }
      }
    }
  } catch {}
  // Fallback defaults (GBP)
  switch (tierName) {
    case "Starter":
      return 1200;
    case "Growth":
      return 1000;
    case "Professional":
      return 900;
    case "Enterprise":
      return 550;
    default:
      return 550;
  }
};

export default function Billing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const [inspectionsNeeded, setInspectionsNeeded] = useState<number>(10);
  const [selectedCurrency, setSelectedCurrency] = useState<string>("GBP");
  const [debouncedInspections, setDebouncedInspections] = useState<number>(10);
  const [quotationDialogOpen, setQuotationDialogOpen] = useState(false);
  const [exactInspectionsCount, setExactInspectionsCount] = useState<number>(500);
  const [quotationNotes, setQuotationNotes] = useState<string>("");
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  const [trackInfo, setTrackInfo] = useState<{ left: number; width: number; thumbOffset?: number } | null>(null);

  // Debounce inspectionsNeeded to avoid too many API calls while dragging
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInspections(inspectionsNeeded);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [inspectionsNeeded]);

  // Force invalidate pricing query when inspectionsNeeded changes to prevent stale data
  useEffect(() => {
    queryClient.invalidateQueries({ 
      queryKey: ["/api/pricing/calculate"],
      exact: false 
    });
  }, [inspectionsNeeded, queryClient]);

  // Measure slider track to align markers precisely
  useEffect(() => {
    const measureTrack = () => {
      if (!sliderContainerRef.current) return;
      
      // Find the slider root element (Radix UI Slider root)
      const sliderRoot = sliderContainerRef.current.querySelector('[role="slider"]')?.closest('[class*="relative"]') as HTMLElement;
      if (!sliderRoot) return;
      
      // Find the track element (the background track with bg-secondary)
      const track = sliderRoot.querySelector('div[class*="bg-secondary"]') as HTMLElement;
      if (!track) return;
      
      // Also find the thumb to verify positioning
      const thumb = sliderRoot.querySelector('[role="slider"]') as HTMLElement;
      if (!thumb) return;
      
      // Get the actual track dimensions
      const trackRect = track.getBoundingClientRect();
      const containerRect = sliderContainerRef.current.getBoundingClientRect();
      const thumbRect = thumb.getBoundingClientRect();
      
      // Calculate the track's position relative to the container
      const trackLeft = trackRect.left - containerRect.left;
      const trackWidth = trackRect.width;
      
      // Calculate thumb center position relative to container
      const thumbCenter = thumbRect.left - containerRect.left + (thumbRect.width / 2);
      
      // Calculate where the thumb should be based on current slider value
      const currentValue = inspectionsNeeded;
      const expectedThumbPercent = ((currentValue - 10) / (500 - 10)) * 100;
      const expectedThumbPosition = trackLeft + (trackWidth * expectedThumbPercent / 100);
      
      // Calculate any offset between expected and actual thumb position
      const thumbOffset = thumbCenter - expectedThumbPosition;
      
      setTrackInfo({
        left: trackLeft,
        width: trackWidth,
        thumbOffset: thumbOffset
      });
    };

    // Measure on mount and resize
    const measureWithDelay = () => {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        measureTrack();
      });
    };

    measureWithDelay();
    window.addEventListener('resize', measureWithDelay);
    
    // Also measure after delays to ensure slider is fully rendered
    const timeouts = [
      setTimeout(measureWithDelay, 100),
      setTimeout(measureWithDelay, 300),
      setTimeout(measureWithDelay, 600)
    ];
    
    // Use ResizeObserver for more accurate tracking
    let resizeObserver: ResizeObserver | null = null;
    if (sliderContainerRef.current) {
      resizeObserver = new ResizeObserver(measureWithDelay);
      resizeObserver.observe(sliderContainerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', measureWithDelay);
      timeouts.forEach(clearTimeout);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [inspectionsNeeded]); // Recalculate when slider value changes to calibrate offset

  // Fetch pricing configuration (tiers and currencies)
  const { data: config } = useQuery<{ tiers: Tier[], currencies: any[] }>({
    queryKey: ["/api/pricing/config"],
  });

  // Calculate pricing based on slider (using debounced value for API, but immediate for display)
  const { data: pricing, isLoading: pricingLoading, isError, error: pricingError } = useQuery<PricingResult>({
    queryKey: ["/api/pricing/calculate", debouncedInspections, selectedCurrency, billingPeriod],
    queryFn: async () => {
      // Add cache-busting query parameter
      const cacheBuster = `&_t=${Date.now()}`;
      const res = await fetch(`/api/pricing/calculate?inspections=${debouncedInspections}&currency=${selectedCurrency}${cacheBuster}`, {
        cache: 'no-store', // Disable browser cache
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
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
    staleTime: 0, // Always consider data stale to force refetch
    gcTime: 0, // Don't cache, always fetch fresh data
    refetchOnReconnect: true,
  });

  // Fetch current subscription
  const { data: subscription, isLoading: subLoading } = useQuery<any>({
    queryKey: ["/api/billing/subscription"],
  });

  // Fetch inspection balance
  const { data: balance } = useQuery<any>({
    queryKey: ["/api/billing/inspection-balance"],
  });

  // Fetch enabled modules to get their names
  const { data: myModules } = useQuery<any[]>({
    queryKey: ["/api/marketplace/my-modules"],
  });

  // Fetch pending quotation
  const { data: quotationData, refetch: refetchQuotation } = useQuery<{ request: any; quotation: any }>({
    queryKey: ["/api/quotations/pending"],
    retry: false,
  });

  // Quotation request mutation
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
      toast({
        title: "Quotation Request Submitted",
        description: "We've received your request. Our team will prepare a custom quote for you.",
      });
      setQuotationDialogOpen(false);
      setQuotationNotes("");
      refetchQuotation();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit quotation request",
        variant: "destructive",
      });
    },
  });

  // Quotation checkout mutation
  const quotationCheckoutMutation = useMutation({
    mutationFn: async (quotationId: string) => {
      const res = await apiRequest("POST", "/api/billing/quotation-checkout", {
        quotationId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: "Error",
          description: "Failed to initiate checkout",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to initiate checkout",
        variant: "destructive",
      });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (planCode: string) => {
      console.log("[Billing] Initiating checkout for plan:", planCode);
      // totalCost, tierPrice, additionalCost, and moduleCost are already in minor units (pence/cents)
      // from the pricing calculations, so we send them directly
      console.log("[Billing] Sending total price (minor units):", pricingBreakdown.totalCost);
      console.log("[Billing] Breakdown - Tier:", pricingBreakdown.tierPrice, "Additional:", pricingBreakdown.additionalCost, "Modules:", pricingBreakdown.moduleCost);
      const res = await apiRequest("POST", "/api/billing/checkout", {
        planCode,
        billingPeriod,
        currency: selectedCurrency,
        inspectionCount: inspectionsNeeded,
        totalPrice: Math.round(pricingBreakdown.totalCost), // Already in minor units
        tierPrice: Math.round(pricingBreakdown.tierPrice), // Already in minor units
        additionalCost: Math.round(pricingBreakdown.additionalCost), // Already in minor units
        moduleCost: Math.round(pricingBreakdown.moduleCost) // Already in minor units
      });
      const data = await res.json();
      console.log("[Billing] Checkout response data:", data);
      return data;
    },
    onSuccess: (data) => {
      if (data.url) {
        console.log("[Billing] Redirecting to Checkout URL:", data.url);
        window.location.href = data.url;
      } else {
        console.warn("[Billing] No URL returned in checkout response");
        toast({
          title: "Stripe Error",
          description: "We couldn't generate a checkout link. Please check your Stripe configuration.",
          variant: "destructive"
        });
      }
    },
    onError: (error: any) => {
      console.error("[Billing] Checkout mutation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to initiate checkout",
        variant: "destructive",
      });
    }
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const isSuccess = params.get("success") === "true";

    if (isSuccess) {
      console.log("[Billing] Success parameter detected, sessionId:", sessionId);

      const processSession = async () => {
        // Clear the URL parameters IMMEDIATELY using replaceState
        window.history.replaceState({}, '', window.location.pathname);

        if (sessionId) {
          try {
            await apiRequest("POST", "/api/billing/process-session", { sessionId });
            toast({
              title: "Subscription Updated",
              description: "Your plan has been successfully updated. Welcome to your new tier!",
            });
          } catch (e: any) {
            console.error("[Billing] Session processing failed:", e);
            toast({
              title: "Activation Error",
              description: e.message || "We encountered an issue activating your plan. Please contact support.",
              variant: "destructive"
            });
          }
        } else {
          toast({
            title: "Plan Updated",
            description: "Your plan change has been recorded.",
          });
        }

        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
        queryClient.invalidateQueries({ queryKey: ["/api/billing/inspection-balance"] });
        queryClient.invalidateQueries({ queryKey: ["/api/pricing/calculate"] });
      };

      processSession();
    }
  }, [toast]);

  const formatCurrency = (amount: number, currency: string = selectedCurrency) => {
    const symbols: Record<string, string> = { GBP: "£", USD: "$", AED: "د.إ", EUR: "€" };
    // Amount might be in minor units (cents/pence) or major units, check if > 1000 assume minor
    const currencyInMajor = amount > 1000 ? amount / 100 : amount;
    return `${symbols[currency] || currency}${currencyInMajor.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Calculate pricing breakdown based on current slider value (always reactive)
  // This calculation is IMMEDIATE and doesn't wait for API - only module costs come from API
  const pricingBreakdown = useMemo(() => {
    // Force recalculation by logging current value
    console.log(`[Billing] Recalculating pricingBreakdown for ${inspectionsNeeded} inspections`);
    
    let tierPrice = 0;
    let additionalInspections = 0;
    let additionalCost = 0;
    let currentTierName = "";
    let tierIncluded = 0;
    
    // Minimum 10 inspections required - always use Starter tier as base
    if (inspectionsNeeded < 30) {
      // Starter: tier price + per inspection for above 10
      currentTierName = "Starter";
      tierIncluded = 10;
      const starterTier = config?.tiers?.find((t: Tier) => t.code === "starter");
      tierPrice = starterTier ? (billingPeriod === "monthly" ? starterTier.basePriceMonthly : starterTier.basePriceAnnual) : 0;
      additionalInspections = inspectionsNeeded - 10;
      additionalCost = additionalInspections * getPerInspectionPriceFromConfig("Starter", selectedCurrency, config);
    } else if (inspectionsNeeded < 75) {
      // Growth: tier price + per inspection for above 30
      currentTierName = "Growth";
      tierIncluded = 30;
      const growthTier = config?.tiers?.find((t: Tier) => t.code === "growth");
      tierPrice = growthTier ? (billingPeriod === "monthly" ? growthTier.basePriceMonthly : growthTier.basePriceAnnual) : 0;
      additionalInspections = inspectionsNeeded - 30;
      additionalCost = additionalInspections * getPerInspectionPriceFromConfig("Growth", selectedCurrency, config);
    } else if (inspectionsNeeded < 200) {
      // Professional: tier price + per inspection for above 75
      currentTierName = "Professional";
      tierIncluded = 75;
      const professionalTier = config?.tiers?.find((t: Tier) => t.code === "professional");
      tierPrice = professionalTier ? (billingPeriod === "monthly" ? professionalTier.basePriceMonthly : professionalTier.basePriceAnnual) : 0;
      additionalInspections = inspectionsNeeded - 75;
      additionalCost = additionalInspections * getPerInspectionPriceFromConfig("Professional", selectedCurrency, config);
    } else if (inspectionsNeeded <= 500) {
      // Enterprise: tier price + per inspection for above 200
      currentTierName = "Enterprise";
      tierIncluded = 200;
      const enterpriseTier = config?.tiers?.find((t: Tier) => t.code === "enterprise");
      tierPrice = enterpriseTier ? (billingPeriod === "monthly" ? enterpriseTier.basePriceMonthly : enterpriseTier.basePriceAnnual) : 0;
      additionalInspections = inspectionsNeeded - 200;
      additionalCost = additionalInspections * getPerInspectionPriceFromConfig("Enterprise", selectedCurrency, config);
    }
    
    // Get module costs from API (this is the only part that needs API data)
    // Module costs don't change with inspection count, so we use the latest available value
    // This allows the breakdown to update immediately for tier/additional costs
    const moduleCost = pricing?.calculations ? (billingPeriod === "monthly" ? pricing.calculations.modulesMonthly : pricing.calculations.modulesAnnual) : 0;
    const totalCost = tierPrice + additionalCost + moduleCost;
    
    // Determine which tier code to use for checkout
    let tierCodeForCheckout = "";
    if (currentTierName === "Starter") tierCodeForCheckout = "starter";
    else if (currentTierName === "Growth") tierCodeForCheckout = "growth";
    else if (currentTierName === "Professional") tierCodeForCheckout = "professional";
    else if (currentTierName === "Enterprise") tierCodeForCheckout = "enterprise";
    
    console.log(`[Billing] Calculated: Tier=${currentTierName}, Additional=${additionalInspections}, Cost=${additionalCost}, TierPrice=${tierPrice}`);
    
    return {
      tierPrice,
      additionalInspections,
      additionalCost,
      currentTierName,
      tierIncluded,
      moduleCost,
      totalCost,
      tierCodeForCheckout
    };
  }, [inspectionsNeeded, billingPeriod, config?.tiers, pricing?.calculations]);

  // Determine active module names for display
  const activeModuleNames = useMemo(() => {
    if (!pricing?.modules) return [];
    
    // If we have myModules data, use it to filter enabled modules
    if (myModules && myModules.length > 0) {
      // Get enabled module IDs
      const enabledModuleIds = new Set(
        myModules
          .filter(m => m.isEnabled)
          .map(m => m.moduleId)
      );
      
      // Match enabled modules with pricing modules by module_id
      return pricing.modules
        .filter(m => enabledModuleIds.has(m.module_id))
        .map(m => m.module_name)
        .filter(Boolean); // Remove any undefined/null names
    }
    
    // Fallback: if module has a price > 0, assume it's enabled
    // This handles cases where myModules might not be loaded yet
    return pricing.modules
      .filter(m => m.price && m.price > 0)
      .map(m => m.module_name)
      .filter(Boolean);
  }, [pricing?.modules, myModules]);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-8 mb-24">

      {/* Page Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">
              Billing & Subscription
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your organization's plan, usage, and billing history.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg border border-border">
              <button
                onClick={() => setBillingPeriod("monthly")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${billingPeriod === "monthly" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod("annual")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all relative ${billingPeriod === "annual" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Annual
                <Badge className="absolute -top-2 -right-2 bg-emerald-500 text-white border-none py-0 px-1.5 text-[9px]">Save 20%</Badge>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="hover-elevate transition-smooth border-primary/10">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Plan</p>
                <h3 className="text-lg font-bold">{subscription?.planSnapshotJson?.planName || "No Active Plan"}</h3>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate transition-smooth border-primary/10">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inspection credits</p>
                <h3 className="text-lg font-bold">{balance?.totalAvailable || 0} Credits</h3>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate transition-smooth border-primary/10">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Next Renewal</p>
                <h3 className="text-lg font-bold">{subscription ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : "N/A"}</h3>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pricing Slider Section */}
      <section className="bg-card rounded-3xl p-8 border border-border shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 flex gap-3">
          <div className="flex items-center gap-2 bg-muted/30 p-1.5 rounded-xl border border-border">
            <Coins className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
              <SelectTrigger className="h-7 w-20 border-none bg-transparent font-bold focus:ring-0 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GBP">GBP (£)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="AED">AED (د.إ)</SelectItem>
                <SelectItem value="EUR">EUR (€)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="max-w-4xl mx-auto space-y-8 py-4">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">How many inspections do you need per month?</h2>
          </div>

          <div className="space-y-8 py-4">
            {/* Slider with Tier Boundaries */}
            <div className="relative pt-8 pb-12">
              {/* Selected Value Display */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-1.5 rounded-full font-bold text-base shadow-lg z-10">
                {inspectionsNeeded >= 500 ? "500+" : inspectionsNeeded}
              </div>
              
              {/* Slider Container - ensures markers align with slider track */}
              <div className="relative w-full" ref={sliderContainerRef}>
                <Slider
                  value={[Math.min(Math.max(inspectionsNeeded, 10), 500)]}
                  onValueChange={(v) => {
                    let value = Math.max(v[0], 10); // Enforce minimum 10
                    // Snap to tier thresholds when close
                    const snapPoints = [10, 30, 75, 200, 500];
                    const snapThreshold = 3; // pixels/units
                    
                    for (const snap of snapPoints) {
                      if (Math.abs(snap - value) <= snapThreshold) {
                        value = snap;
                        break;
                      }
                    }
                    
                    setInspectionsNeeded(value);
                  }}
                  min={10}
                  max={500}
                  step={1}
                  className="[&_[role=slider]]:h-6 [&_[role=slider]]:w-6 [&_[role=slider]]:bg-background [&_[role=slider]]:border-primary [&_[role=slider]]:border-2"
                />
                
                {/* Tier Boundary Markers - aligned with slider handle center */}
                <div className="absolute top-0 left-0 right-0" style={{ marginTop: '12px' }}>
                  {[30, 75, 200].map((threshold) => {
                    // Calculate position to match Radix UI Slider handle center exactly
                    // Radix UI positions the handle center at: ((value - min) / (max - min)) * 100%
                    // We need to account for the track's actual position and width
                    let leftPosition: string;
                    if (trackInfo) {
                      // Calculate the percentage position on the track (0-100%)
                      // Radix UI uses: ((value - min) / (max - min)) * 100%
                      const positionPercent = ((threshold - 10) / (500 - 10)) * 100;
                      // Calculate the position: track left edge + (percentage of track width)
                      // Apply any thumb offset we detected to ensure perfect alignment
                      // Add a small percentage-based offset (1.5% of track width) to push markers to the right for alignment
                      const basePosition = trackInfo.left + (trackInfo.width * positionPercent / 100);
                      const offsetAdjustment = trackInfo.width * 0.015; // 1.5% of track width for responsive offset
                      const adjustedPosition = basePosition + (trackInfo.thumbOffset || 0) + offsetAdjustment;
                      leftPosition = `${adjustedPosition}px`;
                    } else {
                      // Fallback to percentage if track info not available
                      leftPosition = `${((threshold - 10) / (500 - 10)) * 100}%`;
                    }
                    return (
                      <div 
                        key={threshold} 
                        className="absolute flex flex-col items-center gap-1" 
                        style={{ 
                          left: leftPosition,
                          transform: 'translateX(-50%)',
                          pointerEvents: 'none'
                        }}
                      >
                        <div className="w-0.5 h-6 bg-primary/30" />
                        <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap mt-1">{threshold}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Tier Names Below - positioned exactly at tier thresholds with spacing */}
              <div className="absolute top-20 left-0 right-0 flex justify-between px-2 mt-4">
                <div className="flex flex-col items-center" style={{ position: 'absolute', left: `${((30 - 10) / (500 - 10)) * 100}%`, transform: 'translateX(-50%)', minWidth: '60px' }}>
                  <span className="text-xs font-medium text-foreground whitespace-nowrap">Growth</span>
                </div>
                <div className="flex flex-col items-center" style={{ position: 'absolute', left: `${((75 - 10) / (500 - 10)) * 100}%`, transform: 'translateX(-50%)', minWidth: '80px' }}>
                  <span className="text-xs font-medium text-foreground whitespace-nowrap">Professional</span>
                </div>
                <div className="flex flex-col items-center" style={{ position: 'absolute', left: `${((200 - 10) / (500 - 10)) * 100}%`, transform: 'translateX(-50%)', minWidth: '70px' }}>
                  <span className="text-xs font-medium text-foreground whitespace-nowrap">Enterprise</span>
                </div>
              </div>
            </div>

            {/* Selected Details */}
            {(() => {
              // Determine current tier based on inspection count (minimum 10)
              let currentTier: { name: string; range: string; included: number } | null = null;
              if (inspectionsNeeded < 30) {
                currentTier = { name: "Starter", range: "10-29", included: 10 };
              } else if (inspectionsNeeded < 75) {
                currentTier = { name: "Growth", range: "30-74", included: 30 };
              } else if (inspectionsNeeded < 200) {
                currentTier = { name: "Professional", range: "75-199", included: 75 };
              } else if (inspectionsNeeded <= 500) {
                currentTier = { name: "Enterprise", range: "200-500", included: 200 };
              }
              
              return (
                <div className="bg-muted/30 rounded-xl p-6 space-y-2 border border-border">
                  <div className="text-sm space-y-1">
                    <p className="font-semibold">Selected: {inspectionsNeeded >= 500 ? "500+" : inspectionsNeeded} inspections/month</p>
                    {currentTier ? (
                      <>
                        <p className="text-muted-foreground">
                          Your Tier: <span className="font-semibold text-foreground">{currentTier.name}</span> (includes {currentTier.included})
                        </p>
                        {inspectionsNeeded > currentTier.included && (
                          <p className="text-muted-foreground">
                            Additional: <span className="font-semibold text-foreground">{inspectionsNeeded - currentTier.included} inspections needed</span>
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        Additional inspections priced by tier
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Pricing Breakdown */}
            {isError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-6 text-center">
                <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
                <h3 className="text-lg font-bold text-destructive text-sm uppercase tracking-wider">Pricing Engine Unavailable</h3>
                <p className="text-xs text-muted-foreground mt-2">{(pricingError as Error)?.message || "Subscription tiers are not configured."}</p>
              </div>
            )}

            {pricingBreakdown && !isError && (() => {
              // Use pricingBreakdown from useMemo (always reactive to inspectionsNeeded)
              // This updates immediately when slider changes (no debounce delay)
              const {
                tierPrice,
                additionalInspections,
                additionalCost,
                currentTierName,
                tierIncluded,
                moduleCost,
                totalCost,
                tierCodeForCheckout
              } = pricingBreakdown;
              
              return (
                <div
                  key={`pricing-${inspectionsNeeded}-${billingPeriod}`}
                  className="bg-card rounded-2xl p-8 border border-border shadow-sm space-y-4"
                >
                    <div className="space-y-3">
                      {/* Tier Subscription Cost (if applicable) */}
                      {tierPrice > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            {billingPeriod === "annual" ? "Annual" : "Monthly"} Subscription ({currentTierName}):
                          </span>
                          <span className="font-bold text-lg">
                            {formatCurrency(tierPrice, selectedCurrency)}
                          </span>
                        </div>
                      )}
                      
                      {/* Per-Inspection Cost */}
                      {additionalInspections > 0 && (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">
                              Additional Inspections:
                            </span>
                            <span className="font-bold text-lg">
                              {formatCurrency(additionalCost, selectedCurrency)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground pl-4">
                            ({additionalInspections} × {formatCurrency(getPerInspectionPriceFromConfig(pricingBreakdown.currentTierName, selectedCurrency, config) / 100, selectedCurrency)} per inspection)
                          </p>
                        </>
                      )}
                      
                      {/* Module Costs */}
                      {moduleCost > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            Active Modules{activeModuleNames.length > 0 ? ` (${activeModuleNames.join(", ")})` : ""}:
                          </span>
                          <span className="font-bold text-lg">
                            {formatCurrency(moduleCost, selectedCurrency)}
                          </span>
                        </div>
                      )}
                      
                      <Separator />
                      
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">
                          {billingPeriod === "annual" ? "Annual Total" : "Total Monthly"}:
                        </span>
                        <span className="font-bold text-2xl">
                          {formatCurrency(totalCost, selectedCurrency)}
                        </span>
                      </div>
                    </div>

                    {/* Subscribe Button */}
                    {tierCodeForCheckout && (
                      <div className="pt-4">
                        <Button
                          onClick={() => checkoutMutation.mutate(tierCodeForCheckout)}
                          disabled={checkoutMutation.isPending || subscription?.currentTierId === config?.tiers?.find((t: Tier) => t.code === tierCodeForCheckout)?.id}
                          className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold transition-all shadow-md active:scale-95"
                        >
                          {checkoutMutation.isPending ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Processing...
                            </span>
                          ) : subscription?.currentTierId === config?.tiers?.find((t: Tier) => t.code === tierCodeForCheckout)?.id ? (
                            "Current Plan"
                          ) : (
                            <span className="flex items-center gap-2">
                              Subscribe & Pay <ChevronRight className="h-4 w-4" />
                            </span>
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Quotation Section for 500+ */}
                    {inspectionsNeeded >= 500 && (() => {
                      const pendingRequest = quotationData?.request;
                      const quotation = quotationData?.quotation;

                      if (quotation && quotation.status === "sent") {
                        // Show approved quotation
                        const priceInMajor = quotation.quotedPrice / 100;
                        const currencySymbols: Record<string, string> = { GBP: "£", USD: "$", AED: "د.إ", EUR: "€" };
                        const symbol = currencySymbols[quotation.currency] || quotation.currency;

                        return (
                          <div className="mt-6 p-6 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <p className="font-semibold text-lg text-emerald-900 dark:text-emerald-100">
                                  Your Custom Quote is Ready!
                                </p>
                                <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                                  {quotation.quotedInspections} inspections per month
                                </p>
                              </div>
                              <Badge className="bg-emerald-500">Quote Ready</Badge>
                            </div>
                            
                            <div className="mb-4">
                              <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-bold text-emerald-900 dark:text-emerald-100">
                                  {symbol}{priceInMajor.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-sm text-emerald-700 dark:text-emerald-300">
                                  /{quotation.billingPeriod === "annual" ? "year" : "month"}
                                </span>
                              </div>
                              {quotation.customerNotes && (
                                <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-2">
                                  {quotation.customerNotes}
                                </p>
                              )}
                            </div>

                            <Button
                              onClick={() => quotationCheckoutMutation.mutate(quotation.id)}
                              disabled={quotationCheckoutMutation.isPending}
                              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              {quotationCheckoutMutation.isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Processing...
                                </>
                              ) : (
                                <>
                                  Subscribe Now <ChevronRight className="h-4 w-4 ml-2" />
                                </>
                              )}
                            </Button>
                          </div>
                        );
                      }

                      if (pendingRequest) {
                        // Show pending request status
                        return (
                          <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800">
                            <div className="flex items-center gap-2 mb-2">
                              <Clock className="h-4 w-4 text-amber-600" />
                              <p className="font-semibold text-sm text-amber-900 dark:text-amber-100">
                                Quotation Request Pending
                              </p>
                            </div>
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                              We've received your request for {pendingRequest.requestedInspections} inspections. 
                              Our team is preparing a custom quote for you. You'll receive an email when it's ready.
                            </p>
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                              Requested on {new Date(pendingRequest.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        );
                      }

                      // Show request quotation button
                      return (
                        <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800">
                          <p className="font-semibold text-sm text-amber-900 dark:text-amber-100 mb-2">
                            Enterprise Plus - Custom Quote Required
                          </p>
                          <p className="text-xs text-amber-700 dark:text-amber-300 mb-4">
                            For 500+ inspections per month, we'll prepare a custom pricing quote tailored to your needs.
                          </p>
                          <Button
                            onClick={() => {
                              setExactInspectionsCount(inspectionsNeeded);
                              setQuotationDialogOpen(true);
                            }}
                            className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                          >
                            Request Custom Quote
                          </Button>
                        </div>
                      );
                    })()}
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { title: "AI Inspections", icon: <FileText className="h-5 w-5" />, desc: "Automatic condition detection and photo analysis included." },
          { title: "Team Collaboration", icon: <Users className="h-5 w-5" />, desc: "Unlimited clerks, contractors, and internal stakeholders." },
          { title: "Marketplace Access", icon: <Layout className="h-5 w-5" />, desc: "Unlock White-Label, Portals, and Advanced API integrations." },
          { title: "Full Ledger", icon: <TrendingUp className="h-5 w-5" />, desc: "Complete audit trail and historical property data storage." }
        ].map((feat, i) => (
          <Card key={i} className="group hover-elevate transition-smooth border-border border-dashed">
            <CardHeader className="p-6">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary/5 group-hover:text-primary transition-colors mb-4">
                {feat.icon}
              </div>
              <CardTitle className="text-base">{feat.title}</CardTitle>
              <CardDescription className="text-xs leading-relaxed">{feat.desc}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Add-On Pack Purchase Section */}
      <AddOnPackPurchaseSection />

      {/* FAQ Accordion */}
      <div className="max-w-3xl mx-auto py-8">
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold">Frequently Asked Questions</h2>
          <p className="text-sm text-muted-foreground mt-1">Everything you need to know about our scaling credits system.</p>
        </div>
        <Accordion type="single" collapsible className="w-full space-y-3">
          <AccordionItem value="item-1" className="border rounded-xl px-4 bg-card shadow-sm">
            <AccordionTrigger className="hover:no-underline py-4 text-sm font-semibold">
              What happens if I exceed my monthly allowance?
            </AccordionTrigger>
            <AccordionContent className="pb-4 text-sm text-muted-foreground leading-relaxed">
              If you exhaust your inspections, you can instantly upgrade to a higher tier or buy fixed "Add-On Packs" from the Marketplace. Your account is never frozen; we'll simply notify you to top up.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2" className="border rounded-xl px-4 bg-card shadow-sm">
            <AccordionTrigger className="hover:no-underline py-4 text-sm font-semibold">
              How does the Annual discount work?
            </AccordionTrigger>
            <AccordionContent className="pb-4 text-sm text-muted-foreground leading-relaxed">
              Pre-paying annually grants a 20% discount on both the Platform Fee and the Base Inspection Credit price. Annual plans also receive their full yearly credit allocation upfront.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* External Stripe Portal Link */}
      <ManageBillingMethodCard />

      {/* Quotation Request Dialog */}
      <Dialog open={quotationDialogOpen} onOpenChange={setQuotationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Custom Quote</DialogTitle>
            <DialogDescription>
              For 500+ inspections per month, we'll prepare a custom pricing quote tailored to your needs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="inspections">Number of Inspections Needed</Label>
              <Input
                id="inspections"
                type="number"
                min={500}
                value={exactInspectionsCount}
                onChange={(e) => setExactInspectionsCount(Number(e.target.value))}
                placeholder="e.g., 600, 1000, 2000"
              />
              <p className="text-xs text-muted-foreground">
                Minimum 500 inspections required for custom quotes
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="billing-period">Preferred Billing Period</Label>
              <Select value={billingPeriod} onValueChange={(v: "monthly" | "annual") => setBillingPeriod(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annual">Annual (Save 20%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={quotationNotes}
                onChange={(e) => setQuotationNotes(e.target.value)}
                placeholder="Any specific requirements or questions..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuotationDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => quotationRequestMutation.mutate()}
              disabled={quotationRequestMutation.isPending || exactInspectionsCount < 500}
            >
              {quotationRequestMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Request"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Manage Billing Method Card Component
function ManageBillingMethodCard() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const openStripePortal = async () => {
    try {
      setIsLoading(true);
      const res = await apiRequest("POST", "/api/billing/portal");
      const data = await res.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No portal URL returned");
      }
    } catch (error: any) {
      console.error("Error opening Stripe portal:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to open billing portal. Please try again or contact support.",
        variant: "destructive",
      });
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
        <Button 
          variant="outline" 
          className="h-10 px-6 gap-2"
          onClick={openStripePortal}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : (
            <>
            Stripe Portal <ArrowUpRight className="h-4 w-4" />
            </>
          )}
          </Button>
        </CardContent>
    </Card>
  );
}

// Add-On Pack Purchase Section Component
function AddOnPackPurchaseSection() {
  const { toast } = useToast();
  const { data: addonPacksData, isLoading } = useQuery<any>({
    queryKey: ["/api/billing/addon-packs"],
  });

  const purchaseMutation = useMutation({
    mutationFn: async (packId: string) => {
      const res = await apiRequest("POST", `/api/billing/addon-packs/${packId}/purchase`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to initiate purchase",
        variant: "destructive",
      });
    },
  });

  const { data: balance } = useQuery<any>({
    queryKey: ["/api/billing/inspection-balance"],
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

  if (!addonPacksData || !addonPacksData.packs || addonPacksData.packs.length === 0) {
    return null;
  }

  const formatPrice = (amount: number, currency: string) => {
    const symbols: Record<string, string> = { GBP: "£", USD: "$", AED: "د.إ", EUR: "€" };
    return `${symbols[currency] || currency}${(amount / 100).toFixed(2)}`;
  };

  const currency = addonPacksData.currency || "GBP";
  const currentTier = addonPacksData.currentTier;

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Need More Inspections?</CardTitle>
            <CardDescription>
              Your Plan: <span className="font-semibold">{currentTier?.name || "N/A"}</span>
              {balance && (
                <span className="ml-2">
                  • Used this month: <span className="font-semibold">{balance.totalUsed || 0}</span> / <span className="font-semibold">{balance.tierQuotaIncluded || 0}</span>
                </span>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {addonPacksData.packs.map((pack: any) => {
            const isBestValue = pack.id === addonPacksData.bestValuePackId;
            const pricePerUnit = pack.pricePerInspection / pack.inspectionQuantity;

            return (
              <Card
                key={pack.id}
                className={`relative border-2 transition-all hover:shadow-lg ${
                  isBestValue ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                {isBestValue && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-white px-3 py-1 flex items-center gap-1">
                      <Star className="h-3 w-3 fill-white" />
                      BEST VALUE
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-3">
                  <CardTitle className="text-xl">{pack.name}</CardTitle>
                  <CardDescription className="text-sm">
                    {pack.inspectionQuantity} inspections
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-3xl font-bold">
                      {formatPrice(pack.totalPackPrice, currency)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatPrice(pack.pricePerInspection, currency)} per inspection
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    {currentTier?.name} tier pricing applies
                  </div>
                  <Button
                    className="w-full"
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
