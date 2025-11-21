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
  const [topupDialogOpen, setTopupDialogOpen] = useState(false);
  const [location, setLocation] = useLocation();

  // Check for action=topup URL parameter and auto-open dialog
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'topup') {
      setTopupDialogOpen(true);
      // Remove the action parameter from URL
      params.delete('action');
      const newSearch = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${newSearch ? '?' + newSearch : ''}`);
    }
  }, []);

  // Handle success/canceled query parameters with polling for webhook completion
  useEffect(() => {
    // Only run if user is loaded
    if (!user) return;
    
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    
    // Helper function to poll for updated data
    const pollForUpdates = (queryKeys: string[], maxAttempts = 5) => {
      let attempts = 0;
      
      // Initial invalidation
      queryKeys.forEach(key => {
        queryClient.invalidateQueries({ queryKey: [key] });
      });
      
      // Set up polling interval
      const pollInterval = setInterval(() => {
        attempts++;
        
        // Invalidate queries to trigger refetch
        queryKeys.forEach(key => {
          queryClient.invalidateQueries({ queryKey: [key] });
        });
        
        // Stop after max attempts
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
        }
      }, 2000); // Poll every 2 seconds
      
      return () => clearInterval(pollInterval);
    };

    
    if (params.get('topup_success') === 'true') {
      // Process the session immediately if we have a session_id
      const processAndCleanup = async () => {
        if (sessionId) {
          try {
            const response = await apiRequest("POST", "/api/billing/process-session", { sessionId });
            const result = await response.json();
            console.log('[Billing] Session processed:', result);
            
            if (result.processed) {
              // Invalidate queries to trigger refetch
              queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
              queryClient.invalidateQueries({ queryKey: ['/api/credits/balance'] });
              queryClient.invalidateQueries({ queryKey: ['/api/credits/ledger'] });
              queryClient.invalidateQueries({ queryKey: ['/api/billing/aggregate-credits'] });
              queryClient.invalidateQueries({ queryKey: [`/api/organizations/${user.organizationId}`] });
              
              // Explicitly refetch the critical credit balance query to ensure immediate UI update
              await queryClient.refetchQueries({ queryKey: ['/api/credits/balance'] });
              
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
      };
      
      processAndCleanup();
      
      // Also poll for updates (in case webhook fires) and capture cleanup function
      const cleanupPolling = pollForUpdates(['/api/credits/balance', '/api/credits/ledger', '/api/billing/aggregate-credits', `/api/organizations/${user.organizationId}`]);
      
      // Clean up URL after polling completes (12 seconds = 2s initial + 10s polling)
      const urlCleanupTimer = setTimeout(() => {
        setLocation('/billing', { replace: true });
      }, 12000);
      
      // Return cleanup function for useEffect
      return () => {
        cleanupPolling();
        clearTimeout(urlCleanupTimer);
      };
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
        if (sessionId) {
          try {
            const response = await apiRequest("POST", "/api/billing/process-session", { sessionId });
            const result = await response.json();
            console.log('[Billing] Session processed:', result);
            
            if (result.processed) {
              // Invalidate queries to trigger refetch
              queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
              queryClient.invalidateQueries({ queryKey: ['/api/credits/balance'] });
              queryClient.invalidateQueries({ queryKey: ['/api/credits/ledger'] });
              queryClient.invalidateQueries({ queryKey: ['/api/billing/aggregate-credits'] });
              queryClient.invalidateQueries({ queryKey: [`/api/organizations/${user.organizationId}`] });
              
              // Explicitly refetch the critical credit balance query to ensure immediate UI update
              await queryClient.refetchQueries({ queryKey: ['/api/credits/balance'] });
              
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
      };
      
      processAndCleanup();
      
      // Also poll for updates (in case webhook fires) and capture cleanup function
      const cleanupPolling = pollForUpdates(['/api/billing/subscription', '/api/credits/balance', '/api/credits/ledger', '/api/billing/aggregate-credits', `/api/organizations/${user.organizationId}`]);
      
      // Clean up URL after polling completes (12 seconds = 2s initial + 10s polling)
      const urlCleanupTimer = setTimeout(() => {
        setLocation('/billing', { replace: true });
      }, 12000);
      
      // Return cleanup function for useEffect
      return () => {
        cleanupPolling();
        clearTimeout(urlCleanupTimer);
      };
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

  // Fetch aggregate credits (detects duplicate accounts)
  const { data: aggregateCredits } = useQuery<{
    primaryOrganizationCredits: number;
    duplicateOrganizations: Array<{ organizationId: string; organizationName: string; userRole: string; credits: number }>;
    allOrganizations: Array<{ organizationId: string; organizationName: string; userRole: string; credits: number }>;
    totalCredits: number;
    totalConsumed: number;
    totalExpired: number;
    hasDuplicates: boolean;
  }>({
    queryKey: ["/api/billing/aggregate-credits"],
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

      {/* Duplicate Account Warning */}
      {aggregateCredits?.hasDuplicates && (
        <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950" data-testid="card-duplicate-account-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
              <AlertCircle className="h-5 w-5" />
              Multiple Accounts Detected
            </CardTitle>
            <CardDescription className="text-yellow-700 dark:text-yellow-300">
              You have {aggregateCredits.allOrganizations.length} accounts with the same email address
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <p className="mb-3">Your total credits across all accounts: <span className="font-bold text-lg">{aggregateCredits.totalCredits}</span></p>
              <div className="space-y-2">
                {aggregateCredits.allOrganizations.map((org) => (
                  <div key={org.organizationId} className="flex items-center justify-between p-2 bg-white dark:bg-gray-900 rounded" data-testid={`org-balance-${org.organizationId}`}>
                    <div>
                      <span className="font-medium">{org.organizationName}</span>
                      {org.organizationId === user?.organizationId && (
                        <Badge variant="outline" className="ml-2">Current</Badge>
                      )}
                    </div>
                    <span className="font-semibold">{org.credits} credits</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              This happened because email addresses were previously case-sensitive. Please contact support to merge your accounts if needed.
            </p>
          </CardContent>
        </Card>
      )}

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
            <CardDescription>
              {aggregateCredits?.hasDuplicates 
                ? "Total credits across all your accounts" 
                : "Available inspection credits"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-4xl font-bold text-primary" data-testid="text-available-credits">
                {aggregateCredits?.hasDuplicates 
                  ? aggregateCredits.totalCredits 
                  : (balance?.available || 0)}
              </p>
              <p className="text-sm text-muted-foreground">
                {aggregateCredits?.hasDuplicates ? "Total credits available" : "Credits available"}
              </p>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Consumed</p>
                <p className="text-lg font-semibold" data-testid="text-consumed-credits">
                  {aggregateCredits?.hasDuplicates 
                    ? aggregateCredits.totalConsumed 
                    : (balance?.consumed || 0)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Expired</p>
                <p className="text-lg font-semibold" data-testid="text-expired-credits">
                  {aggregateCredits?.hasDuplicates 
                    ? aggregateCredits.totalExpired 
                    : (balance?.expired || 0)}
                </p>
              </div>
            </div>

            <Dialog open={topupDialogOpen} onOpenChange={setTopupDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="default" className="w-full" data-testid="button-top-up-credits">
                  <Package className="mr-2 h-4 w-4" />
                  Top-Up Credits
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="dialog-topup">
                <DialogHeader>
                  <DialogTitle>Add-On AI Inspection Bundles</DialogTitle>
                  <DialogDescription>
                    Purchase additional credits when your subscription allowance is depleted
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {[
                    { size: 100, price: 40000, perCredit: 400, popular: false },
                    { size: 250, price: 75000, perCredit: 300, popular: false },
                    { size: 500, price: 100000, perCredit: 200, popular: true },
                    { size: 1000, price: 150000, perCredit: 150, popular: false },
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
                            <p className="font-semibold text-lg">{pack.size} AI Credits</p>
                            <p className="text-sm text-muted-foreground">
                              {formatCurrency(pack.price)} • {formatCurrency(pack.perCredit)} per credit
                            </p>
                          </div>
                          {pack.popular && (
                            <Badge variant="default">Best Value</Badge>
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

      {/* Subscription Management & Cancellation */}
      {subscription && (
        <Card data-testid="card-subscription-management">
          <CardHeader>
            <CardTitle>Subscription Management</CardTitle>
            <CardDescription>Manage your plan, billing, and cancellation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="font-semibold mb-2">Current Plan</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  You're currently on the <strong>{subscription.planSnapshotJson.planName}</strong> plan
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(subscription.planSnapshotJson.monthlyPrice, subscription.planSnapshotJson.currency)}/month • {subscription.planSnapshotJson.includedCredits} credits per month
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Billing Cycle</h3>
                <p className="text-sm text-muted-foreground">
                  Your next billing date is <strong>{format(new Date(subscription.currentPeriodEnd), "MMMM d, yyyy")}</strong>
                </p>
                {subscription.cancelAtPeriodEnd && (
                  <p className="text-sm text-destructive mt-2">
                    Your subscription will cancel on this date.
                  </p>
                )}
              </div>
            </div>

            <Separator />

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
                data-testid="button-change-plan"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Change Plan or Payment Method
              </Button>
              <Button
                variant={subscription.cancelAtPeriodEnd ? "default" : "destructive"}
                className="flex-1"
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
                data-testid="button-cancel-subscription"
              >
                <AlertCircle className="mr-2 h-4 w-4" />
                {subscription.cancelAtPeriodEnd ? "Reactivate Subscription" : "Cancel Subscription"}
              </Button>
            </div>

            {!subscription.cancelAtPeriodEnd && (
              <div className="bg-muted p-3 rounded-md">
                <p className="text-xs text-muted-foreground">
                  <strong>Note:</strong> Canceling your subscription will keep it active until the end of your current billing period. 
                  You'll continue to have access to all features and your remaining credits until {format(new Date(subscription.currentPeriodEnd), "MMMM d, yyyy")}.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
              Yes! When your subscription allowance is depleted, you can purchase add-on AI inspection bundles:
            </p>
            <div className="text-sm text-muted-foreground space-y-1 mt-2">
              <p>• <strong>100 credits:</strong> £400 (£4.00 per credit)</p>
              <p>• <strong>250 credits:</strong> £750 (£3.00 per credit)</p>
              <p>• <strong>500 credits:</strong> £1,000 (£2.00 per credit) - Best Value</p>
              <p>• <strong>1000 credits:</strong> £1,500 (£1.50 per credit)</p>
              <p className="pt-2">Top-up credits never expire and are consumed using FIFO (first-in, first-out) logic after your monthly credits.</p>
            </div>
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
