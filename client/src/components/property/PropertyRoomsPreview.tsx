import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { overviewCardClass } from "@/components/property/overviewChrome";
import type { PropertyOverviewRoom } from "@/components/property/PropertyRoomsAreas";

type PropertyRoomsPreviewProps = {
  rooms: PropertyOverviewRoom[];
  formatArea: (room: PropertyOverviewRoom) => string | null;
  onViewAll?: () => void;
  className?: string;
  /** How many chips to show before "View all" covers the rest. */
  previewLimit?: number;
};

export function PropertyRoomsPreview({
  rooms,
  formatArea,
  onViewAll,
  className,
  previewLimit = 6,
}: PropertyRoomsPreviewProps) {
  const visible = rooms.slice(0, previewLimit);

  return (
    <Card className={cn(overviewCardClass, className)} data-testid="card-rooms-preview">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Rooms</CardTitle>
        {rooms.length > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            data-testid="button-view-all-rooms"
          >
            View all {rooms.length}
          </button>
        )}
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rooms configured yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {visible.map((room) => {
              const area = formatArea(room);
              return (
                <div
                  key={room.id}
                  className="min-w-[7.5rem] flex-1 rounded-xl bg-muted/60 px-3.5 py-3 sm:max-w-[11rem] sm:flex-none"
                >
                  <p className="truncate text-sm font-semibold text-foreground">{room.name}</p>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {area || (room.hasDetails ? "No dimensions" : "Dimensions not set")}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
