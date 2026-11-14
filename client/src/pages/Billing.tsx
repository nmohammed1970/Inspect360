import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { useModules } from "@/hooks/use-modules";
import {
  Package,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Lock,
  ExternalLink,
  Building2,
  Users,
  Receipt,
  Zap,
  CreditCard,
  MessageSquare,
  Check,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { pagePad } from "@/lib/responsive";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const CONTACT_ADMIN = "Upgrade your plan to activate this module.";

const PLAN_LABELS: Record<string, string> = {
  pm_essentials: "Essentials",
  pm_professional: "Professional",
  pm_business: "Business",
  pm_enterprise: "Enterprise",
  ai_payg: "Pay as you go",
  ai_inspector: "Inspector",
  ai_team: "Team",
  ai_high_volume: "High volume",
};

type ModuleRow = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  iconName?: string | null;
  enabled: boolean;
  enabledDate?: string;
};

type CatalogPlan = {
  code: string;
  tab: string;
  name: string;
  description?: string | null;
  popular?: boolean;
  enquireOnly?: boolean;
  maxProperties?: number | null;
  maxUsers?: number | null;
  monthlyInspections?: number | null;
  yearlyInspections?: number | null;
  smsPerYear?: number | null;
  prices?: Array<{ cycle: string; amountMinor: number }>;
};

type TopupPack = {
  code: string;
  kind: string;
  name: string;
  quantity: number;
  amountMinor: number;
};

function planLabel(code?: string | null, fallbackName?: string | null) {
  if (fallbackName) return fallbackName;
  if (!code) return "No plan";
  return PLAN_LABELS[code] || code.replace(/^pm_|^ai_/, "").replace(/_/g, " ");
}

function formatGbp(minor: number, currency = "gbp") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

function statusMeta(status?: string | null) {
  const s = (status || "unknown").toLowerCase();
  if (s === "active" || s === "trialing") {
    return {
      label: s === "trialing" ? "Trial" : "Active",
      className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/25 dark:text-emerald-400",
    };
  }
  if (s === "incomplete" || s === "incomplete_expired") {
    return {
      label: "Setup incomplete",
      className: "bg-amber-500/15 text-amber-800 border-amber-500/30 dark:text-amber-400",
    };
  }
  if (s === "past_due" || s === "read_only" || s === "unpaid") {
    return {
      label: s === "read_only" ? "Read-only" : "Payment issue",
      className: "bg-destructive/15 text-destructive border-destructive/30",
    };
  }
  if (s === "canceled" || s === "cancelled") {
    return {
      label: "Cancelled",
      className: "bg-muted text-muted-foreground border-border",
    };
  }
  return {
    label: status || "Unknown",
    className: "bg-secondary text-secondary-foreground border-border",
  };
}

