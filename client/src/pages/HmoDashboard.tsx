import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  Filter,
  Home,
  Scale,
  Search,
  Shield,
  Users,
  Wrench,
  X,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  licenceEvidenceStatus?: string | null;
  hmoClassification?: string | null;
  maxPersons?: number | null;
  occupantsNow?: number | null;
  occupancyMismatch?: boolean;
  licenceEvidenceMissing?: boolean;
  missingSafetyDoc?: boolean;
  hmoInspectionDueSoon?: boolean;
  hmoInspectionMissed?: boolean;
  alertCount?: number;
  alertSeverity?: string | null;
  alertProblem?: string | null;
  ruleSourceLabel?: string | null;
  authorityName?: string | null;
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
  licenceEvidenceMissing?: number;
  occupancyMismatch?: number;
  missingSafetyDoc?: number;
  overdueHmoMaintenance?: number;
  hmoInspectionDueSoon?: number;
  hmoInspectionMissed?: number;
  rulesReviewNeeded?: number;
  counters?: {
    totalHmos: number;
    compliant: number;
    nonCompliant: number;
    needsAttention: number;
    renewalsDue: number;
    licenceEvidenceMissing?: number;
    occupancyMismatch?: number;
    missingSafetyDoc?: number;
    overdueHmoMaintenance?: number;
    hmoInspectionDueSoon?: number;
    hmoInspectionMissed?: number;
    rulesReviewNeeded?: number;
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
  const [issueFilter, setIssueFilter] = useState("all");
  const [authorityQ, setAuthorityQ] = useState("");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const clearPrimaryFilters = () => {
    setAddressQ("");
    setBoroughQ("");
    setLicenceStatus("all");
  };

  const clearAdvancedFilters = () => {
    setOverallStatus("all");
    setManagerQ("");
    setRenewalWindow("all");
    setAlertFilter("all");
    setIssueFilter("all");
    setAuthorityQ("");
  };

  const clearAllFilters = () => {
    clearPrimaryFilters();
    clearAdvancedFilters();
  };

  const advancedFilterCount = [
    authorityQ.trim() !== "",
    overallStatus !== "all",
    managerQ.trim() !== "",
    renewalWindow !== "all",
    alertFilter !== "all",
    issueFilter !== "all",
  ].filter(Boolean).length;

  const hasAdvancedFilters = advancedFilterCount > 0;
  const hasActiveFilters =
    addressQ.trim() !== "" ||
    boroughQ.trim() !== "" ||
    licenceStatus !== "all" ||
    hasAdvancedFilters;

  const boroughOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of data?.profiles || []) {
      const b = (p.borough || "").trim();
      if (b) set.add(b);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data?.profiles]);

  const overallStatusChipLabel = (value: string) => {
    switch (value) {
      case "VERIFIED_COMPLIANT":
        return "Compliant";
      case "ACTION_REQUIRED":
        return "Non-compliant";
      case "CRITICAL_EXCEPTION":
        return "Critical / Non-compliant";
      case "REVIEW_REQUIRED":
        return "Needs attention";
      case "NOT_ASSESSED":
        return "Not assessed";
      default:
        return value;
    }
  };

  const issueFilterChipLabel = (value: string) => {
    switch (value) {
      case "licence_missing":
        return "Licence evidence missing";
      case "occupancy":
        return "Occupancy mismatch";
      case "safety_docs":
        return "Missing safety document";
      case "insp_due":
        return "HMO inspection due soon";
      case "insp_missed":
        return "HMO inspection missed";
      default:
        return value;
    }
  };

  const renewalChipLabel = (value: string) => {
    switch (value) {
      case "90":
        return "Within 90 days";
      case "30":
        return "Within 30 days";
      case "7":
        return "Within 7 days";
      case "expired":
        return "Expired";
      default:
        return value;
    }
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
      if (
        authorityQ.trim() &&
        !(p.authorityName || p.borough || "")
          .toLowerCase()
          .includes(authorityQ.trim().toLowerCase())
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
      if (issueFilter === "licence_missing" && !p.licenceEvidenceMissing) return false;
      if (issueFilter === "occupancy" && !p.occupancyMismatch) return false;
      if (issueFilter === "safety_docs" && !p.missingSafetyDoc) return false;
      if (issueFilter === "insp_due" && !p.hmoInspectionDueSoon) return false;
      if (issueFilter === "insp_missed" && !p.hmoInspectionMissed) return false;
      return true;
    });
  }, [
    data?.profiles,
    addressQ,
    boroughQ,
    authorityQ,
    licenceStatus,
    overallStatus,
    managerQ,
    renewalWindow,
    alertFilter,
    issueFilter,
  ]);

  const counters = data?.counters || {
    totalHmos: data?.propertyCount || 0,
    compliant: data?.compliant || 0,
    nonCompliant: data?.nonCompliant || 0,
    needsAttention: data?.needsAttention || 0,
    renewalsDue: data?.renewalsDue || 0,
    licenceEvidenceMissing: data?.licenceEvidenceMissing || 0,
    occupancyMismatch: data?.occupancyMismatch || 0,
    missingSafetyDoc: data?.missingSafetyDoc || 0,
    overdueHmoMaintenance: data?.overdueHmoMaintenance || 0,
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
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8 gap-3 md:gap-4">
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
                      Licence evidence
                    </p>
                    <p
                      className="text-xl md:text-2xl font-bold text-sky-700"
                      data-testid="stat-licence-evidence"
                    >
                      {counters.licenceEvidenceMissing || 0}
                    </p>
                  </div>
                  <div className="p-1.5 md:p-2 bg-sky-500/10 rounded-full">
                    <FileWarning className="h-4 w-4 md:h-5 md:w-5 text-sky-700" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-violet-500">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm font-medium text-muted-foreground">
                      Occupancy
                    </p>
                    <p
                      className="text-xl md:text-2xl font-bold text-violet-700"
                      data-testid="stat-occupancy-mismatch"
                    >
                      {counters.occupancyMismatch || 0}
                    </p>
                  </div>
                  <div className="p-1.5 md:p-2 bg-violet-500/10 rounded-full">
                    <Users className="h-4 w-4 md:h-5 md:w-5 text-violet-700" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-rose-500">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm font-medium text-muted-foreground">
                      Safety docs
                    </p>
                    <p
                      className="text-xl md:text-2xl font-bold text-rose-700"
                      data-testid="stat-safety-docs"
                    >
                      {counters.missingSafetyDoc || 0}
                    </p>
                  </div>
                  <div className="p-1.5 md:p-2 bg-rose-500/10 rounded-full">
                    <Shield className="h-4 w-4 md:h-5 md:w-5 text-rose-700" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-slate-500">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm font-medium text-muted-foreground">
                      Overdue HMO MRs
                    </p>
                    <p
                      className="text-xl md:text-2xl font-bold text-slate-700"
                      data-testid="stat-overdue-hmo-mr"
                    >
                      {counters.overdueHmoMaintenance || 0}
                    </p>
                  </div>
                  <div className="p-1.5 md:p-2 bg-slate-500/10 rounded-full">
                    <Wrench className="h-4 w-4 md:h-5 md:w-5 text-slate-700" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-cyan-500">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm font-medium text-muted-foreground">
                      Insp. due soon
                    </p>
                    <p
                      className="text-xl md:text-2xl font-bold text-cyan-700"
                      data-testid="stat-insp-due"
                    >
                      {counters.hmoInspectionDueSoon || 0}
                    </p>
                  </div>
                  <div className="p-1.5 md:p-2 bg-cyan-500/10 rounded-full">
                    <Calendar className="h-4 w-4 md:h-5 md:w-5 text-cyan-700" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-red-600">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm font-medium text-muted-foreground">
                      Insp. missed
                    </p>
                    <p
                      className="text-xl md:text-2xl font-bold text-red-700"
                      data-testid="stat-insp-missed"
                    >
                      {counters.hmoInspectionMissed || 0}
                    </p>
                  </div>
                  <div className="p-1.5 md:p-2 bg-red-500/10 rounded-full">
                    <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-red-700" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-indigo-600">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm font-medium text-muted-foreground">
                      Council rules
                    </p>
                    <p
                      className="text-xl md:text-2xl font-bold text-indigo-700"
                      data-testid="stat-rules-review"
                    >
                      {counters.rulesReviewNeeded || data?.rulesReviewNeeded || 0}
                    </p>
                    <Link href="/hmo/rules" className="text-xs text-primary underline">
                      Open rules review
                    </Link>
                  </div>
                  <div className="p-1.5 md:p-2 bg-indigo-500/10 rounded-full">
                    <Scale className="h-4 w-4 md:h-5 md:w-5 text-indigo-700" />
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
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Address</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={addressQ}
                      onChange={(e) => setAddressQ(e.target.value)}
                      placeholder="Search address…"
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Borough</Label>
                  <Select
                    value={boroughQ.trim() ? boroughQ : "all"}
                    onValueChange={(v) => setBoroughQ(v === "all" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All boroughs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All boroughs</SelectItem>
                      {boroughOptions.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Licence status</Label>
                  <Select value={licenceStatus} onValueChange={setLicenceStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="CURRENT">Current</SelectItem>
                      <SelectItem value="EXPIRED_DOCUMENT">Expired document</SelectItem>
                      <SelectItem value="RENEWAL_PENDING_EVIDENCE">Renewal pending</SelectItem>
                      <SelectItem value="UNDER_REVIEW">Under review</SelectItem>
                      <SelectItem value="DRAFT">Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Popover open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-2 w-full lg:w-auto lg:mt-0">
                      <Filter className="h-4 w-4" />
                      Filters
                      {advancedFilterCount > 0 && (
                        <Badge
                          variant="default"
                          className="ml-0.5 h-5 min-w-5 rounded-full px-1.5 tabular-nums"
                        >
                          {advancedFilterCount}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 space-y-4" align="end">
                    <p className="text-sm font-medium">Advanced filters</p>
                    <div className="space-y-2">
                      <Label className="text-sm">Council / authority</Label>
                      <Input
                        value={authorityQ}
                        onChange={(e) => setAuthorityQ(e.target.value)}
                        placeholder="Search…"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Overall status</Label>
                      <Select value={overallStatus} onValueChange={setOverallStatus}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="VERIFIED_COMPLIANT">Compliant</SelectItem>
                          <SelectItem value="ACTION_REQUIRED">Non-compliant</SelectItem>
                          <SelectItem value="CRITICAL_EXCEPTION">
                            Critical / Non-compliant
                          </SelectItem>
                          <SelectItem value="REVIEW_REQUIRED">Needs attention</SelectItem>
                          <SelectItem value="NOT_ASSESSED">Not assessed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Manager</Label>
                      <Input
                        value={managerQ}
                        onChange={(e) => setManagerQ(e.target.value)}
                        placeholder="Search…"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Renewal window</Label>
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
                      <Label className="text-sm">Alerts</Label>
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
                    <div className="space-y-2">
                      <Label className="text-sm">Issue type</Label>
                      <Select value={issueFilter} onValueChange={setIssueFilter}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="licence_missing">Licence evidence missing</SelectItem>
                          <SelectItem value="occupancy">Occupancy mismatch</SelectItem>
                          <SelectItem value="safety_docs">Missing safety document</SelectItem>
                          <SelectItem value="insp_due">HMO inspection due soon</SelectItem>
                          <SelectItem value="insp_missed">HMO inspection missed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {hasAdvancedFilters && (
                      <ClearFiltersButton
                        className="w-full"
                        onClick={clearAdvancedFilters}
                      />
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {hasAdvancedFilters && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    When additional filters are selected:
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {authorityQ.trim() && (
                      <Badge variant="secondary" className="gap-1">
                        Council: {authorityQ.trim()}
                        <button
                          type="button"
                          className="rounded-full p-0.5 hover:bg-destructive/20"
                          onClick={() => setAuthorityQ("")}
                          aria-label="Clear council filter"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    {overallStatus !== "all" && (
                      <Badge variant="secondary" className="gap-1">
                        Overall status: {overallStatusChipLabel(overallStatus)}
                        <button
                          type="button"
                          className="rounded-full p-0.5 hover:bg-destructive/20"
                          onClick={() => setOverallStatus("all")}
                          aria-label="Clear overall status filter"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    {managerQ.trim() && (
                      <Badge variant="secondary" className="gap-1">
                        Manager: {managerQ.trim()}
                        <button
                          type="button"
                          className="rounded-full p-0.5 hover:bg-destructive/20"
                          onClick={() => setManagerQ("")}
                          aria-label="Clear manager filter"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    {renewalWindow !== "all" && (
                      <Badge variant="secondary" className="gap-1">
                        Renewal: {renewalChipLabel(renewalWindow)}
                        <button
                          type="button"
                          className="rounded-full p-0.5 hover:bg-destructive/20"
                          onClick={() => setRenewalWindow("all")}
                          aria-label="Clear renewal filter"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    {alertFilter !== "all" && (
                      <Badge variant="secondary" className="gap-1">
                        Alerts: {alertFilter === "has" ? "Yes" : "None"}
                        <button
                          type="button"
                          className="rounded-full p-0.5 hover:bg-destructive/20"
                          onClick={() => setAlertFilter("all")}
                          aria-label="Clear alerts filter"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    {issueFilter !== "all" && (
                      <Badge variant="secondary" className="gap-1">
                        Issue: {issueFilterChipLabel(issueFilter)}
                        <button
                          type="button"
                          className="rounded-full p-0.5 hover:bg-destructive/20"
                          onClick={() => setIssueFilter("all")}
                          aria-label="Clear issue type filter"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    <ClearFiltersButton onClick={clearAllFilters} />
                  </div>
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
                      <div className="min-w-0">
                        <p className="text-sm text-muted-foreground truncate">
                          {p.alertProblem || p.nextAction || "—"}
                        </p>
                        {p.ruleSourceLabel && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            {p.ruleSourceLabel}
                            {p.alertSeverity ? ` · ${p.alertSeverity}` : ""}
                          </p>
                        )}
                      </div>
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
