import { PreviewableImage } from "@/components/ImagePreview";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useSearch, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Wrench, Upload, Sparkles, Loader2, X, Check, ChevronsUpDown, Pencil, Trash2, Clipboard, Calendar, User as UserIcon, AlertCircle, CheckCircle2, Clock, Filter } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { useLocale } from "@/contexts/LocaleContext";
import { FixfloSyncButton } from "@/components/FixfloSyncButton";
import { LocaleDateInput } from "@/components/LocaleDateInput";
import {
  MaintenanceAiAnalysisView,
  applyMaintenanceAiNote,
} from "@/components/MaintenanceAiAnalysisView";
import { formatInspectionNote, parseInspectionNote } from "@shared/inspectionNoteSections";
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
import { ObjectUploader } from "@/components/ObjectUploader";
import { ModernFilePickerInline } from "@/components/ModernFilePickerInline";
import { extractFileUrlFromUploadResponse, cn } from "@/lib/utils";
import { useModules } from "@/hooks/use-modules";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { WorkOrderCertificatePanel } from "@/components/WorkOrderCertificatePanel";
import { ClearFiltersButton } from "@/components/ClearFiltersButton";
import { FiltersSection } from "@/components/FiltersSection";
import { pagePad, dialogContentBase } from "@/lib/responsive";

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
  updatedAt?: string;
  assignedToId?: string | null;
  maintenanceRequest: {
    id: string;
    title: string;
    description?: string;
    priority: string;
    propertyId?: string | null;
    blockId?: string | null;
  };
  property?: { id?: string; name?: string } | null;
  block?: { id?: string; name?: string } | null;
  contractor?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    companyName?: string | null;
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

  const { isModuleEnabled, isLoading: isLoadingModules } = useModules();
  // We can't do early return here because other hooks (like useQuery below) might be called conditionally if we don't watch out.
  // Actually, 'Maintenance' component uses useQuery LATER.
  // React rule: Hooks must be called in the same order.
  // If we return early here, all subsequent hooks will NOT optionally run, causing "Rendered fewer hooks than expected".
  // SOLUTION: Move all Hooks to the top, before any early return.

  const isMaintenanceEnabled = isModuleEnabled("maintenance");
  const isAiEnabled = isModuleEnabled("ai_preventative");
  // Work orders ship inside the maintenance marketplace module (no separate work_orders key)
  const isWorkOrdersEnabled = isMaintenanceEnabled;

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentStep, setCurrentStep] = useState<"form" | "images" | "suggestions" | "review">("form");
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const processedMaintenanceIdRef = useRef<string | null>(null);

  // Work order creation state
  const [isWorkOrderDialogOpen, setIsWorkOrderDialogOpen] = useState(false);
  const [selectedRequestForWorkOrder, setSelectedRequestForWorkOrder] = useState<MaintenanceRequestWithDetails | null>(null);
  const [selectedWorkOrderDetail, setSelectedWorkOrderDetail] = useState<WorkOrder | null>(null);
  const [requestToDelete, setRequestToDelete] = useState<MaintenanceRequestWithDetails | null>(null);
  const [workOrderToDelete, setWorkOrderToDelete] = useState<WorkOrder | null>(null);

  const canSeeWorkOrders =
    user?.role === "owner" || user?.role === "contractor" || user?.role === "clerk";
  const isAssigneeRole = user?.role === "clerk" || user?.role === "contractor";
  const tabFromUrl = new URLSearchParams(searchParams).get("tab");
  const defaultWorkOrdersTab =
    tabFromUrl === "work-orders" || (isAssigneeRole && tabFromUrl !== "requests");
  const [activeTab, setActiveTab] = useState(
    defaultWorkOrdersTab && canSeeWorkOrders ? "work-orders" : "requests",
  );

  useEffect(() => {
    if (tabFromUrl === "work-orders" && canSeeWorkOrders) {
      setActiveTab("work-orders");
    } else if (tabFromUrl === "requests") {
      setActiveTab("requests");
    }
  }, [tabFromUrl, canSeeWorkOrders]);

  // Fetch maintenance requests
  const { data: requests = [], isLoading } = useQuery<MaintenanceRequestWithDetails[]>({
    queryKey: ["/api/maintenance"],
    enabled: isMaintenanceEnabled !== false // Only fetch if we're not sure it's disabled, or if it is enabled. Actually better to fetch if enabled.
  });


  // Fetch properties
  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    enabled: isMaintenanceEnabled !== false
  });

  // Fetch blocks
  const { data: blocks = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/blocks"],
    enabled: isMaintenanceEnabled !== false
  });

  // Fetch organization clerks (for assignment)
  const { data: clerks = [] } = useQuery<User[]>({
    queryKey: ["/api/users/clerks"],
    enabled: user?.role === "owner" && isMaintenanceEnabled !== false,
  });

  // Fetch work orders (owners: org-wide; clerks/contractors: assignee-scoped by API)
  const { data: workOrders = [], isLoading: workOrdersLoading } = useQuery<WorkOrder[]>({
    queryKey: ["/api/work-orders"],
    enabled: canSeeWorkOrders && isMaintenanceEnabled !== false,
  });

  // Fetch teams for work order assignment
  const { data: teams = [] } = useQuery<any[]>({
    queryKey: ["/api/teams"],
    enabled: user?.role === "owner" && isMaintenanceEnabled !== false,
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

  const deleteRequestMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/maintenance/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/work-orders"] });
      setRequestToDelete(null);
      toast({
        title: "Request deleted",
        description: "Any linked work orders were deleted automatically.",
      });
    },
    onError: (e: any) => {
      toast({
        title: "Failed to delete request",
        description: e?.message,
        variant: "destructive",
      });
    },
  });

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
      const existingDesc = form.getValues("description") || "";
      const applied = applyMaintenanceAiNote(data.suggestedFixes || "", {
        preferExistingDescription: existingDesc,
      });
      setAiSuggestions(applied.aiSuggestedFixes);
      if (applied.description) {
        form.setValue("description", applied.description);
      }
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

  const handleImageFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploadingImages(true);
    setImageUploadProgress(0);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Get upload parameters
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
          uploadURL = `${window.location.origin}${uploadURL}`;
        }

        // Upload file
        const uploadResponse = await fetch(uploadURL, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type,
          },
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.statusText}`);
        }

        // Extract file URL
        let fileUrl: string | null = null;
        try {
          const text = await uploadResponse.text();
          let responseBody: any = null;
          if (text) {
            try {
              responseBody = JSON.parse(text);
            } catch {
              responseBody = text;
            }
          }

          const mockFile = {
            response: {
              body: responseBody,
              url: uploadResponse.headers.get('Location') || undefined,
            },
            meta: {
              originalUploadURL: uploadURL,
            },
          };

          fileUrl = extractFileUrlFromUploadResponse(mockFile, responseBody);
        } catch (e) {
          // Fallback: extract from upload URL
          try {
            const urlObj = new URL(uploadURL);
            fileUrl = urlObj.pathname;
          } catch {
            fileUrl = uploadURL;
          }
        }

        if (fileUrl) {
          const absoluteUrl = fileUrl.startsWith('/')
            ? `${window.location.origin}${fileUrl}`
            : fileUrl;

          setUploadedImages((prev) => {
            if (prev.includes(absoluteUrl)) {
              return prev;
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
        }

        setImageUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }
    } catch (error: any) {
      console.error('[Maintenance] Upload error:', error);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "Failed to upload images",
      });
    } finally {
      setIsUploadingImages(false);
    }
  };

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

  if (!isLoadingModules && !isMaintenanceEnabled) {
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

  const handleImageStep = async () => {
    if (uploadedImages.length === 0) {
      toast({
        title: "Image Required",
        description: "Please upload at least one image of the issue",
        variant: "destructive",
      });
      return;
    }

    if (!isAiEnabled) {
      setAiSuggestions("");
      setCurrentStep("suggestions");
      return;
    }

    // Get AI analysis
    setIsAnalyzing(true);
    try {
      await analyzeMutation.mutateAsync({
        imageUrl: uploadedImages[0],
        description: [
          form.getValues("title")?.trim() ? `Title: ${form.getValues("title").trim()}` : "",
          form.getValues("description")?.trim() ? `Description: ${form.getValues("description").trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
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

  // Location / tenant scope (used for summary + list)
  let scopedRequests = requests;
  if (filterProperty !== "all") {
    scopedRequests = scopedRequests.filter((r) => r.propertyId === filterProperty);
  }
  if (filterBlock !== "all") {
    const blockPropertyIds = properties.filter((p) => p.blockId === filterBlock).map((p) => p.id);
    scopedRequests = scopedRequests.filter(
      (r) => r.propertyId && blockPropertyIds.includes(r.propertyId),
    );
  }
  if (user?.role === "tenant") {
    scopedRequests = scopedRequests.filter((r) => r.reportedBy === user.id);
  }

  const filteredRequests =
    selectedStatus === "all"
      ? scopedRequests
      : scopedRequests.filter((r) => r.status === selectedStatus);

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
    <div className={cn("container mx-auto min-w-0 space-y-6 md:space-y-8", pagePad)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight" data-testid="heading-maintenance">
            Maintenance
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            {user?.role === "tenant"
              ? "Submit and track your maintenance requests"
              : "Manage requests, filters, and contractor work orders"}
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-request" size="sm" className="text-xs md:text-sm h-9 md:h-10 px-3 md:px-4 w-full sm:w-auto shrink-0">
              <Plus className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5" />
              <span className="hidden sm:inline">New Request</span>
              <span className="sm:hidden">New</span>
            </Button>
          </DialogTrigger>
          <DialogContent className={cn(dialogContentBase, "max-w-2xl")}>
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
                                <LocaleDateInput
                                  value={field.value}
                                  onChange={(ymd) =>
                                    field.onChange(ymd ? `${ymd}T00:00:00.000Z` : undefined)
                                  }
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
                {currentStep === "images" && (
                  <div className="space-y-4">
                    <ModernFilePickerInline
                      onFilesSelected={handleImageFilesSelected}
                      maxFiles={5}
                      accept="image/*"
                      multiple={true}
                      isUploading={isUploadingImages}
                      uploadProgress={imageUploadProgress}
                      height={300}
                    />
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
                  !isAiEnabled ? (
                    <div className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-muted-foreground" />
                            AI Suggestions
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-center py-6">
                          <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-2">
                            <span className="text-xl font-bold">Ivy</span>
                          </div>
                          <h3 className="font-semibold">AI Preventative Maintenance is disabled</h3>
                          <p className="text-sm text-muted-foreground">
                            Predictive maintenance and auto-diagnosis are available in the Premium plan.
                            <br />
                            You can still ask <strong>Ivy</strong> for help!
                          </p>
                        </CardContent>
                      </Card>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setCurrentStep("images")} className="flex-1">Back</Button>
                        <Button onClick={form.handleSubmit(onSubmit)} className="flex-1">
                          Skip & Submit
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <MaintenanceAiAnalysisView
                        note={aiSuggestions}
                        description={form.watch("description") || ""}
                        onDescriptionChange={(value) => {
                          form.setValue("description", value);
                          const sections = parseInspectionNote(aiSuggestions);
                          setAiSuggestions(
                            formatInspectionNote({
                              ...sections,
                              description: value,
                            }),
                          );
                        }}
                      />
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setCurrentStep("images")} className="flex-1" data-testid="button-back-to-images">Back</Button>
                        <Button onClick={form.handleSubmit(onSubmit)} disabled={createMutation.isPending} className="flex-1" data-testid="button-submit-final">
                          {createMutation.isPending ? "Submitting..." : "Submit Request"}
                        </Button>
                      </div>
                    </div>
                  )
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
                            <LocaleDateInput
                              value={field.value}
                              onChange={(ymd) =>
                                field.onChange(ymd ? `${ymd}T00:00:00.000Z` : undefined)
                              }
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
                            <PreviewableImage
                              src={img}
                              alt={`Upload ${idx + 1}`}
                              title="Maintenance photo"
                              showHint={false}
                              gallery={uploadedImages.map((src, photoIndex) => ({
                                src,
                                alt: `Upload ${photoIndex + 1}`,
                                title: "Maintenance photo",
                              }))}
                              index={idx}
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
                          const formTitle = form.getValues("title")?.trim() || "";
                          const formDescription = form.getValues("description")?.trim() || "";
                          const notes = [
                            formTitle ? `Title: ${formTitle}` : "",
                            formDescription ? `Description: ${formDescription}` : "",
                          ]
                            .filter(Boolean)
                            .join("\n");
                          await analyzeMutation.mutateAsync({
                            imageUrl: uploadedImages[0],
                            description: notes,
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
                    <MaintenanceAiAnalysisView
                      note={aiSuggestions}
                      description={form.watch("description") || ""}
                      onDescriptionChange={(value) => {
                        form.setValue("description", value);
                        const sections = parseInspectionNote(aiSuggestions);
                        setAiSuggestions(
                          formatInspectionNote({
                            ...sections,
                            description: value,
                          }),
                        );
                      }}
                    />
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
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value);
          if (value === "work-orders") {
            navigate("/maintenance?tab=work-orders");
          } else {
            navigate("/maintenance?tab=requests");
          }
        }}
        className="space-y-6 md:space-y-8"
      >
        <TabsList>
          <TabsTrigger value="requests" data-testid="tab-requests">
            <Wrench className="w-4 h-4 mr-2" />
            Requests
          </TabsTrigger>
          {canSeeWorkOrders && (
            <TabsTrigger value="work-orders" data-testid="tab-work-orders" disabled={!isWorkOrdersEnabled}>
              <Clipboard className="w-4 h-4 mr-2" />
              Work Orders
            </TabsTrigger>
          )}
        </TabsList>

        {/* REQUESTS TAB */}
        <TabsContent value="requests" className="space-y-6 md:space-y-8">
          {/* Filters (hidden for tenants) */}
          {user?.role !== "tenant" && (
            <FiltersSection headingId="maint-filters-heading">
                <div className="hidden md:flex flex-wrap gap-3 items-center">
                  <div className="flex gap-2 flex-wrap">
                    {["all", "open", "in_progress", "completed", "closed"].map((status) => (
                      <Button
                        key={status}
                        variant={selectedStatus === status ? "default" : "outline"}
                        size="sm"
                        className="h-8"
                        onClick={() => setSelectedStatus(status)}
                        data-testid={`button-filter-${status}`}
                      >
                        {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ")}
                      </Button>
                    ))}
                  </div>

                  <Select value={filterBlock} onValueChange={setFilterBlock}>
                    <SelectTrigger className="w-full sm:w-auto sm:min-w-0 sm:max-w-[11rem] h-8" data-testid="select-filter-block">
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

                  <Select value={filterProperty} onValueChange={setFilterProperty}>
                    <SelectTrigger className="w-full sm:w-auto sm:min-w-0 sm:max-w-[11rem] h-8" data-testid="select-filter-property">
                      <SelectValue placeholder="All Properties" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Properties</SelectItem>
                      {properties
                        .filter((p) => filterBlock === "all" || p.blockId === filterBlock)
                        .map((property) => (
                          <SelectItem key={property.id} value={property.id}>
                            {property.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>

                  {(filterBlock !== "all" || filterProperty !== "all" || selectedStatus !== "all") && (
                    <ClearFiltersButton
                      onClick={() => {
                        setSelectedStatus("all");
                        setFilterBlock("all");
                        setFilterProperty("all");
                      }}
                      data-testid="button-clear-filters"
                    />
                  )}
                </div>

                <div className="flex md:hidden gap-2 items-center">
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm" className="relative">
                        <Filter className="w-4 h-4 mr-2" />
                        Filters
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
                                className="w-full sm:w-auto sm:min-w-0"
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
                                .filter((p) => filterBlock === "all" || p.blockId === filterBlock)
                                .map((property) => (
                                  <SelectItem key={property.id} value={property.id}>
                                    {property.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {(selectedStatus !== "all" || filterBlock !== "all" || filterProperty !== "all") && (
                          <ClearFiltersButton
                            className="w-full"
                            onClick={() => {
                              setSelectedStatus("all");
                              setFilterBlock("all");
                              setFilterProperty("all");
                            }}
                          />
                        )}
                      </div>
                    </SheetContent>
                  </Sheet>
                  <p className="text-xs text-muted-foreground truncate">
                    {filteredRequests.length} shown
                  </p>
                </div>
            </FiltersSection>
          )}

          {/* Maintenance Requests List */}
          <section className="space-y-3" aria-labelledby="maint-list-heading">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              <h2 id="maint-list-heading" className="text-sm font-semibold tracking-tight">
                Requests
              </h2>
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground tabular-nums">
                {filteredRequests.length}
              </span>
            </div>
            <div className="space-y-3">
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
                <Card
                  key={request.id}
                  data-testid={`card-request-${request.id}`}
                  className={cn(
                    "shadow-sm overflow-hidden border-l-4",
                    request.status === "open" && "border-l-blue-500",
                    request.status === "in_progress" && "border-l-amber-500",
                    request.status === "completed" && "border-l-emerald-500",
                    request.status === "closed" && "border-l-slate-400",
                  )}
                >
                  <CardHeader className="p-4 md:p-5">
                    <div className="flex flex-col gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <CardTitle className="text-base md:text-lg flex-1 font-semibold leading-snug" data-testid={`text-title-${request.id}`}>
                            {request.title}
                          </CardTitle>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {(user?.role === "owner" || user?.role === "clerk") && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleEdit(request)}
                                  data-testid={`button-edit-${request.id}`}
                                  className="h-8 w-8"
                                  title="Edit request"
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setRequestToDelete(request)}
                                  data-testid={`button-delete-${request.id}`}
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  title="Delete request"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {getPriorityBadge(request.priority)}
                            {getStatusBadge(request.status)}
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
                            <span>• Due {locale.formatDate(new Date(request.dueDate), "PPP")}</span>
                          ) : (
                            <span>• Created {locale.formatDate(new Date(request.createdAt?.toString() || Date.now()), "PPP")}</span>
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
                  <CardContent className="space-y-3 p-4 md:p-5 pt-0">
                    {request.description && (
                      <p className="text-sm text-muted-foreground line-clamp-3" data-testid={`text-description-${request.id}`}>
                        {request.description}
                      </p>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t">
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
                            <SelectTrigger className="w-full sm:w-40 h-8" data-testid={`select-status-${request.id}`}>
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
                              <SelectTrigger className="w-full sm:w-40 h-8" data-testid={`select-assign-${request.id}`}>
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
                            className="w-full sm:w-auto h-8"
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
          </section>
        </TabsContent>

        {/* WORK ORDERS TAB */}
        <TabsContent value="work-orders" className="space-y-6 md:space-y-8">
          {!isWorkOrdersEnabled ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Clipboard className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Work Orders Module Locked</h3>
                <p className="text-muted-foreground text-center">
                  The Work Orders feature is not enabled for your organization.<br />
                  Please contact your administrator to activate Work Orders.
                </p>
                <Button variant="default" className="mt-6" onClick={() => window.location.href = "/billing"}>
                  View Modules
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Work Orders list */}
              <section className="space-y-3" aria-labelledby="maint-wo-list-heading">
                <div className="flex items-center gap-2">
                  <Clipboard className="h-4 w-4 text-primary" />
                  <h2 id="maint-wo-list-heading" className="text-sm font-semibold tracking-tight">
                    Work Orders
                  </h2>
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {workOrders.length}
                  </span>
                </div>

                {workOrdersLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading work orders...</div>
                ) : workOrders.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <UserIcon className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">
                        {isAssigneeRole ? "No Work Orders Assigned" : "No work orders"}
                      </h3>
                      <p className="text-muted-foreground text-center">
                        {isAssigneeRole
                          ? "You don't have any Work Orders assigned to you yet. New assignments will appear here."
                          : "Create work orders from maintenance requests"}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-3">
                    {workOrders.map((workOrder) => (
                      <Card
                        key={workOrder.id}
                        data-testid={`card-work-order-${workOrder.id}`}
                        className={cn(
                          "shadow-sm overflow-hidden border-l-4",
                          workOrder.status === "assigned" && "border-l-blue-500",
                          workOrder.status === "waiting_parts" && "border-l-orange-500",
                          workOrder.status === "in_progress" && "border-l-amber-500",
                          (workOrder.status === "completed" || workOrder.status === "rejected") && "border-l-emerald-500",
                        )}
                      >
                        <CardHeader className="p-4 md:p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                {getWorkOrderStatusIcon(workOrder.status)}
                                <CardTitle className="text-base md:text-lg font-semibold leading-snug">
                                  {workOrder.maintenanceRequest.title}
                                </CardTitle>
                                <Badge className={priorityColors[workOrder.maintenanceRequest.priority]}>
                                  {workOrder.maintenanceRequest.priority}
                                </Badge>
                              </div>
                              <CardDescription className="line-clamp-2">
                                {workOrder.maintenanceRequest.description || "No description provided"}
                              </CardDescription>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {(user?.role === "owner" || user?.role === "clerk") && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => setWorkOrderToDelete(workOrder)}
                                  data-testid={`button-delete-work-order-${workOrder.id}`}
                                  title="Delete work order"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                              <Badge className={cn(workOrderStatusColors[workOrder.status], "capitalize")}>
                                {workOrder.status.replace("_", " ")}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 md:p-5 pt-0">
                          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                            {(workOrder.property?.name || workOrder.block?.name) && (
                              <div className="flex items-center gap-2 text-sm">
                                <Clipboard className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                  <p className="font-medium">Location</p>
                                  <p className="text-muted-foreground truncate">
                                    {[workOrder.property?.name, workOrder.block?.name].filter(Boolean).join(" · ")}
                                  </p>
                                </div>
                              </div>
                            )}

                            {workOrder.team && (
                              <div className="flex items-center gap-2 text-sm">
                                <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                  <p className="font-medium">Assigned Team</p>
                                  <p className="text-muted-foreground truncate" data-testid={`text-team-${workOrder.id}`}>
                                    {workOrder.team.name}
                                  </p>
                                </div>
                              </div>
                            )}

                            {workOrder.contractor && (
                              <div className="flex items-center gap-2 text-sm">
                                <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                  <p className="font-medium">Contractor</p>
                                  <p className="text-muted-foreground truncate">
                                    {workOrder.contractor.firstName} {workOrder.contractor.lastName}
                                  </p>
                                </div>
                              </div>
                            )}

                            {workOrder.slaDue && (
                              <div className="flex items-center gap-2 text-sm">
                                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
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
                                <span className="h-4 w-4 text-muted-foreground flex items-center justify-center font-semibold shrink-0">£</span>
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
                              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div>
                                <p className="font-medium">Created</p>
                                <p className="text-muted-foreground">
                                  {formatDistanceToNow(new Date(workOrder.createdAt), { addSuffix: true })}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-3 pt-3 border-t">
                            {isAssigneeRole && workOrder.status !== "completed" && workOrder.status !== "rejected" && (
                              <div className="flex items-center gap-2">
                                <label className="text-sm font-medium">Update Status:</label>
                                <Select
                                  value={workOrder.status}
                                  onValueChange={(status) => updateWorkOrderStatusMutation.mutate({ id: workOrder.id, status })}
                                >
                                  <SelectTrigger className="w-full sm:w-auto sm:min-w-0 sm:max-w-[12rem] h-8" data-testid={`select-work-order-status-${workOrder.id}`}>
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
                            {isAssigneeRole && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={() => setSelectedWorkOrderDetail(workOrder)}
                                data-testid={`button-view-work-order-${workOrder.id}`}
                              >
                                View details
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Assignee Work Order detail (certificates + description) */}
      <Dialog
        open={!!selectedWorkOrderDetail}
        onOpenChange={(open) => {
          if (!open) setSelectedWorkOrderDetail(null);
        }}
      >
        <DialogContent className={cn(dialogContentBase, "max-w-2xl max-h-[90vh] overflow-y-auto")}>
          {selectedWorkOrderDetail && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedWorkOrderDetail.maintenanceRequest.title}</DialogTitle>
                <DialogDescription>
                  {[selectedWorkOrderDetail.property?.name, selectedWorkOrderDetail.block?.name]
                    .filter(Boolean)
                    .join(" · ") || "Work order details"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge className={priorityColors[selectedWorkOrderDetail.maintenanceRequest.priority]}>
                    {selectedWorkOrderDetail.maintenanceRequest.priority}
                  </Badge>
                  <Badge className={workOrderStatusColors[selectedWorkOrderDetail.status]}>
                    {selectedWorkOrderDetail.status.replace("_", " ")}
                  </Badge>
                </div>
                {selectedWorkOrderDetail.maintenanceRequest.description && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedWorkOrderDetail.maintenanceRequest.description}
                  </p>
                )}
                <WorkOrderCertificatePanel
                  workOrderId={selectedWorkOrderDetail.id}
                  propertyId={selectedWorkOrderDetail.maintenanceRequest.propertyId}
                  blockId={selectedWorkOrderDetail.maintenanceRequest.blockId}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Work Order Creation Dialog */}
      {selectedRequestForWorkOrder && (
        <Dialog open={isWorkOrderDialogOpen} onOpenChange={setIsWorkOrderDialogOpen}>
          <DialogContent className={cn(dialogContentBase, "max-w-2xl")} data-testid="dialog-create-work-order">
            <DialogHeader>
              <DialogTitle>Create Work Order</DialogTitle>
              <DialogDescription>
                Create a work order from maintenance request: {selectedRequestForWorkOrder.title}
              </DialogDescription>
            </DialogHeader>
            <WorkOrderForm
              maintenanceRequest={selectedRequestForWorkOrder}
              teams={teams}
              onSubmit={(data) => createWorkOrderMutation.mutate(data)}
              isSubmitting={createWorkOrderMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      <DeleteConfirmDialog
        open={!!requestToDelete}
        onOpenChange={(open) => {
          if (!open) setRequestToDelete(null);
        }}
        title="Delete maintenance request?"
        description="This permanently deletes the maintenance request"
        itemName={requestToDelete?.title}
        warning={
          (() => {
            const linkedCount = requestToDelete
              ? workOrders.filter((wo) => wo.maintenanceRequest?.id === requestToDelete.id).length
              : 0;
            if (linkedCount > 0) {
              return `Any work order(s) against this maintenance request will be deleted automatically (${linkedCount} linked). This cannot be undone.`;
            }
            return "Any work order(s) created against this maintenance request will be deleted automatically. This cannot be undone.";
          })()
        }
        isPending={deleteRequestMutation.isPending}
        onConfirm={() => {
          if (requestToDelete) deleteRequestMutation.mutate(requestToDelete.id);
        }}
      />

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

// Work Order Creation Form Component
function WorkOrderForm({
  maintenanceRequest,
  teams,
  onSubmit,
  isSubmitting,
}: {
  maintenanceRequest: MaintenanceRequestWithDetails;
  teams: any[];
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}) {
  const locale = useLocale();
  const { toast } = useToast();
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [assignedToId, setAssignedToId] = useState<string>("");
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [slaDue, setSlaDue] = useState<string>("");
  const [costEstimate, setCostEstimate] = useState<string>("");

  useEffect(() => {
    setAssignedToId("");
    if (selectedTeamId && selectedTeamId !== "none") {
      setIsLoadingMembers(true);
      fetch(`/api/teams/${selectedTeamId}/members`, { credentials: "include" })
        .then((res) => res.json())
        .then((members) => {
          setTeamMembers(Array.isArray(members) ? members : []);
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

    if (!selectedTeamId || selectedTeamId === "none") {
      toast({
        title: "Select a maintenance team",
        description: "Work orders can only be assigned to people on a Maintenance Team.",
        variant: "destructive",
      });
      return;
    }

    if (!assignedToId || assignedToId === "none") {
      toast({
        title: "Select a team member",
        description: "Choose an inspector or maintenance contractor from the selected team.",
        variant: "destructive",
      });
      return;
    }

    const member = teamMembers.find(
      (m: any) => m.userId === assignedToId || m.contactId === assignedToId,
    );
    // Prefer linked user account when a contact is selected so clerk portals match
    const resolvedAssignedToId =
      member?.userId || member?.contact?.linkedUserId || assignedToId;
    const contractorId = member?.contactId || undefined;

    onSubmit({
      maintenanceRequestId: maintenanceRequest.id,
      teamId: selectedTeamId,
      contractorId,
      assignedToId: resolvedAssignedToId,
      slaDue: slaDue ? new Date(`${slaDue}T12:00:00`).toISOString() : undefined,
      costEstimate: costEstimate ? Math.round(parseFloat(costEstimate) * 100) : undefined,
      status: "assigned",
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {teams.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No maintenance teams yet. Create a team under{" "}
          <span className="font-medium text-foreground">Settings → Maintenance Team</span> and add
          inspectors or maintenance contractors, then assign work orders here.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="team">
              Maintenance Team <span className="text-destructive">*</span>
            </label>
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger id="team" data-testid="select-team">
                <SelectValue placeholder="Select a maintenance team" />
              </SelectTrigger>
              <SelectContent>
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
                Assign to Team Member <span className="text-destructive">*</span>
              </label>
              <Select
                value={assignedToId}
                onValueChange={setAssignedToId}
                disabled={isLoadingMembers || teamMembers.length === 0}
              >
                <SelectTrigger id="assigned-to" data-testid="select-assigned-to">
                  <SelectValue
                    placeholder={
                      isLoadingMembers
                        ? "Loading members..."
                        : teamMembers.length === 0
                          ? "No members on this team"
                          : "Select inspector or contractor"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((member: any) => {
                    const person = member.user || member.contact;
                    if (!person) return null;
                    const value = member.userId || member.contactId;
                    const kind = member.userId ? "Inspector / Staff" : "Maintenance Contractor";
                    return (
                      <SelectItem
                        key={member.id}
                        value={value}
                        data-testid={`option-member-${member.id}`}
                      >
                        {person.firstName} {person.lastName}
                        {person.email ? ` (${person.email})` : ""} — {kind}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only people added to this Maintenance Team can be assigned.
              </p>
            </div>
          )}
        </>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="sla-due">
          SLA Due Date
        </label>
        <LocaleDateInput
          id="sla-due"
          value={slaDue || null}
          onChange={(ymd) => setSlaDue(ymd || "")}
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
          disabled={isSubmitting || teams.length === 0}
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
