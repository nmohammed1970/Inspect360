import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Calendar, User, AlertCircle, CheckCircle2, Clock, Clipboard, Wrench } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useLocale } from "@/contexts/LocaleContext";
import { useModules } from "@/hooks/use-modules";
import { useEffect } from "react";

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
    firstName?: string;
    lastName?: string;
    email: string;
  };
}

const statusColors: Record<string, string> = {
  assigned: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  waiting_parts: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-800",
  medium: "bg-blue-100 text-blue-800",
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-red-800",
};

export default function WorkOrders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const locale = useLocale();

  const { isModuleEnabled, isLoading: isLoadingModules } = useModules();
  const isMaintenanceEnabled = isModuleEnabled("maintenance");
  // Work orders are part of the maintenance module
  const isWorkOrdersEnabled = isMaintenanceEnabled;

  // Refetch module data when component mounts to ensure we have the latest status
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/marketplace/my-modules"] });
  }, []);

  const { data: workOrders = [], isLoading } = useQuery<WorkOrder[]>({
    queryKey: ["/api/work-orders"],
    enabled: isWorkOrdersEnabled !== false,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/work-orders/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
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

  if (!isLoadingModules && !isWorkOrdersEnabled) {
    return (
      <div className="container mx-auto p-4 md:p-6 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <Clipboard className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Maintenance Module Required</h1>
          <p className="text-muted-foreground max-w-md">
            Maintenance & Work Orders features are not enabled for your organization.
            <br />
            Please enable this feature from the marketplace to continue.
          </p>
        </div>
        <Button variant="default" onClick={() => window.location.href = "/marketplace"}>
          Go to Marketplace
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">Work Orders</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          {user?.role === "contractor" 
            ? "View and manage your assigned work orders" 
            : "Manage contractor work orders and assignments"}
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading work orders...</div>
      ) : workOrders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <User className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No work orders</h3>
            <p className="text-muted-foreground text-center">
              {user?.role === "contractor"
                ? "You don't have any assigned work orders yet"
                : "Create work orders from maintenance requests"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {workOrders.map((workOrder) => (
            <Card key={workOrder.id} data-testid={`card-work-order-${workOrder.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
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
                      <span className="h-4 w-4 text-muted-foreground flex items-center justify-center font-semibold">£</span>
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

                {user?.role === "contractor" && workOrder.status !== "completed" && workOrder.status !== "rejected" && (
                  <div className="mt-4 flex items-center gap-2">
                    <label className="text-sm font-medium">Update Status:</label>
                    <Select
                      value={workOrder.status}
                      onValueChange={(status) => updateStatusMutation.mutate({ id: workOrder.id, status })}
                    >
                      <SelectTrigger className="w-48" data-testid={`select-status-${workOrder.id}`}>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
