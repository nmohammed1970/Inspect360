import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Download, Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { FeedbackStatusBadge } from "@/components/feedback/FeedbackBadges";
import { pagePad } from "@/lib/responsive";
import { PageHeader } from "@/components/PageHeader";
import { feedbackStatusLabel } from "@shared/feedbackLabels";

type Report = {
  total: number;
  newThisMonth: number;
  byStatus: Record<string, number>;
  byOrganization: Record<string, number>;
  rows: Array<{
    id: string;
    reference: string;
    subject: string;
    status: string;
    organizationNameSnapshot: string | null;
    reporterNameSnapshot: string | null;
    reporterEmailSnapshot: string | null;
    assignedToUserId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

export default function AdminFeatureRequests() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState({ from: "", to: "" });

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (applied.from) params.set("from", applied.from);
    if (applied.to) params.set("to", applied.to);
    return `/api/admin/feedback/feature-report?${params.toString()}`;
  }, [applied]);

  const { data, isLoading } = useQuery<Report>({
    queryKey: [queryUrl],
  });

  const statusEntries = Object.entries(data?.byStatus || {});

  return (
    <div className={pagePad}>
      <PageHeader
        icon={Lightbulb}
        title="Feature Requests"
        description="Planned is not a commitment. Closed does not mean delivered."
        className="mb-6"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/feedback">Back to Inbox</Link>
            </Button>
            <Button asChild>
              <a href="/api/admin/feedback/feature-report/export" download>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </a>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total feature requests</p>
            <p className="text-2xl font-bold">{data?.total ?? "—"}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-sky-500">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">New this month</p>
            <p className="text-2xl font-bold">{data?.newThisMonth ?? "—"}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 md:col-span-2">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground mb-2">By status</p>
            <div className="flex flex-wrap gap-2">
              {statusEntries.length === 0 ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : (
                statusEntries.map(([status, count]) => (
                  <span key={status} className="text-sm">
                    <span className="font-medium">{feedbackStatusLabel(status)}</span>: {count}
                  </span>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {!!data?.byOrganization && Object.keys(data.byOrganization).length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-2">By organisation</p>
            <div className="flex flex-wrap gap-3 text-sm">
              {Object.entries(data.byOrganization).map(([name, count]) => (
                <span key={name} className="rounded-md border px-2 py-1">
                  {name}: <strong>{count}</strong>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <FiltersSection headingId="feature-request-filters">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="fr-from">From</Label>
            <Input id="fr-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fr-to">To</Label>
            <Input id="fr-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => setApplied({ from, to })}>Apply</Button>
          </div>
        </div>
      </FiltersSection>

      <Card className="mt-4">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !data?.rows?.length ? (
            <p className="p-8 text-center text-muted-foreground">No feature requests in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Organisation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
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
                      <TableCell className="max-w-[280px] truncate">{row.subject}</TableCell>
                      <TableCell>{row.organizationNameSnapshot || "—"}</TableCell>
                      <TableCell>
                        <FeedbackStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {row.createdAt ? format(new Date(row.createdAt), "dd MMM yyyy") : "—"}
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
