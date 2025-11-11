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
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useLocation } from "wouter";

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
  const [location, setLocation] = useLocation();

  // Handle success/canceled query parameters with polling for webhook completion
  useEffect(() => {
    // Only run if user is loaded
    if (!user) return;
    
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    
    // Helper function to poll for updated data
    const pollForUpdates = async (queryKeys: string[], maxAttempts = 5) => {
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        
        // Invalidate and refetch
        for (const key of queryKeys) {
          await queryClient.invalidateQueries({ queryKey: [key] });
          await queryClient.refetchQueries({ queryKey: [key] });
        }
        
        // Stop after max attempts
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
        }
      }, 2000); // Poll every 2 seconds
      
      // Initial fetch
      for (const key of queryKeys) {
        await queryClient.invalidateQueries({ queryKey: [key] });
      }
      
      return () => clearInterval(pollInterval);
    };

    
    if (params.get('topup_success') === 'true') {
      // Process the session immediately if we have a session_id
      const processAndCleanup = async () => {
        let success = false;
        
        if (sessionId) {
          try {
            const response = await apiRequest("POST", "/api/billing/process-session", { sessionId });
            const result = await response.json();
            console.log('[Billing] Session processed:', result);
            
            if (result.processed) {
              // Invalidate AND refetch queries after processing
              const orgQueryKey = `/api/organizations/${user.organizationId}`;
              await queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
              await queryClient.invalidateQueries({ queryKey: ['/api/credits/balance'] });
              await queryClient.invalidateQueries({ queryKey: ['/api/credits/ledger'] });
              await queryClient.invalidateQueries({ queryKey: [orgQueryKey] });
              
              // Force immediate refetch to update UI
              await queryClient.refetchQueries({ queryKey: ['/api/credits/balance'] });
              await queryClient.refetchQueries({ queryKey: ['/api/credits/ledger'] });
              await queryClient.refetchQueries({ queryKey: [orgQueryKey] });
              
              success = true;
              
              toast({
                title: "Payment Successful!",
                description: "Your credits have been added to your account!",
              });
            } else {
              toast({
                title: "Processing Payment",
                description: "Your payment is being processed...",
              });
            }
          } catch (error) {
            console.error('[Billing] Error processing session:', error);
            toast({
              title: "Payment Received",
              description: "Your payment is being processed. Credits will appear shortly.",
              variant: "default",
            });
          }
        }
        
        // Clean up URL after processing completes
        setTimeout(() => {
          setLocation('/billing', { replace: true });
        }, 1000);
      };
      
      processAndCleanup();
      
      // Also poll for updates (in case webhook fires)
      const orgQueryKey = `/api/organizations/${user.organizationId}`;
      pollForUpdates(['/api/credits/balance', '/api/credits/ledger', orgQueryKey]);
    } else if (params.get('topup_canceled') === 'true') {
      toast({
        title: "Payment Canceled",
        description: "Your payment was not completed.",
        variant: "destructive",
      });
      
      // Clean up URL
      setLocation('/billing', { replace: true });
    } else if (params.get('success') === 'true') {
      // Process the session immediately if we have a session_id
      const processAndCleanup = async () => {
        let success = false;
        
        if (sessionId) {
          try {
            const response = await apiRequest("POST", "/api/billing/process-session", { sessionId });
            const result = await response.json();
            console.log('[Billing] Session processed:', result);
            
            if (result.processed) {
              // Invalidate AND refetch queries after processing
              const orgQueryKey = `/api/organizations/${user.organizationId}`;
              await queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
              await queryClient.invalidateQueries({ queryKey: ['/api/credits/balance'] });
              await queryClient.invalidateQueries({ queryKey: ['/api/credits/ledger'] });
              await queryClient.invalidateQueries({ queryKey: [orgQueryKey] });
              
              // Force immediate refetch to update UI
              await queryClient.refetchQueries({ queryKey: ['/api/billing/subscription'] });
              await queryClient.refetchQueries({ queryKey: ['/api/credits/balance'] });
              await queryClient.refetchQueries({ queryKey: ['/api/credits/ledger'] });
              await queryClient.refetchQueries({ queryKey: [orgQueryKey] });
              
              success = true;
              
              toast({
                title: "Subscription Active!",
                description: result.alreadyProcessed 
                  ? "Your subscription is already active!" 
                  : "Your subscription has been activated!",
              });
            } else {
              toast({
                title: "Processing Subscription",
                description: "Your subscription is being activated...",
              });
            }
          } catch (error) {
            console.error('[Billing] Error processing session:', error);
            toast({
              title: "Payment Received",
              description: "Your subscription is being processed. Please refresh in a moment.",
              variant: "default",
            });
          }
        }
        
        // Clean up URL after processing completes
        setTimeout(() => {
          setLocation('/billing', { replace: true });
        }, 1000);
      };
      
      processAndCleanup();
      
      // Also poll for updates (in case webhook fires)
      const orgQueryKey = `/api/organizations/${user.organizationId}`;
      pollForUpdates(['/api/billing/subscription', '/api/credits/balance', '/api/credits/ledger', orgQueryKey]);
    } else if (params.get('canceled') === 'true') {
      toast({
        title: "Subscription Canceled",
        description: "You can subscribe anytime from this page.",
        variant: "destructive",
      });
      
      // Clean up URL
      setLocation('/billing', { replace: true });
    }
  }, [user, toast, setLocation]);

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
      console.log(`[Billing] SUBSCRIPTION CHECKOUT initiated for plan: ${planCode}`);
      console.log(`[Billing] Calling POST /api/billing/checkout`);
      const response = await apiRequest("POST", "/api/billing/checkout", { planCode });
      const data = await response.json() as { url: string };
      console.log(`[Billing] SUBSCRIPTION checkout URL received:`, data.url);
      return data;
    },
    onSuccess: (data) => {
      if (data.url) {
        console.log(`[Billing] Redirecting to SUBSCRIPTION checkout...`);
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      console.error(`[Billing] SUBSCRIPTION checkout error:`, error);
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
      const response = await apiRequest("POST", "/api/billing/portal");
      return response.json() as Promise<{ url: string }>;
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
      console.log(`[Billing] TOP-UP CHECKOUT initiated for pack size: ${packSize}`);
      console.log(`[Billing] Calling POST /api/credits/topup/checkout`);
      const response = await apiRequest("POST", "/api/credits/topup/checkout", { packSize });
      const data = await response.json() as { url: string };
      console.log(`[Billing] TOP-UP checkout URL received:`, data.url);
      return data;
    },
    onSuccess: (data) => {
      if (data.url) {
        console.log(`[Billing] Redirecting to TOP-UP checkout...`);
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      console.error(`[Billing] TOP-UP checkout error:`, error);
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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans
            .sort((a, b) => {
              const order = ['starter', 'professional', 'enterprise', 'enterprise_plus'];
              return order.indexOf(a.code) - order.indexOf(b.code);
            })
            .map((plan) => {
            const planDescriptions: Record<string, { idealFor: string; features: string[] }> = {
              starter: {
                idealFor: "Ideal for Small Property Managers or Local Agents",
                features: [
                  "50 Inspection Credits per month",
                  "AI-powered inspections",
                  "Basic support"
                ]
              },
              professional: {
                idealFor: "Ideal for Medium Sized Agency / Facilities Manager",
                features: [
                  "200 Inspection Credits per month",
                  "AI-powered inspections",
                  "Priority support"
                ]
              },
              enterprise: {
                idealFor: "Ideal for BTR, Housing Association, or Student Accommodation Provider",
                features: [
                  "500 Inspection Credits per month",
                  "AI-powered inspections",
                  "Dedicated account manager"
                ]
              },
              enterprise_plus: {
                idealFor: "Ideal for National or Multi-Site Operator",
                features: [
                  "2000+ Inspection Credits per month",
                  "AI-powered inspections",
                  "White-label options",
                  "Custom integrations"
                ]
              }
            };

            const description = planDescriptions[plan.code] || {
              idealFor: "Custom plan for your organization",
              features: [`${plan.includedCreditsPerMonth} credits/month`, "AI-powered inspections"]
            };

            return (
              <Card key={plan.id} data-testid={`card-plan-${plan.code}`} className={subscription?.planSnapshotJson.planName === plan.name ? "border-primary" : ""}>
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  {plan.code === "enterprise_plus" ? (
                    <CardDescription>
                      <span className="text-2xl font-bold">Custom Pricing</span>
                    </CardDescription>
                  ) : (
                    <CardDescription>
                      <span className="text-3xl font-bold">{formatCurrency(plan.monthlyPriceGbp)}</span>/month
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground italic">{description.idealFor}</p>
                  <Separator />
                  <div className="space-y-2">
                    {description.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    className="w-full"
                    variant={subscription?.planSnapshotJson.planName === plan.name ? "outline" : "default"}
                    onClick={() => {
                      if (plan.code === "enterprise_plus") {
                        console.log(`[Billing] Contact Sales clicked for Enterprise+`);
                        window.location.href = "mailto:sales@inspect360.com?subject=Enterprise+ Inquiry";
                      } else {
                        console.log(`[Billing] SELECT PLAN CLICKED for plan: ${plan.code} (${plan.name})`);
                        console.log(`[Billing] This should trigger SUBSCRIPTION checkout, NOT top-up`);
                        checkoutMutation.mutate(plan.code);
                      }
                    }}
                    disabled={checkoutMutation.isPending || topupMutation.isPending || subscription?.planSnapshotJson.planName === plan.name}
                    data-testid={`button-select-plan-${plan.code}`}
                  >
                    {subscription?.planSnapshotJson.planName === plan.name 
                      ? "Current Plan" 
                      : plan.code === "enterprise_plus" 
                        ? "Contact Sales" 
                        : "Select Plan"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* FAQ Section */}
      <Card data-testid="card-credits-faq">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            How Inspection Credits Work
          </CardTitle>
          <CardDescription>Frequently asked questions about credits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="font-semibold mb-2">What are Inspection Credits?</h3>
            <p className="text-sm text-muted-foreground">
              Inspection Credits are used to perform property inspections in Inspect360. Each time you complete an inspection, 
              credits are automatically deducted from your account based on the inspection type and complexity.
            </p>
          </div>

          <Separator />

          <div>
            <h3 className="font-semibold mb-2">How many credits does each inspection cost?</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>• <strong>Routine Inspection:</strong> 1 credit</p>
              <p>• <strong>Check-In / Check-Out Inspection:</strong> 2 credits</p>
              <p>• <strong>Maintenance Inspection:</strong> 3 credits</p>
              <p className="pt-2">AI-powered features like photo analysis and comparison reports may use additional credits.</p>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="font-semibold mb-2">What happens to unused credits?</h3>
            <p className="text-sm text-muted-foreground">
              Unused credits automatically roll over to the next month, giving you an additional month to use them. 
              After that, any remaining credits from that batch will expire. This ensures you always have flexibility 
              while keeping your account current.
            </p>
          </div>

          <Separator />

          <div>
            <h3 className="font-semibold mb-2">Can I purchase additional credits?</h3>
            <p className="text-sm text-muted-foreground">
              Yes! You can purchase credit top-up packs at any time (100, 500, or 1000 credits) at £0.75 per credit. 
              Top-up credits never expire and are consumed using FIFO (first-in, first-out) logic after your monthly credits.
            </p>
          </div>

          <Separator />

          <div>
            <h3 className="font-semibold mb-2">What happens if I run out of credits?</h3>
            <p className="text-sm text-muted-foreground">
              If you run out of credits, you won't be able to complete new inspections until you purchase a top-up pack 
              or wait for your next monthly credit allocation. You can monitor your credit balance on this page at any time.
            </p>
          </div>

          <Separator />

          <div>
            <h3 className="font-semibold mb-2">Can I upgrade or downgrade my plan?</h3>
            <p className="text-sm text-muted-foreground">
              Yes! You can upgrade or downgrade your plan at any time through the Stripe customer portal. Changes will be 
              prorated, and your credit allocation will adjust with your next billing cycle.
            </p>
          </div>
        </CardContent>
      </Card>

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
