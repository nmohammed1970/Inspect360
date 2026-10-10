import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { apiRequestJson } from '../services/api';
import {
  isCompanyModuleEnabled,
  type CompanyModuleFlags,
  type CompanyModuleKey,
} from '../../../shared/companyModules';

/**
 * Org-scoped company module toggles (Settings → Internal Modules).
 * Fail closed for gated surfaces while org is loading.
 */
export function useCompanyModules() {
  const { user } = useAuth();
  const organizationId = user?.organizationId;

  const { data: organization, isLoading, isFetched } = useQuery<CompanyModuleFlags>({
    queryKey: ['/api/organizations', organizationId],
    queryFn: () => apiRequestJson<CompanyModuleFlags>('GET', `/api/organizations/${organizationId}`),
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  const ready = !!organizationId && isFetched && !isLoading;

  const isEnabled = (key: CompanyModuleKey): boolean => {
    if (!ready) return false;
    return isCompanyModuleEnabled(organization, key);
  };

  return {
    organization,
    isLoading: !!organizationId && (isLoading || !isFetched),
    isReady: ready,
    isCompanyModuleEnabled: isEnabled,
    rentalsEnabled: isEnabled('rentals'),
    tenanciesEnabled: isEnabled('tenancies'),
    complianceEnabled: isEnabled('compliance'),
    maintenanceEnabled: isEnabled('maintenance'),
  };
}
