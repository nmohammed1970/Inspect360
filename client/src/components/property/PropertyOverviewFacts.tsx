import type { ReactNode } from "react";
import { Link } from "wouter";
import { Building2, Home, MapPin, Users, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { overviewCardClass } from "@/components/property/overviewChrome";

type PropertyOverviewFactsProps = {
  propertyType?: string | null;
  address: string;
  blockId?: string | null;
  blockName?: string | null;
  occupancyLabel?: string | null;
  showOccupancy?: boolean;
  reapitSourceLabel?: string | null;
  className?: string;
};

function FactRow({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 gap-3", className)}>
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="text-sm font-medium text-foreground break-words">{children}</div>
      </div>
    </div>
  );
}

export function PropertyOverviewFacts({
  propertyType,
  address,
  blockId,
  blockName,
  occupancyLabel,
  showOccupancy = false,
  reapitSourceLabel,
  className,
}: PropertyOverviewFactsProps) {
  const typeLabel = propertyType
    ? propertyType.replace(/-/g, " ")
    : "—";

  return (
    <Card className={cn(overviewCardClass, className)} data-testid="card-property-details">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-primary" />
          Property details
        </CardTitle>
        <CardDescription>Core information for this property</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <FactRow icon={Home} label="Type">
            <span className="capitalize">{typeLabel}</span>
          </FactRow>

          {showOccupancy && occupancyLabel && (
            <FactRow icon={Users} label="Occupancy">
              <Badge
                variant={occupancyLabel === "Occupied" ? "success" : "secondary"}
                className="font-medium"
              >
                {occupancyLabel}
              </Badge>
            </FactRow>
          )}

          <FactRow icon={MapPin} label="Address" className="sm:col-span-2">
            {address}
          </FactRow>

          <FactRow icon={Building2} label="Block">
            {blockName && blockId ? (
              <Link href={`/blocks/${blockId}`}>
                <Badge
                  variant="outline"
                  className="cursor-pointer border-primary/20 bg-primary/5 text-foreground hover:bg-primary/10"
                >
                  {blockName}
                </Badge>
              </Link>
            ) : (
              <span className="text-muted-foreground">Not assigned</span>
            )}
          </FactRow>

          {reapitSourceLabel && (
            <FactRow icon={Building2} label="Source" className="sm:col-span-2">
              <span className="font-normal text-muted-foreground">{reapitSourceLabel}</span>
            </FactRow>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
