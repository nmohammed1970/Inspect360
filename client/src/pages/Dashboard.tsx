import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, ClipboardCheck, FileText, CreditCard, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import type { Property, Inspection, ComplianceDocument, MaintenanceRequest, Block } from "@shared/schema";

// Extended inspection type with nested property and block
type InspectionWithDetails = Inspection & {
  property?: Property;
  block?: Block;
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

  const { data: blocks = [] } = useQuery<Block[]>({
    queryKey: ["/api/blocks"],
    enabled: isAuthenticated,
  });

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
    <div className="p-6 md:p-8 lg:p-12 space-y-8 md:space-y-12">
      {/* Header Section */}
      <div className="space-y-2">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground" data-testid="text-dashboard-title">
          Dashboard
        </h1>
        <p className="text-lg text-muted-foreground">
          Welcome back, <span className="font-medium text-foreground">{user?.firstName || user?.email}</span>
        </p>
      </div>

      {/* Credits Low Alert - Glassmorphic */}
      {creditsLow && user?.role === "owner" && (
        <Card className="glass-card-strong border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-6 md:p-8">
            <div className="flex items-center gap-4 flex-1">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-lg">Inspection credits low</p>
                <p className="text-sm text-muted-foreground mt-1">
                  You have {creditsRemaining} credits remaining. Purchase more to avoid blocking submissions.
                </p>
              </div>
            </div>
            <Link href="/credits">
              <Button variant="destructive" size="lg" className="w-full sm:w-auto transition-smooth" data-testid="button-purchase-credits">
                Purchase Credits
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards Grid */}
      <div className="grid gap-6 md:gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {/* Properties Card */}
        <Card className="glass-card card-hover-lift">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Properties</CardTitle>
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl md:text-4xl font-bold tracking-tight" data-testid="text-properties-count">{properties.length}</div>
            <p className="text-sm text-muted-foreground mt-2">Total managed buildings</p>
          </CardContent>
        </Card>

        {/* Blocks Card */}
        <Card className="glass-card card-hover-lift">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Blocks</CardTitle>
            <div className="w-10 h-10 rounded-xl bg-chart-3/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-chart-3" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl md:text-4xl font-bold tracking-tight" data-testid="text-blocks-count">{blocks.length}</div>
            <p className="text-sm text-muted-foreground mt-2">Total blocks</p>
          </CardContent>
        </Card>

        {/* Inspections Card */}
        <Card className="glass-card card-hover-lift">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inspections</CardTitle>
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <ClipboardCheck className="h-5 w-5 text-accent" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl md:text-4xl font-bold tracking-tight" data-testid="text-inspections-count">{inspections.length}</div>
            <p className="text-sm text-muted-foreground mt-2">
              {user?.role === "clerk" ? "Assigned to you" : "Total inspections"}
            </p>
          </CardContent>
        </Card>

        {/* Credits Card (Owner Only) */}
        {user?.role === "owner" && (
          <Card className={`glass-card card-hover-lift ${creditsLow ? 'border-destructive/30 bg-destructive/5' : ''}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Credits</CardTitle>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${creditsLow ? 'bg-destructive/10' : 'bg-accent/10'}`}>
                <CreditCard className={`h-5 w-5 ${creditsLow ? 'text-destructive' : 'text-accent'}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl md:text-4xl font-bold tracking-tight" data-testid="text-credits-remaining">
                {creditsRemaining}
              </div>
              <p className="text-sm text-muted-foreground mt-2">AI inspection credits</p>
            </CardContent>
          </Card>
        )}

        {/* Expiring Soon Card (Compliance Only) */}
        {user?.role === "compliance" && (
          <Card className="glass-card card-hover-lift">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Expiring Soon</CardTitle>
              <div className="w-10 h-10 rounded-xl bg-chart-1/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-chart-1" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl md:text-4xl font-bold tracking-tight" data-testid="text-expiring-count">{compliance.length}</div>
              <p className="text-xs text-muted-foreground">Compliance documents</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Clerk Inspections List */}
      {user?.role === "clerk" && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">My Inspections</CardTitle>
          </CardHeader>
          <CardContent>
            {inspections.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No inspections assigned to you.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {inspections.slice(0, 5).map((inspection) => (
                  <Link key={inspection.id} href={`/inspections/${inspection.id}`}>
                    <div
                      className="flex items-center justify-between gap-4 p-5 border border-border/50 rounded-2xl hover-elevate cursor-pointer transition-smooth bg-card/50"
                      data-testid={`card-inspection-${inspection.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-lg truncate">{inspection.type} Inspection</p>
                        <p className="text-sm text-muted-foreground truncate mt-1">
                          {inspection.property?.name || inspection.block?.name}
                        </p>
                        {inspection.scheduledDate && (
                          <p className="text-xs text-muted-foreground truncate mt-1">
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
                        className="whitespace-nowrap"
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

      {/* Owner Recent Inspections */}
      {user?.role === "owner" && inspections.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Recent Inspections</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {inspections.slice(0, 5).map((inspection) => (
                <Link key={inspection.id} href={`/inspections/${inspection.id}`}>
                  <div
                    className="flex items-center justify-between gap-4 p-5 border border-border/50 rounded-2xl hover-elevate cursor-pointer transition-smooth bg-card/50"
                    data-testid={`card-inspection-${inspection.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-lg truncate">{inspection.type} Inspection</p>
                      <p className="text-sm text-muted-foreground truncate mt-1">
                        {inspection.property?.name || inspection.block?.name}
                      </p>
                      {inspection.scheduledDate && (
                        <p className="text-xs text-muted-foreground truncate mt-1">
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
                      className="whitespace-nowrap"
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

      {/* Maintenance Requests */}
      {(user?.role === "owner" || user?.role === "clerk") && maintenance.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Recent Maintenance Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {maintenance.slice(0, 5).map((request) => (
                <Link key={request.id} href="/maintenance">
                  <div
                    className="flex items-center justify-between gap-4 p-5 border border-border/50 rounded-2xl hover-elevate cursor-pointer transition-smooth bg-card/50"
                    data-testid={`card-maintenance-${request.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-lg truncate">{request.title}</p>
                      <p className="text-sm text-muted-foreground truncate mt-1">
                        Priority: <span className="font-medium">{request.priority}</span>
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
                      className="whitespace-nowrap"
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
