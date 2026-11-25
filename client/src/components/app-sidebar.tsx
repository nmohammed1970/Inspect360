import {
  Building2,
  ClipboardCheck,
  FileText,
  Home,
  LayoutDashboard,
  Settings,
  Wrench,
  Boxes,
  Clipboard,
  Package,
  Contact,
  GitCompare,
  BarChart3,
  FileBarChart,
  CreditCard,
  Shield,
  MessageSquarePlus,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useModules } from "@/hooks/use-modules";
import { useCompanyModules } from "@/hooks/useCompanyModules";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Organization } from "@shared/schema";
import { BRAND_LOGO_MASTER } from "@/lib/brandAssets";
import { isLockedAppPath } from "@shared/entitlements";
import { useEntitlement } from "@/hooks/useEntitlement";
import { apiRequest, notifyEntitlementLock } from "@/lib/queryClient";

export function AppSidebar() {
  const { user } = useAuth();
  const [location] = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const {
    complianceEnabled,
    maintenanceEnabled,
    hmoComplianceEnabled,
    tenanciesEnabled,
  } = useCompanyModules();

  const { data: organization } = useQuery<Organization>({
    queryKey: ["/api/organizations", user?.organizationId],
    enabled: !!user?.organizationId,
  });

  // Prefer org white-label logo; otherwise approved Inspect360 master mark
  const getLogoSrc = () => {
    if (!organization?.logoUrl) return BRAND_LOGO_MASTER;
    const separator = organization.logoUrl.includes('?') ? '&' : '?';
    const cacheBuster = organization.updatedAt
      ? new Date(organization.updatedAt).getTime()
      : Date.now();
    return `${organization.logoUrl}${separator}v=${cacheBuster}`;
  };

  const logoSrc = getLogoSrc();
  const companyName = organization?.brandingName || organization?.name || "Inspect360";

  const { isModuleEnabled } = useModules();
  const { data: entitlement } = useEntitlement();

  const canSeeFinanceBadge =
    !!maintenanceEnabled &&
    !!user &&
    ["owner", "clerk", "contractor", "maintenance_admin"].includes(user.role || "");

  const { data: financePending } = useQuery<{ count: number }>({
    queryKey: ["/api/maintenance-finance/pending-count"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/maintenance-finance/pending-count");
      return res.json();
    },
    enabled: canSeeFinanceBadge,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  const financePendingCount = financePending?.count ?? 0;

  type MenuItem = {
    title: string;
    url: string;
    icon: typeof LayoutDashboard;
    roles: string[];
  };

  const workspaceItems: MenuItem[] = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
      roles: ["owner", "compliance", "tenant", "maintenance_admin"],
    },
    {
      title: "Blocks",
      url: "/blocks",
      icon: Boxes,
      roles: ["owner", "compliance"],
    },
    {
      title: "Properties",
      url: "/properties",
      icon: Building2,
      roles: ["owner", "compliance"],
    },
    {
      title: "Inspections",
      url: "/inspections",
      icon: ClipboardCheck,
      roles: ["owner", "clerk", "contractor"],
    },
    {
      title: "Comparisons",
      url: "/comparisons",
      icon: GitCompare,
      roles: ["owner", "tenant"],
    },
    {
      title: "Compliance",
      url: "/compliance",
      icon: FileText,
      roles: ["owner", "compliance"],
    },
    {
      title: "HMO portfolio",
      url: "/hmo",
      icon: Shield,
      roles: ["owner", "compliance", "clerk"],
    },
    {
      title: "Maintenance",
      url: "/maintenance",
      icon: Wrench,
      roles: ["owner", "clerk", "tenant", "contractor", "maintenance_admin"],
    },
    {
      title: "Work Orders",
      url: "/analytics",
      icon: BarChart3,
      roles: ["owner", "maintenance_admin"],
    },
    {
      title: "Quotes & Invoicing",
      url: "/maintenance/finance",
      icon: FileText,
      roles: ["owner", "clerk", "contractor", "maintenance_admin"],
    },
    {
      title: "Maintenance Feedback",
      url: "/maintenance/feedback",
      icon: MessageSquarePlus,
      roles: ["owner", "maintenance_admin", "clerk"],
    },
    {
      title: "My Work Orders",
      url: "/maintenance?tab=work-orders",
      icon: Clipboard,
      roles: ["contractor", "clerk"],
    },
    {
      title: "Asset Inventory",
      url: "/asset-inventory",
      icon: Package,
      roles: ["owner", "clerk", "compliance", "contractor"],
    },
  ];

  const managementItems: MenuItem[] = [
    {
      title: "Contacts",
      url: "/contacts",
      icon: Contact,
      roles: ["owner", "compliance"],
    },
    {
      title: "Reports",
      url: "/reports",
      icon: FileBarChart,
      roles: ["owner", "compliance"],
    },
    {
      title: "Community",
      url: "/community-moderation",
      icon: Shield,
      roles: ["owner"],
    },
    {
      title: "Billing",
      url: "/billing",
      icon: CreditCard,
      roles: ["owner"],
    },
    {
      title: "Feedback",
      url: "/feedback",
      icon: MessageSquarePlus,
      roles: ["owner", "compliance", "clerk", "contractor"],
    },
  ];

  const filterMenu = (items: MenuItem[]) =>
    items.filter((item) => {
      if (!item.roles.includes(user?.role || "")) return false;
      if (item.url === "/compliance" && !complianceEnabled) return false;
      if (item.url === "/hmo" && !hmoComplianceEnabled) return false;
      if (item.url === "/community-moderation" && !tenanciesEnabled) return false;
      if (
        !maintenanceEnabled &&
        (item.url === "/maintenance" ||
          item.url === "/analytics" ||
          item.url.startsWith("/maintenance"))
      ) {
        return false;
      }
      return true;
    });

  const filteredWorkspace = filterMenu(workspaceItems);
  const filteredManagement = filterMenu(managementItems);

  // Dynamic active state styling based on organization's brand color
  const getActiveStyle = (isActive: boolean) => {
    if (!isActive) return undefined;
    if (organization?.brandingPrimaryColor) {
      return {
        backgroundColor: `${organization.brandingPrimaryColor}20`, // 20% opacity tint
        borderLeft: `3px solid ${organization.brandingPrimaryColor}`,
      };
    }
    return undefined; // Fall back to CSS class
  };

  const renderMenuItem = (item: MenuItem) => {
    const pathOnly = item.url.split("?")[0];
    const isActive =
      location === item.url ||
      location === pathOnly ||
      (pathOnly !== "/" && location.startsWith(pathOnly + "/"));
    const itemLocked = !!entitlement?.locked && isLockedAppPath(pathOnly);
    const handleClick = (event: { preventDefault: () => void }) => {
      if (
        itemLocked &&
        (entitlement?.code === "TRIAL_EXPIRED" || entitlement?.code === "CREDITS_EXPIRED")
      ) {
        event.preventDefault();
        notifyEntitlementLock(entitlement.code);
        return;
      }
      if (isMobile) setOpenMobile(false);
    };
    const showFinanceBadge =
      item.url === "/maintenance/finance" && financePendingCount > 0;

    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          asChild
          data-active={isActive}
          className={
            !organization?.brandingPrimaryColor
              ? "gap-2.5 data-[active=true]:bg-primary/10 data-[active=true]:text-foreground data-[active=true]:shadow-[inset_3px_0_0_0_hsl(var(--primary))]"
              : "gap-2.5"
          }
          style={getActiveStyle(isActive)}
          data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <Link href={item.url} onClick={handleClick} className={itemLocked ? "opacity-50" : undefined}>
            <item.icon className="w-4 h-4 shrink-0" />
            <span className="truncate font-medium">{item.title}</span>
          </Link>
        </SidebarMenuButton>
        {showFinanceBadge ? (
          <SidebarMenuBadge
            className="bg-primary text-primary-foreground"
            data-testid="badge-finance-pending"
          >
            {financePendingCount > 99 ? "99+" : financePendingCount}
          </SidebarMenuBadge>
        ) : null}
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar data-testid="sidebar-main">
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <img
            key={organization?.logoUrl || 'default'}
            src={logoSrc}
            alt={companyName}
            className="h-8 w-auto max-w-full object-contain"
            data-testid="img-sidebar-logo"
            onError={(e) => {
              // Fallback to default logo if image fails to load
              if (e.currentTarget.src !== BRAND_LOGO_MASTER) {
                e.currentTarget.src = BRAND_LOGO_MASTER;
              }
            }}
          />
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-1">
        {filteredWorkspace.length > 0 && (
          <SidebarGroup className="py-1">
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Workspace
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {filteredWorkspace.map((item) => renderMenuItem(item))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(filteredManagement.length > 0 ||
          (user?.role !== "clerk" &&
            user?.role !== "contractor" &&
            user?.role !== "maintenance_admin")) && (
          <SidebarGroup className="py-1">
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Management
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {filteredManagement.map((item) => renderMenuItem(item))}
                {user?.role !== "clerk" &&
                  user?.role !== "contractor" &&
                  user?.role !== "maintenance_admin" && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        data-active={location.startsWith("/settings")}
                        className={
                          !organization?.brandingPrimaryColor
                            ? "gap-2.5 data-[active=true]:bg-primary/10 data-[active=true]:text-foreground data-[active=true]:shadow-[inset_3px_0_0_0_hsl(var(--primary))]"
                            : "gap-2.5"
                        }
                        style={getActiveStyle(location.startsWith("/settings"))}
                        data-testid="link-settings"
                      >
                        <Link
                          href="/settings"
                          onClick={() => {
                            if (isMobile) setOpenMobile(false);
                          }}
                        >
                          <Settings className="w-4 h-4 shrink-0" />
                          <span className="truncate font-medium">Settings</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
