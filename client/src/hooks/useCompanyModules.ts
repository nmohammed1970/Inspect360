import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { Organization } from "@shared/schema";
import {
  companyModulesLockedByAiPlan,
  isCompanyModuleEnabled,
  type CompanyModuleKey,
} from "@shared/companyModules";
import { apiRequest } from "@/lib/queryClient";

type BillingSubscriptionResponse = {
  subscription?: {
    planCode?: string | null;
    status?: string | null;
  } | null;
};

/**
 * Org-scoped company module toggles (Settings → Internal Modules).
 * Fail closed for gated surfaces while org is loading.
 * AI Inspections plans force all company modules OFF everywhere.
 */
export function useCompanyModules() {
  const { user } = useAuth();

  const { data: organization, isLoading, isFetched } = useQuery<Organization>({
    queryKey: ["/api/organizations", user?.organizationId],
    enabled: !!user?.organizationId,
  });

  const {
    data: billingSub,
    isLoading: billingLoading,
    isFetched: billingFetched,
    isError: billingError,
  } = useQuery<BillingSubscriptionResponse>({
    queryKey: ["/api/billing/v2/subscription"],
    queryFn: async () => (await apiRequest("GET", "/api/billing/v2/subscription")).json(),
    enabled: !!user?.organizationId,
    staleTime: 30_000,
    retry: 1,
  });

  const planCode = billingSub?.subscription?.planCode ?? null;
  const planStatus = billingSub?.subscription?.status ?? null;
  const lockedByAiPlan = companyModulesLockedByAiPlan(planCode, planStatus);

  const billingReady = billingFetched || billingError;
  const ready = !!user?.organizationId && isFetched && !isLoading && billingReady;

  const isEnabled = (key: CompanyModuleKey): boolean => {
    if (!ready) return false;
    return isCompanyModuleEnabled(organization, key, { planCode, planStatus });
  };

  return {
    organization,
    isLoading:
      !!user?.organizationId && (isLoading || !isFetched || (billingLoading && !billingReady)),
    isReady: ready,
    isCompanyModuleEnabled: isEnabled,
    lockedByAiPlan,
    planCode,
    planStatus,
    rentalsEnabled: isEnabled("rentals"),
    tenanciesEnabled: isEnabled("tenancies"),
    complianceEnabled: isEnabled("compliance"),
    maintenanceEnabled: isEnabled("maintenance"),
    hmoComplianceEnabled: isEnabled("hmo_compliance"),
  };
}
