import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Home,
  Scale,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { FiltersSection } from "@/components/FiltersSection";
import { ClearFiltersButton } from "@/components/ClearFiltersButton";
import { pagePad } from "@/lib/responsive";
import { formatHmoDate, hmoLifecycleLabel, hmoOverallStatusMeta } from "@/components/hmo/hmoLabels";
import { cn } from "@/lib/utils";

type DashboardProfile = {
  propertyId: string;
  overallStatus: string | null;
  evidenceCompleteness: number | null;
  lastAssessedAt?: string | null;
  address?: string | null;
  name?: string | null;
  borough?: string | null;
  expiryDate?: string | null;
  licenceStatus?: string | null;
  maxPersons?: number | null;
  occupantsNow?: number | null;
  alertCount?: number;
  nextAction?: string | null;
  managerName?: string | null;
};

type DashboardPayload = {
  asOf: string;
  propertyCount: number;
  compliant: number;
  nonCompliant: number;
  needsAttention: number;
  renewalsDue: number;
  rulesReviewNeeded: number;
  counters?: {
    totalHmos: number;
    compliant: number;
    nonCompliant: number;
    needsAttention: number;
    renewalsDue: number;
    rulesReviewNeeded: number;
  };
  profiles: DashboardProfile[];
};

export default function HmoDashboard() {
  const { data, isLoading, error } = useQuery<DashboardPayload>({
    queryKey: ["/api/hmo/dashboard"],
  });

  const [addressQ, setAddressQ] = useState("");
  const [boroughQ, setBoroughQ] = useState("");
  const [licenceStatus, setLicenceStatus] = useState("all");
  const [overallStatus, setOverallStatus] = useState("all");
  const [managerQ, setManagerQ] = useState("");
  const [renewalWindow, setRenewalWindow] = useState("all");
  const [alertFilter, setAlertFilter] = useState("all");

  const hasActiveFilters =
    addressQ.trim() !== "" ||
    boroughQ.trim() !== "" ||
    licenceStatus !== "all" ||
    overallStatus !== "all" ||
    managerQ.trim() !== "" ||
    renewalWindow !== "all" ||
    alertFilter !== "all";

  const clearAllFilters = () => {
    setAddressQ("");
    setBoroughQ("");
    setLicenceStatus("all");
    setOverallStatus("all");
    setManagerQ("");
    setRenewalWindow("all");
    setAlertFilter("all");
  };

  const filtered = useMemo(() => {
    const rows = data?.profiles || [];
    const now = Date.now();
    return rows.filter((p) => {
      const addr = (p.address || p.name || "").toLowerCase();
      if (addressQ.trim() && !addr.includes(addressQ.trim().toLowerCase())) return false;
      if (
        boroughQ.trim() &&
        !(p.borough || "").toLowerCase().includes(boroughQ.trim().toLowerCase())
      ) {
        return false;
      }
      if (licenceStatus !== "all" && p.licenceStatus !== licenceStatus) return false;
      if (overallStatus !== "all" && (p.overallStatus || "NOT_ASSESSED") !== overallStatus) {
        return false;
      }
      if (
        managerQ.trim() &&
        !(p.managerName || "").toLowerCase().includes(managerQ.trim().toLowerCase())
      ) {
        return false;
      }
      if (renewalWindow !== "all" && p.expiryDate) {
        const days = Math.ceil(
          (new Date(p.expiryDate).getTime() - now) / (24 * 60 * 60 * 1000),
        );
        if (renewalWindow === "expired" && days >= 0) return false;
        if (renewalWindow === "7" && !(days >= 0 && days <= 7)) return false;
        if (renewalWindow === "30" && !(days >= 0 && days <= 30)) return false;
        if (renewalWindow === "90" && !(days >= 0 && days <= 90)) return false;
      } else if (renewalWindow !== "all" && !p.expiryDate) {
        return false;
      }
      if (alertFilter === "has" && !(p.alertCount && p.alertCount > 0)) return false;
      if (alertFilter === "none" && p.alertCount && p.alertCount > 0) return false;
      return true;
    });
  }, [
    data?.profiles,
    addressQ,
    boroughQ,
    licenceStatus,
    overallStatus,
    managerQ,
    renewalWindow,
    alertFilter,
  ]);

  const counters = data?.counters || {
    totalHmos: data?.propertyCount || 0,
    compliant: data?.compliant || 0,
    nonCompliant: data?.nonCompliant || 0,
    needsAttention: data?.needsAttention || 0,
    renewalsDue: data?.renewalsDue || 0,
    rulesReviewNeeded: data?.rulesReviewNeeded || 0,
  };

  return (
    <div
      className={cn("container mx-auto min-w-0 space-y-4 md:space-y-6", pagePad)}
      data-testid="hmo-dashboard"
    >
      <PageHeader
        icon={Shield}
        title="HMO Compliance"
        description="Portfolio licensing health — open a row to work the property HMO tab."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/hmo/rules">Council rules</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/properties">Browse properties</Link>
            </Button>
          </div>
        }
      />

      {isLoading && (
        <p className="text-base text-muted-foreground">Loading portfolio metrics…</p>
      )}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4">
          <p className="text-base font-medium text-destructive">Failed to load HMO dashboard</p>
        </div>
      )}

      {data && (
        <div className="space-y-4 md:space-y-6">
          <p className="text-sm text-muted-foreground">
            Updated {new Date(data.asOf).toLocaleString()}
          </p>

          {/* Summary cards — same pattern as Compliance page */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
            <Card>
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm font-medium text-muted-foreground">
                      Total HMOs
                    </p>
                    <p className="text-xl md:text-2xl font-bold" data-testid="stat-total-hmos">
                      {counters.totalHmos}
                    </p>
                  </div>
                  <div className="p-1.5 md:p-2 bg-primary/10 rounded-full">
                    <Home className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm font-medium text-muted-foreground">
                      Compliant
                    </p>
                    <p
                      className="text-xl md:text-2xl font-bold text-green-600"
                      data-testid="stat-compliant"
                    >
                      {counters.compliant}
                    </p>
                  </div>
                  <div className="p-1.5 md:p-2 bg-green-500/10 rounded-full">
                    <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-destructive">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm font-medium text-muted-foreground">
                      Non-compliant
                    </p>
                    <p
                      className="text-xl md:text-2xl font-bold text-destructive"
                      data-testid="stat-non-compliant"
                    >
                      {counters.nonCompliant}
                    </p>
                  </div>
                  <div className="p-1.5 md:p-2 bg-destructive/10 rounded-full">
                    <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-destructive" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-yellow-500">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm font-medium text-muted-foreground">
                      Needs attention
                    </p>
                    <p
                      className="text-xl md:text-2xl font-bold text-yellow-600"
                      data-testid="stat-needs-attention"
                    >
                      {counters.needsAttention}
                    </p>
                  </div>
                  <div className="p-1.5 md:p-2 bg-yellow-500/10 rounded-full">
                    <ClipboardList className="h-4 w-4 md:h-5 md:w-5 text-yellow-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-orange-500">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm font-medium text-muted-foreground">
                      Renewals due
                    </p>
                    <p
                      className="text-xl md:text-2xl font-bold text-orange-600"
                      data-testid="stat-renewals-due"
                    >
                      {counters.renewalsDue}
                    </p>
                    <p className="text-xs text-muted-foreground hidden md:block">
                      Within 90 days
                    </p>
                  </div>
                  <div className="p-1.5 md:p-2 bg-orange-500/10 rounded-full">
                    <Calendar className="h-4 w-4 md:h-5 md:w-5 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-sky-500">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm font-medium text-muted-foreground">
                      Rules review
                    </p>
                    <p
                      className="text-xl md:text-2xl font-bold text-sky-700"
                      data-testid="stat-rules-review"
                    >
                      {counters.rulesReviewNeeded}
                    </p>
                  </div>
                  <div className="p-1.5 md:p-2 bg-sky-500/10 rounded-full">
                    <Scale className="h-4 w-4 md:h-5 md:w-5 text-sky-700" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <FiltersSection
            headingId="hmo-filters-heading"
            headingEnd={
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {filtered.length} shown
              </span>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Address</Label>
                <Input
                  value={addressQ}
                  onChange={(e) => setAddressQ(e.target.value)}
                  placeholder="Search…"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Borough</Label>
                <Input
                  value={boroughQ}
                  onChange={(e) => setBoroughQ(e.target.value)}
                  placeholder="Search…"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Licence status</Label>
                <Select value={licenceStatus} onValueChange={setLicenceStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="CURRENT">Current</SelectItem>
                    <SelectItem value="EXPIRED_DOCUMENT">Expired document</SelectItem>
                    <SelectItem value="RENEWAL_PENDING_EVIDENCE">Renewal pending</SelectItem>
                    <SelectItem value="UNDER_REVIEW">Under review</SelectItem>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Overall status</Label>
                <Select value={overallStatus} onValueChange={setOverallStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="VERIFIED_COMPLIANT">Compliant</SelectItem>
                    <SelectItem value="ACTION_REQUIRED">Non-compliant</SelectItem>
                    <SelectItem value="CRITICAL_EXCEPTION">Critical / Non-compliant</SelectItem>
                    <SelectItem value="REVIEW_REQUIRED">Needs attention</SelectItem>
                    <SelectItem value="NOT_ASSESSED">Not assessed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Manager</Label>
                <Input
                  value={managerQ}
                  onChange={(e) => setManagerQ(e.target.value)}
                  placeholder="Search…"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Renewal window</Label>
                <Select value={renewalWindow} onValueChange={setRenewalWindow}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="90">Within 90 days</SelectItem>
                    <SelectItem value="30">Within 30 days</SelectItem>
                    <SelectItem value="7">Within 7 days</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Alerts</Label>
                <Select value={alertFilter} onValueChange={setAlertFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="has">Has alerts</SelectItem>
                    <SelectItem value="none">No alerts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <div className="flex items-end">
                  <ClearFiltersButton className="w-full" onClick={clearAllFilters} />
                </div>
              )}
            </div>
          </FiltersSection>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Properties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {filtered.length === 0 && (
                <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                  No properties match these filters.
                </div>
              )}
              <div className="hidden lg:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_0.7fr_1.2fr_auto] gap-2 px-2 text-xs font-medium text-muted-foreground">
                <span>Property</span>
                <span>Borough</span>
                <span>Expiry</span>
                <span>Occupants</span>
                <span>Compliance</span>
                <span>Alerts</span>
                <span>Next action</span>
                <span />
              </div>
              {filtered.map((p) => {
                const statusMeta = hmoOverallStatusMeta(p.overallStatus);
                const occ = p.occupantsNow == null ? "Unknown" : String(p.occupantsNow);
                const allowed = p.maxPersons == null ? "Unknown" : String(p.maxPersons);
                const isBad =
                  p.overallStatus === "ACTION_REQUIRED" ||
                  p.overallStatus === "CRITICAL_EXCEPTION";
                return (
                  <Link
                    key={p.propertyId}
                    href={`/properties/${p.propertyId}?tab=hmo`}
                    className={cn(
                      "block rounded-xl border px-3 py-3 hover:bg-muted/30 transition-colors",
                      isBad && "border-l-4 border-l-destructive",
                      p.overallStatus === "REVIEW_REQUIRED" && "border-l-4 border-l-yellow-500",
                      p.overallStatus === "VERIFIED_COMPLIANT" && "border-l-4 border-l-green-500",
                    )}
                  >
                    <div className="lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_0.7fr_1.2fr_auto] gap-2 items-center">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {p.name || p.address || "Property"}
                        </p>
                        {p.address && p.name && (
                          <p className="text-xs text-muted-foreground truncate">{p.address}</p>
                        )}
                        {p.licenceStatus && (
                          <p className="text-xs text-muted-foreground lg:hidden">
                            {hmoLifecycleLabel(p.licenceStatus)}
                          </p>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 lg:mt-0">
                        {p.borough || "—"}
                      </p>
                      <p className="text-sm">
                        {p.expiryDate ? formatHmoDate(String(p.expiryDate)) : "—"}
                      </p>
                      <p className="text-sm tabular-nums">
                        {occ} / {allowed}
                      </p>
                      <Badge variant="outline" className={cn("w-fit", statusMeta.className)}>
                        {statusMeta.label}
                      </Badge>
                      <p className="text-sm tabular-nums">{p.alertCount ?? 0}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {p.nextAction || "—"}
                      </p>
                      <span className="inline-flex items-center text-sm text-primary font-medium">
                        Open <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
