import { PreviewableImage } from "@/components/ImagePreview";
import {
  PropertyDepositPanel,
  PropertyExpensesPanel,
  PropertyRentCollectionPanel,
} from "@/components/PropertyFinancePanels";
import { SiteMaintenanceFinancePanel } from "@/components/maintenance-quotes/SiteMaintenanceFinancePanel";
import { HmoPropertyPanel } from "@/components/hmo/HmoPropertyPanel";
import { useState, useEffect, useMemo } from "react";
import { useRoute, Link, useSearch } from "wouter";
import { useBackHref } from "@/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import {
  formatInspectionStatus,
  formatMaintenanceStatus,
} from "@shared/inspectionLabels";
import {
  complianceDocTone,
  inspectionStatusTone,
  maintenanceRequestStatusTone,
  priorityTone,
} from "@shared/statusPriorityStyles";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import ComplianceCalendar from "@/components/ComplianceCalendar";
import ComplianceDocumentCalendar from "@/components/ComplianceDocumentCalendar";
import { insertComplianceDocumentSchema, type AssetInventory } from "@shared/schema";
import { computeDocumentComplianceRate } from "@shared/complianceDocTypes";
import { ObjectUploader } from "@/components/ObjectUploader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  Users,
  ClipboardCheck,
  Package,
  FileCheck,
  Wrench,
  MapPin,
  Calendar,
  CheckCircle2,
  AlertCircle,
  User,
  Upload,
  Pencil,
  History,
  Mail,
  Phone,
  Plus,
  Wallet,
  Banknote,
  Receipt,
  LayoutDashboard,
  ShieldAlert,
  ImagePlus,
  MessageSquare,
} from "lucide-react";
import { CommunicationsActivityTimeline } from "@/components/communications/ActivityTimeline";
import { Label } from "@/components/ui/label";
import { PropertyFormDialog } from "@/components/PropertyFormDialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyModules } from "@/hooks/useCompanyModules";
import { useLocale } from "@/contexts/LocaleContext";
import { MapPreview } from "@/components/MapPreview";
import AddTenantDialog from "@/components/AddTenantDialog";
import { cn } from "@/lib/utils";
import { pagePad, dialogContentBase, formGrid2, textBreak, tabsListScroll, tabTriggerResponsive } from "@/lib/responsive";
import {
  defaultLengthUnitForCountry,
  defaultAreaUnitForCountry,
  formatFloorArea,
  formatMillimetresAsFeetInches,
  fromMillimetres,
  looksLikeAreaOnlyDimensions,
  floorAreaFt2,
  floorAreaM2,
} from "@shared/propertyRooms";
import { PropertyOverviewFacts } from "@/components/property/PropertyOverviewFacts";
import { PropertyFloorPlanPanel } from "@/components/property/PropertyFloorPlanPanel";
import {
  PropertyRoomsAreas,
  type PropertyOverviewRoom,
} from "@/components/property/PropertyRoomsAreas";
import { overviewCardClass } from "@/components/property/overviewChrome";

interface Property {
  id: string;
  name: string;
  address: string;
  blockId: string | null;
  blockName?: string;
  notes?: string | null;
  organizationId: string;
  imageUrl?: string | null;
  propertyType?: string | null;
  bedrooms?: number;
  kitchens?: number;
  bathrooms?: number;
  livingRooms?: number;
  floorPlanUrl?: string | null;
  floorPlanMimeType?: string | null;
  floorPlanFileName?: string | null;
  floorPlanAnalysisStatus?: string | null;
  floorPlanAnalysisJson?: any;
}

interface PropertyStats {
  occupancyStatus: string;
  complianceRate: number;
  totalInspections?: number;
  inProgressInspections?: number;
  dueInspections: number;
  overdueInspections: number;
  maintenanceRequests: number;
  inventoryCount: number;
}

interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  assignment?: { isActive?: boolean | null };
}

interface Inspection {
  id: string;
  templateName: string;
  scheduledDate: string;
  status: string;
  inspectorName?: string;
  type?: string;
}

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  condition: string;
  quantity: number;
  datePurchased?: string | null;
  expectedLifespanYears?: number | null;
  description?: string | null;
  photoUrl?: string | null;
}

/** Same-origin /objects paths so <img> uses session cookies on the portal host. */
const normalizeInventoryPhotoUrl = (url: string | null | undefined): string | null => {
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

  if (trimmed.startsWith("/objects/") || trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("objects/")) return `/${trimmed}`;
  if (trimmed.includes("/objects/")) return trimmed.slice(trimmed.indexOf("/objects/"));
  return `/${trimmed.replace(/^\/+/, "")}`;
};

interface ComplianceDoc {
  id: string;
  documentName: string;
  documentType: string;
  expiryDate: string | null;
  status: string;
  documentUrl?: string;
  createdAt?: string;
  sourceWorkOrderId?: string | null;
}

interface MaintenanceRequest {
  id: string;
  title: string;
  priority: string;
  status: string;
  createdAt: string;
  category: string;
  description?: string;
  reportedByName?: string;
  assignedToName?: string;
}


