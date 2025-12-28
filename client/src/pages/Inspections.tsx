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
import { Plus, ClipboardList, Calendar, MapPin, User, Play, FileText, Filter, Sparkles, Users, Copy, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  targetType: z.enum(["property", "block"]),
  propertyId: z.string().optional(),
  blockId: z.string().optional(),
  tenantId: z.string().optional(),
  type: z.enum(["check_in", "check_out", "routine", "maintenance", "esg_sustainability_inspection", "fire_hazard_assessment", "maintenance_inspection", "damage", "emergency", "safety_compliance", "compliance_regulatory", "pre_purchase", "specialized"]),
  scheduledDate: z.string().min(1, "Scheduled date is required"),
  templateId: z.string().optional(),
  clerkId: z.string().optional(),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.targetType === "property" && !data.propertyId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Please select a property",
      path: ["propertyId"],
    });
  }
  if (data.targetType === "block" && !data.blockId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Please select a block",
      path: ["blockId"],
    });
  }
});

type CreateInspectionData = z.infer<typeof createInspectionSchema>;

const copyInspectionSchema = z.object({
  type: z.enum(["check_in", "check_out"]),
  scheduledDate: z.string().min(1, "Scheduled date is required"),
  copyImages: z.boolean().default(true),
  copyText: z.boolean().default(true),
});

type CopyInspectionData = z.infer<typeof copyInspectionSchema>;

