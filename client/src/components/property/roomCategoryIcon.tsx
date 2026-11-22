import type { LucideIcon } from "lucide-react";
import {
  Bath,
  BedDouble,
  Car,
  CookingPot,
  DoorOpen,
  Archive,
  Flower2,
  LayoutGrid,
  Sofa,
  Square,
  Utensils,
  WashingMachine,
} from "lucide-react";

/** Map room category name/slug to a Lucide icon. */
export function roomCategoryIcon(
  categoryNameOrSlug: string | null | undefined,
): LucideIcon {
  const key = String(categoryNameOrSlug || "")
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");

  if (key.includes("master") || key.includes("bedroom") || key.includes("bed")) {
    return BedDouble;
  }
  if (key.includes("bath") || key.includes("en-suite") || key.includes("ensuite")) {
    return Bath;
  }
  if (key.includes("kitchen")) return CookingPot;
  if (key.includes("living") || key.includes("lounge") || key.includes("sitting")) {
    return Sofa;
  }
  if (key.includes("dining")) return Utensils;
  if (key.includes("hallway") || key.includes("corridor") || key.includes("landing")) {
    return DoorOpen;
  }
  if (key.includes("utility") || key.includes("laundry")) return WashingMachine;
  if (key.includes("garden") || key.includes("yard")) return Flower2;
  if (key.includes("garage")) return Car;
  if (key.includes("study") || key.includes("office")) return Square;
  if (key.includes("storage") || key.includes("cupboard")) return Archive;
  if (key.includes("other")) return LayoutGrid;
  return LayoutGrid;
}
