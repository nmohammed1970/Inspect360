
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEntitlement } from "@/hooks/useEntitlement";

export type MarketplaceModule = {
    id: string;
    name: string;
    moduleKey: string;
    description: string;
    iconName: string;
    pricing?: {
        priceMonthly: number;
        priceAnnual: number;
        currencyCode: string;
    };
};

export type InstanceModule = {
    id: string;
    instanceId: string;
    moduleId: string;
    isEnabled: boolean;
    enabledDate?: string;
    disabledDate?: string;
    moduleKey: string; // Enriched
    moduleName: string; // Enriched
};

export function useModules() {
    const queryClient = useQueryClient();
    const { data: entitlement } = useEntitlement();

    const { data: myModules = [], isLoading: isLoadingMyModules } = useQuery<InstanceModule[]>({
        queryKey: ["/api/marketplace/my-modules"],
        refetchOnMount: true,
        refetchOnWindowFocus: true,
    });

    const { data: marketplaceData, isLoading: isLoadingMarketplace } = useQuery<{ modules: MarketplaceModule[], bundles: any[] }>({
        queryKey: ["/api/marketplace/modules"],
    });

    const toggleModuleMutation = useMutation({
        mutationFn: async ({ moduleId, enable }: { moduleId: string; enable: boolean }) => {
            const res = await apiRequest("POST", `/api/marketplace/modules/${moduleId}/toggle`, { enable });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/marketplace/my-modules"] });
            // Also invalidate user/org queries if capabilities depend on it, though strict rerender should work via 'myModules'
        },
    });

    const purchaseMutation = useMutation({
        mutationFn: async ({ type, id, interval }: { type: 'module' | 'bundle'; id: string; interval: 'monthly' | 'annual' }) => {
            const res = await apiRequest("POST", "/api/marketplace/checkout", { type, id, interval });
            return res.json();
        },
        onSuccess: (data) => {
            if (data.url) {
                window.location.href = data.url;
            }
        }
    });

    const isModuleEnabled = (key: string) => {
        // Match entitlement locking: modules stay enabled in DB, but are unusable when locked.
        if (entitlement?.locked) return false;
        if (!myModules) return false;
        return myModules.some(m => m.moduleKey && m.moduleKey === key && m.isEnabled);
    };

    return {
        myModules,
        allModules: marketplaceData?.modules || [],
        bundles: marketplaceData?.bundles || [],
        isLoading: isLoadingMyModules || isLoadingMarketplace,
        isModuleEnabled,
        toggleModule: toggleModuleMutation.mutateAsync,
        isToggling: toggleModuleMutation.isPending,
        purchaseModule: purchaseMutation.mutateAsync,
        isPurchasing: purchaseMutation.isPending
    };
}
