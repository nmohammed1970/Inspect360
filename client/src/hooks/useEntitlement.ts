import { useQuery } from "@tanstack/react-query";
import type { EntitlementStatus } from "@shared/entitlements";
import { useAuth } from "@/hooks/useAuth";

export function useEntitlement() {
  const { user, isAuthenticated } = useAuth();
  return useQuery<EntitlementStatus>({
    queryKey: ["/api/entitlement"],
    enabled: isAuthenticated && !!user?.organizationId,
    staleTime: 0,
  });
}
