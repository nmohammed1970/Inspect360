import { ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AdminLayout } from "./admin-layout";

interface AdminPageWrapperProps {
  children: ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export function AdminPageWrapper({ children, breadcrumbs }: AdminPageWrapperProps) {
  const [, navigate] = useLocation();

  // Check admin authentication
  const { data: adminUser, isLoading } = useQuery({
    queryKey: ["/api/admin/me"],
    retry: false,
  });

  useEffect(() => {
    if (!isLoading && !adminUser) {
      navigate("/admin/login");
    }
  }, [isLoading, adminUser, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin h-12 w-12 text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!adminUser) {
    return null; // Will redirect to login
  }

  return <AdminLayout breadcrumbs={breadcrumbs}>{children}</AdminLayout>;
}

