import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Package, TrendingUp, ExternalLink, Zap, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Plan {
  id: string;
  code: string;
  name: string;
  monthlyPriceGbp: number;
  includedCreditsPerMonth: number;
  active: boolean;
}

interface Subscription {
  id: string;
  organizationId: string;
  planSnapshotJson: {
    planName: string;
    monthlyPrice: number;
    includedCredits: number;
    currency: string;
  };
  currentPeriodStart: string;
  currentPeriodEnd: string;
  status: string;
  cancelAtPeriodEnd: boolean;
}

interface CreditBalance {
  available: number;
  consumed: number;
  expired: number;
}

interface LedgerEntry {
  id: string;
  organizationType: string;
  changeType: string;
  quantity: number;
  description: string;
  createdAt: string;
}

export default function Billing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTopup, setSelectedTopup] = useState<number | null>(null);

  // Fetch subscription plans
  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["/api/billing/plans"],
    enabled: !!user,
  });

  // Fetch current subscription
  const { data: subscription } = useQuery<Subscription | null>({
    queryKey: ["/api/billing/subscription"],
    enabled: !!user,
  });

  // Fetch credit balance
  const { data: balance } = useQuery<CreditBalance>({
    queryKey: ["/api/credits/balance"],
    enabled: !!user,
  });

  // Fetch credit ledger
  const { data: ledger = [] } = useQuery<LedgerEntry[]>({
    queryKey: ["/api/credits/ledger"],
    enabled: !!user,
  });

  // Create checkout session
  const checkoutMutation = useMutation({
    mutationFn: async (planCode: string) => {
      const response = await apiRequest("/api/billing/checkout", {
        method: "POST",
        body: { planCode },
      });
      return response as { url: string };
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start checkout",
        variant: "destructive",
      });
    },
  });

  // Create portal session
  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/billing/portal", {
        method: "POST",
      });
      return response as { url: string };
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to open portal",
        variant: "destructive",
      });
    },
  });

  // Top-up checkout mutation
  const topupMutation = useMutation({
    mutationFn: async (packSize: number) => {
      const response = await apiRequest("/api/credits/topup/checkout", {
        method: "POST",
        body: { packSize },
      });
      return response as { url: string };
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start top-up checkout",
        variant: "destructive",
      });
    },
  });

  const formatCurrency = (amount: number, currency: string = "GBP") => {
    const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "AED" ? "د.إ" : currency;
    return `${symbol}${(amount / 100).toFixed(2)}`;
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "active":
        return "default";
      case "trialing":
        return "secondary";
      case "past_due":
      case "incomplete":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">Billing & Credits</h1>
        <p className="text-muted-foreground">
          Manage your subscription, credits, and billing details
        </p>
      </div>

      {/* Current Subscription & Credits Overview */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Subscription Card */}
        <Card data-testid="card-current-subscription">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Current Subscription
            </CardTitle>
            <CardDescription>Your active billing plan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscription ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-plan-name">
                      {subscription.planSnapshotJson.planName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(subscription.planSnapshotJson.monthlyPrice, subscription.planSnapshotJson.currency)}/month
                    </p>
                  </div>
                  <Badge variant={getStatusBadgeVariant(subscription.status)} data-testid="badge-subscription-status">
                    {subscription.status}
                  </Badge>
                </div>

                <Separator />

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Included Credits</span>
                    <span className="font-medium">{subscription.planSnapshotJson.includedCredits}/month</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Period</span>
                    <span className="font-medium">
                      {format(new Date(subscription.currentPeriodStart), "MMM d")} - {format(new Date(subscription.currentPeriodEnd), "MMM d, yyyy")}
                    </span>
                  </div>
                  {subscription.cancelAtPeriodEnd && (
                    <div className="flex items-center gap-2 p-2 bg-destructive/10 rounded-md">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <span className="text-sm text-destructive">Cancels on {format(new Date(subscription.currentPeriodEnd), "MMM d, yyyy")}</span>
                    </div>
                  )}
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                  data-testid="button-manage-subscription"
                >
                  Manage Subscription <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">No active subscription</p>
                <Button className="w-full" onClick={() => window.location.href = "#plans"} data-testid="button-choose-plan">
                  Choose a Plan
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Credit Balance Card */}
        <Card data-testid="card-credit-balance">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Credit Balance
            </CardTitle>
            <CardDescription>Available inspection credits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-4xl font-bold text-primary" data-testid="text-available-credits">
                {balance?.available || 0}
              </p>
              <p className="text-sm text-muted-foreground">Credits available</p>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Consumed</p>
                <p className="text-lg font-semibold" data-testid="text-consumed-credits">{balance?.consumed || 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Expired</p>
                <p className="text-lg font-semibold" data-testid="text-expired-credits">{balance?.expired || 0}</p>
              </div>
            </div>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="default" className="w-full" data-testid="button-top-up-credits">
                  <Package className="mr-2 h-4 w-4" />
                  Top-Up Credits
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="dialog-topup">
                <DialogHeader>
                  <DialogTitle>Purchase Credit Pack</DialogTitle>
                  <DialogDescription>
                    Choose a credit pack to add to your account (£0.75 per credit)
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {[
                    { size: 100, price: 7500, popular: false },
                    { size: 500, price: 37500, popular: true },
                    { size: 1000, price: 75000, popular: false },
                  ].map((pack) => (
                    <Card
                      key={pack.size}
                      className={`cursor-pointer hover-elevate active-elevate-2 ${
                        selectedTopup === pack.size ? "border-primary" : ""
                      }`}
                      onClick={() => setSelectedTopup(pack.size)}
                      data-testid={`card-topup-${pack.size}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-lg">{pack.size} Credits</p>
                            <p className="text-sm text-muted-foreground">
                              {formatCurrency(pack.price)} ({formatCurrency(pack.price / pack.size)}/credit)
                            </p>
                          </div>
                          {pack.popular && (
                            <Badge variant="default">Popular</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Button
                  onClick={() => selectedTopup && topupMutation.mutate(selectedTopup)}
                  disabled={!selectedTopup || topupMutation.isPending}
                  data-testid="button-confirm-topup"
                >
                  Purchase {selectedTopup} Credits
                </Button>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      {/* Available Plans */}
      <div id="plans">
        <h2 className="text-2xl font-bold mb-4">Available Plans</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} data-testid={`card-plan-${plan.code}`} className={subscription?.planSnapshotJson.planName === plan.name ? "border-primary" : ""}>
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>
                  <span className="text-3xl font-bold">{formatCurrency(plan.monthlyPriceGbp)}</span>/month
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-sm">{plan.includedCreditsPerMonth} credits/month</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-sm">1-month rollover</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-sm">AI-powered inspections</span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  variant={subscription?.planSnapshotJson.planName === plan.name ? "outline" : "default"}
                  onClick={() => checkoutMutation.mutate(plan.code)}
                  disabled={checkoutMutation.isPending || subscription?.planSnapshotJson.planName === plan.name}
                  data-testid={`button-select-plan-${plan.code}`}
                >
                  {subscription?.planSnapshotJson.planName === plan.name ? "Current Plan" : "Select Plan"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Credit History */}
      <Card data-testid="card-credit-ledger">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Credit History
          </CardTitle>
          <CardDescription>Recent credit transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {ledger.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No credit transactions yet</p>
            ) : (
              ledger.slice(0, 10).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b last:border-0" data-testid={`ledger-entry-${entry.id}`}>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{entry.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(entry.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={entry.changeType === "debit" ? "destructive" : "default"}>
                      {entry.changeType === "debit" ? "-" : "+"}{entry.quantity}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
