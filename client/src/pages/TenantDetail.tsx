import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Calendar,
  Home,
  Building2,
  FileText,
  Wrench,
  AlertTriangle,
  CreditCard,
  Clock,
  ExternalLink,
  ClipboardCheck,
} from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";
import { useLocale } from "@/contexts/LocaleContext";
import { tabsListScroll } from "@/lib/responsive";
import { useCompanyModules } from "@/hooks/useCompanyModules";

interface TenantDetails {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  profileImageUrl?: string;
  createdAt?: string;
}

interface TenancyHistory {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress?: string;
  blockId?: string;
  blockName?: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
  monthlyRent?: string;
  depositAmount?: string;
  status: string;
  isActive: boolean;
}

interface TenantInspection {
  id: string;
  propertyId: string;
  propertyName: string;
  templateName: string;
  inspectionType: string;
  status: string;
  scheduledDate?: string;
  completedAt?: string;
}

interface TenantMaintenance {
  id: string;
  title: string;
  description?: string;
  propertyId: string;
  propertyName: string;
  status: string;
  priority: string;
  createdAt: string;
}

interface TenantDispute {
  id: string;
  reportId: string;
  itemRef: string;
  status: string;
  estimatedCost: string;
  finalCost?: string;
  propertyName: string;
  createdAt: string;
}

interface TenantPayment {
  id: string;
  amount: string;
  paymentDate: string;
  dueDate?: string;
  status: string;
  propertyName: string;
  type: string;
}

