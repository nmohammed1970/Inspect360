import { useMemo, useState } from "react";
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
  ArrowLeft,
  Building2,
  ClipboardCheck,
  Download,
  FileBarChart,
  FileDown,
  Loader2,
  Package,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wrench,
  CalendarClock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/contexts/LocaleContext";

function formatDate(value: any): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function isActiveTenant(ta: any): boolean {
  return ta?.status === "active" || ta?.status === "current" || ta?.isActive === true;
}

function formatMoneyValue(
  value: unknown,
  formatCurrency: (amount: number, minorUnits?: boolean) => string
): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(num)) return "—";
  return formatCurrency(num, false);
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
    subHref ? (
      <Link href={subHref}>
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
  children,
}: {
  title: string;
  icon: LucideIcon;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="glass-card overflow-hidden shadow-sm">
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
      <CardContent className="p-0 bg-background">
        <div className="overflow-x-auto">{children}</div>
      </CardContent>
    </Card>
  );
}

const reportTableClass =
  "w-full bg-background [&_thead_tr]:border-b [&_th]:h-11 [&_th]:px-4 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:bg-muted/40 [&_td]:px-4 [&_td]:py-3 [&_td]:align-middle [&_td]:text-sm [&_tbody_tr]:border-b [&_tbody_tr]:border-border/60 [&_tbody_tr]:bg-background [&_tbody_tr:last-child]:border-0";

