import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Search,
  Download,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fromMinorUnits, formatGbpMinor } from "@shared/rentSchema";

type TabKey =
  | "rent_roll"
  | "arrears"
  | "payments"
  | "reconciliation"
  | "reviews"
  | "statements"
  | "settings";

function money(minor: number | null | undefined) {
  return formatGbpMinor(Number(minor) || 0);
}

function statusPill(status: string) {
  const map: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-800 border-emerald-200",
    overdue: "bg-red-50 text-red-800 border-red-200",
    part_paid: "bg-amber-50 text-amber-900 border-amber-200",
    scheduled: "bg-slate-50 text-slate-700 border-slate-200",
    due: "bg-sky-50 text-sky-800 border-sky-200",
    unmatched: "bg-slate-50 text-slate-700 border-slate-200",
    suggested: "bg-amber-50 text-amber-900 border-amber-200",
    confirmed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  };
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold border ${map[status] || "bg-slate-50 text-slate-700 border-slate-200"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function accountRollStatus(a: any) {
  if (a.arrearsMinor > 0) return a.collectedMinor > 0 ? "part_paid" : "overdue";
  if (a.upcomingMinor > 0 && a.collectedMinor <= 0) return "scheduled";
  return "paid";
}

export default function RentManagement() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("rent_roll");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [ledgerAccountId, setLedgerAccountId] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptAccountId, setReceiptAccountId] = useState("");
  const [receiptAmount, setReceiptAmount] = useState("");
  const [receiptRef, setReceiptRef] = useState("");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [caseNote, setCaseNote] = useState("");
  const [caseStatus, setCaseStatus] = useState("review_required");
  const [bankCsv, setBankCsv] = useState("");
  const [matchTxId, setMatchTxId] = useState<string | null>(null);
  const [matchAccountId, setMatchAccountId] = useState("");
  const [statementAccountId, setStatementAccountId] = useState("");

  const { data: dashboard, isLoading, error } = useQuery<any>({
    queryKey: ["/api/rent/dashboard"],
    queryFn: async () => (await apiRequest("GET", "/api/rent/dashboard")).json(),
  });

  const { data: receipts = [] } = useQuery<any[]>({
    queryKey: ["/api/rent/receipts"],
    queryFn: async () => (await apiRequest("GET", "/api/rent/receipts")).json(),
    enabled: tab === "payments" || receiptOpen,
  });

  const { data: arrears = [] } = useQuery<any[]>({
    queryKey: ["/api/rent/arrears"],
    queryFn: async () => (await apiRequest("GET", "/api/rent/arrears")).json(),
    enabled: tab === "arrears",
  });

  const { data: bankTx = [] } = useQuery<any[]>({
    queryKey: ["/api/rent/bank-transactions"],
    queryFn: async () => (await apiRequest("GET", "/api/rent/bank-transactions")).json(),
    enabled: tab === "reconciliation",
  });

  const { data: reviews = [] } = useQuery<any[]>({
    queryKey: ["/api/rent/reviews"],
    queryFn: async () => (await apiRequest("GET", "/api/rent/reviews")).json(),
    enabled: tab === "reviews",
  });

  const { data: statements = [] } = useQuery<any[]>({
    queryKey: ["/api/rent/statements"],
    queryFn: async () => (await apiRequest("GET", "/api/rent/statements")).json(),
    enabled: tab === "statements",
  });

  const { data: ledger, isLoading: ledgerLoading } = useQuery<any>({
    queryKey: ["/api/rent/accounts", ledgerAccountId, "ledger"],
    queryFn: async () =>
      (await apiRequest("GET", `/api/rent/accounts/${ledgerAccountId}/ledger`)).json(),
    enabled: !!ledgerAccountId,
  });

  const { data: caseDetail } = useQuery<any>({
    queryKey: ["/api/rent/arrears", caseId],
    queryFn: async () => (await apiRequest("GET", `/api/rent/arrears/${caseId}`)).json(),
    enabled: !!caseId,
  });

  const accounts: any[] = dashboard?.accounts || [];
  const properties = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) map.set(a.propertyId, a.propertyName);
    return [...map.entries()];
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    let rows = accounts;
    if (propertyFilter !== "all") rows = rows.filter((a) => a.propertyId === propertyFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((a) =>
        [a.tenantName, a.propertyName, a.unitLabel, a.payerReference, a.id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    if (statusFilter !== "all") {
      rows = rows.filter((a) => accountRollStatus(a) === statusFilter);
    }
    return rows;
  }, [accounts, propertyFilter, search, statusFilter]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/rent/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rent/receipts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rent/arrears"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rent/bank-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rent/reviews"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rent/statements"] });
    if (ledgerAccountId) {
      queryClient.invalidateQueries({ queryKey: ["/api/rent/accounts", ledgerAccountId, "ledger"] });
    }
  };

  const provisionMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/rent/accounts/provision", {})).json(),
    onSuccess: (r) => {
      toast({ title: `Provisioned ${r.created} account(s)` });
      invalidate();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const receiptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/rent/receipts", {
        accountId: receiptAccountId,
        amount: receiptAmount,
        reference: receiptRef || undefined,
        confirm: true,
        allocateOldestFirst: true,
        creditExcess: true,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Receipt recorded and allocated" });
      setReceiptOpen(false);
      setReceiptAmount("");
      setReceiptRef("");
      invalidate();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const caseMutation = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", `/api/rent/arrears/${caseId}/events`, {
          eventType: "note",
          note: caseNote,
          status: caseStatus,
        })
      ).json(),
    onSuccess: () => {
      toast({ title: "Case updated" });
      setCaseNote("");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["/api/rent/arrears", caseId] });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const rows = bankCsv
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .map((line) => {
          const [date, amount, reference, counterparty, sourceId] = line
            .split(",")
            .map((s) => s.trim().replace(/^"|"$/g, ""));
          return { date, amount, reference, counterparty, sourceId };
        })
        .filter((r) => r.date && r.amount);
      return (await apiRequest("POST", "/api/rent/bank-imports", { rows })).json();
    },
    onSuccess: (r) => {
      toast({ title: `Imported ${r.inserted} · duplicates ${r.duplicates}` });
      setBankCsv("");
      invalidate();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const matchMutation = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", `/api/rent/reconciliation/${matchTxId}/confirm`, {
          accountId: matchAccountId,
        })
      ).json(),
    onSuccess: () => {
      toast({ title: "Bank match confirmed" });
      setMatchTxId(null);
      invalidate();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const reviewMutation = useMutation({
    mutationFn: async (id: string) =>
      (
        await apiRequest("POST", `/api/rent/reviews/${id}/submit`, {
          action: "mark_manual_review",
          notes: "Marked for manual review — rent unchanged",
        })
      ).json(),
    onSuccess: () => {
      toast({ title: "Review queued. Rent unchanged." });
      invalidate();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const statementMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
      return (
        await apiRequest("POST", "/api/rent/statements", {
          accountId: statementAccountId || ledgerAccountId,
          from: from.toISOString(),
          to: to.toISOString(),
        })
      ).json();
    },
    onSuccess: () => {
      toast({ title: "Statement generated" });
      invalidate();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const migrationMutation = useMutation({
    mutationFn: async (dryRun: boolean) =>
      (await apiRequest("POST", "/api/rent/migration/legacy", { dryRun })).json(),
    onSuccess: (r) => {
      toast({
        title: r.dryRun ? "Dry run complete" : "Migration committed",
        description: `${r.periodsSeen} periods · due ${money(r.totals?.amountDueMinor)} · paid ${money(r.totals?.amountPaidMinor)}`,
      });
      invalidate();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const exportCsv = () => {
    const rows = [
      ["Tenancy", "Property", "Tenant", "Monthly rent", "Collected", "Arrears", "Status"],
      ...filteredAccounts.map((a) => [
        a.id,
        a.propertyName,
        a.tenantName,
        fromMinorUnits(a.monthlyRentMinor),
        fromMinorUnits(a.collectedMinor),
        fromMinorUnits(a.arrearsMinor),
        accountRollStatus(a),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "inspect360-rent-roll.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load rent management</CardTitle>
            <CardDescription>{(error as Error).message}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const kpis = dashboard?.kpis || {};
  const breakdown = dashboard?.breakdown || {};
  const queue = dashboard?.workQueue || {};
  const scheduled = kpis.scheduledMinor || 1;
  const collectedPct = Math.min(100, ((breakdown.collectedMinor || 0) / scheduled) * 100);
  const overduePct = Math.min(100, ((breakdown.overdueThisPeriodMinor || 0) / scheduled) * 100);
  const upcomingPct = Math.max(0, 100 - collectedPct - overduePct);

  return (
    <div className="p-6 space-y-5 max-w-[1800px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rent management</h1>
          <p className="text-sm text-muted-foreground">
            Track rental income, resolve arrears and reconcile payments across your portfolio.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setReceiptAccountId(filteredAccounts[0]?.id || "");
              setReceiptOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Record receipt
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-[200px] bg-white">
            <SelectValue placeholder="All properties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All properties</SelectItem>
            {properties.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground ml-auto text-xs">
          As of {dashboard?.period?.asOf?.slice(0, 10)} · {dashboard?.period?.currency || "GBP"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          ["Scheduled rent", money(kpis.scheduledMinor), `${kpis.tenancyCount || 0} tenancies`],
          ["Rent collected", money(kpis.collectedMinor), "Applied to period charges"],
          [
            "Collection rate",
            kpis.collectionRate == null ? "N/A" : `${kpis.collectionRate}%`,
            "Of rent due to date",
          ],
          ["Total arrears", money(kpis.totalArrearsMinor), "Includes prior periods"],
        ].map(([label, value, meta], i) => (
          <Card key={label as string} className="shadow-sm">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-xs font-semibold text-muted-foreground flex justify-between">
                {label}
                <span>{["£", "↙", "%", "!"][i]}</span>
              </div>
              <div className={`text-2xl font-bold mt-1 ${i === 3 ? "text-red-700" : ""}`}>{value}</div>
              {i === 2 && typeof kpis.collectionRate === "number" && (
                <div className="h-1.5 bg-muted rounded mt-2 overflow-hidden">
                  <div
                    className="h-full bg-[#00b7a6]"
                    style={{ width: `${Math.min(100, kpis.collectionRate)}%` }}
                  />
                </div>
              )}
              <div className="text-[11px] text-muted-foreground mt-1">{meta}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Current-period rent breakdown</CardTitle>
            <CardDescription>Does not treat future charges as arrears</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-3.5 rounded overflow-hidden bg-muted">
              <span className="bg-[#00b8a5]" style={{ width: `${collectedPct}%` }} />
              <span className="bg-[#e8aa55]" style={{ width: `${overduePct}%` }} />
              <span className="bg-[#e3e9ed]" style={{ width: `${upcomingPct}%` }} />
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
              <span>
                Collected <b className="text-foreground ml-1">{money(breakdown.collectedMinor)}</b>
              </span>
              <span>
                Overdue this period{" "}
                <b className="text-foreground ml-1">{money(breakdown.overdueThisPeriodMinor)}</b>
              </span>
              <span>
                Not yet due <b className="text-foreground ml-1">{money(breakdown.notYetDueMinor)}</b>
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Action required</CardTitle>
            <CardDescription>Work queue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(
              [
                {
                  key: "arrears" as const,
                  title: "Overdue tenancies",
                  count: queue.overdueTenancies || 0,
                  countLabel: (n: number) => (n === 1 ? "1 tenancy" : `${n} tenancies`),
                  amount: queue.overdueMinor || 0,
                  amountHint: "total overdue",
                },
                {
                  key: "reconciliation" as const,
                  title: "Unmatched bank receipts",
                  count: queue.unmatchedBankCount || 0,
                  countLabel: (n: number) => (n === 1 ? "1 receipt" : `${n} receipts`),
                  amount: queue.unmatchedBankMinor || 0,
                  amountHint: "awaiting match",
                },
                {
                  key: "reviews" as const,
                  title: "Rent reviews awaiting assessment",
                  count: queue.reviewsAwaiting || 0,
                  countLabel: (n: number) => (n === 1 ? "1 review" : `${n} reviews`),
                  amount: null as number | null,
                  amountHint: "",
                },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                className="w-full flex items-center gap-3 rounded-lg border bg-white hover:bg-slate-50 px-3.5 py-3 text-left transition-colors"
                onClick={() => setTab(item.key)}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-900 text-sm font-bold tabular-nums">
                  {item.count}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{item.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {item.countLabel(item.count)}
                    {item.amount != null ? ` · ${item.amountHint}` : ""}
                  </div>
                </div>
                {item.amount != null ? (
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular-nums text-amber-900">
                      {money(item.amount)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">View ›</div>
                  </div>
                ) : (
                  <div className="text-xs font-medium text-muted-foreground shrink-0">View ›</div>
                )}
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent border-b rounded-none w-full justify-start p-0">
          {(
            [
              ["rent_roll", "Rent roll"],
              ["arrears", "Arrears"],
              ["payments", "Payments"],
              ["reconciliation", "Reconciliation"],
              ["reviews", "Rent reviews"],
              ["statements", "Statements"],
              ["settings", "Settings"],
            ] as const
          ).map(([key, label]) => (
            <TabsTrigger
              key={key}
              value={key}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#00bba9] data-[state=active]:text-[#007e73] data-[state=active]:shadow-none px-3"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="rent_roll" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">Rent roll</CardTitle>
                <CardDescription>Select a tenancy to view its account</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8 w-[200px]"
                    placeholder="Search tenant or property"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="part_paid">Part paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="scheduled">Upcoming</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {filteredAccounts.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground space-y-3">
                  <p>No rent accounts yet.</p>
                  <Button
                    variant="outline"
                    onClick={() => provisionMutation.mutate()}
                    disabled={provisionMutation.isPending}
                  >
                    {provisionMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Provision from tenancies
                  </Button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b bg-slate-50">
                      <th className="text-left p-3">Property / unit</th>
                      <th className="text-left p-3">Tenant</th>
                      <th className="text-right p-3">Rent due</th>
                      <th className="text-right p-3">Received</th>
                      <th className="text-right p-3">Total arrears</th>
                      <th className="text-left p-3">Status</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccounts.map((a) => (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="p-3">
                          <div className="font-semibold">{a.propertyName}</div>
                          <div className="text-xs text-muted-foreground">{a.unitLabel}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-semibold">{a.tenantName}</div>
                          <div className="text-xs text-muted-foreground">{a.payerReference}</div>
                        </td>
                        <td className="p-3 text-right tabular-nums">{money(a.monthlyRentMinor)}</td>
                        <td className="p-3 text-right tabular-nums">{money(a.collectedMinor)}</td>
                        <td
                          className={`p-3 text-right tabular-nums font-semibold ${a.arrearsMinor ? "text-red-700" : ""}`}
                        >
                          {money(a.arrearsMinor)}
                        </td>
                        <td className="p-3">{statusPill(accountRollStatus(a))}</td>
                        <td className="p-3 text-right">
                          <Button variant="link" className="text-[#007f75]" onClick={() => setLedgerAccountId(a.id)}>
                            View account ›
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="text-xs text-muted-foreground mt-3">
                Showing {filteredAccounts.length} records · All figures GBP minor units rendered as £
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="arrears" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Arrears</CardTitle>
              <CardDescription>One open case per tenancy · no automated legal notices</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {arrears.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No open arrears cases.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase text-muted-foreground border-b bg-slate-50">
                      <th className="text-left p-3">Account</th>
                      <th className="text-right p-3">Overdue</th>
                      <th className="text-left p-3">Oldest due</th>
                      <th className="text-left p-3">Status</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {arrears.map((c) => {
                      const acc = accounts.find((a) => a.id === c.accountId);
                      return (
                        <tr key={c.id} className="border-b">
                          <td className="p-3">
                            <div className="font-semibold">{acc?.tenantName || c.accountId}</div>
                            <div className="text-xs text-muted-foreground">{acc?.propertyName}</div>
                          </td>
                          <td className="p-3 text-right text-red-700 font-semibold">{money(c.overdueMinor)}</td>
                          <td className="p-3">{c.oldestDueDate?.slice?.(0, 10) || "—"}</td>
                          <td className="p-3">{statusPill(c.status)}</td>
                          <td className="p-3 text-right">
                            <Button
                              variant="link"
                              className="text-[#007f75]"
                              onClick={() => {
                                setCaseId(c.id);
                                setCaseStatus(c.status);
                              }}
                            >
                              Manage case ›
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row justify-between">
              <div>
                <CardTitle className="text-base">Payments</CardTitle>
                <CardDescription>Confirmed receipts · pending never count as collected</CardDescription>
              </div>
              <Button size="sm" onClick={() => setReceiptOpen(true)}>
                Record receipt
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase text-muted-foreground border-b bg-slate-50">
                    <th className="text-left p-3">Receipt</th>
                    <th className="text-left p-3">Account</th>
                    <th className="text-left p-3">Date</th>
                    <th className="text-right p-3">Amount</th>
                    <th className="text-left p-3">Reference</th>
                    <th className="text-left p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="p-3 font-mono text-xs">{r.id.slice(0, 8)}</td>
                      <td className="p-3">{r.accountId?.slice(0, 8) || "Suspense"}</td>
                      <td className="p-3">{String(r.receivedAt).slice(0, 10)}</td>
                      <td className="p-3 text-right">{money(r.amountMinor)}</td>
                      <td className="p-3">{r.reference || "—"}</td>
                      <td className="p-3">
                        {statusPill(r.status)} {statusPill(r.allocationState)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!receipts.length && (
                <p className="text-sm text-muted-foreground py-8 text-center">No receipts yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reconciliation" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">CSV bank import</CardTitle>
              <CardDescription>
                Header row: date,amount,reference,counterparty,sourceId — duplicates blocked by fingerprint
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                rows={5}
                placeholder={"date,amount,reference,counterparty,sourceId\n2026-11-24,850,S KHAN RENT,,BK-601"}
                value={bankCsv}
                onChange={(e) => setBankCsv(e.target.value)}
              />
              <Button
                onClick={() => importMutation.mutate()}
                disabled={!bankCsv.trim() || importMutation.isPending}
              >
                {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Import CSV
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Unmatched / suggested</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase text-muted-foreground border-b bg-slate-50">
                    <th className="text-left p-3">Bank entry</th>
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Reference</th>
                    <th className="text-right p-3">Amount</th>
                    <th className="text-left p-3">Status</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {bankTx.map((t) => (
                    <tr key={t.id} className="border-b">
                      <td className="p-3 font-mono text-xs">{t.id.slice(0, 8)}</td>
                      <td className="p-3">{String(t.valueDate).slice(0, 10)}</td>
                      <td className="p-3">{t.reference || "—"}</td>
                      <td className="p-3 text-right">{money(t.amountMinor)}</td>
                      <td className="p-3">{statusPill(t.matchState)}</td>
                      <td className="p-3 text-right">
                        <Button
                          variant="link"
                          className="text-[#007f75]"
                          onClick={() => {
                            setMatchTxId(t.id);
                            setMatchAccountId(t.suggestedAccountId || "");
                          }}
                        >
                          Review match ›
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!bankTx.length && (
                <p className="text-sm text-muted-foreground py-8 text-center">No unmatched bank lines.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rent reviews</CardTitle>
              <CardDescription>
                England PRS eligibility checks · notices are never auto-served · live rent unchanged until
                lawful activation
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase text-muted-foreground border-b bg-slate-50">
                    <th className="text-left p-3">Account</th>
                    <th className="text-right p-3">Current</th>
                    <th className="text-left p-3">Target</th>
                    <th className="text-left p-3">Status</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((r) => {
                    const acc = accounts.find((a) => a.id === r.accountId);
                    return (
                      <tr key={r.id} className="border-b">
                        <td className="p-3">
                          <div className="font-semibold">{acc?.tenantName || r.accountId.slice(0, 8)}</div>
                          <div className="text-xs text-muted-foreground max-w-md truncate">
                            {r.eligibilityNotes}
                          </div>
                        </td>
                        <td className="p-3 text-right">{money(r.currentAmountMinor)}</td>
                        <td className="p-3">{String(r.proposedEffectiveDate || "").slice(0, 10) || "—"}</td>
                        <td className="p-3">{statusPill(r.status)}</td>
                        <td className="p-3 text-right">
                          <Button
                            variant="link"
                            className="text-[#007f75]"
                            onClick={() => reviewMutation.mutate(r.id)}
                          >
                            Assess ›
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!reviews.length && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No reviews queued. The daily job seeds eligibility checks near anniversary.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statements" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generate statement</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label>Account</Label>
                <Select value={statementAccountId} onValueChange={setStatementAccountId}>
                  <SelectTrigger className="w-[260px]">
                    <SelectValue placeholder="Select tenancy" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.tenantName} · {a.propertyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                disabled={!statementAccountId || statementMutation.isPending}
                onClick={() => statementMutation.mutate()}
              >
                Generate current month
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Statement history</CardTitle>
            </CardHeader>
            <CardContent>
              {statements.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No statements yet.</p>
              ) : (
                <ul className="space-y-2">
                  {statements.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap justify-between gap-2 border rounded-md px-3 py-2 text-sm"
                    >
                      <span>
                        {String(s.fromDate).slice(0, 10)} → {String(s.toDate).slice(0, 10)} · closing{" "}
                        {money(s.closingBalanceMinor)}
                      </span>
                      <a
                        className="text-[#007f75] font-medium"
                        href={`/api/rent/statements/${s.id}?format=csv`}
                      >
                        Download CSV
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Legacy migration</CardTitle>
              <CardDescription>
                Map existing rent_periods into the canonical ledger. Dry-run first. Never invents payment
                dates.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => migrationMutation.mutate(true)}
                disabled={migrationMutation.isPending}
              >
                Dry run
              </Button>
              <Button
                variant="destructive"
                onClick={() => migrationMutation.mutate(false)}
                disabled={migrationMutation.isPending}
              >
                Commit migration
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Provision accounts</CardTitle>
              <CardDescription>
                Create rent accounts + approved schedules from active tenancies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => provisionMutation.mutate()} disabled={provisionMutation.isPending}>
                Provision now
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground flex gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
              Late fees and interest remain disabled. Legal escalations are always manual. Deposits stay on
              the separate deposit ledger and are never auto-allocated to rent.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Tenancy account drawer */}
      <Sheet open={!!ledgerAccountId} onOpenChange={(o) => !o && setLedgerAccountId(null)}>
        <SheetContent className="w-[min(92vw,36rem)] sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Tenancy account</SheetTitle>
            <SheetDescription>
              {ledger?.tenant?.name} · {ledger?.property?.name}
            </SheetDescription>
          </SheetHeader>
          {ledgerLoading ? (
            <Loader2 className="h-6 w-6 animate-spin mt-8" />
          ) : ledger ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Arrears</span>
                  <b className={ledger.balances.arrearsMinor ? "text-red-700" : ""}>
                    {money(ledger.balances.arrearsMinor)}
                  </b>
                </div>
                <div className="flex justify-between">
                  <span>Upcoming</span>
                  <b>{money(ledger.balances.upcomingMinor)}</b>
                </div>
                <div className="flex justify-between">
                  <span>Unapplied credit</span>
                  <b>{money(ledger.account.unappliedCreditMinor)}</b>
                </div>
                <div className="flex justify-between">
                  <span>Payer reference</span>
                  <b className="font-mono text-xs">{ledger.account.payerReference}</b>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-2">Charges</h3>
                <div className="space-y-1 max-h-48 overflow-auto">
                  {ledger.charges.map((c: any) => (
                    <div key={c.id} className="flex justify-between text-xs border-b py-1.5">
                      <span>
                        {String(c.dueDate).slice(0, 10)} · {c.status}
                      </span>
                      <span>
                        {money(c.allocatedMinor)} / {money(c.amountMinor)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-2">Receipts</h3>
                {ledger.receipts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No recorded receipts.</p>
                ) : (
                  ledger.receipts.map((r: any) => (
                    <div key={r.id} className="flex justify-between text-xs border-b py-1.5">
                      <span>
                        {String(r.receivedAt).slice(0, 10)} · {r.reference || r.id.slice(0, 8)}
                      </span>
                      <b>{money(r.amountMinor)}</b>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2 w-full">
                <Button
                  className="flex-1 min-w-[9.5rem] px-6"
                  onClick={() => {
                    setReceiptAccountId(ledger.account.id);
                    setReceiptOpen(true);
                  }}
                >
                  Record receipt
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 min-w-[9.5rem] px-6"
                  onClick={() => {
                    setStatementAccountId(ledger.account.id);
                    setTab("statements");
                    setLedgerAccountId(null);
                  }}
                >
                  Statement
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Record receipt */}
      <Sheet open={receiptOpen} onOpenChange={setReceiptOpen}>
        <SheetContent className="w-[min(92vw,36rem)] sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Record rent receipt</SheetTitle>
            <SheetDescription>
              Confirmed receipts allocate oldest due first. Excess becomes unapplied credit — never deposit.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 mt-4">
            <div>
              <Label>Tenancy account</Label>
              <Select value={receiptAccountId} onValueChange={setReceiptAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.tenantName} · {a.propertyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (£)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={receiptAmount}
                onChange={(e) => setReceiptAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Reference</Label>
              <Input value={receiptRef} onChange={(e) => setReceiptRef(e.target.value)} />
            </div>
            <Button
              className="w-full"
              disabled={!receiptAccountId || !receiptAmount || receiptMutation.isPending}
              onClick={() => receiptMutation.mutate()}
            >
              {receiptMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save receipt
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Arrears case */}
      <Sheet open={!!caseId} onOpenChange={(o) => !o && setCaseId(null)}>
        <SheetContent className="w-[min(92vw,36rem)] sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Arrears case</SheetTitle>
            <SheetDescription>Operational case only — no automated eviction or fees</SheetDescription>
          </SheetHeader>
          {caseDetail && (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Overdue balance</div>
                <div className="text-2xl font-bold text-red-700">
                  {money(caseDetail.case.overdueMinor)}
                </div>
              </div>
              <div>
                <Label>Case status</Label>
                <Select value={caseStatus} onValueChange={setCaseStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "review_required",
                      "contact_scheduled",
                      "reminder_sent",
                      "plan_active",
                      "disputed",
                      "on_hold",
                      "escalated",
                      "resolved",
                    ].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Case note</Label>
                <Textarea
                  rows={4}
                  value={caseNote}
                  onChange={(e) => setCaseNote(e.target.value)}
                  placeholder="Agreed next action or reason for hold"
                />
              </div>
              <Button
                className="w-full"
                disabled={caseMutation.isPending}
                onClick={() => caseMutation.mutate()}
              >
                Save case status
              </Button>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">History</h4>
                {(caseDetail.events || []).map((e: any) => (
                  <div key={e.id} className="text-xs border-b py-1.5">
                    <b>{e.eventType}</b> · {String(e.createdAt).slice(0, 16)}
                    <div className="text-muted-foreground">{e.note}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Bank match */}
      <Sheet open={!!matchTxId} onOpenChange={(o) => !o && setMatchTxId(null)}>
        <SheetContent className="w-[min(92vw,36rem)] sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Confirm bank match</SheetTitle>
            <SheetDescription>Confirm the tenancy before allocating. Creates a confirmed receipt.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <div>
              <Label>Account</Label>
              <Select value={matchAccountId} onValueChange={setMatchAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.tenantName} · {a.propertyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={!matchAccountId || matchMutation.isPending}
              onClick={() => matchMutation.mutate()}
            >
              Confirm allocation
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