export default function TenantDetail() {
  const [, params] = useRoute("/tenants/:id");
  const tenantId = params?.id;
  const locale = useLocale();
  const { maintenanceEnabled } = useCompanyModules();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: tenant, isLoading: tenantLoading } = useQuery<TenantDetails>({
    queryKey: ["/api/users", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${tenantId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tenant");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: tenancyHistory = [], isLoading: historyLoading } = useQuery<TenancyHistory[]>({
    queryKey: ["/api/tenants", tenantId, "history"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tenancy history");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: inspections = [], isLoading: inspectionsLoading } = useQuery<TenantInspection[]>({
    queryKey: ["/api/tenants", tenantId, "inspections"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/inspections`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch inspections");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: maintenanceRequests = [], isLoading: maintenanceLoading } = useQuery<TenantMaintenance[]>({
    queryKey: ["/api/tenants", tenantId, "maintenance"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/maintenance`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch maintenance requests");
      return res.json();
    },
    enabled: !!tenantId && maintenanceEnabled,
  });

  const { data: disputes = [], isLoading: disputesLoading } = useQuery<TenantDispute[]>({
    queryKey: ["/api/tenants", tenantId, "disputes"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/disputes`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch disputes");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    try {
      return format(new Date(dateStr), "dd MMM yyyy");
    } catch {
      return "N/A";
    }
  };

  const formatCurrency = (amount?: string) => {
    if (!amount) return "N/A";
    const num = parseFloat(amount);
    return locale.formatCurrency(num, false);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      active: { variant: "default", label: "Active" },
      current: { variant: "default", label: "Current" },
      notice_served: { variant: "secondary", label: "Notice Served" },
      ended: { variant: "outline", label: "Ended" },
      completed: { variant: "outline", label: "Completed" },
      scheduled: { variant: "secondary", label: "Scheduled" },
      in_progress: { variant: "default", label: "In Progress" },
      open: { variant: "default", label: "Open" },
      resolved: { variant: "outline", label: "Resolved" },
      disputed: { variant: "destructive", label: "Disputed" },
      pending: { variant: "secondary", label: "Pending" },
      paid: { variant: "outline", label: "Paid" },
      overdue: { variant: "destructive", label: "Overdue" },
    };
    const config = statusConfig[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityConfig: Record<string, { variant: "default" | "secondary" | "destructive"; label: string }> = {
      low: { variant: "secondary", label: "Low" },
      medium: { variant: "default", label: "Medium" },
      high: { variant: "destructive", label: "High" },
    };
    const config = priorityConfig[priority] || { variant: "secondary", label: priority };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (tenantLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64 md:col-span-2" />
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <User className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-semibold">Tenant not found</p>
            <Link href="/properties">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Properties
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tenantName = tenant.firstName && tenant.lastName 
    ? `${tenant.firstName} ${tenant.lastName}` 
    : tenant.email;

  const activeTenancies = tenancyHistory.filter(t => t.isActive);
  const historicalTenancies = tenancyHistory.filter(t => !t.isActive);

  return (
    <div className="p-6 space-y-6" data-testid="page-tenant-detail">
      <div className="flex items-center gap-4">
        <Link href="/properties">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-tenant-name">
            <User className="w-8 h-8 text-primary" />
            {tenantName}
          </h1>
          <p className="text-muted-foreground">Tenant Profile</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Contact Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <Avatar className="w-24 h-24">
                <AvatarImage src={tenant.profileImageUrl} />
                <AvatarFallback className="text-2xl">
                  {tenant.firstName?.[0] || tenant.email[0].toUpperCase()}
                  {tenant.lastName?.[0] || ""}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <a href={`mailto:${tenant.email}`} className="text-primary hover:underline">
                  {tenant.email}
                </a>
              </div>
              {tenant.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <a href={`tel:${tenant.phone}`} className="text-primary hover:underline">
                    {tenant.phone}
                  </a>
                </div>
              )}
              {tenant.createdAt && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>Joined {formatDate(tenant.createdAt)}</span>
                </div>
              )}
            </div>

            {activeTenancies.length > 0 && (
              <div className="pt-4 border-t">
                <p className="text-sm font-medium mb-2">Current Tenancies</p>
                {activeTenancies.map(tenancy => (
                  <Link key={tenancy.id} href={`/properties/${tenancy.propertyId}`}>
                    <div className="p-2 rounded-md hover-elevate cursor-pointer">
                      <div className="flex items-center gap-2 text-sm">
                        <Home className="w-4 h-4 text-primary" />
                        <span>{tenancy.propertyName}</span>
                      </div>
                      {tenancy.blockName && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground ml-6">
                          <Building2 className="w-3 h-3" />
                          <span>{tenancy.blockName}</span>
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={tabsListScroll}>
              <TabsTrigger value="overview" data-testid="tab-overview" className="shrink-0 gap-1.5">
                <User className="w-4 h-4 shrink-0" />
                <span>Overview</span>
              </TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history" className="shrink-0 gap-1.5">
                <Clock className="w-4 h-4 shrink-0" />
                <span>History</span>
              </TabsTrigger>
              <TabsTrigger value="inspections" data-testid="tab-inspections" className="shrink-0 gap-1.5">
                <ClipboardCheck className="w-4 h-4 shrink-0" />
                <span>Inspections</span>
              </TabsTrigger>
              {maintenanceEnabled && (
              <TabsTrigger value="maintenance" data-testid="tab-maintenance" className="shrink-0 gap-1.5">
                <Wrench className="w-4 h-4 shrink-0" />
                <span>Maintenance</span>
              </TabsTrigger>
              )}
              <TabsTrigger value="disputes" data-testid="tab-disputes" className="shrink-0 gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Disputes</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-primary/10">
                        <Home className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{activeTenancies.length}</p>
                        <p className="text-sm text-muted-foreground">Active Tenancies</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-blue-500/10">
                        <ClipboardCheck className="w-5 h-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{inspections.length}</p>
                        <p className="text-sm text-muted-foreground">Inspections</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-orange-500/10">
                        <Wrench className="w-5 h-5 text-orange-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{maintenanceRequests.filter(m => m.status === "open" || m.status === "in-progress").length}</p>
                        <p className="text-sm text-muted-foreground">Open Requests</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-red-500/10">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{disputes.filter(d => d.status === "disputed").length}</p>
                        <p className="text-sm text-muted-foreground">Active Disputes</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {activeTenancies.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Current Tenancies</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {activeTenancies.map(tenancy => (
                        <div key={tenancy.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-4">
                            <div className="p-2 rounded-md bg-primary/10">
                              <Home className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <Link href={`/properties/${tenancy.propertyId}`}>
                                <p className="font-medium hover:text-primary hover:underline cursor-pointer">
                                  {tenancy.propertyName}
                                </p>
                              </Link>
                              {tenancy.propertyAddress && (
                                <p className="text-sm text-muted-foreground">{tenancy.propertyAddress}</p>
                              )}
                              {tenancy.blockName && (
                                <Link href={`/blocks/${tenancy.blockId}`}>
                                  <p className="text-sm text-primary hover:underline cursor-pointer">
                                    {tenancy.blockName}
                                  </p>
                                </Link>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{formatCurrency(tenancy.monthlyRent)}/month</p>
                            <p className="text-sm text-muted-foreground">
                              {formatDate(tenancy.leaseStartDate)} - {formatDate(tenancy.leaseEndDate)}
                            </p>
                            {getStatusBadge(tenancy.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Tenancy History</CardTitle>
                  <CardDescription>All past and current tenancy assignments</CardDescription>
                </CardHeader>
                <CardContent>
                  {historyLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-16" />
                      <Skeleton className="h-16" />
                    </div>
                  ) : tenancyHistory.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No tenancy history found</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {tenancyHistory.map(tenancy => (
                        <div key={tenancy.id} className="flex items-center justify-between p-4 border rounded-lg hover-elevate">
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-md ${tenancy.isActive ? "bg-primary/10" : "bg-muted"}`}>
                              <Home className={`w-5 h-5 ${tenancy.isActive ? "text-primary" : "text-muted-foreground"}`} />
                            </div>
                            <div>
                              <Link href={`/properties/${tenancy.propertyId}`}>
                                <p className="font-medium hover:text-primary hover:underline cursor-pointer">
                                  {tenancy.propertyName}
                                </p>
                              </Link>
                              {tenancy.propertyAddress && (
                                <p className="text-sm text-muted-foreground">{tenancy.propertyAddress}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm">
                              {formatDate(tenancy.leaseStartDate)} - {tenancy.leaseEndDate ? formatDate(tenancy.leaseEndDate) : "Present"}
                            </p>
                            <p className="text-sm text-muted-foreground">{formatCurrency(tenancy.monthlyRent)}/month</p>
                            {tenancy.isActive ? (
                              <Badge variant="default">Active</Badge>
                            ) : (
                              <Badge variant="outline">Ended</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="inspections" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Inspections</CardTitle>
                  <CardDescription>All inspections for properties associated with this tenant</CardDescription>
                </CardHeader>
                <CardContent>
                  {inspectionsLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-16" />
                      <Skeleton className="h-16" />
                    </div>
                  ) : inspections.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ClipboardCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No inspections found</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {inspections.map(inspection => (
                        <Link key={inspection.id} href={`/inspections/${inspection.id}`}>
                          <div className="flex items-center justify-between p-4 border rounded-lg hover-elevate cursor-pointer">
                            <div className="flex items-center gap-4">
                              <div className="p-2 rounded-md bg-blue-500/10">
                                <ClipboardCheck className="w-5 h-5 text-blue-500" />
                              </div>
                              <div>
                                <p className="font-medium">{inspection.templateName}</p>
                                <p className="text-sm text-muted-foreground">{inspection.propertyName}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-sm">{formatDate(inspection.scheduledDate || inspection.completedAt)}</p>
                                <Badge variant="secondary">{inspection.inspectionType}</Badge>
                              </div>
                              {getStatusBadge(inspection.status)}
                              <ExternalLink className="w-4 h-4 text-muted-foreground" />
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {maintenanceEnabled && (
            <TabsContent value="maintenance" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Maintenance Requests</CardTitle>
                  <CardDescription>All maintenance requests reported by or for this tenant</CardDescription>
                </CardHeader>
                <CardContent>
                  {maintenanceLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-16" />
                      <Skeleton className="h-16" />
                    </div>
                  ) : maintenanceRequests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Wrench className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No maintenance requests found</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {maintenanceRequests.map(request => (
                        <Link key={request.id} href={`/maintenance?requestId=${request.id}`}>
                          <div className="flex items-center justify-between p-4 border rounded-lg hover-elevate cursor-pointer">
                            <div className="flex items-center gap-4">
                              <div className="p-2 rounded-md bg-orange-500/10">
                                <Wrench className="w-5 h-5 text-orange-500" />
                              </div>
                              <div>
                                <p className="font-medium">{request.title}</p>
                                <p className="text-sm text-muted-foreground">{request.propertyName}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-sm">{formatDate(request.createdAt)}</p>
                                {getPriorityBadge(request.priority)}
                              </div>
                              {getStatusBadge(request.status)}
                              <ExternalLink className="w-4 h-4 text-muted-foreground" />
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            )}

            <TabsContent value="disputes" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Disputes</CardTitle>
                  <CardDescription>Comparison report disputes and resolutions</CardDescription>
                </CardHeader>
                <CardContent>
                  {disputesLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-16" />
                      <Skeleton className="h-16" />
                    </div>
                  ) : disputes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No disputes found</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {disputes.map(dispute => (
                        <Link key={dispute.id} href={`/comparison-reports/${dispute.reportId}`}>
                          <div className="flex items-center justify-between p-4 border rounded-lg hover-elevate cursor-pointer">
                            <div className="flex items-center gap-4">
                              <div className="p-2 rounded-md bg-red-500/10">
                                <AlertTriangle className="w-5 h-5 text-red-500" />
                              </div>
                              <div>
                                <p className="font-medium">{dispute.itemRef}</p>
                                <p className="text-sm text-muted-foreground">{dispute.propertyName}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-sm">{formatDate(dispute.createdAt)}</p>
                                <p className="text-sm font-medium">{formatCurrency(dispute.estimatedCost)}</p>
                              </div>
                              {getStatusBadge(dispute.status)}
                              <ExternalLink className="w-4 h-4 text-muted-foreground" />
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
