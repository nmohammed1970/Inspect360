import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Building2, 
  ClipboardCheck, 
  FileText, 
  CreditCard, 
  AlertCircle, 
  Search, 
  Settings,
  TrendingUp,
  Users,
  Wrench,
  Package,
  Eye,
  EyeOff
} from "lucide-react";
import { Link } from "wouter";
import { TagSearch } from "@/components/TagSearch";
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Property, Inspection, ComplianceDocument, MaintenanceRequest, Block } from "@shared/schema";

type InspectionWithDetails = Inspection & {
  property?: Property;
  block?: Block;
  clerk?: { firstName: string | null; lastName: string | null };
};

type PanelType = 
  | "stats" 
  | "inspections" 
  | "compliance" 
  | "maintenance" 
  | "assets"
  | "workOrders"
  | "inspectionTrend"
  | "statusDistribution"
  | "credits";

interface PanelConfig {
  id: PanelType;
  title: string;
  icon: any;
  roles: string[];
  description: string;
}

const AVAILABLE_PANELS: PanelConfig[] = [
  { 
    id: "stats", 
    title: "Quick Stats", 
    icon: TrendingUp, 
    roles: ["owner", "clerk", "compliance"],
    description: "Overview of properties, blocks, and inspections"
  },
  { 
    id: "inspections", 
    title: "Recent Inspections", 
    icon: ClipboardCheck, 
    roles: ["owner", "clerk"],
    description: "Latest inspection activities"
  },
  { 
    id: "compliance", 
    title: "Compliance Documents", 
    icon: FileText, 
    roles: ["owner", "compliance"],
    description: "Expiring compliance documents"
  },
  { 
    id: "maintenance", 
    title: "Maintenance Requests", 
    icon: Wrench, 
    roles: ["owner", "clerk"],
    description: "Open maintenance requests"
  },
  { 
    id: "assets", 
    title: "Asset Inventory", 
    icon: Package, 
    roles: ["owner", "clerk"],
    description: "Assets needing attention"
  },
  { 
    id: "workOrders", 
    title: "Work Orders", 
    icon: Users, 
    roles: ["owner", "contractor"],
    description: "Active work orders"
  },
  { 
    id: "inspectionTrend", 
    title: "Inspection Trend", 
    icon: TrendingUp, 
    roles: ["owner", "clerk"],
    description: "Inspection activity over time"
  },
  { 
    id: "statusDistribution", 
    title: "Status Distribution", 
    icon: TrendingUp, 
    roles: ["owner", "clerk", "compliance"],
    description: "Distribution of inspection statuses"
  },
  { 
    id: "credits", 
    title: "AI Credits", 
    icon: CreditCard, 
    roles: ["owner"],
    description: "Credit usage and balance"
  },
];

const COLORS = ['hsl(199, 79%, 63%)', 'hsl(214, 100%, 50%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)'];

