import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { BarChart3, Download } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricSummaryCard } from "@/components/workspace";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { pagePad } from "@/lib/responsive";
import {
  communicationCaseStatusTone,
  priorityTone,
} from "@shared/statusPriorityStyles";

type Analytics = {
  windowDays: number;
  volume: {
    totalCreated: number;
    openNow: number;
    resolved: number;
    unassigned: number;
    overdue: number;
    awaitingApproval?: number;
    reopened?: number;
  };
  slaPercent: number | null;
  medianFirstResponseMinutes: number | null;
  medianResolutionMinutes?: number | null;
  reopenedRate?: number | null;
  byCategory: Array<{ key: string | null; label: string; count: number }>;
  byTeam: Array<{
    name: string;
    openCount: number;
    resolvedCount: number;
    overdueCount: number;
  }>;
  attentionList: Array<{
    id: string;
    reference: string;
    subject: string;
    status: string;
    priority: string;
  }>;
  denominators: Record<string, string>;
};

export default function CommunicationsAnalytics() {
  const [days, setDays] = useState(30);
  const { toast } = useToast();

  const query = useQuery<Analytics>({
    queryKey: ["/api/communications/analytics", days],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/communications/analytics?days=${days}`);
      return res.json();
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/communications/analytics/export", { days });
      return res.json();
    },
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `communications-analytics-${days}d.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export downloaded (logged)" });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Export failed", description: e.message }),
  });

  const data = query.data;

  return (
    <div className={cn("container mx-auto min-w-0 space-y-6", pagePad)}>
      <PageHeader
        icon={BarChart3}
        title="Communications analytics"
        description="Volume, SLA, and attention across the communications hub"
        actions={
          <div className="flex flex-wrap gap-2">
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? "brand" : "outline"}
                onClick={() => setDays(d)}
              >
                {d}d
              </Button>
            ))}
            <Button
              variant="outline"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
            >
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
            <Button variant="outline" asChild>
              <Link href="/communications">Inbox</Link>
            </Button>
          </div>
        }
      />

      {query.isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[5.5rem] rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricSummaryCard
              label="Created"
              value={data.volume.totalCreated}
              subLabel={`Last ${data.windowDays} days`}
              tone="info"
            />
            <MetricSummaryCard
              label="Open now"
              value={data.volume.openNow}
              subLabel="Active"
              tone="warning"
            />
            <MetricSummaryCard
              label="SLA %"
              value={data.slaPercent != null ? `${data.slaPercent}%` : "—"}
              subLabel="First response met"
              tone={data.slaPercent != null && data.slaPercent < 80 ? "critical" : "success"}
            />
            <MetricSummaryCard
              label="Median 1st response"
              value={
                data.medianFirstResponseMinutes != null
                  ? `${data.medianFirstResponseMinutes}m`
                  : "—"
              }
              subLabel={
                data.medianResolutionMinutes != null
                  ? `Resolve ${data.medianResolutionMinutes}m`
                  : "Minutes"
              }
              tone="muted"
            />
            <MetricSummaryCard
              label="Overdue"
              value={data.volume.overdue}
              subLabel={`Unassigned ${data.volume.unassigned} · Reopen ${data.reopenedRate ?? 0}%`}
              tone={data.volume.overdue > 0 ? "critical" : "muted"}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border/80 bg-card p-4">
              <h3 className="font-medium mb-3">By category</h3>
              <ul className="space-y-2">
                {data.byCategory.map((c) => (
                  <li key={c.key || c.label} className="flex justify-between text-sm">
                    <span>{c.label}</span>
                    <span className="tabular-nums text-muted-foreground">{c.count}</span>
                  </li>
                ))}
                {!data.byCategory.length ? (
                  <li className="text-sm text-muted-foreground">No data in window</li>
                ) : null}
              </ul>
            </div>
            <div className="rounded-lg border border-border/80 bg-card p-4">
              <h3 className="font-medium mb-3">By owner</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Name</th>
                      <th className="pb-2 font-medium">Open</th>
                      <th className="pb-2 font-medium">Resolved</th>
                      <th className="pb-2 font-medium">Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byTeam.map((t, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="py-2">{t.name}</td>
                        <td className="py-2 tabular-nums">{t.openCount}</td>
                        <td className="py-2 tabular-nums">{t.resolvedCount}</td>
                        <td className="py-2 tabular-nums">{t.overdueCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/80 bg-card p-4">
            <h3 className="font-medium mb-3">Needs attention</h3>
            <ul className="space-y-2">
              {data.attentionList.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Link
                    href={`/communications/cases/${c.id}`}
                    className="text-primary hover:underline tabular-nums"
                  >
                    {c.reference}
                  </Link>
                  <span className="truncate max-w-[16rem]">{c.subject}</span>
                  <StatusBadge tone={communicationCaseStatusTone(c.status)}>
                    {c.status.replace(/_/g, " ")}
                  </StatusBadge>
                  <StatusBadge tone={priorityTone(c.priority)}>{c.priority}</StatusBadge>
                </li>
              ))}
              {!data.attentionList.length ? (
                <li className="text-sm text-muted-foreground">Nothing urgent right now</li>
              ) : null}
            </ul>
            <p className="text-xs text-muted-foreground mt-4">
              {data.denominators.slaPercent}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
