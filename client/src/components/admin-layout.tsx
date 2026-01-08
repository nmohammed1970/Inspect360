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
      <div className="flex h-screen w-full">
        <AdminSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b bg-card">
            <div className="flex items-center gap-4">
              <SidebarTrigger data-testid="button-admin-sidebar-toggle" />
              <Breadcrumb>
                <BreadcrumbList>
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
                          <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                        )}
                      </BreadcrumbItem>
                    </div>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <AdminProfileMenu />
          </header>
          <main className="flex-1 overflow-auto bg-background">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