export default function Inspections() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const urlParams = new URLSearchParams(searchParams);
  const urlPropertyId = urlParams.get("propertyId");
  const urlBlockId = urlParams.get("blockId");
  const urlOverdue = urlParams.get("overdue");
  const urlDueSoon = urlParams.get("dueSoon");
  const shouldCreate = urlParams.get("create");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  
  // Copy inspection dialog state
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [inspectionToCopy, setInspectionToCopy] = useState<any>(null);
  
  // Filter state - initialize from URL params if present
  const [filterBlockId, setFilterBlockId] = useState<string>(urlBlockId || "");
  const [filterPropertyId, setFilterPropertyId] = useState<string>(urlPropertyId || "");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterOverdue, setFilterOverdue] = useState<boolean>(urlOverdue === "true");
  const [filterDueSoon, setFilterDueSoon] = useState<boolean>(urlDueSoon === "true");
  const [filterTenantId, setFilterTenantId] = useState<string>("");

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

  // Fetch active tenants for filter dropdown
  const { data: activeTenants = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/tenants/active"],
  });

  const form = useForm<CreateInspectionData>({
    resolver: zodResolver(createInspectionSchema),
    defaultValues: {
      targetType: "property",
      propertyId: "",
      blockId: "",
      tenantId: "",
      type: "routine",
      scheduledDate: new Date().toISOString().split("T")[0],
      templateId: "__none__",
      clerkId: "",
      notes: "",
    },
  });

  // Watch the target type to dynamically fetch templates
  const targetType = form.watch("targetType");
  
  // Fetch active templates filtered by the current target scope
  // Only fetch when targetType is set (property or block)
  const { data: templates = [] } = useQuery<any[]>({
    queryKey: ["/api/inspection-templates", { scope: targetType, active: true }],
    queryFn: async () => {
      const scope = targetType === "block" ? "block" : "property";
      const response = await fetch(`/api/inspection-templates?scope=${scope}&active=true`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch templates");
      return response.json();
    },
    enabled: !!targetType && (targetType === "property" || targetType === "block"),
  });

  // Fetch tenants for selected property
  const { data: tenants = [] } = useQuery<any[]>({
    queryKey: ["/api/properties", selectedPropertyId, "tenants"],
    enabled: !!selectedPropertyId,
  });

  // Copy inspection form
  const copyForm = useForm<CopyInspectionData>({
    resolver: zodResolver(copyInspectionSchema),
    defaultValues: {
      type: "check_out",
      scheduledDate: new Date().toISOString().split("T")[0],
      copyImages: true,
      copyText: true,
    },
  });

  // Copy inspection mutation
  const copyInspection = useMutation({
    mutationFn: async (data: CopyInspectionData & { inspectionId: string }) => {
      return await apiRequest("POST", `/api/inspections/${data.inspectionId}/copy`, {
        type: data.type,
        scheduledDate: data.scheduledDate,
        copyImages: data.copyImages,
        copyText: data.copyText,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections/my"] });
      toast({
        title: "Success",
        description: "Inspection copied successfully",
      });
      setCopyDialogOpen(false);
      setInspectionToCopy(null);
      copyForm.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to copy inspection",
        variant: "destructive",
      });
    },
  });

  const onCopySubmit = (data: CopyInspectionData) => {
    if (!inspectionToCopy) return;
    copyInspection.mutate({
      ...data,
      inspectionId: inspectionToCopy.id,
    });
  };

  const handleCopyClick = (inspection: any) => {
    setInspectionToCopy(inspection);
    // Pre-select the opposite type
    const newType = inspection.type === "check_in" ? "check_out" : "check_in";
    copyForm.setValue("type", newType as "check_in" | "check_out");
    copyForm.setValue("scheduledDate", new Date().toISOString().split("T")[0]);
    copyForm.setValue("copyImages", true);
    copyForm.setValue("copyText", true);
    setCopyDialogOpen(true);
  };

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

  // Sort active tenants alphabetically for filter dropdown
  const sortedActiveTenants = useMemo(() => {
    return [...activeTenants].sort((a, b) => a.name.localeCompare(b.name));
  }, [activeTenants]);

  // Filter inspections based on all criteria
  const filteredInspections = useMemo(() => {
    let filtered = inspections;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    // Block filter
    if (filterBlockId) {
      filtered = filtered.filter((inspection: any) => {
        if (inspection.blockId === filterBlockId) return true;
        if (inspection.property?.blockId === filterBlockId) return true;
        return false;
      });
    }

    // Property filter
    if (filterPropertyId) {
      filtered = filtered.filter((inspection: any) => 
        inspection.propertyId === filterPropertyId
      );
    }

    // Status filter
    if (filterStatus) {
      filtered = filtered.filter((inspection: any) => 
        inspection.status === filterStatus
      );
    }

    // Overdue filter
    if (filterOverdue) {
      filtered = filtered.filter((inspection: any) => {
        if (inspection.status === "completed") return false;
        const scheduledDate = new Date(inspection.scheduledDate);
        scheduledDate.setHours(0, 0, 0, 0);
        return scheduledDate < today;
      });
    }

    // Due soon filter (next 7 days)
    if (filterDueSoon) {
      filtered = filtered.filter((inspection: any) => {
        if (inspection.status === "completed") return false;
        const scheduledDate = new Date(inspection.scheduledDate);
        scheduledDate.setHours(0, 0, 0, 0);
        return scheduledDate >= today && scheduledDate <= sevenDaysFromNow;
      });
    }

    // Tenant filter
    if (filterTenantId) {
      filtered = filtered.filter((inspection: any) => 
        inspection.tenantId === filterTenantId
      );
    }

    return filtered;
  }, [inspections, filterBlockId, filterPropertyId, filterStatus, filterOverdue, filterDueSoon, filterTenantId]);

  // Clear property filter when block filter changes
  useEffect(() => {
    if (filterBlockId && filterPropertyId) {
      const property = properties.find((p: any) => p.id === filterPropertyId);
      if (property && property.blockId !== filterBlockId) {
        setFilterPropertyId("");
      }
    }
  }, [filterBlockId, filterPropertyId, properties]);

  // Reset template selection when target type changes to avoid scope mismatch
  useEffect(() => {
    form.setValue("templateId", "__none__");
  }, [targetType]);

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
    
    // Remove targetType from payload (not needed by API)
    delete payload.targetType;
    
    // Remove the unused id field based on target type
    if (data.targetType === "property") {
      delete payload.blockId;
    } else {
      delete payload.propertyId;
      delete payload.tenantId; // Block inspections don't have tenant
    }
    
    // Remove templateId if it's the sentinel or empty
    if (payload.templateId === "__none__" || !payload.templateId) {
      delete payload.templateId;
    }
    
    // Remove clerkId if it's the sentinel or empty
    if (payload.clerkId === "__none__" || !payload.clerkId) {
      delete payload.clerkId;
    }
    
    // Remove tenantId if empty or sentinel
    if (payload.tenantId === "__none__" || !payload.tenantId) {
      delete payload.tenantId;
    }
    
    createInspection.mutate(payload);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string; className?: string }> = {
      draft: { variant: "outline", label: "Draft", className: "border-muted-foreground/50 text-muted-foreground" },
      scheduled: { variant: "outline", label: "Scheduled", className: "border-blue-500 text-blue-600 dark:text-blue-400" },
      in_progress: { variant: "default", label: "In Progress", className: "bg-amber-500 text-white dark:bg-amber-600" },
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
      esg_sustainability_inspection: "ESG Sustainability Inspection",
      fire_hazard_assessment: "Fire Hazard Assessment",
      maintenance_inspection: "Maintenance Inspection",
      damage: "Damage",
      emergency: "Emergency",
      safety_compliance: "Safety & Compliance",
      compliance_regulatory: "Compliance / Regulatory",
      pre_purchase: "Pre-Purchase",
      specialized: "Specialized",
    };
    return <Badge variant="outline">{labels[type] || type}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="flex justify-center items-center h-64">
          <p className="text-muted-foreground">Loading inspections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold" data-testid="text-page-title">Inspections</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Manage and conduct property inspections
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-inspection" size="sm" className="text-xs md:text-sm h-8 md:h-10 px-2 md:px-4">
              <Plus className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">New Inspection</span>
              <span className="sm:hidden">New</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Inspection</DialogTitle>
              <DialogDescription>
                Schedule a new inspection for a block or property unit
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="targetType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Inspection Target</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue("propertyId", "");
                          form.setValue("blockId", "");
                          form.setValue("tenantId", "");
                          setSelectedPropertyId("");
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-target-type">
                            <SelectValue placeholder="Select target type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="property">Property (Unit)</SelectItem>
                          <SelectItem value="block">Block (Building)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.watch("targetType") === "block" && (
                  <FormField
                    control={form.control}
                    name="blockId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Block</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-block">
                              <SelectValue placeholder="Select block" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {blocks.map((block: any) => (
                              <SelectItem key={block.id} value={block.id}>
                                {block.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {form.watch("targetType") === "property" && (
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
                            form.setValue("tenantId", "");
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
                )}

                {/* Active Tenants Display */}
                {form.watch("targetType") === "property" && selectedPropertyId && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Active Tenants
                    </div>
                    {tenants.filter((t: any) => t.assignment?.isActive).length === 0 ? (
                      <div className="rounded-md border border-dashed p-3 text-center">
                        <p className="text-sm text-muted-foreground">No active tenants at this property</p>
                      </div>
                    ) : (
                      <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                        {tenants
                          .filter((t: any) => t.assignment?.isActive)
                          .map((tenant: any) => {
                            const firstName = tenant.tenant?.firstName || tenant.firstName || "";
                            const lastName = tenant.tenant?.lastName || tenant.lastName || "";
                            const fullName = `${firstName} ${lastName}`.trim() || "Unnamed Tenant";
                            const initials = fullName
                              .split(" ")
                              .map((n: string) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2);
                            const email = tenant.tenant?.email || tenant.email || "";
                            
                            return (
                              <div 
                                key={tenant.id} 
                                className="flex items-center gap-3 p-2 rounded-md bg-background"
                                data-testid={`tenant-item-${tenant.id}`}
                              >
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={tenant.tenant?.profileImageUrl} alt={fullName} />
                                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{fullName}</p>
                                  {email && (
                                    <p className="text-xs text-muted-foreground truncate">{email}</p>
                                  )}
                                </div>
                                <Badge variant="secondary" className="text-xs shrink-0">Active</Badge>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}

                {form.watch("targetType") === "property" && selectedPropertyId && tenants.length > 0 && (
                  <FormField
                    control={form.control}
                    name="tenantId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assign to Tenant (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "__none__"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-tenant">
                              <SelectValue placeholder="Select tenant" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">No Tenant Selected</SelectItem>
                            {tenants.map((tenant: any) => (
                              <SelectItem key={tenant.id} value={tenant.id}>
                                {tenant.firstName} {tenant.lastName}
                                {tenant.assignment?.isActive && " (Active)"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

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
                          <SelectItem value="esg_sustainability_inspection">ESG Sustainability Inspection</SelectItem>
                          <SelectItem value="fire_hazard_assessment">Fire Hazard Assessment</SelectItem>
                          <SelectItem value="maintenance_inspection">Maintenance Inspection</SelectItem>
                          <SelectItem value="damage">Damage</SelectItem>
                          <SelectItem value="emergency">Emergency</SelectItem>
                          <SelectItem value="safety_compliance">Safety & Compliance</SelectItem>
                          <SelectItem value="compliance_regulatory">Compliance / Regulatory</SelectItem>
                          <SelectItem value="pre_purchase">Pre-Purchase</SelectItem>
                          <SelectItem value="specialized">Specialized</SelectItem>
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
                      <FormLabel>Assign to Inspector (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-clerk">
                            <SelectValue placeholder="Select team member" />
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

      {/* Filters - Desktop */}
      <Card className="hidden md:block">
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
            <div className="flex-1 min-w-[150px] max-w-[180px]">
              <label className="text-sm font-medium mb-1.5 block">Status</label>
              <Select value={filterStatus || "__all__"} onValueChange={(value) => setFilterStatus(value === "__all__" ? "" : value)}>
                <SelectTrigger data-testid="filter-status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px] max-w-xs">
              <label className="text-sm font-medium mb-1.5 block">Tenant</label>
              <Select value={filterTenantId || "__all__"} onValueChange={(value) => setFilterTenantId(value === "__all__" ? "" : value)}>
                <SelectTrigger data-testid="filter-tenant">
                  <SelectValue placeholder="All tenants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All tenants</SelectItem>
                  {sortedActiveTenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="filter-overdue"
                  checked={filterOverdue}
                  onCheckedChange={(checked) => setFilterOverdue(checked === true)}
                  data-testid="filter-overdue"
                />
                <label htmlFor="filter-overdue" className="text-sm font-medium cursor-pointer">
                  Overdue
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="filter-due-soon"
                  checked={filterDueSoon}
                  onCheckedChange={(checked) => setFilterDueSoon(checked === true)}
                  data-testid="filter-due-soon"
                />
                <label htmlFor="filter-due-soon" className="text-sm font-medium cursor-pointer">
                  Due Soon
                </label>
              </div>
            </div>
            {(filterBlockId || filterPropertyId || filterStatus || filterOverdue || filterDueSoon || filterTenantId) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilterBlockId("");
                  setFilterPropertyId("");
                  setFilterStatus("");
                  setFilterOverdue(false);
                  setFilterDueSoon(false);
                  setFilterTenantId("");
                }}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filters - Mobile */}
      <div className="flex md:hidden gap-2 items-center mb-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0">
              <Filter className="w-4 h-4" />
              {(filterBlockId || filterPropertyId || filterStatus || filterOverdue || filterDueSoon || filterTenantId) && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>
                Filter inspections by block, property, status, tenant, or date
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 mt-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Block</label>
                <Select value={filterBlockId || "__all__"} onValueChange={(value) => setFilterBlockId(value === "__all__" ? "" : value)}>
                  <SelectTrigger>
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

              <div className="space-y-2">
                <label className="text-sm font-medium">Property</label>
                <Select 
                  value={filterPropertyId || "__all__"} 
                  onValueChange={(value) => setFilterPropertyId(value === "__all__" ? "" : value)}
                  disabled={!filterBlockId && filteredProperties.length === 0}
                >
                  <SelectTrigger>
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

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={filterStatus || "__all__"} onValueChange={(value) => setFilterStatus(value === "__all__" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tenant</label>
                <Select value={filterTenantId || "__all__"} onValueChange={(value) => setFilterTenantId(value === "__all__" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All tenants" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All tenants</SelectItem>
                    {sortedActiveTenants.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium">Options</label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="filter-overdue-mobile"
                    checked={filterOverdue}
                    onCheckedChange={(checked) => setFilterOverdue(checked === true)}
                  />
                  <label htmlFor="filter-overdue-mobile" className="text-sm font-medium cursor-pointer">
                    Overdue
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="filter-due-soon-mobile"
                    checked={filterDueSoon}
                    onCheckedChange={(checked) => setFilterDueSoon(checked === true)}
                  />
                  <label htmlFor="filter-due-soon-mobile" className="text-sm font-medium cursor-pointer">
                    Due Soon
                  </label>
                </div>
              </div>

              {(filterBlockId || filterPropertyId || filterStatus || filterOverdue || filterDueSoon || filterTenantId) && (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    setFilterBlockId("");
                    setFilterPropertyId("");
                    setFilterStatus("");
                    setFilterTenantId("");
                    setFilterOverdue(false);
                    setFilterDueSoon(false);
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear All Filters
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredInspections.map((inspection: any) => (
            <Card key={inspection.id} className="hover-elevate flex flex-col" data-testid={`card-inspection-${inspection.id}`}>
              <CardHeader>
                <div className="flex justify-between items-start gap-2">
                  <CardTitle className="text-lg">
                    {inspection.property?.name || inspection.block?.name || "Unknown Property"}
                  </CardTitle>
                  <div className="flex flex-col items-end gap-1">
                    {getStatusBadge(inspection.status)}
                    {/* Tenant Approval Status - For Check-In Inspections */}
                    {inspection.type === "check_in" && (
                      (() => {
                        // Check if deadline has passed and status is still pending/null - should show as approved
                        const deadline = inspection.tenantApprovalDeadline 
                          ? new Date(inspection.tenantApprovalDeadline)
                          : null;
                        const now = new Date();
                        const isExpired = deadline && deadline < now;
                        const effectiveStatus = isExpired && 
                          (!inspection.tenantApprovalStatus || inspection.tenantApprovalStatus === "pending")
                          ? "approved" 
                          : inspection.tenantApprovalStatus || "pending";
                        
                        return (
                          <Badge 
                            variant="outline" 
                            className={
                              effectiveStatus === "approved" 
                                ? "border-green-500 text-green-600 text-xs"
                                : effectiveStatus === "disputed"
                                ? "border-orange-500 text-orange-600 text-xs"
                                : "border-orange-500 text-orange-600 text-xs"
                            }
                          >
                            {effectiveStatus === "approved" && "Tenant Approved"}
                            {effectiveStatus === "disputed" && "Tenant Disputed"}
                            {effectiveStatus === "pending" && "Tenant Review Pending"}
                          </Badge>
                        );
                      })()
                    )}
                  </div>
                </div>
                <CardDescription className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {inspection.property?.address || inspection.block?.address || "No location"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col">
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
                
                {/* Tenant Comments - For Check-In Inspections */}
                {inspection.type === "check_in" && inspection.tenantComments && (
                  <div className="mt-2 p-3 bg-muted rounded-lg border">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Tenant Comments:</div>
                    <div className="text-sm whitespace-pre-wrap line-clamp-3">{inspection.tenantComments}</div>
                  </div>
                )}
                
                {/* AI Analysis Progress */}
                <InspectionAIAnalysisProgress inspectionId={inspection.id} />
                
                <div className="flex gap-2 flex-wrap mt-auto">
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
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopyClick(inspection)}
                    data-testid={`button-copy-inspection-${inspection.id}`}
                    title="Copy Inspection"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Copy Inspection Dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Copy Inspection</DialogTitle>
            <DialogDescription>
              Create a new inspection based on {inspectionToCopy?.property?.name || inspectionToCopy?.block?.name || "this inspection"}
            </DialogDescription>
          </DialogHeader>
          <Form {...copyForm}>
            <form onSubmit={copyForm.handleSubmit(onCopySubmit)} className="space-y-4">
              <FormField
                control={copyForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Inspection Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-copy-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="check_in">Check-In</SelectItem>
                        <SelectItem value="check_out">Check-Out</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={copyForm.control}
                name="scheduledDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scheduled Date</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field} 
                        data-testid="input-copy-scheduled-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-3">
                <FormLabel>Copy Options</FormLabel>
                <FormField
                  control={copyForm.control}
                  name="copyImages"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-copy-images"
                        />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        Copy images from original inspection
                      </FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={copyForm.control}
                  name="copyText"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-copy-text"
                        />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        Copy notes and conditions from original inspection
                      </FormLabel>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCopyDialogOpen(false)}
                  data-testid="button-copy-cancel"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={copyInspection.isPending}
                  data-testid="button-copy-submit"
                >
                  {copyInspection.isPending ? "Copying..." : "Copy Inspection"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
