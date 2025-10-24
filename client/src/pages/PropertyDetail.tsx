import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";

interface Property {
  id: string;
  name: string;
  address: string;
  blockId: string | null;
  blockName?: string;
  notes?: string | null;
  organizationId: string;
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
}

interface Inspection {
  id: string;
  templateName: string;
  scheduledDate: string;
  status: string;
  inspectorName?: string;
}

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  condition: string;
  quantity: number;
}

interface ComplianceDoc {
  id: string;
  documentName: string;
  documentType: string;
  expiryDate: string | null;
  status: string;
}

interface MaintenanceRequest {
  id: string;
  title: string;
  priority: string;
  status: string;
  createdAt: string;
  category: string;
}

export default function PropertyDetail() {
  const [, params] = useRoute("/properties/:id");
  const propertyId = params?.id;

  const { data: property, isLoading: propertyLoading } = useQuery<Property>({
    queryKey: ["/api/properties", propertyId],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch property");
      return res.json();
    },
    enabled: !!propertyId,
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

  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/properties", propertyId, "tenants"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/tenants`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!propertyId,
  });

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

  const { data: compliance = [] } = useQuery<ComplianceDoc[]>({
    queryKey: ["/api/properties", propertyId, "compliance"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/compliance`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!propertyId,
  });

  const { data: maintenance = [] } = useQuery<MaintenanceRequest[]>({
    queryKey: ["/api/properties", propertyId, "maintenance"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/maintenance`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!propertyId,
  });

  if (propertyLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">Loading...</div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="container mx-auto p-6">
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
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={property.blockId ? `/blocks/${property.blockId}` : "/properties"}>
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {property.blockId && property.blockName ? `Back to ${property.blockName}` : "Back to Properties"}
          </Button>
        </Link>
      </div>

      {/* Property Header */}
      <div>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="heading-property-name">
              <Building2 className="h-8 w-8 text-primary" />
              {property.name}
            </h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span data-testid="text-property-address">{property.address}</span>
            </div>
            {property.blockName && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" data-testid="badge-block">
                  Block: {property.blockName}
                </Badge>
              </div>
            )}
          </div>
        </div>
        {property.notes && (
          <Card className="mt-4">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{property.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Occupancy</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.occupancyStatus}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Compliance</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.complianceRate}%</div>
            </CardContent>
          </Card>

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
        </div>
      )}

      {/* Tabbed Content */}
      <Tabs defaultValue="inspections" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inspections" data-testid="tab-inspections">
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Inspections
          </TabsTrigger>
          <TabsTrigger value="tenants" data-testid="tab-tenants">
            <Users className="h-4 w-4 mr-2" />
            Tenants
          </TabsTrigger>
          <TabsTrigger value="inventory" data-testid="tab-inventory">
            <Package className="h-4 w-4 mr-2" />
            Inventory
          </TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance">
            <FileCheck className="h-4 w-4 mr-2" />
            Compliance
          </TabsTrigger>
          <TabsTrigger value="maintenance" data-testid="tab-maintenance">
            <Wrench className="h-4 w-4 mr-2" />
            Maintenance
          </TabsTrigger>
        </TabsList>

        {/* Inspections Tab */}
        <TabsContent value="inspections" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Inspections</h2>
            <Link href={`/inspections/new?propertyId=${propertyId}`}>
              <Button data-testid="button-new-inspection">
                <ClipboardCheck className="mr-2 h-4 w-4" />
                New Inspection
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
            <div className="space-y-3">
              {inspections.map((inspection) => (
                <Link key={inspection.id} href={`/inspections/${inspection.id}`}>
                  <Card className="hover-elevate cursor-pointer" data-testid={`card-inspection-${inspection.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-base">{inspection.templateName}</CardTitle>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {new Date(inspection.scheduledDate).toLocaleDateString()}
                          </div>
                        </div>
                        <Badge variant={
                          inspection.status === 'completed' ? 'default' :
                          inspection.status === 'in_progress' ? 'secondary' :
                          'outline'
                        }>
                          {inspection.status}
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
          <h2 className="text-xl font-semibold">Tenants</h2>
          
          {tenants.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <User className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No tenants assigned</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tenants.map((tenant) => (
                <Card key={tenant.id} data-testid={`card-tenant-${tenant.id}`}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5 text-primary" />
                      {tenant.firstName} {tenant.lastName}
                    </CardTitle>
                    <CardDescription>{tenant.email}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Asset Inventory</h2>
            <Link href={`/asset-inventory/new?propertyId=${propertyId}`}>
              <Button data-testid="button-new-inventory">
                <Package className="mr-2 h-4 w-4" />
                Add Item
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
              {inventory.map((item) => (
                <Link key={item.id} href={`/asset-inventory/${item.id}`}>
                  <Card className="hover-elevate cursor-pointer" data-testid={`card-inventory-${item.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{item.name}</CardTitle>
                          <CardDescription>{item.category}</CardDescription>
                        </div>
                        <Badge variant="outline">{item.condition}</Badge>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Compliance Documents</h2>
            <Link href={`/compliance/new?propertyId=${propertyId}`}>
              <Button data-testid="button-new-compliance">
                <FileCheck className="mr-2 h-4 w-4" />
                Add Document
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
              {compliance.map((doc) => (
                <Link key={doc.id} href={`/compliance/${doc.id}`}>
                  <Card className="hover-elevate cursor-pointer" data-testid={`card-compliance-${doc.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-base">{doc.documentName}</CardTitle>
                          <CardDescription>{doc.documentType}</CardDescription>
                          {doc.expiryDate && (
                            <div className="flex items-center gap-2 text-sm">
                              {new Date(doc.expiryDate) < new Date() ? (
                                <AlertCircle className="h-3 w-3 text-destructive" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                              )}
                              <span className={new Date(doc.expiryDate) < new Date() ? "text-destructive" : ""}>
                                Expires: {new Date(doc.expiryDate).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                        </div>
                        <Badge variant={doc.status === 'valid' ? 'default' : 'destructive'}>
                          {doc.status}
                        </Badge>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Maintenance Tab */}
        <TabsContent value="maintenance" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Maintenance Requests</h2>
            <Link href={`/maintenance/new?propertyId=${propertyId}`}>
              <Button data-testid="button-new-maintenance">
                <Wrench className="mr-2 h-4 w-4" />
                New Request
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
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-base">{request.title}</CardTitle>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{request.category}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(request.createdAt).toLocaleDateString()}
                            </span>
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
                          <Badge variant="outline">{request.status}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
