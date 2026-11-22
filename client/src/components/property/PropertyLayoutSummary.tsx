import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { overviewCardClass } from "@/components/property/overviewChrome";

type PropertyLayoutSummaryProps = {
  bedrooms?: number | null;
  bathrooms?: number | null;
  kitchens?: number | null;
  livingRooms?: number | null;
  detailedRoomCount?: number;
  className?: string;
};

export function PropertyLayoutSummary({
  bedrooms,
  bathrooms,
  kitchens,
  livingRooms,
  detailedRoomCount = 0,
  className,
}: PropertyLayoutSummaryProps) {
  const primary = [
    { label: "Bedrooms", value: bedrooms ?? 1 },
    { label: "Bathrooms", value: bathrooms ?? 1 },
  ];
  const secondary = [
    { label: "Kitchens", value: kitchens ?? 1 },
    { label: "Living rooms", value: livingRooms ?? 1 },
  ];

  return (
    <Card className={cn(overviewCardClass, className)} data-testid="card-layout-summary">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Layout summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          {primary.map((item) => (
            <div
              key={item.label}
              className="rounded-xl bg-muted/60 px-3.5 py-3.5"
            >
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">
                {item.value}
              </p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {secondary.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-border/60 bg-background px-3.5 py-3"
            >
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-foreground">
                {item.value}
              </p>
            </div>
          ))}
        </div>
        {detailedRoomCount > 0 && (
          <p className="pt-1 text-xs text-muted-foreground">
            {detailedRoomCount} detailed room{detailedRoomCount === 1 ? "" : "s"} below
          </p>
        )}
      </CardContent>
    </Card>
  );
}
