import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Inbox,
  MessageSquare,
  Search,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricSummaryCard } from "@/components/workspace";
import { cn } from "@/lib/utils";
import { pagePad } from "@/lib/responsive";
import { apiRequest } from "@/lib/queryClient";
import {
  communicationCaseStatusTone,
  priorityTone,
  type SemanticTone,
} from "@shared/statusPriorityStyles";

type Metrics = {
  openCount: number;
  unassigned: number;
  urgent: number;
  overdue: number;
  awaitingApproval: number;
  awaitingTenant: number;
  myCases: number;
};

type CaseRow = {
  id: string;
  reference: string;
  subject: string;
  status: string;
  priority: string;
  summary?: string | null;
  propertyName?: string | null;
  ownerDisplayName?: string | null;
  updatedAt?: string | null;
  isOverdue?: boolean;
  unreadForStaff?: boolean;
};

const QUEUES: Array<{
  id: string;
  label: string;
  metricKey?: keyof Metrics;
  tone: SemanticTone;
}> = [
  { id: "all", label: "All open", metricKey: "openCount", tone: "info" },
  { id: "my_cases", label: "My cases", metricKey: "myCases", tone: "primary" },
  { id: "unassigned", label: "Unassigned", metricKey: "unassigned", tone: "muted" },
  { id: "urgent", label: "Urgent", metricKey: "urgent", tone: "urgent" },
  { id: "overdue", label: "Overdue", metricKey: "overdue", tone: "critical" },
  { id: "awaiting_approval", label: "Awaiting approval", metricKey: "awaitingApproval", tone: "warning" },
  { id: "awaiting_tenant", label: "Awaiting tenant", metricKey: "awaitingTenant", tone: "action" },
  { id: "closed", label: "Closed", tone: "success" },
];

const QUEUE_CHIP: Record<
  SemanticTone,
  { idle: string; active: string; countIdle: string; countActive: string }
> = {
  muted: {
    idle: "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
    active: "border-slate-400 bg-slate-100 text-slate-800",
    countIdle: "bg-slate-100 text-slate-600",
    countActive: "bg-slate-200 text-slate-800",
  },
  info: {
    idle: "border-sky-200 bg-white text-sky-800 hover:bg-sky-50",
    active: "border-sky-400 bg-sky-100 text-sky-900",
    countIdle: "bg-sky-50 text-sky-700",
    countActive: "bg-sky-200 text-sky-900",
  },
  success: {
    idle: "border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50",
    active: "border-emerald-400 bg-emerald-100 text-emerald-900",
    countIdle: "bg-emerald-50 text-emerald-700",
    countActive: "bg-emerald-200 text-emerald-900",
  },
  warning: {
    idle: "border-amber-200 bg-white text-amber-900 hover:bg-amber-50",
    active: "border-amber-400 bg-amber-100 text-amber-950",
    countIdle: "bg-amber-50 text-amber-800",
    countActive: "bg-amber-200 text-amber-950",
  },
  critical: {
    idle: "border-red-200 bg-white text-red-700 hover:bg-red-50",
    active: "border-red-400 bg-red-100 text-red-900",
    countIdle: "bg-red-50 text-red-700",
    countActive: "bg-red-200 text-red-900",
  },
  action: {
    idle: "border-orange-200 bg-white text-orange-800 hover:bg-orange-50",
    active: "border-orange-400 bg-orange-100 text-orange-950",
    countIdle: "bg-orange-50 text-orange-800",
    countActive: "bg-orange-200 text-orange-950",
  },
  primary: {
    idle: "border-teal-200 bg-white text-teal-800 hover:bg-teal-50",
    active: "border-teal-400 bg-teal-100 text-teal-950",
    countIdle: "bg-teal-50 text-teal-700",
    countActive: "bg-teal-200 text-teal-950",
  },
  urgent: {
    idle: "border-rose-200 bg-white text-rose-800 hover:bg-rose-50",
    active: "border-rose-400 bg-rose-100 text-rose-950",
    countIdle: "bg-rose-50 text-rose-700",
    countActive: "bg-rose-200 text-rose-950",
  },
};

const PRIORITY_ACCENT: Record<string, string> = {
  urgent: "bg-rose-500",
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-sky-400",
};