export default function Billing() {
  const search = useSearch();
  const { allModules, myModules, isLoading: modulesLoading, isModuleEnabled } = useModules();
  const { toast } = useToast();
  const [portalBusy, setPortalBusy] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [addonBusy, setAddonBusy] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [topupBusy, setTopupBusy] = useState<string | null>(null);
  const [planTab, setPlanTab] = useState<"property_management" | "ai_inspections">(
    "property_management",
  );
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");
  const [topupKind, setTopupKind] = useState<"inspection" | "sms">("inspection");

  const {
    data: balance,
    isLoading: balanceLoading,
    isError: balanceError,
    isFetching: balanceFetching,
    refetch: refetchBalance,
  } = useQuery<any>({
    queryKey: ["/api/billing/inspection-balance"],
    retry: false,
  });

  const { data: v2, refetch: refetchV2 } = useQuery<{
    subscription: any;
    settings: any;
    balances: { inspection: number; sms: number; total: number };
    selfServeEnabled: boolean;
  }>({
    queryKey: ["/api/billing/v2/subscription"],
    queryFn: async () => (await apiRequest("GET", "/api/billing/v2/subscription")).json(),
    retry: false,
  });

  // After Stripe redirect: confirm session server-side (webhooks often missing on localhost)
  useEffect(() => {
    const params = new URLSearchParams(search);
    const sessionId = params.get("session_id");
    const checkoutOk = params.get("checkout") === "success";
    const topupOk = params.get("topup") === "success";
    if (!sessionId || (!checkoutOk && !topupOk)) {
      if (checkoutOk || topupOk) {
        toast({
          title: "Returning from checkout",
          description: "Confirming payment… if status stays incomplete, start checkout again.",
        });
      }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/billing/v2/checkout/confirm", { sessionId });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.message || "Confirm failed");
        await Promise.all([refetchV2(), refetchBalance()]);
        toast({
          title: topupOk ? "Top-up complete" : "Subscription activated",
          description:
            data?.subscription?.status === "trialing"
              ? "Your trial is active and plan credits have been applied."
              : "Your billing status has been updated.",
        });
        window.history.replaceState({}, "", "/billing");
      } catch (e: any) {
        if (cancelled) return;
        toast({
          title: "Could not confirm checkout",
          description: e.message || "Try Manage billing or start checkout again.",
          variant: "destructive",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: invoicesData } = useQuery<{
    invoices: Array<{
      id: string;
      number: string | null;
      status: string | null;
      amountPaid: number;
      currency: string;
      created: number;
      hostedInvoiceUrl: string | null;
    }>;
  }>({
    queryKey: ["/api/billing/v2/invoices"],
    queryFn: async () => (await apiRequest("GET", "/api/billing/v2/invoices")).json(),
    retry: false,
  });

  const { data: topupPacks } = useQuery<{ packs: TopupPack[] }>({
    queryKey: ["/api/billing/v2/topup-packs"],
    queryFn: async () => {
      const res = await fetch("/api/billing/v2/topup-packs", { credentials: "include" });
      return res.ok ? res.json() : { packs: [] };
    },
  });

  const { data: limits } = useQuery<{
    propertyMax: number | null;
    userMax: number | null;
    plan: any;
    subscription: any;
  }>({
    queryKey: ["/api/billing/v2/limits"],
    queryFn: async () => (await apiRequest("GET", "/api/billing/v2/limits")).json(),
    retry: false,
  });

  const { data: status } = useQuery<{
    photosPerCredit: number;
    enquireCalendlyUrl?: string;
  }>({
    queryKey: ["/api/billing/self-serve-status"],
    queryFn: async () => (await apiRequest("GET", "/api/billing/self-serve-status")).json(),
  });

  const { data: catalog, isLoading: catalogLoading } = useQuery<{
    plans: CatalogPlan[];
    prices?: Array<{ planCode: string; cycle: string; amountMinor: number }>;
  }>({
    queryKey: ["/api/billing/catalog", planTab, billingCycle],
    queryFn: async () => {
      const res = await fetch(
        `/api/billing/catalog?tab=${encodeURIComponent(planTab)}&cycle=${encodeURIComponent(billingCycle)}`,
        { credentials: "include", cache: "no-store" },
      );
      if (res.status === 404) return { plans: [] };
      if (!res.ok) throw new Error("Failed to load catalog");
      return res.json();
    },
  });

  const plans = useMemo(() => {
    const list = catalog?.plans || [];
    const prices = catalog?.prices || [];
    return list
      .filter((p) => p.tab === planTab || !p.tab)
      .map((p) => ({
        ...p,
        prices: prices.filter((pr) => pr.planCode === p.code),
      }));
  }, [catalog, planTab]);

  const allInspectionPacks = useMemo(
    () => (topupPacks?.packs || []).filter((p) => p.kind === "inspection"),
    [topupPacks],
  );
  const allSmsPacks = useMemo(
    () => (topupPacks?.packs || []).filter((p) => p.kind === "sms"),
    [topupPacks],
  );
  const autoTopupPacks = allInspectionPacks.slice(0, 3);
  const visibleTopups = topupKind === "sms" ? allSmsPacks : allInspectionPacks;

  async function openPortal() {
    setPortalBusy(true);
    try {
      const res = await apiRequest("POST", "/api/billing/v2/portal", {
        returnUrl: `${window.location.origin}/billing`,
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e: any) {
      toast({
        title: "Billing portal unavailable",
        description: e.message || "Try again later",
        variant: "destructive",
      });
    } finally {
      setPortalBusy(false);
    }
  }

  async function saveAutoTopup(enabled: boolean, packCode: string | null) {
    setAutoBusy(true);
    try {
      await apiRequest("PUT", "/api/billing/v2/auto-topup", { enabled, packCode });
      toast({ title: enabled ? "Auto top-up enabled" : "Auto top-up disabled" });
      refetchV2();
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setAutoBusy(false);
    }
  }

  async function buyPacks(quantity: number) {
    setAddonBusy("packs");
    try {
      const res = await apiRequest("POST", "/api/billing/v2/addons/property-packs", { quantity });
      const data = await res.json();
      toast({
        title: "Property packs added",
        description: `Now ${data.packs} packs (+${data.creditsGranted} credits)`,
      });
      refetchV2();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setAddonBusy(null);
    }
  }

  async function startCheckout(planCode: string) {
    setCheckoutBusy(planCode);
    try {
      // Existing subscribers change in-place (proration). New Checkout would fail / duplicate.
      const canChangeInPlace =
        !!v2?.subscription?.stripeSubscriptionId &&
        !!v2.subscription.planCode &&
        v2.subscription.planCode !== "pending" &&
        (v2.subscription.status === "active" || v2.subscription.status === "trialing");

      if (canChangeInPlace) {
        const res = await apiRequest("POST", "/api/billing/v2/change-plan", {
          planCode,
          cycle: billingCycle,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Plan change failed");
        await Promise.all([refetchV2(), refetchBalance()]);
        if (data.mode === "upgrade_confirmed") {
          toast({
            title: "Plan upgraded",
            description: "Your plan is updated. Any charge due was completed (or deferred to after trial).",
          });
        } else if (data.mode === "upgrade_pending_payment") {
          toast({
            title: "Upgrade payment processing",
            description:
              "Your current plan stays active until the upgrade charge succeeds. If it fails, nothing changes.",
          });
        } else if (data.mode === "downgrade_scheduled") {
          toast({
            title: "Downgrade scheduled",
            description: "Your new plan takes effect at the end of the current billing period.",
          });
        } else {
          toast({ title: "Plan updated" });
        }
        return;
      }

      const res = await apiRequest("POST", "/api/billing/v2/checkout", {
        planCode,
        cycle: billingCycle,
        successUrl: `${window.location.origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/billing#plans`,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Checkout failed");
      if (data.url) window.location.href = data.url;
    } catch (e: any) {
      toast({
        title: "Plan change failed",
        description: e.message || "Try again later",
        variant: "destructive",
      });
    } finally {
      setCheckoutBusy(null);
    }
  }

  async function startTopup(packCode: string) {
    setTopupBusy(packCode);
    try {
      const res = await apiRequest("POST", "/api/billing/v2/topup-checkout", {
        packCode,
        successUrl: `${window.location.origin}/billing?topup=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/billing#topups`,
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e: any) {
      toast({
        title: "Top-up failed",
        description: e.message || "Try again later",
        variant: "destructive",
      });
    } finally {
      setTopupBusy(null);
    }
  }

  async function trackEnquire(planCode: string) {
    try {
      await apiRequest("POST", "/api/billing/analytics", {
        eventName: "enquire_click",
        metadata: { planCode, tab: planTab, cycle: billingCycle },
      });
    } catch {
      /* non-blocking */
    }
    const url = status?.enquireCalendlyUrl || "https://calendly.com/-nadeemmohammed-/inspect360-demo";
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const isLoading = modulesLoading || balanceLoading;

  const inspectionCredits = Number(
    v2?.balances?.inspection ??
      balance?.total ??
      balance?.creditBalance?.total ??
      balance?.totalCredits ??
      balance?.creditsRemaining ??
      balance?.balance ??
      0,
  );
  const smsCredits = Number(v2?.balances?.sms ?? 0);
  const creditsLow = inspectionCredits > 0 && inspectionCredits < 10;
  const creditsEmpty = inspectionCredits < 1;

  const subStatus = v2?.subscription?.status as string | undefined;
  const hasConfirmedPlan =
    !!v2?.subscription &&
    !!v2.subscription.planCode &&
    v2.subscription.planCode !== "pending" &&
    subStatus !== "incomplete" &&
    subStatus !== "incomplete_expired";
  const hasActivePlan =
    hasConfirmedPlan && (subStatus === "active" || subStatus === "trialing");
  const checkoutIncomplete =
    !!v2?.subscription &&
    (subStatus === "incomplete" ||
      subStatus === "incomplete_expired" ||
      v2.subscription.planCode === "pending");
  const planName = hasConfirmedPlan
    ? planLabel(v2?.subscription?.planCode, limits?.plan?.name)
    : "No active plan";
  const statusInfo = statusMeta(subStatus);
  const cycleLabel =
    hasConfirmedPlan && v2?.subscription?.cycle === "monthly"
      ? "Monthly"
      : hasConfirmedPlan && v2?.subscription?.cycle === "yearly"
        ? "Yearly"
        : null;
  const currentPlanCode = hasActivePlan ? v2?.subscription?.planCode : null;
  const pendingPlanCode = (v2?.subscription?.pendingPlanCode as string | undefined) || null;
  const pendingCycle = (v2?.subscription?.pendingCycle as string | undefined) || null;
  const hasPendingUpgrade = Boolean(pendingPlanCode);

  const moduleRows: ModuleRow[] = useMemo(
    () =>
      (allModules || []).map((mod) => {
        const enabled = isModuleEnabled(mod.moduleKey);
        const instanceRow = myModules.find((m) => m.moduleKey === mod.moduleKey);
        return {
          id: mod.id,
          key: mod.moduleKey,
          name: mod.name,
          description: mod.description,
          iconName: mod.iconName,
          enabled,
          enabledDate: instanceRow?.enabledDate,
        };
      }),
    [allModules, myModules, isModuleEnabled],
  );

  const activeModules = moduleRows.filter((m) => m.enabled);
  const inactiveModules = moduleRows.filter((m) => !m.enabled);

  if (isLoading) {
    return (
      <div
        className={cn(
          "container mx-auto min-w-0 flex items-center justify-center min-h-[50vh]",
          pagePad,
        )}
      >
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading billing…</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("container mx-auto min-w-0 space-y-6 md:space-y-8", pagePad)}>
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight" data-testid="text-page-title">
              Billing
            </h1>
            <p className="text-sm md:text-base text-muted-foreground max-w-2xl">
              Plan, credits, pricing, invoices, and modules.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {balanceFetching && !balanceLoading ? (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5 mr-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Updating
              </span>
            ) : null}
            <Button variant="outline" asChild>
              <a href="#plans">View plans</a>
            </Button>
            <Button onClick={openPortal} disabled={portalBusy}>
              {portalBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Manage billing
                </>
              )}
            </Button>
          </div>
        </header>

        {/* Current plan */}
        <Card>
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1.5">
                <p className="text-xs md:text-sm font-medium text-muted-foreground">Current plan</p>
                {hasConfirmedPlan ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl md:text-2xl font-bold tracking-tight">{planName}</h2>
                      <Badge variant="outline" className={cn("capitalize", statusInfo.className)}>
                        {statusInfo.label}
                      </Badge>
                      {cycleLabel ? (
                        <Badge variant="secondary" className="font-normal">
                          {cycleLabel}
                        </Badge>
                      ) : null}
                    </div>
                    {subStatus === "trialing" ? (
                      <p className="text-sm text-muted-foreground">
                        You are on {planName} limits during trial
                        {v2?.subscription?.trialEnd
                          ? ` until ${format(new Date(v2.subscription.trialEnd), "dd MMM yyyy")}`
                          : ""}
                        . Upgrading the plan does not end the trial — billing for {planName} starts
                        when the trial ends.
                      </p>
                    ) : null}
                    {v2?.subscription?.cancelAtPeriodEnd ? (
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        Cancels at the end of the current billing period.
                      </p>
                    ) : null}
                    {(subStatus === "past_due" || subStatus === "read_only") && (
                      <p className="text-sm text-destructive font-medium">
                        Payment issue — update your payment method in Manage billing.
                      </p>
                    )}
                    {hasPendingUpgrade ? (
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        Upgrade to {planLabel(pendingPlanCode)}
                        {pendingCycle ? ` (${pendingCycle})` : ""} is awaiting payment. Your
                        current plan stays active until it succeeds; if payment fails, nothing
                        changes.
                      </p>
                    ) : null}
                  </>
                ) : checkoutIncomplete ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl md:text-2xl font-bold tracking-tight">
                        Checkout not finished
                      </h2>
                      <Badge variant="outline" className={cn(statusMeta("incomplete").className)}>
                        Setup incomplete
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Payment was not completed, so Essentials is not active yet. Finish checkout
                      (or start again below) — plan and included credits apply only after Stripe
                      confirms the subscription.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl md:text-2xl font-bold tracking-tight">No active plan</h2>
                    <p className="text-sm text-muted-foreground">
                      Choose a plan below to unlock included credits and limits.
                    </p>
                  </>
                )}
              </div>
              {checkoutIncomplete ? (
                <Button asChild className="shrink-0">
                  <a href="#plans">Complete checkout</a>
                </Button>
              ) : !hasActivePlan ? (
                <Button asChild className="shrink-0">
                  <a href="#plans">Choose a plan</a>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4" data-testid="panel-plan-kpis">
          <Card
            className={cn(
              "border-l-4",
              creditsEmpty
                ? "border-l-destructive"
                : creditsLow
                  ? "border-l-yellow-500"
                  : "border-l-green-500",
            )}
          >
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm font-medium text-muted-foreground">
                    Inspection credits
                  </p>
                  <p
                    className={cn(
                      "text-xl md:text-2xl font-bold tabular-nums",
                      creditsEmpty
                        ? "text-destructive"
                        : creditsLow
                          ? "text-yellow-600"
                          : "text-green-600",
                    )}
                  >
                    {inspectionCredits}
                  </p>
                  <p className="text-xs text-muted-foreground hidden md:block">For AI inspections</p>
                </div>
                <div
                  className={cn(
                    "p-1.5 md:p-2 rounded-full",
                    creditsEmpty
                      ? "bg-destructive/10"
                      : creditsLow
                        ? "bg-yellow-500/10"
                        : "bg-green-500/10",
                  )}
                >
                  <CreditCard
                    className={cn(
                      "h-4 w-4 md:h-5 md:w-5",
                      creditsEmpty
                        ? "text-destructive"
                        : creditsLow
                          ? "text-yellow-600"
                          : "text-green-600",
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm font-medium text-muted-foreground">SMS credits</p>
                  <p className="text-xl md:text-2xl font-bold tabular-nums">{smsCredits}</p>
                  <p className="text-xs text-muted-foreground hidden md:block">For tenant messages</p>
                </div>
                <div className="p-1.5 md:p-2 bg-primary/10 rounded-full">
                  <MessageSquare className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm font-medium text-muted-foreground">Properties</p>
                  <p className="text-xl md:text-2xl font-bold tabular-nums">
                    {limits?.propertyMax != null ? limits.propertyMax : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground hidden md:block">Plan maximum</p>
                </div>
                <div className="p-1.5 md:p-2 bg-primary/10 rounded-full">
                  <Building2 className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm font-medium text-muted-foreground">Users</p>
                  <p className="text-xl md:text-2xl font-bold tabular-nums">
                    {limits?.userMax != null ? limits.userMax : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground hidden md:block">Plan maximum</p>
                </div>
                <div className="p-1.5 md:p-2 bg-primary/10 rounded-full">
                  <Users className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {(creditsLow || creditsEmpty) && (
          <div
            className={cn(
              "flex gap-3 rounded-xl border px-4 py-3",
              creditsEmpty
                ? "border-destructive/40 bg-destructive/5"
                : "border-amber-500/40 bg-amber-500/5",
            )}
          >
            <AlertCircle
              className={cn(
                "h-5 w-5 shrink-0 mt-0.5",
                creditsEmpty ? "text-destructive" : "text-amber-600",
              )}
            />
            <div className="min-w-0">
              <p
                className={cn(
                  "font-semibold",
                  creditsEmpty ? "text-destructive" : "text-amber-800 dark:text-amber-400",
                )}
              >
                {creditsEmpty ? "No inspection credits left" : "Inspection credits running low"}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {creditsEmpty
                  ? "AI generation is paused until you top up — offline capture still works."
                  : `${inspectionCredits} credits remaining.`}{" "}
                <a href="#topups" className="font-medium text-foreground underline underline-offset-2">
                  Buy credits
                </a>
              </p>
            </div>
          </div>
        )}

        {balanceError ? (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4" />
            Could not refresh credit balance
          </p>
        ) : null}

        {/* Plans / pricing */}
        <section id="plans" className="scroll-mt-6 space-y-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight">Plans & pricing</h2>
              <p className="text-sm text-muted-foreground">
                Subscribe or change plan.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Tabs value={planTab} onValueChange={(v) => setPlanTab(v as typeof planTab)}>
                <TabsList>
                  <TabsTrigger value="property_management">Property management</TabsTrigger>
                  <TabsTrigger value="ai_inspections">AI inspections</TabsTrigger>
                </TabsList>
              </Tabs>
              <Tabs
                value={billingCycle}
                onValueChange={(v) => setBillingCycle(v as typeof billingCycle)}
              >
                <TabsList>
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                  <TabsTrigger value="yearly">Yearly</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {catalogLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : plans.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                Pricing catalog is not published yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:gap-4 md:grid-cols-2 xl:grid-cols-3">
              {plans.map((plan) => {
                const price =
                  plan.prices?.find((p) => p.cycle === billingCycle) || plan.prices?.[0];
                const amount = price?.amountMinor ?? 0;
                const subCycle = (v2?.subscription?.cycle as string | undefined) || null;
                const isSamePlan =
                  currentPlanCode === plan.code &&
                  (v2?.subscription?.status === "active" ||
                    v2?.subscription?.status === "trialing");
                const isCurrentCycle = isSamePlan && (subCycle || billingCycle) === billingCycle;
                const isCycleChange = isSamePlan && !isCurrentCycle;
                const isPendingTarget = pendingPlanCode === plan.code;
                const planCta = (() => {
                  if (isCurrentCycle) return "Current plan";
                  if (isPendingTarget || hasPendingUpgrade) {
                    return isPendingTarget ? "Payment pending" : "Upgrade pending";
                  }
                  if (isCycleChange) {
                    return billingCycle === "yearly" ? "Switch to yearly" : "Switch to monthly";
                  }
                  if (hasActivePlan) return "Switch plan";
                  return "Start trial";
                })();
                return (
                  <Card
                    key={plan.code}
                    className={cn(
                      "flex flex-col",
                      plan.popular && "border-primary border-2",
                      isSamePlan && "ring-2 ring-primary/40",
                      isPendingTarget && "ring-2 ring-amber-500/40",
                    )}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-xl">{plan.name}</CardTitle>
                        <div className="flex flex-wrap gap-1 justify-end">
                          {isSamePlan ? <Badge variant="secondary">Current</Badge> : null}
                          {isPendingTarget ? (
                            <Badge variant="outline" className="border-amber-500/40 text-amber-800 dark:text-amber-400">
                              Pending
                            </Badge>
                          ) : null}
                          {plan.popular ? <Badge>Most popular</Badge> : null}
                        </div>
                      </div>
                      {plan.description ? (
                        <CardDescription>{plan.description}</CardDescription>
                      ) : null}
                    </CardHeader>
                    <CardContent className="space-y-4 flex-1">
                      {plan.enquireOnly ? (
                        <p className="text-2xl font-semibold">Custom</p>
                      ) : (
                        <p className="text-3xl font-bold tracking-tight">
                          {formatGbp(amount)}
                          <span className="text-sm font-normal text-muted-foreground">
                            /{billingCycle === "yearly" ? "year" : "month"}
                          </span>
                        </p>
                      )}
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        {plan.maxProperties != null && (
                          <li className="flex gap-2">
                            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                            Up to {plan.maxProperties} properties
                          </li>
                        )}
                        {plan.maxUsers != null && (
                          <li className="flex gap-2">
                            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                            Up to {plan.maxUsers} users
                          </li>
                        )}
                        {(billingCycle === "yearly"
                          ? plan.yearlyInspections
                          : plan.monthlyInspections) != null && (
                          <li className="flex gap-2">
                            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                            {billingCycle === "yearly"
                              ? plan.yearlyInspections
                              : plan.monthlyInspections}{" "}
                            inspections / {billingCycle === "yearly" ? "year" : "month"}
                          </li>
                        )}
                        {(plan.smsPerYear || 0) > 0 && (
                          <li className="flex gap-2">
                            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                            {billingCycle === "yearly"
                              ? plan.smsPerYear
                              : Math.max(1, Math.floor((plan.smsPerYear || 0) / 12))}{" "}
                            SMS credits / {billingCycle === "yearly" ? "year" : "month"}
                          </li>
                        )}
                      </ul>
                    </CardContent>
                    <CardFooter className="pt-0">
                      {plan.enquireOnly ? (
                        <Button
                          className="w-full"
                          variant="outline"
                          onClick={() => trackEnquire(plan.code)}
                        >
                          Enquire
                        </Button>
                      ) : (
                        <Button
                          className="w-full"
                          variant={isCurrentCycle || isPendingTarget ? "outline" : "default"}
                          disabled={
                            checkoutBusy === plan.code ||
                            isCurrentCycle ||
                            hasPendingUpgrade
                          }
                          onClick={() => startCheckout(plan.code)}
                        >
                          {checkoutBusy === plan.code ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            planCta
                          )}
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Credit top-ups */}
        <section id="topups" className="scroll-mt-6 space-y-4 border-t pt-6 md:pt-8">
          <div className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight">Credit top-ups</h2>
              <p className="text-sm text-muted-foreground">
                One-off prepaid packs — inspection or SMS (ex VAT).
              </p>
            </div>
            <Tabs value={topupKind} onValueChange={(v) => setTopupKind(v as typeof topupKind)}>
              <TabsList>
                <TabsTrigger value="inspection" className="gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" />
                  Inspection
                </TabsTrigger>
                <TabsTrigger value="sms" className="gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  SMS
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {visibleTopups.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No {topupKind === "sms" ? "SMS" : "inspection"} packs available.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {visibleTopups.map((pack) => (
                <Card
                  key={pack.code}
                  className={cn(
                    "flex flex-col border-l-4",
                    pack.kind === "sms" ? "border-l-primary" : "border-l-green-500",
                  )}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base md:text-lg leading-snug">{pack.name}</CardTitle>
                      <div
                        className={cn(
                          "p-1.5 rounded-full shrink-0",
                          pack.kind === "sms" ? "bg-primary/10" : "bg-green-500/10",
                        )}
                      >
                        {pack.kind === "sms" ? (
                          <MessageSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <CreditCard className="h-4 w-4 text-green-600" />
                        )}
                      </div>
                    </div>
                    <CardDescription>
                      {pack.quantity.toLocaleString()}{" "}
                      {pack.kind === "sms" ? "SMS" : "inspection"} credits
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-3 flex-1">
                    <p className="text-2xl font-bold tracking-tight">
                      {formatGbp(pack.amountMinor)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Ex VAT · one-time</p>
                  </CardContent>
                  <CardFooter className="pt-0">
                    <Button
                      className="w-full"
                      disabled={topupBusy === pack.code}
                      onClick={() => startTopup(pack.code)}
                    >
                      {topupBusy === pack.code ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Buy pack"
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </section>

        <div
          className={cn(
            "grid gap-6",
            limits?.plan?.allowsPropertyPacks ? "lg:grid-cols-2" : "lg:grid-cols-1",
          )}
        >
          {/* Auto top-up — inspection only */}
          <Card className="shadow-none">
            <CardHeader className="space-y-2 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Zap className="h-4 w-4 text-primary" />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-lg">Auto top-up</CardTitle>
                    <CardDescription className="text-sm leading-relaxed max-w-xl">
                      When inspection credits fall to 5 or below, buy the pack you select
                      automatically. Limited to 3 purchases per month. SMS packs stay manual.
                    </CardDescription>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0",
                    v2?.settings?.autoTopupEnabled
                      ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/25 dark:text-emerald-400"
                      : "text-muted-foreground",
                  )}
                >
                  {v2?.settings?.autoTopupEnabled
                    ? `On · ${v2.settings.autoTopupCountThisMonth || 0}/3 this month`
                    : "Off"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                  Choose a pack
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {autoTopupPacks.map((p) => {
                    const selected =
                      !!v2?.settings?.autoTopupEnabled &&
                      v2?.settings?.autoTopupPackCode === p.code;
                    return (
                      <button
                        key={p.code}
                        type="button"
                        disabled={autoBusy}
                        onClick={() => saveAutoTopup(true, p.code)}
                        className={cn(
                          "relative text-left rounded-xl border px-4 py-3.5 transition-colors",
                          "hover:border-primary/40 hover:bg-muted/30 disabled:opacity-60",
                          selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                            : "border-border bg-background",
                        )}
                      >
                        {selected ? (
                          <span className="absolute top-2.5 right-2.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-3 w-3" />
                          </span>
                        ) : null}
                        <p className="font-medium text-sm pr-6 leading-snug">{p.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {p.quantity} inspection credits
                        </p>
                        <p className="text-base font-semibold tabular-nums mt-3">
                          {formatGbp(p.amountMinor)}
                        </p>
                      </button>
                    );
                  })}
                </div>
                {autoTopupPacks.length === 0 ? (
                  <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center">
                    No inspection top-up packs available yet.
                  </p>
                ) : null}
              </div>

              {v2?.settings?.autoTopupEnabled ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2.5">
                  <p className="text-sm text-muted-foreground">
                    Auto top-up is active for the selected pack.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={autoBusy}
                    onClick={() => saveAutoTopup(false, null)}
                  >
                    {autoBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Turn off
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Select a pack above to turn auto top-up on.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Property packs only — HMO is a company module, not a billing add-on */}
          {limits?.plan?.allowsPropertyPacks ? (
            <Card className="shadow-none">
              <CardHeader className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-4 w-4 text-primary" />
                  </span>
                  <CardTitle className="text-lg">Property packs</CardTitle>
                </div>
                <CardDescription>
                  Add +10 properties (and included inspections) to your subscription.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3.5">
                  <div>
                    <p className="font-medium text-sm">+10 properties</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Billed through your Stripe subscription
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={addonBusy === "packs"}
                    onClick={() => buyPacks(1)}
                  >
                    {addonBusy === "packs" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Add pack"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Invoices */}
        <Card className="shadow-none">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Receipt className="h-4 w-4 text-primary" />
              </span>
              <div>
                <CardTitle className="text-lg">Invoices</CardTitle>
                <CardDescription className="mt-0.5">
                  Hosted Stripe invoices (VAT shown when Tax is enabled).
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {(invoicesData?.invoices?.length || 0) === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-10 text-center">
                <Receipt className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2" />
                <p className="text-sm font-medium">No invoices yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Invoices appear here after your first paid invoice.
                </p>
              </div>
            ) : (
              <ul className="rounded-lg border divide-y overflow-hidden">
                {invoicesData!.invoices.map((inv) => {
                  const paid = (inv.status || "").toLowerCase() === "paid";
                  return (
                    <li
                      key={inv.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-sm truncate">
                            {inv.number || inv.id.slice(-8).toUpperCase()}
                          </p>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[11px] capitalize",
                              paid && "bg-emerald-500/15 text-emerald-700 border-emerald-500/25",
                            )}
                          >
                            {inv.status || "unknown"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(inv.created * 1000), "dd MMM yyyy")}
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums shrink-0">
                        {formatGbp(inv.amountPaid, inv.currency || "gbp")}
                      </p>
                      {inv.hostedInvoiceUrl ? (
                        <Button size="sm" variant="ghost" asChild className="shrink-0">
                          <a href={inv.hostedInvoiceUrl} target="_blank" rel="noreferrer">
                            View
                            <ExternalLink className="h-3.5 w-3.5 ml-1.5 opacity-70" />
                          </a>
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Modules */}
        <Card className="shadow-none" data-testid="panel-modules">
          <CardHeader className="space-y-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Package className="h-4 w-4 text-primary" />
                </span>
                <div>
                  <CardTitle className="text-lg">Modules</CardTitle>
                  <CardDescription className="mt-0.5">
                    Features available in this workspace.
                  </CardDescription>
                </div>
              </div>
              <Badge variant="secondary" className="w-fit font-normal">
                {activeModules.length} active · {inactiveModules.length} locked
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {moduleRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Package className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="font-medium">No modules configured</p>
                <p className="text-sm text-muted-foreground max-w-sm mt-1">
                  Your administrator has not published any modules for this environment yet.
                </p>
              </div>
            ) : (
              <>
                {activeModules.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Active
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {activeModules.map((mod) => (
                        <ModuleCard key={mod.id} mod={mod} />
                      ))}
                    </div>
                  </section>
                )}

                {inactiveModules.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5" />
                      Locked
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {inactiveModules.map((mod) => (
                        <Tooltip key={mod.id}>
                          <TooltipTrigger asChild>
                            <div className="outline-none h-full" tabIndex={0}>
                              <ModuleCard mod={mod} />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            {CONTACT_ADMIN}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function ModuleCard({ mod }: { mod: ModuleRow }) {
  return (
    <div
      className={cn(
        "h-full rounded-xl border p-4 transition-colors",
        mod.enabled
          ? "bg-card border-border hover:border-primary/40"
          : "bg-muted/40 border-dashed border-border/80 opacity-90",
      )}
      data-testid={`module-row-${mod.key}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center",
            mod.enabled ? "bg-emerald-500/15" : "bg-muted",
          )}
        >
          {mod.enabled ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <Lock className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm leading-snug">{mod.name}</p>
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 text-[10px]",
                mod.enabled
                  ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/25"
                  : "text-muted-foreground",
              )}
            >
              {mod.enabled ? "Active" : "Locked"}
            </Badge>
          </div>
          {mod.description ? (
            <p className="text-sm text-muted-foreground line-clamp-2">{mod.description}</p>
          ) : null}
          {mod.enabled && mod.enabledDate ? (
            <p className="text-xs text-muted-foreground pt-1">
              Enabled {format(new Date(mod.enabledDate), "dd MMM yyyy")}
            </p>
          ) : null}
          {!mod.enabled ? (
            <p className="text-xs text-muted-foreground pt-1">{CONTACT_ADMIN}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
