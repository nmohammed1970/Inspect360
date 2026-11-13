import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  COMPANY_MODULE_META,
  PROPERTY_BUNDLE_UPGRADE_MESSAGE,
} from "@shared/companyModules";
import type { Organization, User } from "@shared/schema";
import { useCompanyModules } from "@/hooks/useCompanyModules";
import { Lock } from "lucide-react";

type CompanyModulesSettingsProps = {
  /** Extra class on the toggles container */
  className?: string;
};

function LockedSwitch({
  checked,
  disabled,
  locked,
  onCheckedChange,
  testId,
}: {
  checked: boolean;
  disabled?: boolean;
  locked: boolean;
  onCheckedChange: (on: boolean) => void;
  testId: string;
}) {
  const switchEl = (
    <Switch
      checked={checked}
      disabled={disabled || locked}
      onCheckedChange={onCheckedChange}
      data-testid={testId}
    />
  );

  if (!locked) return switchEl;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-not-allowed" tabIndex={0}>
          {switchEl}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs">
        {PROPERTY_BUNDLE_UPGRADE_MESSAGE}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Enable/disable org-scoped company modules (same UI as Settings → Internal Modules).
 * AI Inspections plans keep all toggles locked OFF with an upgrade tooltip.
 */
export function CompanyModulesSettings({ className }: CompanyModulesSettingsProps) {
  const { toast } = useToast();
  const { lockedByAiPlan } = useCompanyModules();
  const [rentalsEnabled, setRentalsEnabled] = useState(true);
  const [tenanciesEnabled, setTenanciesEnabled] = useState(true);
  const [complianceEnabled, setComplianceEnabled] = useState(true);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(true);
  const [hmoComplianceEnabled, setHmoComplianceEnabled] = useState(false);

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  const { data: organization, isLoading: orgLoading } = useQuery<Organization>({
    queryKey: ["/api/organizations", user?.organizationId],
    enabled: !!user?.organizationId,
  });

  useEffect(() => {
    if (!organization) return;
    if (lockedByAiPlan) {
      setRentalsEnabled(false);
      setTenanciesEnabled(false);
      setComplianceEnabled(false);
      setMaintenanceEnabled(false);
      setHmoComplianceEnabled(false);
      return;
    }
    setRentalsEnabled(organization.rentalsEnabled ?? true);
    setTenanciesEnabled(organization.tenanciesEnabled ?? true);
    setComplianceEnabled(organization.complianceEnabled ?? true);
    setMaintenanceEnabled(organization.maintenanceEnabled ?? true);
    setHmoComplianceEnabled(organization.hmoComplianceEnabled === true);
  }, [organization, lockedByAiPlan]);

  const updateCompanyModulesMutation = useMutation({
    mutationFn: async () => {
      if (!user?.organizationId) return null;
      if (lockedByAiPlan) {
        throw new Error(PROPERTY_BUNDLE_UPGRADE_MESSAGE);
      }
      const response = await apiRequest(
        "PATCH",
        `/api/organizations/${user.organizationId}/company-modules`,
        {
          rentalsEnabled: tenanciesEnabled ? rentalsEnabled : false,
          tenanciesEnabled,
          complianceEnabled,
          maintenanceEnabled,
          hmoComplianceEnabled,
        },
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", user?.organizationId] });
      toast({
        title: "Success",
        description: "Company modules updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update company modules",
      });
    },
  });

  if (orgLoading) {
    return <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className={className ?? "space-y-6"} data-testid="section-company-modules">
        {lockedByAiPlan && (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex gap-2 items-start"
            data-testid="banner-ai-plan-modules-locked"
          >
            <Lock className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              Your current plan is AI Inspections. Internal Modules stay off until you upgrade to a
              Property Management plan. Hover a toggle for details.
            </p>
          </div>
        )}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg min-w-0">
            <div className="flex-1 min-w-0">
              <Label className="text-base font-medium">{COMPANY_MODULE_META.tenancies.label}</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {COMPANY_MODULE_META.tenancies.description}
              </p>
            </div>
            <LockedSwitch
              checked={tenanciesEnabled}
              locked={lockedByAiPlan}
              onCheckedChange={(on) => {
                setTenanciesEnabled(on);
                if (!on) setRentalsEnabled(false);
              }}
              testId="toggle-module-tenancies"
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg min-w-0">
            <div className="flex-1 min-w-0">
              <Label className="text-base font-medium">{COMPANY_MODULE_META.rentals.label}</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {COMPANY_MODULE_META.rentals.description}
              </p>
              {!lockedByAiPlan && !tenanciesEnabled && (
                <p className="text-xs text-muted-foreground mt-1">
                  Enable Tenancies first to turn Rentals on.
                </p>
              )}
            </div>
            <LockedSwitch
              checked={tenanciesEnabled && rentalsEnabled}
              locked={lockedByAiPlan}
              disabled={!tenanciesEnabled}
              onCheckedChange={setRentalsEnabled}
              testId="toggle-module-rentals"
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg min-w-0">
            <div className="flex-1 min-w-0">
              <Label className="text-base font-medium">{COMPANY_MODULE_META.compliance.label}</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {COMPANY_MODULE_META.compliance.description}
              </p>
            </div>
            <LockedSwitch
              checked={complianceEnabled}
              locked={lockedByAiPlan}
              onCheckedChange={setComplianceEnabled}
              testId="toggle-module-compliance"
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg min-w-0">
            <div className="flex-1 min-w-0">
              <Label className="text-base font-medium">{COMPANY_MODULE_META.maintenance.label}</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {COMPANY_MODULE_META.maintenance.description}
              </p>
            </div>
            <LockedSwitch
              checked={maintenanceEnabled}
              locked={lockedByAiPlan}
              onCheckedChange={setMaintenanceEnabled}
              testId="toggle-module-maintenance"
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg min-w-0">
            <div className="flex-1 min-w-0">
              <Label className="text-base font-medium">
                {COMPANY_MODULE_META.hmo_compliance.label}
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                {COMPANY_MODULE_META.hmo_compliance.description}
              </p>
            </div>
            <LockedSwitch
              checked={hmoComplianceEnabled}
              locked={lockedByAiPlan}
              onCheckedChange={setHmoComplianceEnabled}
              testId="toggle-module-hmo-compliance"
            />
          </div>
        </div>
        <Button
          variant="brand"
          onClick={() => updateCompanyModulesMutation.mutate()}
          disabled={updateCompanyModulesMutation.isPending || lockedByAiPlan}
          data-testid="button-save-company-modules"
          title={lockedByAiPlan ? PROPERTY_BUNDLE_UPGRADE_MESSAGE : undefined}
        >
          {updateCompanyModulesMutation.isPending ? "Saving..." : "Save Module Settings"}
        </Button>
      </div>
    </TooltipProvider>
  );
}
