import { useState } from "react";
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
import { BarChart3, TrendingUp, Users, AlertCircle, Clock, Calendar, User, CheckCircle2, Edit, ChevronRight, ChevronLeft, Filter, Wrench, ArrowUpDown, Pause, Play, X } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/contexts/LocaleContext";

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
  maintenanceRequest: {
    id: string;
    title: string;
    description?: string;
    priority: string;
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

export default function Analytics() {
  const { user } = useAuth();
  const { toast } = useToast();
  const locale = useLocale();
  
  const [selectedTeamId, setSelectedTeamId] = useState<string>("all");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [editFormData, setEditFormData] = useState({
    status: "",
    priority: "",
    costEstimate: "",
    slaDue: "",
    notes: "",
    teamId: "",
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

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/work-orders/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/work-orders"] });
      toast({ title: "Status updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const updateWorkOrderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/work-orders/${id}`, data);
    },
    onSuccess: () => {
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
      costEstimate: workOrder.costEstimate?.toString() || "",
      slaDue: workOrder.slaDue ? format(new Date(workOrder.slaDue), "yyyy-MM-dd") : "",
      notes: workOrder.notes || "",
      teamId: workOrder.teamId || workOrder.team?.id || "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveWorkOrder = () => {
    if (!selectedWorkOrder) return;
    
    updateWorkOrderMutation.mutate({
      id: selectedWorkOrder.id,
      data: {
        status: editFormData.status,
        costEstimate: editFormData.costEstimate ? parseFloat(editFormData.costEstimate) : null,
        slaDue: editFormData.slaDue || null,
        notes: editFormData.notes || null,
        teamId: editFormData.teamId || null,
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

  if (analyticsLoading) {
    return (
      <div className="container mx-auto p-6">
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
      <div className="container mx-auto p-6">
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-analytics">
            Work Order Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Overview of maintenance and work order metrics
          </p>
        </div>
      </div>

      {/* Team Navigation Tabs */}
      <Card data-testid="card-team-navigation">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex space-x-2 pb-2">
              <Button
                variant={selectedTeamId === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTeamId("all")}
                className="flex-shrink-0"
                data-testid="button-team-all"
              >
                All Teams
                <Badge variant="secondary" className="ml-2">{getTeamWorkOrderCount("all")}</Badge>
              </Button>
              {teams.filter(t => t.isActive).map((team) => (
                <Button
                  key={team.id}
                  variant={selectedTeamId === team.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedTeamId(team.id)}
                  className="flex-shrink-0"
                  data-testid={`button-team-${team.id}`}
                >
                  {team.name}
                  <Badge variant="secondary" className="ml-2">{getTeamWorkOrderCount(team.id)}</Badge>
                </Button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Summary Cards - Status Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card data-testid="card-total-work-orders">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Work Orders</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-count">
              {filteredWorkOrders.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedTeamId !== "all" ? "For selected team" : "Across all teams"}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-open-work-orders" className="border-l-4 border-l-blue-400">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
            <User className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-open-count">
              {openCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Assigned to team</p>
          </CardContent>
        </Card>

        <Card data-testid="card-waiting-work-orders" className="border-l-4 border-l-orange-400">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Waiting</CardTitle>
            <Pause className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-waiting-count">
              {waitingCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Waiting for parts</p>
          </CardContent>
        </Card>

        <Card data-testid="card-in-progress-work-orders" className="border-l-4 border-l-yellow-400">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <TrendingUp className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-in-progress-count">
              {inProgressCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Currently active</p>
          </CardContent>
        </Card>

        <Card data-testid="card-completed-work-orders" className="border-l-4 border-l-green-400">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-completed-count">
              {completedCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Finished work</p>
          </CardContent>
        </Card>
      </div>

      {/* Kanban-Style Status Columns */}
      <div className="grid gap-4 lg:grid-cols-4">
        {/* Open Column */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-2">
            <div className="h-3 w-3 rounded-full bg-blue-400" />
            <h3 className="font-semibold text-sm">Open / Assigned</h3>
            <Badge variant="secondary" className="ml-auto">{openCount}</Badge>
          </div>
          <div className="space-y-2 min-h-32 p-2 bg-muted/30 rounded-lg">
            {getWorkOrdersByStatusCategory("open").length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No open work orders</p>
            ) : (
              getWorkOrdersByStatusCategory("open").map((wo) => (
                <WorkOrderCard key={wo.id} workOrder={wo} onEdit={openEditDialog} onStatusChange={(status) => updateStatusMutation.mutate({ id: wo.id, status })} locale={locale} />
              ))
            )}
          </div>
        </div>

        {/* Waiting Column */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-2">
            <div className="h-3 w-3 rounded-full bg-orange-400" />
            <h3 className="font-semibold text-sm">Waiting Parts</h3>
            <Badge variant="secondary" className="ml-auto">{waitingCount}</Badge>
          </div>
          <div className="space-y-2 min-h-32 p-2 bg-muted/30 rounded-lg">
            {getWorkOrdersByStatusCategory("waiting").length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No work orders waiting</p>
            ) : (
              getWorkOrdersByStatusCategory("waiting").map((wo) => (
                <WorkOrderCard key={wo.id} workOrder={wo} onEdit={openEditDialog} onStatusChange={(status) => updateStatusMutation.mutate({ id: wo.id, status })} locale={locale} />
              ))
            )}
          </div>
        </div>

        {/* In Progress Column */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-2">
            <div className="h-3 w-3 rounded-full bg-yellow-400" />
            <h3 className="font-semibold text-sm">In Progress</h3>
            <Badge variant="secondary" className="ml-auto">{inProgressCount}</Badge>
          </div>
          <div className="space-y-2 min-h-32 p-2 bg-muted/30 rounded-lg">
            {getWorkOrdersByStatusCategory("in_progress").length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No work in progress</p>
            ) : (
              getWorkOrdersByStatusCategory("in_progress").map((wo) => (
                <WorkOrderCard key={wo.id} workOrder={wo} onEdit={openEditDialog} onStatusChange={(status) => updateStatusMutation.mutate({ id: wo.id, status })} locale={locale} />
              ))
            )}
          </div>
        </div>

        {/* Completed Column */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-2">
            <div className="h-3 w-3 rounded-full bg-green-400" />
            <h3 className="font-semibold text-sm">Completed</h3>
            <Badge variant="secondary" className="ml-auto">{completedCount}</Badge>
          </div>
          <div className="space-y-2 min-h-32 p-2 bg-muted/30 rounded-lg">
            {getWorkOrdersByStatusCategory("completed").length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No completed work orders</p>
            ) : (
              getWorkOrdersByStatusCategory("completed").slice(0, 5).map((wo) => (
                <WorkOrderCard key={wo.id} workOrder={wo} onEdit={openEditDialog} onStatusChange={(status) => updateStatusMutation.mutate({ id: wo.id, status })} locale={locale} compact />
              ))
            )}
            {getWorkOrdersByStatusCategory("completed").length > 5 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                +{getWorkOrdersByStatusCategory("completed").length - 5} more
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Distribution Charts */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Priority Distribution */}
        <Card data-testid="card-priority-distribution">
          <CardHeader>
            <CardTitle className="text-lg">Priority Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.priorityDistribution || {}).map(([priority, count]) => (
                <div key={priority} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        priority === "urgent"
                          ? "bg-red-500"
                          : priority === "high"
                          ? "bg-orange-500"
                          : priority === "medium"
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      }`}
                    />
                    <span className="capitalize text-sm" data-testid={`text-priority-${priority}`}>
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

        {/* Category Distribution */}
        <Card data-testid="card-category-distribution">
          <CardHeader>
            <CardTitle className="text-lg">Category Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.categoryDistribution || {}).map(([category, count]) => (
                <div key={category} className="flex items-center justify-between">
                  <span className="capitalize text-sm" data-testid={`text-category-${category}`}>
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

        {/* Average Resolution Time */}
        <Card data-testid="card-avg-resolution-time">
          <CardHeader>
            <CardTitle className="text-lg">Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Average Resolution Time</p>
                <p className="text-2xl font-bold" data-testid="text-avg-resolution-time">
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
              <div>
                <p className="text-sm text-muted-foreground">Completion Rate</p>
                <p className="text-2xl font-bold">
                  {analytics.total > 0 
                    ? `${Math.round(((analytics.statusDistribution?.completed || 0) / analytics.total) * 100)}%`
                    : "N/A"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Work Order Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Work Order</DialogTitle>
            <DialogDescription>
              {selectedWorkOrder?.maintenanceRequest.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Assigned To Section */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Assigned To
              </Label>
              <Select
                value={editFormData.teamId}
                onValueChange={(value) => setEditFormData({ ...editFormData, teamId: value })}
              >
                <SelectTrigger data-testid="select-edit-team">
                  <SelectValue placeholder="Select a team..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {teams.filter(t => t.isActive).map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedWorkOrder?.contractor && (
                <p className="text-xs text-muted-foreground">
                  Contractor: {selectedWorkOrder.contractor.firstName} {selectedWorkOrder.contractor.lastName} ({selectedWorkOrder.contractor.email})
                </p>
              )}
            </div>

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

            <div className="grid grid-cols-2 gap-4">
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
                <Input
                  type="date"
                  value={editFormData.slaDue}
                  onChange={(e) => setEditFormData({ ...editFormData, slaDue: e.target.value })}
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
          <DialogFooter>
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
    </div>
  );
}

interface WorkOrderCardProps {
  workOrder: WorkOrder;
  onEdit: (wo: WorkOrder) => void;
  onStatusChange: (status: string) => void;
  locale: any;
  compact?: boolean;
}

function WorkOrderCard({ workOrder, onEdit, onStatusChange, locale, compact = false }: WorkOrderCardProps) {
  const isOverdue = workOrder.slaDue && new Date(workOrder.slaDue) < new Date() && workOrder.status !== "completed";
  
  return (
    <Card 
      className={`hover-elevate cursor-pointer ${isOverdue ? "border-red-400" : ""}`}
      data-testid={`card-work-order-${workOrder.id}`}
    >
      <CardContent className={compact ? "p-3" : "p-4"}>
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h4 className={`font-medium ${compact ? "text-xs" : "text-sm"} line-clamp-2`}>
              {workOrder.maintenanceRequest.title}
            </h4>
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-6 w-6 flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); onEdit(workOrder); }}
              data-testid={`button-edit-${workOrder.id}`}
            >
              <Edit className="h-3 w-3" />
            </Button>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={priorityColors[workOrder.maintenanceRequest.priority]} variant="secondary">
              {workOrder.maintenanceRequest.priority}
            </Badge>
            {workOrder.team && (
              <Badge variant="outline" className="text-xs">
                {workOrder.team.name}
              </Badge>
            )}
          </div>

          {!compact && (
            <>
              {workOrder.slaDue && (
                <div className={`flex items-center gap-1 text-xs ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                  <Calendar className="h-3 w-3" />
                  <span>Due: {formatDistanceToNow(new Date(workOrder.slaDue), { addSuffix: true })}</span>
                </div>
              )}

              {workOrder.costEstimate && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>Est: {locale.formatCurrency(workOrder.costEstimate)}</span>
                </div>
              )}
            </>
          )}

          {/* Quick status change for non-completed */}
          {workOrder.status !== "completed" && workOrder.status !== "rejected" && !compact && (
            <div className="pt-2 border-t">
              <Select
                value={workOrder.status}
                onValueChange={onStatusChange}
              >
                <SelectTrigger className="h-7 text-xs" data-testid={`select-quick-status-${workOrder.id}`}>
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
