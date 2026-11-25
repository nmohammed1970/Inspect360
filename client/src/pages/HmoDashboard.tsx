import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  Calendar,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileWarning,
  Home,
  Plus,
  Search,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { ClearFiltersButton } from "@/components/ClearFiltersButton";
import {
  MetricSummaryCard,
  StatusPill,
  type StatusPillTone,
  PillFilterTabs,
  FilterToolbar,
  PortfolioDataTable,
  PortfolioTableHeader,
  PortfolioTableBody,
  PortfolioTableRow,
  PortfolioTableHead,
  PortfolioTableCell,
  OpenRowLink,
} from "@/components/workspace";
import { pagePad } from "@/lib/responsive";
import { cn } from "@/lib/utils";
import {
  type PortfolioProfile,
  type QuickFilter,
  type SortMode,
  daysUntil,
  displayAddress,
  displayCouncil,
  dueItems,
  fmtShort,
  hasUpcoming,
  inspectionOverdue,
  isAction,
  isLicenceExpired,
  isLicenceVerified,
  isUrgent,
  matchesQuick,
  needsVerify,
  priorityStatus,
  sortProfiles,
  suggestedNextAction,
} from "@/components/hmo/portfolioHelpers";

const priorityTone: Record<string, StatusPillTone> = {
  urgent: "urgent",
  action: "action",
  soon: "warning",
  verify: "info",
  clear: "success",
};

type DashboardPayload = {
  asOf: string;
  propertyCount: number;
  rulesReviewNeeded?: number;
  counters?: {
    totalHmos: number;
  };
  profiles: PortfolioProfile[];
};

function LicenceCell({ p, asOf }: { p: PortfolioProfile; asOf: number }) {
  const evidence = String(p.licenceEvidenceStatus || "").toUpperCase();
  const status = String(p.licenceStatus || "").toUpperCase();

  if (status === "UNDER_REVIEW" || status === "DRAFT" || evidence === "UNKNOWN") {
    return (
      <StatusPill tone="info">
        {status === "UNDER_REVIEW" || status === "DRAFT" ? "Under review" : "Not on file"}
      </StatusPill>
    );
  }
  if (p.licenceEvidenceMissing && !p.expiryDate) {
    return <StatusPill tone="info">Not on file</StatusPill>;
  }
  if (isLicenceExpired(p, asOf)) {
    return <StatusPill tone="urgent">Expired record</StatusPill>;
  }
  const d = daysUntil(p.expiryDate, asOf);
  if (d != null && d <= 30 && isLicenceVerified(p)) {
    return <StatusPill tone="warning">Expires soon</StatusPill>;
  }
  if (p.expiryDate) {
    return <span className="text-sm font-medium">{fmtShort(p.expiryDate)}</span>;
  }
  return <span className="text-sm text-muted-foreground">—</span>;
}

function InspectionCell({ p }: { p: PortfolioProfile }) {
  if (!p.lastHmoInspectionDate && !p.lastAssessedAt) {
    return <StatusPill tone="info">Not assessed</StatusPill>;
  }
  if (inspectionOverdue(p)) {
    return <StatusPill tone="action">Overdue</StatusPill>;
  }
  return (
    <span className="text-sm font-medium">
      {fmtShort(p.lastHmoInspectionDate || p.lastAssessedAt)}
    </span>
  );
}

