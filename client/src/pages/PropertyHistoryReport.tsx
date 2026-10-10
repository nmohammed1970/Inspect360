import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Building2,
  ClipboardCheck,
  FileDown,
  History,
  Loader2,
  Package,
  Scale,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/contexts/LocaleContext";
import { pagePad, textBreak } from "@/lib/responsive";
import { cn } from "@/lib/utils";
import { PreviewableImage } from "@/components/ImagePreview";
import { useCompanyModules } from "@/hooks/useCompanyModules";

function normalizeAssetPhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith("/objects/")) {
        return `${parsed.pathname}${parsed.search}`;
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  }
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("objects/")) return `/${trimmed}`;
  return `/${trimmed.replace(/^\/+/, "")}`;
}

function isLikelyAssetDocument(url: string | null | undefined): boolean {
  if (!url) return false;
  const path = url.split("?")[0].toLowerCase();
  return path.endsWith(".pdf") || path.includes(".pdf");
}

function firstAssetImage(photos: unknown): string | null {
  if (!Array.isArray(photos)) return null;
  for (const item of photos) {
    if (typeof item !== "string" || !item.trim()) continue;
    if (isLikelyAssetDocument(item)) continue;
    return normalizeAssetPhotoUrl(item);
  }
  return null;
}

function formatDate(value: any): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function prettyLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isActiveTenant(ta: any): boolean {
  const nested = ta?.assignment;
  const raw =
    nested?.isActive !== undefined && nested?.isActive !== null
      ? nested.isActive
      : ta?.isActive !== undefined && ta?.isActive !== null
        ? ta.isActive
        : ta?.is_active;
  if (raw === false || raw === 0 || raw === "false" || raw === "f") return false;
  if (raw === true || raw === 1 || raw === "true" || raw === "t") return true;
  if (raw === null || raw === undefined) return true;
  return ta.status === "active" || ta.status === "current";
}

function formatMoneyValue(
  value: unknown,
  formatCurrency: (amount: number, minorUnits?: boolean) => string,
  minorUnits = false,
): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(num)) return "—";
  return formatCurrency(num, minorUnits);
}

function personName(user: any): string {
  if (!user) return "—";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || "—";
}

function tenantName(ta: any): string {
  const nested = [ta?.user?.firstName, ta?.user?.lastName].filter(Boolean).join(" ").trim();
  const flat = [ta.firstName, ta.lastName].filter(Boolean).join(" ").trim();
  const org = [ta.tenantFirstName, ta.tenantLastName].filter(Boolean).join(" ").trim();
  return nested || flat || org || ta.email || ta.tenantEmail || "—";
}

function tenantEmail(ta: any): string {
  return ta.email || ta.tenantEmail || ta.user?.email || "";
}

function leaseOf(ta: any) {
  const a = ta?.assignment || ta;
  return {
    start: a?.leaseStartDate,
    end: a?.leaseEndDate,
    rent: a?.monthlyRent ?? ta?.monthlyRent,
    deposit: a?.depositAmount ?? ta?.depositAmount,
  };
}

function datesOverlap(startA?: any, endA?: any, startB?: any, endB?: any): boolean {
  const a0 = startA ? new Date(startA).getTime() : Number.NEGATIVE_INFINITY;
  const a1 = endA ? new Date(endA).getTime() : Number.POSITIVE_INFINITY;
  const b0 = startB ? new Date(startB).getTime() : Number.NEGATIVE_INFINITY;
  const b1 = endB ? new Date(endB).getTime() : Number.POSITIVE_INFINITY;
  if (Number.isNaN(a0) || Number.isNaN(a1) || Number.isNaN(b0) || Number.isNaN(b1)) return false;
  return a0 <= b1 && b0 <= a1;
}

function CellStack({
  title,
  sub,
  href,
  subHref,
}: {
  title: string;
  sub?: string | null;
  href?: string | null;
  subHref?: string | null;
}) {
  const titleNode = href ? (
    <Link href={href}>
      <span className="font-medium text-sm text-primary hover:underline cursor-pointer leading-snug">
        {title || "—"}
      </span>
    </Link>
  ) : (
    <div className="font-medium text-sm text-foreground leading-snug">{title || "—"}</div>
  );

  const subNode = sub ? (
    subHref || href ? (
      <Link href={subHref || href || "#"}>
        <div className="text-xs text-primary/80 hover:underline cursor-pointer leading-snug line-clamp-2">
          {sub}
        </div>
      </Link>
    ) : (
      <div className="text-xs text-muted-foreground leading-snug line-clamp-2">{sub}</div>
    )
  ) : null;

  return (
    <div className="min-w-0 space-y-0.5">
      {titleNode}
      {subNode}
    </div>
  );
}

