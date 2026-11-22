import { Bath, BedDouble, CookingPot, Sofa, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { overviewCardClass, overviewMetricTileClass } from "@/components/property/overviewChrome";

type PropertyLayoutSummaryProps = {
  bedrooms?: number | null;
  bathrooms?: number | null;
  kitchens?: number | null;
  livingRooms?: number | null;
  detailedRoomCount?: number;
  className?: string;
};

const METRICS: Array<{
  key: string;
  label: string;
  icon: LucideIcon;
  getValue: (p: PropertyLayoutSummaryProps) => number;
}> = [
  { key: "bedrooms", label: "Bedrooms", icon: BedDouble, getValue: (p) => p.bedrooms ?? 1 },
  { key: "bathrooms", label: "Bathrooms", icon: Bath, getValue: (p) => p.bathrooms ?? 1 },
  { key: "kitchens", label: "Kitchens", icon: CookingPot, getValue: (p) => p.kitchens ?? 1 },
  {
    key: "livingRooms",
    label: "Living rooms",
    icon: Sofa,
    getValue: (p) => p.livingRooms ?? 1,
  },
];

export function PropertyLayoutSummary(props: PropertyLayoutSummaryProps) {
  const { detailedRoomCount = 0, className } = props;

  return (
    <Card className={cn(overviewCardClass, className)} data-testid="card-layout-summary">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Layout summary</CardTitle>
        <CardDescription>Room counts on this property</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {METRICS.map((item) => {
            const Icon = item.icon;
            const value = item.getValue(props);
            return (
              <div key={item.key} className={overviewMetricTileClass}>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-xs font-medium sm:text-sm">{item.label}</span>
                </div>
                <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
                  {value}
                </span>
              </div>
            );
          })}
        </div>
        {detailedRoomCount > 0 && (
          <p className="pt-1 text-xs text-muted-foreground">
            {detailedRoomCount} detailed room{detailedRoomCount === 1 ? "" : "s"} configured
            below
          </p>
        )}
      </CardContent>
    </Card>
  );
}
