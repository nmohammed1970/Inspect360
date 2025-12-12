import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ComplianceCalendar from "@/components/ComplianceCalendar";
import ComplianceDocumentCalendar from "@/components/ComplianceDocumentCalendar";
import { ArrowLeft, Building2, MapPin, Users, CheckCircle2, Calendar, AlertTriangle, FileCheck, ClipboardCheck } from "lucide-react";

interface PropertyStats {
  totalUnits: number;
  occupiedUnits: number;
  occupancyStatus: string;
  complianceRate: number;
  complianceStatus: string;
  inspectionsDue: number;
  inspectionsOverdue: number;
}

interface Property {
  id: string;
  name: string;
  address: string;
  blockId: string | null;
  stats: PropertyStats;
}

interface Block {
  id: string;
  name: string;
  address: string;
  notes?: string | null;
}

export default function BlockDetail() {
  const [, params] = useRoute("/blocks/:id");
  const blockId = params?.id;

  const { data: block, isLoading: blockLoading } = useQuery<Block>({
    queryKey: ["/api/blocks", blockId],
    queryFn: async () => {
      const res = await fetch(`/api/blocks/${blockId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch block");
      return res.json();
    },
    enabled: !!blockId,
  });

  const { data: properties = [], isLoading: propertiesLoading } = useQuery<Property[]>({
    queryKey: ["/api/blocks", blockId, "properties"],
    queryFn: async () => {
      const res = await fetch(`/api/blocks/${blockId}/properties`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
    enabled: !!blockId,
  });

  const { data: complianceReport, isLoading: complianceReportLoading } = useQuery({
    queryKey: ["/api/blocks", blockId, "compliance-report"],
    queryFn: async () => {
      const res = await fetch(`/api/blocks/${blockId}/compliance-report`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!blockId,
  });

  if (blockLoading || propertiesLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">Loading...</div>
      </div>
    );
  }

  if (!block) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Block not found</p>
          <Link href="/blocks">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Blocks
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <Link href="/blocks">
          <Button variant="ghost" className="mb-4" data-testid="button-back-to-blocks">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Blocks
          </Button>
        </Link>
        
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Building2 className="h-8 w-8 text-primary" />
              {block.name}
            </h1>
            <p className="text-muted-foreground mt-2 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {block.address}
            </p>
            {block.notes && (
              <p className="text-sm text-muted-foreground mt-3 bg-muted p-3 rounded-md">
                {block.notes}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="properties" className="space-y-6">
        <TabsList>
          <TabsTrigger value="properties" data-testid="tab-properties">
            <Building2 className="h-4 w-4 mr-2" />
            Properties ({properties.length})
          </TabsTrigger>
          <TabsTrigger value="inspection-schedule" data-testid="tab-inspection-schedule">
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Inspection Schedule
          </TabsTrigger>
          <TabsTrigger value="compliance-schedule" data-testid="tab-compliance-schedule">
            <FileCheck className="h-4 w-4 mr-2" />
            Compliance Documents
          </TabsTrigger>
        </TabsList>

        {/* Properties Tab */}
        <TabsContent value="properties" className="space-y-4">
          {properties.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No properties yet</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Properties assigned to this block will appear here
                </p>
                <Link href="/properties">
                  <Button>View All Properties</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {properties.map((property) => (
                <Link key={property.id} href={`/properties/${property.id}`}>
                  <Card className="hover-elevate cursor-pointer" data-testid={`card-property-${property.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-primary" />
                            {property.name}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">{property.address}</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* Occupancy */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            Occupancy
                          </div>
                          <p className="text-sm font-semibold">{property.stats?.occupancyStatus || 'No data'}</p>
                        </div>

                        {/* Compliance */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                            Compliance
                          </div>
                          <Badge 
                            variant={(property.stats?.complianceRate || 0) >= 80 ? "default" : "destructive"}
                            className="text-xs"
                          >
                            {property.stats?.complianceStatus || 'No data'}
                          </Badge>
                        </div>

                        {/* Due Soon */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            Due Soon
                          </div>
                          <Badge 
                            variant={(property.stats?.inspectionsDue || 0) > 0 ? "secondary" : "outline"}
                            className="text-xs"
                          >
                            {property.stats?.inspectionsDue || 0} inspection{(property.stats?.inspectionsDue || 0) !== 1 ? 's' : ''}
                          </Badge>
                        </div>

                        {/* Overdue */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                            Overdue
                          </div>
                          <Badge 
                            variant={(property.stats?.inspectionsOverdue || 0) > 0 ? "destructive" : "outline"}
                            className="text-xs"
                          >
                            {property.stats?.inspectionsOverdue || 0} inspection{(property.stats?.inspectionsOverdue || 0) !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Inspection Schedule Tab */}
        <TabsContent value="inspection-schedule" className="space-y-6">
          <ComplianceCalendar 
            report={complianceReport} 
            isLoading={complianceReportLoading}
            entityType="block"
          />
        </TabsContent>

        {/* Compliance Schedule Tab */}
        <TabsContent value="compliance-schedule" className="space-y-6">
          <ComplianceDocumentCalendar 
            documents={[]}
            isLoading={false}
            entityType="block"
          />
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileCheck className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Compliance documents are managed at the property level</p>
              <p className="text-sm text-muted-foreground mt-2">View individual properties to manage their compliance documents</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
