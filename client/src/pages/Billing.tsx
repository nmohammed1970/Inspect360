import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Package, TrendingUp, ExternalLink, Zap, AlertCircle, CheckCircle2, FileText, Download, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useLocation } from "wouter";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useLocale } from "@/contexts/LocaleContext";
import { format } from "date-fns";
import { getCurrencyForCountry, formatCurrency as formatCurrencyUtil } from "@shared/countryUtils";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";

interface Plan {
  id: string;
  code: string;
  name: string;
  monthlyPriceGbp: number;
  annualPriceGbp?: number | null;
  monthlyPriceUsd?: number | null;
  annualPriceUsd?: number | null;
  monthlyPriceAed?: number | null;
  annualPriceAed?: number | null;
  includedCredits: number;
  includedInspections?: number;
  includedCreditsPerMonth?: number; // For backwards compatibility
  active: boolean;
  isActive?: boolean;
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
  notes?: string | null;
  createdAt: string;
  source: string;
  createdByUser?: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
}

// Cancellation reasons
const CANCELLATION_REASONS = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "not_using_enough", label: "Not using enough features" },
  { value: "switching_to_competitor", label: "Switching to a competitor" },
  { value: "missing_features", label: "Missing features I need" },
  { value: "temporary_pause", label: "Taking a temporary break" },
  { value: "other", label: "Other reason" },
];

// Invoice interface
interface Invoice {
  id: string;
  number: string | null;
  date: string | null;
  amount: number;
  currency: string;
  status: string;
  pdfUrl: string | null;
  hostedInvoiceUrl: string | null;
  description: string;
}

