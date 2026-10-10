import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { Organization } from "@shared/schema";
import {
  isCompanyModuleEnabled,
  type CompanyModuleKey,
} from "@shared/companyModules";

/**
 * Org-scoped company module toggles (Settings → Internal Modules).
 * Fail closed for gated surfaces while org is loading.
 */
export function useCompanyModules() {
  const { user } = useAuth();

  const { data: organization, isLoading, isFetched } = useQuery<Organization>({
    queryKey: ["/api/organizations", user?.organizationId],
    enabled: !!user?.organizationId,
  });

  const ready = !!user?.organizationId && isFetched && !isLoading;

  const isEnabled = (key: CompanyModuleKey): boolean => {
    if (!ready) return false;
    return isCompanyModuleEnabled(organization, key);
  };

  return {
    organization,
    isLoading: !!user?.organizationId && (isLoading || !isFetched),
    isReady: ready,
    isCompanyModuleEnabled: isEnabled,
    rentalsEnabled: isEnabled("rentals"),
    tenanciesEnabled: isEnabled("tenancies"),
    complianceEnabled: isEnabled("compliance"),
    maintenanceEnabled: isEnabled("maintenance"),
  };
}
