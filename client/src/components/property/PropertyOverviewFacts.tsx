import type { ReactNode } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { overviewCardClass } from "@/components/property/overviewChrome";

type PropertyOverviewFactsProps = {
  propertyType?: string | null;
  address: string;
  blockId?: string | null;
  blockName?: string | null;
  occupancyLabel?: string | null;
  showOccupancy?: boolean;
  totalAreaLabel?: string | null;
  reapitSourceLabel?: string | null;
  className?: string;
};

function FactCell({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-sm font-semibold text-foreground break-words">{children}</div>
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
  totalAreaLabel,
  reapitSourceLabel,
  className,
}: PropertyOverviewFactsProps) {
  const typeLabel = propertyType ? propertyType.replace(/-/g, " ") : "—";

  return (
    <Card
      className={cn(overviewCardClass, "flex h-full flex-col", className)}
      data-testid="card-property-details"
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Property details</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="grid flex-1 content-start gap-5 sm:grid-cols-2">
          <FactCell label="Type">
            <span className="capitalize">{typeLabel}</span>
          </FactCell>

          {showOccupancy && occupancyLabel ? (
            <FactCell label="Occupancy">
              <Badge
                variant={occupancyLabel === "Occupied" ? "success" : "secondary"}
                className="font-medium"
              >
                {occupancyLabel}
              </Badge>
            </FactCell>
          ) : (
            <FactCell label="Total area">{totalAreaLabel || "—"}</FactCell>
          )}

          <FactCell label="Address" className="sm:col-span-2">
            {address}
          </FactCell>

          {showOccupancy && (
            <FactCell label="Total area">{totalAreaLabel || "—"}</FactCell>
          )}

          <FactCell label="Block">
            {blockName && blockId ? (
              <Link href={`/blocks/${blockId}`}>
                <span className="text-primary hover:underline">{blockName}</span>
              </Link>
            ) : (
              <span className="font-medium text-muted-foreground">Not assigned</span>
            )}
          </FactCell>

          {reapitSourceLabel && (
            <FactCell label="Source" className="sm:col-span-2">
              <span className="font-medium text-muted-foreground">{reapitSourceLabel}</span>
            </FactCell>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
