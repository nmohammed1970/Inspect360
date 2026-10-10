import { useState, useEffect } from "react";
import { useModules } from "@/hooks/use-modules";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, Users, AlertCircle, Clock, Calendar, User, CheckCircle2, Edit, Trash2, ChevronRight, ChevronLeft, Filter, Wrench, ArrowUpDown, Pause, Play, X } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { formatDistanceToNow, format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/contexts/LocaleContext";
import { LocaleDateInput } from "@/components/LocaleDateInput";
import { WorkOrderCertificatePanel } from "@/components/WorkOrderCertificatePanel";
import { cn } from "@/lib/utils";
import { pagePad, dialogContentBase, formGrid2, dialogFooterSticky } from "@/lib/responsive";
import { FiltersSection } from "@/components/FiltersSection";

interface WorkOrderAnalytics {
  total: number;
  statusDistribution: { [key: string]: number };
  priorityDistribution: { [key: string]: number };
  teamDistribution: { [key: string]: { name: string; count: number } };
  categoryDistribution: { [key: string]: number };
  averageResolutionTimeMinutes: number;
}

interface WorkOrder {
  id: string;
  status: string;
  slaDue?: string | null;
  costEstimate?: number | null;
  costActual?: number | null;
  createdAt: string;
  updatedAt?: string;
  notes?: string | null;
  teamId?: string | null;
  assignedToId?: string | null;
  maintenanceRequest: {
    id: string;
    title: string;
    description?: string;
    priority: string;
    propertyId?: string | null;
    blockId?: string | null;
  };
  contractor?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email: string;
  } | null;
  team?: {
    id?: string;
    name?: string;
    email?: string;
  } | null;
}

interface TeamMember {
  id: string;
  userId?: string | null;
  contactId?: string | null;
  user?: { firstName?: string; lastName?: string; email?: string } | null;
  contact?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    linkedUserId?: string | null;
  } | null;
}

interface WorkLog {
  id: string;
  workOrderId: string;
  note: string;
  photos?: string[] | null;
  timeSpentMinutes?: number | null;
  createdAt: string;
}

