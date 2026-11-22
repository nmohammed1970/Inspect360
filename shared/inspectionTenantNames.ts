/**
 * Resolve General Info "Tenant Name" from property tenant assignments,
 * optionally scoped to the tenant selected when the inspection was created.
 */

export type InspectionTenantLike = {
  id?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  tenantName?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  tenant?: {
    id?: string | null;
    name?: string | null;
    fullName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
};

function tenantRecordId(t: InspectionTenantLike): string {
  return String(
    t.id || t.tenantId || t.userId || t.tenant?.id || "",
  ).trim();
}

export function formatTenantDisplayName(t: InspectionTenantLike): string {
  const fromParts =
    t.firstName && t.lastName
      ? `${t.firstName} ${t.lastName}`
      : t.firstName || t.lastName || "";
  const fromNested =
    t.tenant?.fullName ||
    t.tenant?.name ||
    (t.tenant?.firstName && t.tenant?.lastName
      ? `${t.tenant.firstName} ${t.tenant.lastName}`
      : t.tenant?.firstName || t.tenant?.lastName || "");
  return String(
    t.tenantName || t.name || fromNested || fromParts || "",
  ).trim();
}

/**
 * Names for auto_tenant_names. When `selectedTenantId` is set, only that
 * tenant is included (inspection belongs to the one chosen at create).
 */
export function resolveInspectionTenantNames(
  tenants: InspectionTenantLike[] | null | undefined,
  selectedTenantId?: string | null,
): string {
  if (!Array.isArray(tenants) || tenants.length === 0) return "";

  const selected = String(selectedTenantId || "").trim();
  const list = selected
    ? tenants.filter((t) => tenantRecordId(t) === selected)
    : tenants;

  // Explicit selection that matches no assignment — do not fall back to everyone.
  if (selected && list.length === 0) return "";

  const names = list.map(formatTenantDisplayName).filter(Boolean);
  if (names.length > 0) return names.join(", ");

  const hasAny = list.some(
    (t) =>
      !!(
        t.tenantName ||
        t.name ||
        t.tenant ||
        t.firstName ||
        t.lastName
      ),
  );
  return hasAny ? "Tenant assigned" : "";
}
