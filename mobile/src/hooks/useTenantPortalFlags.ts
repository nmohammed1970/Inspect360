import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { tenantService, type TenantPortalOrganization } from '../services/tenant';
import { isCompanyModuleEnabled } from '../../../shared/companyModules';

export type TenantPortalFlags = {
  maintenanceEnabled: boolean;
  comparisonEnabled: boolean;
  communityEnabled: boolean;
  chatbotEnabled: boolean;
  brandingName: string;
  logoUrl: string | null;
  brandingPrimaryColor: string | null;
  organization: TenantPortalOrganization | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

const DEFAULT_FLAGS: Omit<TenantPortalFlags, 'organization' | 'isLoading' | 'isError' | 'refetch'> = {
  maintenanceEnabled: true,
  comparisonEnabled: true,
  communityEnabled: true,
  chatbotEnabled: true,
  brandingName: 'Inspect360',
  logoUrl: null,
  brandingPrimaryColor: null,
};

/**
 * Authoritative org feature toggles for the tenant portal (same fields as web).
 * Defaults to enabled when null/undefined to match web App.tsx behavior.
 */
export function useTenantPortalFlags(): TenantPortalFlags {
  const { user } = useAuth();
  const isTenant = user?.role === 'tenant';
  const organizationId = user?.organizationId;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['/api/organizations', organizationId, 'tenant-portal'],
    queryFn: () => tenantService.getOrganization(organizationId!),
    enabled: isTenant && !!organizationId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  if (!isTenant) {
    return {
      ...DEFAULT_FLAGS,
      organization: null,
      isLoading: false,
      isError: false,
      refetch: () => {},
    };
  }

  return {
    maintenanceEnabled: data?.tenantPortalMaintenanceEnabled ?? true,
    comparisonEnabled: data?.tenantPortalComparisonEnabled ?? true,
    communityEnabled: data?.tenantPortalCommunityEnabled ?? true,
    chatbotEnabled: data?.tenantPortalChatbotEnabled ?? true,
    brandingName: data?.brandingName || data?.name || 'Inspect360',
    logoUrl: data?.logoUrl ?? null,
    brandingPrimaryColor: data?.brandingPrimaryColor ?? null,
    organization: data ?? null,
    isLoading: isLoading && !data,
    isError,
    refetch: () => {
      void refetch();
    },
  };
}
