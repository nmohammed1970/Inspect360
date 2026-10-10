import {
  Building2,
  ClipboardCheck,
  FileText,
  Home,
  LayoutDashboard,
  Settings,
  Wrench,
  Users,
  Boxes,
  Clipboard,
  Package,
  Contact,
  GitCompare,
  BarChart3,
  FileBarChart,
  CreditCard,
  Shield,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
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
import { notifyEntitlementLock } from "@/lib/queryClient";

export function AppSidebar() {
  const { user } = useAuth();
  const [location] = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const { complianceEnabled, maintenanceEnabled } = useCompanyModules();

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

  const mainMenuItems = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
      roles: ["owner", "compliance", "tenant"],
    },
    {
      title: "Contacts",
      url: "/contacts",
      icon: Contact,
      roles: ["owner", "compliance"],
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
      title: "Maintenance",
      url: "/maintenance",
      icon: Wrench,
      roles: ["owner", "clerk", "tenant", "contractor"],
    },
    {
      title: "Work Orders",
      url: "/analytics",
      icon: BarChart3,
      roles: ["owner"],
    },
    {
      title: "My Work Orders",
      url: "/maintenance?tab=work-orders",
      icon: Clipboard,
      roles: ["clerk", "contractor"],
    },
    {
      title: "Reports",
      url: "/reports",
      icon: FileBarChart,
      roles: ["owner", "compliance"],
    },
    {
      title: "Asset Inventory",
      url: "/asset-inventory",
      icon: Package,
      roles: ["owner", "clerk", "compliance", "contractor"],
    },
    {
      title: "Community",
      url: "/community-moderation",
      icon: Shield,
      roles: ["owner"],
    },
    {
      title: "Modules",
      url: "/billing",
      icon: CreditCard,
      roles: ["owner"],
    },
  ];

  const filteredMainMenu = mainMenuItems.filter((item) => {
    if (!item.roles.includes(user?.role || "")) return false;
    if (item.url === "/compliance" && !complianceEnabled) return false;
    if (
      !maintenanceEnabled &&
      (item.url === "/maintenance" ||
        item.url === "/analytics" ||
        item.url.startsWith("/maintenance?"))
    ) {
      return false;
    }
    return true;
  });

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
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMainMenu.map((item) => {
                const isActive = location === item.url;
                const itemLocked = !!entitlement?.locked && isLockedAppPath(item.url);
                const handleClick = (event: { preventDefault: () => void }) => {
                  if (itemLocked && (entitlement?.code === "TRIAL_EXPIRED" || entitlement?.code === "CREDITS_EXPIRED")) {
                    event.preventDefault();
                    notifyEntitlementLock(entitlement.code);
                    return;
                  }
                  if (isMobile) {
                    setOpenMobile(false);
                  }
                };
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive}
                      className={!organization?.brandingPrimaryColor ? "data-[active=true]:bg-sidebar-accent" : ""}
                      style={getActiveStyle(isActive)}
                      data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Link href={item.url} onClick={handleClick} className={itemLocked ? "opacity-50" : undefined}>
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {user?.role !== "clerk" && user?.role !== "contractor" && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {(() => {
                  const isActive = location.startsWith("/settings");
                  const handleClick = () => {
                    // Close sidebar on mobile when navigation item is clicked
                    if (isMobile) {
                      setOpenMobile(false);
                    }
                  };
                  return (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        data-active={isActive}
                        className={!organization?.brandingPrimaryColor ? "data-[active=true]:bg-sidebar-accent" : ""}
                        style={getActiveStyle(isActive)}
                        data-testid="link-settings"
                      >
                        <Link href="/settings" onClick={handleClick}>
                          <Settings className="w-4 h-4" />
                          <span>Settings</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })()}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
