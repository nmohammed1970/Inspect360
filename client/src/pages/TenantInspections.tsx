import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, Calendar, MapPin, ArrowRight } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { pagePad, cardGrid } from "@/lib/responsive";
import {
  formatInspectionStatus,
  formatInspectionType,
  inspectionStatusBadgeVariant,
} from "@shared/inspectionLabels";

export default function TenantInspections() {
  const locale = useLocale();

  const { data: inspections = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/inspections/my"],
    staleTime: 0,
  });

  const active = inspections.filter(
    (i) => i.status === "scheduled" || i.status === "in_progress",
  );
  const completed = inspections.filter((i) => i.status === "completed");

  return (
    <div className={cn(pagePad, "space-y-4 md:space-y-6 min-w-0")}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>My Inspections</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold" data-testid="text-tenant-inspections-title">
          My Inspections
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Inspections assigned to you to complete
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : active.length === 0 && completed.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium" data-testid="text-tenant-inspections-empty">
              No inspections assigned
            </p>
            <p className="text-sm text-muted-foreground">
              When your property manager assigns an inspection to you, it will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {active.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold tracking-tight">To complete</h2>
              <div className={cardGrid}>
                {active.map((inspection) => (
                  <InspectionCard
                    key={inspection.id}
                    inspection={inspection}
                    locale={locale}
                    primary
                  />
                ))}
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold tracking-tight">Completed</h2>
              <div className={cardGrid}>
                {completed.map((inspection) => (
                  <InspectionCard
                    key={inspection.id}
                    inspection={inspection}
                    locale={locale}
                    primary={false}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function InspectionCard({
  inspection,
  locale,
  primary,
}: {
  inspection: any;
  locale: ReturnType<typeof useLocale>;
  primary: boolean;
}) {
  const locationName =
    inspection.property?.name || inspection.block?.name || "Property";
  const address =
    inspection.property?.address || inspection.block?.address || "";
  const typeLabel =
    inspection.templateName || formatInspectionType(inspection.type);

  return (
    <Card className="flex flex-col" data-testid={`card-tenant-inspection-${inspection.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base md:text-lg leading-snug">{locationName}</CardTitle>
          <Badge variant={inspectionStatusBadgeVariant(inspection.status)}>
            {formatInspectionStatus(inspection.status)}
          </Badge>
        </div>
        <CardDescription className="flex items-center gap-1">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{address || "No address"}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto space-y-3">
        <div className="space-y-1 text-sm">
          <p className="font-medium text-foreground">{typeLabel}</p>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>
              {inspection.scheduledDate
                ? locale.formatDate(new Date(inspection.scheduledDate))
                : "Not scheduled"}
            </span>
          </div>
        </div>
        {primary ? (
          <Button asChild className="w-full" data-testid={`button-start-inspection-${inspection.id}`}>
            <Link href={`/tenant/inspections/${inspection.id}/capture`}>
              {inspection.status === "in_progress" ? "Continue inspection" : "Start inspection"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button
            asChild
            variant="outline"
            className="w-full"
            data-testid={`button-view-inspection-${inspection.id}`}
          >
            <Link href={`/tenant/inspections/${inspection.id}/capture`}>View inspection</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
