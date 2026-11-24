/**
 * Display-only labels for inspection types/statuses and related enums.
 * Never use these for comparisons or API payloads — keep raw slug values there.
 */

import {
  activeInactiveTone,
  inspectionStatusTone,
  maintenanceRequestStatusTone,
  occupancyTone,
  toneToBadgeVariant,
  type BadgeVariantName,
} from "./statusPriorityStyles";

export type { BadgeVariantName };

/** Title-case snake_case / kebab-case for unknown values. */
export function formatEnumLabel(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  check_in: "Check-in",
  check_out: "Check-out",
  routine: "Routine",
  maintenance: "Maintenance",
  esg_sustainability_inspection: "ESG Sustainability Inspection",
  fire_hazard_assessment: "Fire Hazard Assessment",
  maintenance_inspection: "Maintenance Inspection",
  damage: "Damage",
  emergency: "Emergency",
  safety_compliance: "Safety & Compliance",
  compliance_regulatory: "Compliance / Regulatory",
  pre_purchase: "Pre-Purchase",
  specialized: "Specialized",
};

const INSPECTION_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  reviewed: "Reviewed",
  cancelled: "Cancelled",
};

const MAINTENANCE_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  closed: "Closed",
};

export function formatInspectionType(type: string | null | undefined): string {
  if (type == null || type === "" || type === "—") return "—";
  return INSPECTION_TYPE_LABELS[type] ?? formatEnumLabel(type);
}

export function formatInspectionStatus(status: string | null | undefined): string {
  if (status == null || status === "" || status === "—") return "—";
  return INSPECTION_STATUS_LABELS[status] ?? formatEnumLabel(status);
}

export function formatMaintenanceStatus(status: string | null | undefined): string {
  if (status == null || status === "" || status === "—") return "—";
  return MAINTENANCE_STATUS_LABELS[status] ?? formatEnumLabel(status);
}

/** Occupancy display labels used in portfolio property rows. */
export function formatOccupancyStatus(status: string | null | undefined): string {
  if (status == null || status === "" || status === "—") return "—";
  if (status === "Occupied" || status === "occupied") return "Occupied";
  if (status === "Vacant" || status === "vacant") return "Vacant";
  return formatEnumLabel(status);
}

export function occupancyBadgeVariant(
  status: string | null | undefined,
): BadgeVariantName {
  return toneToBadgeVariant(occupancyTone(status));
}

export function inspectionStatusBadgeVariant(
  status: string | null | undefined,
): BadgeVariantName {
  if ((status || "").toLowerCase() === "draft") return "outline";
  return toneToBadgeVariant(inspectionStatusTone(status));
}

export function maintenanceStatusBadgeVariant(
  status: string | null | undefined,
): BadgeVariantName {
  return toneToBadgeVariant(maintenanceRequestStatusTone(status));
}

/** Active / inactive style tenant or record flags. */
export function activeInactiveBadgeVariant(
  status: string | null | undefined,
): BadgeVariantName {
  return toneToBadgeVariant(activeInactiveTone(status));
}
