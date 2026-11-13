import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Loader2,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Lock,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { pagePad } from "@/lib/responsive";

type PriceVersion = {
  id: string;
  label: string;
  status: string;
  publishedAt?: string | null;
};

type PlanPrice = {
  id: string;
  planCode: string;
  cycle: string;
  amountMinor: number;
};

type PlanMeta = {
  code: string;
  name: string;
  tab: string;
  enabled: boolean;
  enquireOnly?: boolean;
  description?: string | null;
  sortOrder?: number;
};

type AdminCatalog = {
  versions: PriceVersion[];
  published: PriceVersion | null;
  plans: PlanMeta[];
  catalog: {
    prices: PlanPrice[];
    plans: PlanMeta[];
  } | null;
  config: Record<string, string>;
  selectedVersionId?: string;
};

/** Catalog seed rule: yearly = monthly × 10 (2 months free), except PAYG. */
const YEARLY_FROM_MONTHLY = 10;

function minorToPounds(minor: number) {
  return (minor / 100).toFixed(2);
}

function poundsToMinor(pounds: string) {
  const n = Number(pounds);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function formatGbp(minor: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(minor / 100);
}

function tabLabel(tab: string) {
  if (tab === "property_management") return "Property Management";
  if (tab === "ai_inspections") return "AI Inspections";
  return tab;
}

export default function AdminBillingPricing() {
  const { toast } = useToast();
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, string>>({});
  /** Monthly £ edits keyed by planCode */
  const [monthlyEdits, setMonthlyEdits] = useState<Record<string, string>>({});
  const [savingPlan, setSavingPlan] = useState<string | null>(null);
  const [validation, setValidation] = useState<{ ok: boolean; issues: string[] } | null>(null);
  const [ensuringDraft, setEnsuringDraft] = useState(false);
  const [planTab, setPlanTab] = useState<"property_management" | "ai_inspections">(
    "property_management",
  );

  const { data, isLoading, refetch, isFetching } = useQuery<AdminCatalog>({
    queryKey: ["/api/admin/billing/catalog", selectedVersionId],
    queryFn: async () => {
      const qs = selectedVersionId ? `?versionId=${encodeURIComponent(selectedVersionId)}` : "";
      return (await apiRequest("GET", `/api/admin/billing/catalog${qs}`)).json();
    },
  });

  useEffect(() => {
    if (!data) return;
    setConfigForm(data.config || {});
    if (!selectedVersionId) {
      const draft = data.versions.find((v) => v.status === "draft");
      setSelectedVersionId(draft?.id || data.published?.id || data.versions[0]?.id || null);
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset local edits when version / price payload changes
  useEffect(() => {
    setMonthlyEdits({});
  }, [selectedVersionId, data?.catalog?.prices]);

  const selectedVersion = useMemo(
    () => data?.versions.find((v) => v.id === selectedVersionId) || null,
    [data, selectedVersionId],
  );

  const isDraft = selectedVersion?.status === "draft";

  const planMetaByCode = useMemo(() => {
    const map = new Map<string, PlanMeta>();
    for (const p of data?.plans || data?.catalog?.plans || []) {
      map.set(p.code, p);
    }
    return map;
  }, [data]);

  const planRows = useMemo(() => {
    const prices = data?.catalog?.prices || [];
    const byCode = new Map<
      string,
      { monthly?: PlanPrice; yearly?: PlanPrice; meta?: PlanMeta }
    >();

    for (const price of prices) {
      const entry = byCode.get(price.planCode) || {
        meta: planMetaByCode.get(price.planCode),
      };
      if (price.cycle === "monthly") entry.monthly = price;
      if (price.cycle === "yearly") entry.yearly = price;
      entry.meta = entry.meta || planMetaByCode.get(price.planCode);
      byCode.set(price.planCode, entry);
    }

    // Include plans that have meta but somehow missing prices
    for (const [code, meta] of planMetaByCode) {
      if (!byCode.has(code)) byCode.set(code, { meta });
    }

    return Array.from(byCode.entries())
      .map(([code, row]) => ({
        code,
        meta: row.meta,
        monthly: row.monthly,
        yearly: row.yearly,
        tab: row.meta?.tab || "property_management",
        sortOrder: row.meta?.sortOrder ?? 999,
        enquireOnly: !!row.meta?.enquireOnly || (row.monthly?.amountMinor === 0 && code.includes("enterprise")),
        isPayg: code === "ai_payg",
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  }, [data, planMetaByCode]);

  const visibleRows = useMemo(
    () => planRows.filter((r) => r.tab === planTab),
    [planRows, planTab],
  );

  const ensureSeed = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/billing/ensure-seed"),
    onSuccess: () => {
      toast({ title: "Catalog seeded" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/billing/catalog"] });
    },
    onError: (e: any) =>
      toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const createDraft = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/admin/billing/versions/draft", {
          label: `Draft ${new Date().toISOString().slice(0, 10)}`,
        })
      ).json(),
    onSuccess: (draft: PriceVersion) => {
      toast({ title: "Editable draft ready" });
      setSelectedVersionId(draft.id);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/billing/catalog"] });
    },
    onError: (e: any) =>
      toast({ title: "Draft failed", description: e.message, variant: "destructive" }),
  });

  const publish = useMutation({
    mutationFn: async (id: string) =>
      (await apiRequest("POST", `/api/admin/billing/versions/${id}/publish`)).json(),
    onSuccess: () => {
      toast({ title: "Published — live prices updated" });
      setValidation(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/billing/catalog"] });
    },
    onError: (e: any) =>
      toast({
        title: "Publish failed",
        description: e.message,
        variant: "destructive",
      }),
  });

  const saveConfig = useMutation({
    mutationFn: async () => apiRequest("PUT", "/api/admin/billing/config", { config: configForm }),
    onSuccess: () => toast({ title: "Config saved" }),
    onError: (e: any) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  async function ensureEditableDraft() {
    if (isDraft) return selectedVersionId;
    const existingDraft = data?.versions.find((v) => v.status === "draft");
    if (existingDraft) {
      setSelectedVersionId(existingDraft.id);
      return existingDraft.id;
    }
    setEnsuringDraft(true);
    try {
      const draft = await createDraft.mutateAsync();
      return draft.id as string;
    } finally {
      setEnsuringDraft(false);
    }
  }

  async function runValidate() {
    if (!selectedVersionId) return;
    try {
      const res = await fetch(`/api/admin/billing/versions/${selectedVersionId}/validate`, {
        credentials: "include",
      });
      const json = await res.json();
      setValidation({ ok: !!json.ok, issues: json.issues || [] });
    } catch (e: any) {
      toast({ title: "Validate failed", description: e.message, variant: "destructive" });
    }
  }

  function monthlyDisplay(row: (typeof planRows)[number]) {
    if (monthlyEdits[row.code] !== undefined) return monthlyEdits[row.code];
    return minorToPounds(row.monthly?.amountMinor ?? 0);
  }

  function yearlyMinorFromMonthlyInput(row: (typeof planRows)[number], monthlyPounds: string) {
    const monthlyMinor = poundsToMinor(monthlyPounds);
    if (monthlyMinor == null) return null;
    if (row.isPayg) return monthlyMinor;
    if (row.enquireOnly) return 0;
    return monthlyMinor * YEARLY_FROM_MONTHLY;
  }

  async function savePlan(row: (typeof planRows)[number]) {
    const versionId = await ensureEditableDraft();
    if (!versionId) {
      toast({ title: "No draft version available", variant: "destructive" });
      return;
    }

    const monthlyPounds = monthlyDisplay(row);
    const monthlyMinor = poundsToMinor(monthlyPounds);
    if (monthlyMinor == null) {
      toast({ title: "Invalid monthly amount", variant: "destructive" });
      return;
    }
    const yearlyMinor = yearlyMinorFromMonthlyInput(row, monthlyPounds);
    if (yearlyMinor == null) {
      toast({ title: "Invalid yearly amount", variant: "destructive" });
      return;
    }

    setSavingPlan(row.code);
    try {
      await apiRequest("PATCH", `/api/admin/billing/versions/${versionId}/prices`, {
        planCode: row.code,
        cycle: "monthly",
        amountMinor: monthlyMinor,
      });
      if (!row.isPayg) {
        await apiRequest("PATCH", `/api/admin/billing/versions/${versionId}/prices`, {
          planCode: row.code,
          cycle: "yearly",
          amountMinor: yearlyMinor,
        });
      }
      toast({
        title: `${row.meta?.name || row.code} updated`,
        description: row.isPayg
          ? `Monthly ${formatGbp(monthlyMinor)}`
          : `Monthly ${formatGbp(monthlyMinor)} · Yearly ${formatGbp(yearlyMinor)} (×${YEARLY_FROM_MONTHLY})`,
      });
      setMonthlyEdits((prev) => {
        const next = { ...prev };
        delete next[row.code];
        return next;
      });
      await refetch();
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingPlan(null);
    }
  }

  async function saveAllVisible() {
    const versionId = await ensureEditableDraft();
    if (!versionId) return;
    const dirty = visibleRows.filter(
      (r) =>
        !r.enquireOnly &&
        monthlyEdits[r.code] !== undefined &&
        poundsToMinor(monthlyEdits[r.code]) !== (r.monthly?.amountMinor ?? 0),
    );
    if (!dirty.length) {
      toast({ title: "No changes to save" });
      return;
    }
    for (const row of dirty) {
      await savePlan(row);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn(pagePad, "max-w-6xl mx-auto space-y-6")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Billing catalog</h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Edit monthly plan prices on a draft, then publish. Yearly is calculated automatically
            as monthly × {YEARLY_FROM_MONTHLY} (2 months free). Published versions stay immutable.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => ensureSeed.mutate()}
            disabled={ensureSeed.isPending}
          >
            {ensureSeed.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Ensure seed</span>
          </Button>
        </div>
      </div>

      {/* Version bar */}
      <Card className="shadow-none border-border/80">
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">Price version</div>
              <div className="flex flex-wrap gap-2">
                {(data?.versions || []).map((v) => (
                  <Button
                    key={v.id}
                    size="sm"
                    variant={selectedVersionId === v.id ? "default" : "outline"}
                    onClick={() => setSelectedVersionId(v.id)}
                  >
                    {v.label}
                    <Badge
                      className={cn(
                        "ml-2 border-0",
                        v.status === "published"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-amber-500/15 text-amber-800 dark:text-amber-300",
                      )}
                    >
                      {v.status}
                    </Badge>
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={runValidate}>
                Validate
              </Button>
              {!isDraft ? (
                <Button
                  size="sm"
                  onClick={() => ensureEditableDraft()}
                  disabled={createDraft.isPending || ensuringDraft}
                >
                  {(createDraft.isPending || ensuringDraft) && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit prices (create draft)
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => selectedVersion && publish.mutate(selectedVersion.id)}
                  disabled={publish.isPending}
                >
                  {publish.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Publish draft
                </Button>
              )}
            </div>
          </div>

          {!isDraft && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm">
              <Lock className="h-4 w-4 mt-0.5 text-amber-700 shrink-0" />
              <div>
                <span className="font-medium">Published version is read-only.</span>{" "}
                Click <strong>Edit prices</strong> to create a draft you can change, then publish
                when ready.
              </div>
            </div>
          )}

          {isDraft && (
            <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-sm">
              <Pencil className="h-4 w-4 mt-0.5 text-emerald-700 shrink-0" />
              <div>
                Editing draft <strong>{selectedVersion?.label}</strong>. Change a monthly price —
                yearly updates automatically. Publish to make it live.
              </div>
            </div>
          )}

          {validation && (
            <div
              className={cn(
                "rounded-md border p-3 text-sm",
                validation.ok ? "border-green-500/40" : "border-destructive/40",
              )}
            >
              <div className="flex items-center gap-2 font-medium mb-1">
                {validation.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                )}
                {validation.ok ? "Valid" : "Validation issues"}
              </div>
              {!validation.ok && (
                <ul className="list-disc pl-5 space-y-1">
                  {validation.issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan prices */}
      <Card className="shadow-none overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Plan prices</CardTitle>
              <CardDescription className="mt-1">
                Amounts in GBP (ex VAT). Edit monthly — yearly = monthly × {YEARLY_FROM_MONTHLY}.
              </CardDescription>
            </div>
            {isDraft && (
              <Button size="sm" variant="secondary" onClick={saveAllVisible}>
                <Save className="h-4 w-4 mr-2" />
                Save changed
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs
            value={planTab}
            onValueChange={(v) => setPlanTab(v as typeof planTab)}
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="property_management">Property Management</TabsTrigger>
              <TabsTrigger value="ai_inspections">AI Inspections</TabsTrigger>
            </TabsList>

            <TabsContent value={planTab} className="mt-0">
              {visibleRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">
                  No plans in this tab. Run Ensure seed, then refresh.
                </p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="min-w-[200px]">Plan</TableHead>
                        <TableHead className="min-w-[140px]">Monthly (£)</TableHead>
                        <TableHead className="min-w-[140px]">Yearly (£)</TableHead>
                        <TableHead className="w-[120px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((row) => {
                        const monthlyVal = monthlyDisplay(row);
                        const yearlyComputed = yearlyMinorFromMonthlyInput(row, monthlyVal);
                        const dirty =
                          monthlyEdits[row.code] !== undefined &&
                          poundsToMinor(monthlyEdits[row.code]) !==
                            (row.monthly?.amountMinor ?? 0);
                        const canEdit = isDraft && !row.enquireOnly;

                        return (
                          <TableRow key={row.code} className={cn(dirty && "bg-primary/5")}>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">
                                  {row.meta?.name || row.code}
                                </div>
                                <div className="flex flex-wrap gap-1.5 items-center">
                                  <span className="text-xs text-muted-foreground font-mono">
                                    {row.code}
                                  </span>
                                  {row.meta?.enabled === false && (
                                    <Badge variant="secondary">Disabled</Badge>
                                  )}
                                  {row.enquireOnly && (
                                    <Badge variant="outline">Enquire only</Badge>
                                  )}
                                  {row.isPayg && (
                                    <Badge variant="outline">PAYG</Badge>
                                  )}
                                </div>
                                {row.meta?.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-1 max-w-sm">
                                    {row.meta.description}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {row.enquireOnly ? (
                                <span className="text-sm text-muted-foreground">—</span>
                              ) : (
                                <div className="flex items-center gap-2 max-w-[160px]">
                                  <span className="text-muted-foreground text-sm">£</span>
                                  <Input
                                    className="h-9 tabular-nums"
                                    inputMode="decimal"
                                    value={monthlyVal}
                                    disabled={!canEdit}
                                    onChange={(e) =>
                                      setMonthlyEdits((prev) => ({
                                        ...prev,
                                        [row.code]: e.target.value,
                                      }))
                                    }
                                    onFocus={async () => {
                                      if (!isDraft) await ensureEditableDraft();
                                    }}
                                  />
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {row.enquireOnly ? (
                                <span className="text-sm text-muted-foreground">Quote</span>
                              ) : row.isPayg ? (
                                <div className="text-sm tabular-nums text-muted-foreground">
                                  Same as pack
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <div className="text-sm font-medium tabular-nums">
                                    {yearlyComputed != null
                                      ? formatGbp(yearlyComputed)
                                      : "—"}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">
                                    auto ×{YEARLY_FROM_MONTHLY}
                                  </div>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {row.enquireOnly ? (
                                <span className="text-xs text-muted-foreground">N/A</span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant={dirty ? "default" : "secondary"}
                                  disabled={!canEdit || savingPlan === row.code}
                                  onClick={() => savePlan(row)}
                                >
                                  {savingPlan === row.code ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <Save className="h-3.5 w-3.5 mr-1.5" />
                                      Save
                                    </>
                                  )}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                Showing {visibleRows.length} {tabLabel(planTab)} plan
                {visibleRows.length === 1 ? "" : "s"}
                {data?.published ? ` · Live: ${data.published.label}` : ""}
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Platform config */}
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">Platform config</CardTitle>
          <CardDescription>Trial, credits, and enquire defaults</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["trial_days", "Trial days"],
              ["trial_inspection_credits", "Trial inspection credits"],
              ["trial_sms_credits", "Trial SMS credits"],
              ["photos_per_credit", "Photos per credit"],
              ["enquire_calendly_url", "Enquire Calendly URL"],
              ["auto_topup_max_per_month", "Auto top-up max / month"],
              ["payment_failure_readonly_days", "Payment failure → read-only days"],
            ].map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  value={configForm[key] ?? ""}
                  onChange={(e) => setConfigForm((c) => ({ ...c, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <Button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending}>
            {saveConfig.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save config
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
