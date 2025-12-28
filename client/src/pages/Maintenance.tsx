import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useSearch, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Wrench, Upload, Sparkles, Loader2, X, Check, ChevronsUpDown, Pencil, Clipboard, Calendar, User as UserIcon, AlertCircle, CheckCircle2, Clock, Filter } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import { useLocale } from "@/contexts/LocaleContext";
import { FixfloSyncButton } from "@/components/FixfloSyncButton";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertMaintenanceRequestSchema } from "@shared/schema";
import type { MaintenanceRequest, Property, User } from "@shared/schema";
import { z } from "zod";
import Uppy from "@uppy/core";
import AwsS3 from "@uppy/aws-s3";
import { Dashboard } from "@uppy/react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { cn } from "@/lib/utils";

type MaintenanceRequestWithDetails = MaintenanceRequest & {
  property?: { name: string; address: string };
  reportedByUser?: { firstName: string; lastName: string };
  assignedToUser?: { firstName: string; lastName: string };
};

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

const workOrderStatusColors: Record<string, string> = {
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

const createMaintenanceSchema = insertMaintenanceRequestSchema
  .omit({ organizationId: true }) // Backend adds this from session
  .extend({
    title: z.string().min(1, "Title is required"),
    propertyId: z.string().optional(), // Optional - can log maintenance against block only
    blockId: z.string().optional(),
    priority: z.enum(["low", "medium", "high"]),
    dueDate: z.string().optional().or(z.date().optional()),
  }).refine((data) => data.propertyId || data.blockId, {
    message: "Either a property or a block must be selected",
    path: ["propertyId"],
  });

export default function Maintenance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const locale = useLocale();
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const params = useParams<{ id?: string }>();
  const maintenanceId = params?.id;
  const urlPropertyId = new URLSearchParams(searchParams).get("propertyId");
  const shouldCreate = new URLSearchParams(searchParams).get("create");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAutoOpening, setIsAutoOpening] = useState(false);
  const [editingRequest, setEditingRequest] = useState<MaintenanceRequestWithDetails | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [filterProperty, setFilterProperty] = useState<string>("all");
  const [filterBlock, setFilterBlock] = useState<string>("all");
  const [formBlockFilter, setFormBlockFilter] = useState<string>("all");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentStep, setCurrentStep] = useState<"form" | "images" | "suggestions" | "review">("form");
  const uppyRef = useRef<Uppy | null>(null);
  const processedMaintenanceIdRef = useRef<string | null>(null);
  
  // Work order creation state
  const [isWorkOrderDialogOpen, setIsWorkOrderDialogOpen] = useState(false);
  const [selectedRequestForWorkOrder, setSelectedRequestForWorkOrder] = useState<MaintenanceRequestWithDetails | null>(null);

  // Handle dialog state change
  const handleDialogChange = (open: boolean) => {
    setIsCreateOpen(open);
    if (open && !editingRequest && !isAutoOpening) {
      // Reset form when opening dialog for a new request (unless auto-opening from URL)
      form.reset();
      setCurrentStep("form");
      setUploadedImages([]);
      setAiSuggestions("");
      setFormBlockFilter("all");
    }
    if (!open) {
      // Clear editing state when closing
      setEditingRequest(null);
      setUploadedImages([]);
      setAiSuggestions("");
      setIsAutoOpening(false);
      setFormBlockFilter("all");
    }
    // Don't reset when closing - it would cancel any pending form submission
    // Form will be reset in the mutation onSuccess callback after successful submission
  };

  // Fetch maintenance requests
  const { data: requests = [], isLoading } = useQuery<MaintenanceRequestWithDetails[]>({
    queryKey: ["/api/maintenance"],
  });


  // Fetch properties
  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  // Fetch blocks
  const { data: blocks = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/blocks"],
  });

  // Fetch organization clerks (for assignment)
  const { data: clerks = [] } = useQuery<User[]>({
    queryKey: ["/api/users/clerks"],
    enabled: user?.role === "owner",
  });

  // Fetch work orders (only for owners and contractors)
  const { data: workOrders = [], isLoading: workOrdersLoading } = useQuery<WorkOrder[]>({
    queryKey: ["/api/work-orders"],
    enabled: user?.role === "owner" || user?.role === "contractor",
  });

  // Fetch teams for work order assignment
  const { data: teams = [] } = useQuery<any[]>({
    queryKey: ["/api/teams"],
    enabled: user?.role === "owner",
  });

  // Fetch contractors for work order assignment
  const { data: contractors = [] } = useQuery<any[]>({
    queryKey: ["/api/contacts"],
    enabled: user?.role === "owner",
  });

  // Work order creation mutation
  const createWorkOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/work-orders", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] });
      setIsWorkOrderDialogOpen(false);
      setSelectedRequestForWorkOrder(null);
      toast({ title: "Work order created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create work order", variant: "destructive" });
    },
  });

  // Work order status update mutation
  const updateWorkOrderStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/work-orders/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      toast({ title: "Work order status updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update work order status", variant: "destructive" });
    },
  });

  // Initialize Uppy for image uploads
  useEffect(() => {
    if (isCreateOpen && user?.role === "tenant" && !uppyRef.current) {
      const uppy = new Uppy({
        restrictions: {
          maxFileSize: 10 * 1024 * 1024, // 10MB
          maxNumberOfFiles: 5,
          allowedFileTypes: ["image/*"],
        },
        autoProceed: false,
      });

      uppy.use(AwsS3, {
        shouldUseMultipart: false,
        async getUploadParameters(file) {
          try {
            const response = await fetch("/api/objects/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
            });

            if (!response.ok) {
              throw new Error(`Failed to get upload URL: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (!data.uploadURL) {
              throw new Error("Invalid upload URL response");
            }

            // Ensure URL is absolute
            let uploadURL = data.uploadURL;
            if (uploadURL.startsWith('/')) {
              // Convert relative URL to absolute
              uploadURL = `${window.location.origin}${uploadURL}`;
            }

            // Validate URL
            try {
              new URL(uploadURL);
            } catch (e) {
              throw new Error(`Invalid upload URL format: ${uploadURL}`);
            }

            // Extract objectId from upload URL and store in metadata
            try {
              const urlObj = new URL(uploadURL);
              const objectId = urlObj.searchParams.get('objectId');
              if (objectId) {
                uppy.setFileMeta(file.id, { 
                  originalUploadURL: uploadURL,
                  objectId: objectId,
                });
              } else {
                uppy.setFileMeta(file.id, { 
                  originalUploadURL: uploadURL,
                });
              }
            } catch (e) {
              uppy.setFileMeta(file.id, { 
                originalUploadURL: uploadURL,
              });
            }
            
            return {
              method: "PUT" as const,
              url: uploadURL,
              headers: {
                "Content-Type": file.type || "application/octet-stream",
              },
              fields: {},
            };
          } catch (error: any) {
            console.error("[Maintenance] Upload URL error:", error);
            throw new Error(`Failed to get upload URL: ${error.message}`);
          }
        },
      });

      uppy.on("upload-success", async (file, response) => {
        // Import the helper function
        const { extractFileUrlFromUploadResponse } = await import("@/lib/utils");
        let fileUrl = extractFileUrlFromUploadResponse(file, response);
        
        // If extraction failed, try to use objectId from metadata as fallback
        if (!fileUrl && file?.meta?.objectId) {
          fileUrl = `/objects/${file.meta.objectId}`;
          console.log('[Maintenance] Using objectId fallback:', fileUrl);
        }
        
        if (fileUrl) {
          // Convert relative path to absolute URL for display
          const absoluteUrl = fileUrl.startsWith('/') 
            ? `${window.location.origin}${fileUrl}`
            : fileUrl;
          
          setUploadedImages((prev) => {
            if (prev.includes(absoluteUrl)) {
              return prev; // Avoid duplicates
            }
            return [...prev, absoluteUrl];
          });
          
          // Set ACL in background
          fetch('/api/objects/set-acl', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ photoUrl: absoluteUrl }),
          }).catch(error => {
            console.error('[Maintenance] Error setting ACL:', error);
          });
        } else {
          console.error('[Maintenance] No upload URL found in response:', { file, response });
        }
      });

      uppyRef.current = uppy;
    }

    return () => {
      if (uppyRef.current) {
        uppyRef.current.clear();
        uppyRef.current = null;
      }
    };
  }, [isCreateOpen, user?.role]);

  // AI analyze image mutation
  const analyzeMutation = useMutation({
    mutationFn: async ({ imageUrl, description }: { imageUrl: string; description: string }) => {
      const res = await apiRequest("POST", "/api/maintenance/analyze-image", {
        imageUrl,
        issueDescription: description,
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      setAiSuggestions(data.suggestedFixes);
      setCurrentStep("suggestions");
      toast({
        title: "AI Analysis Complete",
        description: "Review the suggested fixes below",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze image",
        variant: "destructive",
      });
    },
  });

  // Create maintenance request mutation
  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createMaintenanceSchema> & { 
      photoUrls?: string[]; 
      aiSuggestedFixes?: string;
    }) => {
      const res = await apiRequest("POST", "/api/maintenance", data);
      return await res.json();
    },
    onSuccess: async () => {
      try {
        console.log("[Maintenance] Request created successfully, refetching queries...");
        
        // Explicitly refetch to ensure we get the latest data
        await queryClient.refetchQueries({ queryKey: ["/api/maintenance"] });
        
        console.log("[Maintenance] Refetch complete, showing toast...");
        
        toast({
          title: "Success",
          description: "Maintenance request created successfully",
        });
        
        console.log("[Maintenance] Cleaning up form state...");
        
        setIsCreateOpen(false);
        form.reset();
        setUploadedImages([]);
        setAiSuggestions("");
        setCurrentStep("form");
        
        console.log("[Maintenance] Form cleanup complete");
      } catch (error) {
        console.error("[Maintenance] Error in onSuccess:", error);
        toast({
          title: "Warning",
          description: "Request created but there was an issue refreshing the list",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      console.error("[Maintenance] Failed to create maintenance request:", error);
      toast({
        title: "Error",
        description: "Failed to create maintenance request",
        variant: "destructive",
      });
    },
  });

  // Update maintenance request mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<z.infer<typeof createMaintenanceSchema>> & { photoUrls?: string[]; aiSuggestedFixes?: string } }) => {
      const res = await apiRequest("PATCH", `/api/maintenance/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] });
      toast({
        title: "Success",
        description: "Maintenance request updated successfully",
      });
      
      setIsCreateOpen(false);
      setEditingRequest(null);
      form.reset();
      setUploadedImages([]);
      setAiSuggestions("");
      setCurrentStep("form");
    },
    onError: (error) => {
      console.error("[Maintenance] Failed to update maintenance request:", error);
      toast({
        title: "Error",
        description: "Failed to update maintenance request",
        variant: "destructive",
      });
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, assignedTo }: { id: string; status: string; assignedTo?: string }) => {
      const res = await apiRequest("PATCH", `/api/maintenance/${id}`, { status, assignedTo });
      return await res.json();
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
      propertyId: "",
      blockId: "",
      priority: "medium",
      reportedBy: user?.id || "",
    },
  });

  // Auto-open maintenance request when ID is in URL (must be after form initialization)
  useEffect(() => {
    // Only process if we have an ID, haven't processed it yet, have requests loaded, and dialog isn't already open
    if (maintenanceId && 
        maintenanceId !== processedMaintenanceIdRef.current && 
        requests.length > 0 && 
        !editingRequest && 
        !isCreateOpen) {
      const request = requests.find(r => r.id === maintenanceId);
      if (request) {
        processedMaintenanceIdRef.current = maintenanceId;
        // Use handleEdit logic to ensure consistency
        setEditingRequest(request);
        form.reset({
          title: request.title,
          description: request.description || "",
          propertyId: request.propertyId || undefined,
          blockId: request.blockId || undefined,
          priority: request.priority as "low" | "medium" | "high",
          reportedBy: request.reportedBy || "",
          dueDate: request.dueDate ? (() => {
        try {
          // Parse the date and convert to ISO string format
          const date = typeof request.dueDate === 'string' ? new Date(request.dueDate) : request.dueDate;
          if (isNaN(date.getTime())) return undefined;
          // Extract just the date part (YYYY-MM-DD) and add time to make it a valid ISO string for the form
          const datePart = date.toISOString().split('T')[0];
          return datePart ? `${datePart}T00:00:00.000Z` : undefined;
        } catch {
          return undefined;
        }
      })() : undefined,
        });
        setUploadedImages(request.photoUrls || []);
        setAiSuggestions(request.aiSuggestedFixes || "");
        setCurrentStep("form");
        setIsCreateOpen(true);
        setIsAutoOpening(true);
        // Clear the ID from URL after opening
        navigate("/maintenance", { replace: true });
      } else {
        // Request not found, show error and redirect
        processedMaintenanceIdRef.current = maintenanceId; // Mark as processed to prevent retry
        toast({
          title: "Maintenance request not found",
          description: "The requested maintenance request could not be found.",
          variant: "destructive",
        });
        navigate("/maintenance", { replace: true });
      }
    }
    
    // Reset processed ID when maintenanceId changes or becomes null
    if (!maintenanceId && processedMaintenanceIdRef.current) {
      processedMaintenanceIdRef.current = null;
    }
  }, [maintenanceId, requests, editingRequest, isCreateOpen, navigate, toast, form]);

  // Handle URL parameters for auto-opening dialog and pre-populating
  useEffect(() => {
    if (urlPropertyId && shouldCreate === "true" && properties.length > 0) {
      // Set flag to prevent form reset
      setIsAutoOpening(true);
      // Pre-populate property before opening dialog
      form.setValue("propertyId", urlPropertyId);
      // Auto-open dialog
      setIsCreateOpen(true);
      // Clear URL parameters after opening to keep URL clean
      navigate("/maintenance", { replace: true });
    }
  }, [urlPropertyId, shouldCreate, properties, navigate]);

  const handleImageStep = async () => {
    if (uploadedImages.length === 0) {
      toast({
        title: "Image Required",
        description: "Please upload at least one image of the issue",
        variant: "destructive",
      });
      return;
    }

    // Get AI analysis
    setIsAnalyzing(true);
    try {
      await analyzeMutation.mutateAsync({
        imageUrl: uploadedImages[0],
        description: form.getValues("description") || form.getValues("title"),
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const onSubmit = (data: z.infer<typeof createMaintenanceSchema>) => {
    // For tenants, require images and show AI suggestions first
    if (user?.role === "tenant" && currentStep === "form" && !editingRequest) {
      setCurrentStep("images");
      return;
    }

    // Submit with images and AI suggestions
    const payload = { 
      ...data, 
      reportedBy: user?.id || "",
      photoUrls: uploadedImages.length > 0 ? uploadedImages : undefined,
      aiSuggestedFixes: aiSuggestions || undefined,
    };
    
    if (editingRequest) {
      updateMutation.mutate({ id: editingRequest.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // Handle edit button click
  const handleEdit = (request: MaintenanceRequestWithDetails) => {
    setEditingRequest(request);
    form.reset({
      title: request.title,
      description: request.description || "",
      propertyId: request.propertyId || undefined,
      blockId: request.blockId || undefined,
      priority: request.priority as "low" | "medium" | "high",
      reportedBy: request.reportedBy || "",
      dueDate: request.dueDate ? (() => {
        // Convert dueDate to ISO string format for the form
        const dateStr = typeof request.dueDate === 'string' ? request.dueDate : new Date(request.dueDate).toISOString();
        // Extract just the date part (YYYY-MM-DD) and add time to make it a valid ISO string
        const datePart = dateStr.split('T')[0];
        return datePart ? `${datePart}T00:00:00.000Z` : undefined;
      })() : undefined,
    });
    setUploadedImages(request.photoUrls || []);
    setAiSuggestions(request.aiSuggestedFixes || "");
    setCurrentStep("form");
    setIsCreateOpen(true);
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
      in_progress: { variant: "default", label: "In Progress" },
      completed: { variant: "secondary", label: "Completed" },
      closed: { variant: "secondary", label: "Closed" },
    };
    const config = variants[status] || variants.open;
    return <Badge variant={config.variant} data-testid={`badge-status-${status}`}>{config.label}</Badge>;
  };

  // Filter by status, property, block, and tenant (if tenant user)
  let filteredRequests = selectedStatus === "all" 
    ? requests 
    : requests.filter(r => r.status === selectedStatus);
  
  // Filter by property
  if (filterProperty !== "all") {
    filteredRequests = filteredRequests.filter(r => r.propertyId === filterProperty);
  }
  
  // Filter by block (find properties in block first)
  if (filterBlock !== "all") {
    const blockPropertyIds = properties.filter(p => p.blockId === filterBlock).map(p => p.id);
    filteredRequests = filteredRequests.filter(r => r.propertyId && blockPropertyIds.includes(r.propertyId));
  }
  
  // Tenants should only see their own requests
  if (user?.role === "tenant") {
    filteredRequests = filteredRequests.filter(r => r.reportedBy === user.id);
  }

  // Work order helper functions
  const formatCurrency = (amount?: number | null) => {
    if (!amount) return "N/A";
    return `£${(amount / 100).toFixed(2)}`;
  };

  const getWorkOrderStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4" />;
      case "in_progress":
      case "waiting_parts":
        return <Clock className="h-4 w-4" />;
      case "rejected":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <UserIcon className="h-4 w-4" />;
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold" data-testid="heading-maintenance">
            Maintenance
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            {user?.role === "tenant" 
              ? "Submit and track your maintenance requests" 
              : "Manage maintenance requests and contractor work orders"}
          </p>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            {user?.role === "tenant" 
              ? "Submit and track your maintenance requests" 
              : "Manage maintenance requests and contractor work orders"}
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-request" size="sm" className="text-xs md:text-sm h-8 md:h-10 px-2 md:px-4 w-full sm:w-auto">
              <Plus className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">New Request</span>
              <span className="sm:hidden">New</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingRequest 
                  ? "Edit Maintenance Request" 
                  : user?.role === "tenant" ? "Report Maintenance Issue" : "Create Maintenance Request"}
              </DialogTitle>
              <DialogDescription>
                {user?.role === "tenant" && currentStep === "images" 
                  ? "Upload photos of the issue for AI analysis"
                  : user?.role === "tenant" && currentStep === "suggestions"
                  ? "Review AI-suggested fixes before submitting"
                  : "Submit a new maintenance request for a property"}
              </DialogDescription>
            </DialogHeader>

            {/* Tenant Multi-Step Flow */}
            {user?.role === "tenant" ? (
              <div className="space-y-4">
                {/* Step 1: Basic Form */}
                {currentStep === "form" && (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>What's the issue?</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g., Leaking faucet" data-testid="input-title" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="propertyId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Which property?</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-property">
                                  <SelectValue placeholder="Select your property" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {properties.map((property) => (
                                  <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>
                                ))}
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
                            <FormLabel>Details</FormLabel>
                            <FormControl>
                              <Textarea {...field} value={field.value || ""} placeholder="Describe the issue..." data-testid="input-description" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dueDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Due Date (Optional)</FormLabel>
                            <FormControl>
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                <Input
                                  type="date"
                                  value={field.value ? (typeof field.value === 'string' ? field.value.split('T')[0] : new Date(field.value).toISOString().split('T')[0]) : ""}
                                  onChange={(e) => {
                                    const dateValue = e.target.value;
                                    field.onChange(dateValue ? new Date(dateValue).toISOString() : null);
                                  }}
                                  data-testid="input-due-date"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" className="w-full" data-testid="button-next-upload">
                        Next: Upload Photos <Upload className="w-4 h-4 ml-2" />
                      </Button>
                    </form>
                  </Form>
                )}

                {/* Step 2: Image Upload */}
                {currentStep === "images" && uppyRef.current && (
                  <div className="space-y-4">
                    <Dashboard uppy={uppyRef.current} proudlyDisplayPoweredByUppy={false} height={300} />
                    <div className="flex flex-col gap-2">
                      {uploadedImages.length > 0 && (
                        <p className="text-sm text-muted-foreground">{uploadedImages.length} image(s) uploaded</p>
                      )}
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setCurrentStep("form")} className="flex-1" data-testid="button-back-to-form">Back</Button>
                        <Button onClick={handleImageStep} disabled={isAnalyzing} className="flex-1" data-testid="button-get-ai-suggestions">
                          {isAnalyzing ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
                          ) : (
                            <><Sparkles className="w-4 h-4 mr-2" /> Get AI Suggestions</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: AI Suggestions */}
                {currentStep === "suggestions" && (
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-primary" />
                          AI-Suggested Fixes
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm whitespace-pre-wrap">{aiSuggestions}</p>
                      </CardContent>
                    </Card>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setCurrentStep("images")} className="flex-1" data-testid="button-back-to-images">Back</Button>
                      <Button onClick={form.handleSubmit(onSubmit)} disabled={createMutation.isPending} className="flex-1" data-testid="button-submit-final">
                        {createMutation.isPending ? "Submitting..." : "Submit Request"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Standard Form for Non-Tenants with Image Upload and AI */
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., Leaking faucet" data-testid="input-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {/* Block Selection - can be used alone or to filter properties */}
                  <FormField
                    control={form.control}
                    name="blockId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Block (Optional)</FormLabel>
                        <Select 
                          value={field.value || "none"} 
                          onValueChange={(value) => {
                            const blockValue = value === "none" ? "" : value;
                            field.onChange(blockValue);
                            setFormBlockFilter(blockValue || "all");
                            form.setValue("propertyId", "");
                          }}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-form-block">
                              <SelectValue placeholder="Select a block..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {blocks.map((block) => (
                              <SelectItem key={block.id} value={block.id}>
                                {block.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Select a block to log maintenance at block level, or to filter the property list
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="propertyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Property (Optional if block selected)</FormLabel>
                        <Select 
                          onValueChange={(value) => field.onChange(value === "none" ? "" : value)} 
                          value={field.value || "none"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-property">
                              <SelectValue placeholder="Select a property" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None (Block-level only)</SelectItem>
                            {properties
                              .filter(p => formBlockFilter === "all" || p.blockId === formBlockFilter)
                              .map((property) => (
                                <SelectItem key={property.id} value={property.id}>
                                  {property.name}
                                  {property.address ? ` - ${property.address}` : ""}
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
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Due Date (Optional)</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <Input
                              type="date"
                              value={field.value ? (typeof field.value === 'string' ? field.value.split('T')[0] : new Date(field.value).toISOString().split('T')[0]) : ""}
                              onChange={(e) => {
                                const dateValue = e.target.value;
                                field.onChange(dateValue ? new Date(dateValue).toISOString() : null);
                              }}
                              data-testid="input-due-date"
                            />
                          </div>
                        </FormControl>
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
                          <Textarea {...field} value={field.value || ""} placeholder="Provide details..." data-testid="input-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Image Upload Section */}
                  <div className="space-y-2">
                    <FormLabel>Photos (Optional)</FormLabel>
                    <ObjectUploader
                      maxNumberOfFiles={5}
                      onGetUploadParameters={async () => {
                        const response = await fetch('/api/objects/upload', {
                          method: 'POST',
                          credentials: 'include',
                        });
                        const { uploadURL } = await response.json();
                        return {
                          method: 'PUT',
                          url: uploadURL,
                        };
                      }}
                      onComplete={async (result) => {
                        try {
                          if (result.successful && result.successful.length > 0) {
                            const newPaths: string[] = [];
                            for (const file of result.successful) {
                              let uploadURL = file.uploadURL;
                              
                              // Normalize URL: if absolute, extract pathname; if relative, use as is
                              if (uploadURL && (uploadURL.startsWith('http://') || uploadURL.startsWith('https://'))) {
                                try {
                                  const urlObj = new URL(uploadURL);
                                  uploadURL = urlObj.pathname;
                                } catch (e) {
                                  console.error('[Maintenance] Invalid upload URL:', uploadURL);
                                  continue; // Skip this file
                                }
                              }
                              
                              // Ensure it's a relative path starting with /objects/
                              if (!uploadURL || !uploadURL.startsWith('/objects/')) {
                                console.error('[Maintenance] Invalid file URL format:', uploadURL);
                                continue; // Skip this file
                              }
                              
                              // Convert to absolute URL for ACL call
                              const absoluteUrl = `${window.location.origin}${uploadURL}`;
                              const response = await fetch('/api/objects/set-acl', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({ photoUrl: absoluteUrl }),
                              });
                              
                              if (!response.ok) {
                                throw new Error('Failed to set photo permissions');
                              }
                              
                              const { objectPath } = await response.json();
                              newPaths.push(objectPath);
                            }
                            
                            if (newPaths.length > 0) {
                              setUploadedImages(prev => [...prev, ...newPaths]);
                            } else {
                              toast({
                                title: "Upload Error",
                                description: "No photos were uploaded successfully. Please try again.",
                                variant: "destructive",
                              });
                            }
                          }
                        } catch (error) {
                          console.error('[Maintenance] Photo upload error:', error);
                          toast({
                            title: "Upload Error",
                            description: "Failed to upload one or more photos. Please try again.",
                            variant: "destructive",
                          });
                        }
                      }}
                      buttonClassName="w-full"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Photos
                    </ObjectUploader>
                    {uploadedImages.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {uploadedImages.map((img, idx) => (
                          <div key={idx} className="relative" data-testid={`photo-preview-${idx}`}>
                            <img 
                              src={img} 
                              alt={`Upload ${idx + 1}`} 
                              className="h-20 w-20 object-cover rounded border"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute -top-2 -right-2 h-6 w-6"
                              onClick={() => setUploadedImages(prev => prev.filter((_, i) => i !== idx))}
                              data-testid={`button-remove-photo-${idx}`}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* AI Analysis Button */}
                  {uploadedImages.length > 0 && !aiSuggestions && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        setIsAnalyzing(true);
                        try {
                          await analyzeMutation.mutateAsync({
                            imageUrl: uploadedImages[0],
                            description: form.getValues("description") || form.getValues("title"),
                          });
                        } finally {
                          setIsAnalyzing(false);
                        }
                      }}
                      disabled={isAnalyzing}
                      className="w-full"
                      data-testid="button-analyze-images"
                    >
                      {isAnalyzing ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
                      ) : (
                        <><Sparkles className="w-4 h-4 mr-2" /> Get AI Suggestions</>
                      )}
                    </Button>
                  )}

                  {/* AI Suggestions Display */}
                  {aiSuggestions && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Sparkles className="w-4 h-4 text-primary" />
                          AI-Suggested Fixes
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm whitespace-pre-wrap">{aiSuggestions}</p>
                      </CardContent>
                    </Card>
                  )}

                  <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-request">
                    {createMutation.isPending || updateMutation.isPending 
                      ? editingRequest ? "Updating..." : "Creating..." 
                      : editingRequest ? "Update Request" : "Create Request"}
                  </Button>
                </form>
              </Form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs for Requests and Work Orders */}
      <Tabs defaultValue="requests" className="space-y-6">
        <TabsList>
          <TabsTrigger value="requests" data-testid="tab-requests">
            <Wrench className="w-4 h-4 mr-2" />
            Requests
          </TabsTrigger>
          {(user?.role === "owner" || user?.role === "contractor") && (
            <TabsTrigger value="work-orders" data-testid="tab-work-orders">
              <Clipboard className="w-4 h-4 mr-2" />
              Work Orders
            </TabsTrigger>
          )}
        </TabsList>

        {/* REQUESTS TAB */}
        <TabsContent value="requests" className="space-y-6">
          {/* Filters (hidden for tenants) - Desktop */}
          {user?.role !== "tenant" && (
            <>
              <div className="hidden md:flex flex-wrap gap-4 items-center">
              {/* Status Filter Buttons */}
              <div className="flex gap-2 flex-wrap">
                {["all", "open", "in_progress", "completed", "closed"].map((status) => (
                  <Button
                    key={status}
                    variant={selectedStatus === status ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedStatus(status)}
                    data-testid={`button-filter-${status}`}
                  >
                    {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ")}
                  </Button>
                ))}
              </div>

              {/* Block Filter */}
              <Select value={filterBlock} onValueChange={setFilterBlock}>
                <SelectTrigger className="w-[180px]" data-testid="select-filter-block">
                  <SelectValue placeholder="All Blocks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blocks</SelectItem>
                  {blocks.map((block) => (
                    <SelectItem key={block.id} value={block.id}>
                      {block.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Property Filter */}
              <Select value={filterProperty} onValueChange={setFilterProperty}>
                <SelectTrigger className="w-[180px]" data-testid="select-filter-property">
                  <SelectValue placeholder="All Properties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Properties</SelectItem>
                  {properties
                    .filter(p => filterBlock === "all" || p.blockId === filterBlock)
                    .map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              {/* Clear Filters */}
              {(filterBlock !== "all" || filterProperty !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterBlock("all");
                    setFilterProperty("all");
                  }}
                  data-testid="button-clear-filters"
                >
                  <X className="w-4 h-4 mr-1" />
                  Clear
                </Button>
              )}
              </div>

              {/* Filters - Mobile */}
              <div className="flex md:hidden gap-2 items-center mb-4">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="shrink-0">
                      <Filter className="w-4 h-4" />
                      {(selectedStatus !== "all" || filterBlock !== "all" || filterProperty !== "all") && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>Filters</SheetTitle>
                      <SheetDescription>
                        Filter maintenance requests by status, block, or property
                      </SheetDescription>
                    </SheetHeader>
                    <div className="space-y-4 mt-6">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Status</label>
                        <div className="flex gap-2 flex-wrap">
                          {["all", "open", "in_progress", "completed", "closed"].map((status) => (
                            <Button
                              key={status}
                              variant={selectedStatus === status ? "default" : "outline"}
                              size="sm"
                              onClick={() => setSelectedStatus(status)}
                              className="flex-1 min-w-[100px]"
                            >
                              {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ")}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Block</label>
                        <Select value={filterBlock} onValueChange={setFilterBlock}>
                          <SelectTrigger>
                            <SelectValue placeholder="All Blocks" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Blocks</SelectItem>
                            {blocks.map((block) => (
                              <SelectItem key={block.id} value={block.id}>
                                {block.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Property</label>
                        <Select value={filterProperty} onValueChange={setFilterProperty}>
                          <SelectTrigger>
                            <SelectValue placeholder="All Properties" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Properties</SelectItem>
                            {properties
                              .filter(p => filterBlock === "all" || p.blockId === filterBlock)
                              .map((property) => (
                                <SelectItem key={property.id} value={property.id}>
                                  {property.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {(selectedStatus !== "all" || filterBlock !== "all" || filterProperty !== "all") && (
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => {
                            setSelectedStatus("all");
                            setFilterBlock("all");
                            setFilterProperty("all");
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
            </>
          )}

      {/* Maintenance Requests List */}
      <div className="space-y-4">
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
              <CardHeader className="p-4 md:p-6">
                <div className="flex flex-col gap-4">
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <CardTitle className="text-base md:text-lg flex-1" data-testid={`text-title-${request.id}`}>
                        {request.title}
                      </CardTitle>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(user?.role === "owner" || user?.role === "clerk") && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEdit(request)}
                            data-testid={`button-edit-${request.id}`}
                            className="h-8 w-8"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        <div className="flex flex-col gap-1">
                          {getPriorityBadge(request.priority)}
                          {getStatusBadge(request.status)}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs md:text-sm text-muted-foreground">
                      <span data-testid={`text-property-${request.id}`}>
                        {request.property?.name || "Unknown"}
                      </span>
                      {request.property?.address && (
                        <span className="hidden sm:inline">• {request.property.address}</span>
                      )}
                      {request.dueDate ? (
                        <span>• Due {format(new Date(request.dueDate), 'PPP')}</span>
                      ) : (
                        <span>• Created {format(new Date(request.createdAt?.toString() || Date.now()), 'PPP')}</span>
                      )}
                    </div>
                    {(user?.role === "owner" || user?.role === "clerk") && (
                      <div className="mt-2">
                        <FixfloSyncButton
                          requestId={request.id}
                          propertyId={request.propertyId}
                          fixfloIssueId={request.fixfloIssueId}
                          fixfloStatus={request.fixfloStatus}
                          fixfloContractorName={request.fixfloContractorName}
                          title={request.title}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4 md:p-6 pt-0">
                {request.description && (
                  <p className="text-sm text-muted-foreground" data-testid={`text-description-${request.id}`}>
                    {request.description}
                  </p>
                )}
                
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t">
                  <div className="text-xs md:text-sm">
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
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Select
                        value={request.status}
                        onValueChange={(status) => 
                          updateStatusMutation.mutate({ id: request.id, status })
                        }
                      >
                        <SelectTrigger className="w-full sm:w-40" data-testid={`select-status-${request.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open" data-testid={`option-status-open-${request.id}`}>Open</SelectItem>
                          <SelectItem value="in_progress" data-testid={`option-status-progress-${request.id}`}>In Progress</SelectItem>
                          <SelectItem value="completed" data-testid={`option-status-completed-${request.id}`}>Completed</SelectItem>
                          <SelectItem value="closed" data-testid={`option-status-closed-${request.id}`}>Closed</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {!request.assignedTo && clerks.length > 0 && (
                        <Select
                          onValueChange={(assignedTo) =>
                            updateStatusMutation.mutate({ 
                              id: request.id, 
                              status: "in_progress",
                              assignedTo 
                            })
                          }
                        >
                          <SelectTrigger className="w-full sm:w-40" data-testid={`select-assign-${request.id}`}>
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
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedRequestForWorkOrder(request);
                          setIsWorkOrderDialogOpen(true);
                        }}
                        data-testid={`button-create-work-order-${request.id}`}
                        className="w-full sm:w-auto"
                      >
                        <Clipboard className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">Create Work Order</span>
                        <span className="sm:hidden">Work Order</span>
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
        </TabsContent>

        {/* WORK ORDERS TAB */}
        <TabsContent value="work-orders" className="space-y-6">
          {workOrdersLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading work orders...</div>
          ) : workOrders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <UserIcon className="h-12 w-12 text-muted-foreground mb-4" />
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
                          {getWorkOrderStatusIcon(workOrder.status)}
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
                      <Badge className={workOrderStatusColors[workOrder.status]}>
                        {workOrder.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      {workOrder.team && (
                        <div className="flex items-center gap-2 text-sm">
                          <UserIcon className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Assigned Team</p>
                            <p className="text-muted-foreground" data-testid={`text-team-${workOrder.id}`}>
                              {workOrder.team.name}
                            </p>
                          </div>
                        </div>
                      )}

                      {workOrder.contractor && (
                        <div className="flex items-center gap-2 text-sm">
                          <UserIcon className="h-4 w-4 text-muted-foreground" />
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
                                ? `Actual: ${formatCurrency(workOrder.costActual)}`
                                : `Est: ${formatCurrency(workOrder.costEstimate)}`}
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
                          onValueChange={(status) => updateWorkOrderStatusMutation.mutate({ id: workOrder.id, status })}
                        >
                          <SelectTrigger className="w-48" data-testid={`select-work-order-status-${workOrder.id}`}>
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
        </TabsContent>
      </Tabs>

      {/* Work Order Creation Dialog */}
      {selectedRequestForWorkOrder && (
        <Dialog open={isWorkOrderDialogOpen} onOpenChange={setIsWorkOrderDialogOpen}>
          <DialogContent className="max-w-2xl" data-testid="dialog-create-work-order">
            <DialogHeader>
              <DialogTitle>Create Work Order</DialogTitle>
              <DialogDescription>
                Create a work order from maintenance request: {selectedRequestForWorkOrder.title}
              </DialogDescription>
            </DialogHeader>
            <WorkOrderForm
              maintenanceRequest={selectedRequestForWorkOrder}
              teams={teams}
              contractors={contractors}
              onSubmit={(data) => createWorkOrderMutation.mutate(data)}
              isSubmitting={createWorkOrderMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Work Order Creation Form Component
function WorkOrderForm({
  maintenanceRequest,
  teams,
  contractors,
  onSubmit,
  isSubmitting,
}: {
  maintenanceRequest: MaintenanceRequestWithDetails;
  teams: any[];
  contractors: any[];
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}) {
  const locale = useLocale();
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedContractorId, setSelectedContractorId] = useState<string>("");
  const [assignedToId, setAssignedToId] = useState<string>("");
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [slaDue, setSlaDue] = useState<string>("");
  const [costEstimate, setCostEstimate] = useState<string>("");

  useEffect(() => {
    setAssignedToId("");
    if (selectedTeamId && selectedTeamId !== "none") {
      setIsLoadingMembers(true);
      fetch(`/api/teams/${selectedTeamId}/members`, { credentials: 'include' })
        .then(res => res.json())
        .then(members => {
          setTeamMembers(members || []);
          setIsLoadingMembers(false);
        })
        .catch(() => {
          setTeamMembers([]);
          setIsLoadingMembers(false);
        });
    } else {
      setTeamMembers([]);
    }
  }, [selectedTeamId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    onSubmit({
      maintenanceRequestId: maintenanceRequest.id,
      teamId: selectedTeamId && selectedTeamId !== "none" ? selectedTeamId : undefined,
      contractorId: selectedContractorId && selectedContractorId !== "none" ? selectedContractorId : undefined,
      assignedToId: assignedToId && assignedToId !== "none" ? assignedToId : undefined,
      slaDue: slaDue ? new Date(slaDue).toISOString() : undefined,
      costEstimate: costEstimate ? Math.round(parseFloat(costEstimate) * 100) : undefined,
      status: "assigned",
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="team">
          Assign to Team
        </label>
        <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
          <SelectTrigger id="team" data-testid="select-team">
            <SelectValue placeholder="Select a team (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {teams.map((team: any) => (
              <SelectItem key={team.id} value={team.id} data-testid={`option-team-${team.id}`}>
                {team.name}
                {team.email && ` (${team.email})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedTeamId && selectedTeamId !== "none" && (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="assigned-to">
            Assigned To (Team Member)
          </label>
          <Select value={assignedToId} onValueChange={setAssignedToId} disabled={isLoadingMembers}>
            <SelectTrigger id="assigned-to" data-testid="select-assigned-to">
              <SelectValue placeholder={isLoadingMembers ? "Loading members..." : "Select a team member (optional)"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {teamMembers.map((member: any) => {
                const person = member.user || member.contact;
                if (!person) return null;
                return (
                  <SelectItem key={member.id} value={member.userId || member.contactId} data-testid={`option-member-${member.id}`}>
                    {person.firstName} {person.lastName}
                    {person.email && ` (${person.email})`}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="contractor">
          Assign to Contractor
        </label>
        <Select value={selectedContractorId} onValueChange={setSelectedContractorId}>
          <SelectTrigger id="contractor" data-testid="select-contractor">
            <SelectValue placeholder="Select a contractor (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {contractors.filter((c: any) => c.type === "contractor").map((contractor: any) => (
              <SelectItem key={contractor.id} value={contractor.id} data-testid={`option-contractor-${contractor.id}`}>
                {contractor.firstName} {contractor.lastName}
                {contractor.email && ` (${contractor.email})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="sla-due">
          SLA Due Date
        </label>
        <Input
          id="sla-due"
          type="datetime-local"
          value={slaDue}
          onChange={(e) => setSlaDue(e.target.value)}
          data-testid="input-sla-due"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="cost-estimate">
          Cost Estimate ({locale.currencySymbol})
        </label>
        <Input
          id="cost-estimate"
          type="number"
          step="0.01"
          placeholder="0.00"
          value={costEstimate}
          onChange={(e) => setCostEstimate(e.target.value)}
          data-testid="input-cost-estimate"
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => {}}
          disabled={isSubmitting}
          data-testid="button-cancel-work-order"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          data-testid="button-submit-work-order"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Work Order"
          )}
        </Button>
      </div>
    </form>
  );
}
