import {
  Home,
  MessageSquare,
  FileText,
  FileCheck,
  Users,
  ClipboardList,
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
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Organization } from "@shared/schema";
import defaultLogoUrl from "@assets/Inspect360 Logo_1761302629835.png";

export function TenantSidebar() {
  const { user } = useAuth();
  const [location] = useLocation();

  const { data: organization } = useQuery<Organization>({
    queryKey: ["/api/organizations", user?.organizationId],
    enabled: !!user?.organizationId,
  });

  // Add cache-busting query parameter to force browser to reload logo when it changes
  const getLogoSrc = () => {
    if (!organization?.logoUrl) return defaultLogoUrl;
    const separator = organization.logoUrl.includes('?') ? '&' : '?';
    // Use organization updatedAt timestamp as cache buster
    const cacheBuster = organization.updatedAt 
      ? new Date(organization.updatedAt).getTime() 
      : Date.now();
    return `${organization.logoUrl}${separator}v=${cacheBuster}`;
  };
  
  const logoSrc = getLogoSrc();
  const companyName = organization?.brandingName || organization?.name || "Inspect360";

  const menuItems = [
    {
      title: "Home",
      url: "/dashboard",
      icon: Home,
      enabled: true, // Always enabled
    },
    {
      title: "AI Maintenance Help",
      url: "/tenant/maintenance",
      icon: MessageSquare,
      enabled: organization?.tenantPortalMaintenanceEnabled ?? true,
    },
    {
      title: "Log a Maintenance Request",
      url: "/tenant/log-request",
      icon: ClipboardList,
      enabled: organization?.tenantPortalMaintenanceEnabled ?? true,
    },
    {
      title: "My Requests",
      url: "/tenant/requests",
      icon: FileText,
      enabled: organization?.tenantPortalMaintenanceEnabled ?? true,
    },
    {
      title: "Comparison Reports",
      url: "/tenant/comparison-reports",
      icon: FileCheck,
      enabled: organization?.tenantPortalComparisonEnabled ?? true,
    },
    {
      title: "Community",
      url: "/tenant/community",
      icon: Users,
      enabled: organization?.tenantPortalCommunityEnabled ?? true,
    },
  ].filter(item => item.enabled);

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
    <Sidebar data-testid="sidebar-tenant">
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-2">
          <img 
            key={organization?.logoUrl || 'default'}
            src={logoSrc}
            alt={companyName} 
            className="h-8 max-w-[180px] object-contain" 
            data-testid="img-sidebar-logo"
            onError={(e) => {
              // Fallback to default logo if image fails to load
              if (e.currentTarget.src !== defaultLogoUrl) {
                e.currentTarget.src = defaultLogoUrl;
              }
            }}
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location === item.url || 
                  (item.url === "/dashboard" && (location === "/" || location === "/tenant/home"));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive}
                      className={!organization?.brandingPrimaryColor ? "data-[active=true]:bg-sidebar-accent" : ""}
                      style={getActiveStyle(isActive)}
                      data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