export default function Billing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const locale = useLocale();
  const [selectedTopupId, setSelectedTopupId] = useState<string | null>(null);
  const [topupDialogOpen, setTopupDialogOpen] = useState(false);
  const [recurringTopup, setRecurringTopup] = useState(false);
  const [location, setLocation] = useLocation();
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  
  // Inspection slider state
  const [inspectionsNeeded, setInspectionsNeeded] = useState<number>(50);
  
  // Currency selection state
  const [selectedCurrency, setSelectedCurrency] = useState<"GBP" | "USD" | "AED">("GBP");
  
  // Cancellation dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState<string>("");
  const [cancellationReasonText, setCancellationReasonText] = useState<string>("");
  const [cancelImmediately, setCancelImmediately] = useState(false);
  
  // Get currency from user's organization country (via locale context)
  const currency = locale.currency;

  // Fetch organization to get country code for proper currency detection and credits
  const { data: organization } = useQuery<{ id: string; name: string; countryCode?: string; creditsRemaining: number | null }>({
    queryKey: user?.organizationId ? [`/api/organizations/${user.organizationId}`] : [],
    enabled: !!user?.organizationId,
  });

  // Update currency based on organization country if available
  const effectiveCurrency = organization?.countryCode 
    ? getCurrencyForCountry(organization.countryCode)
    : currency;

  // Helper function to format price based on currency
  const formatPrice = (penceAmount: number | null | undefined, curr: "GBP" | "USD" | "AED" = selectedCurrency) => {
    if (!penceAmount) return "N/A";
    return formatCurrencyUtil(penceAmount, curr, true);
  };
  
  // Helper function to get the correct price for a plan based on selected currency
  const getPlanPrice = (plan: Plan, period: "monthly" | "annual"): number | null => {
    if (period === "monthly") {
      switch (selectedCurrency) {
        case "USD": return plan.monthlyPriceUsd ?? null;
        case "AED": return plan.monthlyPriceAed ?? null;
        default: return plan.monthlyPriceGbp ?? null;
      }
    } else {
      switch (selectedCurrency) {
        case "USD": return plan.annualPriceUsd ?? null;
        case "AED": return plan.annualPriceAed ?? null;
        default: return plan.annualPriceGbp ?? null;
      }
    }
  };

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
              
              // Explicitly refetch the critical credit balance and organization queries to ensure immediate UI update
              await Promise.all([
                queryClient.refetchQueries({ queryKey: ['/api/credits/balance'] }),
                queryClient.refetchQueries({ queryKey: [`/api/organizations/${user.organizationId}`] }),
              ]);
              
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
              // Small delay to ensure database write completes
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Invalidate queries to trigger refetch
              queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
              queryClient.invalidateQueries({ queryKey: ['/api/credits/balance'] });
              queryClient.invalidateQueries({ queryKey: ['/api/credits/ledger'] });
              queryClient.invalidateQueries({ queryKey: ['/api/billing/aggregate-credits'] });
              queryClient.invalidateQueries({ queryKey: [`/api/organizations/${user.organizationId}`] });
              
              // Explicitly refetch critical queries to ensure immediate UI update
              console.log('[Billing] Refetching subscription and credit balance...');
              await Promise.all([
                queryClient.refetchQueries({ queryKey: ['/api/billing/subscription'] }),
                queryClient.refetchQueries({ queryKey: ['/api/credits/balance'] }),
                queryClient.refetchQueries({ queryKey: ['/api/credits/ledger'] }),
                queryClient.refetchQueries({ queryKey: [`/api/organizations/${user.organizationId}`] }),
              ]);
              
              console.log('[Billing] Queries refetched, subscription should now be visible');
              
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
  const { data: plansData = [], isLoading: plansLoading, error: plansError } = useQuery<Plan[]>({
    queryKey: ["/api/billing/plans"],
    enabled: !!user,
  });

  // Debug: Log plans data
  useEffect(() => {
    if (plansData && plansData.length > 0) {
      console.log('[Billing] Plans fetched:', plansData);
    } else if (plansData && plansData.length === 0) {
      console.warn('[Billing] No plans returned from API');
    }
    if (plansError) {
      console.error('[Billing] Error fetching plans:', plansError);
    }
  }, [plansData, plansError]);

  // Map plans to match frontend interface (transform isActive to active, includedCredits to includedCreditsPerMonth)
  const plans = (plansData || []).map((plan: any) => ({
    ...plan,
    active: plan.isActive !== undefined ? plan.isActive : (plan.active ?? true),
    isActive: plan.isActive !== undefined ? plan.isActive : (plan.active ?? true),
    includedCreditsPerMonth: plan.includedCredits || plan.includedCreditsPerMonth || 0,
  })).filter((plan: any) => (plan.isActive ?? plan.active ?? true)); // Only show active plans

  // Fetch current subscription
  const { data: subscription, isLoading: subscriptionLoading, error: subscriptionError } = useQuery<Subscription | null>({
    queryKey: ["/api/billing/subscription"],
    enabled: !!user,
  });

  // Debug: Log subscription data changes
  useEffect(() => {
    if (subscription) {
      console.log('[Billing] Subscription data loaded:', subscription);
    } else if (subscription === null) {
      console.log('[Billing] No subscription found (null)');
    }
    if (subscriptionError) {
      console.error('[Billing] Subscription query error:', subscriptionError);
    }
    if (subscriptionLoading) {
      console.log('[Billing] Subscription query loading...');
    }
  }, [subscription, subscriptionLoading, subscriptionError]);

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

  // Fetch invoices
  const { data: invoicesData, isLoading: invoicesLoading } = useQuery<{ invoices: Invoice[]; hasStripeCustomer: boolean }>({
    queryKey: ["/api/billing/invoices"],
    enabled: !!user,
  });

  // Fetch credit bundles for top-up
  interface CreditBundle {
    id: string;
    name: string;
    credits: number;
    price: number;
    currency: string;
    isPopular?: boolean;
    discountLabel?: string;
    tierPricing?: any[];
  }
  const { data: bundlesData = [], isLoading: bundlesLoading } = useQuery<CreditBundle[]>({
    queryKey: ["/api/billing/bundles", selectedCurrency],
    queryFn: async () => {
      const response = await fetch(`/api/billing/bundles?currency=${selectedCurrency}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!user,
  });
  
  // Calculate per-credit price (bundles are already filtered to active on server)
  const creditBundles = bundlesData.map(bundle => ({
    ...bundle,
    effectivePrice: bundle.price,
    perCreditPrice: Math.round(bundle.price / bundle.credits),
  }));

  // Fetch inspection balance
  const { data: inspectionBalance } = useQuery<{
    includedInspectionsPerMonth: number;
    usedInspectionsThisMonth: number;
    topupInspectionsBalance: number;
    remainingMonthlyAllowance: number;
    totalAvailable: number;
    preferredCurrency: string;
  }>({
    queryKey: ["/api/billing/inspection-balance"],
    enabled: !!user,
  });

  // Create checkout session
  const checkoutMutation = useMutation({
    mutationFn: async (planCode: string) => {
      console.log(`[Billing] SUBSCRIPTION CHECKOUT initiated for plan: ${planCode}, billing period: ${billingPeriod}`);
      console.log(`[Billing] Currency: ${selectedCurrency}`);
      console.log(`[Billing] Calling POST /api/billing/checkout`);
      const response = await apiRequest("POST", "/api/billing/checkout", { 
        planCode,
        billingPeriod, // Send billing period (monthly or annual)
        currency: selectedCurrency
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.error || errorData.message || "Failed to create checkout session");
      }
      
      const data = await response.json() as { url: string };
      console.log(`[Billing] SUBSCRIPTION checkout URL received:`, data.url);
      
      if (!data.url) {
        throw new Error("No checkout URL returned from server");
      }
      
      return data;
    },
    onSuccess: (data) => {
      if (data.url) {
        console.log(`[Billing] Redirecting to SUBSCRIPTION checkout...`);
        window.location.href = data.url;
      } else {
        toast({
          title: "Error",
          description: "No checkout URL received",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      console.error(`[Billing] SUBSCRIPTION checkout error:`, error);
      const errorMessage = error.message || error.error || "Failed to start checkout";
      toast({
        title: "Failed to create checkout session",
        description: errorMessage,
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
    mutationFn: async ({ bundleId, recurring }: { bundleId: string; recurring: boolean }) => {
      console.log(`[Billing] TOP-UP CHECKOUT initiated for bundle: ${bundleId}, recurring: ${recurring}`);
      console.log(`[Billing] Currency: ${selectedCurrency}`);
      console.log(`[Billing] Calling POST /api/billing/topup-checkout`);
      const response = await apiRequest("POST", "/api/billing/topup-checkout", { 
        bundleId, 
        currency: selectedCurrency,
        recurring,
      });
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

  // Cancellation mutation
  const cancelMutation = useMutation({
    mutationFn: async ({ reason, reasonText, cancelImmediately }: { reason: string; reasonText?: string; cancelImmediately?: boolean }) => {
      const response = await apiRequest("POST", "/api/billing/cancel", { reason, reasonText, cancelImmediately });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to cancel subscription");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setCancelDialogOpen(false);
      setCancellationReason("");
      setCancellationReasonText("");
      queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      
      if (data.cancelledImmediately) {
        toast({
          title: "Subscription Cancelled",
          description: "Your subscription has been cancelled immediately.",
        });
      } else {
        toast({
          title: "Cancellation Scheduled",
          description: `Your subscription will remain active until ${format(new Date(data.currentPeriodEnd), "MMMM d, yyyy")}.`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel subscription",
        variant: "destructive",
      });
    },
  });

  // Change plan mutation
  const changePlanMutation = useMutation({
    mutationFn: async ({ newPlanCode, billingInterval }: { newPlanCode: string; billingInterval: string }) => {
      const response = await apiRequest("POST", "/api/billing/change-plan", { newPlanCode, billingInterval });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to change plan");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/inspection-balance"] });
      toast({
        title: data.isUpgrade ? "Plan Upgraded" : "Plan Changed",
        description: `You are now on the ${data.newPlan.name} plan.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change plan",
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
                  : (organization?.creditsRemaining ?? 0)}
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

            <Dialog open={topupDialogOpen} onOpenChange={(open) => {
              setTopupDialogOpen(open);
              if (!open) {
                setSelectedTopupId(null);
                setRecurringTopup(false);
              }
            }}>
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
                <div className="grid gap-3 py-4">
                  {bundlesLoading ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Loading bundles...</p>
                  ) : creditBundles.length > 0 ? creditBundles.map((bundle, index) => (
                    <Card
                      key={bundle.id}
                      className={`cursor-pointer hover-elevate active-elevate-2 ${
                        selectedTopupId === bundle.id ? "border-primary" : ""
                      }`}
                      onClick={() => setSelectedTopupId(bundle.id)}
                      data-testid={`card-topup-${bundle.credits}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-lg">{bundle.credits} AI Credits</p>
                            <p className="text-sm text-muted-foreground">
                              {formatCurrency(bundle.effectivePrice)} ({formatCurrency(bundle.perCreditPrice)}/credit)
                            </p>
                          </div>
                          {bundle.isPopular && (
                            <Badge variant="default">Best Value</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No bundles available</p>
                  )}
                </div>
                
                {/* Recurring Monthly Top-Up Option */}
                <div className="flex items-center space-x-3 p-3 bg-muted/30 rounded-lg">
                  <Checkbox
                    id="recurring-topup"
                    checked={recurringTopup}
                    onCheckedChange={(checked) => setRecurringTopup(checked === true)}
                    data-testid="checkbox-recurring-topup"
                  />
                  <div className="flex-1">
                    <Label htmlFor="recurring-topup" className="cursor-pointer font-medium">
                      Set as recurring monthly top-up
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically purchase this bundle each month
                    </p>
                  </div>
                </div>
                
                <Button
                  onClick={() => {
                    if (selectedTopupId) {
                      topupMutation.mutate({ bundleId: selectedTopupId, recurring: recurringTopup });
                    }
                  }}
                  disabled={!selectedTopupId || topupMutation.isPending}
                  data-testid="button-confirm-topup"
                >
                  {topupMutation.isPending ? "Processing..." : `Purchase ${creditBundles.find(b => b.id === selectedTopupId)?.credits || ''} Credits`}
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
                {portalMutation.isPending ? "Loading..." : "Manage Payment Method"}
              </Button>
              {subscription.cancelAtPeriodEnd ? (
                <Button
                  variant="default"
                  className="flex-1"
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                  data-testid="button-reactivate-subscription"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Reactivate Subscription
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => setCancelDialogOpen(true)}
                  data-testid="button-cancel-subscription"
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel Subscription
                </Button>
              )}
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

      {/* Plan Finder - Inspection Slider with Pricing */}
      <Card data-testid="card-plan-finder">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Find Your Perfect Plan
          </CardTitle>
          <CardDescription>
            Use the slider to estimate your monthly inspection volume and see real-time pricing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Slider Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Monthly Inspections Needed</Label>
              <span className="text-3xl font-bold text-primary" data-testid="text-inspections-needed">
                {inspectionsNeeded}
              </span>
            </div>
            <Slider
              value={[inspectionsNeeded]}
              onValueChange={(value) => setInspectionsNeeded(value[0])}
              min={10}
              max={500}
              step={10}
              className="w-full"
              data-testid="slider-inspections"
            />
          </div>

          {/* Recommended Plan with Pricing */}
          {(() => {
            // Define plan tiers with monthly inspections
            const planTiers = [
              { code: 'freelancer', name: 'Freelancer', annualInspections: 120, monthlyInspections: 10 },
              { code: 'btr', name: 'BTR / Lettings', annualInspections: 600, monthlyInspections: 50 },
              { code: 'pbsa', name: 'PBSA', annualInspections: 3000, monthlyInspections: 250 },
            ];

            const monthlyNeeded = inspectionsNeeded;
            const requiresQuote = monthlyNeeded > 250;
            
            let recommendedTier = planTiers[0];
            if (monthlyNeeded > 10) recommendedTier = planTiers[1];
            if (monthlyNeeded > 50) recommendedTier = planTiers[2];

            const matchingPlan = plans?.find(p => p.code === recommendedTier.code);
            const monthlyPrice = matchingPlan ? getPlanPrice(matchingPlan, "monthly") : 0;
            const annualPrice = matchingPlan ? getPlanPrice(matchingPlan, "annual") : monthlyPrice ? monthlyPrice * 12 * 0.9 : 0;

            // Show "Request a Quote" for volumes over 250/month
            if (requiresQuote) {
              return (
                <div className="bg-gradient-to-br from-primary/5 to-primary/10 p-6 rounded-lg border border-primary/20">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground mb-1">
                        Based on <strong>{monthlyNeeded.toLocaleString()} inspections/month</strong>:
                      </p>
                      <h3 className="text-2xl font-bold text-primary">Enterprise Volume</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        For high-volume needs, we offer custom pricing tailored to your organization
                      </p>
                    </div>
                    
                    <div className="p-4 rounded-lg border-2 border-primary bg-background">
                      <p className="text-xl font-bold">Custom Pricing</p>
                      <p className="text-xs text-muted-foreground">Contact our sales team</p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <Button
                      className="w-full lg:w-auto"
                      onClick={() => {
                        window.location.href = "mailto:sales@inspect360.ai?subject=Enterprise Volume Inquiry - " + monthlyNeeded + " inspections/month";
                      }}
                      data-testid="button-request-quote"
                    >
                      Request a Quote
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div className="bg-gradient-to-br from-primary/5 to-primary/10 p-6 rounded-lg border border-primary/20">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground mb-1">
                      Based on <strong>{monthlyNeeded.toLocaleString()} inspections/month</strong>, we recommend:
                    </p>
                    <h3 className="text-2xl font-bold text-primary">{recommendedTier.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Includes {recommendedTier.monthlyInspections.toLocaleString()} inspections/month ({recommendedTier.annualInspections.toLocaleString()}/year)
                    </p>
                  </div>
                  
                  {matchingPlan && (
                    <div className="flex gap-4">
                      {/* Monthly Price */}
                      <div className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${billingPeriod === 'monthly' ? 'border-primary bg-background' : 'border-muted bg-muted/30'}`}
                           onClick={() => setBillingPeriod('monthly')}>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Monthly</p>
                        <p className="text-xl font-bold">{formatPrice(monthlyPrice)}</p>
                        <p className="text-xs text-muted-foreground">/month</p>
                      </div>
                      
                      {/* Annual Price */}
                      <div className={`p-4 rounded-lg border-2 transition-all cursor-pointer relative ${billingPeriod === 'annual' ? 'border-primary bg-background' : 'border-muted bg-muted/30'}`}
                           onClick={() => setBillingPeriod('annual')}>
                        <Badge className="absolute -top-2 -right-2 text-xs">Save 10%</Badge>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Annual</p>
                        <p className="text-xl font-bold">{formatPrice(annualPrice)}</p>
                        <p className="text-xs text-muted-foreground">/year</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Select Plan Button */}
                <div className="mt-6">
                  <Button
                    className="w-full lg:w-auto"
                    onClick={() => {
                      if (matchingPlan) {
                        checkoutMutation.mutate(matchingPlan.code);
                      }
                    }}
                    disabled={checkoutMutation.isPending || (subscription?.planSnapshotJson.planName === recommendedTier.name)}
                    data-testid="button-select-recommended-plan"
                  >
                    {subscription?.planSnapshotJson.planName === recommendedTier.name 
                      ? "Current Plan" 
                      : `Subscribe to ${recommendedTier.name}`}
                  </Button>
                </div>
              </div>
            );
          })()}

          {/* Currency Selector */}
          <div className="flex items-center gap-4">
            <Label className="text-sm">Display prices in:</Label>
            <Select value={selectedCurrency} onValueChange={(v) => setSelectedCurrency(v as "GBP" | "USD" | "AED")}>
              <SelectTrigger className="w-32" data-testid="select-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="AED">AED</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Platform Features - All-in-One */}
      <Card data-testid="card-platform-features">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            All-in-One Inspection Platform
          </CardTitle>
          <CardDescription>
            Every subscription includes full access to all platform modules and features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Inspections Module */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-semibold">Inspections</h3>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> AI-powered photo analysis</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Check-in/Check-out inspections</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Routine & maintenance inspections</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Comparison reports with AI</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Customizable templates</li>
              </ul>
            </div>

            {/* Property Management Module */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-semibold">Property Management</h3>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Block & property organization</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Tenant management</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Asset tracking & depreciation</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Room-by-room inventories</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Bulk data import (Excel)</li>
              </ul>
            </div>

            {/* Compliance Module */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-semibold">Compliance Tracking</h3>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Document expiry tracking</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Annual compliance calendar</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Automatic expiry alerts</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Certificate management</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Inspection scheduling</li>
              </ul>
            </div>

            {/* Work Orders Module */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-semibold">Work Orders</h3>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Team assignment & tracking</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Contractor notifications</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Cost tracking</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Activity logs & updates</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Priority management</li>
              </ul>
            </div>

            {/* Reporting Module */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Download className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-semibold">Reports & Analytics</h3>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Professional PDF reports</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Custom branding (white-label)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Analytics dashboard</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Activity trends</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Export to Excel</li>
              </ul>
            </div>

            {/* AI & Portals Module */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-semibold">AI & Tenant Portal</h3>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> AI chatbot assistance</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Tenant maintenance requests</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> AI fix suggestions</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Dispute cost calculator</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Mobile PWA access</li>
              </ul>
            </div>
          </div>

          {/* Bottom Note */}
          <div className="mt-8 p-4 bg-muted/50 rounded-lg text-center">
            <p className="text-sm text-muted-foreground">
              All plans include <strong>unlimited users</strong>, <strong>unlimited properties</strong>, and <strong>full platform access</strong>. 
              The only difference is the number of AI-powered inspections included per year.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* FAQ Section */}
      <Card data-testid="card-credits-faq">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            How Inspection Credits Work
          </CardTitle>
          <CardDescription>Frequently asked questions about credits</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="what-are-credits" data-testid="faq-what-are-credits">
              <AccordionTrigger className="text-left">What are Inspection Credits?</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">
                  Inspection Credits are used to perform AI-powered property inspections in Inspect360. Each time you complete an inspection, 
                  1 AI credit is automatically deducted from your account.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="credit-cost" data-testid="faq-credit-cost">
              <AccordionTrigger className="text-left">How many credits does each inspection cost?</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">
                  <strong>Every inspection costs 1 AI credit</strong>, regardless of the inspection type (Check-In, Check-Out, Routine, or Maintenance).
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="unused-credits" data-testid="faq-unused-credits">
              <AccordionTrigger className="text-left">What happens to unused credits?</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">
                  Unused credits automatically roll over to the next month, giving you an additional month to use them. 
                  After that, any remaining credits from that batch will expire. This ensures you always have flexibility 
                  while keeping your account current.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="purchase-credits" data-testid="faq-purchase-credits">
              <AccordionTrigger className="text-left">Can I purchase additional credits?</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Yes! When your subscription allowance is depleted, you can purchase add-on AI inspection bundles:
                </p>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>• <strong>100 credits:</strong> £400 (£4.00 per credit)</p>
                  <p>• <strong>250 credits:</strong> £750 (£3.00 per credit)</p>
                  <p>• <strong>500 credits:</strong> £1,000 (£2.00 per credit) - Best Value</p>
                  <p>• <strong>1000 credits:</strong> £1,500 (£1.50 per credit)</p>
                  <p className="pt-3 text-xs italic">
                    Top-up credits never expire and are consumed using FIFO (first-in, first-out) logic after your monthly credits.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="run-out" data-testid="faq-run-out">
              <AccordionTrigger className="text-left">What happens if I run out of credits?</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">
                  If you run out of credits, you won't be able to complete new inspections until you purchase a top-up pack 
                  or wait for your next monthly credit allocation. You can monitor your credit balance on this page at any time.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="upgrade-plan" data-testid="faq-upgrade-plan">
              <AccordionTrigger className="text-left">Can I upgrade or downgrade my plan?</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">
                  Yes! You can upgrade or downgrade your plan at any time through the Stripe customer portal. Changes will be 
                  prorated, and your credit allocation will adjust with your next billing cycle.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
              ledger.slice(0, 10).map((entry) => {
                const purchaserName = entry.createdByUser 
                  ? `${entry.createdByUser.firstName || ''} ${entry.createdByUser.lastName || ''}`.trim() || entry.createdByUser.email
                  : null;
                
                return (
                  <div key={entry.id} className="flex items-center justify-between py-2 border-b last:border-0" data-testid={`ledger-entry-${entry.id}`}>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{entry.notes || entry.description || `${entry.source} credits`}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{format(new Date(entry.createdAt), "MMM d, yyyy 'at' h:mm a")}</span>
                        {purchaserName && (
                          <>
                            <span>•</span>
                            <span className="font-medium">{purchaserName}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={entry.quantity < 0 ? "destructive" : "default"}>
                        {entry.quantity < 0 ? "" : "+"}{entry.quantity}
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invoices / Billing History */}
      <Card data-testid="card-invoices">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Invoices
          </CardTitle>
          <CardDescription>View and download your billing invoices</CardDescription>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading invoices...</p>
          ) : !invoicesData?.hasStripeCustomer ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No invoices yet. Subscribe to a plan to see invoices here.
            </p>
          ) : invoicesData.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No invoices available</p>
          ) : (
            <div className="space-y-3">
              {invoicesData.invoices.slice(0, 10).map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between py-2 border-b last:border-0" data-testid={`invoice-${invoice.id}`}>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{invoice.description}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{invoice.number || "Draft"}</span>
                      {invoice.date && (
                        <>
                          <span>•</span>
                          <span>{format(new Date(invoice.date), "MMM d, yyyy")}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatCurrency(invoice.amount, invoice.currency)}</p>
                      <Badge variant={invoice.status === "paid" ? "default" : invoice.status === "open" ? "secondary" : "outline"} className="text-xs">
                        {invoice.status}
                      </Badge>
                    </div>
                    {invoice.pdfUrl && (
                      <Button variant="ghost" size="icon" asChild>
                        <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" data-testid={`button-download-invoice-${invoice.id}`}>
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancellation Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Subscription</DialogTitle>
            <DialogDescription>
              We're sorry to see you go. Please let us know why you're canceling.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label>Why are you canceling?</Label>
              <RadioGroup value={cancellationReason} onValueChange={setCancellationReason}>
                {CANCELLATION_REASONS.map((reason) => (
                  <div key={reason.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={reason.value} id={reason.value} />
                    <Label htmlFor={reason.value} className="font-normal">{reason.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {cancellationReason === "other" && (
              <div className="space-y-2">
                <Label>Please tell us more</Label>
                <Textarea
                  placeholder="Your feedback helps us improve..."
                  value={cancellationReasonText}
                  onChange={(e) => setCancellationReasonText(e.target.value)}
                  className="min-h-20"
                  data-testid="textarea-cancellation-reason"
                />
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Switch
                id="cancel-immediately"
                checked={cancelImmediately}
                onCheckedChange={setCancelImmediately}
              />
              <Label htmlFor="cancel-immediately" className="text-sm">
                Cancel immediately (lose remaining access)
              </Label>
            </div>

            {!cancelImmediately && subscription && (
              <div className="bg-muted p-3 rounded-md">
                <p className="text-xs text-muted-foreground">
                  Your subscription will remain active until <strong>{format(new Date(subscription.currentPeriodEnd), "MMMM d, yyyy")}</strong>.
                  You can continue using all features until then.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Keep Subscription
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate({ reason: cancellationReason, reasonText: cancellationReasonText, cancelImmediately })}
              disabled={!cancellationReason || cancelMutation.isPending}
              data-testid="button-confirm-cancel"
            >
              {cancelMutation.isPending ? "Canceling..." : "Confirm Cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
