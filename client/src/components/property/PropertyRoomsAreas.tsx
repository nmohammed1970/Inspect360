import { useMemo, useState } from "react";
import { BedDouble, Ruler } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { overviewCardClass } from "@/components/property/overviewChrome";
import {
  roomCategoryIcon,
  roomCategoryTone,
} from "@/components/property/roomCategoryIcon";
import { floorAreaFt2, floorAreaM2 } from "@shared/propertyRooms";

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
  /** When "ft2", totals use ft² labels; otherwise m². */
  areaUnit?: "m2" | "ft2";
  className?: string;
};

function roomAreaValue(
  room: PropertyOverviewRoom,
  areaUnit: "m2" | "ft2",
): number | null {
  return areaUnit === "ft2"
    ? floorAreaFt2(room.widthMm, room.lengthMm)
    : floorAreaM2(room.widthMm, room.lengthMm);
}

function formatAreaNumber(value: number, areaUnit: "m2" | "ft2"): string {
  return areaUnit === "ft2" ? `${value} ft²` : `${value} m²`;
}

function isBedroomCategory(nameOrSlug: string | null | undefined): boolean {
  const key = String(nameOrSlug || "").toLowerCase();
  return key.includes("bedroom") || key.includes("bed") || key.includes("master");
}

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
  const tone = roomCategoryTone(room.categorySlug || room.categoryName);

  return (
    <li
      className={cn(
        "flex h-full min-w-0 flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-sm",
        "transition-all hover:border-primary/20 hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-[15px] font-semibold leading-snug text-foreground">
          {room.name}
        </p>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            tone,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-4 flex-1">
        {area ? (
          <p className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {area}
          </p>
        ) : dimensions ? (
          <p className="text-lg font-semibold tracking-tight tabular-nums text-foreground">
            {dimensions}
          </p>
        ) : (
          <p className="text-sm font-medium text-muted-foreground/80">
            {room.hasDetails ? "No dimensions" : "Dimensions not set"}
          </p>
        )}
      </div>

      <div className="mt-3 border-t border-border/60 pt-3">
        {area && dimensions ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            <Ruler className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="min-w-0 truncate">{dimensions}</span>
          </p>
        ) : area ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Ruler className="h-3.5 w-3.5 shrink-0 opacity-70" />
            Floor area
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/70">
            {room.hasDetails ? "No dimensions" : "Dimensions not set"}
          </p>
        )}
      </div>
    </li>
  );
}

export function PropertyRoomsAreas({
  sections,
  totalRooms,
  hasDetailedRooms,
  formatDimensions,
  formatArea,
  areaUnit = "m2",
  className,
}: PropertyRoomsAreasProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const allRooms = useMemo(
    () => sections.flatMap(([, rooms]) => rooms),
    [sections],
  );

  const categoryChips = useMemo(
    () =>
      sections.map(([name, rooms]) => ({
        name,
        count: rooms.length,
      })),
    [sections],
  );

  const stats = useMemo(() => {
    const areas = allRooms
      .map((r) => roomAreaValue(r, areaUnit))
      .filter((v): v is number => v != null && Number.isFinite(v));
    const total = areas.length
      ? Math.round(areas.reduce((a, b) => a + b, 0) * 100) / 100
      : null;
    const largest = areas.length ? Math.max(...areas) : null;
    const bedrooms = allRooms.filter((r) =>
      isBedroomCategory(r.categorySlug || r.categoryName),
    ).length;
    return { total, largest, bedrooms };
  }, [allRooms, areaUnit]);

  const visibleRooms = useMemo(() => {
    if (activeCategory === "all") return allRooms;
    return sections.find(([name]) => name === activeCategory)?.[1] ?? [];
  }, [activeCategory, allRooms, sections]);

  return (
    <Card
      className={cn(overviewCardClass, "overflow-hidden", className)}
      data-testid="card-property-rooms"
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-base sm:text-lg">Rooms &amp; areas</CardTitle>
        <CardDescription>
          {hasDetailedRooms
            ? `${totalRooms} room${totalRooms === 1 ? "" : "s"} across ${sections.length} categor${sections.length === 1 ? "y" : "ies"}`
            : "Rooms from layout counts — open Edit Property to set categories and dimensions"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {sections.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-4 py-10 text-center">
            <BedDouble className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No rooms configured for this property yet.
            </p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              Use Edit Property to add rooms, categories, and dimensions.
            </p>
          </div>
        ) : (
          <>
            {/* Summary metrics */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {[
                {
                  label: "Total area",
                  value:
                    stats.total != null
                      ? formatAreaNumber(stats.total, areaUnit)
                      : "—",
                },
                {
                  label: "Largest room",
                  value:
                    stats.largest != null
                      ? formatAreaNumber(stats.largest, areaUnit)
                      : "—",
                },
                {
                  label: "Bedrooms",
                  value: String(stats.bedrooms),
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-border/60 bg-muted/40 px-4 py-3"
                >
                  <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-foreground sm:text-2xl">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Category filter chips */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveCategory("all")}
                className={cn(
                  "inline-flex h-8 items-center rounded-full px-3.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  activeCategory === "all"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border/80 bg-background text-muted-foreground hover:bg-primary/5 hover:text-foreground",
                )}
              >
                All {totalRooms}
              </button>
              {categoryChips.map((chip) => (
                <button
                  type="button"
                  key={chip.name}
                  onClick={() => setActiveCategory(chip.name)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    activeCategory === chip.name
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "border border-border/80 bg-background text-muted-foreground hover:bg-primary/5 hover:text-foreground",
                  )}
                >
                  <span className="truncate max-w-[9rem]">{chip.name}</span>
                  <span className="tabular-nums opacity-80">{chip.count}</span>
                </button>
              ))}
            </div>

            {/* Room cards grid */}
            <ul className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleRooms.map((room) => {
                const dims = formatDimensions(room);
                const area =
                  formatArea?.(room) ??
                  (dims && /^\d/.test(dims) && dims.includes("²") ? dims : null);
                return (
                  <PropertyRoomCard
                    key={room.id}
                    room={room}
                    dimensions={dims}
                    area={area}
                  />
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