function downloadCsv(rows: PortfolioProfile[], asOf: number) {
  const cols = [
    "Property ID",
    "Address",
    "Name",
    "Council",
    "Manager",
    "Landlord",
    "Licence status",
    "Licence expiry",
    "People",
    "Verified permitted people",
    "Inspection last",
    "Inspection next",
    "Urgent alerts",
    "High alerts",
    "Medium alerts",
    "Priority",
    "Next action",
  ];
  const body = rows.map((p) => [
    p.propertyId,
    p.address || "",
    p.name || "",
    displayCouncil(p),
    p.managerName || "",
    p.holderName || "",
    p.licenceStatus || "",
    p.expiryDate || "",
    p.occupantsNow ?? "",
    p.maxPersons ?? "",
    p.lastHmoInspectionDate || p.lastAssessedAt || "",
    p.nextHmoInspectionDate || "",
    p.urgentCount ?? 0,
    p.highCount ?? 0,
    p.mediumCount ?? 0,
    priorityStatus(p, 30, asOf).text,
    suggestedNextAction(p, asOf),
  ]);
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv =
    "\uFEFF" +
    [cols, ...body].map((r) => r.map(cell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  const stamp = new Date(asOf).toISOString().slice(0, 10);
  el.href = url;
  el.download = `Inspect360_HMO_Portfolio_${stamp}.csv`;
  document.body.appendChild(el);
  el.click();
  el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

export default function HmoDashboard() {
  const { data, isLoading, error } = useQuery<DashboardPayload>({
    queryKey: ["/api/hmo/dashboard"],
  });

  const [searchQ, setSearchQ] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [windowDays, setWindowDays] = useState(30);
  const [quick, setQuick] = useState<QuickFilter>("all");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportScope, setReportScope] = useState<"visible" | "all">("visible");

  const asOf = useMemo(
    () => (data?.asOf ? new Date(data.asOf).getTime() : Date.now()),
    [data?.asOf],
  );

  const profiles = data?.profiles || [];

  const baseScoped = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return profiles.filter((p) => {
      if (q) {
        const hay = [
          p.address,
          p.name,
          p.borough,
          p.authorityName,
          p.managerName,
          p.holderName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [profiles, searchQ]);

  const kpiCounts = useMemo(() => {
    return {
      total: baseScoped.length,
      action: baseScoped.filter((p) => isAction(p, asOf)).length,
      urgent: baseScoped.filter((p) => isUrgent(p)).length,
      upcoming: baseScoped.filter((p) => hasUpcoming(p, windowDays, asOf)).length,
      verify: baseScoped.filter((p) => needsVerify(p)).length,
    };
  }, [baseScoped, asOf, windowDays]);

  const filtered = useMemo(() => {
    const rows = baseScoped.filter((p) => matchesQuick(p, quick, windowDays, asOf));
    return sortProfiles(rows, sortMode, windowDays, asOf);
  }, [baseScoped, quick, windowDays, asOf, sortMode]);

  const deadlines = useMemo(() => {
    return profiles
      .flatMap((p) =>
        dueItems(p, asOf)
          .filter((i) => {
            const d = daysUntil(i.date, asOf);
            return d != null && d <= windowDays;
          })
          .map((i) => ({ ...i, p })),
      )
      .sort((a, b) => daysUntil(a.date, asOf)! - daysUntil(b.date, asOf)!)
      .slice(0, 4);
  }, [profiles, asOf, windowDays]);

  const hasActiveFilters =
    searchQ.trim() !== "" || sortMode !== "priority" || quick !== "all";

  const clearFilters = () => {
    setSearchQ("");
    setSortMode("priority");
    setQuick("all");
  };

  const setQuickAndScroll = (q: QuickFilter) => {
    setQuick(q);
    requestAnimationFrame(() => {
      document.getElementById("hmo-work-grid")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  };

  const reportRows = reportScope === "all" ? profiles : filtered;

  const dateParts = (iso: string) => {
    const d = new Date(iso);
    return {
      day: d.toLocaleDateString("en-GB", { day: "numeric" }),
      mon: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
    };
  };

  return (
    <div
      className={cn("container mx-auto min-w-0 space-y-4 md:space-y-6", pagePad)}
      data-testid="hmo-dashboard"
    >
      <PageHeader
        icon={Shield}
        title="HMO portfolio overview"
        description="Prioritise risks, stay ahead of deadlines and keep records verified."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/inspections?create=true">
                <Plus className="h-4 w-4 mr-1.5" />
                Schedule inspection
              </Link>
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                setReportScope("visible");
                setReportOpen(true);
              }}
            >
              <FileSpreadsheet className="h-4 w-4 mr-1.5" />
              Create portfolio report
            </Button>
          </div>
        }
      />

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading portfolio metrics…</p>
      )}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4">
          <p className="text-base font-medium text-destructive">Failed to load HMO dashboard</p>
        </div>
      )}

      {data && (
        <>
          {data.asOf && (
          <p className="text-sm text-muted-foreground">
            Updated {new Date(data.asOf).toLocaleString()}
          </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
            <MetricSummaryCard
              value={kpiCounts.total}
              valueTestId="stat-total-hmos"
              label="HMOs in portfolio"
              subLabel="Entire portfolio"
              tone="primary"
              icon={Home}
              active={quick === "all"}
              onClick={() => setQuickAndScroll("all")}
            />
            <MetricSummaryCard
              value={kpiCounts.action}
              valueTestId="stat-needs-attention"
              label="Need action"
              subLabel="Requires follow-up"
              tone="action"
              icon={ClipboardList}
              active={quick === "action"}
              onClick={() => setQuickAndScroll("action")}
            />
            <MetricSummaryCard
              value={kpiCounts.urgent}
              valueTestId="stat-non-compliant"
              label="Urgent alerts"
              subLabel="Immediate attention"
              tone="critical"
              icon={AlertTriangle}
              active={quick === "urgent"}
              onClick={() => setQuickAndScroll("urgent")}
            />
            <MetricSummaryCard
              value={kpiCounts.upcoming}
              valueTestId="stat-renewals-due"
              label="Upcoming deadlines"
              subLabel={`Within ${windowDays} days`}
              tone="warning"
              icon={Calendar}
              active={quick === "upcoming"}
              onClick={() => setQuickAndScroll("upcoming")}
            />
            <MetricSummaryCard
              value={kpiCounts.verify}
              valueTestId="stat-licence-evidence"
              label="Data to verify"
              subLabel="Licence / records"
              tone="info"
              icon={FileWarning}
              active={quick === "verify"}
              onClick={() => setQuickAndScroll("verify")}
            />
                  </div>

          <PillFilterTabs
            value={quick}
            onChange={(id) => setQuickAndScroll(id as QuickFilter)}
            testIdPrefix="hmo-quick"
            tabs={[
              { id: "all", label: "All", count: kpiCounts.total },
              { id: "action", label: "Action needed", count: kpiCounts.action },
              { id: "urgent", label: "Urgent", count: kpiCounts.urgent },
              { id: "upcoming", label: "Upcoming", count: kpiCounts.upcoming },
              { id: "verify", label: "Verify", count: kpiCounts.verify },
            ]}
          />

          <FilterToolbar
            end={
              <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {filtered.length} shown
              </span>
                {hasActiveFilters && <ClearFiltersButton onClick={clearFilters} />}
              </div>
            }
          >
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search property, landlord, postcode…"
                className="h-9 pl-8"
                aria-label="Search HMO properties"
                    />
                  </div>
                  <Select
              value={String(windowDays)}
              onValueChange={(v) => setWindowDays(Number(v))}
                  >
              <SelectTrigger className="h-9 w-full sm:w-[10.5rem]">
                <SelectValue placeholder="Forward view" />
                    </SelectTrigger>
                    <SelectContent>
                <SelectItem value="30">Next 30 days</SelectItem>
                <SelectItem value="60">Next 60 days</SelectItem>
                <SelectItem value="90">Next 90 days</SelectItem>
                    </SelectContent>
                  </Select>
            <Select
              value={sortMode}
              onValueChange={(v) => setSortMode(v as SortMode)}
            >
              <SelectTrigger className="h-9 w-full sm:w-[10.5rem]">
                <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                <SelectItem value="priority">Priority first</SelectItem>
                <SelectItem value="due">Next deadline</SelectItem>
                <SelectItem value="name">Property A–Z</SelectItem>
                    </SelectContent>
                  </Select>
          </FilterToolbar>

          {/* Work grid */}
          <div
            id="hmo-work-grid"
            className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_304px]"
          >
            <div className="max-h-[586px] overflow-auto">
              {filtered.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-card px-4 py-10 text-center text-sm text-muted-foreground">
                  No matching HMO properties. Try adjusting the filters or search term.
                </div>
              ) : (
                <PortfolioDataTable minWidth="880px">
                  <PortfolioTableHeader className="sticky top-0 z-[1]">
                    <PortfolioTableRow>
                      {[
                        "Property",
                        "Priority",
                        "Licence",
                        "Occupancy",
                        "HMO inspection",
                        "Alerts",
                        "Next action",
                        "",
                      ].map((h) => (
                        <PortfolioTableHead key={h || "open"}>{h}</PortfolioTableHead>
                      ))}
                    </PortfolioTableRow>
                  </PortfolioTableHeader>
                  <PortfolioTableBody>
                    {filtered.map((p) => {
                      const status = priorityStatus(p, windowDays, asOf);
                      const openCount = p.openFindingCount ?? p.alertCount ?? 0;
                      const action = suggestedNextAction(p, asOf);
                      return (
                        <PortfolioTableRow key={p.propertyId}>
                          <PortfolioTableCell>
                            <Link
                              href={`/properties/${p.propertyId}?tab=hmo`}
                              className="font-medium text-foreground hover:underline"
                            >
                              {displayAddress(p)}
                            </Link>
                          </PortfolioTableCell>
                          <PortfolioTableCell>
                            <StatusPill tone={priorityTone[status.cls] || "default"}>
                              {status.text}
                            </StatusPill>
                          </PortfolioTableCell>
                          <PortfolioTableCell>
                            <LicenceCell p={p} asOf={asOf} />
                          </PortfolioTableCell>
                          <PortfolioTableCell className="tabular-nums">
                            <span
                              className={cn(
                                "font-medium",
                                p.occupancyMismatch && "text-[color:var(--brand-critical)]",
                              )}
                            >
                              {p.occupantsNow == null ? "?" : p.occupantsNow} /{" "}
                              {p.maxPersons == null ? "?" : p.maxPersons}
                            </span>
                          </PortfolioTableCell>
                          <PortfolioTableCell>
                            <InspectionCell p={p} />
                          </PortfolioTableCell>
                          <PortfolioTableCell>
                            <span
                              className={cn(
                                "font-medium",
                                openCount
                                  ? "text-[color:var(--brand-critical)]"
                                  : "text-muted-foreground",
                              )}
                            >
                              {openCount ? `${openCount} open` : "None open"}
                            </span>
                          </PortfolioTableCell>
                          <PortfolioTableCell className="max-w-[200px]">
                            <span className="line-clamp-2 font-medium text-foreground">
                              {action}
                            </span>
                          </PortfolioTableCell>
                          <PortfolioTableCell>
                            <OpenRowLink
                              href={`/properties/${p.propertyId}?tab=hmo`}
                              testId={`hmo-open-${p.propertyId}`}
                            />
                          </PortfolioTableCell>
                        </PortfolioTableRow>
                      );
                    })}
                  </PortfolioTableBody>
                </PortfolioDataTable>
              )}
                    </div>

            <aside className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Deadlines ahead</h3>
                    <span className="text-xs text-muted-foreground">Next {windowDays} days</span>
                    </div>
                  {deadlines.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No recorded deadlines in this forward window.
                    </p>
                  ) : (
                    deadlines.map((item) => {
                      const parts = dateParts(item.date);
                return (
                        <div
                          key={`${item.p.propertyId}-${item.type}-${item.date}`}
                          className="flex items-start gap-3 border-t pt-3 first:border-t-0 first:pt-0"
                        >
                          <div className="w-11 shrink-0 rounded-md bg-muted py-1 text-center text-muted-foreground">
                            <b className="block text-base leading-none">{parts.day}</b>
                            <span className="text-xs uppercase">{parts.mon}</span>
                    </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {displayAddress(item.p)}
                            </p>
                            <p className="text-xs text-muted-foreground">{item.type}</p>
                    </div>
                  <Link
                            href={`/properties/${item.p.propertyId}?tab=hmo`}
                            className="text-sm font-medium text-primary"
                          >
                            View
                          </Link>
                    </div>
                      );
                    })
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setQuickAndScroll("upcoming")}
                  >
                    View all upcoming deadlines
                  </Button>
                </CardContent>
              </Card>
            </aside>
          </div>

        </>
      )}

      {/* Portfolio report */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl max-h-[min(90vh,calc(100dvh-1.5rem))] sm:max-w-5xl lg:max-w-6xl">
          <DialogHeader>
            <DialogTitle>HMO portfolio report</DialogTitle>
            <DialogDescription>
              Management-ready snapshot built from your current HMO portfolio records.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium sm:flex-row sm:items-center sm:gap-2">
              Portfolio scope
              <Select
                value={reportScope}
                onValueChange={(v) => setReportScope(v as "visible" | "all")}
              >
                <SelectTrigger className="h-9 w-full sm:w-[240px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                  <SelectItem value="visible">Current filtered selection</SelectItem>
                  <SelectItem value="all">Entire HMO portfolio</SelectItem>
                        </SelectContent>
                      </Select>
            </label>
            <span className="text-xs text-muted-foreground sm:ml-auto">
              As at {data?.asOf ? new Date(data.asOf).toLocaleString() : "—"}
            </span>
                    </div>

          <div className="min-w-0 rounded-lg border border-border/80 bg-card p-3 sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-border pb-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wide text-primary">
                  INSPECT360 · HMO PORTFOLIO
                </p>
                <h3 className="text-lg font-bold text-foreground sm:text-xl">
                  HMO management report
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {reportScope === "all" ? "Entire portfolio" : "Filtered portfolio selection"} ·{" "}
                  {reportRows.length} properties
                </p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              <MetricSummaryCard
                value={reportRows.length}
                label="HMOs in scope"
                tone="primary"
                icon={Home}
                className="p-3"
              />
              <MetricSummaryCard
                value={reportRows.filter((p) => isAction(p, asOf)).length}
                label="Requiring action"
                tone="action"
                icon={ClipboardList}
                className="p-3"
              />
              <MetricSummaryCard
                value={reportRows.filter((p) => isUrgent(p)).length}
                label="Urgent alerts"
                tone="critical"
                icon={AlertTriangle}
                className="p-3"
              />
              <MetricSummaryCard
                value={reportRows.filter((p) => hasUpcoming(p, windowDays, asOf)).length}
                label={`Upcoming (${windowDays}d)`}
                tone="warning"
                icon={Calendar}
                className="p-3"
              />
              </div>

            <div className="max-h-[min(40vh,360px)] overflow-auto -mx-1 px-1 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-muted/40">
                    {["Property", "Authority", "Licence", "Inspection", "Alerts", "Priority"].map(
                      (h) => (
                        <th
                          key={h}
                          className="border-b px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((p) => {
                    const status = priorityStatus(p, windowDays, asOf);
                    const openCount = p.openFindingCount ?? p.alertCount ?? 0;
                    const urgent = p.urgentCount ?? 0;
                    const licenceMissing = !p.expiryDate && p.licenceEvidenceMissing;
                    const inspOverdue = inspectionOverdue(p);
                    const inspMissing = !p.lastHmoInspectionDate && !p.lastAssessedAt;
                    return (
                      <tr key={p.propertyId} className="hover:bg-muted/30">
                        <td className="border-b px-1.5 py-2 font-medium text-foreground">
                          {displayAddress(p)}
                        </td>
                        <td className="border-b px-1.5 py-2 text-muted-foreground">
                          {displayCouncil(p) || "—"}
                        </td>
                        <td className="border-b px-1.5 py-2">
                          {p.expiryDate ? (
                            <span>{fmtShort(p.expiryDate)}</span>
                          ) : licenceMissing ? (
                            <StatusPill tone="info">Not on file</StatusPill>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="border-b px-1.5 py-2">
                          {inspOverdue ? (
                            <StatusPill tone="action">Overdue</StatusPill>
                          ) : inspMissing ? (
                            <StatusPill tone="info">Not assessed</StatusPill>
                          ) : (
                            <span>
                              {fmtShort(p.lastHmoInspectionDate || p.lastAssessedAt)}
                            </span>
                          )}
                        </td>
                        <td className="border-b px-1.5 py-2">
                          <span
                            className={cn(
                              "font-semibold",
                              openCount > 0
                                ? "text-[color:var(--brand-critical)]"
                                : "text-muted-foreground",
                            )}
                          >
                            {openCount}
                          </span>
                          <span
                            className={cn(
                              "ml-1 text-xs",
                              urgent > 0
                                ? "font-medium text-[color:var(--brand-critical)]"
                                : "text-muted-foreground",
                            )}
                          >
                            ({urgent} urgent)
                          </span>
                        </td>
                        <td className="border-b px-1.5 py-2">
                          <StatusPill tone={priorityTone[status.cls] || "default"}>
                            {status.text}
                          </StatusPill>
                        </td>
                      </tr>
                    );
                  })}
                  {reportRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-1.5 py-6 text-center text-muted-foreground">
                        No properties in the selected scope.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
                  </div>
                </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              className="w-full gap-1.5 sm:w-auto"
              onClick={() => downloadCsv(reportRows, asOf)}
              disabled={reportRows.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => window.print()}>
              Print / Save as PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
