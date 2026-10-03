import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { apiRequestJson } from '../services/api';
import type { EntitlementLockCode } from '../services/entitlementLock';

export type EntitlementStatus = {
  locked?: boolean;
  code?: string;
  label?: string;
};

export function useEntitlement() {
  const { user, isAuthenticated } = useAuth();

  const query = useQuery({
    queryKey: ['/api/entitlement'],
    queryFn: () => apiRequestJson<EntitlementStatus>('GET', '/api/entitlement'),
    enabled: isAuthenticated && !!user?.organizationId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const locked = !!query.data?.locked;
  const code: EntitlementLockCode =
    query.data?.code === 'CREDITS_EXPIRED' ? 'CREDITS_EXPIRED' : 'TRIAL_EXPIRED';

  return {
    entitlement: query.data ?? null,
    locked,
    code,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
