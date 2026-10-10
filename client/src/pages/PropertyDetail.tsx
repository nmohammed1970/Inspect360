import { PreviewableImage } from "@/components/ImagePreview";
import {
  PropertyDepositPanel,
  PropertyExpensesPanel,
  PropertyRentCollectionPanel,
} from "@/components/PropertyFinancePanels";
import { useState, useEffect, useMemo } from "react";
import { useRoute, Link, useSearch } from "wouter";
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
  Building2,
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
  ImageIcon,
  Mail,
  Phone,
  Plus,
  Wallet,
  Banknote,
  Receipt,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { PropertyFormDialog } from "@/components/PropertyFormDialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyModules } from "@/hooks/useCompanyModules";
import { MapPreview } from "@/components/MapPreview";
import AddTenantDialog from "@/components/AddTenantDialog";
import { cn } from "@/lib/utils";
import { pagePad, dialogContentBase, formGrid2, textBreak, tabsListScroll } from "@/lib/responsive";

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
  const { rentalsEnabled, tenanciesEnabled, complianceEnabled, maintenanceEnabled } = useCompanyModules();
  const propertyTabs = useMemo(() => {
    const tabs = new Set([
      "inspections",
      "inventory",
      "inspection-schedule",
    ]);
    if (maintenanceEnabled) tabs.add("maintenance");
    if (tenanciesEnabled) tabs.add("tenants");
    if (complianceEnabled) tabs.add("compliance-schedule");
    if (rentalsEnabled) {
      tabs.add("deposit");
      tabs.add("rent-collection");
      tabs.add("expenses");
    }
    return tabs;
  }, [rentalsEnabled, tenanciesEnabled, complianceEnabled, maintenanceEnabled]);
  const resolvedTab = (() => {
    const requested =
      urlTab === "compliance" ? "compliance-schedule" : urlTab;
    if (requested && propertyTabs.has(requested)) return requested;
    return "inspections";
  })();
  const [activeTab, setActiveTab] = useState(resolvedTab);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [inventoryDialogOpen, setInventoryDialogOpen] = useState(false);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<AssetInventory | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const canSeeReapitSource = user?.role === "owner" || user?.role === "clerk";

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

  const hasOccupyingTenant = tenants.some((t) => t.assignment?.isActive !== false);
  const occupancyLabel =
    tenantsLoading || tenants.length === 0
      ? (stats?.occupancyStatus ?? "Vacant")
      : hasOccupyingTenant
        ? "Occupied"
        : "Vacant";

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
          <Link href="/properties">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Properties
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
        <Link href={property.blockId ? `/blocks/${property.blockId}` : "/properties"}>
          <Button variant="ghost" size="sm" className="text-xs md:text-sm" data-testid="button-back">
            <ArrowLeft className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
            <span className="hidden sm:inline">{property.blockId && property.blockName ? `Back to ${property.blockName}` : "Back to Properties"}</span>
            <span className="sm:hidden">Back</span>
          </Button>
        </Link>
      </div>

      {/* Property Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className={cn("space-y-2 flex-1", textBreak)}>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold flex items-center gap-2 md:gap-3" data-testid="heading-property-name">
              <Building2 className="h-5 w-5 md:h-6 md:w-6 lg:h-8 lg:w-8 text-primary shrink-0" />
              <span className="truncate">{property.name}</span>
            </h1>
            <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
              <MapPin className="h-3 w-3 md:h-4 md:w-4 shrink-0" />
              <span className="truncate" data-testid="text-property-address">{property.address}</span>
            </div>
            {property.blockName && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" data-testid="badge-block">
                  Block: {property.blockName}
                </Badge>
              </div>
            )}
            {canSeeReapitSource && reapitMapping && (
              <p className="text-xs text-muted-foreground" data-testid="text-reapit-source">
                Source: Reapit
                {reapitMapping.lastSyncedAt
                  ? ` · last synced ${new Date(reapitMapping.lastSyncedAt).toLocaleString()}`
                  : ""}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/reports/property-history?propertyId=${property.id}`}>
              <Button variant="outline" data-testid="button-property-history-report">
                <History className="h-4 w-4 mr-2" />
                Property History Report
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(true)}
              data-testid="button-edit-property"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit Property
            </Button>
          </div>
        </div>

        {/* Property Image and Map Section */}
        <div className={formGrid2}>
          {/* Property Image with Upload — opens media picker directly */}
          <Card className="overflow-hidden">
            {property.imageUrl ? (
              <div className="relative aspect-video">
                <PreviewableImage
                  src={property.imageUrl}
                  alt={property.name}
                  title={property.name}
                  className="w-full h-full object-cover"
                  data-testid="img-property"
                />
                <div className="absolute bottom-2 right-2 z-10">
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={10 * 1024 * 1024}
                    buttonVariant="secondary"
                    buttonClassName="h-9 px-3"
                    onGetUploadParameters={getPropertyImageUploadParameters}
                    onComplete={handlePropertyImageUploadComplete}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Change Photo
                  </ObjectUploader>
                </div>
              </div>
            ) : (
              <div
                className="aspect-video bg-muted [&>div]:h-full [&>div>button]:h-full [&>div>button]:w-full [&>div>button]:rounded-none"
                data-testid="button-upload-property-image"
              >
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={10 * 1024 * 1024}
                  buttonVariant="ghost"
                  buttonClassName="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted/80"
                  onGetUploadParameters={getPropertyImageUploadParameters}
                  onComplete={handlePropertyImageUploadComplete}
                >
                  <Upload className="h-16 w-16 opacity-50" />
                  <span className="text-sm font-medium">Upload Property Photo</span>
                  <span className="text-xs font-normal">Click to add an image</span>
                </ObjectUploader>
              </div>
            )}
          </Card>

          {/* Embedded Google Map */}
          <Card className="overflow-hidden">
            <MapPreview
              address={property?.address}
              title={property?.address ? `Map of ${property.address}` : undefined}
              testId="map-embed"
              externalLinkTestId="link-map-external"
            />
          </Card>
        </div>

        {property.notes && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{property.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {tenanciesEnabled && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Occupancy</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{occupancyLabel}</div>
              </CardContent>
            </Card>
          )}

          {complianceEnabled && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Compliance</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{complianceRateFromDocs}%</div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Inspections</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.dueInspections + stats.overdueInspections}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.overdueInspections > 0 && `${stats.overdueInspections} overdue`}
              </p>
            </CardContent>
          </Card>

          {maintenanceEnabled && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Maintenance</CardTitle>
                <Wrench className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.maintenanceRequests}</div>
                <p className="text-xs text-muted-foreground">Open requests</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 min-w-0">
        <TabsList className={tabsListScroll}>
          <TabsTrigger value="inspections" data-testid="tab-inspections" className="shrink-0 gap-1.5">
            <ClipboardCheck className="h-4 w-4 shrink-0" />
            <span>Inspections</span>
          </TabsTrigger>
          {tenanciesEnabled && (
            <TabsTrigger value="tenants" data-testid="tab-tenants" className="shrink-0 gap-1.5">
              <Users className="h-4 w-4 shrink-0" />
              <span>Tenants</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="inventory" data-testid="tab-inventory" className="shrink-0 gap-1.5">
            <Package className="h-4 w-4 shrink-0" />
            <span>Inventory</span>
          </TabsTrigger>
          <TabsTrigger value="inspection-schedule" data-testid="tab-inspection-schedule" className="shrink-0 gap-1.5">
            <ClipboardCheck className="h-4 w-4 shrink-0" />
            <span>Inspection Schedule</span>
          </TabsTrigger>
          {complianceEnabled && (
            <TabsTrigger value="compliance-schedule" data-testid="tab-compliance-schedule" className="shrink-0 gap-1.5">
              <FileCheck className="h-4 w-4 shrink-0" />
              <span>Compliance Documents</span>
            </TabsTrigger>
          )}
          {maintenanceEnabled && (
          <TabsTrigger value="maintenance" data-testid="tab-maintenance" className="shrink-0 gap-1.5">
            <Wrench className="h-4 w-4 shrink-0" />
            <span>Maintenance</span>
          </TabsTrigger>
          )}
          {rentalsEnabled && (
            <>
              <TabsTrigger value="deposit" data-testid="tab-deposit" className="shrink-0 gap-1.5">
                <Wallet className="h-4 w-4 shrink-0" />
                <span>Deposit</span>
              </TabsTrigger>
              <TabsTrigger value="rent-collection" data-testid="tab-rent-collection" className="shrink-0 gap-1.5">
                <Banknote className="h-4 w-4 shrink-0" />
                <span>Rent Collection</span>
              </TabsTrigger>
              <TabsTrigger value="expenses" data-testid="tab-expenses" className="shrink-0 gap-1.5">
                <Receipt className="h-4 w-4 shrink-0" />
                <span>Expenses</span>
              </TabsTrigger>
            </>
          )}
        </TabsList>

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
                  <Card className="hover-elevate cursor-pointer" data-testid={`card-inspection-${inspection.id}`}>
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
                        <Badge 
                          variant={
                            inspection.status === 'completed' ? 'default' :
                            inspection.status === 'in_progress' ? 'secondary' :
                            'outline'
                          }
                          className={inspection.status === 'completed' ? 'bg-primary text-primary-foreground' : ''}
                        >
                          {inspection.status.replace('_', ' ')}
                        </Badge>
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
                    className="hover-elevate cursor-pointer"
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
                  className="hover-elevate cursor-pointer"
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
                                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                                    <span className="text-muted-foreground">
                                      Expires: {new Date(expiryDate).toLocaleDateString()}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <Badge variant={
                          doc.status === 'expired' ? 'destructive' :
                          doc.status === 'expiring' ? 'outline' :
                          'default'
                        }>
                          {doc.status === 'expired' ? 'Expired' : doc.status === 'expiring' ? 'Expiring Soon' : 'Valid'}
                        </Badge>
                      </div>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

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
                  <Card className="hover-elevate cursor-pointer" data-testid={`card-maintenance-${request.id}`}>
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
                          <Badge variant={
                            request.priority === 'urgent' ? 'destructive' :
                            request.priority === 'high' ? 'default' :
                            'secondary'
                          }>
                            {request.priority}
                          </Badge>
                          <Badge variant="outline">{request.status.replace('_', ' ')}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
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
