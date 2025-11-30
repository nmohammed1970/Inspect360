import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Home, FileText, MessageSquare, Calendar, MapPin, FileCheck, LogOut } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useLocale } from "@/contexts/LocaleContext";
import { useAuth } from "@/hooks/useAuth";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

export default function TenantHome() {
  const [, navigate] = useLocation();
  const locale = useLocale();
  const { logoutMutation } = useAuth();

  const { data: tenancyData, isLoading } = useQuery<any>({
    queryKey: ["/api/tenant/tenancy"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!tenancyData) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>No Tenancy Found</CardTitle>
            <CardDescription>
              You don't have an active tenancy assigned. Please contact your property manager.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { tenancy, property, block } = tenancyData;

  return (
    <div className="p-6 space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Home</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-welcome">
            Welcome Home
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your property and maintenance requests
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4 mr-2" />
          {logoutMutation.isPending ? "Logging out..." : "Logout"}
        </Button>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/tenant/maintenance")}>
          <CardHeader className="flex flex-row items-center gap-4 space-y-0">
            <div className="p-3 bg-primary/10 rounded-lg">
              <MessageSquare className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">AI Maintenance Help</CardTitle>
              <CardDescription>Get instant assistance with issues</CardDescription>
            </div>
          </CardHeader>
        </Card>

        <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/tenant/requests")}>
          <CardHeader className="flex flex-row items-center gap-4 space-y-0">
            <div className="p-3 bg-primary/10 rounded-lg">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">My Requests</CardTitle>
              <CardDescription>View your maintenance requests</CardDescription>
            </div>
          </CardHeader>
        </Card>

        <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/tenant/comparison-reports")} data-testid="card-comparison-reports">
          <CardHeader className="flex flex-row items-center gap-4 space-y-0">
            <div className="p-3 bg-primary/10 rounded-lg">
              <FileCheck className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Comparison Reports</CardTitle>
              <CardDescription>Review and sign move-out reports</CardDescription>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Property Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Property Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Home className="h-5 w-5 text-primary" />
              </div>
              <CardTitle>Your Property</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground">Property Name</div>
              <div className="font-semibold text-lg" data-testid="text-property-name">
                {property?.name}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Address
              </div>
              <div className="font-medium" data-testid="text-property-address">
                {property?.address}
              </div>
            </div>
            {property?.sqft && (
              <div>
                <div className="text-sm text-muted-foreground">Square Footage</div>
                <div className="font-medium">{property.sqft.toLocaleString()} sq ft</div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Block Card (if property belongs to a block) */}
        {block && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <CardTitle>Building Complex</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">Block Name</div>
                <div className="font-semibold text-lg" data-testid="text-block-name">
                  {block.name}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Address
                </div>
                <div className="font-medium" data-testid="text-block-address">
                  {block.address}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tenancy Details */}
        <Card className={block ? "md:col-span-2" : ""}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <CardTitle>Tenancy Details</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <div className="text-sm text-muted-foreground">Lease Start</div>
                <div className="font-semibold" data-testid="text-lease-start">
                  {tenancy.leaseStartDate 
                    ? locale.formatDate(tenancy.leaseStartDate)
                    : "Not specified"}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Lease End</div>
                <div className="font-semibold" data-testid="text-lease-end">
                  {tenancy.leaseEndDate 
                    ? locale.formatDate(tenancy.leaseEndDate)
                    : "Not specified"}
                </div>
              </div>
              {tenancy.monthlyRent && (
                <div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="h-4 w-4 flex items-center justify-center font-semibold">£</span>
                    Monthly Rent
                  </div>
                  <div className="font-semibold" data-testid="text-monthly-rent">
                    {locale.currencySymbol}{parseFloat(tenancy.monthlyRent).toLocaleString()}
                  </div>
                </div>
              )}
              {tenancy.depositAmount && (
                <div>
                  <div className="text-sm text-muted-foreground">Deposit</div>
                  <div className="font-semibold">
                    {locale.currencySymbol}{parseFloat(tenancy.depositAmount).toLocaleString()}
                  </div>
                </div>
              )}
              <div>
                <div className="text-sm text-muted-foreground">Status</div>
                <Badge variant={tenancy.isActive ? "default" : "secondary"} data-testid="badge-tenancy-status">
                  {tenancy.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
            {tenancy.notes && (
              <div className="mt-6 p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground mb-2">Notes</div>
                <div className="text-sm">{tenancy.notes}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