export default function Dashboard() {
  const { toast } = useToast();
  const { user, isLoading, isAuthenticated } = useAuth();
  const [tagSearchOpen, setTagSearchOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [viewRole, setViewRole] = useState<string>("");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
    if (user && !viewRole) {
      setViewRole(user.role);
    }
  }, [isAuthenticated, isLoading, toast, user, viewRole]);

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    enabled: isAuthenticated,
  });

  const { data: inspections = [] } = useQuery<InspectionWithDetails[]>({
    queryKey: ["/api/inspections/my"],
    enabled: isAuthenticated,
  });

  const { data: blocks = [] } = useQuery<Block[]>({
    queryKey: ["/api/blocks"],
    enabled: isAuthenticated,
  });

  const { data: compliance = [] } = useQuery<ComplianceDocument[]>({
    queryKey: ["/api/compliance/expiring", { days: 90 }],
    enabled: isAuthenticated && (user?.role === "owner" || user?.role === "compliance"),
  });

  const { data: maintenance = [] } = useQuery<MaintenanceRequest[]>({
    queryKey: ["/api/maintenance"],
    enabled: isAuthenticated && (user?.role === "owner" || user?.role === "clerk"),
  });

  const { data: assets = [] } = useQuery<any[]>({
    queryKey: ["/api/asset-inventory"],
    enabled: isAuthenticated && (user?.role === "owner" || user?.role === "clerk"),
  });

  const { data: workOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/work-orders"],
    enabled: isAuthenticated,
  });

  const { data: organization } = useQuery<{creditsRemaining: number | null}>({
    queryKey: ["/api/organizations", user?.organizationId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${user?.organizationId}`);
      if (!res.ok) throw new Error("Failed to fetch organization");
      return res.json();
    },
    enabled: isAuthenticated && !!user?.organizationId && user?.role === "owner",
  });

  const { data: preferences } = useQuery<{ enabledPanels: string[] }>({
    queryKey: ["/api/dashboard/preferences"],
    enabled: isAuthenticated,
  });

  const updatePreferences = useMutation({
    mutationFn: async (enabledPanels: string[]) => {
      return await apiRequest("PUT", "/api/dashboard/preferences", { enabledPanels });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/preferences"] });
      toast({
        title: "Success",
        description: "Dashboard preferences updated",
      });
    },
  });

  const enabledPanels = useMemo(() => {
    if (preferences?.enabledPanels) {
      if (typeof preferences.enabledPanels === "string") {
        return JSON.parse(preferences.enabledPanels as any);
      }
      return preferences.enabledPanels;
    }
    return ["stats", "inspections", "compliance", "maintenance"];
  }, [preferences]);

  const availablePanelsForRole = useMemo(() => {
    return AVAILABLE_PANELS.filter(panel => panel.roles.includes(viewRole));
  }, [viewRole]);

  const togglePanel = (panelId: PanelType) => {
    const newPanels = enabledPanels.includes(panelId)
      ? enabledPanels.filter((p: string) => p !== panelId)
      : [...enabledPanels, panelId];
    updatePreferences.mutate(newPanels);
  };

  const inspectionTrendData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return date.toISOString().split('T')[0];
    });

    return last7Days.map(date => {
      const count = inspections.filter(i => 
        i.createdAt && new Date(i.createdAt).toISOString().split('T')[0] === date
      ).length;
      return {
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count
      };
    });
  }, [inspections]);

  const statusDistributionData = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    inspections.forEach(i => {
      statusCounts[i.status] = (statusCounts[i.status] || 0) + 1;
    });
    return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  }, [inspections]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const creditsRemaining = organization?.creditsRemaining ?? 0;
  const creditsLow = creditsRemaining < 5;

  const shouldShowPanel = (panelId: PanelType) => {
    const panel = AVAILABLE_PANELS.find(p => p.id === panelId);
    return panel && panel.roles.includes(viewRole) && enabledPanels.includes(panelId);
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 xl:p-12 space-y-6 md:space-y-8">
      {/* Header Section */}
      <div className="flex flex-col gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-foreground" data-testid="text-dashboard-title">
            Dashboard
          </h1>
          <p className="text-sm md:text-base lg:text-lg text-muted-foreground">
            Welcome back, <span className="font-medium text-foreground">{user?.firstName || user?.email}</span>
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          {user?.role === "owner" && (
            <Select value={viewRole} onValueChange={setViewRole}>
              <SelectTrigger className="w-full sm:w-48" data-testid="select-view-role">
                <SelectValue placeholder="View as..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner" data-testid="option-owner">Owner View</SelectItem>
                <SelectItem value="clerk" data-testid="option-clerk">Clerk View</SelectItem>
                <SelectItem value="compliance" data-testid="option-compliance">Compliance View</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="flex gap-2 sm:gap-3">
            <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 flex-1 sm:flex-initial" data-testid="button-configure-panels">
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">Configure</span>
                  <span className="sm:hidden">Config</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Configure Dashboard Panels</DialogTitle>
                  <DialogDescription>
                    Select which panels you want to see on your dashboard
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {availablePanelsForRole.map((panel) => {
                    const Icon = panel.icon;
                    const isEnabled = enabledPanels.includes(panel.id);
                    return (
                      <div 
                        key={panel.id} 
                        className="flex items-start gap-4 p-4 border rounded-xl hover-elevate cursor-pointer"
                        onClick={() => togglePanel(panel.id)}
                        data-testid={`panel-config-${panel.id}`}
                      >
                        <Checkbox 
                          checked={isEnabled} 
                          onCheckedChange={() => togglePanel(panel.id)}
                          data-testid={`checkbox-panel-${panel.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className="h-4 w-4 text-primary" />
                            <span className="font-semibold">{panel.title}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{panel.description}</p>
                        </div>
                        {isEnabled ? (
                          <Eye className="h-5 w-5 text-primary" />
                        ) : (
                          <EyeOff className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </DialogContent>
            </Dialog>
            <Button 
              onClick={() => setTagSearchOpen(true)} 
              variant="outline"
              className="gap-2 flex-1 sm:flex-initial"
              data-testid="button-search-tags"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search by Tags</span>
              <span className="sm:hidden">Search</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Credits Low Alert */}
      {creditsLow && user?.role === "owner" && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col gap-4 p-4 md:p-6">
            <div className="flex items-start gap-3 md:gap-4">
              <div className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 md:w-6 md:h-6 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base md:text-lg">Inspection credits low</p>
                <p className="text-xs md:text-sm text-muted-foreground mt-1">
                  You have {creditsRemaining} credits remaining. Purchase more to avoid blocking submissions.
                </p>
              </div>
            </div>
            <Link href="/credits" className="w-full sm:w-auto sm:self-end">
              <Button variant="default" className="w-full sm:w-auto" data-testid="button-purchase-credits">
                Purchase Credits
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
        {/* Quick Stats Panel */}
        {shouldShowPanel("stats") && (
          <Card className="xl:col-span-3" data-testid="panel-stats">
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                Quick Stats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <Link href="/properties">
                  <div className="p-4 md:p-6 bg-card/50 rounded-xl border hover-elevate cursor-pointer transition-all" data-testid="stat-properties">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Building2 className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                      </div>
                    </div>
                    <p className="text-2xl md:text-3xl font-bold">{properties.length}</p>
                    <p className="text-xs md:text-sm text-muted-foreground mt-1">Properties</p>
                  </div>
                </Link>
                <Link href="/blocks">
                  <div className="p-4 md:p-6 bg-card/50 rounded-xl border hover-elevate cursor-pointer transition-all" data-testid="stat-blocks">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Building2 className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                      </div>
                    </div>
                    <p className="text-2xl md:text-3xl font-bold">{blocks.length}</p>
                    <p className="text-xs md:text-sm text-muted-foreground mt-1">Blocks</p>
                  </div>
                </Link>
                <Link href="/inspections">
                  <div className="p-4 md:p-6 bg-card/50 rounded-xl border hover-elevate cursor-pointer transition-all" data-testid="stat-inspections">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <ClipboardCheck className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                      </div>
                    </div>
                    <p className="text-2xl md:text-3xl font-bold">{inspections.length}</p>
                    <p className="text-xs md:text-sm text-muted-foreground mt-1">Inspections</p>
                  </div>
                </Link>
                {viewRole === "owner" && (
                  <Link href="/credits">
                    <div className="p-4 md:p-6 bg-card/50 rounded-xl border hover-elevate cursor-pointer transition-all" data-testid="stat-credits">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <CreditCard className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                        </div>
                      </div>
                      <p className="text-2xl md:text-3xl font-bold">{creditsRemaining}</p>
                      <p className="text-xs md:text-sm text-muted-foreground mt-1">AI Credits</p>
                    </div>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Inspection Trend Chart */}
        {shouldShowPanel("inspectionTrend") && (
          <Card className="lg:col-span-2" data-testid="panel-inspection-trend">
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-xl md:text-2xl font-bold">Inspection Activity (Last 7 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250} className="md:h-[300px]">
                <LineChart data={inspectionTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))" 
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.75rem',
                      fontSize: '0.875rem'
                    }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="count" 
                    stroke="hsl(199, 79%, 63%)" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(199, 79%, 63%)', r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Status Distribution Chart */}
        {shouldShowPanel("statusDistribution") && (
          <Card data-testid="panel-status-distribution">
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-xl md:text-2xl font-bold">Inspection Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250} className="md:h-[300px]">
                <PieChart>
                  <Pie
                    data={statusDistributionData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={window.innerWidth < 768 ? 70 : 80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.75rem',
                      fontSize: '0.875rem'
                    }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Recent Inspections */}
        {shouldShowPanel("inspections") && (
          <Card className="lg:col-span-2" data-testid="panel-inspections">
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                Recent Inspections
              </CardTitle>
            </CardHeader>
            <CardContent>
              {inspections.length > 0 ? (
                <div className="space-y-2 md:space-y-3">
                  {inspections.slice(0, 5).map((inspection) => (
                    <Link key={inspection.id} href={`/inspections/${inspection.id}`}>
                      <div
                        className="flex items-center justify-between gap-3 md:gap-4 p-4 md:p-5 border rounded-xl hover-elevate cursor-pointer transition-all bg-card/50"
                        data-testid={`card-inspection-${inspection.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-base md:text-lg truncate">
                            {inspection.property?.name || inspection.block?.name || "Unknown Property"}
                          </p>
                          <p className="text-xs md:text-sm text-muted-foreground truncate mt-1">
                            {inspection.type} • {inspection.scheduledDate ? new Date(inspection.scheduledDate).toLocaleDateString() : 'Not scheduled'}
                          </p>
                        </div>
                        <Badge
                          variant={
                            inspection.status === "completed"
                              ? "default"
                              : inspection.status === "in_progress"
                              ? "secondary"
                              : "outline"
                          }
                          className="whitespace-nowrap text-xs"
                          data-testid={`badge-status-${inspection.id}`}
                        >
                          {inspection.status}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 md:py-12" data-testid="empty-inspections">
                  <ClipboardCheck className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground/30 mx-auto mb-3 md:mb-4" />
                  <p className="text-sm md:text-base text-muted-foreground">No inspections yet</p>
                  <Link href="/inspections">
                    <Button variant="outline" size="sm" className="mt-3 md:mt-4">
                      Create Inspection
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Compliance Documents */}
        {shouldShowPanel("compliance") && (
          <Card data-testid="panel-compliance">
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                Expiring Soon
              </CardTitle>
            </CardHeader>
            <CardContent>
              {compliance.length > 0 ? (
                <div className="space-y-2 md:space-y-3">
                  {compliance.slice(0, 5).map((doc) => (
                    <Link key={doc.id} href="/compliance">
                      <div
                        className="flex items-center justify-between gap-3 md:gap-4 p-4 md:p-5 border rounded-xl hover-elevate cursor-pointer transition-all bg-card/50"
                        data-testid={`card-compliance-${doc.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-base md:text-lg truncate">{doc.documentType}</p>
                          <p className="text-xs md:text-sm text-muted-foreground truncate mt-1">
                            Expires: {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : 'No expiry date'}
                          </p>
                        </div>
                        <Badge
                          variant={
                            doc.status === "current"
                              ? "default"
                              : doc.status === "expiring_soon"
                              ? "secondary"
                              : "destructive"
                          }
                          className="whitespace-nowrap text-xs"
                          data-testid={`badge-status-${doc.id}`}
                        >
                          {doc.status}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 md:py-12" data-testid="empty-compliance">
                  <FileText className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground/30 mx-auto mb-3 md:mb-4" />
                  <p className="text-sm md:text-base text-muted-foreground">No compliance documents yet</p>
                  <Link href="/compliance">
                    <Button variant="outline" size="sm" className="mt-3 md:mt-4">
                      Add Document
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Maintenance Requests */}
        {shouldShowPanel("maintenance") && (
          <Card data-testid="panel-maintenance">
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <Wrench className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                Maintenance Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              {maintenance.length > 0 ? (
                <div className="space-y-2 md:space-y-3">
                  {maintenance.slice(0, 5).map((request) => (
                    <Link key={request.id} href="/maintenance">
                      <div
                        className="flex items-center justify-between gap-3 md:gap-4 p-4 md:p-5 border rounded-xl hover-elevate cursor-pointer transition-all bg-card/50"
                        data-testid={`card-maintenance-${request.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-base md:text-lg truncate">{request.title}</p>
                          <p className="text-xs md:text-sm text-muted-foreground truncate mt-1">
                            Priority: <span className="font-medium">{request.priority}</span>
                          </p>
                        </div>
                        <Badge
                          variant={
                            request.status === "completed"
                              ? "default"
                              : request.status === "in_progress"
                              ? "secondary"
                              : "outline"
                          }
                          className="whitespace-nowrap text-xs"
                          data-testid={`badge-status-${request.id}`}
                        >
                          {request.status}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 md:py-12" data-testid="empty-maintenance">
                  <Wrench className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground/30 mx-auto mb-3 md:mb-4" />
                  <p className="text-sm md:text-base text-muted-foreground">No maintenance requests</p>
                  <Link href="/maintenance">
                    <Button variant="outline" size="sm" className="mt-3 md:mt-4">
                      Create Request
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Asset Inventory */}
        {shouldShowPanel("assets") && (
          <Card data-testid="panel-assets">
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <Package className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                Assets Needing Attention
              </CardTitle>
            </CardHeader>
            <CardContent>
              {assets.length > 0 ? (
                <div className="space-y-2 md:space-y-3">
                  {assets.filter(a => a.condition === "poor" || a.condition === "needs_replacement").slice(0, 5).map((asset) => (
                    <Link key={asset.id} href="/inventory">
                      <div
                        className="flex items-center justify-between gap-3 md:gap-4 p-4 md:p-5 border rounded-xl hover-elevate cursor-pointer transition-all bg-card/50"
                        data-testid={`card-asset-${asset.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-base md:text-lg truncate">{asset.name}</p>
                          <p className="text-xs md:text-sm text-muted-foreground truncate mt-1">
                            {asset.category}
                          </p>
                        </div>
                        <Badge
                          variant={asset.condition === "needs_replacement" ? "destructive" : "secondary"}
                          className="whitespace-nowrap text-xs"
                          data-testid={`badge-condition-${asset.id}`}
                        >
                          {asset.condition}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 md:py-12" data-testid="empty-assets">
                  <Package className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground/30 mx-auto mb-3 md:mb-4" />
                  <p className="text-sm md:text-base text-muted-foreground">No assets tracked yet</p>
                  <Link href="/inventory">
                    <Button variant="outline" size="sm" className="mt-3 md:mt-4">
                      Add Asset
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Work Orders */}
        {shouldShowPanel("workOrders") && (
          <Card data-testid="panel-work-orders">
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <Users className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                Active Work Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              {workOrders.length > 0 ? (
                <div className="space-y-2 md:space-y-3">
                  {workOrders.filter(wo => wo.status !== "completed").slice(0, 5).map((workOrder) => (
                    <Link key={workOrder.id} href="/work-orders">
                      <div
                        className="flex items-center justify-between gap-3 md:gap-4 p-4 md:p-5 border rounded-xl hover-elevate cursor-pointer transition-all bg-card/50"
                        data-testid={`card-work-order-${workOrder.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-base md:text-lg truncate">{workOrder.title}</p>
                          <p className="text-xs md:text-sm text-muted-foreground truncate mt-1">
                            {workOrder.description}
                          </p>
                        </div>
                        <Badge
                          variant={
                            workOrder.status === "completed"
                              ? "default"
                              : workOrder.status === "in_progress"
                              ? "secondary"
                              : "outline"
                          }
                          className="whitespace-nowrap text-xs"
                          data-testid={`badge-status-${workOrder.id}`}
                        >
                          {workOrder.status}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 md:py-12" data-testid="empty-work-orders">
                  <Users className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground/30 mx-auto mb-3 md:mb-4" />
                  <p className="text-sm md:text-base text-muted-foreground">No active work orders</p>
                  <Link href="/work-orders">
                    <Button variant="outline" size="sm" className="mt-3 md:mt-4">
                      Create Work Order
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tag Search Dialog */}
      <TagSearch open={tagSearchOpen} onOpenChange={setTagSearchOpen} />
    </div>
  );
}