export default function PropertyDetail() {
  const [, params] = useRoute("/properties/:id");
  const propertyId = params?.id;
  const searchParams = useSearch();
  const urlTab = new URLSearchParams(searchParams).get("tab");
  const backHref = useBackHref("/properties");
  const { rentalsEnabled, tenanciesEnabled, complianceEnabled, maintenanceEnabled, hmoComplianceEnabled, communicationsEnabled } = useCompanyModules();
  const propertyTabs = useMemo(() => {
    const tabs = new Set([
      "overview",
      "inspections",
      "inventory",
      "inspection-schedule",
    ]);
    if (maintenanceEnabled) tabs.add("maintenance");
    if (tenanciesEnabled) tabs.add("tenants");
    if (complianceEnabled) tabs.add("compliance-schedule");
    if (hmoComplianceEnabled) tabs.add("hmo");
    if (communicationsEnabled) tabs.add("activity");
    if (rentalsEnabled) {
      tabs.add("deposit");
      tabs.add("rent-collection");
      tabs.add("expenses");
    }
    return tabs;
  }, [rentalsEnabled, tenanciesEnabled, complianceEnabled, maintenanceEnabled, hmoComplianceEnabled, communicationsEnabled]);
  const resolvedTab = (() => {
    const requested =
      urlTab === "compliance" ? "compliance-schedule" : urlTab;
    if (requested && propertyTabs.has(requested)) return requested;
    return "overview";
  })();
  const [activeTab, setActiveTab] = useState(resolvedTab);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [inventoryDialogOpen, setInventoryDialogOpen] = useState(false);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<AssetInventory | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const locale = useLocale();
  const canSeeReapitSource = user?.role === "owner" || user?.role === "clerk";
  const lengthUnit = defaultLengthUnitForCountry(locale.countryCode);
  const areaUnit = defaultAreaUnitForCountry(locale.countryCode);
  const lengthUnitLabel = lengthUnit === "ft" ? "ft/in" : "m";

  useEffect(() => {
    setActiveTab(resolvedTab);
  }, [resolvedTab]);

  // Mutation to update property image
  const updatePropertyImage = useMutation({
    mutationFn: async (imageUrl: string) => {
      return await apiRequest("PATCH", `/api/properties/${propertyId}`, { imageUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId] });
      toast({
        title: "Success",
        description: "Property image updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update property image",
        variant: "destructive",
      });
    },
  });

  const getPropertyImageUploadParameters = async () => {
    const response = await fetch("/api/objects/upload", {
      method: "POST",
      credentials: "include",
    });
    const { uploadURL } = await response.json();
    return {
      method: "PUT" as const,
      url: uploadURL,
    };
  };

  const handlePropertyImageUploadComplete = (result: {
    successful: Array<{ uploadURL?: string }>;
  }) => {
    if (!result.successful?.length) return;
    let fileUrl = result.successful[0].uploadURL;
    if (!fileUrl) return;
    if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
      try {
        const urlObj = new URL(fileUrl);
        fileUrl = `/objects${urlObj.pathname}`;
      } catch {
        fileUrl = `/objects/${fileUrl}`;
      }
    }
    updatePropertyImage.mutate(fileUrl);
  };

  const { data: property, isLoading: propertyLoading } = useQuery<Property>({
    queryKey: ["/api/properties", propertyId],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch property");
      return res.json();
    },
    enabled: !!propertyId,
  });

  const { data: reapitMapping } = useQuery<{ lastSyncedAt?: string | null } | null>({
    queryKey: ["/api/reapit/mappings/property", propertyId],
    queryFn: async () => {
      const res = await fetch(`/api/reapit/mappings/property/${propertyId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!propertyId && canSeeReapitSource,
  });

  const { data: stats } = useQuery<PropertyStats>({
    queryKey: ["/api/properties", propertyId, "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/stats`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !!propertyId,
  });

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/properties", propertyId, "tenants"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/tenants`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!propertyId && tenanciesEnabled,
  });

  const { data: propertyRooms = [] } = useQuery<
    Array<{
      id: string;
      name: string;
      categoryName: string;
      categorySlug?: string;
      widthMm?: number | null;
      lengthMm?: number | null;
      ceilingHeightMm?: number | null;
    }>
  >({
    queryKey: ["/api/properties", propertyId, "rooms"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/rooms`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!propertyId,
  });

  const overviewRooms = useMemo<PropertyOverviewRoom[]>(() => {
    if (propertyRooms.length > 0) {
      return propertyRooms.map((room) => ({
        id: room.id,
        name: room.name,
        categoryName: room.categoryName,
        categorySlug: room.categorySlug,
        widthMm: room.widthMm,
        lengthMm: room.lengthMm,
        ceilingHeightMm: room.ceilingHeightMm,
        hasDetails: true,
      }));
    }
    if (!property) return [];
    const fromCounts: PropertyOverviewRoom[] = [];
    const pushCount = (label: string, count: number, slug: string) => {
      for (let i = 1; i <= count; i++) {
        fromCounts.push({
          id: `layout-${label}-${i}`,
          name: `${label} ${i}`,
          categoryName: label,
          categorySlug: slug,
          hasDetails: false,
        });
      }
    };
    pushCount("Bedroom", property.bedrooms ?? 1, "bedroom");
    pushCount("Bathroom", property.bathrooms ?? 1, "bathroom");
    pushCount("Kitchen", property.kitchens ?? 1, "kitchen");
    pushCount("Living room", property.livingRooms ?? 1, "living-room");
    return fromCounts;
  }, [propertyRooms, property]);

  const overviewRoomSections = useMemo(() => {
    const sections = new Map<string, PropertyOverviewRoom[]>();
    for (const room of overviewRooms) {
      const key = room.categoryName || "Other";
      const list = sections.get(key) || [];
      list.push(room);
      sections.set(key, list);
    }
    return Array.from(sections.entries());
  }, [overviewRooms]);

  const formatRoomDimensions = (
    room: Pick<PropertyOverviewRoom, "widthMm" | "lengthMm" | "ceilingHeightMm">,
  ) => {
    const formatSide = (mm: number | null | undefined) => {
      if (lengthUnit === "ft") {
        const s = formatMillimetresAsFeetInches(mm);
        return s || null;
      }
      const v = fromMillimetres(mm, lengthUnit);
      return v == null ? null : `${v} ${lengthUnitLabel}`;
    };
    const w = formatSide(room.widthMm);
    const l = formatSide(room.lengthMm);
    // Area-only plans: no fabricated W×L — area is shown as the hero metric
    if (looksLikeAreaOnlyDimensions(room.widthMm, room.lengthMm)) {
      return null;
    }
    if (w == null || l == null) return null;
    const ceiling =
      lengthUnit === "ft"
        ? formatMillimetresAsFeetInches(room.ceilingHeightMm) || null
        : (() => {
            const v = fromMillimetres(room.ceilingHeightMm, lengthUnit);
            return v == null ? null : `${v} ${lengthUnitLabel}`;
          })();
    const parts = [`${w} × ${l}`];
    if (ceiling) parts.push(`Ceiling ${ceiling}`);
    return parts.join(" · ");
  };

  const formatRoomAreaOnly = (
    room: Pick<PropertyOverviewRoom, "widthMm" | "lengthMm">,
  ) => formatFloorArea(room.widthMm, room.lengthMm, areaUnit);

  const totalAreaLabel = useMemo(() => {
    const values = overviewRooms
      .map((r) =>
        areaUnit === "ft2"
          ? floorAreaFt2(r.widthMm, r.lengthMm)
          : floorAreaM2(r.widthMm, r.lengthMm),
      )
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (!values.length) return null;
    const total = Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
    return areaUnit === "ft2" ? `${total} ft²` : `${total} m²`;
  }, [overviewRooms, areaUnit]);

  const { data: inspections = [] } = useQuery<Inspection[]>({
    queryKey: ["/api/properties", propertyId, "inspections"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/inspections`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!propertyId,
  });

  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/properties", propertyId, "inventory"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/inventory`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!propertyId,
  });

  // Fetch full asset inventory to get complete details when an item is clicked
  const { data: fullAssetInventory = [] } = useQuery<AssetInventory[]>({
    queryKey: ["/api/asset-inventory"],
    queryFn: async () => {
      const res = await fetch("/api/asset-inventory", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: compliance = [] } = useQuery<ComplianceDoc[]>({
    queryKey: ["/api/properties", propertyId, "compliance"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/compliance`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!propertyId && complianceEnabled,
  });

  const complianceRateFromDocs = computeDocumentComplianceRate(
    compliance.map((d) => ({ documentType: d.documentType, expiryDate: d.expiryDate })),
  );

  const { data: complianceReport, isLoading: complianceReportLoading } = useQuery({
    queryKey: ["/api/properties", propertyId, "compliance-report"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/compliance-report`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!propertyId && complianceEnabled,
  });

  const { data: maintenance = [] } = useQuery<MaintenanceRequest[]>({
    queryKey: ["/api/properties", propertyId, "maintenance"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/maintenance`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!propertyId && maintenanceEnabled,
  });

  // Card metrics must match the tab lists (not only "due soon" scheduled items).
  const activeTenantCount = useMemo(
    () => tenants.filter((t) => t.assignment?.isActive !== false).length,
    [tenants],
  );
  const hasOccupyingTenant = activeTenantCount > 0;
  const occupancyLabel =
    tenantsLoading
      ? (stats?.occupancyStatus ?? "Vacant")
      : hasOccupyingTenant
        ? "Occupied"
        : "Vacant";

  const inspectionCardCount = inspections.length;
  const inspectionInProgressCount = useMemo(
    () => inspections.filter((i) => i.status === "in_progress").length,
    [inspections],
  );
  const inspectionOverdueCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return inspections.filter(
      (i) =>
        i.status === "scheduled" &&
        i.scheduledDate &&
        new Date(i.scheduledDate) < today,
    ).length;
  }, [inspections]);
  const inspectionCardSubtitle = useMemo(() => {
    if (inspectionOverdueCount > 0) {
      return `${inspectionOverdueCount} overdue`;
    }
    if (inspectionInProgressCount > 0) {
      return `${inspectionInProgressCount} in progress`;
    }
    if (inspectionCardCount === 0) return "No inspections";
    return "Total inspections";
  }, [inspectionCardCount, inspectionInProgressCount, inspectionOverdueCount]);

  const openMaintenanceCount = useMemo(
    () =>
      maintenance.filter(
        (m) => m.status !== "completed" && m.status !== "closed",
      ).length,
    [maintenance],
  );

  if (propertyLoading) {
    return (
      <div className={cn("container mx-auto min-w-0", pagePad)}>
        <div className="text-center py-12">Loading...</div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className={cn("container mx-auto min-w-0", pagePad)}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Property not found</p>
          <Link href={backHref}>
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("container mx-auto min-w-0 space-y-4 md:space-y-6", pagePad)}>
      {/* Header */}
      <div className="flex items-center gap-2 md:gap-4">
        <Link href={backHref}>
          <Button variant="ghost" size="sm" className="text-xs md:text-sm" data-testid="button-back">
            <ArrowLeft className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
            <span className="hidden sm:inline">
              {backHref.startsWith("/blocks/") && property.blockName
                ? `Back to ${property.blockName}`
                : backHref.startsWith("/blocks")
                  ? "Back to Blocks"
                  : "Back to Properties"}
            </span>
            <span className="sm:hidden">Back</span>
          </Button>
        </Link>
      </div>

      {/* Property Header — thumbnail + identity + actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
          <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/40 sm:h-24 sm:w-24 [&>button]:absolute [&>button]:inset-0 [&>button]:h-full [&>button]:w-full">
            {property.imageUrl ? (
              <>
                <PreviewableImage
                  src={property.imageUrl}
                  alt={property.name}
                  title={property.name}
                  className="h-full w-full object-cover"
                  data-testid="img-property"
                />
                {/* pointer-events-none so the image stays clickable for lightbox preview */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" />
                <div className="absolute bottom-1.5 right-1.5 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={10 * 1024 * 1024}
                    buttonVariant="secondary"
                    buttonClassName="pointer-events-auto h-7 w-7 rounded-full p-0 shadow-sm"
                    onGetUploadParameters={getPropertyImageUploadParameters}
                    onComplete={handlePropertyImageUploadComplete}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span className="sr-only">Change photo</span>
                  </ObjectUploader>
                </div>
              </>
            ) : (
              <div
                className="h-full w-full border border-dashed border-border [&>div]:h-full [&>div>button]:h-full [&>div>button]:w-full [&>div>button]:rounded-none"
                data-testid="button-upload-property-image"
              >
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={10 * 1024 * 1024}
                  buttonVariant="ghost"
                  buttonClassName="flex h-full w-full flex-col items-center justify-center gap-0.5 text-muted-foreground hover:bg-muted/60"
                  onGetUploadParameters={getPropertyImageUploadParameters}
                  onComplete={handlePropertyImageUploadComplete}
                >
                  <ImagePlus className="h-5 w-5 opacity-70" />
                  <span className="text-[10px] font-medium">Add</span>
                </ObjectUploader>
              </div>
            )}
          </div>

          <div className={cn("min-w-0 flex-1 space-y-1.5", textBreak)}>
            <div className="flex flex-wrap items-center gap-2">
              <h1
                className="text-xl font-bold tracking-tight text-foreground sm:text-2xl md:text-[1.75rem] md:leading-tight"
                data-testid="heading-property-name"
              >
                {property.name}
              </h1>
              {tenanciesEnabled && (
                <Badge
                  variant={occupancyLabel === "Occupied" ? "success" : "secondary"}
                  className="px-2 py-0.5 text-xs font-semibold"
                  data-testid="badge-occupancy-header"
                >
                  {occupancyLabel}
                </Badge>
              )}
              {property.blockName && (
                <Badge variant="outline" data-testid="badge-block" className="font-medium">
                  {property.blockName}
                </Badge>
              )}
            </div>
            <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" />
              <span className="min-w-0 break-words" data-testid="text-property-address">
                {property.address}
              </span>
            </div>
            {canSeeReapitSource && reapitMapping && (
              <p className="text-xs text-muted-foreground" data-testid="text-reapit-source">
                Source: Reapit
                {reapitMapping.lastSyncedAt
                  ? ` · last synced ${new Date(reapitMapping.lastSyncedAt).toLocaleString()}`
                  : ""}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 sm:pt-1">
          <Link href={`/reports/property-history?propertyId=${property.id}`}>
            <Button variant="outline" className="gap-2" data-testid="button-property-history-report">
              <History className="h-4 w-4" />
              History
            </Button>
          </Link>
          <Button
            className="gap-2"
            onClick={() => setEditDialogOpen(true)}
            data-testid="button-edit-property"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* Stats — left icon chips, theme colors only */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tenanciesEnabled && (
          <Card className={cn(overviewCardClass, "h-full")}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Occupancy</p>
                <p className="truncate text-lg font-bold tracking-tight">{occupancyLabel}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {complianceEnabled && (
          <Card className={cn(overviewCardClass, "h-full")}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Compliance</p>
                <p className="text-lg font-bold tracking-tight">{complianceRateFromDocs}%</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className={cn(overviewCardClass, "h-full")}>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ClipboardCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Inspections</p>
              <p className="text-lg font-bold tracking-tight">{inspectionCardCount}</p>
            </div>
          </CardContent>
        </Card>

        {maintenanceEnabled && (
          <Card className={cn(overviewCardClass, "h-full")}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Wrench className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Maintenance</p>
                <p className="text-lg font-bold tracking-tight">{openMaintenanceCount}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabbed Content */}
      <Tabs
        value={activeTab}
        onValueChange={(next) => {
          setActiveTab(next);
          // Overview is much taller than other tabs; leaving a deep scrollTop
          // makes shorter tabs look empty and the main scrollbar disappear.
          requestAnimationFrame(() => {
            const main = document.querySelector("main");
            if (main instanceof HTMLElement) {
              main.scrollTo({ top: 0, behavior: "auto" });
            } else {
              window.scrollTo({ top: 0, behavior: "auto" });
            }
          });
        }}
        className="space-y-4 min-w-0"
      >
        <TabsList
          id="property-detail-tabs"
          className={cn(
            tabsListScroll,
            "h-auto max-w-full gap-0 rounded-none border-0 border-b border-border bg-transparent p-0",
            "overflow-x-auto overscroll-x-contain",
          )}
        >
          {(
            [
              { value: "overview", testId: "tab-overview", icon: LayoutDashboard, label: "Overview", show: true },
              { value: "inspections", testId: "tab-inspections", icon: ClipboardCheck, label: "Inspections", show: true },
              { value: "tenants", testId: "tab-tenants", icon: Users, label: "Tenants", show: tenanciesEnabled },
              { value: "inventory", testId: "tab-inventory", icon: Package, label: "Inventory", show: true },
              { value: "inspection-schedule", testId: "tab-inspection-schedule", icon: ClipboardCheck, label: "Inspection Schedule", show: true },
              { value: "compliance-schedule", testId: "tab-compliance-schedule", icon: FileCheck, label: "Compliance Documents", show: complianceEnabled },
              { value: "hmo", testId: "tab-hmo", icon: ShieldAlert, label: "HMO", show: hmoComplianceEnabled },
              { value: "maintenance", testId: "tab-maintenance", icon: Wrench, label: "Maintenance", show: maintenanceEnabled },
              { value: "activity", testId: "tab-activity", icon: MessageSquare, label: "Activity", show: communicationsEnabled },
              { value: "deposit", testId: "tab-deposit", icon: Wallet, label: "Deposit", show: rentalsEnabled },
              { value: "rent-collection", testId: "tab-rent-collection", icon: Banknote, label: "Rent Collection", show: rentalsEnabled },
              { value: "expenses", testId: "tab-expenses", icon: Receipt, label: "Expenses", show: rentalsEnabled },
            ] as const
          )
            .filter((t) => t.show)
            .map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                data-testid={t.testId}
                className={cn(
                  tabTriggerResponsive,
                  "rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-2.5 shadow-none ring-0",
                  "data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:ring-0",
                  "data-[state=inactive]:hover:bg-transparent data-[state=inactive]:hover:text-foreground",
                )}
              >
                <t.icon className="h-4 w-4 shrink-0" />
                <span className="tab-label">{t.label}</span>
              </TabsTrigger>
            ))}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6" data-testid="tab-content-overview">
          <div className="grid items-stretch gap-4 lg:grid-cols-5">
            <PropertyOverviewFacts
              className="lg:col-span-3"
              propertyType={property.propertyType}
              address={property.address}
              blockId={property.blockId}
              blockName={property.blockName}
              showOccupancy={tenanciesEnabled}
              occupancyLabel={occupancyLabel}
              totalAreaLabel={totalAreaLabel}
              reapitSourceLabel={
                canSeeReapitSource && reapitMapping
                  ? `Reapit${
                      reapitMapping.lastSyncedAt
                        ? ` · last synced ${new Date(reapitMapping.lastSyncedAt).toLocaleString()}`
                        : ""
                    }`
                  : null
              }
            />
            <Card
              className={cn(
                overviewCardClass,
                "flex h-full min-h-[16rem] flex-col overflow-hidden lg:col-span-2",
              )}
            >
              <MapPreview
                address={property.address}
                title={property.address ? `Map of ${property.address}` : undefined}
                testId="map-embed"
                externalLinkTestId="link-map-external"
                className="min-h-0 flex-1 aspect-auto h-full"
              />
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5">
                <span className="text-sm font-medium text-foreground">Map</span>
              </div>
            </Card>
          </div>

          {(property.floorPlanUrl || property.notes) && (
            <div
              className={cn(
                "grid gap-4",
                property.floorPlanUrl && property.notes
                  ? "lg:grid-cols-2"
                  : "grid-cols-1",
              )}
            >
              {property.floorPlanUrl && (
                <PropertyFloorPlanPanel
                  floorPlanUrl={property.floorPlanUrl}
                  fileName={property.floorPlanFileName}
                  mimeType={property.floorPlanMimeType}
                  analysisStatus={property.floorPlanAnalysisStatus}
                  className={!property.notes ? "w-full" : undefined}
                />
              )}
              {property.notes && (
                <Card className={overviewCardClass}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Notes</CardTitle>
                    <CardDescription>Additional property notes</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {property.notes}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <PropertyRoomsAreas
            sections={overviewRoomSections}
            totalRooms={overviewRooms.length}
            hasDetailedRooms={propertyRooms.length > 0}
            formatDimensions={formatRoomDimensions}
            formatArea={formatRoomAreaOnly}
            areaUnit={areaUnit}
          />
        </TabsContent>

        {/* Inspections Tab */}
        <TabsContent value="inspections" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Inspections</h2>
            <Link href={`/inspections?propertyId=${propertyId}&create=true`}>
              <Button data-testid="button-new-inspection" size="sm" className="text-xs md:text-sm h-8 md:h-10 px-2 md:px-4">
                <ClipboardCheck className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">New Inspection</span>
                <span className="sm:hidden">New</span>
              </Button>
            </Link>
          </div>
          
          {inspections.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ClipboardCheck className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No inspections yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {inspections.map((inspection) => (
                <Link key={inspection.id} href={`/inspections/${inspection.id}`}>
                  <Card className="rounded-lg border-border/80 shadow-sm cursor-pointer" data-testid={`card-inspection-${inspection.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <CardTitle className="text-base">{inspection.templateName}</CardTitle>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>{new Date(inspection.scheduledDate).toLocaleDateString()}</span>
                            </div>
                            {inspection.inspectorName && (
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                <span>{inspection.inspectorName}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <StatusBadge
                          tone={inspectionStatusTone(inspection.status)}
                          appearance="solid"
                          className="capitalize"
                        >
                          {formatInspectionStatus(inspection.status)}
                        </StatusBadge>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tenants Tab */}
        <TabsContent value="tenants" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Tenants</h2>
            <AddTenantDialog
              propertyId={propertyId!}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "tenants"] });
                queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "stats"] });
                queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "rent-periods"] });
              }}
            >
              <Button data-testid="button-assign-tenant" size="sm" className="text-xs md:text-sm h-8 md:h-10 px-2 md:px-4">
                <Plus className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Assign Tenant</span>
                <span className="sm:hidden">Assign</span>
              </Button>
            </AddTenantDialog>
          </div>

          {tenants.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <User className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No tenants assigned</p>
                <AddTenantDialog
                  propertyId={propertyId!}
                  onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "tenants"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "stats"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "rent-periods"] });
                  }}
                >
                  <Button data-testid="button-assign-first-tenant" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Assign Tenant
                  </Button>
                </AddTenantDialog>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tenants.map((tenant) => (
                <Link key={tenant.id} href={`/tenants/${tenant.id}`}>
                  <Card 
                    data-testid={`card-tenant-${tenant.id}`} 
                    className="rounded-lg border-border/80 shadow-sm cursor-pointer"
                  >
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base mb-1">
                            {tenant.firstName} {tenant.lastName}
                          </CardTitle>
                          <CardDescription className="text-sm break-all">
                            {tenant.email}
                          </CardDescription>
                          <Badge variant="outline" className="mt-2 text-xs">
                            Tenant
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Asset Inventory</h2>
            <Link href={`/asset-inventory?propertyId=${propertyId}`}>
              <Button data-testid="button-new-inventory" size="sm" className="text-xs md:text-sm h-8 md:h-10 px-2 md:px-4">
                <Package className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Add Item</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </Link>
          </div>
          
          {inventory.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No inventory items</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {inventory.map((item) => {
                const thumbUrl = normalizeInventoryPhotoUrl(item.photoUrl);
                return (
                <Card 
                  key={item.id} 
                  data-testid={`card-inventory-${item.id}`}
                  className="rounded-lg border-border/80 shadow-sm cursor-pointer"
                  onClick={() => {
                    const fullAsset = fullAssetInventory.find(asset => asset.id === item.id);
                    if (fullAsset) {
                      setSelectedInventoryItem(fullAsset);
                      setInventoryDialogOpen(true);
                    }
                  }}
                >
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                        {thumbUrl ? (
                          <PreviewableImage
                            src={thumbUrl}
                            alt={item.name}
                            title={item.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            fallback={
                              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                <Package className="h-6 w-6" />
                              </div>
                            }
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <Package className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 flex-1 min-w-0">
                        <CardTitle className="text-base">{item.name}</CardTitle>
                        <CardDescription className="line-clamp-1">{item.description || item.category}</CardDescription>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {item.datePurchased && (
                            <span>Purchased: {new Date(item.datePurchased).toLocaleDateString()}</span>
                          )}
                          {item.expectedLifespanYears && (
                            <span>Lifespan: {item.expectedLifespanYears} years</span>
                          )}
                        </div>
                      </div>
                      <Badge variant={
                        item.condition === 'excellent' ? 'default' :
                        item.condition === 'good' ? 'secondary' :
                        item.condition === 'fair' ? 'outline' :
                        'destructive'
                      }>
                        {item.condition}
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Inspection Schedule Tab */}
        <TabsContent value="inspection-schedule" className="space-y-6">
          {/* Annual Inspection Compliance Report */}
          <ComplianceCalendar 
            entityType="property"
            entityId={propertyId}
          />
        </TabsContent>

        {hmoComplianceEnabled && (
        <TabsContent value="hmo" className="space-y-6" data-testid="tab-content-hmo">
          {propertyId && <HmoPropertyPanel propertyId={propertyId} />}
        </TabsContent>
        )}

        {/* Compliance Schedule Tab */}
        <TabsContent value="compliance-schedule" className="space-y-6">
          {/* Annual Compliance Document Calendar */}
          <ComplianceDocumentCalendar 
            entityType="property"
            entityId={propertyId}
          />

          {/* Compliance Documents Section */}
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Compliance Documents</h2>
            <Link href={`/compliance?propertyId=${propertyId}&create=true`}>
              <Button data-testid="button-new-compliance" size="sm" className="text-xs md:text-sm h-8 md:h-10 px-2 md:px-4">
                <Upload className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Upload Document</span>
                <span className="sm:hidden">Upload</span>
              </Button>
            </Link>
          </div>
          
          {compliance.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileCheck className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No compliance documents</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {compliance.map((doc) => {
                const expiryDate = doc.expiryDate ? new Date(doc.expiryDate) : null;
                const now = new Date();
                const daysUntilExpiry = expiryDate ? Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
                
                return (
                  <Card key={doc.id} data-testid={`card-compliance-${doc.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <CardTitle className="text-base">{doc.documentName}</CardTitle>
                          <CardDescription>{doc.documentType}</CardDescription>
                          {doc.sourceWorkOrderId && (
                            <p
                              className="text-xs text-muted-foreground"
                              data-testid={`text-source-work-order-${doc.id}`}
                            >
                              Source: Work Order
                            </p>
                          )}
                          {expiryDate && (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2 text-sm">
                                {doc.status === 'expired' ? (
                                  <>
                                    <AlertCircle className="h-3 w-3 text-destructive" />
                                    <span className="text-destructive font-medium">
                                      Expired {new Date(expiryDate).toLocaleDateString()}
                                    </span>
                                  </>
                                ) : doc.status === 'expiring' ? (
                                  <>
                                    <AlertCircle className="h-3 w-3 text-orange-500" />
                                    <span className="text-orange-500 font-medium">
                                      Expires in {daysUntilExpiry} days ({new Date(expiryDate).toLocaleDateString()})
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="h-3 w-3 text-[color:var(--brand-success)]" />
                                    <span className="text-muted-foreground">
                                      Expires: {new Date(expiryDate).toLocaleDateString()}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <StatusBadge
                          tone={complianceDocTone(doc.status)}
                          appearance="solid"
                        >
                          {doc.status === 'expired' ? 'Expired' : doc.status === 'expiring' ? 'Expiring Soon' : 'Valid'}
                        </StatusBadge>
                      </div>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {communicationsEnabled && propertyId ? (
          <TabsContent value="activity" className="space-y-4">
            <h2 className="text-xl font-semibold">Communications activity</h2>
            <CommunicationsActivityTimeline scope="properties" entityId={propertyId} />
          </TabsContent>
        ) : null}

        {/* Maintenance Tab */}
        {maintenanceEnabled && (
        <TabsContent value="maintenance" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Maintenance Requests</h2>
            <Link href={`/maintenance?propertyId=${propertyId}&create=true`}>
              <Button data-testid="button-new-maintenance" size="sm" className="text-xs md:text-sm h-8 md:h-10 px-2 md:px-4">
                <Wrench className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">New Request</span>
                <span className="sm:hidden">New</span>
              </Button>
            </Link>
          </div>
          
          {maintenance.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Wrench className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No maintenance requests</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {maintenance.map((request) => (
                <Link key={request.id} href={`/maintenance/${request.id}`}>
                  <Card className="rounded-lg border-border/80 shadow-sm cursor-pointer" data-testid={`card-maintenance-${request.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <CardTitle className="text-base">{request.title}</CardTitle>
                          {request.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{request.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>{new Date(request.createdAt).toLocaleDateString()}</span>
                            </div>
                            {request.reportedByName && (
                              <span>Reported by: {request.reportedByName}</span>
                            )}
                            {request.assignedToName && (
                              <span>Assigned to: {request.assignedToName}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <StatusBadge
                            tone={priorityTone(request.priority)}
                            appearance="solid"
                            className="capitalize"
                          >
                            {request.priority}
                          </StatusBadge>
                          <StatusBadge
                            tone={maintenanceRequestStatusTone(request.status)}
                            appearance="solid"
                            className="capitalize"
                          >
                            {formatMaintenanceStatus(request.status)}
                          </StatusBadge>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {propertyId ? (
            <div className="space-y-3 pt-4 border-t">
              <h2 className="text-xl font-semibold">Quotes &amp; invoices</h2>
              <p className="text-sm text-muted-foreground">
                Historical quotations and invoices for this property (independent of work order status).
              </p>
              <SiteMaintenanceFinancePanel scope="property" scopeId={propertyId} />
            </div>
          ) : null}
        </TabsContent>
        )}

        <TabsContent value="deposit" className="space-y-4">
          <PropertyDepositPanel propertyId={propertyId!} />
        </TabsContent>

        <TabsContent value="rent-collection" className="space-y-4">
          <PropertyRentCollectionPanel propertyId={propertyId!} />
        </TabsContent>

        <TabsContent value="expenses" className="space-y-4">
          <PropertyExpensesPanel propertyId={propertyId!} />
        </TabsContent>
      </Tabs>
      <PropertyFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        property={property}
      />

      {/* Inventory Item Details Dialog */}
      <Dialog open={inventoryDialogOpen} onOpenChange={setInventoryDialogOpen}>
        <DialogContent className={cn(dialogContentBase, "max-w-3xl")}>
          <DialogHeader>
            <DialogTitle>{selectedInventoryItem?.name || "Inventory Item Details"}</DialogTitle>
            <DialogDescription>
              {selectedInventoryItem?.category && (
                <span className="text-sm text-muted-foreground">{selectedInventoryItem.category}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedInventoryItem && (
            <div className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Basic Information</h3>
                <div className={formGrid2}>
                  <div>
                    <Label className="text-muted-foreground">Name</Label>
                    <p className="font-medium">{selectedInventoryItem.name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Category</Label>
                    <p className="font-medium">{selectedInventoryItem.category || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Condition</Label>
                    <Badge variant={
                      selectedInventoryItem.condition === 'excellent' ? 'default' :
                      selectedInventoryItem.condition === 'good' ? 'secondary' :
                      selectedInventoryItem.condition === 'fair' ? 'outline' :
                      'destructive'
                    }>
                      {selectedInventoryItem.condition}
                    </Badge>
                  </div>
                  {selectedInventoryItem.cleanliness && (
                    <div>
                      <Label className="text-muted-foreground">Cleanliness</Label>
                      <p className="font-medium capitalize">{selectedInventoryItem.cleanliness}</p>
                    </div>
                  )}
                  {selectedInventoryItem.location && (
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">Location</Label>
                      <p className="font-medium">{selectedInventoryItem.location}</p>
                    </div>
                  )}
                  {selectedInventoryItem.description && (
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">Description</Label>
                      <p className="font-medium">{selectedInventoryItem.description}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Purchase Information */}
              {(selectedInventoryItem.datePurchased || selectedInventoryItem.purchasePrice || selectedInventoryItem.supplier) && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Purchase Information</h3>
                  <div className={formGrid2}>
                    {selectedInventoryItem.datePurchased && (
                      <div>
                        <Label className="text-muted-foreground">Date Purchased</Label>
                        <p className="font-medium">{new Date(selectedInventoryItem.datePurchased).toLocaleDateString()}</p>
                      </div>
                    )}
                    {selectedInventoryItem.purchasePrice && (
                      <div>
                        <Label className="text-muted-foreground">Purchase Price</Label>
                        <p className="font-medium">£{Number(selectedInventoryItem.purchasePrice).toLocaleString()}</p>
                      </div>
                    )}
                    {selectedInventoryItem.supplier && (
                      <div>
                        <Label className="text-muted-foreground">Supplier</Label>
                        <p className="font-medium">{selectedInventoryItem.supplier}</p>
                      </div>
                    )}
                    {selectedInventoryItem.supplierContact && (
                      <div>
                        <Label className="text-muted-foreground">Supplier Contact</Label>
                        <p className="font-medium">{selectedInventoryItem.supplierContact}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Asset Details */}
              {(selectedInventoryItem.serialNumber || selectedInventoryItem.modelNumber || selectedInventoryItem.expectedLifespanYears) && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Asset Details</h3>
                  <div className={formGrid2}>
                    {selectedInventoryItem.serialNumber && (
                      <div>
                        <Label className="text-muted-foreground">Serial Number</Label>
                        <p className="font-medium">{selectedInventoryItem.serialNumber}</p>
                      </div>
                    )}
                    {selectedInventoryItem.modelNumber && (
                      <div>
                        <Label className="text-muted-foreground">Model Number</Label>
                        <p className="font-medium">{selectedInventoryItem.modelNumber}</p>
                      </div>
                    )}
                    {selectedInventoryItem.expectedLifespanYears && (
                      <div>
                        <Label className="text-muted-foreground">Expected Lifespan</Label>
                        <p className="font-medium">{selectedInventoryItem.expectedLifespanYears} years</p>
                      </div>
                    )}
                    {selectedInventoryItem.currentValue && (
                      <div>
                        <Label className="text-muted-foreground">Current Value</Label>
                        <p className="font-medium">£{Number(selectedInventoryItem.currentValue).toLocaleString()}</p>
                      </div>
                    )}
                    {selectedInventoryItem.warrantyExpiryDate && (
                      <div>
                        <Label className="text-muted-foreground">Warranty Expiry</Label>
                        <p className="font-medium">{new Date(selectedInventoryItem.warrantyExpiryDate).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Maintenance Information */}
              {(selectedInventoryItem.lastMaintenanceDate || selectedInventoryItem.nextMaintenanceDate || selectedInventoryItem.maintenanceNotes) && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Maintenance</h3>
                  <div className={formGrid2}>
                    {selectedInventoryItem.lastMaintenanceDate && (
                      <div>
                        <Label className="text-muted-foreground">Last Maintenance</Label>
                        <p className="font-medium">{new Date(selectedInventoryItem.lastMaintenanceDate).toLocaleDateString()}</p>
                      </div>
                    )}
                    {selectedInventoryItem.nextMaintenanceDate && (
                      <div>
                        <Label className="text-muted-foreground">Next Maintenance</Label>
                        <p className="font-medium">{new Date(selectedInventoryItem.nextMaintenanceDate).toLocaleDateString()}</p>
                      </div>
                    )}
                    {selectedInventoryItem.maintenanceNotes && (
                      <div className="col-span-2">
                        <Label className="text-muted-foreground">Maintenance Notes</Label>
                        <p className="font-medium whitespace-pre-wrap">{selectedInventoryItem.maintenanceNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Photos */}
              {selectedInventoryItem.photos && selectedInventoryItem.photos.length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Photos</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                    {(selectedInventoryItem.photos || []).map((photo, index) => {
                      const photos = selectedInventoryItem.photos || [];
                      const src = normalizeInventoryPhotoUrl(photo);
                      if (!src) return null;
                      return (
                        <PreviewableImage
                          key={index}
                          src={src}
                          alt={`${selectedInventoryItem.name} - Photo ${index + 1}`}
                          title={selectedInventoryItem.name}
                          caption={`Photo ${index + 1}`}
                          gallery={photos
                            .map((item) => normalizeInventoryPhotoUrl(item))
                            .filter((item): item is string => Boolean(item))
                            .map((item, photoIndex) => ({
                              src: item,
                              alt: `${selectedInventoryItem.name} - Photo ${photoIndex + 1}`,
                              title: selectedInventoryItem.name,
                              caption: `Photo ${photoIndex + 1}`,
                            }))}
                          index={photos
                            .slice(0, index)
                            .filter((item) => Boolean(normalizeInventoryPhotoUrl(item))).length}
                          className="w-full h-32 object-cover rounded-md border"
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setInventoryDialogOpen(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setInventoryDialogOpen(false);
                    window.location.href = `/asset-inventory?propertyId=${propertyId}`;
                  }}
                >
                  Edit in Inventory
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
