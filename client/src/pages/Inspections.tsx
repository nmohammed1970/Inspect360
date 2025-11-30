import { useState, useEffect, useMemo } from "react";
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
import { Plus, ClipboardList, Calendar, MapPin, User, Play, FileText, Filter, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link, useLocation, useSearch } from "wouter";
import { format } from "date-fns";

// Component to display AI Analysis progress for an inspection
function InspectionAIAnalysisProgress({ inspectionId }: { inspectionId: string }) {
  const { data: aiAnalysisStatus } = useQuery<{
    status: "idle" | "processing" | "completed" | "failed";
    progress: number;
    totalFields: number;
    error: string | null;
  }>({
    queryKey: [`/api/ai/analyze-inspection/${inspectionId}/status`],
    enabled: !!inspectionId,
    refetchInterval: (query) => {
      // Poll every 3 seconds while processing
      const status = query.state.data?.status;
      return status === "processing" ? 3000 : false;
    },
  });

  if (!aiAnalysisStatus || aiAnalysisStatus.status === "idle" || aiAnalysisStatus.status === "completed") {
    return null;
  }

  if (aiAnalysisStatus.status === "failed") {
    return (
      <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2">
        <div className="flex items-center gap-2 text-xs text-destructive">
          <Sparkles className="w-3 h-3" />
          <span>AI Analysis Failed</span>
        </div>
      </div>
    );
  }

  if (aiAnalysisStatus.status === "processing") {
    const progressPercent = aiAnalysisStatus.totalFields > 0
      ? (aiAnalysisStatus.progress / aiAnalysisStatus.totalFields) * 100
      : 0;

    return (
      <div className="rounded-md border border-primary/20 bg-primary/5 p-2 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-primary" />
            <span>AI Analysing</span>
          </span>
          <span className="font-medium text-primary">
            {aiAnalysisStatus.progress} / {aiAnalysisStatus.totalFields}
          </span>
        </div>
        <Progress 
          value={progressPercent} 
          className="h-1.5"
        />
      </div>
    );
  }

  return null;
}

const createInspectionSchema = z.object({
  propertyId: z.string().min(1, "Property is required"),
  type: z.enum(["check_in", "check_out", "routine", "maintenance"]),
  scheduledDate: z.string().min(1, "Scheduled date is required"),
  templateId: z.string().optional(),
  clerkId: z.string().optional(),
  notes: z.string().optional(),
});

type CreateInspectionData = z.infer<typeof createInspectionSchema>;

