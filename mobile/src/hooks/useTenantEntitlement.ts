import { useEntitlement, type EntitlementStatus } from './useEntitlement';

/** @deprecated Prefer useEntitlement — kept for existing tenant call sites. */
export type TenantEntitlement = EntitlementStatus;

/** Tenant screens: same org entitlement as ops; only meaningful when role is tenant. */
export function useTenantEntitlement() {
  return useEntitlement();
}
