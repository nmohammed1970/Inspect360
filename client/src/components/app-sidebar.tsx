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
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";

export function AppSidebar() {
  const { user } = useAuth();
  const [location] = useLocation();

  const menuItems = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
      roles: ["owner", "clerk", "compliance", "tenant", "contractor"],
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
      title: "Compliance",
      url: "/compliance",
      icon: FileText,
      roles: ["owner", "compliance"],
    },
    {
      title: "Maintenance",
      url: "/maintenance",
      icon: Wrench,
      roles: ["owner", "clerk", "tenant"],
    },
    {
      title: "Work Orders",
      url: "/work-orders",
      icon: Clipboard,
      roles: ["owner", "contractor"],
    },
    {
      title: "Comparisons",
      url: "/comparisons",
      icon: FileText,
      roles: ["owner", "tenant"],
    },
    {
      title: "Team",
      url: "/team",
      icon: Users,
      roles: ["owner"],
    },
    {
      title: "Credits",
      url: "/credits",
      icon: CreditCard,
      roles: ["owner"],
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings,
      roles: ["owner"],
    },
  ];

  const filteredMenuItems = menuItems.filter((item) =>
    item.roles.includes(user?.role || "")
  );

  return (
    <Sidebar data-testid="sidebar-main">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-lg font-semibold text-primary">
            Inspect360
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMenuItems.map((item) => (
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
      </SidebarContent>
    </Sidebar>
  );
}
