import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Check, CreditCard, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { pagePad } from "@/lib/responsive";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

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
  prices?: Array<{ cycle: string; amountMinor: number; currency?: string }>;
};

type CatalogResponse = {
  version?: { id: string; label: string };
  plans: CatalogPlan[];
  addons?: any[];
  topups?: any[];
};

type TopupPack = {
  code: string;
  kind: string;
  name: string;
  quantity: number;
  amountMinor: number;
};

function formatGbp(minor: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

function parseTab(raw: string | null): "property_management" | "ai_inspections" {
  if (!raw) return "property_management";
  if (raw === "ai" || raw === "ai_inspections") return "ai_inspections";
  return "property_management";
}

function parseCycle(raw: string | null): "monthly" | "yearly" {
  return raw === "monthly" ? "monthly" : "yearly";
}

function parseTopupKind(raw: string | null): "inspection" | "sms" {
  return raw === "sms" ? "sms" : "inspection";
}

export default function Pricing() {
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState<"property_management" | "ai_inspections">(() =>
    parseTab(params.get("tab")),
  );
  const [cycle, setCycle] = useState<"monthly" | "yearly">(() =>
    parseCycle(params.get("billing") || params.get("cycle")),
  );
  const [topupKind, setTopupKind] = useState<"inspection" | "sms">(() =>
    parseTopupKind(params.get("topup")),
  );
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [topupBusy, setTopupBusy] = useState<string | null>(null);

  useEffect(() => {
    const next = new URLSearchParams();
    next.set("tab", tab === "ai_inspections" ? "ai" : "pm");
    next.set("billing", cycle);
    next.set("topup", topupKind);
    const qs = next.toString();
    if (qs !== search.replace(/^\?/, "")) {
      setLocation(`/pricing?${qs}`, { replace: true });
    }
  }, [tab, cycle, topupKind]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: status } = useQuery<{
    enabled: boolean;
    photosPerCredit: number;
    enquireCalendlyUrl?: string;
  }>({
    queryKey: ["/api/billing/self-serve-status"],
    queryFn: async () => (await apiRequest("GET", "/api/billing/self-serve-status")).json(),
  });

  const { data: catalog, isLoading } = useQuery<CatalogResponse>({
    queryKey: ["/api/billing/catalog", tab, cycle],
    queryFn: async () => {
      const res = await fetch(
        `/api/billing/catalog?tab=${encodeURIComponent(tab)}&cycle=${encodeURIComponent(cycle)}`,
        { credentials: "include", cache: "no-store" },
      );
      if (res.status === 404) return { plans: [] };
      if (!res.ok) throw new Error("Failed to load catalog");
      return res.json();
    },
  });

  const plans = useMemo(() => {
    const list = catalog?.plans || [];
    const prices = (catalog as any)?.prices || [];
    return list
      .filter((p) => p.tab === tab || !p.tab)
      .map((p) => ({
        ...p,
        prices: prices.filter((pr: any) => pr.planCode === p.code),
      }));
  }, [catalog, tab]);

  const { data: topupData } = useQuery<{ packs: TopupPack[] }>({
    queryKey: ["/api/billing/v2/topup-packs"],
    queryFn: async () => {
      const res = await fetch("/api/billing/v2/topup-packs", { credentials: "include" });
      if (!res.ok) return { packs: [] };
      return res.json();
    },
  });

  const inspectionPacks = useMemo(
    () => (topupData?.packs || []).filter((p) => p.kind === "inspection"),
    [topupData],
  );
  const smsPacks = useMemo(
    () => (topupData?.packs || []).filter((p) => p.kind === "sms"),
    [topupData],
  );
  const visibleTopups = topupKind === "sms" ? smsPacks : inspectionPacks;
  const hasTopups = inspectionPacks.length > 0 || smsPacks.length > 0;

  async function trackEnquire(planCode: string) {
    try {
      await apiRequest("POST", "/api/billing/analytics", {
        eventName: "enquire_click",
        metadata: { planCode, tab, cycle },
      });
    } catch {
      /* non-blocking */
    }
    const url = status?.enquireCalendlyUrl || "https://calendly.com/-nadeemmohammed-/inspect360-demo";
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function startTopup(packCode: string) {
    if (!isAuthenticated) {
      window.location.href = `/auth?returnUrl=${encodeURIComponent("/pricing")}`;
      return;
    }
    setTopupBusy(packCode);
    try {
      const res = await apiRequest("POST", "/api/billing/v2/topup-checkout", {
        packCode,
        successUrl: `${window.location.origin}/billing?topup=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/pricing`,
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

  const { data: billingSub } = useQuery<{ subscription: any }>({
    queryKey: ["/api/billing/v2/subscription"],
    queryFn: async () => (await apiRequest("GET", "/api/billing/v2/subscription")).json(),
    enabled: isAuthenticated,
    retry: false,
  });

  async function startCheckout(planCode: string) {
    if (!isAuthenticated) {
      window.location.href = `/auth?returnUrl=${encodeURIComponent(`/pricing?tab=${tab === "ai_inspections" ? "ai" : "pm"}&billing=${cycle}`)}`;
      return;
    }
    setCheckoutBusy(planCode);
    try {
      const sub = billingSub?.subscription;
      const canChangeInPlace =
        !!sub?.stripeSubscriptionId &&
        !!sub.planCode &&
        sub.planCode !== "pending" &&
        (sub.status === "active" || sub.status === "trialing");

      if (canChangeInPlace) {
        const res = await apiRequest("POST", "/api/billing/v2/change-plan", {
          planCode,
          cycle,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Plan change failed");
        toast({
          title:
            data.mode === "downgrade_scheduled"
              ? "Downgrade scheduled"
              : "Upgrade payment processing",
          description:
            data.mode === "downgrade_scheduled"
              ? "Takes effect at the end of your billing period."
              : "Your current plan stays active until the upgrade charge succeeds.",
        });
        window.location.href = "/billing";
        return;
      }

      const res = await apiRequest("POST", "/api/billing/v2/checkout", {
        planCode,
        cycle,
        successUrl: `${window.location.origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/pricing?tab=${tab === "ai_inspections" ? "ai" : "pm"}&billing=${cycle}`,
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

  return (
    <div className={cn("container mx-auto min-w-0 space-y-6 md:space-y-8", pagePad)}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Pricing</h1>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl">
            Property management and AI inspections — prices exclude VAT.{" "}
            {status?.photosPerCredit || 500} photos per inspection credit.
          </p>
        </div>
        <Button variant="outline" asChild className="shrink-0 w-fit">
          <Link href="/billing">Manage billing</Link>
        </Button>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="property_management">Property management</TabsTrigger>
            <TabsTrigger value="ai_inspections">AI inspections</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={cycle} onValueChange={(v) => setCycle(v as typeof cycle)}>
          <TabsList>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="yearly">Yearly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Pricing catalog is not published yet. Please check back soon.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => {
            const price = plan.prices?.find((p) => p.cycle === cycle) || plan.prices?.[0];
            const amount = price?.amountMinor ?? 0;
            const sub = billingSub?.subscription;
            const hasLiveSub =
              !!sub?.stripeSubscriptionId &&
              !!sub.planCode &&
              sub.planCode !== "pending" &&
              (sub.status === "active" || sub.status === "trialing");
            const isCurrent =
              hasLiveSub && sub.planCode === plan.code && (sub.cycle || cycle) === cycle;
            return (
              <Card
                key={plan.code}
                className={cn(
                  "flex flex-col",
                  plan.popular && "border-primary border-2 shadow-sm",
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    {plan.popular ? <Badge>Most popular</Badge> : null}
                  </div>
                  {plan.description ? (
                    <CardDescription className="text-sm">{plan.description}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-4 flex-1">
                  {plan.enquireOnly ? (
                    <p className="text-2xl font-semibold">Custom</p>
                  ) : (
                    <p className="text-3xl font-bold tracking-tight">
                      {formatGbp(amount)}
                      <span className="text-sm font-normal text-muted-foreground">
                        /{cycle === "yearly" ? "year" : "month"}
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
                    {(cycle === "yearly" ? plan.yearlyInspections : plan.monthlyInspections) !=
                      null && (
                      <li className="flex gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        {cycle === "yearly" ? plan.yearlyInspections : plan.monthlyInspections}{" "}
                        inspections / {cycle === "yearly" ? "year" : "month"}
                      </li>
                    )}
                    {(plan.smsPerYear || 0) > 0 && (
                      <li className="flex gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        {cycle === "yearly"
                          ? plan.smsPerYear
                          : Math.max(1, Math.floor((plan.smsPerYear || 0) / 12))}{" "}
                        SMS credits / {cycle === "yearly" ? "year" : "month"}
                      </li>
                    )}
                  </ul>
                </CardContent>
                <CardFooter className="pt-0">
                  {plan.enquireOnly ? (
                    <Button className="w-full" variant="outline" onClick={() => trackEnquire(plan.code)}>
                      Enquire
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      variant={isCurrent ? "outline" : "default"}
                      disabled={
                        checkoutBusy === plan.code ||
                        isCurrent ||
                        Boolean(sub?.pendingPlanCode)
                      }
                      onClick={() => startCheckout(plan.code)}
                    >
                      {checkoutBusy === plan.code ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : !isAuthenticated ? (
                        "Sign in to subscribe"
                      ) : isCurrent ? (
                        "Current plan"
                      ) : hasLiveSub ? (
                        "Switch plan"
                      ) : (
                        "Start trial"
                      )}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {hasTopups ? (
        <section className="space-y-4 md:space-y-5 pt-2 border-t">
          <div className="space-y-3 pt-6">
            <div className="min-w-0 space-y-1">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight">Credit top-ups</h2>
              <p className="text-sm text-muted-foreground">
                Prepaid packs — prices exclude VAT
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
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
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
                    <p className="text-2xl font-bold tracking-tight">{formatGbp(pack.amountMinor)}</p>
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
      ) : null}
    </div>
  );
}
