import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, Users, AlertCircle, Clock, Calendar, User, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
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

const statusColors: Record<string, string> = {
  assigned: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
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

export default function Analytics() {
  const { user } = useAuth();
  const { toast } = useToast();
  const locale = useLocale();

  const { data: analytics, isLoading: analyticsLoading } = useQuery<WorkOrderAnalytics>({
    queryKey: ["/api/analytics/work-orders"],
  });

  const { data: workOrders = [], isLoading: workOrdersLoading } = useQuery<WorkOrder[]>({
    queryKey: ["/api/work-orders"],
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4" />;
      case "in_progress":
      case "waiting_parts":
        return <Clock className="h-4 w-4" />;
      case "rejected":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-analytics">
            Work Order Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Overview of maintenance and work order metrics
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card data-testid="card-total-work-orders">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Work Orders</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-count">
              {analytics.total}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-open-work-orders">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-open-count">
              {(analytics.statusDistribution?.open || 0) + (analytics.statusDistribution?.assigned || 0)}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-in-progress-work-orders">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-in-progress-count">
              {analytics.statusDistribution?.in_progress || 0}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-completed-work-orders">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-completed-count">
              {analytics.statusDistribution?.completed || 0}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-avg-resolution-time">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Resolution</CardTitle>
            <Clock className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-resolution-time">
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
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribution Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Priority Distribution */}
        <Card data-testid="card-priority-distribution">
          <CardHeader>
            <CardTitle>Priority Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
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
                    <span className="capitalize" data-testid={`text-priority-${priority}`}>
                      {priority}
                    </span>
                  </div>
                  <span className="font-medium" data-testid={`text-priority-${priority}-count`}>
                    {count as number}
                  </span>
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
            <CardTitle>Category Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(analytics.categoryDistribution || {}).map(([category, count]) => (
                <div key={category} className="flex items-center justify-between">
                  <span className="capitalize" data-testid={`text-category-${category}`}>
                    {category}
                  </span>
                  <span className="font-medium" data-testid={`text-category-${category}-count`}>
                    {count as number}
                  </span>
                </div>
              ))}
              {Object.keys(analytics.categoryDistribution || {}).length === 0 && (
                <p className="text-sm text-muted-foreground">No categories assigned yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Team Distribution */}
        <Card data-testid="card-team-distribution" className="md:col-span-2">
          <CardHeader>
            <CardTitle>Team Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(analytics.teamDistribution || {}).map(([teamId, data]: [string, any]) => (
                <div key={teamId} className="flex items-center justify-between">
                  <span data-testid={`text-team-${teamId}`}>{data.name}</span>
                  <span className="font-medium" data-testid={`text-team-${teamId}-count`}>
                    {data.count}
                  </span>
                </div>
              ))}
              {Object.keys(analytics.teamDistribution || {}).length === 0 && (
                <p className="text-sm text-muted-foreground">No teams assigned yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Work Orders List */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight" data-testid="heading-work-orders-list">
          Work Orders
        </h2>

        {workOrdersLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading work orders...</div>
        ) : workOrders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <User className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2" data-testid="text-no-work-orders">No work orders</h3>
              <p className="text-muted-foreground text-center">
                {user?.role === "contractor"
                  ? "You don't have any assigned work orders yet"
                  : "Create work orders from maintenance requests in the Maintenance page"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {workOrders.map((workOrder) => (
              <Card key={workOrder.id} data-testid={`card-work-order-${workOrder.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {getStatusIcon(workOrder.status)}
                        <CardTitle className="text-lg">
                          {workOrder.maintenanceRequest.title}
                        </CardTitle>
                        <Badge className={priorityColors[workOrder.maintenanceRequest.priority]}>
                          {workOrder.maintenanceRequest.priority}
                        </Badge>
                      </div>
                      <CardDescription>
                        {workOrder.maintenanceRequest.description || "No description provided"}
                      </CardDescription>
                    </div>
                    <Badge className={statusColors[workOrder.status]}>
                      {workOrder.status.replace("_", " ")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {workOrder.team && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Assigned Team</p>
                          <p className="text-muted-foreground" data-testid={`text-team-wo-${workOrder.id}`}>
                            {workOrder.team.name}
                          </p>
                        </div>
                      </div>
                    )}

                    {workOrder.contractor && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Contractor</p>
                          <p className="text-muted-foreground">
                            {workOrder.contractor.firstName} {workOrder.contractor.lastName}
                          </p>
                        </div>
                      </div>
                    )}

                    {workOrder.slaDue && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">SLA Due</p>
                          <p className="text-muted-foreground">
                            {formatDistanceToNow(new Date(workOrder.slaDue), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    )}

                    {(workOrder.costEstimate || workOrder.costActual) && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="h-4 w-4 text-muted-foreground flex items-center justify-center font-semibold">
                          {locale.currencySymbol}
                        </span>
                        <div>
                          <p className="font-medium">Cost</p>
                          <p className="text-muted-foreground">
                            {workOrder.costActual 
                              ? `Actual: ${locale.formatCurrency(workOrder.costActual)}`
                              : `Est: ${locale.formatCurrency(workOrder.costEstimate || 0)}`}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Created</p>
                        <p className="text-muted-foreground">
                          {formatDistanceToNow(new Date(workOrder.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Status update controls for owners and contractors */}
                  {workOrder.status !== "completed" && workOrder.status !== "rejected" && (
                    <div className="mt-4 flex items-center gap-2">
                      <label className="text-sm font-medium">Update Status:</label>
                      <Select
                        value={workOrder.status}
                        onValueChange={(status) => updateStatusMutation.mutate({ id: workOrder.id, status })}
                        disabled={updateStatusMutation.isPending}
                      >
                        <SelectTrigger className="w-48" data-testid={`select-status-${workOrder.id}`}>
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
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
