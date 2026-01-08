import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TenantSidebar } from "@/components/tenant-sidebar";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Auth from "@/pages/Auth";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import Properties from "@/pages/Properties";
import PropertyDetail from "@/pages/PropertyDetail";
import Credits from "@/pages/Credits";
import Billing from "@/pages/Billing";
import Profile from "@/pages/Profile";
import Marketplace from "@/pages/Marketplace";
import Inspections from "@/pages/Inspections";
import InspectionDetail from "@/pages/InspectionDetail";
import Compliance from "@/pages/Compliance";
import Maintenance from "@/pages/Maintenance";
import Analytics from "@/pages/Analytics";
import Reports from "@/pages/Reports";
import InspectionsReport from "@/pages/InspectionsReport";
import BlocksReport from "@/pages/BlocksReport";
import PropertiesReport from "@/pages/PropertiesReport";
import TenantsReport from "@/pages/TenantsReport";
import InventoryReport from "@/pages/InventoryReport";
import ComplianceReport from "@/pages/ComplianceReport";
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
import TenantDetail from "@/pages/TenantDetail";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminTeam from "@/pages/AdminTeam";
import KnowledgeBase from "@/pages/KnowledgeBase";
import EcoAdmin from "@/pages/EcoAdmin";
import { AdminPageWrapper } from "@/components/admin-page-wrapper";
import TenantLogin from "@/pages/TenantLogin";
import TenantHome from "@/pages/TenantHome";
import TenantMaintenance from "@/pages/TenantMaintenance";
import TenantRequests from "@/pages/TenantRequests";
import TenantComparisonReports from "@/pages/TenantComparisonReports";
import TenantComparisonReportDetail from "@/pages/TenantComparisonReportDetail";
import TenantCheckInReview from "@/pages/TenantCheckInReview";
import TenantCommunity from "@/pages/TenantCommunity";
import TenantProfile from "@/pages/TenantProfile";
import CommunityModeration from "@/pages/CommunityModeration";
import MyFeedback from "@/pages/MyFeedback";
import BulkImport from "@/pages/BulkImport";
import DisputeResolution from "@/pages/DisputeResolution";
import { Loader2 } from "lucide-react";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { UserProfileMenu } from "@/components/UserProfileMenu";
import { TenantProfileMenu } from "@/components/TenantProfileMenu";
import { AIChatbot } from "@/components/AIChatbot";
import { IvyChatbot } from "@/components/IvyChatbot";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { Onboarding } from "@/components/Onboarding";
import { useState, useEffect, useLayoutEffect } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationPopup } from "@/components/NotificationPopup";

// Component to redirect clerks to inspections page
function ClerkRedirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(to);
  }, [to, setLocation]);
  return null;
}

