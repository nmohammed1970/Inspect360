import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useModules } from "@/hooks/use-modules";
import {
  CreditCard,
  Package,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Lock,
  Shield,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const CONTACT_ADMIN = "Please contact admin to activate this module.";
const CONTACT_ADMIN_CREDITS = "Contact your administrator if you need more credits.";

type ModuleRow = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  iconName?: string | null;
  enabled: boolean;
  enabledDate?: string;
};

export default function Billing() {
  const { allModules, myModules, isLoading: modulesLoading, isModuleEnabled } = useModules();

  const {
    data: balance,
    isLoading: balanceLoading,
    isError: balanceError,
    isFetching: balanceFetching,
  } = useQuery<any>({
    queryKey: ["/api/billing/inspection-balance"],
    retry: false,
  });

  const isLoading = modulesLoading || balanceLoading;

  const creditsTotal =
    balance?.total ??
    balance?.creditBalance?.total ??
    balance?.totalCredits ??
    balance?.creditsRemaining ??
    balance?.balance ??
    0;
  const creditsLow = Number(creditsTotal) > 0 && Number(creditsTotal) < 10;
  const creditsEmpty = Number(creditsTotal) < 1;

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
    [allModules, myModules, isModuleEnabled]
  );

  const activeModules = moduleRows.filter((m) => m.enabled);
  const inactiveModules = moduleRows.filter((m) => !m.enabled);

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6 flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading modules…</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Page header — matches Inspections / Properties */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold" data-testid="text-page-title">
              Modules
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Your inspection credits and module access for this organization
            </p>
          </div>
          {balanceFetching && !balanceLoading && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating…
            </span>
          )}
        </div>

        {/* Admin-managed notice — Dashboard-style banner card */}
        <Card className="border-primary/30 bg-primary/5" data-testid="banner-admin-managed">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">Admin-managed access</p>
              <p className="text-sm text-muted-foreground">
                Credits and modules are assigned by your Inspect360 administrator. Contact them to
                change your balance or unlock features.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Low / empty credits — same pattern as Dashboard */}
        {(creditsLow || creditsEmpty) && (
          <Card
            className={cn(
              creditsEmpty
                ? "border-destructive/50 bg-destructive/5"
                : "border-yellow-500/50 bg-yellow-500/5"
            )}
            data-testid="banner-credits-warning"
          >
            <CardContent className="flex items-center gap-3 p-4">
              <div
                className={cn(
                  "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
                  creditsEmpty ? "bg-destructive/10" : "bg-yellow-500/10"
                )}
              >
                <CreditCard
                  className={cn(
                    "w-5 h-5",
                    creditsEmpty ? "text-destructive" : "text-yellow-600 dark:text-yellow-400"
                  )}
                />
              </div>
              <div>
                <p
                  className={cn(
                    "font-semibold",
                    creditsEmpty
                      ? "text-destructive"
                      : "text-yellow-700 dark:text-yellow-400"
                  )}
                >
                  {creditsEmpty ? "No credits remaining" : "Credits running low"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {creditsEmpty
                    ? "New inspections are blocked until an administrator assigns more credits."
                    : `${creditsTotal} credits left — ask your admin for a top-up if you need more.`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI row — Dashboard style */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4" data-testid="panel-plan-kpis">
          <Tooltip>
            <TooltipTrigger asChild>
              <Card data-testid="kpi-credits" className="cursor-default">
                <CardContent className="p-4 md:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <CreditCard className="h-4 w-4 text-primary" />
                    </div>
                    {balanceError ? (
                      <Badge variant="destructive" className="text-[10px]">
                        Error
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        Live
                      </Badge>
                    )}
                  </div>
                  <p className="text-2xl md:text-3xl font-bold tabular-nums">{creditsTotal}</p>
                  <p className="text-xs text-muted-foreground mt-1">Credits available</p>
                  {balanceError && (
                    <p className="mt-3 pt-3 border-t text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Could not refresh balance
                    </p>
                  )}
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              {CONTACT_ADMIN_CREDITS}
            </TooltipContent>
          </Tooltip>

          <Card data-testid="kpi-modules">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {activeModules.length}/{moduleRows.length}
                </Badge>
              </div>
              <p className="text-2xl md:text-3xl font-bold tabular-nums">{activeModules.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Active modules</p>
            </CardContent>
          </Card>
        </div>

        {/* Modules section */}
        <Card data-testid="panel-modules">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base md:text-lg flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  Modules
                </CardTitle>
                <CardDescription className="mt-1">
                  Features available in your workspace. Inactive modules stay locked until an admin enables them.
                </CardDescription>
              </div>
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
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                        Active
                      </h2>
                      <Badge className="bg-primary/15 text-primary hover:bg-primary/15 border-0">
                        {activeModules.length}
                      </Badge>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {activeModules.map((mod) => (
                        <ModuleCard key={mod.id} mod={mod} />
                      ))}
                    </div>
                  </section>
                )}

                {inactiveModules.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                        Inactive
                      </h2>
                      <Badge variant="secondary">{inactiveModules.length}</Badge>
                    </div>
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
        "h-full rounded-lg border p-4 transition-colors",
        mod.enabled
          ? "bg-card border-border hover:border-primary/40"
          : "bg-muted/30 border-dashed border-border/80 cursor-default opacity-90"
      )}
      data-testid={`module-row-${mod.key}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
            mod.enabled ? "bg-primary/10" : "bg-muted"
          )}
        >
          {mod.enabled ? (
            <CheckCircle2 className="h-5 w-5 text-primary" />
          ) : (
            <Lock className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm md:text-base leading-snug">{mod.name}</p>
            <Badge
              variant={mod.enabled ? "default" : "secondary"}
              className={cn(
                "shrink-0 text-[10px]",
                mod.enabled && "bg-primary hover:bg-primary"
              )}
            >
              {mod.enabled ? "Active" : "Inactive"}
            </Badge>
          </div>
          {mod.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{mod.description}</p>
          )}
          {mod.enabled && mod.enabledDate && (
            <p className="text-xs text-muted-foreground pt-1">
              Enabled {format(new Date(mod.enabledDate), "dd MMM yyyy")}
            </p>
          )}
          {!mod.enabled && (
            <p className="text-xs text-muted-foreground pt-1 italic">
              {CONTACT_ADMIN}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
