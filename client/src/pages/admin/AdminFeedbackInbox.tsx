import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  Inbox,
  Clock,
  MessageCircle,
  CheckCircle2,
  Lightbulb,
  Search,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { FiltersSection } from "@/components/FiltersSection";
import { FeedbackStatusBadge, FeedbackTypeBadge } from "@/components/feedback/FeedbackBadges";
import { pagePad } from "@/lib/responsive";
import { PageHeader } from "@/components/PageHeader";
import { FEEDBACK_STATUSES, FEEDBACK_TYPES } from "@shared/feedbackSchema";
import { feedbackStatusLabel, feedbackTypeLabel } from "@shared/feedbackLabels";

type InboxResponse = {
  rows: Array<{
    id: string;
    reference: string;
    type: string;
    subject: string;
    status: string;
    organizationNameSnapshot: string | null;
    reporterNameSnapshot: string | null;
    reporterEmailSnapshot: string | null;
    assignedToUserId: string | null;
    updatedAt: string;
    createdAt: string;
  }>;
  total: number;
  counters: {
    new: number;
    inReview: number;
    waitingOnUser: number;
    resolvedClosed: number;
    featureRequests: number;
  };
};

export default function AdminFeedbackInbox() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [applied, setApplied] = useState({ q: "", type: "all", status: "all" });

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (applied.q) params.set("q", applied.q);
    if (applied.type !== "all") params.set("type", applied.type);
    if (applied.status !== "all") {
      params.set("status", applied.status);
      params.set("open", "false");
    }
    return `/api/admin/feedback?${params.toString()}`;
  }, [applied]);

  const { data, isLoading } = useQuery<InboxResponse>({
    queryKey: [queryUrl],
  });

  const counters = data?.counters || {
    new: 0,
    inReview: 0,
    waitingOnUser: 0,
    resolvedClosed: 0,
    featureRequests: 0,
  };

  const kpis = [
    { label: "New", value: counters.new, border: "border-l-sky-500", icon: Inbox, iconBg: "bg-sky-500/10", iconColor: "text-sky-700" },
    { label: "In Review", value: counters.inReview, border: "border-l-amber-500", icon: Clock, iconBg: "bg-amber-500/10", iconColor: "text-amber-700" },
    { label: "Waiting on User", value: counters.waitingOnUser, border: "border-l-orange-500", icon: MessageCircle, iconBg: "bg-orange-500/10", iconColor: "text-orange-700" },
    { label: "Resolved / Closed", value: counters.resolvedClosed, border: "border-l-emerald-500", icon: CheckCircle2, iconBg: "bg-emerald-500/10", iconColor: "text-emerald-700" },
    { label: "Feature Requests", value: counters.featureRequests, border: "border-l-violet-500", icon: Lightbulb, iconBg: "bg-violet-500/10", iconColor: "text-violet-700" },
  ];

  return (
    <div className={pagePad}>
      <PageHeader
        icon={Inbox}
        title="Feedback Inbox"
        description="Triage issues, feature requests, and questions from organisations."
        className="mb-6"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/feedback/feature-requests">Feature Requests</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/feedback/team">Feature Admin Team</Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className={`border-l-4 ${kpi.border}`}>
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm font-medium text-muted-foreground">{kpi.label}</p>
                  <p className="text-xl md:text-2xl font-bold">{kpi.value}</p>
                </div>
                <div className={`p-1.5 md:p-2 ${kpi.iconBg} rounded-full`}>
                  <kpi.icon className={`h-4 w-4 md:h-5 md:w-5 ${kpi.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <FiltersSection headingId="admin-feedback-filters">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search reference, subject, description, submitter…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {FEEDBACK_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {feedbackTypeLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Open statuses</SelectItem>
              {FEEDBACK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {feedbackStatusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3">
          <Button
            onClick={() => setApplied({ q: q.trim(), type, status })}
            data-testid="button-apply-feedback-filters"
          >
            Apply filters
          </Button>
        </div>
      </FiltersSection>

      <Card className="mt-4">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !data?.rows?.length ? (
            <p className="p-8 text-center text-muted-foreground">No feedback matches these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Organisation</TableHead>
                    <TableHead>Submitter</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link
                          href={`/admin/feedback/${row.id}`}
                          className="font-mono text-sm text-primary hover:underline"
                        >
                          {row.reference}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <FeedbackTypeBadge type={row.type} />
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate">
                        <Link href={`/admin/feedback/${row.id}`} className="hover:underline">
                          {row.subject}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{row.organizationNameSnapshot || "—"}</TableCell>
                      <TableCell className="text-sm">
                        <div>{row.reporterNameSnapshot || "—"}</div>
                        <div className="text-xs text-muted-foreground">{row.reporterEmailSnapshot}</div>
                      </TableCell>
                      <TableCell>
                        <FeedbackStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {row.updatedAt ? format(new Date(row.updatedAt), "dd MMM yyyy") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
