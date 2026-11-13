import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Briefcase,
  CheckCircle2,
  FolderOpen,
  Home,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { pagePad } from "@/lib/responsive";
import {
  formatHmoDate,
  hmoCaseStatusMeta,
  hmoOverallStatusMeta,
  hmoSeverityMeta,
} from "@/components/hmo/hmoLabels";
import { cn } from "@/lib/utils";

type DashboardPayload = {
  asOf: string;
  propertyCount: number;
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
    lastAssessedAt?: string | null;
  }>;
};

type PropertyRow = {
  id: string;
  name?: string | null;
  address?: string | null;
};

export default function HmoDashboard() {
  const { data, isLoading, error } = useQuery<DashboardPayload>({
    queryKey: ["/api/hmo/dashboard"],
  });

  const { data: properties } = useQuery<PropertyRow[]>({
    queryKey: ["/api/properties"],
  });

  const propertyNameById = new Map(
    (properties || []).map((p) => [
      p.id,
      p.name?.trim() || p.address?.trim() || "Property",
    ]),
  );
  const propertyAddressById = new Map(
    (properties || []).map((p) => [p.id, p.address?.trim() || ""]),
  );

  const sortedProfiles = [...(data?.profiles || [])].sort((a, b) => {
    const rank = (s: string | null) => {
      switch (s) {
        case "CRITICAL_EXCEPTION":
          return 0;
        case "ACTION_REQUIRED":
          return 1;
        case "REVIEW_REQUIRED":
          return 2;
        case "NOT_ASSESSED":
        case null:
          return 3;
        case "VERIFIED_COMPLIANT":
          return 4;
        default:
          return 5;
      }
    };
    return rank(a.overallStatus) - rank(b.overallStatus);
  });

  return (
    <div className={cn("container mx-auto min-w-0 space-y-4 md:space-y-6", pagePad)} data-testid="hmo-dashboard">
      <PageHeader
        title="HMO Compliance"
        description="Portfolio licensing health, open remediation work, and every tracked HMO property — open a property tab to upload a licence or a case to clear findings."
        actions={
          <Button asChild variant="outline">
            <Link href="/properties">Browse properties</Link>
          </Button>
        }
      />

      {isLoading && (
        <p className="text-base text-muted-foreground">Loading portfolio metrics…</p>
      )}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4">
          <p className="text-base font-medium text-destructive">Failed to load HMO dashboard</p>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Check that the HMO Compliance module is enabled for your organisation.
          </p>
        </div>
      )}

      {data && (
        <div className="space-y-4 md:space-y-6">
          <p className="text-sm text-muted-foreground">
            Updated {new Date(data.asOf).toLocaleString()}
          </p>

          <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg md:text-xl font-semibold tracking-tight">Workload</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Active remediation across the portfolio. Cases hold tasks; tasks collect evidence.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
              <StatCard
                label="Properties tracked"
                value={data.propertyCount}
                hint="With an HMO profile"
                icon={<Home className="h-5 w-5 text-primary" />}
                borderClass="border-l-primary"
                valueClass=""
                iconWrapClass="bg-primary/10"
              />
              <StatCard
                label="Open cases"
                value={data.openCaseCount}
                hint="Need remediation work"
                icon={<FolderOpen className="h-5 w-5 text-amber-700" />}
                borderClass="border-l-amber-500"
                valueClass={data.openCaseCount > 0 ? "text-amber-800" : ""}
                iconWrapClass="bg-amber-500/10"
              />
              <StatCard
                label="Open tasks"
                value={data.openTaskCount}
                hint="Across all open cases"
                icon={<Briefcase className="h-5 w-5 text-primary" />}
                borderClass="border-l-primary"
                valueClass=""
                iconWrapClass="bg-primary/10"
              />
            </div>
          </section>

          <Card className="shadow-none">
            <CardHeader className="space-y-1.5 pb-4">
              <CardTitle className="text-lg md:text-xl">Open cases</CardTitle>
              <CardDescription className="text-sm md:text-base leading-relaxed">
                Click a case to assign work, request evidence, or close after review. Use “View
                property” for that property’s licence panel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.cases.length === 0 && (
                <div className="rounded-xl border border-dashed px-4 py-12 text-center space-y-2">
                  <CheckCircle2 className="h-9 w-9 mx-auto text-emerald-600/70" />
                  <p className="text-base font-semibold">No open HMO cases</p>
                  <p className="text-sm md:text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
                    When assessment finds critical expiry, missing schedules, or other licence
                    issues, remediation cases appear here.
                  </p>
                </div>
              )}
              {data.cases.map((c) => {
                const sev = hmoSeverityMeta(c.severity);
                const evidencePct =
                  data.profiles?.find((p) => p.propertyId === c.propertyId)?.evidenceCompleteness ??
                  0;
                const propName = propertyNameById.get(c.propertyId) || "Property";
                const propAddress = propertyAddressById.get(c.propertyId);
                return (
                  <div
                    key={c.id}
                    className="rounded-xl border px-4 py-4 md:px-5 md:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
                  >
                    <Link href={`/hmo/cases/${c.id}`} className="min-w-0 space-y-2 flex-1 block">
                      <div className="text-base md:text-lg font-semibold text-foreground hover:underline">
                        {c.caseReference}
                      </div>
                      <div className="text-sm text-muted-foreground leading-relaxed">
                        <span className="font-medium text-foreground">{propName}</span>
                        {propAddress ? ` · ${propAddress}` : null}
                      </div>
                      <div className="flex flex-wrap gap-2 items-center pt-0.5">
                        <Badge variant="outline" className={sev.className}>
                          {sev.label} priority
                        </Badge>
                        <Badge variant="outline" className={hmoCaseStatusMeta(c.status).className}>
                          {hmoCaseStatusMeta(c.status).label}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Evidence {evidencePct}%
                        </span>
                        {c.dueAt && (
                          <span className="text-sm text-muted-foreground">
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
                        <Link href={`/hmo/cases/${c.id}`}>
                          Open case
                          <ArrowRight className="h-4 w-4 ml-1.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader className="space-y-1.5 pb-4">
              <CardTitle className="text-lg md:text-xl">Properties</CardTitle>
              <CardDescription className="text-sm md:text-base leading-relaxed">
                Every property with an HMO profile, sorted so risk shows first. Open the HMO tab to
                upload a licence or re-run assessment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {sortedProfiles.length === 0 && (
                <div className="rounded-xl border border-dashed px-4 py-10 text-center space-y-2">
                  <Home className="h-8 w-8 mx-auto text-muted-foreground/60" />
                  <p className="text-base font-semibold">No HMO properties yet</p>
                  <p className="text-sm md:text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
                    Open a property and use the HMO tab to upload a licence — a profile is created
                    when you start.
                  </p>
                  <Button asChild variant="outline" className="mt-2">
                    <Link href="/properties">Browse properties</Link>
                  </Button>
                </div>
              )}
              {sortedProfiles.map((p) => {
                const statusMeta = hmoOverallStatusMeta(p.overallStatus);
                const name = propertyNameById.get(p.propertyId) || "Property";
                const address = propertyAddressById.get(p.propertyId);
                const evidencePct = p.evidenceCompleteness ?? 0;
                return (
                  <div
                    key={p.propertyId}
                    className="rounded-xl border px-4 py-4 md:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0 space-y-2 flex-1">
                      <div className="text-base font-semibold">{name}</div>
                      {address ? (
                        <p className="text-sm text-muted-foreground leading-relaxed">{address}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-2 items-center">
                        <Badge variant="outline" className={statusMeta.className}>
                          {statusMeta.label}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Evidence {evidencePct}%
                        </span>
                        {p.lastAssessedAt && (
                          <span className="text-sm text-muted-foreground">
                            Assessed {formatHmoDate(String(p.lastAssessedAt))}
                          </span>
                        )}
                      </div>
                      <div className="h-2 w-full max-w-xs rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            evidencePct >= 80
                              ? "bg-emerald-500"
                              : evidencePct >= 40
                                ? "bg-amber-500"
                                : "bg-rose-500",
                          )}
                          style={{ width: `${Math.max(0, Math.min(100, evidencePct))}%` }}
                        />
                      </div>
                    </div>
                    <Button asChild size="sm" className="shrink-0">
                      <Link href={`/properties/${p.propertyId}?tab=hmo`}>
                        Open HMO tab
                        <ArrowRight className="h-4 w-4 ml-1.5" />
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
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
    <Card className={cn("border-l-4 shadow-none", borderClass, className)}>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className={cn("text-2xl md:text-3xl font-bold tabular-nums tracking-tight", valueClass)}>
              {value}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">{hint}</p>
          </div>
          <div className={cn("p-2.5 rounded-full shrink-0", iconWrapClass)}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
