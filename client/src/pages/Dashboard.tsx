import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, ClipboardCheck, FileText, CreditCard, AlertCircle } from "lucide-react";
import { Link } from "wouter";

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

  const { data: properties = [] } = useQuery({
    queryKey: ["/api/properties"],
    enabled: isAuthenticated,
  });

  const { data: inspections = [] } = useQuery({
    queryKey: ["/api/inspections/my"],
    enabled: isAuthenticated,
  });

  const { data: compliance = [] } = useQuery({
    queryKey: ["/api/compliance/expiring", { days: 90 }],
    enabled: isAuthenticated && (user?.role === "owner" || user?.role === "compliance"),
  });

  const { data: maintenance = [] } = useQuery({
    queryKey: ["/api/maintenance"],
    enabled: isAuthenticated && (user?.role === "owner" || user?.role === "clerk"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const creditsRemaining = user?.organization?.creditsRemaining || 0;
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Properties</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-properties-count">{properties.length}</div>
            <p className="text-xs text-muted-foreground">Total managed properties</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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

        {(user?.role === "owner" || user?.role === "compliance") && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-expiring-count">{compliance.length}</div>
              <p className="text-xs text-muted-foreground">Compliance documents</p>
            </CardContent>
          </Card>
        )}

        {user?.role === "owner" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
      </div>

      {user?.role === "clerk" && (
        <Card>
          <CardHeader>
            <CardTitle>My Inspections Today</CardTitle>
          </CardHeader>
          <CardContent>
            {inspections.length === 0 ? (
              <p className="text-muted-foreground">No inspections scheduled today.</p>
            ) : (
              <div className="space-y-4">
                {inspections.slice(0, 5).map((inspection: any) => (
                  <div
                    key={inspection.id}
                    className="flex items-center justify-between p-4 border rounded-md hover-elevate"
                  >
                    <div>
                      <p className="font-medium">Unit {inspection.unitId}</p>
                      <p className="text-sm text-muted-foreground">{inspection.type}</p>
                    </div>
                    <Badge
                      variant={
                        inspection.status === "completed"
                          ? "default"
                          : inspection.status === "in_progress"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {inspection.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(user?.role === "owner" || user?.role === "clerk") && maintenance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Maintenance Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {maintenance.slice(0, 5).map((request: any) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-4 border rounded-md"
                >
                  <div>
                    <p className="font-medium">{request.title}</p>
                    <p className="text-sm text-muted-foreground">
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
                  >
                    {request.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
