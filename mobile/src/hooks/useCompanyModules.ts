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
 * Fail closed only while the first org fetch is in flight.
 * If the org request errors, fall back to shared defaults (modules ON except HMO)
 * so Maintenance / Work Orders are not permanently hidden on mobile.
 */
export function useCompanyModules() {
  const { user } = useAuth();
  const organizationId = user?.organizationId;

  const {
    data: organization,
    isLoading,
    isFetched,
    isError,
    isFetching,
  } = useQuery<CompanyModuleFlags>({
    queryKey: ['/api/organizations', organizationId],
    queryFn: () => apiRequestJson<CompanyModuleFlags>('GET', `/api/organizations/${organizationId}`),
    enabled: !!organizationId,
    staleTime: 60_000,
    retry: 2,
  });

  // First load only — don't keep tabs hidden during background refetch.
  const ready = !!organizationId && (isFetched || isError) && !(isLoading && !organization);

  const isEnabled = (key: CompanyModuleKey): boolean => {
    if (!organizationId) return false;
    if (!ready) return false;
    if (organization) {
      return isCompanyModuleEnabled(organization, key);
    }
    // Org fetch failed or returned empty — match shared defaults (HMO stays opt-in).
    if (isError) {
      return key !== 'hmo_compliance';
    }
    return false;
  };

  return {
    organization,
    isLoading: !!organizationId && !ready && (isLoading || isFetching || !isFetched),
    isReady: ready,
    isCompanyModuleEnabled: isEnabled,
    rentalsEnabled: isEnabled('rentals'),
    tenanciesEnabled: isEnabled('tenancies'),
    complianceEnabled: isEnabled('compliance'),
    maintenanceEnabled: isEnabled('maintenance'),
    hmoComplianceEnabled: isEnabled('hmo_compliance'),
  };
}