function whenLabel(iso?: string | null) {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

function prettyLabel(value: string) {
  return value.replace(/_/g, " ");
}

export default function CommunicationsInbox() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const viewFromUrl = new URLSearchParams(search).get("view") || "all";
  const [view, setView] = useState(viewFromUrl);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    setView(viewFromUrl);
  }, [viewFromUrl]);

  const metricsQuery = useQuery<Metrics>({
    queryKey: ["/api/communications/metrics"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/communications/metrics");
      return res.json();
    },
  });

  const casesQuery = useQuery<{ items: CaseRow[] }>({
    queryKey: ["/api/communications/cases", view, q],
    queryFn: async () => {
      const params = new URLSearchParams({ view });
      if (q.trim()) params.set("q", q.trim());
      if (view === "closed") params.set("includeClosed", "1");
      const res = await apiRequest("GET", `/api/communications/cases?${params}`);
      return res.json();
    },
  });

  const items = casesQuery.data?.items || [];
  const selected = useMemo(
    () => items.find((c) => c.id === selectedId) || items[0] || null,
    [items, selectedId],
  );

  const metrics = metricsQuery.data;

  return (
    <div className={cn("container mx-auto min-w-0 space-y-5 md:space-y-6", pagePad)}>
      <PageHeader
        icon={Inbox}
        title="Communications inbox"
        description="Operational cases across maintenance, rent, tenancy, and more"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/communications/analytics">Analytics</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/communications/settings">Workflow settings</Link>
            </Button>
            <Button
              variant="brand"
              onClick={() => setLocation("/communications/cases/new")}
            >
              New case
            </Button>
          </div>
        }
      />

      {metricsQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[5.5rem] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricSummaryCard
            label="Open"
            value={metrics?.openCount ?? 0}
            subLabel="Active cases"
            tone="info"
            icon={Inbox}
          />
          <MetricSummaryCard
            label="Unassigned"
            value={metrics?.unassigned ?? 0}
            subLabel="Need an owner"
            tone={(metrics?.unassigned ?? 0) > 0 ? "warning" : "muted"}
            icon={UserRound}
          />
          <MetricSummaryCard
            label="Overdue"
            value={metrics?.overdue ?? 0}
            subLabel="Past SLA"
            tone={(metrics?.overdue ?? 0) > 0 ? "critical" : "muted"}
            icon={AlertTriangle}
          />
          <MetricSummaryCard
            label="Awaiting tenant"
            value={metrics?.awaitingTenant ?? 0}
            subLabel="Waiting on reply"
            tone="action"
            icon={Clock}
          />
        </div>
      )}

      <div
        className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 -mx-1 px-1"
        role="tablist"
        aria-label="Queues"
        data-testid="communications-queues"
      >
        {QUEUES.map((queue) => {
          const count =
            queue.metricKey && metrics ? metrics[queue.metricKey] : undefined;
          const active = view === queue.id;
          const chip = QUEUE_CHIP[queue.tone];
          return (
            <button
              key={queue.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setView(queue.id);
                setSelectedId(null);
                const params = new URLSearchParams(search);
                if (queue.id === "all") params.delete("view");
                else params.set("view", queue.id);
                const qs = params.toString();
                setLocation(qs ? `/communications?${qs}` : "/communications");
              }}
              className={cn(
                "shrink-0 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                active ? chip.active : chip.idle,
              )}
              data-testid={`queue-${queue.id}`}
            >
              <span className="whitespace-nowrap">{queue.label}</span>
              {typeof count === "number" ? (
                <span
                  className={cn(
                    "tabular-nums text-[11px] rounded-full min-w-[1.35rem] px-1.5 py-0.5 text-center font-semibold",
                    active ? chip.countActive : chip.countIdle,
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        className="communications-inbox-grid rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden min-h-[30rem]"
        data-testid="communications-inbox"
      >
        <section
          className="border-b md:border-b-0 md:border-r border-border/70 flex flex-col min-h-0 bg-muted/20"
          aria-label="Case list"
        >
          <div className="p-3 border-b border-border/60 bg-card">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search reference, subject…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9 h-9 bg-background"
                data-testid="input-communications-search"
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground px-0.5">
              {casesQuery.isLoading
                ? "Loading…"
                : `${items.length} case${items.length === 1 ? "" : "s"} · double-click to open`}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[22rem] md:max-h-[calc(100vh-22rem)]">
            {casesQuery.isLoading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[4.5rem] w-full rounded-lg" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 mx-auto text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">No cases in this queue</p>
                <p className="text-xs text-muted-foreground">Try another filter or create a new case.</p>
              </div>
            ) : (
              items.map((c) => {
                const active = selected?.id === c.id;
                const accent =
                  PRIORITY_ACCENT[(c.priority || "").toLowerCase()] || "bg-slate-300";
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    onDoubleClick={() => setLocation(`/communications/cases/${c.id}`)}
                    className={cn(
                      "group relative w-full text-left pl-3 pr-3 py-3 border-b border-border/40 transition-colors",
                      active ? "bg-primary/10" : "hover:bg-card/80 bg-transparent",
                    )}
                    data-testid={`case-row-${c.id}`}
                  >
                    <span
                      className={cn(
                        "absolute left-0 top-0 bottom-0 w-1",
                        accent,
                        active ? "opacity-100" : "opacity-70 group-hover:opacity-100",
                      )}
                      aria-hidden
                    />
                    <div className="flex items-start gap-2.5">
                      <div className="pt-1.5 shrink-0 w-2">
                        {c.unreadForStaff ? (
                          <span
                            className="block h-2 w-2 rounded-full bg-primary"
                            title="Unread"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                                {c.reference}
                              </span>
                              {c.isOverdue ? (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600">
                                  Overdue
                                </span>
                              ) : null}
                            </div>
                            <div
                              className={cn(
                                "truncate text-sm leading-snug mt-0.5",
                                c.unreadForStaff
                                  ? "font-semibold text-foreground"
                                  : "font-medium text-foreground/90",
                              )}
                            >
                              {c.subject}
                            </div>
                          </div>
                          <StatusBadge
                            tone={priorityTone(c.priority)}
                            className="shrink-0"
                          >
                            {c.priority}
                          </StatusBadge>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge tone={communicationCaseStatusTone(c.status)}>
                            {prettyLabel(c.status)}
                          </StatusBadge>
                          <span className="text-[11px] text-muted-foreground truncate">
                            {c.propertyName || "No property"} · {whenLabel(c.updatedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="p-5 md:p-6 min-h-[14rem] bg-card" aria-label="Case preview">
          {!selected ? (
            <div className="h-full min-h-[14rem] flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
              <MessageSquare className="w-9 h-9 opacity-35" />
              <p className="font-medium text-foreground/80">Select a case to preview</p>
              <p className="text-xs">Choose a row on the left, or double-click to open it.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <div className="text-[11px] font-mono text-muted-foreground tabular-nums">
                    {selected.reference}
                  </div>
                  <h2 className="text-xl font-semibold leading-snug tracking-tight">
                    {selected.subject}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={communicationCaseStatusTone(selected.status)}>
                      {prettyLabel(selected.status)}
                    </StatusBadge>
                    <StatusBadge tone={priorityTone(selected.priority)}>
                      {selected.priority} priority
                    </StatusBadge>
                    {selected.isOverdue ? (
                      <StatusBadge tone="critical">Overdue</StatusBadge>
                    ) : null}
                    {selected.unreadForStaff ? (
                      <StatusBadge tone="primary">Unread</StatusBadge>
                    ) : null}
                  </div>
                </div>
                <Button
                  variant="brand"
                  className="shrink-0"
                  onClick={() => setLocation(`/communications/cases/${selected.id}`)}
                  data-testid="button-open-case-workspace"
                >
                  Open workspace
                </Button>
              </div>

              <div className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  Summary
                </p>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {selected.summary || "No summary yet."}
                </p>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border border-border/60 bg-background px-3.5 py-3">
                  <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    Property
                  </dt>
                  <dd className="mt-1.5 text-sm font-medium">
                    {selected.propertyName || "—"}
                  </dd>
                </div>
                <div className="rounded-lg border border-border/60 bg-background px-3.5 py-3">
                  <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <UserRound className="h-3.5 w-3.5" />
                    Owner
                  </dt>
                  <dd className="mt-1.5 text-sm font-medium">
                    {selected.ownerDisplayName || (
                      <span className="text-amber-700">Unassigned</span>
                    )}
                  </dd>
                </div>
                <div className="rounded-lg border border-border/60 bg-background px-3.5 py-3">
                  <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Updated
                  </dt>
                  <dd className="mt-1.5 text-sm font-medium">
                    {whenLabel(selected.updatedAt)}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </section>
      </div>

      <style>{`
        .communications-inbox-grid {
          display: grid;
          grid-template-columns: 1fr;
        }
        @media (min-width: 950px) {
          .communications-inbox-grid {
            grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.2fr);
          }
        }
      `}</style>
    </div>
  );
}
