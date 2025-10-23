import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Plus, ClipboardList, Calendar, MapPin, User } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

const createInspectionSchema = z.object({
  propertyId: z.string().min(1, "Property is required"),
  unitId: z.string().min(1, "Unit is required"),
  type: z.enum(["check_in", "check_out", "routine", "maintenance"]),
  scheduledDate: z.string().min(1, "Scheduled date is required"),
  clerkId: z.string().optional(),
  notes: z.string().optional(),
});

type CreateInspectionData = z.infer<typeof createInspectionSchema>;

export default function Inspections() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");

  const { data: inspections = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/inspections/my"],
  });

  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
  });

  const { data: units = [] } = useQuery<any[]>({
    queryKey: ["/api/properties", selectedPropertyId, "units"],
    enabled: !!selectedPropertyId,
  });

  const { data: clerks = [] } = useQuery<any[]>({
    queryKey: ["/api/users/clerks"],
  });

  const form = useForm<CreateInspectionData>({
    resolver: zodResolver(createInspectionSchema),
    defaultValues: {
      propertyId: "",
      unitId: "",
      type: "routine",
      scheduledDate: new Date().toISOString().split("T")[0],
      clerkId: "",
      notes: "",
    },
  });

  const createInspection = useMutation({
    mutationFn: async (data: CreateInspectionData) => {
      return await apiRequest("/api/inspections", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections/my"] });
      toast({
        title: "Success",
        description: "Inspection created successfully",
      });
      setDialogOpen(false);
      form.reset();
      setSelectedPropertyId("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create inspection",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateInspectionData) => {
    createInspection.mutate(data);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      draft: { variant: "secondary", label: "Draft" },
      in_progress: { variant: "default", label: "In Progress" },
      completed: { variant: "outline", label: "Completed" },
    };
    const config = variants[status] || variants.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      check_in: "Check In",
      check_out: "Check Out",
      routine: "Routine",
      maintenance: "Maintenance",
    };
    return <Badge variant="outline">{labels[type] || type}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex justify-center items-center h-64">
          <p className="text-muted-foreground">Loading inspections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Inspections</h1>
          <p className="text-muted-foreground">
            Manage and conduct property inspections
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-inspection">
              <Plus className="w-4 h-4 mr-2" />
              New Inspection
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Inspection</DialogTitle>
              <DialogDescription>
                Schedule a new inspection for a property unit
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="propertyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Property</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedPropertyId(value);
                          form.setValue("unitId", "");
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-property">
                            <SelectValue placeholder="Select property" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {properties.map((property: any) => (
                            <SelectItem key={property.id} value={property.id}>
                              {property.name}
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
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Inspection Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="check_in">Check In</SelectItem>
                          <SelectItem value="check_out">Check Out</SelectItem>
                          <SelectItem value="routine">Routine</SelectItem>
                          <SelectItem value="maintenance">Maintenance</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="scheduledDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scheduled Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          data-testid="input-scheduled-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="clerkId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assign to Clerk (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-clerk">
                            <SelectValue placeholder="Select clerk" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clerks.map((clerk: any) => (
                            <SelectItem key={clerk.id} value={clerk.id}>
                              {clerk.email}
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
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any additional notes..."
                          {...field}
                          data-testid="input-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createInspection.isPending}
                    data-testid="button-submit"
                  >
                    {createInspection.isPending ? "Creating..." : "Create Inspection"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {inspections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardList className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium" data-testid="text-empty-state">No inspections yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first inspection to get started
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {inspections.map((inspection: any) => (
            <Link key={inspection.id} href={`/inspections/${inspection.id}`}>
              <Card className="hover-elevate cursor-pointer" data-testid={`card-inspection-${inspection.id}`}>
                <CardHeader>
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-lg">
                      {inspection.property?.name || "Unknown Property"}
                    </CardTitle>
                    {getStatusBadge(inspection.status)}
                  </div>
                  <CardDescription className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {inspection.property?.address || inspection.block?.address || "No location"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Type:</span>
                    {getTypeBadge(inspection.type)}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>
                      {inspection.scheduledDate
                        ? format(new Date(inspection.scheduledDate), "MMM dd, yyyy")
                        : "Not scheduled"}
                    </span>
                  </div>
                  {inspection.clerk && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {inspection.clerk.email}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