export default function PortfolioReport() {
  const { toast } = useToast();
  const { formatCurrency } = useLocale();
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const { data: blocks = [], isLoading: blocksLoading } = useQuery<any[]>({
    queryKey: ["/api/blocks"],
  });
  const { data: properties = [], isLoading: propertiesLoading } = useQuery<any[]>({
    queryKey: ["/api/properties"],
  });
  // Same source Inspections Report uses (org-visible inspections for the user)
  const { data: inspections = [], isLoading: inspectionsLoading } = useQuery<any[]>({
    queryKey: ["/api/inspections/my"],
  });
  const { data: maintenanceRequests = [], isLoading: maintenanceLoading } = useQuery<any[]>({
    queryKey: ["/api/maintenance"],
  });
  const { data: assetInventory = [], isLoading: assetsLoading } = useQuery<any[]>({
    queryKey: ["/api/asset-inventory"],
  });
  const { data: complianceDocuments = [], isLoading: complianceLoading } = useQuery<any[]>({
    queryKey: ["/api/compliance"],
  });
  const { data: tenantAssignments = [], isLoading: tenantsLoading } = useQuery<any[]>({
    queryKey: ["/api/tenant-assignments"],
  });

  const isLoading =
    blocksLoading ||
    propertiesLoading ||
    inspectionsLoading ||
    maintenanceLoading ||
    assetsLoading ||
    complianceLoading ||
    tenantsLoading;

  const now = useMemo(() => new Date(), []);

  const openMaintenance = useMemo(
    () =>
      maintenanceRequests.filter((m) => m.status === "open" || m.status === "in_progress").length,
    [maintenanceRequests]
  );

  const expiringCompliance = useMemo(
    () =>
      complianceDocuments.filter((doc) => {
        if (!doc.expiryDate) return false;
        const daysUntil = Math.floor(
          (new Date(doc.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysUntil > 0 && daysUntil <= 30;
      }).length,
    [complianceDocuments, now]
  );

  const expiredCompliance = useMemo(
    () =>
      complianceDocuments.filter((doc) => {
        if (!doc.expiryDate) return false;
        return new Date(doc.expiryDate).getTime() < now.getTime();
      }).length,
    [complianceDocuments, now]
  );

  // ---- Blocks & Properties (same structure/order as PDF) ----
  const blocksAndPropertiesRows = useMemo(() => {
    const rows: Array<{
      key: string;
      blockId: string | null;
      propertyId: string | null;
      blockName: string;
      blockAddress: string;
      showBlock: boolean;
      propertyName: string;
      propertyAddress: string;
      type: string;
      status: string;
      rent: string;
      insp: number;
      maint: number;
      assets: number;
      comp: number;
    }> = [];

    const propertiesByBlock = new Map<string, any[]>();
    properties.forEach((prop) => {
      const blockId = prop.blockId || "no-block";
      if (!propertiesByBlock.has(blockId)) propertiesByBlock.set(blockId, []);
      propertiesByBlock.get(blockId)!.push(prop);
    });

    blocks.forEach((block) => {
      const blockProperties = propertiesByBlock.get(block.id) || [];
      if (blockProperties.length === 0) {
        rows.push({
          key: `block-${block.id}-empty`,
          blockId: block.id,
          propertyId: null,
          blockName: block.name || "—",
          blockAddress: block.address || "",
          showBlock: true,
          propertyName: "—",
          propertyAddress: "",
          type: "—",
          status: "—",
          rent: "—",
          insp: 0,
          maint: 0,
          assets: 0,
          comp: 0,
        });
      } else {
        blockProperties.forEach((property, propIdx) => {
          const tenantAssignment = tenantAssignments.find(
            (ta) => ta.propertyId === property.id && isActiveTenant(ta)
          );
          rows.push({
            key: `prop-${property.id}`,
            blockId: block.id,
            propertyId: property.id,
            blockName: block.name || "—",
            blockAddress: block.address || "",
            showBlock: propIdx === 0,
            propertyName: property.name || "—",
            propertyAddress: property.address || "",
            type: property.propertyType || property.type || "—",
            status: tenantAssignment ? "Occupied" : "Vacant",
            rent: formatMoneyValue(tenantAssignment?.monthlyRent, formatCurrency),
            insp: inspections.filter((i) => i.propertyId === property.id).length,
            maint: maintenanceRequests.filter((m) => m.propertyId === property.id).length,
            assets: assetInventory.filter((a) => a.propertyId === property.id).length,
            comp: complianceDocuments.filter((c) => c.propertyId === property.id).length,
          });
        });
      }
    });

    const standalone = propertiesByBlock.get("no-block") || [];
    standalone.forEach((property) => {
      const tenantAssignment = tenantAssignments.find(
        (ta) => ta.propertyId === property.id && isActiveTenant(ta)
      );
      rows.push({
        key: `standalone-${property.id}`,
        blockId: null,
        propertyId: property.id,
        blockName: "Standalone",
        blockAddress: "",
        showBlock: true,
        propertyName: property.name || "—",
        propertyAddress: property.address || "",
        type: property.propertyType || property.type || "—",
        status: tenantAssignment ? "Occupied" : "Vacant",
        rent: formatMoneyValue(tenantAssignment?.monthlyRent, formatCurrency),
        insp: inspections.filter((i) => i.propertyId === property.id).length,
        maint: maintenanceRequests.filter((m) => m.propertyId === property.id).length,
        assets: assetInventory.filter((a) => a.propertyId === property.id).length,
        comp: complianceDocuments.filter((c) => c.propertyId === property.id).length,
      });
    });

    return rows;
  }, [
    blocks,
    properties,
    tenantAssignments,
    inspections,
    maintenanceRequests,
    assetInventory,
    complianceDocuments,
    formatCurrency,
  ]);

  const inspectionRows = useMemo(() => {
    const blockMap = new Map(blocks.map((b) => [b.id, b]));
    const propertyMap = new Map(properties.map((p) => [p.id, p]));
    return inspections.map((inspection) => {
      const property = propertyMap.get(inspection.propertyId) || inspection.property;
      const block =
        blocks.find((b) => b.id === (inspection.blockId || property?.blockId)) ||
        (property?.blockId ? blockMap.get(property.blockId) : null);
      const dateVal = inspection.completedDate
        ? formatDate(inspection.completedDate)
        : inspection.scheduledDate
          ? formatDate(inspection.scheduledDate)
          : "—";
      const inspector = inspection.clerk
        ? `${inspection.clerk.firstName || ""} ${inspection.clerk.lastName || ""}`.trim() ||
          inspection.clerk.email ||
          ""
        : "";
      return {
        id: inspection.id,
        date: dateVal,
        inspector,
        blockId: block?.id || null,
        blockName: block?.name || "—",
        propertyId: property?.id || inspection.propertyId || null,
        propertyName: property?.name || "—",
        type: inspection.type || "—",
        status: inspection.status || "—",
        scheduled: formatDate(inspection.scheduledDate) || "—",
        completed: formatDate(inspection.completedDate),
      };
    });
  }, [inspections, blocks, properties]);

  const maintenanceRows = useMemo(() => {
    const propertyMap = new Map(properties.map((p) => [p.id, p]));
    return maintenanceRequests.map((maintenance) => {
      const property = propertyMap.get(maintenance.propertyId) || maintenance.property;
      const block =
        blocks.find((b) => b.id === (maintenance.blockId || property?.blockId)) ||
        maintenance.block;
      const reportedBy = maintenance.reportedByUser
        ? `${maintenance.reportedByUser.firstName || ""} ${maintenance.reportedByUser.lastName || ""}`.trim()
        : "";
      const assignedTo = maintenance.assignedToUser
        ? `${maintenance.assignedToUser.firstName || ""} ${maintenance.assignedToUser.lastName || ""}`.trim()
        : "";
      return {
        id: maintenance.id,
        created: formatDate(maintenance.createdAt) || "—",
        due: formatDate(maintenance.dueDate),
        blockId: block?.id || null,
        blockName: block?.name || "—",
        propertyId: property?.id || maintenance.propertyId || null,
        propertyName: property?.name || "—",
        title: maintenance.title || "—",
        status: maintenance.status || "—",
        priority: maintenance.priority || "—",
        reportedBy: reportedBy || "—",
        assignedTo,
      };
    });
  }, [maintenanceRequests, properties, blocks]);

  const assetRows = useMemo(() => {
    const propertyMap = new Map(properties.map((p) => [p.id, p]));
    const blockMap = new Map(blocks.map((b) => [b.id, b]));
    return assetInventory.map((asset) => {
      const property = propertyMap.get(asset.propertyId);
      const block = property
        ? blockMap.get(property.blockId)
        : asset.blockId
          ? blockMap.get(asset.blockId)
          : null;
      return {
        id: asset.id,
        blockId: block?.id || asset.blockId || null,
        blockName: block?.name || "—",
        propertyId: property?.id || asset.propertyId || null,
        propertyName: property?.name || "",
        name: asset.name || "—",
        category: asset.category || "",
        purchase: formatMoneyValue(asset.purchasePrice, formatCurrency),
        value: formatMoneyValue(asset.currentValue, formatCurrency),
        purchased: formatDate(asset.datePurchased) || "—",
        condition: asset.condition || "—",
        location: asset.location || "",
      };
    });
  }, [assetInventory, properties, blocks, formatCurrency]);

  const complianceRows = useMemo(() => {
    const propertyMap = new Map(properties.map((p) => [p.id, p]));
    const blockMap = new Map(blocks.map((b) => [b.id, b]));
    return complianceDocuments.map((doc) => {
      const property = propertyMap.get(doc.propertyId);
      const block = property
        ? blockMap.get(property.blockId)
        : blocks.find((b) => b.id === doc.blockId);
      let status = "Current";
      let variant: "default" | "secondary" | "destructive" | "outline" = "default";
      if (doc.expiryDate) {
        const daysUntil = Math.floor(
          (new Date(doc.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysUntil < 0) {
          status = "Expired";
          variant = "destructive";
        } else if (daysUntil <= 30) {
          status = "Expiring Soon";
          variant = "outline";
        }
      }
      return {
        id: doc.id,
        blockId: block?.id || doc.blockId || null,
        blockName: block?.name || "—",
        propertyId: property?.id || doc.propertyId || null,
        propertyName: property?.name || "",
        documentType: doc.documentType || "—",
        documentName: doc.documentName || "",
        issueDate: formatDate(doc.issueDate) || "—",
        expiryDate: formatDate(doc.expiryDate),
        status,
        variant,
        notes: doc.notes || "—",
      };
    });
  }, [complianceDocuments, properties, blocks, now]);

  const tenantRows = useMemo(() => {
    const propertyMap = new Map(properties.map((p) => [p.id, p]));
    const blockMap = new Map(blocks.map((b) => [b.id, b]));
    return tenantAssignments.map((assignment) => {
      const property = propertyMap.get(assignment.propertyId);
      const block = property ? blockMap.get(property.blockId) : null;
      const tenantFullName =
        [assignment.tenantFirstName, assignment.tenantLastName].filter(Boolean).join(" ") || "—";
      return {
        id: assignment.id,
        tenantId: assignment.tenantId || assignment.tenantUserId || null,
        blockId: block?.id || null,
        blockName: block?.name || "—",
        propertyId: property?.id || assignment.propertyId || null,
        propertyName: property?.name || "",
        name: tenantFullName,
        email: assignment.tenantEmail || "",
        leaseStart: formatDate(assignment.leaseStartDate) || "—",
        leaseEnd: formatDate(assignment.leaseEndDate),
        rent: formatMoneyValue(assignment.monthlyRent, formatCurrency),
        deposit: formatMoneyValue(assignment.depositAmount, formatCurrency),
        status: assignment.isActive ? "active" : assignment.status || "inactive",
      };
    });
  }, [tenantAssignments, properties, blocks, formatCurrency]);

  const atRiskRows = useMemo(() => {
    const rows: Array<{
      key: string;
      href: string | null;
      type: string;
      locationHref: string | null;
      location: string;
      locationSubHref: string | null;
      locationSub: string;
      item: string;
      itemSub: string;
      status: string;
      due: string;
      dueSub: string;
    }> = [];
    const propertyMap = new Map(properties.map((p) => [p.id, p]));
    const blockMap = new Map(blocks.map((b) => [b.id, b]));

    complianceDocuments.forEach((doc) => {
      if (!doc.expiryDate) return;
      const expiry = new Date(doc.expiryDate);
      if (expiry >= now) return;
      const property = propertyMap.get(doc.propertyId);
      const block = property
        ? blockMap.get(property.blockId)
        : blocks.find((b) => b.id === doc.blockId);
      const daysOverdue = Math.floor((now.getTime() - expiry.getTime()) / (1000 * 60 * 60 * 24));
      rows.push({
        key: `comp-${doc.id}`,
        href: `/compliance?documentId=${doc.id}`,
        type: "Compliance Document",
        locationHref: block?.id ? `/blocks/${block.id}` : null,
        location: block?.name || "—",
        locationSubHref: property?.id ? `/properties/${property.id}` : null,
        locationSub: property?.name || "",
        item: doc.documentName || doc.documentType || "—",
        itemSub: doc.notes || "",
        status: "Expired",
        due: expiry.toLocaleDateString(),
        dueSub: `${daysOverdue}d overdue`,
      });
    });

    maintenanceRequests.forEach((maintenance) => {
      if (!maintenance.dueDate) return;
      const dueDate = new Date(maintenance.dueDate);
      if (!(dueDate < now && (maintenance.status === "open" || maintenance.status === "in_progress")))
        return;
      const property = propertyMap.get(maintenance.propertyId) || maintenance.property;
      const block =
        (property ? blockMap.get(property.blockId) : null) ||
        blocks.find((b) => b.id === maintenance.blockId) ||
        maintenance.block;
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      rows.push({
        key: `maint-${maintenance.id}`,
        href: `/maintenance/${maintenance.id}`,
        type: "Maintenance Request",
        locationHref: block?.id ? `/blocks/${block.id}` : null,
        location: block?.name || "—",
        locationSubHref: property?.id ? `/properties/${property.id}` : null,
        locationSub: property?.name || "",
        item: maintenance.title || "—",
        itemSub: maintenance.description || "",
        status: maintenance.status || "—",
        due: dueDate.toLocaleDateString(),
        dueSub: `${daysOverdue}d overdue`,
      });
    });

    inspections.forEach((inspection) => {
      if (!inspection.scheduledDate || inspection.status === "completed") return;
      const scheduled = new Date(inspection.scheduledDate);
      if (scheduled >= now) return;
      const property = propertyMap.get(inspection.propertyId) || inspection.property;
      const block =
        (property ? blockMap.get(property.blockId) : null) ||
        blocks.find((b) => b.id === inspection.blockId);
      const daysOverdue = Math.floor((now.getTime() - scheduled.getTime()) / (1000 * 60 * 60 * 24));
      rows.push({
        key: `insp-${inspection.id}`,
        href: `/inspections/${inspection.id}/report`,
        type: "Inspection",
        locationHref: block?.id ? `/blocks/${block.id}` : null,
        location: block?.name || "—",
        locationSubHref: property?.id ? `/properties/${property.id}` : null,
        locationSub: property?.name || "",
        item: `${inspection.type || "Inspection"} - ${inspection.status || "Pending"}`,
        itemSub: inspection.notes || "",
        status: inspection.status || "—",
        due: scheduled.toLocaleDateString(),
        dueSub: `${daysOverdue}d overdue`,
      });
    });

    return rows;
  }, [complianceDocuments, maintenanceRequests, inspections, properties, blocks, now]);

  const upcomingRows = useMemo(() => {
    const rows: Array<{
      key: string;
      href: string | null;
      type: string;
      locationHref: string | null;
      location: string;
      locationSubHref: string | null;
      locationSub: string;
      item: string;
      itemSub: string;
      due: string;
      dueSub: string;
    }> = [];
    const propertyMap = new Map(properties.map((p) => [p.id, p]));
    const blockMap = new Map(blocks.map((b) => [b.id, b]));

    complianceDocuments.forEach((doc) => {
      if (!doc.expiryDate) return;
      const expiry = new Date(doc.expiryDate);
      const daysUntil = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (!(daysUntil > 0 && daysUntil <= 30)) return;
      const property = propertyMap.get(doc.propertyId);
      const block = property
        ? blockMap.get(property.blockId)
        : blocks.find((b) => b.id === doc.blockId);
      rows.push({
        key: `up-comp-${doc.id}`,
        href: `/compliance?documentId=${doc.id}`,
        type: "Compliance Document",
        locationHref: block?.id ? `/blocks/${block.id}` : null,
        location: block?.name || "—",
        locationSubHref: property?.id ? `/properties/${property.id}` : null,
        locationSub: property?.name || "",
        item: doc.documentType || "—",
        itemSub: "",
        due: expiry.toLocaleDateString(),
        dueSub: `In ${daysUntil} days`,
      });
    });

    maintenanceRequests.forEach((maintenance) => {
      if (!maintenance.dueDate) return;
      const dueDate = new Date(maintenance.dueDate);
      const daysUntil = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (
        !(
          daysUntil > 0 &&
          daysUntil <= 30 &&
          (maintenance.status === "open" || maintenance.status === "in_progress")
        )
      )
        return;
      const property = propertyMap.get(maintenance.propertyId) || maintenance.property;
      const block =
        (property ? blockMap.get(property.blockId) : null) ||
        blocks.find((b) => b.id === maintenance.blockId) ||
        maintenance.block;
      rows.push({
        key: `up-maint-${maintenance.id}`,
        href: `/maintenance/${maintenance.id}`,
        type: "Maintenance Request",
        locationHref: block?.id ? `/blocks/${block.id}` : null,
        location: block?.name || "—",
        locationSubHref: property?.id ? `/properties/${property.id}` : null,
        locationSub: property?.name || "",
        item: maintenance.title || "—",
        itemSub: maintenance.description || "",
        due: dueDate.toLocaleDateString(),
        dueSub: `In ${daysUntil} days`,
      });
    });

    inspections.forEach((inspection) => {
      if (!inspection.scheduledDate || inspection.status === "completed") return;
      const scheduled = new Date(inspection.scheduledDate);
      const daysUntil = Math.floor((scheduled.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (!(daysUntil > 0 && daysUntil <= 30)) return;
      const property = propertyMap.get(inspection.propertyId) || inspection.property;
      const block =
        (property ? blockMap.get(property.blockId) : null) ||
        blocks.find((b) => b.id === inspection.blockId);
      rows.push({
        key: `up-insp-${inspection.id}`,
        href: `/inspections/${inspection.id}/report`,
        type: "Inspection",
        locationHref: block?.id ? `/blocks/${block.id}` : null,
        location: block?.name || "—",
        locationSubHref: property?.id ? `/properties/${property.id}` : null,
        locationSub: property?.name || "",
        item: `${inspection.type || "Inspection"} - ${inspection.status || "Scheduled"}`,
        itemSub: inspection.notes || "",
        due: scheduled.toLocaleDateString(),
        dueSub: `In ${daysUntil} days`,
      });
    });

    tenantAssignments.forEach((assignment) => {
      if (!assignment.leaseEndDate || !isActiveTenant(assignment)) return;
      const leaseEnd = new Date(assignment.leaseEndDate);
      const daysUntil = Math.floor((leaseEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (!(daysUntil > 0 && daysUntil <= 90)) return;
      const property = propertyMap.get(assignment.propertyId);
      const block = property ? blockMap.get(property.blockId) : null;
      const tenant =
        [assignment.tenantFirstName, assignment.tenantLastName].filter(Boolean).join(" ") ||
        "Unknown Tenant";
      const tenantId = assignment.tenantId || assignment.tenantUserId;
      rows.push({
        key: `up-lease-${assignment.id}`,
        href: tenantId
          ? `/tenants/${tenantId}`
          : property?.id
            ? `/properties/${property.id}`
            : null,
        type: "Lease Expiration",
        locationHref: block?.id ? `/blocks/${block.id}` : null,
        location: block?.name || "—",
        locationSubHref: property?.id ? `/properties/${property.id}` : null,
        locationSub: property?.name || "",
        item: tenant,
        itemSub: `Monthly Rent: ${
          assignment.monthlyRent != null
            ? formatMoneyValue(assignment.monthlyRent, formatCurrency)
            : "N/A"
        }`,
        due: leaseEnd.toLocaleDateString(),
        dueSub: `In ${daysUntil} days`,
      });
    });

    return rows;
  }, [
    complianceDocuments,
    maintenanceRequests,
    inspections,
    tenantAssignments,
    properties,
    blocks,
    now,
    formatCurrency,
  ]);

  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    try {
      const response = await fetch("/api/reports/comprehensive/excel", {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to generate Excel report" }));
        throw new Error(errorData.message || "Failed to generate Excel report");
      }
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("Generated Excel file is empty");
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `portfolio-data-export-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Report exported",
        description: "Your portfolio Excel report has been downloaded successfully",
      });
    } catch (error: any) {
      console.error("Excel export error:", error);
      toast({
        title: "Export failed",
        description: error.message || "Failed to generate Excel report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      const response = await fetch("/api/reports/comprehensive/pdf", {
        method: "GET",
        credentials: "include",
      });
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
      a.download = `portfolio-report-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Report exported",
        description: "Your portfolio PDF report has been downloaded successfully",
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

  const exporting = isExportingExcel || isExportingPdf;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/reports">
            <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <FileBarChart className="h-6 w-6 sm:h-8 sm:w-8 text-primary flex-shrink-0" />
              <span>Portfolio Report</span>
            </h1>
            <p className="text-xs sm:text-sm md:text-base text-muted-foreground mt-1">
              Full portfolio overview
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 self-start sm:self-auto">
          <Button
            onClick={handleExportExcel}
            disabled={exporting || isLoading}
            variant="outline"
            size="sm"
            className="sm:size-default"
            data-testid="button-export-portfolio-data"
          >
            {isExportingExcel ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Excel...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download Excel
              </>
            )}
          </Button>
          <Button
            onClick={handleExportPdf}
            disabled={exporting || isLoading}
            size="sm"
            className="sm:size-default"
            data-testid="button-export-portfolio-pdf"
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
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading portfolio data...
        </div>
      ) : (
        <>
          {/* Summary — same stats as PDF */}
          <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <Card className="glass-card shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription>Total Blocks</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{blocks.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="glass-card shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription>Total Properties</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{properties.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="glass-card shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription>Total Inspections</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{inspections.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="glass-card shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription>Total Maintenance</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{maintenanceRequests.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="glass-card shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription>Open Maintenance</CardDescription>
                <CardTitle className="text-2xl tabular-nums text-destructive">{openMaintenance}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="glass-card shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription>Total Assets</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{assetInventory.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="glass-card shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription>Compliance Docs</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{complianceDocuments.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="glass-card shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription>Expiring ≤30 days</CardDescription>
                <CardTitle className="text-2xl tabular-nums text-orange-600">{expiringCompliance}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="glass-card shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription>Expired Documents</CardDescription>
                <CardTitle className="text-2xl tabular-nums text-destructive">{expiredCompliance}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* 1. Blocks & Properties */}
          <SectionTable title="Blocks & Properties" icon={Building2} count={blocksAndPropertiesRows.length}>
            <Table className={reportTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Block</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead className="text-center">Type</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead className="text-center">Insp</TableHead>
                  <TableHead className="text-center">Maint</TableHead>
                  <TableHead className="text-center">Assets</TableHead>
                  <TableHead className="text-center">Comp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blocksAndPropertiesRows.length === 0 ? (
                  <EmptyRow colSpan={9} message="No blocks or properties found." />
                ) : (
                  blocksAndPropertiesRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell>
                        {row.showBlock ? (
                          <CellStack
                            title={row.blockName}
                            sub={row.blockAddress}
                            href={row.blockId ? `/blocks/${row.blockId}` : null}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {row.propertyId ? (
                          <CellStack
                            title={row.propertyName}
                            sub={row.propertyAddress}
                            href={`/properties/${row.propertyId}`}
                          />
                        ) : (
                          <CellStack title={row.propertyName} sub={row.propertyAddress} />
                        )}
                      </TableCell>
                      <TableCell className="text-center">{row.type}</TableCell>
                      <TableCell className="text-center">
                        {row.status === "—" ? (
                          "—"
                        ) : (
                          <Badge variant={row.status === "Occupied" ? "default" : "secondary"}>
                            {row.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.rent}</TableCell>
                      <TableCell className="text-center tabular-nums">{row.insp}</TableCell>
                      <TableCell className="text-center tabular-nums">{row.maint}</TableCell>
                      <TableCell className="text-center tabular-nums">{row.assets}</TableCell>
                      <TableCell className="text-center tabular-nums">{row.comp}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </SectionTable>

          {/* 2. Inspections */}
          <SectionTable title="Inspections" icon={ClipboardCheck} count={inspectionRows.length}>
            <Table className={reportTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead className="text-center">Type</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Schedule</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspectionRows.length === 0 ? (
                  <EmptyRow colSpan={6} message="No inspections found." />
                ) : (
                  inspectionRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <CellStack
                          title={row.date}
                          sub={row.inspector ? `Inspector: ${row.inspector}` : null}
                          href={`/inspections/${row.id}/report`}
                        />
                      </TableCell>
                      <TableCell>
                        <CellStack
                          title={row.blockName}
                          href={row.blockId ? `/blocks/${row.blockId}` : null}
                        />
                      </TableCell>
                      <TableCell>
                        <CellStack
                          title={row.propertyName}
                          href={row.propertyId ? `/properties/${row.propertyId}` : null}
                        />
                      </TableCell>
                      <TableCell className="text-center">{row.type}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{row.status}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <CellStack
                          title={row.scheduled}
                          sub={row.completed ? `Done: ${row.completed}` : null}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </SectionTable>

          {/* 3. Maintenance */}
          <SectionTable title="Maintenance" icon={Wrench} count={maintenanceRows.length}>
            <Table className={reportTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Priority</TableHead>
                  <TableHead>People</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {maintenanceRows.length === 0 ? (
                  <EmptyRow colSpan={7} message="No maintenance requests found." />
                ) : (
                  maintenanceRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <CellStack
                          title={row.created}
                          sub={row.due ? `Due: ${row.due}` : null}
                          href={`/maintenance/${row.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <CellStack
                          title={row.blockName}
                          href={row.blockId ? `/blocks/${row.blockId}` : null}
                        />
                      </TableCell>
                      <TableCell>
                        <CellStack
                          title={row.propertyName}
                          href={row.propertyId ? `/properties/${row.propertyId}` : null}
                        />
                      </TableCell>
                      <TableCell>
                        <CellStack title={row.title} href={`/maintenance/${row.id}`} />
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            row.status === "completed"
                              ? "default"
                              : row.status === "open"
                                ? "outline"
                                : "secondary"
                          }
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{row.priority}</TableCell>
                      <TableCell>
                        <CellStack
                          title={row.reportedBy}
                          sub={row.assignedTo ? `Assigned: ${row.assignedTo}` : null}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </SectionTable>

          {/* 4. Assets */}
          <SectionTable title="Assets" icon={Package} count={assetRows.length}>
            <Table className={reportTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead className="text-right">Purchase</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-center">Purchased</TableHead>
                  <TableHead className="text-center">Condition</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assetRows.length === 0 ? (
                  <EmptyRow colSpan={6} message="No assets found." />
                ) : (
                  assetRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <CellStack
                          title={row.blockName}
                          sub={row.propertyName}
                          href={row.blockId ? `/blocks/${row.blockId}` : null}
                          subHref={row.propertyId ? `/properties/${row.propertyId}` : null}
                        />
                      </TableCell>
                      <TableCell>
                        <CellStack
                          title={row.name}
                          sub={row.category}
                          href={`/asset-inventory?assetId=${row.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.purchase}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.value}</TableCell>
                      <TableCell className="text-center">{row.purchased}</TableCell>
                      <TableCell className="text-center">
                        <CellStack title={row.condition} sub={row.location} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </SectionTable>

          {/* 5. Compliance */}
          <SectionTable title="Compliance" icon={ShieldCheck} count={complianceRows.length}>
            <Table className={reportTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead className="text-center">Dates</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {complianceRows.length === 0 ? (
                  <EmptyRow colSpan={5} message="No compliance documents found." />
                ) : (
                  complianceRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <CellStack
                          title={row.blockName}
                          sub={row.propertyName}
                          href={row.blockId ? `/blocks/${row.blockId}` : null}
                          subHref={row.propertyId ? `/properties/${row.propertyId}` : null}
                        />
                      </TableCell>
                      <TableCell>
                        <CellStack
                          title={row.documentType}
                          sub={row.documentName}
                          href={`/compliance?documentId=${row.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <CellStack
                          title={row.issueDate}
                          sub={row.expiryDate ? `Expires: ${row.expiryDate}` : null}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={row.variant}>{row.status}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <span className="line-clamp-2 text-muted-foreground">{row.notes}</span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </SectionTable>

          {/* 6. Tenants */}
          <SectionTable title="Tenants" icon={Users} count={tenantRows.length}>
            <Table className={reportTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead className="text-center">Lease</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead className="text-right">Deposit</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantRows.length === 0 ? (
                  <EmptyRow colSpan={6} message="No tenant assignments found." />
                ) : (
                  tenantRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <CellStack
                          title={row.blockName}
                          sub={row.propertyName}
                          href={row.blockId ? `/blocks/${row.blockId}` : null}
                          subHref={row.propertyId ? `/properties/${row.propertyId}` : null}
                        />
                      </TableCell>
                      <TableCell>
                        <CellStack
                          title={row.name}
                          sub={row.email}
                          href={row.tenantId ? `/tenants/${row.tenantId}` : row.propertyId ? `/properties/${row.propertyId}` : null}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <CellStack
                          title={row.leaseStart}
                          sub={row.leaseEnd ? `End: ${row.leaseEnd}` : null}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.rent}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.deposit}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={row.status === "active" ? "default" : "secondary"}>
                          {row.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </SectionTable>

          {/* 7. At Risk */}
          <SectionTable title="At Risk Items" icon={ShieldAlert} count={atRiskRows.length}>
            <Table className={reportTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">Type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atRiskRows.length === 0 ? (
                  <EmptyRow colSpan={5} message="No at-risk items found." />
                ) : (
                  atRiskRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="text-center">
                        <Badge variant="outline">{row.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <CellStack
                          title={row.location}
                          sub={row.locationSub}
                          href={row.locationHref}
                          subHref={row.locationSubHref}
                        />
                      </TableCell>
                      <TableCell>
                        <CellStack title={row.item} sub={row.itemSub} href={row.href} />
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            String(row.status).toLowerCase() === "expired"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <CellStack title={row.due} sub={row.dueSub} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </SectionTable>

          {/* 8. Upcoming */}
          <SectionTable title="Upcoming Items" icon={CalendarClock} count={upcomingRows.length}>
            <Table className={reportTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">Type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-center">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingRows.length === 0 ? (
                  <EmptyRow colSpan={4} message="No upcoming items found." />
                ) : (
                  upcomingRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="text-center">
                        <Badge variant="outline">{row.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <CellStack
                          title={row.location}
                          sub={row.locationSub}
                          href={row.locationHref}
                          subHref={row.locationSubHref}
                        />
                      </TableCell>
                      <TableCell>
                        <CellStack title={row.item} sub={row.itemSub} href={row.href} />
                      </TableCell>
                      <TableCell className="text-center">
                        <CellStack title={row.due} sub={row.dueSub} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </SectionTable>
        </>
      )}
    </div>
  );
}
