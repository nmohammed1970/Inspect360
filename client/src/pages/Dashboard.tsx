import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Building2, 
  ClipboardCheck, 
  FileText, 
  CreditCard, 
  AlertTriangle, 
  Search, 
  Settings,
  TrendingUp,
  TrendingDown,
  Users,
  Wrench,
  Package,
  Eye,
  EyeOff,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CalendarClock,
  ShieldAlert,
  Home,
  Timer,
  Activity,
  ChevronRight,
  RefreshCw
} from "lucide-react";
import { Link } from "wouter";
import { TagSearch } from "@/components/TagSearch";
import ComplianceCalendar from "@/components/ComplianceCalendar";
import ComplianceDocumentCalendar from "@/components/ComplianceDocumentCalendar";
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  AreaChart,
  Area,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Property, Block } from "@shared/schema";

interface DashboardStats {
  totals: {
    properties: number;
    blocks: number;
    inspections: number;
    maintenance: number;
    compliance: number;
  };
  alerts: {
    overdueInspections: number;
    overdueInspectionsList: Array<{
      id: string;
      propertyId: string | null;
      blockId: string | null;
      type: string;
      scheduledDate: string;
      daysOverdue: number;
    }>;
    overdueCompliance: number;
    overdueComplianceList: Array<{
      id: string;
      propertyId: string | null;
      blockId: string | null;
      documentType: string;
      expiryDate: string;
      daysOverdue: number;
    }>;
    urgentMaintenance: number;
    urgentMaintenanceList: Array<{
      id: string;
      title: string;
      propertyId: string;
      priority: string;
      dueDate?: string | null;
      daysOverdue?: number;
      createdAt: string;
    }>;
  };
  upcoming: {
    inspectionsDueNext7Days: number;
    inspectionsDueNext30Days: number;
    complianceExpiringNext30Days: number;
    complianceExpiringNext90Days: number;
  };
  kpis: {
    occupancyRate: number;
    complianceRate: number;
    inspectionCompletionRate: number;
    avgMaintenanceResolutionDays: number;
    openMaintenanceCount: number;
    inProgressMaintenanceCount: number;
  };
  risk: {
    propertiesAtRiskCount: number;
    blocksAtRiskCount: number;
    propertiesAtRiskIds: string[];
    blocksAtRiskIds: string[];
  };
  trends: {
    inspections: Array<{ week: string; completed: number }>;
    maintenance: Array<{ week: string; created: number }>;
  };
}

// Widget visibility configuration
type WidgetKey = "kpis" | "alerts" | "trends" | "upcoming" | "risk" | "portfolio" | "inspectionSchedule" | "complianceSchedule";

const defaultWidgets: Record<WidgetKey, boolean> = {
  kpis: true,
  alerts: true,
  trends: true,
  upcoming: true,
  risk: true,
  portfolio: true,
  inspectionSchedule: false,
  complianceSchedule: false,
};

const widgetLabels: Record<WidgetKey, string> = {
  kpis: "KPI Cards",
  alerts: "Action Required Alerts",
  trends: "Activity Trends",
  upcoming: "Upcoming Due Items",
  risk: "Risk Summary",
  portfolio: "Portfolio Overview",
  inspectionSchedule: "Inspection Schedule",
  complianceSchedule: "Compliance Schedule",
};

