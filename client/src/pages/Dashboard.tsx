import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, ClipboardCheck, FileText, CreditCard, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import type { Property, Inspection, ComplianceDocument, MaintenanceRequest, Unit } from "@shared/schema";

// Extended inspection type with nested unit and property
type InspectionWithDetails = Inspection & {
  unit?: Unit & { propertyId: string };
  property?: Property;
  clerk?: { firstName: string | null; lastName: string | null };
};

export default function Dashboard() {
  const { toast } = useToast();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    enabled: isAuthenticated,
  });

  const { data: inspections = [] } = useQuery<InspectionWithDetails[]>({
    queryKey: ["/api/inspections/my"],
    enabled: isAuthenticated,
  });

  // Fetch all units for all properties to calculate total
  const { data: allUnits = [] } = useQuery<any[]>({
    queryKey: ["/api/units"],
    enabled: isAuthenticated && properties.length > 0,
  });

  const totalUnits = allUnits.length;

  const { data: compliance = [] } = useQuery<ComplianceDocument[]>({
    queryKey: ["/api/compliance/expiring", { days: 90 }],
    enabled: isAuthenticated && (user?.role === "owner" || user?.role === "compliance"),
  });

  const { data: maintenance = [] } = useQuery<MaintenanceRequest[]>({
    queryKey: ["/api/maintenance"],
    enabled: isAuthenticated && (user?.role === "owner" || user?.role === "clerk"),
  });

  // Fetch organization data for credits
  const { data: organization } = useQuery<{creditsRemaining: number | null}>({
    queryKey: ["/api/organizations", user?.organizationId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${user?.organizationId}`);
      if (!res.ok) throw new Error("Failed to fetch organization");
      return res.json();
    },
    enabled: isAuthenticated && !!user?.organizationId && user?.role === "owner",
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const creditsRemaining = organization?.creditsRemaining ?? 0;
  const creditsLow = creditsRemaining < 5;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground" data-testid="text-dashboard-title">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Welcome back, {user?.firstName || user?.email}
        </p>
      </div>

      {creditsLow && user?.role === "owner" && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <div className="flex-1">
              <p className="font-semibold">Inspection credits low</p>
              <p className="text-sm text-muted-foreground">
                You have {creditsRemaining} credits remaining. Purchase more to avoid blocking submissions.
              </p>
            </div>
            <Link href="/credits">
              <Button variant="destructive" data-testid="button-purchase-credits">
                Purchase Credits
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Properties</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-properties-count">{properties.length}</div>
            <p className="text-xs text-muted-foreground">Total managed buildings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Units</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-units-count">{totalUnits}</div>
            <p className="text-xs text-muted-foreground">Total apartments/units</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inspections</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-inspections-count">{inspections.length}</div>
            <p className="text-xs text-muted-foreground">
              {user?.role === "clerk" ? "Assigned to you" : "Total inspections"}
            </p>
          </CardContent>
        </Card>

        {user?.role === "owner" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Credits</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-credits-remaining">
                {creditsRemaining}
              </div>
              <p className="text-xs text-muted-foreground">AI inspection credits</p>
            </CardContent>
          </Card>
        )}

        {user?.role === "compliance" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-expiring-count">{compliance.length}</div>
              <p className="text-xs text-muted-foreground">Compliance documents</p>
            </CardContent>
          </Card>
        )}
      </div>

      {user?.role === "clerk" && (
        <Card>
          <CardHeader>
            <CardTitle>My Inspections</CardTitle>
          </CardHeader>
          <CardContent>
            {inspections.length === 0 ? (
              <p className="text-muted-foreground">No inspections assigned to you.</p>
            ) : (
              <div className="space-y-3">
                {inspections.slice(0, 5).map((inspection) => (
                  <Link key={inspection.id} href={`/inspections/${inspection.id}`}>
                    <div
                      className="flex items-center justify-between gap-2 p-4 border rounded-md hover-elevate cursor-pointer"
                      data-testid={`card-inspection-${inspection.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{inspection.type} Inspection</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {inspection.property?.name} - Unit {inspection.unit?.unitNumber}
                        </p>
                        {inspection.scheduledDate && (
                          <p className="text-xs text-muted-foreground truncate">
                            {new Date(inspection.scheduledDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={
                          inspection.status === "completed"
                            ? "default"
                            : inspection.status === "in_progress"
                            ? "secondary"
                            : "outline"
                        }
                        data-testid={`badge-status-${inspection.id}`}
                      >
                        {inspection.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {user?.role === "owner" && inspections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Inspections</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {inspections.slice(0, 5).map((inspection) => (
                <Link key={inspection.id} href={`/inspections/${inspection.id}`}>
                  <div
                    className="flex items-center justify-between gap-2 p-4 border rounded-md hover-elevate cursor-pointer"
                    data-testid={`card-inspection-${inspection.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{inspection.type} Inspection</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {inspection.property?.name} - Unit {inspection.unit?.unitNumber}
                      </p>
                      {inspection.scheduledDate && (
                        <p className="text-xs text-muted-foreground truncate">
                          {new Date(inspection.scheduledDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={
                        inspection.status === "completed"
                          ? "default"
                          : inspection.status === "in_progress"
                          ? "secondary"
                          : "outline"
                      }
                      data-testid={`badge-status-${inspection.id}`}
                    >
                      {inspection.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(user?.role === "owner" || user?.role === "clerk") && maintenance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Maintenance Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {maintenance.slice(0, 5).map((request) => (
                <Link key={request.id} href="/maintenance">
                  <div
                    className="flex items-center justify-between gap-2 p-4 border rounded-md hover-elevate cursor-pointer"
                    data-testid={`card-maintenance-${request.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{request.title}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        Priority: {request.priority}
                      </p>
                    </div>
                    <Badge
                      variant={
                        request.status === "completed"
                          ? "default"
                          : request.status === "in_progress"
                          ? "secondary"
                          : "outline"
                      }
                      data-testid={`badge-status-${request.id}`}
                    >
                      {request.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
