import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Building2,
  Search,
  CreditCard,
  Package,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  History,
  Sparkles,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type CreditBalance = {
  total: number;
  current: number;
  rolled: number;
  expiresOn?: string | null;
};

type InstanceRow = {
  id: string;
  name: string;
  brandingName?: string | null;
  isActive?: boolean;
  preferredCurrency?: string;
  updatedAt?: string;
  createdAt?: string;
  owner?: { id?: string; email?: string; firstName?: string; lastName?: string };
  creditBalance?: CreditBalance;
  enabledModuleCount?: number;
};

function looksLikeEmail(value?: string | null): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isRealCompanyName(value?: string | null): boolean {
  const v = value?.trim();
  return !!v && !looksLikeEmail(v);
}

/** Prefer branding/company name; if none, fall back to owner email. */
function getOrganizationLabel(instance: InstanceRow): string {
  if (isRealCompanyName(instance.brandingName)) return instance.brandingName!.trim();
  if (isRealCompanyName(instance.name)) return instance.name.trim();
  return instance.owner?.email?.trim() || instance.brandingName?.trim() || instance.name?.trim() || "Unnamed";
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInstance, setSelectedInstance] = useState<InstanceRow | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("credits");

  const [creditsTarget, setCreditsTarget] = useState("");
  const [creditsDelta, setCreditsDelta] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [confirmDisableModuleId, setConfirmDisableModuleId] = useState<string | null>(null);

  const {
    data: instances = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<InstanceRow[]>({
    queryKey: ["/api/admin/instances"],
    retry: false,
    refetchInterval: manageOpen ? 30000 : false,
  });

  const {
    data: allModules = [],
    isLoading: modulesLoading,
    error: modulesError,
  } = useQuery<any[]>({
    queryKey: ["/api/admin/modules"],
    queryFn: async () => {
      const response = await fetch("/api/admin/modules", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load modules catalogue");
      return response.json();
    },
    enabled: manageOpen,
    retry: false,
  });

  const {
    data: ledger = [],
    isLoading: ledgerLoading,
    refetch: refetchLedger,
  } = useQuery<any[]>({
    queryKey: ["/api/admin/instances", selectedInstance?.id, "credits-ledger"],
    queryFn: async () => {
      if (!selectedInstance?.id) return [];
      const res = await apiRequest("GET", `/api/admin/instances/${selectedInstance.id}/credits/ledger?limit=40`);
      return res.json();
    },
    enabled: manageOpen && !!selectedInstance?.id && activeTab === "credits",
    refetchInterval: manageOpen ? 30000 : false,
  });

  const filteredInstances = useMemo(() => {
    // Hide orphan orgs with no owner account (e.g. leftover Acme Property test rows)
    const withOwner = instances.filter((instance) => !!instance.owner?.id || !!instance.owner?.email);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return withOwner;
    return withOwner.filter(
      (instance) =>
        getOrganizationLabel(instance).toLowerCase().includes(q) ||
        instance.name?.toLowerCase().includes(q) ||
        instance.brandingName?.toLowerCase().includes(q) ||
        instance.owner?.email?.toLowerCase().includes(q) ||
        instance.owner?.firstName?.toLowerCase().includes(q) ||
        instance.owner?.lastName?.toLowerCase().includes(q)
    );
  }, [instances, searchQuery]);

  const liveBalance = selectedInstance
    ? instances.find((i) => i.id === selectedInstance.id)?.creditBalance ?? selectedInstance.creditBalance
    : undefined;

  const openManage = async (instance: InstanceRow) => {
    setSelectedInstance(instance);
    setCreditsTarget(String(instance.creditBalance?.total ?? 0));
    setCreditsDelta("");
    setCreditReason("");
    setActiveTab("credits");
    setConfirmDisableModuleId(null);

    let enabledIds: string[] = [];
    try {
      const modulesResponse = await fetch(`/api/admin/instances/${instance.id}/modules`, {
        credentials: "include",
      });
      if (modulesResponse.ok) {
        const modulesData = await modulesResponse.json();
        enabledIds = (modulesData || [])
          .filter((im: any) => im.isEnabled)
          .map((im: any) => im.moduleId);
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Could not load modules",
        description: "Opened with empty module selection. Refresh and try again if needed.",
      });
    }
    setEnabledModules(enabledIds);
    setManageOpen(true);
  };

  useEffect(() => {
    if (!manageOpen || !selectedInstance) return;
    const refreshed = instances.find((i) => i.id === selectedInstance.id);
    if (refreshed && refreshed.creditBalance) {
      setSelectedInstance((prev) =>
        prev && prev.id === refreshed.id
          ? { ...prev, creditBalance: refreshed.creditBalance, enabledModuleCount: refreshed.enabledModuleCount }
          : prev
      );
    }
  }, [instances, manageOpen, selectedInstance?.id]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/instances"] });
    queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
    queryClient.invalidateQueries({ queryKey: ["/api/billing/inspection-balance"] });
    queryClient.invalidateQueries({ queryKey: ["/api/marketplace/my-modules"] });
    if (selectedInstance?.id) {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/instances", selectedInstance.id, "credits-ledger"],
      });
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (!selectedInstance) throw new Error("No instance selected");
      const response = await fetch(`/api/admin/instances/${selectedInstance.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message || "Failed to update instance");
      }
      return body;
    },
    onSuccess: (body) => {
      invalidateAll();
      if (body?.creditBalance && selectedInstance) {
        setSelectedInstance({ ...selectedInstance, creditBalance: body.creditBalance });
        setCreditsTarget(String(body.creditBalance.total ?? 0));
      }
      setCreditsDelta("");
      setCreditReason("");
      setConfirmDisableModuleId(null);
      toast({
        title: "Saved",
        description: "Instance updated. Operator Modules page will reflect these changes.",
      });
      refetchLedger();
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: err.message || "Could not save changes",
      });
    },
  });

  const grantMutation = useMutation({
    mutationFn: async ({ quantity, reason }: { quantity: number; reason: string }) => {
      if (!selectedInstance) throw new Error("No instance selected");
      const res = await apiRequest("POST", "/api/admin/credits/grant", {
        organizationId: selectedInstance.id,
        quantity,
        reason,
      });
      return res.json();
    },
    onSuccess: (body) => {
      invalidateAll();
      if (body?.creditBalance) {
        setCreditsTarget(String(body.creditBalance.total ?? 0));
      }
      setCreditsDelta("");
      setCreditReason("");
      toast({ title: "Credits granted", description: `Granted ${body.granted} credits.` });
      refetchLedger();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Grant failed", description: err.message });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/instances/${id}/toggle-status`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Failed to toggle status");
      }
      return response.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Status updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Status update failed", description: err.message });
    },
  });

  const saveCreditsAbsolute = () => {
    const target = Number(creditsTarget);
    if (!Number.isFinite(target) || target < 0) {
      toast({ variant: "destructive", title: "Invalid credits", description: "Enter a non-negative number." });
      return;
    }
    if (!creditReason.trim()) {
      toast({ variant: "destructive", title: "Reason required", description: "Add a short note for the credit change." });
      return;
    }
    updateMutation.mutate({
      credits: target,
      creditReason: creditReason.trim(),
      isActive: selectedInstance?.isActive !== false,
      enabledModules,
    });
  };

  const applyDelta = () => {
    const delta = Number(creditsDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      toast({ variant: "destructive", title: "Invalid amount", description: "Enter a non-zero credit amount." });
      return;
    }
    if (!creditReason.trim()) {
      toast({ variant: "destructive", title: "Reason required", description: "Add a short note for the credit change." });
      return;
    }
    const current = liveBalance?.total ?? 0;
    if (delta > 0) {
      grantMutation.mutate({ quantity: delta, reason: creditReason.trim() });
      return;
    }
    const target = Math.max(0, current + delta);
    updateMutation.mutate({
      credits: target,
      creditReason: creditReason.trim(),
      isActive: selectedInstance?.isActive !== false,
      enabledModules,
    });
  };

  const saveModules = () => {
    updateMutation.mutate({
      enabledModules,
      isActive: selectedInstance?.isActive !== false,
    });
  };

  const toggleModule = (moduleId: string, enable: boolean) => {
    if (!enable) {
      setConfirmDisableModuleId(moduleId);
      return;
    }
    setEnabledModules((prev) => (prev.includes(moduleId) ? prev : [...prev, moduleId]));
  };

  const confirmDisable = () => {
    if (!confirmDisableModuleId) return;
    setEnabledModules((prev) => prev.filter((id) => id !== confirmDisableModuleId));
    setConfirmDisableModuleId(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading instances…</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load instances</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
            <span>{(error as Error)?.message || "Something went wrong."}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Instances
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Assign credits and modules per organization. Operators can view status but cannot purchase or self-enable.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Find an organization</CardTitle>
          <CardDescription>Search by company name, owner name, or email</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search instances…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-instances"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {filteredInstances.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground space-y-2">
              <Sparkles className="h-8 w-8 mx-auto opacity-40" />
              <p>No instances match your search.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Organization</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead className="text-right">Modules on</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInstances.map((instance) => {
                  const ownerName = [instance.owner?.firstName, instance.owner?.lastName]
                    .filter(Boolean)
                    .join(" ");
                  const active = instance.isActive !== false;
                  return (
                    <TableRow key={instance.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{getOrganizationLabel(instance)}</TableCell>
                      <TableCell>
                        <div className="text-sm">{ownerName || "—"}</div>
                        <div className="text-xs text-muted-foreground">{instance.owner?.email || ""}</div>
                      </TableCell>
                      <TableCell>
                        {active ? (
                          <Badge className="bg-emerald-600/15 text-emerald-700 hover:bg-emerald-600/15 border-0">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-muted-foreground">
                            <XCircle className="h-3 w-3 mr-1" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {instance.creditBalance?.total ?? 0}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {instance.enabledModuleCount ?? 0}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" onClick={() => openManage(instance)} data-testid={`manage-instance-${instance.id}`}>
                          Manage
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={toggleStatusMutation.isPending}
                          onClick={() => toggleStatusMutation.mutate(instance.id)}
                        >
                          {active ? "Disable" : "Enable"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {selectedInstance?.name || "Instance"}
            </DialogTitle>
            <DialogDescription>
              Manage credits and modules for this organization. Changes apply immediately for operators.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Live credits</div>
              <div className="text-2xl font-semibold tabular-nums">{liveBalance?.total ?? 0}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Current batch</div>
              <div className="text-2xl font-semibold tabular-nums">{liveBalance?.current ?? 0}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Modules on</div>
              <div className="text-2xl font-semibold tabular-nums">{enabledModules.length}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Expires</div>
              <div className="text-sm font-medium mt-1">
                {liveBalance?.expiresOn
                  ? format(new Date(liveBalance.expiresOn), "dd MMM yyyy")
                  : "No expiry"}
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="credits" className="gap-1">
                <CreditCard className="h-3.5 w-3.5" />
                Credits
              </TabsTrigger>
              <TabsTrigger value="modules" className="gap-1">
                <Package className="h-3.5 w-3.5" />
                Modules
              </TabsTrigger>
            </TabsList>

            <TabsContent value="credits" className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="credit-reason">Reason (required for changes)</Label>
                <Textarea
                  id="credit-reason"
                  placeholder="e.g. Pilot allocation for March, goodwill top-up…"
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border p-4 space-y-3">
                  <div className="font-medium text-sm">Set absolute total</div>
                  <Input
                    type="number"
                    min={0}
                    value={creditsTarget}
                    onChange={(e) => setCreditsTarget(e.target.value)}
                    data-testid="input-credits-target"
                  />
                  <Button
                    className="w-full"
                    onClick={saveCreditsAbsolute}
                    disabled={updateMutation.isPending || grantMutation.isPending}
                  >
                    {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Set credits to this total
                  </Button>
                </div>
                <div className="rounded-xl border p-4 space-y-3">
                  <div className="font-medium text-sm">Add or remove (delta)</div>
                  <Input
                    type="number"
                    placeholder="e.g. 50 or -20"
                    value={creditsDelta}
                    onChange={(e) => setCreditsDelta(e.target.value)}
                    data-testid="input-credits-delta"
                  />
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={applyDelta}
                    disabled={updateMutation.isPending || grantMutation.isPending}
                  >
                    {grantMutation.isPending || updateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Apply delta
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <History className="h-4 w-4" />
                    Recent ledger
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => refetchLedger()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {ledgerLoading ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading ledger…
                  </div>
                ) : ledger.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">No ledger entries yet.</div>
                ) : (
                  <div className="max-h-56 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>When</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ledger.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {entry.createdAt
                                ? format(new Date(entry.createdAt), "dd MMM yyyy HH:mm")
                                : "—"}
                            </TableCell>
                            <TableCell className="text-xs">{entry.source}</TableCell>
                            <TableCell
                              className={`text-right tabular-nums font-medium ${
                                entry.quantity >= 0 ? "text-emerald-600" : "text-destructive"
                              }`}
                            >
                              {entry.quantity >= 0 ? `+${entry.quantity}` : entry.quantity}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                              {entry.notes || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="modules" className="space-y-4 pt-2">
              {modulesError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Modules catalogue unavailable</AlertTitle>
                  <AlertDescription>Could not load marketplace modules. Try closing and reopening.</AlertDescription>
                </Alert>
              ) : modulesLoading ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Loading modules…
                </div>
              ) : allModules.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  No modules in catalogue. Add modules under Eco Admin → Modules first.
                </div>
              ) : (
                <div className="space-y-2">
                  {allModules.map((mod: any) => {
                    const on = enabledModules.includes(mod.id);
                    return (
                      <div
                        key={mod.id}
                        className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{mod.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {mod.moduleKey}
                            {mod.description ? ` · ${mod.description}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge variant={on ? "default" : "secondary"}>{on ? "On" : "Off"}</Badge>
                          <Switch
                            checked={on}
                            onCheckedChange={(checked) => toggleModule(mod.id, checked)}
                            data-testid={`switch-module-${mod.moduleKey || mod.id}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {confirmDisableModuleId && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Disable this module?</AlertTitle>
                  <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>Operators will lose access until you enable it again.</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setConfirmDisableModuleId(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" variant="destructive" onClick={confirmDisable}>
                        Disable
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <Button
                className="w-full"
                onClick={saveModules}
                disabled={updateMutation.isPending || !!confirmDisableModuleId}
              >
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save module access
              </Button>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