interface Team {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

const statusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  assigned: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  scheduled: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  waiting_parts: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  medium: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  urgent: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const statusCategories = {
  open: ["assigned"],
  waiting: ["waiting_parts"],
  in_progress: ["in_progress"],
  completed: ["completed", "rejected"],
};

/** Primary status written when a card is dropped onto a column */
const columnDropStatus: Record<keyof typeof statusCategories, string> = {
  open: "assigned",
  waiting: "waiting_parts",
  in_progress: "in_progress",
  completed: "completed",
};

export default function Analytics() {
  const { isModuleEnabled, isLoading: isLoadingModules } = useModules();
  const isMaintenanceEnabled = isModuleEnabled("maintenance");
  // Work orders are part of the maintenance module
  const isWorkOrdersEnabled = isMaintenanceEnabled;
  const { user } = useAuth();
  const { toast } = useToast();
  const locale = useLocale();

  // Refetch module data when component mounts to ensure we have the latest status
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/marketplace/my-modules"] });
  }, []);
  
  const [selectedTeamId, setSelectedTeamId] = useState<string>("all");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [workOrderToDelete, setWorkOrderToDelete] = useState<WorkOrder | null>(null);
  const [draggingWorkOrderId, setDraggingWorkOrderId] = useState<string | null>(null);
  const [dropTargetColumn, setDropTargetColumn] = useState<keyof typeof statusCategories | null>(null);
  const [editFormData, setEditFormData] = useState({
    status: "",
    priority: "",
    costEstimate: "",
    slaDue: "",
    notes: "",
    teamId: "",
    assignedToId: "",
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<WorkOrderAnalytics>({
    queryKey: ["/api/analytics/work-orders"],
  });

  const { data: workOrders = [], isLoading: workOrdersLoading } = useQuery<WorkOrder[]>({
    queryKey: ["/api/work-orders"],
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const editTeamId =
    editFormData.teamId && editFormData.teamId !== "unassigned" ? editFormData.teamId : "";

  const { data: editTeamMembers = [], isFetching: isLoadingEditMembers } = useQuery<TeamMember[]>({
    queryKey: ["/api/teams", editTeamId, "members"],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${editTeamId}/members`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load team members");
      return res.json();
    },
    enabled: editDialogOpen && !!editTeamId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/work-orders/${id}/status`, { status });
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/work-orders"] });
      const previous = queryClient.getQueryData<WorkOrder[]>(["/api/work-orders"]);
      queryClient.setQueryData<WorkOrder[]>(["/api/work-orders"], (prev) =>
        prev?.map((wo) => (wo.id === id ? { ...wo, status } : wo)),
      );
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/work-orders"] });
      toast({ title: "Status updated successfully" });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/work-orders"], context.previous);
      }
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const handleBoardDrop = (columnKey: keyof typeof statusCategories, workOrderId: string) => {
    const workOrder = workOrders.find((wo) => wo.id === workOrderId);
    if (!workOrder) return;
    if (statusCategories[columnKey].includes(workOrder.status)) return;
    const nextStatus = columnDropStatus[columnKey];
    if (workOrder.status === nextStatus) return;
    updateStatusMutation.mutate({ id: workOrderId, status: nextStatus });
  };

  const deleteWorkOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/work-orders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/work-orders"] });
      setWorkOrderToDelete(null);
      toast({ title: "Work order deleted" });
    },
    onError: (e: any) => {
      toast({
        title: "Failed to delete work order",
        description: e?.message,
        variant: "destructive",
      });
    },
  });

  const updateWorkOrderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/work-orders/${id}`, data);
      return res.json();
    },
    onSuccess: (updated: WorkOrder & { assignedToId?: string | null }) => {
      queryClient.setQueryData<WorkOrder[]>(["/api/work-orders"], (prev) => {
        if (!prev) return prev;
        return prev.map((wo) =>
          wo.id === updated.id
            ? {
                ...wo,
                ...updated,
                assignedToId: updated.assignedToId ?? null,
                teamId: updated.teamId ?? wo.teamId,
                status: updated.status ?? wo.status,
                costEstimate: updated.costEstimate ?? wo.costEstimate,
                slaDue: updated.slaDue ?? wo.slaDue,
              }
            : wo,
        );
      });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/work-orders"] });
      setEditDialogOpen(false);
      setSelectedWorkOrder(null);
      toast({ title: "Work order updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update work order", variant: "destructive" });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "in_progress":
        return <Play className="h-4 w-4 text-yellow-600" />;
      case "waiting_parts":
      case "scheduled":
        return <Pause className="h-4 w-4 text-orange-600" />;
      case "rejected":
        return <X className="h-4 w-4 text-red-600" />;
      case "assigned":
        return <User className="h-4 w-4 text-blue-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case "high":
        return <ArrowUpDown className="h-4 w-4 text-orange-600" />;
      default:
        return null;
    }
  };

  const openEditDialog = (workOrder: WorkOrder) => {
    setSelectedWorkOrder(workOrder);
    setEditFormData({
      status: workOrder.status,
      priority: workOrder.maintenanceRequest.priority,
      costEstimate: workOrder.costEstimate != null ? String(Number(workOrder.costEstimate) / 100) : "",
      slaDue: workOrder.slaDue ? format(new Date(workOrder.slaDue), "yyyy-MM-dd") : "",
      notes: workOrder.notes || "",
      teamId: workOrder.teamId || workOrder.team?.id || "unassigned",
      // Prefer explicit assignee; fall back to contractor contact id for older rows
      assignedToId: workOrder.assignedToId || workOrder.contractor?.id || "",
    });
    setEditDialogOpen(true);

    // Re-hydrate from single-record endpoint so assignedToId is never missing from list joins
    void (async () => {
      try {
        const res = await fetch(`/api/work-orders/${workOrder.id}`, { credentials: "include" });
        if (!res.ok) return;
        const fresh = await res.json();
        setSelectedWorkOrder((prev) => (prev ? { ...prev, ...fresh } : fresh));
        setEditFormData((prev) => ({
          ...prev,
          status: fresh.status ?? prev.status,
          teamId: fresh.teamId || prev.teamId || "unassigned",
          assignedToId: fresh.assignedToId || fresh.contractorId || prev.assignedToId || "",
          costEstimate:
            fresh.costEstimate != null
              ? String(Number(fresh.costEstimate) / 100)
              : prev.costEstimate,
          slaDue: fresh.slaDue ? format(new Date(fresh.slaDue), "yyyy-MM-dd") : prev.slaDue,
        }));
      } catch {
        // Keep list-hydrated form values
      }
    })();
  };

  const handleSaveWorkOrder = () => {
    if (!selectedWorkOrder) return;

    const teamId = editFormData.teamId === "unassigned" ? null : (editFormData.teamId || null);

    if (teamId && !editFormData.assignedToId) {
      toast({
        title: "Select a team member",
        description: "Choose an inspector or maintenance contractor from the selected team.",
        variant: "destructive",
      });
      return;
    }

    const selectedId = teamId && editFormData.assignedToId ? editFormData.assignedToId : null;
    const member = selectedId
      ? editTeamMembers.find(
          (m) => m.userId === selectedId || m.contactId === selectedId,
        )
      : undefined;
    // Prefer linked user account when a contact is selected so clerk portals match
    const assignedToId = selectedId
      ? member?.userId || member?.contact?.linkedUserId || selectedId
      : null;
    const contractorId = selectedId ? member?.contactId || null : null;
    const costParsed = editFormData.costEstimate ? parseFloat(editFormData.costEstimate) : NaN;

    updateWorkOrderMutation.mutate({
      id: selectedWorkOrder.id,
      data: {
        status: editFormData.status,
        // Store cents (same unit as create); UI edits major currency units
        costEstimate: Number.isFinite(costParsed) ? Math.round(costParsed * 100) : null,
        slaDue: editFormData.slaDue || null,
        notes: editFormData.notes || null,
        teamId,
        assignedToId,
        contractorId,
      },
    });
  };

  // Query for work logs when a work order is selected
  const { data: workLogs = [], isError: workLogsError } = useQuery<WorkLog[]>({
    queryKey: [`/api/work-orders/${selectedWorkOrder?.id}/logs`],
    enabled: !!selectedWorkOrder?.id && editDialogOpen,
  });

  const filteredWorkOrders = selectedTeamId === "all"
    ? workOrders
    : workOrders.filter(wo => wo.team?.id === selectedTeamId);

  const getWorkOrdersByStatusCategory = (category: keyof typeof statusCategories) => {
    const statuses = statusCategories[category];
    return filteredWorkOrders.filter(wo => statuses.includes(wo.status));
  };

  const getTeamWorkOrderCount = (teamId: string) => {
    if (teamId === "all") return workOrders.length;
    return workOrders.filter(wo => wo.team?.id === teamId).length;
  };

  if (!isLoadingModules && !isWorkOrdersEnabled) {
    return (
      <div className={cn("container mx-auto min-w-0 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4", pagePad)}>
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <Wrench className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Maintenance Module Required</h1>
          <p className="text-muted-foreground max-w-md">
            Maintenance & Work Orders features are not enabled for your organization.
            <br />
            Please contact your administrator to activate this module.
          </p>
        </div>
        <Button variant="default" onClick={() => window.location.href = "/billing"}>
          View Modules
        </Button>
      </div>
    );
  }

  if (analyticsLoading) {
    return (
      <div className={cn("container mx-auto min-w-0", pagePad)}>
        <div className="space-y-4">
          <div className="h-8 bg-muted rounded animate-pulse" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="space-y-2">
                  <div className="h-4 bg-muted rounded animate-pulse" />
                  <div className="h-8 bg-muted rounded animate-pulse" />
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className={cn("container mx-auto min-w-0", pagePad)}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">No analytics data available</p>
        </div>
      </div>
    );
  }

  const openCount = getWorkOrdersByStatusCategory("open").length;
  const waitingCount = getWorkOrdersByStatusCategory("waiting").length;
  const inProgressCount = getWorkOrdersByStatusCategory("in_progress").length;
  const completedCount = getWorkOrdersByStatusCategory("completed").length;

  const boardColumns = [
    {
      key: "open" as const,
      title: "Open / Assigned",
      empty: "No open work orders",
      count: openCount,
      accent: "bg-blue-500",
      headerBg: "bg-blue-50 dark:bg-blue-950/40",
      bodyBg: "bg-blue-50/40 dark:bg-blue-950/20",
      border: "border-blue-200 dark:border-blue-900",
    },
    {
      key: "waiting" as const,
      title: "Waiting Parts",
      empty: "No work orders waiting",
      count: waitingCount,
      accent: "bg-orange-500",
      headerBg: "bg-orange-50 dark:bg-orange-950/40",
      bodyBg: "bg-orange-50/40 dark:bg-orange-950/20",
      border: "border-orange-200 dark:border-orange-900",
    },
    {
      key: "in_progress" as const,
      title: "In Progress",
      empty: "No work in progress",
      count: inProgressCount,
      accent: "bg-amber-500",
      headerBg: "bg-amber-50 dark:bg-amber-950/40",
      bodyBg: "bg-amber-50/40 dark:bg-amber-950/20",
      border: "border-amber-200 dark:border-amber-900",
    },
    {
      key: "completed" as const,
      title: "Completed",
      empty: "No completed work orders",
      count: completedCount,
      accent: "bg-emerald-500",
      headerBg: "bg-emerald-50 dark:bg-emerald-950/40",
      bodyBg: "bg-emerald-50/40 dark:bg-emerald-950/20",
      border: "border-emerald-200 dark:border-emerald-900",
      compact: true,
      limit: 5,
    },
  ];

  return (
    <div className={cn("container mx-auto min-w-0 space-y-6 md:space-y-8", pagePad)}>
      {/* Page header + compact team filter */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight" data-testid="heading-analytics">
            Work Orders
          </h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Track assignments, status, and performance across maintenance teams
          </p>
        </div>
        <FiltersSection
          headingId="wo-team-filters-heading"
          title="Filter by team"
          className="min-w-0 max-w-full lg:max-w-xl lg:flex-1"
        >
          <ScrollArea className="w-full whitespace-nowrap" data-testid="card-team-navigation">
            <div className="flex gap-2 pb-1">
              <Button
                variant={selectedTeamId === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTeamId("all")}
                className="flex-shrink-0 h-8"
                data-testid="button-team-all"
              >
                All Teams
                <Badge
                  variant={selectedTeamId === "all" ? "secondary" : "outline"}
                  className="ml-2"
                >
                  {getTeamWorkOrderCount("all")}
                </Badge>
              </Button>
              {teams.filter((t) => t.isActive).map((team) => (
                <Button
                  key={team.id}
                  variant={selectedTeamId === team.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedTeamId(team.id)}
                  className="flex-shrink-0 h-8"
                  data-testid={`button-team-${team.id}`}
                >
                  {team.name}
                  <Badge
                    variant={selectedTeamId === team.id ? "secondary" : "outline"}
                    className="ml-2"
                  >
                    {getTeamWorkOrderCount(team.id)}
                  </Badge>
                </Button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </FiltersSection>
      </div>

      {/* Summary strip */}
      <section className="space-y-3" aria-labelledby="wo-summary-heading">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 id="wo-summary-heading" className="text-sm font-semibold tracking-tight">
            Summary
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <Card data-testid="card-total-work-orders" className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold tabular-nums mt-1" data-testid="text-total-count">
                    {filteredWorkOrders.length}
                  </p>
                </div>
                <div className="rounded-lg bg-muted p-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                {selectedTeamId !== "all" ? "Selected team" : "All teams"}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-open-work-orders" className="shadow-sm border-t-4 border-t-blue-500">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Open</p>
                  <p className="text-2xl font-bold tabular-nums mt-1 text-blue-700 dark:text-blue-300" data-testid="text-open-count">
                    {openCount}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/50 p-2">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Assigned</p>
            </CardContent>
          </Card>

          <Card data-testid="card-waiting-work-orders" className="shadow-sm border-t-4 border-t-orange-500">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Waiting</p>
                  <p className="text-2xl font-bold tabular-nums mt-1 text-orange-700 dark:text-orange-300" data-testid="text-waiting-count">
                    {waitingCount}
                  </p>
                </div>
                <div className="rounded-lg bg-orange-50 dark:bg-orange-950/50 p-2">
                  <Pause className="h-4 w-4 text-orange-600" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Parts needed</p>
            </CardContent>
          </Card>

          <Card data-testid="card-in-progress-work-orders" className="shadow-sm border-t-4 border-t-amber-500">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">In Progress</p>
                  <p className="text-2xl font-bold tabular-nums mt-1 text-amber-700 dark:text-amber-300" data-testid="text-in-progress-count">
                    {inProgressCount}
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/50 p-2">
                  <TrendingUp className="h-4 w-4 text-amber-600" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Active now</p>
            </CardContent>
          </Card>

          <Card data-testid="card-completed-work-orders" className="shadow-sm border-t-4 border-t-emerald-500 col-span-2 sm:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold tabular-nums mt-1 text-emerald-700 dark:text-emerald-300" data-testid="text-completed-count">
                    {completedCount}
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/50 p-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Finished</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Kanban board */}
      <section className="space-y-3" aria-labelledby="wo-board-heading">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          <h2 id="wo-board-heading" className="text-sm font-semibold tracking-tight">
            Work board
          </h2>
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Drag cards between columns to change status
          </span>
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
          {boardColumns.map((col) => {
            const items = getWorkOrdersByStatusCategory(col.key);
            const shown = col.limit ? items.slice(0, col.limit) : items;
            const isDropTarget = dropTargetColumn === col.key && !!draggingWorkOrderId;
            return (
              <div
                key={col.key}
                className={cn(
                  "rounded-xl border overflow-hidden flex flex-col min-h-[16rem] transition-shadow",
                  col.border,
                  isDropTarget && "ring-2 ring-primary ring-offset-2 shadow-md",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dropTargetColumn !== col.key) setDropTargetColumn(col.key);
                }}
                onDragLeave={(e) => {
                  // Only clear when leaving the column entirely (not a child)
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDropTargetColumn((prev) => (prev === col.key ? null : prev));
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id =
                    e.dataTransfer.getData("application/x-work-order-id") ||
                    e.dataTransfer.getData("text/plain");
                  setDropTargetColumn(null);
                  setDraggingWorkOrderId(null);
                  if (id) handleBoardDrop(col.key, id);
                }}
              >
                <div className={cn("flex items-center gap-2 px-3 py-2.5 border-b", col.headerBg, col.border)}>
                  <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", col.accent)} />
                  <h3 className="font-semibold text-sm truncate">{col.title}</h3>
                  <Badge variant="secondary" className="ml-auto tabular-nums">
                    {col.count}
                  </Badge>
                </div>
                <div className={cn("space-y-2 p-2.5 flex-1", col.bodyBg, isDropTarget && "bg-primary/5")}>
                  {shown.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-10 px-2">
                      {draggingWorkOrderId ? "Drop here" : col.empty}
                    </p>
                  ) : (
                    shown.map((wo) => (
                      <WorkOrderCard
                        key={wo.id}
                        workOrder={wo}
                        onEdit={openEditDialog}
                        onDelete={
                          user?.role === "owner" || user?.role === "clerk"
                            ? setWorkOrderToDelete
                            : undefined
                        }
                        onStatusChange={(status) =>
                          updateStatusMutation.mutate({ id: wo.id, status })
                        }
                        locale={locale}
                        compact={!!col.compact}
                        isDragging={draggingWorkOrderId === wo.id}
                        onDragStartCard={() => setDraggingWorkOrderId(wo.id)}
                        onDragEndCard={() => {
                          setDraggingWorkOrderId(null);
                          setDropTargetColumn(null);
                        }}
                      />
                    ))
                  )}
                  {col.limit && items.length > col.limit && (
                    <p className="text-xs text-muted-foreground text-center py-1">
                      +{items.length - col.limit} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Insights */}
      <section className="hidden md:block space-y-3" aria-labelledby="wo-insights-heading">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 id="wo-insights-heading" className="text-sm font-semibold tracking-tight">
            Insights
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <Card data-testid="card-priority-distribution" className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Priority distribution</CardTitle>
              <CardDescription>By urgency across filtered work orders</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(analytics.priorityDistribution || {}).map(([priority, count]) => (
                  <div key={priority} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          priority === "urgent"
                            ? "bg-red-500"
                            : priority === "high"
                            ? "bg-orange-500"
                            : priority === "medium"
                            ? "bg-yellow-500"
                            : "bg-green-500"
                        }`}
                      />
                      <span className="capitalize text-sm truncate" data-testid={`text-priority-${priority}`}>
                        {priority}
                      </span>
                    </div>
                    <Badge variant="outline" data-testid={`text-priority-${priority}-count`}>
                      {count as number}
                    </Badge>
                  </div>
                ))}
                {Object.keys(analytics.priorityDistribution || {}).length === 0 && (
                  <p className="text-sm text-muted-foreground">No priority data available</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-category-distribution" className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Category distribution</CardTitle>
              <CardDescription>Request categories on the board</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(analytics.categoryDistribution || {}).map(([category, count]) => (
                  <div key={category} className="flex items-center justify-between gap-2">
                    <span className="capitalize text-sm truncate" data-testid={`text-category-${category}`}>
                      {category}
                    </span>
                    <Badge variant="outline" data-testid={`text-category-${category}-count`}>
                      {count as number}
                    </Badge>
                  </div>
                ))}
                {Object.keys(analytics.categoryDistribution || {}).length === 0 && (
                  <p className="text-sm text-muted-foreground">No categories assigned yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-avg-resolution-time" className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Performance</CardTitle>
              <CardDescription>Resolution speed and completion</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Average resolution</p>
                  <p
                    className={
                      analytics.averageResolutionTimeMinutes > 0
                        ? "text-2xl font-bold mt-1"
                        : "text-base font-semibold text-muted-foreground mt-1"
                    }
                    data-testid="text-avg-resolution-time"
                  >
                    {analytics.averageResolutionTimeMinutes > 0
                      ? (() => {
                          const hours = Math.floor(analytics.averageResolutionTimeMinutes / 60);
                          const minutes = Math.round(analytics.averageResolutionTimeMinutes % 60);
                          return hours > 0 && minutes > 0
                            ? `${hours}h ${minutes}m`
                            : hours > 0
                            ? `${hours}h`
                            : `${minutes}m`;
                        })()
                      : "N/A"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Completion rate</p>
                  <p
                    className={
                      analytics.total > 0
                        ? "text-2xl font-bold mt-1"
                        : "text-base font-semibold text-muted-foreground mt-1"
                    }
                  >
                    {analytics.total > 0
                      ? `${Math.round(((analytics.statusDistribution?.completed || 0) / analytics.total) * 100)}%`
                      : "N/A"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Edit Work Order Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className={cn(dialogContentBase, "sm:max-w-lg")}>
          <DialogHeader>
            <DialogTitle>Edit Work Order</DialogTitle>
            <DialogDescription className="font-semibold text-foreground">
              {selectedWorkOrder?.maintenanceRequest.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Assigned To Section */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Maintenance Team
              </Label>
              <Select
                value={editFormData.teamId}
                onValueChange={(value) =>
                  setEditFormData({ ...editFormData, teamId: value, assignedToId: "" })
                }
              >
                <SelectTrigger data-testid="select-edit-team">
                  <SelectValue placeholder="Select a team..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {teams.filter(t => t.isActive).map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editFormData.teamId && editFormData.teamId !== "unassigned" && (
              <div className="space-y-2">
                <Label htmlFor="edit-assigned-to">Assign to Team Member</Label>
                {isLoadingEditMembers ? (
                  <p className="text-sm text-muted-foreground py-2">Loading members...</p>
                ) : (
                  <Select
                    key={`assignee-${editTeamId}-${editFormData.assignedToId}-${editTeamMembers.length}`}
                    value={editFormData.assignedToId || undefined}
                    onValueChange={(value) =>
                      setEditFormData({ ...editFormData, assignedToId: value })
                    }
                    disabled={editTeamMembers.length === 0}
                  >
                    <SelectTrigger id="edit-assigned-to" data-testid="select-edit-assigned-to">
                      <SelectValue
                        placeholder={
                          editTeamMembers.length === 0
                            ? "No members on this team"
                            : "Select inspector or contractor"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {editTeamMembers.map((member) => {
                        const person = member.user || member.contact;
                        if (!person) return null;
                        const value = member.userId || member.contactId;
                        if (!value) return null;
                        const kind = member.userId ? "Inspector / Staff" : "Maintenance Contractor";
                        return (
                          <SelectItem
                            key={member.id}
                            value={value}
                            data-testid={`option-edit-member-${member.id}`}
                          >
                            {person.firstName} {person.lastName}
                            {person.email ? ` (${person.email})` : ""} — {kind}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  Only people added to this Maintenance Team can be assigned.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={editFormData.status}
                onValueChange={(value) => setEditFormData({ ...editFormData, status: value })}
              >
                <SelectTrigger data-testid="select-edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="waiting_parts">Waiting Parts</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  {user?.role === "owner" && (
                    <SelectItem value="rejected">Rejected</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className={formGrid2}>
              <div className="space-y-2">
                <Label>Cost Estimate ({locale.currencySymbol})</Label>
                <Input
                  type="number"
                  placeholder="Enter cost"
                  value={editFormData.costEstimate}
                  onChange={(e) => setEditFormData({ ...editFormData, costEstimate: e.target.value })}
                  data-testid="input-edit-cost"
                />
              </div>

              <div className="space-y-2">
                <Label>SLA Due Date</Label>
                <LocaleDateInput
                  value={editFormData.slaDue}
                  onChange={(ymd) => setEditFormData({ ...editFormData, slaDue: ymd ?? "" })}
                  data-testid="input-edit-sla"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Add notes about this work order..."
                value={editFormData.notes}
                onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                className="min-h-16"
                data-testid="textarea-edit-notes"
              />
            </div>

            {selectedWorkOrder && (
              <WorkOrderCertificatePanel
                workOrderId={selectedWorkOrder.id}
                propertyId={selectedWorkOrder.maintenanceRequest.propertyId}
                blockId={selectedWorkOrder.maintenanceRequest.blockId}
              />
            )}

            {/* Activity / Updates Section */}
            <div className="space-y-2 border-t pt-4">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Activity Updates
              </Label>
              <div className="bg-muted/30 rounded-lg p-3 max-h-40 overflow-y-auto space-y-3">
                {/* Created timestamp */}
                {selectedWorkOrder?.createdAt && (
                  <div className="flex items-start gap-2 text-xs">
                    <div className="h-2 w-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Work order created</p>
                      <p className="text-muted-foreground">
                        {format(new Date(selectedWorkOrder.createdAt), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Work logs */}
                {workLogsError ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Unable to load activity
                  </p>
                ) : workLogs.length > 0 ? (
                  workLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 text-xs">
                      <div className="h-2 w-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium">{log.note}</p>
                        <p className="text-muted-foreground">
                          {format(new Date(log.createdAt), "MMM d, yyyy 'at' h:mm a")}
                          {log.timeSpentMinutes && ` - ${log.timeSpentMinutes} min`}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No activity updates yet
                  </p>
                )}

                {/* Updated timestamp (if different from created) */}
                {selectedWorkOrder?.updatedAt && 
                  selectedWorkOrder.updatedAt !== selectedWorkOrder.createdAt && (
                  <div className="flex items-start gap-2 text-xs">
                    <div className="h-2 w-2 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Last updated</p>
                      <p className="text-muted-foreground">
                        {format(new Date(selectedWorkOrder.updatedAt), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className={cn(dialogFooterSticky)}>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveWorkOrder}
              disabled={updateWorkOrderMutation.isPending}
              data-testid="button-save-work-order"
            >
              {updateWorkOrderMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!workOrderToDelete}
        onOpenChange={(open) => {
          if (!open) setWorkOrderToDelete(null);
        }}
        title="Delete work order?"
        description="This permanently deletes the work order. The related maintenance request is kept."
        itemName={workOrderToDelete?.maintenanceRequest?.title}
        isPending={deleteWorkOrderMutation.isPending}
        onConfirm={() => {
          if (workOrderToDelete) deleteWorkOrderMutation.mutate(workOrderToDelete.id);
        }}
      />
    </div>
  );
}

interface WorkOrderCardProps {
  workOrder: WorkOrder;
  onEdit: (wo: WorkOrder) => void;
  onDelete?: (wo: WorkOrder) => void;
  onStatusChange: (status: string) => void;
  locale: any;
  compact?: boolean;
  isDragging?: boolean;
  onDragStartCard?: () => void;
  onDragEndCard?: () => void;
}

function WorkOrderCard({
  workOrder,
  onEdit,
  onDelete,
  onStatusChange,
  locale,
  compact = false,
  isDragging = false,
  onDragStartCard,
  onDragEndCard,
}: WorkOrderCardProps) {
  const isOverdue = workOrder.slaDue && new Date(workOrder.slaDue) < new Date() && workOrder.status !== "completed";
  
  return (
    <Card 
      draggable
      onDragStart={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, [role='combobox'], input, select, textarea, a")) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("application/x-work-order-id", workOrder.id);
        e.dataTransfer.setData("text/plain", workOrder.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStartCard?.();
      }}
      onDragEnd={() => onDragEndCard?.()}
      className={cn(
        "bg-background shadow-sm border cursor-grab active:cursor-grabbing select-none",
        isOverdue && "border-red-400 ring-1 ring-red-200 dark:ring-red-900",
        isDragging && "opacity-40 scale-[0.98]",
      )}
      data-testid={`card-work-order-${workOrder.id}`}
    >
      <CardContent className={compact ? "p-2.5" : "p-3"}>
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h4 className={cn("font-semibold leading-snug line-clamp-2", compact ? "text-xs" : "text-sm")}>
              {workOrder.maintenanceRequest.title}
            </h4>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(workOrder);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                data-testid={`button-edit-${workOrder.id}`}
                title="Edit work order"
              >
                <Edit className="h-3.5 w-3.5" />
              </Button>
              {onDelete && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 cursor-pointer text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(workOrder);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  data-testid={`button-delete-${workOrder.id}`}
                  title="Delete work order"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge className={cn(priorityColors[workOrder.maintenanceRequest.priority], "text-[10px] px-1.5 py-0")} variant="secondary">
              {workOrder.maintenanceRequest.priority}
            </Badge>
            {workOrder.team && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                {workOrder.team.name}
              </Badge>
            )}
          </div>

          {!compact && (
            <div className="space-y-1">
              {workOrder.slaDue && (
                <div className={cn("flex items-center gap-1.5 text-xs", isOverdue ? "text-red-600 font-semibold" : "text-muted-foreground")}>
                  <Calendar className="h-3 w-3 shrink-0" />
                  <span>
                    {isOverdue ? "Overdue · " : "Due "}
                    {formatDistanceToNow(new Date(workOrder.slaDue), { addSuffix: true })}
                  </span>
                </div>
              )}

              {workOrder.costEstimate != null && (
                <div className="text-xs text-muted-foreground tabular-nums">
                  Est: {locale.formatCurrency(workOrder.costEstimate)}
                </div>
              )}
            </div>
          )}

          {workOrder.status !== "completed" && workOrder.status !== "rejected" && !compact && (
            <div className="pt-1.5 border-t" onPointerDown={(e) => e.stopPropagation()}>
              <Select
                value={workOrder.status}
                onValueChange={onStatusChange}
              >
                <SelectTrigger
                  className="h-8 text-xs cursor-pointer"
                  data-testid={`select-quick-status-${workOrder.id}`}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="waiting_parts">Waiting Parts</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
