import { useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useCompanyModules } from "@/hooks/useCompanyModules";
import {
  COMPANY_MODULE_META,
  type CompanyModuleKey,
} from "@shared/companyModules";
import { Loader2 } from "lucide-react";

type CompanyModuleRouteProps = {
  module: CompanyModuleKey;
  children: React.ReactNode;
};

/**
 * Redirects to /dashboard with a toast when the org company module is OFF.
 * Fail closed while org flags are loading.
 */
export function CompanyModuleRoute({ module, children }: CompanyModuleRouteProps) {
  const { isCompanyModuleEnabled, isLoading, isReady } = useCompanyModules();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const enabled = isReady && isCompanyModuleEnabled(module);

  useEffect(() => {
    if (isLoading || !isReady) return;
    if (!enabled) {
      const label = COMPANY_MODULE_META[module].label;
      toast({
        title: "Module disabled",
        description: `${label} is turned off for your organization. Enable it in Settings → Internal Modules.`,
        variant: "destructive",
      });
      setLocation("/dashboard");
    }
  }, [enabled, isLoading, isReady, module, setLocation, toast]);

  if (isLoading || !isReady) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!enabled) return null;

  return <>{children}</>;
}
