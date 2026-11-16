import {
  LayoutDashboard,
  Users,
  BookOpen,
  Shield,
  Info,
  Box,
  Tags,
  ClipboardList,
  MessageSquarePlus,
  Lightbulb,
  UserCog,
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
import { Link, useLocation } from "wouter";

export function AdminSidebar() {
  const [location] = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();

  const menuItems = [
    {
      title: "Dashboard",
      url: "/admin/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Team",
      url: "/admin/team",
      icon: Users,
    },
    {
      title: "Knowledge Base",
      url: "/admin/knowledge-base",
      icon: BookOpen,
    },
    {
      title: "Extensive",
      url: "/admin/extensive",
      icon: Info,
    },
    {
      title: "Modules",
      url: "/admin/modules",
      icon: Box,
    },
    {
      title: "Inspection Templates",
      url: "/admin/templates",
      icon: ClipboardList,
    },
    {
      title: "Billing Catalog",
      url: "/admin/billing-pricing",
      icon: Tags,
    },
    {
      title: "Feedback",
      url: "/admin/feedback",
      icon: MessageSquarePlus,
    },
    {
      title: "Feature Requests",
      url: "/admin/feedback/feature-requests",
      icon: Lightbulb,
    },
    {
      title: "Feedback Team",
      url: "/admin/feedback/team",
      icon: UserCog,
    },
  ];

  return (
    <Sidebar data-testid="sidebar-admin">
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="h-6 w-6 text-primary shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm truncate">INSPECT 360</span>
            <span className="text-xs text-muted-foreground truncate">Admin Portal</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive =
                  item.url === "/admin/feedback"
                    ? location === "/admin/feedback" ||
                      /^\/admin\/feedback\/[^/]+$/.test(location)
                    : location === item.url || location.startsWith(item.url + "/");
                const handleClick = () => {
                  if (isMobile) {
                    setOpenMobile(false);
                  }
                };
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive}
                      className="data-[active=true]:bg-sidebar-accent"
                    >
                      <Link href={item.url} onClick={handleClick}>
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
