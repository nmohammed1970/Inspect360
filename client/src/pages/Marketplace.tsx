import { useQuery, useMutation } from "@tanstack/react-query";
import {
    Plus,
    Check,
    ShieldCheck,
    Users,
    Wrench,
    Sparkles,
    Layout,
    Clock,
    Target,
    Calendar,
    Video,
    Package,
    ArrowRight
} from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";

interface MarketplaceModule {
    id: string;
    name: string;
    moduleKey: string;
    description: string;
    iconName: string;
    isEnabled: boolean;
    enabledDate?: string;
    monthlyPrice?: number;
    annualPrice?: number;
    currency?: string;
    currentUsage?: number;
}

interface MarketplaceBundle {
    id: string;
    name: string;
    description: string;
    isEnabled: boolean;
    monthlyPrice: number;
    annualPrice: number;
    currency: string;
    modules: string[];
}

interface MarketplaceResponse {
    modules: MarketplaceModule[];
    bundles: MarketplaceBundle[];
    billingCycle: "monthly" | "annual";
    currency: string;
}

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
};

export default function Marketplace() {
    const { toast } = useToast();
    const [selectedModule, setSelectedModule] = useState<MarketplaceModule | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [agreeToTerms, setAgreeToTerms] = useState(false);

    const { data: marketplaceData, isLoading } = useQuery<MarketplaceResponse>({
        queryKey: ["/api/marketplace/modules"],
    });

    const purchaseMutation = useMutation({
        mutationFn: async ({ moduleId }: { moduleId: string }) => {
            const res = await apiRequest("POST", `/api/marketplace/modules/${moduleId}/purchase`, {
                billingCycle: marketplaceData?.billingCycle || "monthly"
            });
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
                description: error.message,
                variant: "destructive",
            });
        }
    });

    const purchaseBundleMutation = useMutation({
        mutationFn: async ({ bundleId }: { bundleId: string }) => {
            const res = await apiRequest("POST", `/api/marketplace/bundles/${bundleId}/purchase`, {
                billingCycle: marketplaceData?.billingCycle || "monthly"
            });
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
                description: error.message,
                variant: "destructive",
            });
        }
    });

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get("session_id");
        const paymentStatus = params.get("payment");

        if (paymentStatus === "success") {
            // Clear URL parameters
            window.history.replaceState({}, '', window.location.pathname);

            if (sessionId) {
                const processSession = async () => {
                    try {
                        await apiRequest("POST", "/api/billing/process-session", { sessionId });
                        toast({
                            title: "Module Unlocked!",
                            description: "Your premium module has been successfully activated.",
                        });
                        queryClient.invalidateQueries({ queryKey: ["/api/marketplace/modules"] });
                    } catch (e: any) {
                        toast({
                            title: "Activation Error",
                            description: e.message || "Failed to activate module. Please contact support.",
                            variant: "destructive"
                        });
                    }
                };
                processSession();
            } else {
                toast({
                    title: "Success",
                    description: "Module unlocked successfully.",
                });
                queryClient.invalidateQueries({ queryKey: ["/api/marketplace/modules"] });
            }
        } else if (paymentStatus === "cancelled") {
            window.history.replaceState({}, '', window.location.pathname);
            toast({
                title: "Payment Cancelled",
                description: "The module purchase was not completed.",
                variant: "destructive"
            });
        }
    }, [toast]);

    const toggleMutation = useMutation({
        mutationFn: async ({ moduleId, enable }: { moduleId: string; enable: boolean }) => {
            const res = await apiRequest("POST", `/api/marketplace/modules/${moduleId}/toggle`, { enable });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/marketplace/modules"] });
            queryClient.invalidateQueries({ queryKey: ["/api/marketplace/my-modules"] });
            toast({
                title: "Success",
                description: `Module ${selectedModule?.isEnabled ? "disabled" : "enabled"} successfully.`,
            });
            setIsConfirmOpen(false);
            setSelectedModule(null);
            setAgreeToTerms(false);
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        }
    });

    const activeModules = marketplaceData?.modules.filter(m => m.isEnabled) || [];
    const availableModules = marketplaceData?.modules.filter(m => !m.isEnabled) || [];

    const getIcon = (moduleKey: string) => {
        switch (moduleKey) {
            case 'white_label': return <Layout className="h-6 w-6" />;
            case 'tenant_portal': return <Users className="h-6 w-6" />;
            case 'maintenance': return <Wrench className="h-6 w-6" />;
            case 'ai_preventative':
            case 'ai_maintenance': return <Sparkles className="h-6 w-6" />;
            case 'dispute_resolution':
            case 'dispute_portal': return <ShieldCheck className="h-6 w-6" />;
            default: return <Plus className="h-6 w-6" />;
        }
    };

    if (isLoading) {
        return (
            <div className="container mx-auto p-4 md:p-6 space-y-8">
                <div className="h-40 w-full skeleton rounded-3xl mb-8"></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-72 skeleton rounded-2xl"></div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-8 mb-24">
            {/* Header Section */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">
                            App Marketplace
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Powerful modules to <span className="text-primary font-semibold">elevate your property business</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href="/billing">
                            <Button variant="outline" size="sm">
                                <Package className="h-4 w-4 mr-2" />
                                My Plan
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Active Modules Section */}
            {activeModules.length > 0 && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between border-b pb-4">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                <ShieldCheck className="h-5 w-5" />
                            </div>
                            <h2 className="text-xl font-bold">Active Extensions</h2>
                        </div>
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                            {activeModules.length} Active
                        </Badge>
                    </div>

                    <motion.div
                        variants={container}
                        initial="hidden"
                        animate="show"
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    >
                        {activeModules.map((module) => (
                            <motion.div variants={item} key={module.id}>
                                <Card className="hover-elevate-2 transition-smooth h-full border-primary/10">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-primary/40"></div>
                                    <CardHeader className="pt-8">
                                        <div className="flex items-start justify-between">
                                            <div className="h-12 w-12 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                                                {getIcon(module.moduleKey)}
                                            </div>
                                            <Badge variant="secondary" className="px-2 py-0 h-6 text-[10px] font-bold uppercase tracking-wider">
                                                Active
                                            </Badge>
                                        </div>
                                        <CardTitle className="text-lg mt-4">{module.name}</CardTitle>
                                        <CardDescription className="mt-2 text-sm line-clamp-2 min-h-[2.5rem]">
                                            {module.description}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg">
                                            <Clock className="h-3 w-3" />
                                            <span>Enabled on {new Date(module.enabledDate || '').toLocaleDateString()}</span>
                                        </div>
                                    </CardContent>
                                    <CardFooter className="flex flex-col gap-4">
                                        {module.currentUsage !== undefined && (
                                            <div className="w-full text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg border border-dashed">
                                                Currently using: <span className="font-bold text-foreground">{module.currentUsage}</span> {module.moduleKey === 'tenant_portal' ? 'tenants' : 'units'}
                                            </div>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                                            onClick={() => {
                                                setSelectedModule(module);
                                                toggleMutation.mutate({ moduleId: module.id, enable: false });
                                            }}
                                            disabled={toggleMutation.isPending}
                                        >
                                            Deactivate Module
                                        </Button>
                                    </CardFooter>
                                </Card>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            )}

            {/* Available Modules Section */}
            <div className="space-y-6">
                <div className="flex items-center justify-between border-b pb-4">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                            <Plus className="h-5 w-5" />
                        </div>
                        <h2 className="text-xl font-bold">Available to Unlock</h2>
                    </div>
                </div>

                <motion.div
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                    {availableModules.map((module) => {
                        const price = marketplaceData?.billingCycle === "annual" ? module.annualPrice : module.monthlyPrice;
                        const currencySymbol = module.currency === "GBP" ? "£" : module.currency === "USD" ? "$" : module.currency || "£";
                        const displayPrice = (price || 0) / 100;

                        return (
                            <motion.div variants={item} key={module.id}>
                                <Card className="hover-elevate-2 transition-smooth h-full grayscale-[0.5] hover:grayscale-0 relative overflow-hidden group">
                                    <CardHeader className="pt-8">
                                        <div className="flex items-center justify-between">
                                            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                                {getIcon(module.moduleKey)}
                                            </div>
                                            <div className="text-right">
                                                <div className="text-lg font-bold text-foreground">
                                                    {currencySymbol}{displayPrice.toLocaleString()}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground uppercase font-black">
                                                    Per {marketplaceData?.billingCycle === "annual" ? "Year" : "Month"}
                                                </div>
                                            </div>
                                        </div>
                                        <CardTitle className="text-lg mt-4">{module.name}</CardTitle>
                                        <CardDescription className="mt-2 text-sm line-clamp-3 min-h-[3.75rem]">
                                            {module.description}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardFooter>
                                        <Button
                                            className="w-full bg-primary hover:bg-primary/90 text-white shadow-sm font-bold h-11"
                                            onClick={() => {
                                                setSelectedModule(module);
                                                setIsConfirmOpen(true);
                                            }}
                                        >
                                            Unlock Module
                                        </Button>
                                    </CardFooter>
                                </Card>
                            </motion.div>
                        );
                    })}
                </motion.div>
            </div>

            {/* Bundles Section */}
            {marketplaceData?.bundles && marketplaceData.bundles.length > 0 && (
                <div className="space-y-6 pt-12 border-t">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <h2 className="text-xl font-bold">Premium Saving Bundles</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {marketplaceData.bundles.map((bundle) => {
                            const price = marketplaceData.billingCycle === "annual" ? bundle.annualPrice : bundle.monthlyPrice;
                            const currencySymbol = bundle.currency === "GBP" ? "£" : "$";
                            const displayPrice = price / 100;

                            return (
                                <Card key={bundle.id} className="bg-emerald-500/5 border-emerald-500/20 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 flex flex-col gap-2">
                                        {bundle.isEnabled ? (
                                            <Badge className="bg-primary text-white border-none font-bold">Active</Badge>
                                        ) : (
                                            <Badge className="bg-emerald-500 text-white border-none font-bold">Recommended</Badge>
                                        )}
                                    </div>
                                    <CardHeader>
                                        <CardTitle>{bundle.name}</CardTitle>
                                        <CardDescription>{bundle.description}</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            {bundle.modules.map(modId => {
                                                const mod = marketplaceData.modules.find(m => m.id === modId);
                                                return (
                                                    <div key={modId} className="flex items-center gap-2 text-sm">
                                                        <Check className="h-4 w-4 text-emerald-500" />
                                                        <span>{mod?.name}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </CardContent>
                                    <CardFooter className="flex items-center justify-between border-t border-emerald-500/10 pt-6">
                                        <div>
                                            <div className="text-2xl font-black text-foreground">{currencySymbol}{displayPrice.toLocaleString()}</div>
                                            <div className="text-[10px] text-muted-foreground uppercase font-black">
                                                Total Per {marketplaceData.billingCycle === "annual" ? "Year" : "Month"}
                                            </div>
                                        </div>
                                        <Button 
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 px-6"
                                            onClick={() => {
                                                purchaseBundleMutation.mutate({ bundleId: bundle.id });
                                            }}
                                            disabled={purchaseBundleMutation.isPending || bundle.isEnabled}
                                        >
                                            {bundle.isEnabled ? "Active" : purchaseBundleMutation.isPending ? "Processing..." : "Unlock Bundle"}
                                        </Button>
                                    </CardFooter>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Confirmation Dialog */}
            <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <DialogContent className="sm:max-w-md rounded-3xl border-none shadow-2xl">
                    <DialogHeader>
                        <div className="mx-auto h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                            <Sparkles className="h-10 w-10 text-primary" />
                        </div>
                        <DialogTitle className="text-center text-2xl font-black">Unlock {selectedModule?.name}?</DialogTitle>
                        <DialogDescription className="text-center text-base pt-2">
                            This module will be added to your current {marketplaceData?.billingCycle} subscription on a <span className="text-primary font-bold">pro-rata basis</span>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-8">
                        <div className="p-4 bg-muted/50 rounded-2xl space-y-3">
                            <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                <ArrowRight className="h-4 w-4" /> Feature Highlights
                            </h4>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm">
                                    <Check className="h-4 w-4 text-primary" />
                                    <span>Full platform integration</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <Check className="h-4 w-4 text-primary" />
                                    <span>Unlimited team access</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20 space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium">Module Cost:</span>
                                <span className="text-lg font-black text-primary">
                                    {selectedModule?.currency === "GBP" ? "£" : "$"}{((marketplaceData?.billingCycle === "annual" ? selectedModule?.annualPrice : selectedModule?.monthlyPrice) || 0) / 100}
                                </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground text-center italic">
                                *Pro-rata adjustment will be calculated during Stripe Checkout based on remaining days in your billing cycle.
                            </p>
                        </div>

                        <div className="flex items-center space-x-3 p-3 bg-muted/30 rounded-2xl border border-dashed border-muted">
                            <Checkbox
                                id="terms"
                                checked={agreeToTerms}
                                onCheckedChange={(checked) => setAgreeToTerms(checked === true)}
                                className="rounded-md border-primary"
                            />
                            <label htmlFor="terms" className="text-sm font-medium leading-none cursor-pointer">
                                I agree to the module terms and billing conditions.
                            </label>
                        </div>
                    </div>

                    <DialogFooter className="flex-col sm:flex-col gap-3">
                        <Button
                            className="w-full h-12 rounded-xl text-lg font-bold bg-primary hover:bg-primary/90 text-white shadow-lg disabled:opacity-50 transition-all"
                            disabled={!agreeToTerms || purchaseMutation.isPending}
                            onClick={() => {
                                if (selectedModule) {
                                    purchaseMutation.mutate({ moduleId: selectedModule.id });
                                }
                            }}
                        >
                            {purchaseMutation.isPending ? "Connecting Stripe..." : (
                                <span className="flex items-center justify-center gap-2">
                                    <Check className="h-5 w-5" /> Confirm & Pay
                                </span>
                            )}
                        </Button>
                        <Button
                            variant="ghost"
                            className="w-full h-12 rounded-xl text-muted-foreground"
                            onClick={() => setIsConfirmOpen(false)}
                        >
                            Cancel
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