export default function Inspections() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const urlPropertyId = new URLSearchParams(searchParams).get("propertyId");
  const shouldCreate = new URLSearchParams(searchParams).get("create");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  
  // Filter state
  const [filterBlockId, setFilterBlockId] = useState<string>("");
  const [filterPropertyId, setFilterPropertyId] = useState<string>("");

  const { data: inspections = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/inspections/my"],
  });

  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
  });

  const { data: blocks = [] } = useQuery<any[]>({
    queryKey: ["/api/blocks"],
  });


  const { data: clerks = [] } = useQuery<any[]>({
    queryKey: ["/api/users/clerks"],
  });

  // Fetch active templates filtered by property scope
  const { data: templates = [] } = useQuery<any[]>({
    queryKey: ["/api/inspection-templates?scope=property&active=true"],
  });

  const form = useForm<CreateInspectionData>({
    resolver: zodResolver(createInspectionSchema),
    defaultValues: {
      propertyId: "",
      type: "routine",
      scheduledDate: new Date().toISOString().split("T")[0],
      templateId: "__none__",
      clerkId: "",
      notes: "",
    },
  });

  // Pre-populate form and auto-open dialog if coming from property detail
  useEffect(() => {
    if (urlPropertyId && properties.length > 0) {
      // Pre-populate property selection
      form.setValue("propertyId", urlPropertyId);
      setSelectedPropertyId(urlPropertyId);
      
      // Auto-open dialog if create=true
      if (shouldCreate === "true") {
        setDialogOpen(true);
        // Clear URL parameters after opening to keep URL clean
        navigate("/inspections", { replace: true });
      }
    }
  }, [urlPropertyId, shouldCreate, properties, navigate]);

  // Filter properties based on selected block
  const filteredProperties = useMemo(() => {
    if (!filterBlockId) return properties;
    return properties.filter((p: any) => p.blockId === filterBlockId);
  }, [properties, filterBlockId]);

  // Filter inspections based on selected block and property
  const filteredInspections = useMemo(() => {
    let filtered = inspections;

    if (filterBlockId) {
      filtered = filtered.filter((inspection: any) => {
        // Include inspections directly linked to the block
        if (inspection.blockId === filterBlockId) return true;
        // Include inspections linked to properties in this block
        if (inspection.property?.blockId === filterBlockId) return true;
        return false;
      });
    }

    if (filterPropertyId) {
      filtered = filtered.filter((inspection: any) => 
        inspection.propertyId === filterPropertyId
      );
    }

    return filtered;
  }, [inspections, filterBlockId, filterPropertyId]);

  // Clear property filter when block filter changes
  useEffect(() => {
    if (filterBlockId && filterPropertyId) {
      const property = properties.find((p: any) => p.id === filterPropertyId);
      if (property && property.blockId !== filterBlockId) {
        setFilterPropertyId("");
      }
    }
  }, [filterBlockId, filterPropertyId, properties]);

  // Auto-select matching template when inspection type changes
  const watchedType = form.watch("type");
  useEffect(() => {
    if (templates.length === 0) return;
    
    // Map inspection types to template names
    const typeToTemplateName: Record<string, string> = {
      check_in: "Check In",
      check_out: "Check Out",
    };
    
    const expectedTemplateName = typeToTemplateName[watchedType];
    
    if (expectedTemplateName) {
      // Auto-select matching template for check-in/check-out
      const matchingTemplate = templates.find(
        (t: any) => t.name === expectedTemplateName && t.isActive
      );
      if (matchingTemplate) {
        form.setValue("templateId", matchingTemplate.id);
      } else {
        // No matching template found - clear selection
        form.setValue("templateId", "__none__");
      }
    } else {
      // Clear template selection for other types (routine, maintenance)
      form.setValue("templateId", "__none__");
    }
  }, [watchedType, templates]);

  const createInspection = useMutation({
    mutationFn: async (data: CreateInspectionData) => {
      return await apiRequest("POST", "/api/inspections", data);
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
    // Create payload and remove sentinel values
    const payload: any = { ...data };
    
    // Remove templateId if it's the sentinel or empty
    if (payload.templateId === "__none__" || !payload.templateId) {
      delete payload.templateId;
    }
    
    // Remove clerkId if it's the sentinel or empty
    if (payload.clerkId === "__none__" || !payload.clerkId) {
      delete payload.clerkId;
    }
    
    createInspection.mutate(payload);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string; className?: string }> = {
      draft: { variant: "secondary", label: "Draft" },
      in_progress: { variant: "default", label: "In Progress" },
      completed: { variant: "default", label: "Completed", className: "bg-primary text-primary-foreground" },
    };
    const config = variants[status] || variants.draft;
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
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
                  name="templateId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "__none__"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-template">
                            <SelectValue placeholder="No template" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">No Template</SelectItem>
                          {templates.map((template: any) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                              {template.version > 1 && ` (v${template.version})`}
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
                              {clerk.firstName} {clerk.lastName}
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

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Filter className="w-4 h-4" />
              <span className="text-sm font-medium">Filter by:</span>
            </div>
            <div className="flex-1 min-w-[200px] max-w-xs">
              <label className="text-sm font-medium mb-1.5 block">Block</label>
              <Select value={filterBlockId || "__all__"} onValueChange={(value) => setFilterBlockId(value === "__all__" ? "" : value)}>
                <SelectTrigger data-testid="filter-block">
                  <SelectValue placeholder="All blocks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All blocks</SelectItem>
                  {blocks.map((block: any) => (
                    <SelectItem key={block.id} value={block.id}>
                      {block.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px] max-w-xs">
              <label className="text-sm font-medium mb-1.5 block">Property</label>
              <Select 
                value={filterPropertyId || "__all__"} 
                onValueChange={(value) => setFilterPropertyId(value === "__all__" ? "" : value)}
                disabled={!filterBlockId && filteredProperties.length === 0}
              >
                <SelectTrigger data-testid="filter-property">
                  <SelectValue placeholder="All properties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All properties</SelectItem>
                  {filteredProperties.map((property: any) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(filterBlockId || filterPropertyId) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilterBlockId("");
                  setFilterPropertyId("");
                }}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {filteredInspections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardList className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium" data-testid="text-empty-state">
              {inspections.length === 0 ? "No inspections yet" : "No inspections match your filters"}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              {inspections.length === 0 
                ? "Create your first inspection to get started"
                : "Try adjusting your filters or create a new inspection"
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredInspections.map((inspection: any) => (
            <Card key={inspection.id} className="hover-elevate" data-testid={`card-inspection-${inspection.id}`}>
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
              <CardContent className="space-y-4">
                <div className="space-y-2">
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
                </div>
                
                {/* AI Analysis Progress */}
                <InspectionAIAnalysisProgress inspectionId={inspection.id} />
                
                <div className="flex gap-2 flex-wrap">
                  {inspection.templateSnapshotJson && inspection.status !== "completed" && (
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => navigate(`/inspections/${inspection.id}/capture`)}
                      data-testid={`button-start-capture-${inspection.id}`}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      {inspection.status === "in_progress" ? "Continue" : "Start"}
                    </Button>
                  )}
                  {inspection.templateSnapshotJson && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => navigate(`/inspections/${inspection.id}/report`)}
                      data-testid={`button-view-report-${inspection.id}`}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      View Report
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => navigate(`/inspections/${inspection.id}`)}
                    data-testid={`button-view-details-${inspection.id}`}
                  >
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