function TextLink({
  href,
  children,
  className,
}: {
  href?: string | null;
  children: ReactNode;
  className?: string;
}) {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <Link href={href}>
      <span className={cn("text-primary hover:underline cursor-pointer", className)}>{children}</span>
    </Link>
  );
}

function tenantHref(ta: any): string | null {
  const id = ta?.tenantId || ta?.user?.id || ta?.userId;
  return id ? `/tenants/${id}` : null;
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="h-24 text-center text-sm text-muted-foreground">
        {message}
      </TableCell>
    </TableRow>
  );
}

function SectionTable({
  title,
  icon: Icon,
  count,
  id,
  children,
}: {
  title: string;
  icon: LucideIcon;
  count: number;
  id?: string;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="glass-card overflow-hidden shadow-sm scroll-mt-4">
      <CardHeader className="border-b bg-muted/50 py-3.5 px-4 md:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-base md:text-lg font-semibold tracking-tight truncate">
              {title}
            </CardTitle>
          </div>
          <Badge variant="secondary" className="tabular-nums font-medium flex-shrink-0">
            {count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0 bg-background min-w-0">
        <div className="overflow-x-auto">{children}</div>
      </CardContent>
    </Card>
  );
}

const reportTableClass =
  "min-w-0 w-full md:min-w-[720px] bg-background [&_thead_tr]:border-b [&_th]:h-11 [&_th]:px-4 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:bg-muted/40 [&_td]:px-4 [&_td]:py-3 [&_td]:align-middle [&_td]:text-sm [&_tbody_tr]:border-b [&_tbody_tr]:border-border/60 [&_tbody_tr]:bg-background [&_tbody_tr:last-child]:border-0";

function searchPropertyId(search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw).get("propertyId") || "";
}

