/** Roles that can manage maintenance finance like an owner (approve/send/invoice). */
export const MAINTENANCE_FINANCE_MANAGER_ROLES = ["owner", "maintenance_admin"] as const;

/** Roles that can open the maintenance company module surfaces. */
export const MAINTENANCE_MODULE_ROLES = [
  "owner",
  "clerk",
  "contractor",
  "tenant",
  "maintenance_admin",
] as const;

export function isMaintenanceAdmin(role?: string | null): boolean {
  return role === "maintenance_admin";
}

export function canManageMaintenanceFinance(role?: string | null): boolean {
  return (
    !!role &&
    (MAINTENANCE_FINANCE_MANAGER_ROLES as readonly string[]).includes(role)
  );
}

export function canAccessMaintenanceModule(role?: string | null): boolean {
  return (
    !!role && (MAINTENANCE_MODULE_ROLES as readonly string[]).includes(role)
  );
}

/** Owner-like visibility on requests/WOs (not assignee-filtered). */
export function hasMaintenanceOwnerVisibility(role?: string | null): boolean {
  return role === "owner" || role === "maintenance_admin" || role === "clerk";
}
