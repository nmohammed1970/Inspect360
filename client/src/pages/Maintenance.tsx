import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Wrench } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertMaintenanceRequestSchema } from "@shared/schema";
import type { MaintenanceRequest, Property, Unit, User } from "@shared/schema";
import { z } from "zod";

type MaintenanceRequestWithDetails = MaintenanceRequest & {
  unit?: { unitNumber: string; property?: { name: string } };
  reportedByUser?: { firstName: string; lastName: string };
  assignedToUser?: { firstName: string; lastName: string };
};

const createMaintenanceSchema = insertMaintenanceRequestSchema.extend({
  title: z.string().min(1, "Title is required"),
  unitId: z.string().min(1, "Unit is required"),
  priority: z.enum(["low", "medium", "high"]),
});

export default function Maintenance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // Fetch maintenance requests
  const { data: requests = [], isLoading } = useQuery<MaintenanceRequestWithDetails[]>({
    queryKey: ["/api/maintenance"],
  });

  // Fetch properties to get units
  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  // Fetch units for all properties
  const { data: allUnits = [] } = useQuery<Unit[]>({
    queryKey: ["/api/units"],
    enabled: properties.length > 0,
  });

  // Filter units for tenants - they can only see/select their own units
  const availableUnits = user?.role === "tenant" 
    ? allUnits.filter(unit => unit.tenantId === user.id)
    : allUnits;

  // Fetch organization clerks (for assignment)
  const { data: clerks = [] } = useQuery<User[]>({
    queryKey: ["/api/users/clerks"],
    enabled: user?.role === "owner",
  });

  // Create maintenance request mutation
  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createMaintenanceSchema>) => {
      return apiRequest("/api/maintenance", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] });
      setIsCreateOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Maintenance request created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create maintenance request",
        variant: "destructive",
      });
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, assignedTo }: { id: string; status: string; assignedTo?: string }) => {
      return apiRequest(`/api/maintenance/${id}`, "PATCH", { status, assignedTo });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] });
      toast({
        title: "Success",
        description: "Maintenance request updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update maintenance request",
        variant: "destructive",
      });
    },
  });

  const form = useForm<z.infer<typeof createMaintenanceSchema>>({
    resolver: zodResolver(createMaintenanceSchema),
    defaultValues: {
      title: "",
      description: "",
      unitId: "",
      priority: "medium",
      reportedBy: user?.id || "",
    },
  });

  const onSubmit = (data: z.infer<typeof createMaintenanceSchema>) => {
    createMutation.mutate({ ...data, reportedBy: user?.id || "" });
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive"; label: string }> = {
      low: { variant: "secondary", label: "Low" },
      medium: { variant: "default", label: "Medium" },
      high: { variant: "destructive", label: "High" },
    };
    const config = variants[priority] || variants.medium;
    return <Badge variant={config.variant} data-testid={`badge-priority-${priority}`}>{config.label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline"; label: string }> = {
      open: { variant: "outline", label: "Open" },
      assigned: { variant: "secondary", label: "Assigned" },
      "in-progress": { variant: "default", label: "In Progress" },
      completed: { variant: "secondary", label: "Completed" },
    };
    const config = variants[status] || variants.open;
    return <Badge variant={config.variant} data-testid={`badge-status-${status}`}>{config.label}</Badge>;
  };

  // Filter by status and tenant (if tenant user)
  let filteredRequests = selectedStatus === "all" 
    ? requests 
    : requests.filter(r => r.status === selectedStatus);
  
  // Tenants should only see their own requests
  if (user?.role === "tenant") {
    filteredRequests = filteredRequests.filter(r => r.reportedBy === user.id);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-maintenance">Maintenance Requests</h1>
          <p className="text-muted-foreground">
            {user?.role === "tenant" 
              ? "Submit and track your maintenance requests" 
              : "Manage internal maintenance work orders"}
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-request">
              <Plus className="w-4 h-4 mr-2" />
              New Request
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Maintenance Request</DialogTitle>
              <DialogDescription>
                Submit a new maintenance request for a unit
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., Leaking faucet in bathroom" 
                          {...field}
                          data-testid="input-title"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="unitId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-unit">
                            <SelectValue placeholder="Select a unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableUnits.map((unit) => (
                            <SelectItem key={unit.id} value={unit.id} data-testid={`option-unit-${unit.id}`}>
                              Unit {unit.unitNumber}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-priority">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low" data-testid="option-priority-low">Low</SelectItem>
                          <SelectItem value="medium" data-testid="option-priority-medium">Medium</SelectItem>
                          <SelectItem value="high" data-testid="option-priority-high">High</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Provide additional details..."
                          {...field}
                          value={field.value || ""}
                          data-testid="input-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={createMutation.isPending}
                  data-testid="button-submit-request"
                >
                  {createMutation.isPending ? "Creating..." : "Create Request"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status Filter (hidden for tenants) */}
      {user?.role !== "tenant" && (
        <div className="flex gap-2">
          {["all", "open", "assigned", "in-progress", "completed"].map((status) => (
            <Button
              key={status}
              variant={selectedStatus === status ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedStatus(status)}
              data-testid={`button-filter-${status}`}
            >
              {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1).replace("-", " ")}
            </Button>
          ))}
        </div>
      )}

      {/* Maintenance Requests List */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : filteredRequests.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Wrench className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-semibold mb-2" data-testid="text-no-requests">No maintenance requests</p>
              <p className="text-sm text-muted-foreground">
                {selectedStatus === "all" 
                  ? "Create your first maintenance request to get started"
                  : `No ${selectedStatus.replace("-", " ")} requests found`}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredRequests.map((request) => (
            <Card key={request.id} data-testid={`card-request-${request.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-2" data-testid={`text-title-${request.id}`}>
                      {request.title}
                    </CardTitle>
                    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                      <span data-testid={`text-unit-${request.id}`}>
                        Unit {request.unit?.unitNumber || "Unknown"}
                      </span>
                      {request.unit?.property && (
                        <span>• {request.unit.property.name}</span>
                      )}
                      <span>• Created {format(new Date(request.createdAt?.toString() || Date.now()), 'PPP')}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {getPriorityBadge(request.priority)}
                    {getStatusBadge(request.status)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {request.description && (
                  <p className="text-sm text-muted-foreground" data-testid={`text-description-${request.id}`}>
                    {request.description}
                  </p>
                )}
                
                <div className="flex items-center justify-between gap-4 pt-4 border-t">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Reported by: </span>
                    <span data-testid={`text-reporter-${request.id}`}>
                      {request.reportedByUser 
                        ? `${request.reportedByUser.firstName} ${request.reportedByUser.lastName}`
                        : "Unknown"}
                    </span>
                    {request.assignedToUser && (
                      <>
                        <span className="text-muted-foreground"> • Assigned to: </span>
                        <span data-testid={`text-assignee-${request.id}`}>
                          {request.assignedToUser.firstName} {request.assignedToUser.lastName}
                        </span>
                      </>
                    )}
                  </div>
                  
                  {user?.role === "owner" && request.status !== "completed" && (
                    <div className="flex gap-2">
                      <Select
                        value={request.status}
                        onValueChange={(status) => 
                          updateStatusMutation.mutate({ id: request.id, status })
                        }
                      >
                        <SelectTrigger className="w-40" data-testid={`select-status-${request.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open" data-testid={`option-status-open-${request.id}`}>Open</SelectItem>
                          <SelectItem value="assigned" data-testid={`option-status-assigned-${request.id}`}>Assigned</SelectItem>
                          <SelectItem value="in-progress" data-testid={`option-status-progress-${request.id}`}>In Progress</SelectItem>
                          <SelectItem value="completed" data-testid={`option-status-completed-${request.id}`}>Completed</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {!request.assignedTo && clerks.length > 0 && (
                        <Select
                          onValueChange={(assignedTo) =>
                            updateStatusMutation.mutate({ 
                              id: request.id, 
                              status: "assigned",
                              assignedTo 
                            })
                          }
                        >
                          <SelectTrigger className="w-40" data-testid={`select-assign-${request.id}`}>
                            <SelectValue placeholder="Assign to..." />
                          </SelectTrigger>
                          <SelectContent>
                            {clerks.map((clerk) => (
                                <SelectItem 
                                  key={clerk.id} 
                                  value={clerk.id}
                                  data-testid={`option-clerk-${clerk.id}`}
                                >
                                  {clerk.firstName} {clerk.lastName}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
