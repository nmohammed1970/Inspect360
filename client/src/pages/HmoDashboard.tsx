import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Briefcase, FolderOpen, Home } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { pagePad } from "@/lib/responsive";
import {
  formatHmoDate,
  hmoCaseStatusMeta,
  hmoSeverityMeta,
} from "@/components/hmo/hmoLabels";
import { cn } from "@/lib/utils";

type DashboardPayload = {
  asOf: string;
  propertyCount: number;
  critical: number;
  actionRequired: number;
  reviewRequired: number;
  compliant: number;
  openCaseCount: number;
  openTaskCount: number;
  cases: Array<{
    id: string;
    caseReference: string;
    propertyId: string;
    severity: string;
    status: string;
    dueAt?: string | null;
  }>;
  profiles: Array<{
    propertyId: string;
    overallStatus: string | null;
    evidenceCompleteness: number | null;
  }>;
};

export default function HmoDashboard() {
  const { data, isLoading, error } = useQuery<DashboardPayload>({
    queryKey: ["/api/hmo/dashboard"],
  });

  return (
    <div className={pagePad} data-testid="hmo-dashboard">
      <PageHeader
        title="HMO Compliance"
        description="Portfolio view of licensing status, open cases, and evidence coverage."
        actions={
          <Button asChild variant="outline">
            <Link href="/properties">Browse properties</Link>
          </Button>
        }
      />

      {isLoading && <p className="text-sm text-muted-foreground">Loading portfolio metrics…</p>}
      {error && (
        <p className="text-sm text-destructive">
          Failed to load HMO dashboard. Check that the HMO Compliance module is enabled.
        </p>
      )}

      {data && (
        <>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between mb-3">
            <p className="text-sm text-muted-foreground">
              Licensing health across your HMO properties
            </p>
            <p className="text-xs text-muted-foreground">
              Updated {new Date(data.asOf).toLocaleString()}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6">
            <StatCard
              label="Properties"
              value={data.propertyCount}
              hint="Tracked for HMO"
              icon={<Home className="h-4 w-4 md:h-5 md:w-5 text-primary" />}
              borderClass="border-l-primary"
              valueClass=""
              iconWrapClass="bg-primary/10"
            />
            <StatCard
              label="Open cases"
              value={data.openCaseCount}
              hint="Active remediation"
              icon={<FolderOpen className="h-4 w-4 md:h-5 md:w-5 text-primary" />}
              borderClass="border-l-primary"
              valueClass=""
              iconWrapClass="bg-primary/10"
            />
            <StatCard
              label="Open tasks"
              value={data.openTaskCount}
              hint="Across all cases"
              icon={<Briefcase className="h-4 w-4 md:h-5 md:w-5 text-primary" />}
              borderClass="border-l-primary"
              valueClass=""
              iconWrapClass="bg-primary/10"
              className="col-span-2 md:col-span-1"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Open cases</CardTitle>
              <CardDescription>
                Click a case to assign work, request evidence, or close after review.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.cases.length === 0 && (
                <p className="text-sm text-muted-foreground">No open HMO cases right now.</p>
              )}
              {data.cases.map((c) => {
                const sev = hmoSeverityMeta(c.severity);
                const evidencePct =
                  data.profiles?.find((p) => p.propertyId === c.propertyId)?.evidenceCompleteness ??
                  0;
                return (
                  <div
                    key={c.id}
                    className="rounded-lg border px-3 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <Link href={`/hmo/cases/${c.id}`} className="min-w-0 space-y-1 flex-1 block">
                      <div className="font-medium text-foreground hover:underline">
                        {c.caseReference}
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <Badge variant="outline" className={sev.className}>
                          {sev.label} priority
                        </Badge>
                        <Badge variant="outline" className={hmoCaseStatusMeta(c.status).className}>
                          {hmoCaseStatusMeta(c.status).label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Evidence {evidencePct}%
                        </span>
                        {c.dueAt && (
                          <span className="text-xs text-muted-foreground">
                            Due {formatHmoDate(c.dueAt)}
                          </span>
                        )}
                      </div>
                    </Link>
                    <div className="flex flex-wrap gap-2 items-center shrink-0">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/properties/${c.propertyId}?tab=hmo`}>View property</Link>
                      </Button>
                      <Button asChild size="sm">
                        <Link href={`/hmo/cases/${c.id}`}>Open case</Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
  borderClass,
  valueClass,
  iconWrapClass,
  className,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  borderClass: string;
  valueClass: string;
  iconWrapClass: string;
  className?: string;
}) {
  return (
    <Card className={cn("border-l-4", borderClass, className)}>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-muted-foreground">{label}</p>
            <p className={cn("text-xl md:text-2xl font-bold tabular-nums", valueClass)}>{value}</p>
            <p className="text-xs text-muted-foreground hidden md:block mt-0.5">{hint}</p>
          </div>
          <div className={cn("p-1.5 md:p-2 rounded-full shrink-0", iconWrapClass)}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