export default function Dashboard() {
  const { toast } = useToast();
  const { user, isLoading, isAuthenticated } = useAuth();
  const [tagSearchOpen, setTagSearchOpen] = useState(false);
  
  // Filter state
  const [filterBlockId, setFilterBlockId] = useState<string>("");
  const [filterPropertyId, setFilterPropertyId] = useState<string>("");
  
  // Widget visibility state - loaded from localStorage
  const [visibleWidgets, setVisibleWidgets] = useState<Record<WidgetKey, boolean>>(() => {
    try {
      const stored = localStorage.getItem("dashboard_widgets");
      return stored ? JSON.parse(stored) : defaultWidgets;
    } catch {
      return defaultWidgets;
    }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Inspection Schedule widget filter state
  const [inspectionScheduleBlockId, setInspectionScheduleBlockId] = useState<string>("");
  const [inspectionSchedulePropertyId, setInspectionSchedulePropertyId] = useState<string>("");
  
  // Compliance Schedule widget filter state
  const [complianceScheduleBlockId, setComplianceScheduleBlockId] = useState<string>("");
  const [complianceSchedulePropertyId, setComplianceSchedulePropertyId] = useState<string>("");

  // Save widget preferences to localStorage
  useEffect(() => {
    localStorage.setItem("dashboard_widgets", JSON.stringify(visibleWidgets));
  }, [visibleWidgets]);

  const toggleWidget = (key: WidgetKey) => {
    setVisibleWidgets(prev => ({ ...prev, [key]: !prev[key] }));
  };

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
  }, [isAuthenticated, isLoading, toast, user]);

  // Build query parameters for filtered stats
  const statsQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (filterBlockId) params.set("blockId", filterBlockId);
    if (filterPropertyId) params.set("propertyId", filterPropertyId);
    return params.toString();
  }, [filterBlockId, filterPropertyId]);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats", statsQueryParams],
    queryFn: async () => {
      const url = statsQueryParams 
        ? `/api/dashboard/stats?${statsQueryParams}` 
        : "/api/dashboard/stats";
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: isAuthenticated,
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    enabled: isAuthenticated,
  });

  const { data: blocks = [] } = useQuery<Block[]>({
    queryKey: ["/api/blocks"],
    enabled: isAuthenticated,
  });

  const { data: organization } = useQuery<{creditsRemaining: number | null}>({
    queryKey: ["/api/organizations", user?.organizationId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${user?.organizationId}`, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch organization");
      return res.json();
    },
    enabled: isAuthenticated && !!user?.organizationId && user?.role === "owner",
  });

  // Auto-select first block for Inspection Schedule when blocks load
  useEffect(() => {
    if (blocks.length > 0 && !inspectionScheduleBlockId) {
      setInspectionScheduleBlockId(blocks[0].id);
    }
  }, [blocks, inspectionScheduleBlockId]);

  // Auto-select first block for Compliance Schedule when blocks load
  useEffect(() => {
    if (blocks.length > 0 && !complianceScheduleBlockId) {
      setComplianceScheduleBlockId(blocks[0].id);
    }
  }, [blocks, complianceScheduleBlockId]);

  // Inspection Schedule compliance report query
  const inspectionScheduleEntityType = inspectionSchedulePropertyId ? 'property' : (inspectionScheduleBlockId ? 'block' : null);
  const inspectionScheduleEntityId = inspectionSchedulePropertyId || inspectionScheduleBlockId || null;
  
  const { data: inspectionComplianceReport, isLoading: inspectionComplianceLoading } = useQuery({
    queryKey: ["/api/compliance-report", inspectionScheduleEntityType, inspectionScheduleEntityId],
    queryFn: async () => {
      if (!inspectionScheduleEntityType || !inspectionScheduleEntityId) return null;
      // Use the correct API endpoint pattern
      const endpoint = inspectionScheduleEntityType === 'property'
        ? `/api/properties/${inspectionScheduleEntityId}/compliance-report`
        : `/api/blocks/${inspectionScheduleEntityId}/compliance-report`;
      const res = await fetch(endpoint, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated && visibleWidgets.inspectionSchedule && !!inspectionScheduleEntityId,
  });

  // Compliance Schedule documents query
  const complianceScheduleEntityType = complianceSchedulePropertyId ? 'property' : (complianceScheduleBlockId ? 'block' : null);
  const complianceScheduleEntityId = complianceSchedulePropertyId || complianceScheduleBlockId || null;
  
  const { data: complianceDocuments = [], isLoading: complianceDocumentsLoading } = useQuery({
    queryKey: ["/api/compliance-documents", complianceScheduleEntityType, complianceScheduleEntityId],
    queryFn: async () => {
      if (!complianceScheduleEntityType || !complianceScheduleEntityId) return [];
      const endpoint = complianceScheduleEntityType === 'property' 
        ? `/api/properties/${complianceScheduleEntityId}/compliance-documents`
        : `/api/blocks/${complianceScheduleEntityId}/compliance-documents`;
      const res = await fetch(endpoint, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthenticated && visibleWidgets.complianceSchedule && !!complianceScheduleEntityId,
  });

  // Filter properties for schedule widgets based on selected block
  const inspectionScheduleFilteredProperties = useMemo(() => {
    if (!inspectionScheduleBlockId) return properties;
    return properties.filter((p: any) => p.blockId === inspectionScheduleBlockId);
  }, [properties, inspectionScheduleBlockId]);

  const complianceScheduleFilteredProperties = useMemo(() => {
    if (!complianceScheduleBlockId) return properties;
    return properties.filter((p: any) => p.blockId === complianceScheduleBlockId);
  }, [properties, complianceScheduleBlockId]);

  // Create lookup maps for property/block names
  const propertyMap = useMemo(() => {
    const map = new Map<string, string>();
    properties.forEach(p => map.set(p.id, p.name));
    return map;
  }, [properties]);

  const blockMap = useMemo(() => {
    const map = new Map<string, string>();
    blocks.forEach(b => map.set(b.id, b.name));
    return map;
  }, [blocks]);

  // Filter properties based on selected block
  const filteredProperties = useMemo(() => {
    if (!filterBlockId) return properties;
    return properties.filter((p: any) => p.blockId === filterBlockId);
  }, [properties, filterBlockId]);

  // Clear property filter when block changes and property is no longer valid
  useEffect(() => {
    if (filterBlockId && filterPropertyId) {
      const property = properties.find((p: any) => p.id === filterPropertyId);
      if (property && (property as any).blockId !== filterBlockId) {
        setFilterPropertyId("");
      }
    }
  }, [filterBlockId, filterPropertyId, properties]);

  // Check if filters are active
  const hasActiveFilters = filterBlockId || filterPropertyId;

  if (isLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  const creditsRemaining = organization?.creditsRemaining ?? 0;
  const creditsLow = creditsRemaining < 5;

  const totalAlerts = (stats?.alerts.overdueInspections || 0) + 
                      (stats?.alerts.overdueCompliance || 0) + 
                      (stats?.alerts.urgentMaintenance || 0);

  const getKpiColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value >= thresholds.good) return "text-green-600 dark:text-green-400";
    if (value >= thresholds.warning) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getKpiIcon = (value: number, thresholds: { good: number; warning: number }) => {
    if (value >= thresholds.good) return <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />;
    if (value >= thresholds.warning) return <Activity className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
    return <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />;
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      {/* Header Section */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight" data-testid="text-dashboard-title">
              Operations Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, <span className="font-medium text-foreground">{user?.firstName || user?.email}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => refetchStats()}
              data-testid="button-refresh-stats"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button 
              onClick={() => setTagSearchOpen(true)} 
              variant="outline"
              size="sm"
              data-testid="button-search-tags"
            >
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-dashboard-settings">
                  <Settings className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Dashboard Settings</DialogTitle>
                  <DialogDescription>
                    Choose which sections to display on your dashboard
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {(Object.keys(widgetLabels) as WidgetKey[]).map((key) => (
                    <div key={key} className="flex items-center justify-between gap-4 p-2 rounded-lg border">
                      <div className="flex items-center gap-3">
                        {visibleWidgets[key] ? (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium">{widgetLabels[key]}</span>
                      </div>
                      <Checkbox 
                        checked={visibleWidgets[key]}
                        onCheckedChange={() => toggleWidget(key)}
                        data-testid={`checkbox-widget-${key}`}
                      />
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filter Row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Select value={filterBlockId} onValueChange={(val) => setFilterBlockId(val === "__all__" ? "" : val)}>
              <SelectTrigger className="w-[180px]" data-testid="filter-block">
                <SelectValue placeholder="All Blocks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Blocks</SelectItem>
                {blocks.map((block) => (
                  <SelectItem key={block.id} value={block.id}>
                    {block.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Home className="h-4 w-4 text-muted-foreground" />
            <Select value={filterPropertyId} onValueChange={(val) => setFilterPropertyId(val === "__all__" ? "" : val)}>
              <SelectTrigger className="w-[180px]" data-testid="filter-property">
                <SelectValue placeholder="All Properties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Properties</SelectItem>
                {filteredProperties.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                setFilterBlockId("");
                setFilterPropertyId("");
              }}
              data-testid="button-clear-filters"
            >
              <XCircle className="h-4 w-4 mr-1" />
              Clear Filters
            </Button>
          )}
          {hasActiveFilters && (
            <Badge variant="secondary" className="text-xs">
              Filtered View
            </Badge>
          )}
        </div>
      </div>

      {/* Critical Alerts Banner */}
      {totalAlerts > 0 && (
        <Card className="border-destructive/50 bg-destructive/5" data-testid="panel-critical-alerts">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-destructive">
                  {totalAlerts} Critical Alert{totalAlerts !== 1 ? 's' : ''} Require Attention
                </p>
                <p className="text-sm text-muted-foreground">
                  {stats?.alerts.overdueInspections || 0} overdue inspections, {stats?.alerts.overdueCompliance || 0} expired compliance, {stats?.alerts.urgentMaintenance || 0} urgent maintenance
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credits Low Alert */}
      {creditsLow && user?.role === "owner" && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="font-semibold text-yellow-700 dark:text-yellow-400">AI Credits Running Low</p>
                <p className="text-sm text-muted-foreground">{creditsRemaining} credits remaining</p>
              </div>
            </div>
            <Link href="/billing?action=topup">
              <Button size="sm" data-testid="button-purchase-credits">Purchase Credits</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards Row */}
      {visibleWidgets.kpis && (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4" data-testid="panel-kpis">
        <Card data-testid="kpi-occupancy">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Home className="h-4 w-4 text-muted-foreground" />
              {getKpiIcon(stats?.kpis?.occupancyRate ?? 0, { good: 90, warning: 75 })}
            </div>
            <p className={`text-2xl font-bold ${getKpiColor(stats?.kpis?.occupancyRate ?? 0, { good: 90, warning: 75 })}`}>
              {stats?.kpis?.occupancyRate ?? 0}%
            </p>
            <p className="text-xs text-muted-foreground">Occupancy Rate</p>
          </CardContent>
        </Card>

        <Link href="/compliance">
          <Card className="hover-elevate cursor-pointer" data-testid="kpi-compliance">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                {getKpiIcon(stats?.kpis?.complianceRate ?? 0, { good: 50, warning: 50 })}
              </div>
              <p className={`text-2xl font-bold ${getKpiColor(stats?.kpis?.complianceRate ?? 0, { good: 50, warning: 50 })}`}>
                {stats?.kpis?.complianceRate ?? 0}%
              </p>
              <p className="text-xs text-muted-foreground">Compliance Rate</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/inspections">
          <Card className="hover-elevate cursor-pointer" data-testid="kpi-inspection-completion">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                {getKpiIcon(stats?.kpis?.inspectionCompletionRate ?? 0, { good: 90, warning: 70 })}
              </div>
              <p className={`text-2xl font-bold ${getKpiColor(stats?.kpis?.inspectionCompletionRate ?? 0, { good: 90, warning: 70 })}`}>
                {stats?.kpis?.inspectionCompletionRate ?? 0}%
              </p>
              <p className="text-xs text-muted-foreground">Inspection Rate (90d)</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/maintenance">
          <Card className="hover-elevate cursor-pointer" data-testid="kpi-resolution-time">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                {getKpiIcon(10 - (stats?.kpis?.avgMaintenanceResolutionDays ?? 0), { good: 5, warning: 0 })}
              </div>
              <p className="text-2xl font-bold">
                {stats?.kpis?.avgMaintenanceResolutionDays ?? 0}d
              </p>
              <p className="text-xs text-muted-foreground">Avg Resolution Time</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/maintenance?status=open">
          <Card className="hover-elevate cursor-pointer" data-testid="kpi-open-maintenance">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">
                {stats?.kpis?.openMaintenanceCount ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Open Requests</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/maintenance?status=in_progress">
          <Card className="hover-elevate cursor-pointer" data-testid="kpi-in-progress">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">
                {stats?.kpis?.inProgressMaintenanceCount ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </CardContent>
          </Card>
        </Link>
      </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Alerts */}
        <div className="lg:col-span-2 space-y-6">
          {/* Alerts Tabs */}
          {visibleWidgets.alerts && (
          <Card data-testid="panel-alerts-detail">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Action Required
                </CardTitle>
                <Badge variant="destructive" className="text-xs">
                  {totalAlerts} items
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="inspections" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="inspections" className="text-xs md:text-sm" data-testid="tab-overdue-inspections">
                    Inspections ({stats?.alerts?.overdueInspections ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="compliance" className="text-xs md:text-sm" data-testid="tab-overdue-compliance">
                    Compliance ({stats?.alerts?.overdueCompliance ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="maintenance" className="text-xs md:text-sm" data-testid="tab-urgent-maintenance">
                    Maintenance ({stats?.alerts?.urgentMaintenance ?? 0})
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="inspections" className="mt-4">
                  {(stats?.alerts?.overdueInspectionsList?.length ?? 0) === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      <p>No overdue inspections</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(stats?.alerts?.overdueInspectionsList ?? []).map((item) => (
                        <Link key={item.id} href={`/inspections/${item.id}`}>
                          <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer" data-testid={`alert-inspection-${item.id}`}>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                                <ClipboardCheck className="h-4 w-4 text-red-600 dark:text-red-400" />
                              </div>
                              <div>
                                <p className="font-medium text-sm">
                                  {item.propertyId ? propertyMap.get(item.propertyId) || 'Property' : 
                                   item.blockId ? blockMap.get(item.blockId) || 'Block' : 'Unknown'}
                                </p>
                                <p className="text-xs text-muted-foreground">{item.type}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <Badge variant="destructive" className="text-xs">
                                {item.daysOverdue}d overdue
                              </Badge>
                            </div>
                          </div>
                        </Link>
                      ))}
                      {(stats?.alerts?.overdueInspections ?? 0) > 10 && (
                        <Link href="/inspections?status=overdue">
                          <Button variant="ghost" className="w-full text-sm" data-testid="link-view-all-inspections">
                            View all {stats?.alerts?.overdueInspections} overdue inspections
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="compliance" className="mt-4">
                  {(stats?.alerts?.overdueComplianceList?.length ?? 0) === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      <p>No expired compliance documents</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(stats?.alerts?.overdueComplianceList ?? []).map((item) => (
                        <Link key={item.id} href={item.propertyId ? `/properties/${item.propertyId}?tab=compliance` : item.blockId ? `/blocks/${item.blockId}?tab=compliance` : `/compliance`}>
                          <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer" data-testid={`alert-compliance-${item.id}`}>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                                <FileText className="h-4 w-4 text-red-600 dark:text-red-400" />
                              </div>
                              <div>
                                <p className="font-medium text-sm">
                                  {item.propertyId ? propertyMap.get(item.propertyId) || 'Property' : 
                                   item.blockId ? blockMap.get(item.blockId) || 'Block' : 'Unknown'}
                                </p>
                                <p className="text-xs text-muted-foreground">{item.documentType}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <Badge variant="destructive" className="text-xs">
                                {item.daysOverdue}d expired
                              </Badge>
                            </div>
                          </div>
                        </Link>
                      ))}
                      {(stats?.alerts?.overdueCompliance ?? 0) > 10 && (
                        <Link href="/compliance?status=expired">
                          <Button variant="ghost" className="w-full text-sm" data-testid="link-view-all-compliance">
                            View all {stats?.alerts?.overdueCompliance} expired documents
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="maintenance" className="mt-4">
                  {(stats?.alerts?.urgentMaintenanceList?.length ?? 0) === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      <p>No urgent maintenance requests</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(stats?.alerts?.urgentMaintenanceList ?? []).map((item) => (
                        <Link key={item.id} href={`/maintenance/${item.id}`}>
                          <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer" data-testid={`alert-maintenance-${item.id}`}>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
                                <Wrench className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                              </div>
                              <div>
                                <p className="font-medium text-sm truncate max-w-[200px]">{item.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {item.propertyId ? propertyMap.get(item.propertyId) || 'Property' : 'Unknown'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right flex items-center gap-2">
                              {item.daysOverdue && item.daysOverdue > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                  {item.daysOverdue}d overdue
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs border-orange-500 text-orange-600">
                                {item.priority}
                              </Badge>
                            </div>
                          </div>
                        </Link>
                      ))}
                      {(stats?.alerts?.urgentMaintenance ?? 0) > 10 && (
                        <Link href="/maintenance?priority=urgent">
                          <Button variant="ghost" className="w-full text-sm" data-testid="link-view-all-maintenance">
                            View all {stats?.alerts?.urgentMaintenance} urgent requests
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          )}

          {/* Trend Charts */}
          {visibleWidgets.trends && (
          <Card data-testid="panel-trends">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Activity Trends (12 Weeks)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats?.trends?.inspections ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="week" 
                      stroke="hsl(var(--muted-foreground))" 
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      tick={{ fontSize: 10 }}
                      allowDecimals={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '0.5rem',
                        fontSize: '0.75rem'
                      }} 
                    />
                    <Legend 
                      wrapperStyle={{ fontSize: '0.75rem' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="scheduled" 
                      name="Scheduled"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="completed" 
                      name="Completed"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="overdue" 
                      name="Overdue"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          )}
        </div>

        {/* Right Column - Upcoming & Risk */}
        <div className="space-y-6">
          {/* Upcoming Due */}
          {visibleWidgets.upcoming && (
          <Card data-testid="panel-upcoming">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-yellow-600" />
                Upcoming Due
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Link href="/inspections?due=7">
                <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer" data-testid="upcoming-inspections-7d">
                  <div className="flex items-center gap-3">
                    <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Inspections (7 days)</span>
                  </div>
                  <Badge variant="secondary">{stats?.upcoming?.inspectionsDueNext7Days ?? 0}</Badge>
                </div>
              </Link>
              
              <Link href="/inspections?due=30">
                <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer" data-testid="upcoming-inspections-30d">
                  <div className="flex items-center gap-3">
                    <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Inspections (30 days)</span>
                  </div>
                  <Badge variant="secondary">{stats?.upcoming?.inspectionsDueNext30Days ?? 0}</Badge>
                </div>
              </Link>

              <Link href="/compliance?expiring=30">
                <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer" data-testid="upcoming-compliance-30d">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Compliance (30 days)</span>
                  </div>
                  <Badge variant="secondary">{stats?.upcoming?.complianceExpiringNext30Days ?? 0}</Badge>
                </div>
              </Link>

              <Link href="/compliance?expiring=90">
                <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer" data-testid="upcoming-compliance-90d">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Compliance (90 days)</span>
                  </div>
                  <Badge variant="secondary">{stats?.upcoming?.complianceExpiringNext90Days ?? 0}</Badge>
                </div>
              </Link>
            </CardContent>
          </Card>
          )}

          {/* Risk Summary */}
          {visibleWidgets.risk && (
          <Card data-testid="panel-risk">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-600" />
                At Risk
              </CardTitle>
              <CardDescription className="text-xs">
                Properties or blocks with overdue items
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Properties at Risk</span>
                </div>
                <Badge variant={stats?.risk?.propertiesAtRiskCount ? "destructive" : "secondary"}>
                  {stats?.risk?.propertiesAtRiskCount ?? 0}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Blocks at Risk</span>
                </div>
                <Badge variant={stats?.risk?.blocksAtRiskCount ? "destructive" : "secondary"}>
                  {stats?.risk?.blocksAtRiskCount ?? 0}
                </Badge>
              </div>

              {(stats?.risk?.propertiesAtRiskCount ?? 0) > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Properties needing attention:</p>
                  <div className="flex flex-wrap gap-1">
                    {(stats?.risk?.propertiesAtRiskIds ?? []).slice(0, 5).map((id) => (
                      <Link key={id} href={`/properties/${id}`}>
                        <Badge variant="outline" className="text-xs cursor-pointer hover-elevate" data-testid={`risk-property-${id}`}>
                          {propertyMap.get(id) || 'Property'}
                        </Badge>
                      </Link>
                    ))}
                    {(stats?.risk?.propertiesAtRiskIds?.length ?? 0) > 5 && (
                      <Link href="/properties?status=at-risk">
                        <Badge variant="outline" className="text-xs cursor-pointer hover-elevate">
                          +{(stats?.risk?.propertiesAtRiskIds?.length ?? 0) - 5} more
                        </Badge>
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {(stats?.risk?.blocksAtRiskCount ?? 0) > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Blocks needing attention:</p>
                  <div className="flex flex-wrap gap-1">
                    {(stats?.risk?.blocksAtRiskIds ?? []).slice(0, 5).map((id) => (
                      <Link key={id} href={`/blocks/${id}`}>
                        <Badge variant="outline" className="text-xs cursor-pointer hover-elevate" data-testid={`risk-block-${id}`}>
                          {blockMap.get(id) || 'Block'}
                        </Badge>
                      </Link>
                    ))}
                    {(stats?.risk?.blocksAtRiskIds?.length ?? 0) > 5 && (
                      <Link href="/blocks?status=at-risk">
                        <Badge variant="outline" className="text-xs cursor-pointer hover-elevate">
                          +{(stats?.risk?.blocksAtRiskIds?.length ?? 0) - 5} more
                        </Badge>
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* Quick Stats */}
          {visibleWidgets.portfolio && (
          <Card data-testid="panel-portfolio">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Portfolio Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/properties">
                <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer" data-testid="stat-properties">
                  <span className="text-sm text-muted-foreground">Properties</span>
                  <span className="font-semibold">{stats?.totals?.properties ?? 0}</span>
                </div>
              </Link>
              <Link href="/blocks">
                <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer" data-testid="stat-blocks">
                  <span className="text-sm text-muted-foreground">Blocks</span>
                  <span className="font-semibold">{stats?.totals?.blocks ?? 0}</span>
                </div>
              </Link>
              <Link href="/inspections">
                <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer" data-testid="stat-inspections">
                  <span className="text-sm text-muted-foreground">Total Inspections</span>
                  <span className="font-semibold">{stats?.totals?.inspections ?? 0}</span>
                </div>
              </Link>
              <Link href="/compliance">
                <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer" data-testid="stat-compliance">
                  <span className="text-sm text-muted-foreground">Compliance Docs</span>
                  <span className="font-semibold">{stats?.totals?.compliance ?? 0}</span>
                </div>
              </Link>
              <Link href="/maintenance">
                <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer" data-testid="stat-maintenance">
                  <span className="text-sm text-muted-foreground">Maintenance Requests</span>
                  <span className="font-semibold">{stats?.totals?.maintenance ?? 0}</span>
                </div>
              </Link>
            </CardContent>
          </Card>
          )}
        </div>
      </div>

      {/* Inspection Schedule Widget */}
      {visibleWidgets.inspectionSchedule && (
        <Card data-testid="panel-inspection-schedule">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                Inspection Schedule
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={inspectionScheduleBlockId}
                  onValueChange={(value) => {
                    setInspectionScheduleBlockId(value === "all" ? "" : value);
                    setInspectionSchedulePropertyId("");
                  }}
                >
                  <SelectTrigger className="w-[160px]" data-testid="select-inspection-block">
                    <SelectValue placeholder="Select Block" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Blocks</SelectItem>
                    {blocks.map((block: Block) => (
                      <SelectItem key={block.id} value={block.id}>{block.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={inspectionSchedulePropertyId}
                  onValueChange={(value) => setInspectionSchedulePropertyId(value === "all" ? "" : value)}
                >
                  <SelectTrigger className="w-[180px]" data-testid="select-inspection-property">
                    <SelectValue placeholder="Select Property" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Properties</SelectItem>
                    {inspectionScheduleFilteredProperties.map((property: Property) => (
                      <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ComplianceCalendar 
              entityType={inspectionScheduleEntityType as 'property' | 'block' || 'property'}
              entityId={inspectionScheduleEntityId || undefined}
            />
          </CardContent>
        </Card>
      )}

      {/* Compliance Schedule Widget */}
      {visibleWidgets.complianceSchedule && (
        <Card data-testid="panel-compliance-schedule">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Compliance Schedule
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={complianceScheduleBlockId}
                  onValueChange={(value) => {
                    setComplianceScheduleBlockId(value === "all" ? "" : value);
                    setComplianceSchedulePropertyId("");
                  }}
                >
                  <SelectTrigger className="w-[160px]" data-testid="select-compliance-block">
                    <SelectValue placeholder="Select Block" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Blocks</SelectItem>
                    {blocks.map((block: Block) => (
                      <SelectItem key={block.id} value={block.id}>{block.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={complianceSchedulePropertyId}
                  onValueChange={(value) => setComplianceSchedulePropertyId(value === "all" ? "" : value)}
                >
                  <SelectTrigger className="w-[180px]" data-testid="select-compliance-property">
                    <SelectValue placeholder="Select Property" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Properties</SelectItem>
                    {complianceScheduleFilteredProperties.map((property: Property) => (
                      <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ComplianceDocumentCalendar 
              entityType={complianceScheduleEntityType as 'property' | 'block' || 'property'}
              entityId={complianceScheduleEntityId || undefined}
            />
          </CardContent>
        </Card>
      )}

      <TagSearch open={tagSearchOpen} onOpenChange={setTagSearchOpen} />
    </div>
  );
}
