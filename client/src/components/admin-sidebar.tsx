import {
  CreditCard,
  LayoutDashboard,
  Users,
  BookOpen,
  Shield,
  Info,
  Box,
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
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function AdminSidebar() {
  const [location] = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const { data: openRequests } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/credit-requests/open-count"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/credit-requests/open-count");
      return res.json();
    },
    retry: false,
    refetchInterval: 60000,
  });
  const openCount = openRequests?.count ?? 0;

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
      title: openCount > 0 ? `Credit Requests (${openCount})` : "Credit Requests",
      url: "/admin/credit-requests",
      icon: CreditCard,
    },
  ];

  return (
    <Sidebar data-testid="sidebar-admin">
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          <div className="flex flex-col">
            <span className="font-bold text-sm">INSPECT 360</span>
            <span className="text-xs text-muted-foreground">Admin Portal</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location === item.url || location.startsWith(item.url + "/");
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

