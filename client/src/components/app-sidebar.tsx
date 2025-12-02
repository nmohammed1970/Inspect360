import {
  Building2,
  ClipboardCheck,
  FileText,
  Home,
  LayoutDashboard,
  Settings,
  Wrench,
  Users,
  CreditCard,
  Boxes,
  Clipboard,
  Package,
  List,
  Contact,
  GitCompare,
  BarChart3,
  FileBarChart,
  MessageSquarePlus,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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

export function AppSidebar() {
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

  const mainMenuItems = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
      roles: ["owner", "clerk", "compliance", "tenant", "contractor"],
    },
    {
      title: "Contacts",
      url: "/contacts",
      icon: Contact,
      roles: ["owner", "clerk", "compliance"],
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
      roles: ["owner", "clerk"],
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
      title: "Analytics",
      url: "/analytics",
      icon: BarChart3,
      roles: ["owner"],
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
      roles: ["owner", "clerk", "compliance"],
    },
  ];

  const settingsMenuItems = [
    {
      title: "Inspection Templates",
      url: "/inspection-templates",
      icon: List,
      roles: ["owner", "compliance"],
    },
    {
      title: "Team",
      url: "/team",
      icon: Users,
      roles: ["owner"],
    },
    {
      title: "Billing",
      url: "/billing",
      icon: CreditCard,
      roles: ["owner"],
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings,
      roles: ["owner"],
    },
    {
      title: "My Feedback",
      url: "/my-feedback",
      icon: MessageSquarePlus,
      roles: ["owner", "clerk", "compliance", "contractor"],
    },
  ];

  const filteredMainMenu = mainMenuItems.filter((item) =>
    item.roles.includes(user?.role || "")
  );

  const filteredSettingsMenu = settingsMenuItems.filter((item) =>
    item.roles.includes(user?.role || "")
  );

  return (
    <Sidebar data-testid="sidebar-main">
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
              {filteredMainMenu.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={location === item.url}
                    className="data-[active=true]:bg-sidebar-accent"
                    data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {filteredSettingsMenu.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredSettingsMenu.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      data-active={location === item.url}
                      className="data-[active=true]:bg-sidebar-accent"
                      data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
