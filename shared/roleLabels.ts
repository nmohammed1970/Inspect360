/** User-facing labels for roles (internal role slugs are unchanged). */
export function getTeamRoleDisplayLabel(role: string): string {
  switch (role) {
    case "owner":
      return "Owner/Operator";
    case "clerk":
      return "Inventory Clerk / Inspector";
    case "compliance":
      return "Compliance Officer";
    case "contractor":
      return "Maintenance Contractor";
    case "tenant":
      return "Tenant";
    case "operator":
      return "Operator";
    default:
      return role ? role.charAt(0).toUpperCase() + role.slice(1) : "";
  }
}

/** Label for the team member (clerk) assigned to an inspection. */
export const ASSIGNED_INVENTORY_CLERK_LABEL = "Assigned Inventory Clerk / Inspector";
