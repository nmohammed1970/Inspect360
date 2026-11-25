import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  MessageSquare,
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

const QUEUES: Array<{ id: string; label: string; metricKey?: keyof Metrics }> = [
  { id: "all", label: "All open", metricKey: "openCount" },
  { id: "my_cases", label: "My cases", metricKey: "myCases" },
  { id: "unassigned", label: "Unassigned", metricKey: "unassigned" },
  { id: "urgent", label: "Urgent", metricKey: "urgent" },
  { id: "overdue", label: "Overdue", metricKey: "overdue" },
  { id: "awaiting_approval", label: "Awaiting approval", metricKey: "awaitingApproval" },
  { id: "awaiting_tenant", label: "Awaiting tenant", metricKey: "awaitingTenant" },
  { id: "closed", label: "Closed" },
];

function whenLabel(iso?: string | null) {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
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
    <div className={cn("container mx-auto min-w-0 space-y-4 md:space-y-6", pagePad)}>
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
            <Skeleton key={i} className="h-[5.5rem] rounded-lg" />
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
        className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 -mx-1 px-1"
        role="tablist"
        aria-label="Queues"
        data-testid="communications-queues"
      >
        {QUEUES.map((queue) => {
          const count =
            queue.metricKey && metrics ? metrics[queue.metricKey] : undefined;
          const active = view === queue.id;
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
                "shrink-0 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 text-foreground font-medium"
                  : "border-border/80 bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              data-testid={`queue-${queue.id}`}
            >
              <span className="whitespace-nowrap">{queue.label}</span>
              {typeof count === "number" ? (
                <span
                  className={cn(
                    "tabular-nums text-xs rounded-full min-w-[1.25rem] px-1.5 py-0.5 text-center",
                    active ? "bg-primary/15 text-foreground" : "bg-muted text-muted-foreground",
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
        className="communications-inbox-grid rounded-lg border border-border/80 bg-card overflow-hidden min-h-[28rem]"
        data-testid="communications-inbox"
      >
        <section className="border-b md:border-b-0 md:border-r border-border/80 flex flex-col min-h-0" aria-label="Case list">
          <div className="p-2 border-b border-border/60">
            <Input
              placeholder="Search reference, subject…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="input-communications-search"
            />
          </div>
          <div className="flex-1 overflow-y-auto max-h-[22rem] md:max-h-[calc(100vh-22rem)]">
            {casesQuery.isLoading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No cases in this queue
              </div>
            ) : (
              items.map((c) => {
                const active = selected?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    onDoubleClick={() => setLocation(`/communications/cases/${c.id}`)}
                    className={cn(
                      "w-full text-left px-3 py-3 border-b border-border/40 transition-colors",
                      active ? "bg-primary/5" : "hover:bg-muted/40",
                      c.unreadForStaff && "font-medium",
                    )}
                    data-testid={`case-row-${c.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {c.reference}
                        </div>
                        <div className="truncate text-sm">{c.subject}</div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {c.propertyName || "No property"} · {whenLabel(c.updatedAt)}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <StatusBadge tone={priorityTone(c.priority)}>{c.priority}</StatusBadge>
                        {c.isOverdue ? (
                          <span className="text-[10px] uppercase tracking-wide text-[color:var(--brand-critical)]">
                            Overdue
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="p-4 min-h-[12rem]" aria-label="Case preview">
          {!selected ? (
            <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
              <MessageSquare className="w-8 h-8 opacity-40" />
              Select a case to preview
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {selected.reference}
                  </div>
                  <h2 className="text-lg font-semibold leading-snug">{selected.subject}</h2>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <StatusBadge tone={communicationCaseStatusTone(selected.status)}>
                      {selected.status.replace(/_/g, " ")}
                    </StatusBadge>
                    <StatusBadge tone={priorityTone(selected.priority)}>
                      {selected.priority}
                    </StatusBadge>
                  </div>
                </div>
                <Button
                  variant="brand"
                  onClick={() => setLocation(`/communications/cases/${selected.id}`)}
                  data-testid="button-open-case-workspace"
                >
                  Open workspace
                </Button>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {selected.summary || "No summary yet."}
              </p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Property</dt>
                  <dd>{selected.propertyName || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd>{selected.ownerDisplayName || "Unassigned"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd>{whenLabel(selected.updatedAt)}</dd>
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
            grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.25fr);
          }
        }
      `}</style>
    </div>
  );
}
