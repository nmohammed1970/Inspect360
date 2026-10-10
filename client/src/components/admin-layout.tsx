import { ReactNode } from "react";
import { Link } from "wouter";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./admin-sidebar";
import { AdminProfileMenu } from "./admin-profile-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useLocation } from "wouter";

interface AdminLayoutProps {
  children: ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export function AdminLayout({ children, breadcrumbs }: AdminLayoutProps) {
  const [location] = useLocation();

  // Default breadcrumbs based on current route
  const getDefaultBreadcrumbs = () => {
    if (location === "/admin/dashboard") {
      return [{ label: "Dashboard" }];
    }
    if (location === "/admin/team") {
      return [{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Team" }];
    }
    if (location === "/admin/knowledge-base") {
      return [{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Knowledge Base" }];
    }
    if (location === "/admin/eco-admin") {
      return [{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Eco Admin" }];
    }
    if (location === "/admin/unit-pricing") {
      return [{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Unit Pricing" }];
    }
    // Default: just show Dashboard
    return [{ label: "Dashboard", href: "/admin/dashboard" }];
  };

  const finalBreadcrumbs = breadcrumbs || getDefaultBreadcrumbs();

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={style}>
      <div className="flex h-screen w-full min-w-0">
        <AdminSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 p-3 sm:p-4 border-b bg-card/95 backdrop-blur-sm shrink-0">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <SidebarTrigger data-testid="button-admin-sidebar-toggle" className="shrink-0" />
              <Breadcrumb className="min-w-0 overflow-hidden">
                <BreadcrumbList className="flex-wrap">
                  {finalBreadcrumbs.map((crumb, index) => (
                    <div key={index} className="flex items-center">
                      {index > 0 && <BreadcrumbSeparator />}
                      <BreadcrumbItem>
                        {crumb.href && index < finalBreadcrumbs.length - 1 ? (
                          <BreadcrumbLink asChild>
                            <Link href={crumb.href} className="cursor-pointer">
                              {crumb.label}
                            </Link>
                          </BreadcrumbLink>
                        ) : (
                          <BreadcrumbPage className="truncate max-w-[140px] sm:max-w-none">{crumb.label}</BreadcrumbPage>
                        )}
                      </BreadcrumbItem>
                    </div>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <AdminProfileMenu />
          </header>
          <main className="flex-1 overflow-auto bg-mist/40 dark:bg-background min-w-0">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