export default function PropertyHistoryReport() {
  const { toast } = useToast();
  const { formatCurrency } = useLocale();
  const { maintenanceEnabled } = useCompanyModules();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const propertyId = searchPropertyId(search);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const { data: properties = [], isLoading: propertiesLoading } = useQuery<any[]>({
    queryKey: ["/api/properties"],
  });
  const { data: blocks = [] } = useQuery<any[]>({
    queryKey: ["/api/blocks"],
  });
  const { data: inspections = [], isLoading: inspectionsLoading } = useQuery<any[]>({
    queryKey: ["/api/inspections/my"],
    enabled: !!propertyId,
  });
  const { data: maintenanceRequests = [], isLoading: maintenanceLoading } = useQuery<any[]>({
    queryKey: ["/api/maintenance"],
    enabled: !!propertyId && maintenanceEnabled,
  });
  const { data: workOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/work-orders"],
    enabled: !!propertyId && maintenanceEnabled,
  });
  const { data: assetInventory = [], isLoading: assetsLoading } = useQuery<any[]>({
    queryKey: ["/api/asset-inventory"],
    enabled: !!propertyId,
  });
  const { data: complianceDocuments = [], isLoading: complianceLoading } = useQuery<any[]>({
    queryKey: ["/api/compliance"],
    enabled: !!propertyId,
  });
  const { data: tenantAssignments = [], isLoading: tenantsLoading } = useQuery<any[]>({
    queryKey: ["/api/tenant-assignments"],
    enabled: !!propertyId,
  });
  const { data: stats } = useQuery<any>({
    queryKey: ["/api/properties", propertyId, "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/stats`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!propertyId,
  });
  const { data: comparisonReports = [], isLoading: disputesLoading } = useQuery<any[]>({
    queryKey: ["/api/comparisons", propertyId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/comparisons/${propertyId}?includeItems=true`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!propertyId,
  });

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === propertyId) || null,
    [properties, propertyId],
  );
  const selectedBlock = useMemo(
    () => blocks.find((b) => b.id === selectedProperty?.blockId) || null,
    [blocks, selectedProperty],
  );

  const propertyInspections = useMemo(
    () => inspections.filter((i) => i.propertyId === propertyId),
    [inspections, propertyId],
  );
  const propertyMaintenance = useMemo(
    () => maintenanceRequests.filter((m) => m.propertyId === propertyId),
    [maintenanceRequests, propertyId],
  );
  const propertyAssets = useMemo(
    () => assetInventory.filter((a) => a.propertyId === propertyId),
    [assetInventory, propertyId],
  );
  const propertyCompliance = useMemo(
    () => complianceDocuments.filter((c) => c.propertyId === propertyId),
    [complianceDocuments, propertyId],
  );
  const propertyTenants = useMemo(() => {
    const list = tenantAssignments.filter((ta) => ta.propertyId === propertyId);
    return [...list].sort((a, b) => {
      const aActive = isActiveTenant(a) ? 0 : 1;
      const bActive = isActiveTenant(b) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      const aStart = new Date(leaseOf(a).start || 0).getTime();
      const bStart = new Date(leaseOf(b).start || 0).getTime();
      return bStart - aStart;
    });
  }, [tenantAssignments, propertyId]);

  const disputeRows = useMemo(() => {
    const statuses = new Set(["disputed", "resolved", "waived"]);
    const rows: any[] = [];
    for (const report of comparisonReports) {
      const items = Array.isArray(report.items) ? report.items : [];
      for (const item of items) {
        if (!statuses.has(item.status)) continue;
        const tenantUser =
          report.tenantId &&
          propertyTenants.find((ta) => ta.tenantId === report.tenantId || ta.id === report.tenantId);
        rows.push({
          key: item.id,
          reportId: report.id,
          description: [item.sectionRef, item.itemRef, item.fieldKey].filter(Boolean).join(" · ") || "—",
          summary: item.aiSummary || "",
          disputedAt: item.disputedAt,
          tenant: tenantUser ? tenantName(tenantUser) : "—",
          tenantHref: tenantUser ? tenantHref(tenantUser) : report.tenantId ? `/tenants/${report.tenantId}` : null,
          status: item.status,
          reason: item.disputeReason || "—",
        });
      }
    }
    return rows;
  }, [comparisonReports, propertyTenants]);

  const occupancy = stats?.occupancyStatus
    ? stats.occupancyStatus
    : propertyTenants.some(isActiveTenant)
      ? "Occupied"
      : "Vacant";

  const isLoading =
    propertiesLoading ||
    (!!propertyId &&
      (inspectionsLoading ||
        (maintenanceEnabled && maintenanceLoading) ||
        assetsLoading ||
        complianceLoading ||
        tenantsLoading ||
        disputesLoading));

  const handleSelectProperty = (id: string) => {
    setLocation(`/reports/property-history?propertyId=${encodeURIComponent(id)}`);
  };

  const handleExportPdf = async () => {
    if (!propertyId) return;
    setIsExportingPdf(true);
    try {
      const response = await fetch(
        `/api/reports/property-history/pdf?propertyId=${encodeURIComponent(propertyId)}`,
        { method: "GET", credentials: "include" },
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to generate PDF report" }));
        throw new Error(errorData.message || "Failed to generate PDF report");
      }
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/pdf")) {
        throw new Error("Server did not return a PDF. Please restart the server and try again.");
      }
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("Generated PDF file is empty");
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug = (selectedProperty?.name || "property").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      a.download = `property-history-${slug || "property"}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Report exported",
        description: "Your property history PDF has been downloaded successfully",
      });
    } catch (error: any) {
      console.error("PDF export error:", error);
      toast({
        title: "Export failed",
        description: error.message || "Failed to generate PDF report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className={cn("container mx-auto min-w-0", pagePad, "space-y-4 md:space-y-6")}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/reports">
            <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <History className="h-6 w-6 sm:h-8 sm:w-8 text-primary flex-shrink-0" />
              <span>Property History Report</span>
            </h1>
            <p className="text-xs sm:text-sm md:text-base text-muted-foreground mt-1">
              Complete history for one property
            </p>
          </div>
        </div>
        <Button
          onClick={handleExportPdf}
          disabled={!propertyId || isExportingPdf || isLoading}
          size="sm"
          className="sm:size-default self-start sm:self-auto"
          data-testid="button-export-property-history-pdf"
        >
          {isExportingPdf ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating PDF...
            </>
          ) : (
            <>
              <FileDown className="mr-2 h-4 w-4" />
              Export PDF
            </>
          )}
        </Button>
      </div>

      <Card className="glass-card shadow-sm">
        <CardHeader className="py-4">
          <CardTitle className="text-base">Property</CardTitle>
          <CardDescription>Choose a property to preview and export its history.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={propertyId || undefined} onValueChange={handleSelectProperty}>
            <SelectTrigger className="max-w-xl" data-testid="select-property-history">
              <SelectValue placeholder="Select a property" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.address ? ` — ${p.address}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!propertyId ? (
        <Card className="glass-card shadow-sm">
          <CardContent className="py-16 text-center text-muted-foreground">
            Select a property to load its inspection, tenant, compliance, maintenance, dispute, and asset history.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading property history...
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Inspections", value: propertyInspections.length, target: "section-inspections" },
              { label: "Tenants", value: propertyTenants.length, target: "section-tenants" },
              { label: "Compliance", value: propertyCompliance.length, target: "section-compliance" },
              maintenanceEnabled
                ? { label: "Maintenance", value: propertyMaintenance.length, target: "section-maintenance" }
                : null,
              { label: "Disputes", value: disputeRows.length, target: "section-disputes" },
              { label: "Assets", value: propertyAssets.length, target: "section-assets" },
            ]
              .filter((card): card is { label: string; value: number; target: string } => card !== null)
              .map((card) => (
              <button
                key={card.target}
                type="button"
                className="text-left"
                onClick={() => document.getElementById(card.target)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <Card className="glass-card shadow-sm h-full transition-shadow hover:shadow-md cursor-pointer">
                  <CardHeader className="pb-2">
                    <CardDescription>{card.label}</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">{card.value}</CardTitle>
                  </CardHeader>
                </Card>
              </button>
            ))}
          </div>

          <SectionTable title="Property Overview" icon={Building2} count={selectedProperty ? 1 : 0} id="section-overview">
            <Table className={reportTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead className="text-center">Type</TableHead>
                  <TableHead className="text-center hidden sm:table-cell">Sqft</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead className="text-center">Occupancy</TableHead>
                  <TableHead className="text-center hidden md:table-cell">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedProperty ? (
                  <EmptyRow colSpan={6} message="No property found." />
                ) : (
                  <TableRow>
                    <TableCell className={textBreak}>
                      <CellStack
                        title={selectedProperty.name || "—"}
                        sub={selectedProperty.address || ""}
                        href={`/properties/${selectedProperty.id}`}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <TextLink href={`/properties/${selectedProperty.id}`}>
                        {prettyLabel(selectedProperty.propertyType || selectedProperty.type)}
                      </TextLink>
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell">
                      <TextLink href={`/properties/${selectedProperty.id}`}>
                        {selectedProperty.sqft != null ? selectedProperty.sqft : "—"}
                      </TextLink>
                    </TableCell>
                    <TableCell>
                      {selectedBlock ? (
                        <CellStack title={selectedBlock.name} href={`/blocks/${selectedBlock.id}`} />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Link href={`/properties/${selectedProperty.id}/tenants`}>
                        <Badge variant={occupancy === "Occupied" ? "default" : "secondary"} className="cursor-pointer">
                          {occupancy}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="text-center hidden md:table-cell">
                      <TextLink href={`/properties/${selectedProperty.id}`}>
                        {formatDate(selectedProperty.createdAt) || "—"}
                      </TextLink>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </SectionTable>

          <SectionTable title="Inspection History" icon={ClipboardCheck} count={propertyInspections.length} id="section-inspections">
            <Table className={reportTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Inspector</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Report</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propertyInspections.length === 0 ? (
                  <EmptyRow colSpan={6} message="No inspections found." />
                ) : (
                  propertyInspections.map((inspection) => {
                    const point = inspection.completedDate || inspection.scheduledDate || inspection.createdAt;
                    const tenantHit = propertyTenants.find((ta) => {
                      const lease = leaseOf(ta);
                      return datesOverlap(lease.start, lease.end, point, point);
                    });
                    const reportHref = `/inspections/${inspection.id}/report`;
                    return (
                      <TableRow key={inspection.id}>
                        <TableCell>
                          <TextLink href={reportHref}>{prettyLabel(inspection.type)}</TextLink>
                        </TableCell>
                        <TableCell>
                          <CellStack
                            title={formatDate(inspection.scheduledDate) || "—"}
                            sub={formatDate(inspection.completedDate) || ""}
                            href={reportHref}
                          />
                        </TableCell>
                        <TableCell>
                          <TextLink href={reportHref}>{personName(inspection.clerk)}</TextLink>
                        </TableCell>
                        <TableCell className="text-center">
                          <Link href={reportHref}>
                            <Badge variant="secondary" className="cursor-pointer">
                              {prettyLabel(inspection.status)}
                            </Badge>
                          </Link>
                        </TableCell>
                        <TableCell>
                          {tenantHit ? (
                            <TextLink href={tenantHref(tenantHit)}>{tenantName(tenantHit)}</TextLink>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <CellStack title="View inspection" href={reportHref} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </SectionTable>

          <SectionTable title="Tenant History" icon={Users} count={propertyTenants.length} id="section-tenants">
            <Table className={reportTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Lease</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Deposit</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propertyTenants.length === 0 ? (
                  <EmptyRow colSpan={5} message="No tenant assignments found." />
                ) : (
                  propertyTenants.map((ta) => {
                    const lease = leaseOf(ta);
                    const active = isActiveTenant(ta);
                    const href = tenantHref(ta);
                    return (
                      <TableRow key={ta.id || ta.assignment?.id || `${ta.tenantId}-${lease.start}`}>
                        <TableCell>
                          <CellStack title={tenantName(ta)} sub={tenantEmail(ta)} href={href} />
                        </TableCell>
                        <TableCell>
                          <CellStack
                            title={formatDate(lease.start) || "—"}
                            sub={formatDate(lease.end) || ""}
                            href={href}
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <TextLink href={href}>{formatMoneyValue(lease.rent, formatCurrency)}</TextLink>
                        </TableCell>
                        <TableCell className="text-right tabular-nums hidden sm:table-cell">
                          <TextLink href={href}>{formatMoneyValue(lease.deposit, formatCurrency)}</TextLink>
                        </TableCell>
                        <TableCell className="text-center">
                          {href ? (
                            <Link href={href}>
                              <Badge variant={active ? "default" : "secondary"} className="cursor-pointer">
                                {active ? "Active" : "Previous"}
                              </Badge>
                            </Link>
                          ) : (
                            <Badge variant={active ? "default" : "secondary"}>
                              {active ? "Active" : "Previous"}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </SectionTable>

          <SectionTable title="Compliance History" icon={ShieldCheck} count={propertyCompliance.length} id="section-compliance">
            <Table className={reportTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead className="text-center">Uploaded</TableHead>
                  <TableHead className="text-center">Expiry</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propertyCompliance.length === 0 ? (
                  <EmptyRow colSpan={4} message="No compliance documents found." />
                ) : (
                  propertyCompliance.map((doc) => {
                    const expired =
                      doc.status === "expired" ||
                      (doc.expiryDate && new Date(doc.expiryDate).getTime() < Date.now());
                    let label = prettyLabel(doc.status || "current");
                    if (expired) label = "Expired";
                    else if (doc.expiryDate) {
                      const daysUntil = Math.floor(
                        (new Date(doc.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                      );
                      if (daysUntil >= 0 && daysUntil <= 30) label = "Expiring";
                    }
                    const href = `/compliance?documentId=${doc.id}`;
                    return (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <TextLink href={href}>{prettyLabel(doc.documentType)}</TextLink>
                        </TableCell>
                        <TableCell className="text-center">
                          <TextLink href={href}>{formatDate(doc.createdAt) || "—"}</TextLink>
                        </TableCell>
                        <TableCell className="text-center">
                          <TextLink href={href}>{formatDate(doc.expiryDate) || "—"}</TextLink>
                        </TableCell>
                        <TableCell className="text-center">
                          <Link href={href}>
                            <Badge variant={expired ? "destructive" : "secondary"} className="cursor-pointer">
                              {label}
                            </Badge>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </SectionTable>

          {maintenanceEnabled && (
          <SectionTable title="Maintenance History" icon={Wrench} count={propertyMaintenance.length} id="section-maintenance">
            <Table className={reportTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="hidden md:table-cell">Assigned</TableHead>
                  <TableHead className="hidden lg:table-cell">Contractor</TableHead>
                  <TableHead className="text-center hidden md:table-cell">Completed</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propertyMaintenance.length === 0 ? (
                  <EmptyRow colSpan={7} message="No maintenance requests found." />
                ) : (
                  propertyMaintenance.map((req) => {
                    const wo = workOrders.find(
                      (w) =>
                        w.maintenanceRequestId === req.id || w.maintenanceRequest?.id === req.id,
                    );
                    const contractor =
                      wo?.contractor?.companyName ||
                      [wo?.contractor?.firstName, wo?.contractor?.lastName].filter(Boolean).join(" ") ||
                      "—";
                    const cost =
                      wo?.costActual != null
                        ? formatMoneyValue(wo.costActual, formatCurrency, true)
                        : wo?.costEstimate != null
                          ? formatMoneyValue(wo.costEstimate, formatCurrency, true)
                          : "—";
                    const href = `/maintenance/${req.id}`;
                    return (
                      <TableRow key={req.id}>
                        <TableCell>
                          <CellStack title={req.title || "—"} sub={prettyLabel(req.source)} href={href} />
                        </TableCell>
                        <TableCell>
                          <CellStack
                            title={formatDate(req.createdAt) || "—"}
                            sub={formatDate(req.dueDate) || ""}
                            href={href}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Link href={href}>
                            <Badge variant="secondary" className="cursor-pointer">
                              {prettyLabel(req.status)}
                            </Badge>
                          </Link>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <TextLink href={href}>—</TextLink>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <TextLink href={href}>{contractor}</TextLink>
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          <TextLink href={href}>{formatDate(wo?.completedAt) || "—"}</TextLink>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <TextLink href={href}>{cost}</TextLink>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </SectionTable>
          )}

          <SectionTable title="Dispute History" icon={Scale} count={disputeRows.length} id="section-disputes">
            <Table className={reportTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-center">Disputed</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {disputeRows.length === 0 ? (
                  <EmptyRow colSpan={5} message="No disputes found." />
                ) : (
                  disputeRows.map((row) => {
                    const href = row.reportId ? `/comparisons/${row.reportId}` : null;
                    return (
                      <TableRow key={row.key}>
                        <TableCell>
                          <CellStack title={row.description} sub={row.summary} href={href} />
                        </TableCell>
                        <TableCell className="text-center">
                          <TextLink href={href}>{formatDate(row.disputedAt) || "—"}</TextLink>
                        </TableCell>
                        <TableCell>
                          <TextLink href={row.tenantHref || href}>{row.tenant}</TextLink>
                        </TableCell>
                        <TableCell className="text-center">
                          {href ? (
                            <Link href={href}>
                              <Badge
                                variant={row.status === "disputed" ? "destructive" : "secondary"}
                                className="cursor-pointer"
                              >
                                {prettyLabel(row.status)}
                              </Badge>
                            </Link>
                          ) : (
                            <Badge variant={row.status === "disputed" ? "destructive" : "secondary"}>
                              {prettyLabel(row.status)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className={textBreak}>
                          <TextLink href={href}>{row.reason}</TextLink>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </SectionTable>

          <SectionTable title="Asset History" icon={Package} count={propertyAssets.length} id="section-assets">
            <Table className={reportTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-center">Condition</TableHead>
                  <TableHead className="text-center hidden sm:table-cell">Purchased</TableHead>
                  <TableHead className="text-center hidden md:table-cell">Warranty</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propertyAssets.length === 0 ? (
                  <EmptyRow colSpan={6} message="No assets found." />
                ) : (
                  propertyAssets.map((asset) => {
                    const href = `/asset-inventory?assetId=${asset.id}`;
                    const thumb = firstAssetImage(asset.photos);
                    const gallery = Array.isArray(asset.photos)
                      ? asset.photos
                          .filter((p: unknown): p is string => typeof p === "string" && !!p.trim() && !isLikelyAssetDocument(p))
                          .map((p: string) => ({
                            src: normalizeAssetPhotoUrl(p) || p,
                            alt: asset.name || "Asset",
                            title: asset.name || "Asset",
                          }))
                      : [];
                    return (
                      <TableRow key={asset.id}>
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border bg-muted">
                              {thumb ? (
                                <PreviewableImage
                                  src={thumb}
                                  alt={asset.name || "Asset"}
                                  title={asset.name || "Asset"}
                                  showHint={false}
                                  gallery={gallery}
                                  className="h-full w-full object-cover"
                                  data-testid={`img-asset-thumb-${asset.id}`}
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <Package className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <CellStack title={asset.name || "—"} sub={asset.category || ""} href={href} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <TextLink href={href}>{asset.location || "—"}</TextLink>
                        </TableCell>
                        <TableCell className="text-center">
                          <Link href={href}>
                            <Badge variant="secondary" className="cursor-pointer">
                              {prettyLabel(asset.condition)}
                            </Badge>
                          </Link>
                        </TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          <TextLink href={href}>{formatDate(asset.datePurchased) || "—"}</TextLink>
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          <TextLink href={href}>{formatDate(asset.warrantyExpiryDate) || "—"}</TextLink>
                        </TableCell>
                        <TableCell className="text-center">
                          <TextLink href={href}>{prettyLabel(asset.condition)}</TextLink>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </SectionTable>
        </>
      )}
    </div>
  );
}
