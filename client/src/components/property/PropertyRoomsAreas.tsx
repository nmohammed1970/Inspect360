import { useState } from "react";
import { BedDouble, ChevronDown, Ruler } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  overviewCardClass,
  overviewRoomCardClass,
} from "@/components/property/overviewChrome";
import { roomCategoryIcon } from "@/components/property/roomCategoryIcon";

export type PropertyOverviewRoom = {
  id: string;
  name: string;
  categoryName: string;
  categorySlug?: string;
  widthMm?: number | null;
  lengthMm?: number | null;
  ceilingHeightMm?: number | null;
  hasDetails: boolean;
};

type PropertyRoomsAreasProps = {
  sections: Array<[string, PropertyOverviewRoom[]]>;
  totalRooms: number;
  hasDetailedRooms: boolean;
  formatDimensions: (room: PropertyOverviewRoom) => string | null;
  formatArea?: (room: PropertyOverviewRoom) => string | null;
  className?: string;
};

function PropertyRoomCard({
  room,
  dimensions,
  area,
}: {
  room: PropertyOverviewRoom;
  dimensions: string | null;
  area: string | null;
}) {
  const Icon = roomCategoryIcon(room.categorySlug || room.categoryName);

  return (
    <li className={overviewRoomCardClass}>
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="truncate font-semibold text-foreground leading-snug">{room.name}</p>
          <Badge
            variant="outline"
            className="max-w-full truncate border-border/70 bg-muted/40 font-normal text-muted-foreground"
          >
            {room.categoryName}
          </Badge>
        </div>
      </div>
      <div className="mt-auto space-y-1 border-t border-border/60 pt-2.5">
        {dimensions ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground tabular-nums">
            <Ruler className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="min-w-0 break-words">{dimensions}</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/70">
            {room.hasDetails ? "No dimensions" : "Dimensions not set"}
          </p>
        )}
        {area ? (
          <p className="pl-5 text-xs font-medium tabular-nums text-foreground/80">{area}</p>
        ) : null}
      </div>
    </li>
  );
}

function PropertyRoomCategorySection({
  categoryName,
  rooms,
  formatDimensions,
  formatArea,
  defaultOpen = true,
}: {
  categoryName: string;
  rooms: PropertyOverviewRoom[];
  formatDimensions: (room: PropertyOverviewRoom) => string | null;
  formatArea?: (room: PropertyOverviewRoom) => string | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = roomCategoryIcon(categoryName);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-2.5">
      <CollapsibleTrigger
        type="button"
        className="group flex w-full items-center justify-between gap-3 rounded-lg border border-transparent px-1 py-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground/80">
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="truncate text-sm font-semibold text-foreground">{categoryName}</h3>
          <Badge variant="secondary" className="tabular-nums shrink-0">
            {rooms.length}
          </Badge>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room) => (
            <PropertyRoomCard
              key={room.id}
              room={room}
              dimensions={formatDimensions(room)}
              area={formatArea?.(room) ?? null}
            />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function PropertyRoomsAreas({
  sections,
  totalRooms,
  hasDetailedRooms,
  formatDimensions,
  formatArea,
  className,
}: PropertyRoomsAreasProps) {
  return (
    <Card
      className={cn(overviewCardClass, className)}
      data-testid="card-property-rooms"
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Rooms &amp; areas</CardTitle>
        <CardDescription>
          {hasDetailedRooms
            ? `${totalRooms} room${totalRooms === 1 ? "" : "s"} across ${sections.length} categor${sections.length === 1 ? "y" : "ies"}`
            : "Rooms from layout counts — open Edit Property to set categories and dimensions"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {sections.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-10 text-center">
            <BedDouble className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No rooms configured for this property yet.
            </p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              Use Edit Property to add rooms, categories, and dimensions.
            </p>
          </div>
        ) : (
          sections.map(([categoryName, rooms]) => (
            <PropertyRoomCategorySection
              key={categoryName}
              categoryName={categoryName}
              rooms={rooms}
              formatDimensions={formatDimensions}
              formatArea={formatArea}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
