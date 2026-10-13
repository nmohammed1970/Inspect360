import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { COMPANY_MODULE_META } from "@shared/companyModules";
import type { Organization, User } from "@shared/schema";

type CompanyModulesSettingsProps = {
  /** Extra class on the toggles container */
  className?: string;
};

/**
 * Enable/disable org-scoped company modules (same UI as Settings → Internal Modules).
 */
export function CompanyModulesSettings({ className }: CompanyModulesSettingsProps) {
  const { toast } = useToast();
  const [rentalsEnabled, setRentalsEnabled] = useState(true);
  const [tenanciesEnabled, setTenanciesEnabled] = useState(true);
  const [complianceEnabled, setComplianceEnabled] = useState(true);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(true);

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  const { data: organization, isLoading: orgLoading } = useQuery<Organization>({
    queryKey: ["/api/organizations", user?.organizationId],
    enabled: !!user?.organizationId,
  });

  useEffect(() => {
    if (organization) {
      setRentalsEnabled(organization.rentalsEnabled ?? true);
      setTenanciesEnabled(organization.tenanciesEnabled ?? true);
      setComplianceEnabled(organization.complianceEnabled ?? true);
      setMaintenanceEnabled(organization.maintenanceEnabled ?? true);
    }
  }, [organization]);

  const updateCompanyModulesMutation = useMutation({
    mutationFn: async () => {
      if (!user?.organizationId) return null;
      const response = await apiRequest(
        "PATCH",
        `/api/organizations/${user.organizationId}/company-modules`,
        {
          rentalsEnabled: tenanciesEnabled ? rentalsEnabled : false,
          tenanciesEnabled,
          complianceEnabled,
          maintenanceEnabled,
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
    <div className={className ?? "space-y-6"} data-testid="section-company-modules">
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg min-w-0">
          <div className="flex-1 min-w-0">
            <Label className="text-base font-medium">{COMPANY_MODULE_META.tenancies.label}</Label>
            <p className="text-sm text-muted-foreground mt-1">{COMPANY_MODULE_META.tenancies.description}</p>
          </div>
          <Switch
            checked={tenanciesEnabled}
            onCheckedChange={(on) => {
              setTenanciesEnabled(on);
              if (!on) setRentalsEnabled(false);
            }}
            data-testid="toggle-module-tenancies"
          />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg min-w-0">
          <div className="flex-1 min-w-0">
            <Label className="text-base font-medium">{COMPANY_MODULE_META.rentals.label}</Label>
            <p className="text-sm text-muted-foreground mt-1">{COMPANY_MODULE_META.rentals.description}</p>
            {!tenanciesEnabled && (
              <p className="text-xs text-muted-foreground mt-1">
                Enable Tenancies first to turn Rentals on.
              </p>
            )}
          </div>
          <Switch
            checked={tenanciesEnabled && rentalsEnabled}
            onCheckedChange={setRentalsEnabled}
            disabled={!tenanciesEnabled}
            data-testid="toggle-module-rentals"
          />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg min-w-0">
          <div className="flex-1 min-w-0">
            <Label className="text-base font-medium">{COMPANY_MODULE_META.compliance.label}</Label>
            <p className="text-sm text-muted-foreground mt-1">{COMPANY_MODULE_META.compliance.description}</p>
          </div>
          <Switch
            checked={complianceEnabled}
            onCheckedChange={setComplianceEnabled}
            data-testid="toggle-module-compliance"
          />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg min-w-0">
          <div className="flex-1 min-w-0">
            <Label className="text-base font-medium">{COMPANY_MODULE_META.maintenance.label}</Label>
            <p className="text-sm text-muted-foreground mt-1">{COMPANY_MODULE_META.maintenance.description}</p>
          </div>
          <Switch
            checked={maintenanceEnabled}
            onCheckedChange={setMaintenanceEnabled}
            data-testid="toggle-module-maintenance"
          />
        </div>
      </div>
      <Button
        variant="brand"
        onClick={() => updateCompanyModulesMutation.mutate()}
        disabled={updateCompanyModulesMutation.isPending}
        data-testid="button-save-company-modules"
      >
        {updateCompanyModulesMutation.isPending ? "Saving..." : "Save Module Settings"}
      </Button>
    </div>
  );
}
