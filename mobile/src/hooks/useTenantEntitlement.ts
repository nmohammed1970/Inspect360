import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { apiRequestJson } from '../services/api';

export type TenantEntitlement = {
  locked?: boolean;
  code?: string;
  label?: string;
};

export function useTenantEntitlement() {
  const { user, isAuthenticated } = useAuth();
  const isTenant = user?.role === 'tenant';

  const query = useQuery({
    queryKey: ['/api/entitlement'],
    queryFn: () => apiRequestJson<TenantEntitlement>('GET', '/api/entitlement'),
    enabled: isAuthenticated && isTenant && !!user?.organizationId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const locked = !!query.data?.locked;
  const code = query.data?.code === 'CREDITS_EXPIRED' ? 'CREDITS_EXPIRED' : 'TRIAL_EXPIRED';

  return {
    entitlement: query.data ?? null,
    locked,
    code,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
