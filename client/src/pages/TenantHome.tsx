import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Home, Calendar, MapPin, FileText } from "lucide-react";
import { Link } from "wouter";
import { useLocale } from "@/contexts/LocaleContext";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { ActionRequiredBanner } from "@/components/ActionRequiredBanner";

export default function TenantHome() {
  const locale = useLocale();

  const { data: tenancyData, isLoading } = useQuery<any>({
    queryKey: ["/api/tenant/tenancy"],
  });

  // Fetch comparison reports to check for action required
  const { data: comparisonReports = [] } = useQuery<any[]>({
    queryKey: ["/api/tenant/comparison-reports"],
  });

  // Fetch pending inspection reviews (check-in / check-out) with auto-refresh
  const { data: pendingCheckIns = [] } = useQuery<any[]>({
    queryKey: ["/api/tenant/check-ins"],
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  // Check for reports that need signature (reports that are under review or awaiting signatures)
  const reportsNeedingSignature = comparisonReports.filter((report) => {
    // Show banner for reports that need tenant signature:
    // - Status is "under_review" or "awaiting_signatures"
    // - Tenant hasn't signed yet
    return (
      (report.status === "under_review" || report.status === "awaiting_signatures") &&
      !report.tenantSignature
    );
  });

  const pendingInspectionReviews = pendingCheckIns.filter(
    (inspection) => inspection.tenantApprovalStatus === "pending",
  );

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <Skeleton className="h-8 md:h-12 w-48 md:w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
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
      <div className="p-4 md:p-6">
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
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Home</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold" data-testid="text-welcome">
          Welcome Home
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Manage your property and maintenance requests
        </p>
      </div>

      {/* Action Required Banners - Inspection reviews and comparison reports */}
      {(reportsNeedingSignature.length > 0 || pendingInspectionReviews.length > 0) && (
        <div className="space-y-3">
          {pendingInspectionReviews.map((inspection) => {
            const typeLabel =
              inspection.type === "check_out" ? "check-out" : "check-in";
            return (
              <Link key={inspection.id} href={`/tenant/inspection-review/${inspection.id}`}>
                <div className="w-full rounded-lg border border-orange-500 bg-[#FFF8E7] p-4 cursor-pointer hover:bg-[#FFF5D6] transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <FileText className="h-5 w-5 text-orange-600" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-orange-600 text-base leading-tight">Action Required</h3>
                      </div>
                      <p className="text-sm text-orange-600 leading-relaxed">
                        A {typeLabel} inspection requires your review and signature. Please review the details and sign.
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
          
          {/* Comparison Reports Needing Signature */}
          {reportsNeedingSignature.map((report) => (
            <ActionRequiredBanner
              key={report.id}
              reportId={report.id}
              message="Please review this report and provide your signature at the bottom of the page."
            />
          ))}
        </div>
      )}

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
            {tenancy.notes && (() => {
              // Try to parse JSON notes, or use as plain text
              let displayNotes = tenancy.notes;
              let parsedNotes: any = null;
              
              try {
                // Check if it's a JSON string
                if (typeof tenancy.notes === 'string' && tenancy.notes.trim().startsWith('{')) {
                  parsedNotes = JSON.parse(tenancy.notes);
                  // Filter out sensitive fields like passwords
                  const sensitiveFields = ['_originalPassword', 'password', 'originalPassword', 'hashedPassword'];
                  const filteredNotes: any = {};
                  Object.keys(parsedNotes).forEach(key => {
                    if (!sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
                      filteredNotes[key] = parsedNotes[key];
                    }
                  });
                  
                  // If there are remaining fields, format them nicely
                  const remainingKeys = Object.keys(filteredNotes);
                  if (remainingKeys.length > 0) {
                    displayNotes = remainingKeys.map(key => {
                      const value = filteredNotes[key];
                      // Format the key nicely (e.g., "originalPassword" -> "Original Password")
                      const formattedKey = key
                        .replace(/_/g, ' ')
                        .replace(/([A-Z])/g, ' $1')
                        .trim()
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ');
                      return `${formattedKey}: ${value}`;
                    }).join('\n');
                  } else {
                    // All fields were sensitive, don't show anything
                    return null;
                  }
                }
              } catch (e) {
                // Not JSON, use as-is
                displayNotes = tenancy.notes;
              }
              
              return (
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground mb-2">Notes</div>
                  <div className="text-sm whitespace-pre-wrap">{displayNotes}</div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
