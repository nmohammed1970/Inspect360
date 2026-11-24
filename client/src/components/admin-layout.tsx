import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./admin-sidebar";
import { AdminProfileMenu } from "./admin-profile-menu";
import { AppBreadcrumbs } from "@/navigation";

interface AdminLayoutProps {
  children: ReactNode;
  /** @deprecated Registry-driven AppBreadcrumbs replaces per-route arrays */
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export function AdminLayout({ children }: AdminLayoutProps) {
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
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <SidebarTrigger data-testid="button-admin-sidebar-toggle" className="shrink-0" />
              <AppBreadcrumbs />
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
