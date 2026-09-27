import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Building2, Calendar, AlertCircle, ChevronRight, Pen } from "lucide-react";
import { format } from "date-fns";
import { useLocale } from "@/contexts/LocaleContext";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { pagePad, textBreak, textTruncate } from "@/lib/responsive";

interface ComparisonReport {
  id: string;
  propertyId: string;
  checkInInspectionId?: string;
  checkOutInspectionId?: string;
  status: string;
  totalEstimatedCost: string;
  tenantSignature: string | null;
  operatorSignature: string | null;
  createdAt: string;
  property: {
    id: string;
    name: string;
    address: string;
  } | null;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "secondary" },
  under_review: { label: "Under Review", variant: "default" },
  awaiting_signatures: { label: "Signature Required", variant: "destructive" },
  signed: { label: "Signed", variant: "outline" },
  filed: { label: "Filed", variant: "secondary" },
};

export default function TenantComparisonReports() {
  const [, navigate] = useLocation();
  const locale = useLocale();

  const { data: reports = [], isLoading } = useQuery<ComparisonReport[]>({
    queryKey: ["/api/tenant/comparison-reports"],
  });

  if (isLoading) {
    return (
      <div className={cn(pagePad, "space-y-4 md:space-y-6 min-w-0")}>
        <Skeleton className="h-12 w-64" />
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(pagePad, "space-y-4 md:space-y-6 min-w-0")} data-testid="page-tenant-comparison-reports">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/tenant/home">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Comparison Reports</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-col gap-2 min-w-0">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold flex items-center gap-2 md:gap-3" data-testid="text-page-title">
            <FileText className="h-6 w-6 md:h-8 md:w-8 text-primary shrink-0" />
            <span className={textTruncate}>Comparison Reports</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Review and sign end-of-tenancy comparison reports
          </p>
        </div>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Comparison Reports</h3>
            <p className="text-muted-foreground text-center max-w-md">
              You don't have any comparison reports yet. These will appear here when your tenancy ends and a move-out inspection is completed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const status = statusConfig[report.status] || statusConfig.draft;
            const needsSignature = report.status === "awaiting_signatures" && !report.tenantSignature;
            const totalCost = parseFloat(report.totalEstimatedCost || "0");

            return (
              <Card 
                key={report.id} 
                className="hover-elevate cursor-pointer"
                onClick={() => navigate(`/tenant/comparison-reports/${report.id}`)}
                data-testid={`card-report-${report.id}`}
              >
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-start justify-between gap-3 md:gap-4 min-w-0">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 md:gap-3">
                        <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                        <span className={cn("font-semibold text-base md:text-lg", textBreak)} data-testid={`text-property-${report.id}`}>
                          {report.property?.name || "Property"}
                        </span>
                        <Badge variant={status.variant}>
                          {status.label}
                        </Badge>
                        {needsSignature && (
                          <Badge variant="destructive" className="gap-1">
                            <Pen className="h-3 w-3" />
                            Signature Required
                          </Badge>
                        )}
                      </div>
                      
                      {report.property?.address && (
                        <p className={cn("text-sm text-muted-foreground", textBreak)}>
                          {report.property.address}
                        </p>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 shrink-0" />
                          {format(new Date(report.createdAt), "MMMM d, yyyy")}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-4 w-4 flex items-center justify-center font-semibold shrink-0">£</span>
                          <span className={textBreak}>
                            Total Liability: <span className="font-semibold text-foreground">{locale.formatCurrency(totalCost, false)}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <Button variant="ghost" size="icon" data-testid={`button-view-${report.id}`}>
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
