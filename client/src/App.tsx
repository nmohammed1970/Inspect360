import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Auth from "@/pages/Auth";
import ForgotPassword from "@/pages/ForgotPassword";
import Dashboard from "@/pages/Dashboard";
import Properties from "@/pages/Properties";
import PropertyDetail from "@/pages/PropertyDetail";
import Credits from "@/pages/Credits";
import Billing from "@/pages/Billing";
import Inspections from "@/pages/Inspections";
import InspectionDetail from "@/pages/InspectionDetail";
import Compliance from "@/pages/Compliance";
import Maintenance from "@/pages/Maintenance";
import ComparisonReports from "@/pages/ComparisonReports";
import ComparisonReportDetail from "@/pages/ComparisonReportDetail";
import OrganizationSetup from "@/pages/OrganizationSetup";
import Team from "@/pages/Team";
import Blocks from "@/pages/Blocks";
import BlockDetail from "@/pages/BlockDetail";
import BlockTenants from "@/pages/BlockTenants";
import Settings from "@/pages/Settings";
import AssetInventory from "@/pages/AssetInventory";
import InspectionTemplates from "@/pages/InspectionTemplates";
import InspectionCapture from "@/pages/InspectionCapture";
import InspectionReview from "@/pages/InspectionReview";
import InspectionReport from "@/pages/InspectionReport";
import Contacts from "@/pages/Contacts";
import PropertyTenants from "@/pages/PropertyTenants";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminTeam from "@/pages/AdminTeam";
import { Button } from "@/components/ui/button";
import { LogOut, Loader2 } from "lucide-react";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";

function AppContent() {
  // Always call hooks at the top level
  const { isAuthenticated, user, logoutMutation, isLoading } = useAuth();

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  // Not authenticated - show public routes (including admin routes)
  if (!isAuthenticated && !isLoading) {
    return (
      <TooltipProvider>
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/auth" component={Auth} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/admin/login" component={AdminLogin} />
          <Route path="/admin/dashboard" component={AdminDashboard} />
          <Route path="/admin/team" component={AdminTeam} />
          <Route component={NotFound} />
        </Switch>
        <PWAInstallPrompt />
        <Toaster />
      </TooltipProvider>
    );
  }

  // Show loading while checking authentication status
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Authenticated but no organization - show onboarding
  if (user && !user.organizationId) {
    return (
      <TooltipProvider>
        <Switch>
          <Route path="*" component={OrganizationSetup} />
        </Switch>
        <PWAInstallPrompt />
        <Toaster />
      </TooltipProvider>
    );
  }

  // Authenticated with organization - show app with sidebar
  return (
    <TooltipProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1">
            <header className="flex items-center justify-between p-4 border-b bg-card">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </header>
            <main className="flex-1 overflow-auto bg-background">
              <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/blocks/:id/tenants" component={BlockTenants} />
                <Route path="/blocks/:id" component={BlockDetail} />
              <Route path="/blocks" component={Blocks} />
                <Route path="/properties/:id/tenants" component={PropertyTenants} />
                <Route path="/properties/:id" component={PropertyDetail} />
                <Route path="/properties" component={Properties} />
                <Route path="/credits" component={Credits} />
                <Route path="/inspections" component={Inspections} />
                <Route path="/inspections/:id/capture" component={InspectionCapture} />
                <Route path="/inspections/:id/review" component={InspectionReview} />
                <Route path="/inspections/:id/report" component={InspectionReport} />
                <Route path="/inspections/:id" component={InspectionDetail} />
                <Route path="/compliance" component={Compliance} />
                <Route path="/maintenance" component={Maintenance} />
                <Route path="/comparisons/:id" component={ComparisonReportDetail} />
                <Route path="/comparisons" component={ComparisonReports} />
                <Route path="/team" component={Team} />
                <Route path="/contacts" component={Contacts} />
                <Route path="/asset-inventory" component={AssetInventory} />
                <Route path="/inspection-templates" component={InspectionTemplates} />
                <Route path="/billing" component={Billing} />
                <Route path="/settings" component={Settings} />
                <Route component={NotFound} />
              </Switch>
            </main>
          </div>
        </div>
      </SidebarProvider>
      <PWAInstallPrompt />
      <Toaster />
    </TooltipProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