function AppContent() {
  // Always call hooks at the top level
  const { isAuthenticated, user, logoutMutation, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Fetch organization for tenant portal settings - must be called unconditionally
  const { data: tenantOrganization } = useQuery<any>({
    queryKey: ["/api/organizations", user?.organizationId],
    enabled: !!(user?.role === "tenant" && user?.organizationId),
  });

  // List of public routes that don't require authentication
  const publicRoutes = [
    "/",
    "/auth",
    "/forgot-password",
    "/reset-password",
    "/admin/login",
    "/admin/dashboard",
    "/admin/team",
    "/admin/knowledge-base",
    "/admin/eco-admin",
    "/tenant/login",
  ];

  // Check if current route is a protected route
  const isProtectedRoute = !publicRoutes.some(route => {
    if (route === "/") {
      return location === "/";
    }
    return location.startsWith(route);
  });

  // Redirect unauthorized users trying to access protected routes
  // Use useLayoutEffect + window.location.href for immediate hard redirect before paint
  // This prevents any blank page from showing
  useLayoutEffect(() => {
    if (!isLoading && !isAuthenticated && isProtectedRoute) {
      // Preserve the return URL so we can redirect back after login
      const returnUrl = encodeURIComponent(location);
      window.location.href = `/auth?returnUrl=${returnUrl}`;
    }
  }, [isLoading, isAuthenticated, isProtectedRoute, location]);

  // Check if user needs to see onboarding (first-time login)
  // Only show onboarding for owner/operator role
  // NOTE: This hook must be called before any early returns to follow Rules of Hooks
  useEffect(() => {
    if (user && user.organizationId && !user.onboardingCompleted && user.role === "owner") {
      setShowOnboarding(true);
    } else {
      setShowOnboarding(false);
    }
  }, [user]);

  // If unauthorized and trying to access protected route, show loading while redirecting
  if (!isLoading && !isAuthenticated && isProtectedRoute) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  // Not authenticated - show public routes (including admin and tenant routes)
  if (!isAuthenticated && !isLoading) {
    return (
      <TooltipProvider>
        <Switch>
          <Route path="/" component={Auth} />
          <Route path="/auth" component={Auth} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/admin/login" component={AdminLogin} />
          <Route path="/admin/dashboard">
            {() => (
              <AdminPageWrapper breadcrumbs={[{ label: "Dashboard" }]}>
                <AdminDashboard />
              </AdminPageWrapper>
            )}
          </Route>
          <Route path="/admin/team">
            {() => (
              <AdminPageWrapper breadcrumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Team" }]}>
                <AdminTeam />
              </AdminPageWrapper>
            )}
          </Route>
          <Route path="/admin/knowledge-base">
            {() => (
              <AdminPageWrapper breadcrumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Knowledge Base" }]}>
                <KnowledgeBase />
              </AdminPageWrapper>
            )}
          </Route>
          <Route path="/admin/eco-admin">
            {() => (
              <AdminPageWrapper breadcrumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Eco Admin" }]}>
                <EcoAdmin />
              </AdminPageWrapper>
            )}
          </Route>
          <Route path="/tenant/login" component={TenantLogin} />
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

  // Tenant role - show tenant portal with sidebar
  // Check this BEFORE organization check since tenants may not have organizationId
  if (user && user.role === "tenant") {
    const showChatbot = tenantOrganization?.tenantPortalChatbotEnabled ?? true;
    const showMaintenance = tenantOrganization?.tenantPortalMaintenanceEnabled ?? true;
    const showComparison = tenantOrganization?.tenantPortalComparisonEnabled ?? true;
    const showCommunity = tenantOrganization?.tenantPortalCommunityEnabled ?? true;

    return (
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <TenantSidebar />
            <div className="flex flex-col flex-1">
              <header className="flex items-center justify-between p-4 border-b bg-card">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                <TenantProfileMenu />
              </header>
              <main className="flex-1 overflow-auto bg-background">
                <Switch>
                  <Route path="/" component={TenantHome} />
                  <Route path="/tenant/home" component={TenantHome} />
                  {showMaintenance && <Route path="/tenant/maintenance" component={TenantMaintenance} />}
                  {showMaintenance && <Route path="/tenant/requests" component={TenantRequests} />}
                  {showComparison && <Route path="/tenant/comparison-reports/:id" component={TenantComparisonReportDetail} />}
                  {showComparison && <Route path="/tenant/comparison-reports" component={TenantComparisonReports} />}
                  {showCommunity && <Route path="/tenant/community" component={TenantCommunity} />}
                  <Route path="/tenant/check-in-review/:id" component={TenantCheckInReview} />
                  <Route path="/tenant/profile" component={TenantProfile} />
                  <Route path="/dashboard" component={TenantHome} />
                  <Route component={NotFound} />
                </Switch>
              </main>
            </div>
          </div>
        </SidebarProvider>
        <NotificationSystem />
        {/* Show AI Chatbot for tenants only if enabled */}
        {showChatbot && <AIChatbot />}
        <PWAInstallPrompt />
        <Toaster />
      </TooltipProvider>
    );
  }

  // Authenticated but no organization - show onboarding (for staff users only)
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
  // First check if onboarding is needed
  if (showOnboarding) {
    return (
      <TooltipProvider>
        <Onboarding onComplete={() => setShowOnboarding(false)} />
        <Toaster />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1">
            <header className="flex items-center justify-between p-4 border-b bg-card">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <UserProfileMenu />
            </header>
            <main className="flex-1 overflow-auto bg-background">
              <Switch>
                {user?.role === "clerk" ? (
                  <>
                    <Route path="/">
                      {() => <ClerkRedirect to="/inspections" />}
                    </Route>
                    <Route path="/dashboard">
                      {() => <ClerkRedirect to="/inspections" />}
                    </Route>
                  </>
                ) : (
                  <>
                    <Route path="/" component={Dashboard} />
                    <Route path="/dashboard" component={Dashboard} />
                  </>
                )}
                <Route path="/blocks/:id/tenants" component={BlockTenants} />
                <Route path="/blocks/:id" component={BlockDetail} />
                <Route path="/blocks" component={Blocks} />
                <Route path="/properties/:id/tenants" component={PropertyTenants} />
                <Route path="/tenants/:id" component={TenantDetail} />
                <Route path="/properties/:id" component={PropertyDetail} />
                <Route path="/properties" component={Properties} />
                <Route path="/credits" component={Credits} />
                <Route path="/profile" component={Profile} />
                <Route path="/inspections" component={Inspections} />
                <Route path="/inspections/:id/capture" component={InspectionCapture} />
                <Route path="/inspections/:id/review" component={InspectionReview} />
                <Route path="/inspections/:id/report" component={InspectionReport} />
                <Route path="/inspections/:id" component={InspectionDetail} />
                <Route path="/compliance" component={Compliance} />
                <Route path="/maintenance/:id" component={Maintenance} />
                <Route path="/maintenance" component={Maintenance} />
                <Route path="/analytics" component={Analytics} />
                <Route path="/reports/inspections" component={InspectionsReport} />
                <Route path="/reports/blocks" component={BlocksReport} />
                <Route path="/reports/properties" component={PropertiesReport} />
                <Route path="/reports/tenants" component={TenantsReport} />
                <Route path="/reports/inventory" component={InventoryReport} />
                <Route path="/reports/compliance" component={ComplianceReport} />
                <Route path="/reports" component={Reports} />
                <Route path="/comparisons/:id" component={ComparisonReportDetail} />
                <Route path="/comparisons" component={ComparisonReports} />
                <Route path="/team" component={Team} />
                <Route path="/contacts" component={Contacts} />
                <Route path="/asset-inventory" component={AssetInventory} />
                <Route path="/inspection-templates">
                  {(params) => <InspectionTemplates />}
                </Route>
                <Route path="/billing" component={Billing} />
                <Route path="/settings" component={Settings} />
                <Route path="/bulk-import" component={BulkImport} />
                <Route path="/marketplace" component={Marketplace} />
                <Route path="/community-moderation" component={CommunityModeration} />
                <Route path="/disputes" component={DisputeResolution} />
                <Route path="/my-feedback" component={MyFeedback} />
                <Route component={NotFound} />
              </Switch>
            </main>
          </div>
        </div>
      </SidebarProvider>
      <NotificationSystem />
      {/* Show Ivy chatbot for all authenticated operators (non-tenants) */}
      <IvyChatbot />
      <PWAInstallPrompt />
      <Toaster />
    </TooltipProvider>
  );
}

// Component to handle notifications (only for authenticated users)
function NotificationSystem() {
  const { user, isAuthenticated } = useAuth();
  const { popupNotification, handleClosePopup, handleViewNotification } = useNotifications();

  // Only show notifications for authenticated users
  if (!isAuthenticated || !user) {
    return null;
  }

  // Only show popup for tenants
  if (user.role !== "tenant") {
    return null;
  }

  if (!popupNotification) {
    return null;
  }

  return (
    <NotificationPopup
      notification={popupNotification}
      onClose={handleClosePopup}
      onView={() => handleViewNotification(popupNotification)}
    />
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <AppContent />
      </LocaleProvider>
    </QueryClientProvider>
  );
}
