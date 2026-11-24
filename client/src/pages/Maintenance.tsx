import { PreviewableImage } from "@/components/ImagePreview";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useSearch, useParams } from "wouter";
import { navigateWithContext } from "@/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Wrench, Upload, Sparkles, Loader2, X, Check, ChevronsUpDown, Pencil, Trash2, Clipboard, Calendar, User as UserIcon, AlertCircle, AlertTriangle, CheckCircle2, Clock, Building2, MoreVertical, ArrowRight, MessageSquare } from "lucide-react";
import { MaintenanceRequestDiscussion } from "@/components/MaintenanceRequestDiscussion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { WorkOrderFinanceLinks } from "@/components/maintenance-quotes/WorkOrderFinanceLinks";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { useLocale } from "@/contexts/LocaleContext";
import { LocaleDateInput } from "@/components/LocaleDateInput";
import {
  MaintenanceAiAnalysisView,
  applyMaintenanceAiNote,
} from "@/components/MaintenanceAiAnalysisView";
import { formatInspectionNote, parseInspectionNote } from "@shared/inspectionNoteSections";
import {
  formatMaintenanceStatus,
  maintenanceStatusBadgeVariant,
} from "@shared/inspectionLabels";
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
import { WorkOrderCompleteDialog } from "@/components/WorkOrderCompleteDialog";
import { ClearFiltersButton } from "@/components/ClearFiltersButton";
import { pagePad, dialogContentBase } from "@/lib/responsive";
import { PageHeader } from "@/components/PageHeader";
import {
  PillFilterTabs,
  FilterToolbar,
  StatusPill,
  PortfolioDataTable,
  PortfolioTableHeader,
  PortfolioTableBody,
  PortfolioTableRow,
  PortfolioTableHead,
  PortfolioTableCell,
  OpenRowLink,
} from "@/components/workspace";

type MaintenanceRequestWithDetails = MaintenanceRequest & {
  property?: { name: string; address: string };
  reportedByUser?: { firstName: string; lastName: string };
  assignedToUser?: { firstName: string; lastName: string };
};

interface WorkOrder {
  id: string;
  status: string;
  slaDue?: string | null;
  scheduledAt?: string | null;
  arrivedAt?: string | null;
  authorisationStatus?: string | null;
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
  const [location, navigate] = useLocation();
  const searchParams = useSearch();
  const params = useParams<{ id?: string }>();
  const maintenanceId = params?.id;
  const urlPropertyId = new URLSearchParams(searchParams).get("propertyId");
  const shouldCreate = new URLSearchParams(searchParams).get("create");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAutoOpening, setIsAutoOpening] = useState(false);
  const [editingRequest, setEditingRequest] = useState<MaintenanceRequestWithDetails | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [filterProperty, setFilterProperty] = useState<string>(() => urlPropertyId || "all");
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
  const [completeWorkOrderId, setCompleteWorkOrderId] = useState<string | null>(null);
  const [requestToDelete, setRequestToDelete] = useState<MaintenanceRequestWithDetails | null>(null);
  const [workOrderToDelete, setWorkOrderToDelete] = useState<WorkOrder | null>(null);
  const [scheduleWorkOrder, setScheduleWorkOrder] = useState<WorkOrder | null>(null);
  const [scheduleAtLocal, setScheduleAtLocal] = useState("");
  const [discussionRequest, setDiscussionRequest] = useState<MaintenanceRequestWithDetails | null>(null);

  const { data: completionChecklists = [] } = useQuery<any[]>({
    queryKey: ["/api/completion-checklists"],
    queryFn: async () => {
      const res = await fetch("/api/completion-checklists", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch checklists");
      return res.json();
    },
  });
  const activeCompletionChecklists = completionChecklists.filter((c: any) => c.isActive !== false);

  // Demo: clerks can see org-wide work orders alongside field/admin roles.
  const canSeeWorkOrders =
    user?.role === "owner" ||
    user?.role === "clerk" ||
    user?.role === "contractor" ||
    user?.role === "maintenance_admin";
  const isAssigneeRole = user?.role === "contractor";
  const canFieldAct =
    user?.role === "clerk" ||
    user?.role === "contractor" ||
    user?.role === "maintenance_admin";
  const isMaintenanceManager =
    user?.role === "owner" || user?.role === "maintenance_admin";
  const tabFromUrl = new URLSearchParams(searchParams).get("tab");
  const defaultWorkOrdersTab =
    tabFromUrl === "work-orders" || (canFieldAct && tabFromUrl !== "requests");
  const [activeTab, setActiveTab] = useState(
    defaultWorkOrdersTab && canSeeWorkOrders ? "work-orders" : "requests",
  );

  useEffect(() => {
    if (tabFromUrl === "work-orders" && canSeeWorkOrders) {
      setActiveTab("work-orders");
    } else if (tabFromUrl === "work-orders" && !canSeeWorkOrders) {
      setActiveTab("requests");
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
    enabled: isMaintenanceManager && isMaintenanceEnabled !== false,
  });

  // Fetch work orders (owners: org-wide; clerks/contractors: assignee-scoped by API)
  const { data: workOrders = [], isLoading: workOrdersLoading } = useQuery<WorkOrder[]>({
    queryKey: ["/api/work-orders"],
    enabled: canSeeWorkOrders && isMaintenanceEnabled !== false,
  });

  // Fetch teams for work order assignment
  const { data: teams = [] } = useQuery<any[]>({
    queryKey: ["/api/teams"],
    enabled: isMaintenanceManager && isMaintenanceEnabled !== false,
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
      await apiRequest("PATCH", `/api/work-orders/${id}/status`, { status });
      return { id, status };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      toast({ title: "Work order status updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update work order status", variant: "destructive" });
    },
  });

  const canScheduleWorkOrder =
    user?.role === "owner" ||
    user?.role === "clerk" ||
    user?.role === "contractor" ||
    user?.role === "maintenance_admin";

  const openScheduleDialog = (workOrder: WorkOrder) => {
    const existing = workOrder.scheduledAt ? new Date(workOrder.scheduledAt) : null;
    const base =
      existing && !Number.isNaN(existing.getTime()) && existing.getTime() >= Date.now() - 60_000
        ? existing
        : new Date();
    if (!existing) {
      base.setMinutes(0, 0, 0);
      if (base.getTime() < Date.now()) {
        base.setHours(base.getHours() + 1);
      }
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`;
    setScheduleAtLocal(local);
    setScheduleWorkOrder(workOrder);
  };

  const scheduleWorkOrderMutation = useMutation({
    mutationFn: async ({ id, scheduledAt }: { id: string; scheduledAt: string }) => {
      const res = await apiRequest("POST", `/api/work-orders/${id}/schedule`, { scheduledAt });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      setScheduleWorkOrder(null);
      toast({
        title: "Job scheduled",
        description: data?.warning || (data?.emailed || data?.notified ? "Tenant notified" : "No tenant email on file"),
      });
    },
    onError: (e: any) => {
      toast({
        title: "Failed to schedule job",
        description: e?.message || "Failed to schedule job",
        variant: "destructive",
      });
    },
  });

  const arriveOnSiteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/work-orders/${id}/arrive`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      toast({ title: "Arrived on site", description: "Arrival recorded" });
    },
    onError: (e: any) => {
      toast({
        title: "Failed to mark arrival",
        description: e?.message || "Failed to mark arrival",
        variant: "destructive",
      });
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

  // Deep-link: filter list to a property (e.g. from property card Maintenance action)
  useEffect(() => {
    if (urlPropertyId) {
      setFilterProperty(urlPropertyId);
    }
  }, [urlPropertyId]);

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
    const config: Record<
      string,
      { label: string; className: string; icon?: typeof AlertTriangle }
    > = {
      low: {
        label: "Low",
        className:
          "rounded-full border-border bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground",
      },
      medium: {
        label: "Medium",
        className:
          "rounded-full border-[color:var(--brand-warning)]/40 bg-[color:var(--brand-warning)]/15 px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--brand-slate)]",
      },
      high: {
        label: "High",
        className:
          "rounded-full border-[color:var(--brand-critical)]/30 bg-[color:var(--brand-critical)]/10 px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--brand-critical)]",
        icon: AlertTriangle,
      },
      urgent: {
        label: "Urgent",
        className:
          "rounded-full border-[color:var(--brand-critical)]/30 bg-[color:var(--brand-critical)]/10 px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--brand-critical)]",
        icon: AlertTriangle,
      },
    };
    const item = config[priority] || config.medium;
    const Icon = item.icon;
    return (
      <Badge
        variant="outline"
        className={cn("gap-1 shadow-none", item.className)}
        data-testid={`badge-priority-${priority}`}
      >
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {item.label}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => (
    <Badge
      variant={maintenanceStatusBadgeVariant(status)}
      data-testid={`badge-status-${status}`}
    >
      {formatMaintenanceStatus(status)}
    </Badge>
  );

  const priorityAccentClass = (priority: string) => {
    if (priority === "urgent" || priority === "high") return "border-l-[color:var(--brand-critical)]";
    if (priority === "medium") return "border-l-[color:var(--brand-warning)]";
    return "border-l-[color:var(--brand-teal)]";
  };

  const statusSelectClass = (status: string) => {
    if (status === "in_progress") {
      return "border-[color:var(--brand-success)]/30 bg-[color:var(--brand-success)]/10 text-[color:var(--brand-success)]";
    }
    if (status === "completed" || status === "closed") {
      return "border-border bg-muted text-muted-foreground";
    }
    return "border-[color:var(--brand-info)]/30 bg-[color:var(--brand-info)]/10 text-[color:var(--brand-info)]";
  };

  const reporterInitials = (req: MaintenanceRequestWithDetails) => {
    const f = req.reportedByUser?.firstName?.[0] ?? "";
    const l = req.reportedByUser?.lastName?.[0] ?? "";
    return (f + l).toUpperCase() || "?";
  };

  const assigneeInitials = (req: MaintenanceRequestWithDetails) => {
    const f = req.assignedToUser?.firstName?.[0] ?? "";
    const l = req.assignedToUser?.lastName?.[0] ?? "";
    return (f + l).toUpperCase() || "?";
  };

  const daysOpenLabel = (createdAt?: string | Date | null) => {
    const start = createdAt ? new Date(createdAt).getTime() : Date.now();
    const days = Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
    return `${days} day${days === 1 ? "" : "s"} open`;
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

  const requestStatusTabs = [
    { id: "all", label: "All", count: scopedRequests.length },
    {
      id: "open",
      label: "Open",
      count: scopedRequests.filter((r) => r.status === "open").length,
    },
    {
      id: "in_progress",
      label: "In progress",
      count: scopedRequests.filter((r) => r.status === "in_progress").length,
    },
    {
      id: "completed",
      label: "Completed",
      count: scopedRequests.filter((r) => r.status === "completed").length,
    },
    {
      id: "closed",
      label: "Closed",
      count: scopedRequests.filter((r) => r.status === "closed").length,
    },
  ];

  const priorityTone = (priority: string) => {
    if (priority === "urgent" || priority === "high") return "urgent" as const;
    if (priority === "medium") return "action" as const;
    return "muted" as const;
  };

  const statusTone = (status: string) => {
    if (status === "in_progress") return "success" as const;
    if (status === "completed" || status === "closed") return "muted" as const;
    return "info" as const;
  };

  let scopedWorkOrders = workOrders;
  if (filterProperty !== "all") {
    scopedWorkOrders = scopedWorkOrders.filter(
      (wo) => wo.maintenanceRequest?.propertyId === filterProperty,
    );
  }
  if (filterBlock !== "all") {
    const blockPropertyIds = properties.filter((p) => p.blockId === filterBlock).map((p) => p.id);
    scopedWorkOrders = scopedWorkOrders.filter(
      (wo) =>
        !!wo.maintenanceRequest?.propertyId &&
        blockPropertyIds.includes(wo.maintenanceRequest.propertyId),
    );
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
    <div className={cn("container mx-auto min-w-0 space-y-6 md:space-y-8", pagePad)}>
      <PageHeader
        icon={Wrench}
        title={<span data-testid="heading-maintenance">Maintenance</span>}
        description={
          user?.role === "tenant"
            ? "Submit and track your maintenance requests"
            : "Manage requests, filters, and contractor work orders"
        }
        actions={
          <Dialog open={isCreateOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-request" className="w-full sm:w-auto shrink-0">
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
        }
      />

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
          {user?.role !== "tenant" && (
            <div className="space-y-3">
              <PillFilterTabs
                tabs={requestStatusTabs}
                value={selectedStatus}
                onChange={setSelectedStatus}
                testIdPrefix="button-filter"
              />
              <FilterToolbar
                end={
                  (filterBlock !== "all" || filterProperty !== "all" || selectedStatus !== "all") ? (
                    <ClearFiltersButton
                      onClick={() => {
                        setSelectedStatus("all");
                        setFilterBlock("all");
                        setFilterProperty("all");
                      }}
                      data-testid="button-clear-filters"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {filteredRequests.length} shown
                    </span>
                  )
                }
              >
                <Select value={filterBlock} onValueChange={setFilterBlock}>
                  <SelectTrigger className="h-9 w-full sm:w-[11rem]" data-testid="select-filter-block">
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
                  <SelectTrigger className="h-9 w-full sm:w-[11rem]" data-testid="select-filter-property">
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
              </FilterToolbar>
            </div>
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
              <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <PortfolioDataTable minWidth="900px">
                <PortfolioTableHeader>
                  <PortfolioTableRow>
                    <PortfolioTableHead className="h-9">Request</PortfolioTableHead>
                    <PortfolioTableHead className="h-9">Priority</PortfolioTableHead>
                    <PortfolioTableHead className="h-9">Status</PortfolioTableHead>
                    <PortfolioTableHead className="h-9">Property</PortfolioTableHead>
                    <PortfolioTableHead className="h-9">Age</PortfolioTableHead>
                    <PortfolioTableHead className="h-9">Assignee</PortfolioTableHead>
                    <PortfolioTableHead className="h-9 text-right">Actions</PortfolioTableHead>
                  </PortfolioTableRow>
                </PortfolioTableHeader>
                <PortfolioTableBody>
                  {filteredRequests.map((request) => {
                    const linkedWorkOrder = workOrders.find(
                      (wo) => wo.maintenanceRequest?.id === request.id,
                    );
                    const canManage =
                      user?.role === "owner" ||
                      user?.role === "clerk" ||
                      user?.role === "maintenance_admin";
                    const canOwnerAct =
                      isMaintenanceManager && request.status !== "completed";
                    return (
                      <PortfolioTableRow key={request.id} data-testid={`row-request-${request.id}`}>
                        <PortfolioTableCell className="py-2.5">
                          <div className="min-w-0 max-w-[18rem]">
                            <p className="truncate text-sm font-medium text-foreground">
                              {request.title}
                            </p>
                            {request.reportedByUser ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {request.reportedByUser.firstName}{" "}
                                {request.reportedByUser.lastName}
                              </p>
                            ) : null}
                          </div>
                        </PortfolioTableCell>
                        <PortfolioTableCell className="py-2.5">
                          <StatusPill tone={priorityTone(request.priority)}>
                            {request.priority?.charAt(0).toUpperCase() +
                              (request.priority?.slice(1) || "")}
                          </StatusPill>
                        </PortfolioTableCell>
                        <PortfolioTableCell className="py-2.5">
                          {canOwnerAct ? (
                            <Select
                              value={request.status}
                              onValueChange={(status) =>
                                updateStatusMutation.mutate({ id: request.id, status })
                              }
                            >
                              <SelectTrigger
                                className={cn(
                                  "h-7 w-auto min-w-[7rem] gap-1 rounded-full border px-2.5 text-[11px] font-medium shadow-none [&>svg]:h-3 [&>svg]:w-3",
                                  statusSelectClass(request.status),
                                )}
                                data-testid={`select-status-${request.id}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="open">Open</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="closed">Closed</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <StatusPill tone={statusTone(request.status)}>
                              {formatMaintenanceStatus(request.status)}
                            </StatusPill>
                          )}
                        </PortfolioTableCell>
                        <PortfolioTableCell className="py-2.5">
                          <span className="line-clamp-1 max-w-[10rem] text-sm">
                            {request.property?.name || "Unknown"}
                          </span>
                        </PortfolioTableCell>
                        <PortfolioTableCell className="py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                          {daysOpenLabel(request.createdAt)}
                        </PortfolioTableCell>
                        <PortfolioTableCell className="py-2.5 text-sm">
                          {request.assignedToUser
                            ? `${request.assignedToUser.firstName} ${request.assignedToUser.lastName}`
                            : "—"}
                        </PortfolioTableCell>
                        <PortfolioTableCell className="py-2.5">
                          <div className="flex items-center justify-end gap-0.5">
                            {(isMaintenanceManager ||
                              isAssigneeRole ||
                              user?.role === "tenant") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-primary"
                                onClick={() => setDiscussionRequest(request)}
                                data-testid={`button-discussion-${request.id}`}
                              >
                                Open
                                <ArrowRight className="ml-1 h-3.5 w-3.5" />
                              </Button>
                            )}
                            {linkedWorkOrder && (canOwnerAct || canFieldAct) ? (
                              <OpenRowLink
                                href={`/maintenance/work-orders/${linkedWorkOrder.id}`}
                                label="WO"
                                fromLabel="Maintenance"
                                testId={`button-view-work-order-${request.id}`}
                                className="ml-1"
                              />
                            ) : null}
                            {canManage ? (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  onClick={() => handleEdit(request)}
                                  data-testid={`button-edit-${request.id}`}
                                  aria-label="Edit request"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => setRequestToDelete(request)}
                                  data-testid={`button-delete-${request.id}`}
                                  aria-label="Delete request"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </PortfolioTableCell>
                      </PortfolioTableRow>
                    );
                  })}
                </PortfolioTableBody>
              </PortfolioDataTable>
            </div>
            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {filteredRequests.map((request) => {
                const linkedWorkOrder = workOrders.find(
                  (wo) => wo.maintenanceRequest?.id === request.id,
                );
                const canManage =
                  user?.role === "owner" ||
                  user?.role === "clerk" ||
                  user?.role === "maintenance_admin";
                const canOwnerAct =
                  isMaintenanceManager && request.status !== "completed";
                const isHmoFinding =
                  request.source === "hmo_finding" ||
                  (request.aiAnalysisJson as any)?.source === "hmo_finding";

                return (
                <Card
                  key={request.id}
                  data-testid={`card-request-${request.id}`}
                  className={cn(
                    "overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm border-l-4",
                    priorityAccentClass(request.priority),
                  )}
                >
                  <CardContent className="p-4 md:p-5 space-y-3">
                    {/* Top: title + priority / status / menu */}
                    <div className="flex items-start justify-between gap-3">
                      <h3
                        className="min-w-0 flex-1 text-base font-semibold leading-snug text-foreground md:text-[17px]"
                        data-testid={`text-title-${request.id}`}
                      >
                        {request.title}
                      </h3>
                      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                        {getPriorityBadge(request.priority)}
                        {canOwnerAct ? (
                          <Select
                            value={request.status}
                            onValueChange={(status) =>
                              updateStatusMutation.mutate({ id: request.id, status })
                            }
                          >
                            <SelectTrigger
                              className={cn(
                                "h-7 w-auto min-w-[7.5rem] gap-1 rounded-full border px-2.5 text-[11px] font-medium shadow-none [&>svg]:h-3 [&>svg]:w-3",
                                statusSelectClass(request.status),
                              )}
                              data-testid={`select-status-${request.id}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open" data-testid={`option-status-open-${request.id}`}>Open</SelectItem>
                              <SelectItem value="in_progress" data-testid={`option-status-progress-${request.id}`}>In Progress</SelectItem>
                              <SelectItem value="completed" data-testid={`option-status-completed-${request.id}`}>Completed</SelectItem>
                              <SelectItem value="closed" data-testid={`option-status-closed-${request.id}`}>Closed</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          getStatusBadge(request.status)
                        )}
                        {canManage && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground"
                                data-testid={`button-request-menu-${request.id}`}
                                aria-label="Request actions"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleEdit(request)}
                                data-testid={`button-edit-${request.id}`}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setRequestToDelete(request)}
                                data-testid={`button-delete-${request.id}`}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>

                    {/* Meta: property + age */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground md:text-[13px]">
                      <span className="inline-flex min-w-0 items-center gap-1.5" data-testid={`text-property-${request.id}`}>
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-[color:var(--brand-slate)]" />
                        <span className="truncate">
                          {request.property?.name || "Unknown"}
                          {request.property?.address ? `, ${request.property.address}` : ""}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-[color:var(--brand-slate)]" />
                        {daysOpenLabel(request.createdAt)}
                      </span>
                    </div>

                    {isHmoFinding && request.verificationStatus === "awaiting_verification" && (
                      <div className="rounded-lg border border-[color:var(--brand-warning)]/40 bg-[color:var(--brand-warning)]/10 px-3 py-2 text-sm text-[color:var(--brand-slate)]">
                        HMO work reported complete — awaiting authorised verification before
                        this request can close.
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Avatar className="h-8 w-8 border border-border/60 bg-muted">
                          <AvatarFallback className="bg-[color:var(--brand-mist)] text-[11px] font-semibold text-[color:var(--brand-navy)]">
                            {reporterInitials(request)}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className="truncate text-sm font-medium text-foreground"
                          data-testid={`text-reporter-${request.id}`}
                        >
                          {request.reportedByUser
                            ? `${request.reportedByUser.firstName} ${request.reportedByUser.lastName}`
                            : "Unknown"}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {canOwnerAct && clerks.length > 0 && (
                          request.assignedToUser ? (
                            <div
                              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-xs font-medium"
                              data-testid={`text-assignee-${request.id}`}
                            >
                              <Avatar className="h-5 w-5">
                                <AvatarFallback className="bg-[color:var(--brand-navy)] text-[9px] text-white">
                                  {assigneeInitials(request)}
                                </AvatarFallback>
                              </Avatar>
                              {request.assignedToUser.firstName} {request.assignedToUser.lastName}
                            </div>
                          ) : (
                            <Select
                              onValueChange={(assignedTo) =>
                                updateStatusMutation.mutate({
                                  id: request.id,
                                  status: "in_progress",
                                  assignedTo,
                                })
                              }
                            >
                              <SelectTrigger
                                className="h-8 w-auto min-w-[6.5rem] gap-1 rounded-full border-border px-3 text-xs shadow-none"
                                data-testid={`select-assign-${request.id}`}
                              >
                                <SelectValue placeholder="+ Assign" />
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
                          )
                        )}

                        {(isMaintenanceManager ||
                          isAssigneeRole ||
                          user?.role === "tenant") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-full px-3 text-xs"
                            onClick={() => setDiscussionRequest(request)}
                            data-testid={`button-discussion-${request.id}`}
                          >
                            <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                            Discussion
                          </Button>
                        )}

                        {isWorkOrdersEnabled &&
                          linkedWorkOrder &&
                          (canOwnerAct || canFieldAct) && (
                            <Button
                              variant={
                                linkedWorkOrder.status === "completed" ||
                                linkedWorkOrder.status === "rejected"
                                  ? "outline"
                                  : "default"
                              }
                              size="sm"
                              className={cn(
                                "h-8 rounded-full px-3 text-xs",
                                linkedWorkOrder.status !== "completed" &&
                                  linkedWorkOrder.status !== "rejected" &&
                                  "bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]",
                              )}
                              onClick={() => {
                                navigateWithContext(navigate, {
                                  href: `/maintenance/work-orders/${linkedWorkOrder.id}`,
                                  fromPath: location,
                                  fromLabel: "Maintenance",
                                });
                              }}
                              data-testid={`button-view-work-order-${request.id}`}
                            >
                              View work order
                              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                            </Button>
                          )}
                        {isWorkOrdersEnabled && !linkedWorkOrder && canOwnerAct && (
                          <Button
                            size="sm"
                            className="h-8 rounded-full bg-primary px-3 text-xs text-primary-foreground hover:bg-[hsl(var(--primary-hover))]"
                            onClick={() => {
                              setSelectedRequestForWorkOrder(request);
                              setIsWorkOrderDialogOpen(true);
                            }}
                            data-testid={`button-create-work-order-${request.id}`}
                          >
                            Create work order
                          </Button>
                        )}

                        {canOwnerAct &&
                          isHmoFinding &&
                          (request.verificationStatus === "awaiting_verification" ||
                            request.verificationStatus === "rejected" ||
                            request.status === "in_progress") && (
                            <>
                              <Button
                                size="sm"
                                className="h-8 rounded-full"
                                data-testid={`button-hmo-verify-${request.id}`}
                                onClick={async () => {
                                  try {
                                    await apiRequest(
                                      "POST",
                                      `/api/maintenance/${request.id}/hmo-verification`,
                                      { action: "verify" },
                                    );
                                    queryClient.invalidateQueries({
                                      queryKey: ["/api/maintenance"],
                                    });
                                    toast({ title: "HMO issue verified closed" });
                                  } catch (e: any) {
                                    toast({
                                      title: "Verification failed",
                                      description: e.message,
                                      variant: "destructive",
                                    });
                                  }
                                }}
                              >
                                Confirm resolved
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-8 rounded-full"
                                data-testid={`button-hmo-reject-${request.id}`}
                                onClick={async () => {
                                  try {
                                    await apiRequest(
                                      "POST",
                                      `/api/maintenance/${request.id}/hmo-verification`,
                                      { action: "reject", notes: "Rejected — reopen" },
                                    );
                                    queryClient.invalidateQueries({
                                      queryKey: ["/api/maintenance"],
                                    });
                                    toast({ title: "Reopened — verification rejected" });
                                  } catch (e: any) {
                                    toast({
                                      title: "Could not reject",
                                      description: e.message,
                                      variant: "destructive",
                                    });
                                  }
                                }}
                              >
                                Reject — reopen
                              </Button>
                            </>
                          )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                );
              })}
            </div>
              </>
            )}
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
                    {scopedWorkOrders.length}
                  </span>
                </div>

                {workOrdersLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading work orders...</div>
                ) : scopedWorkOrders.length === 0 ? (
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
                    {scopedWorkOrders.map((workOrder) => (
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
                              {(user?.role === "owner" ||
                                user?.role === "clerk" ||
                                user?.role === "maintenance_admin") && (
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
                              {(workOrder as any).authorisationStatus === "quote_required" ? (
                                <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-200">
                                  Quote required
                                </Badge>
                              ) : null}
                              {(workOrder as any).authorisationStatus === "authorised" ? (
                                <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                                  Authorised
                                </Badge>
                              ) : null}
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

                            {workOrder.scheduledAt && (
                              <div className="flex items-center gap-2 text-sm">
                                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div>
                                  <p className="font-medium">Scheduled visit</p>
                                  <p className="text-muted-foreground">
                                    {new Date(workOrder.scheduledAt).toLocaleString(undefined, {
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    })}
                                  </p>
                                </div>
                              </div>
                            )}

                            {workOrder.arrivedAt && (
                              <div className="flex items-center gap-2 text-sm">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                <div>
                                  <p className="font-medium">Arrived on site</p>
                                  <p className="text-muted-foreground">
                                    {new Date(workOrder.arrivedAt).toLocaleString(undefined, {
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    })}
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
                            {canFieldAct &&
                              workOrder.status !== "completed" &&
                              workOrder.status !== "rejected" && (
                              <div className="flex items-center gap-2">
                                <label className="text-sm font-medium">Update Status:</label>
                                <Select
                                  value={workOrder.status}
                                  onValueChange={(status) => {
                                    if (status === "completed") {
                                      setCompleteWorkOrderId(workOrder.id);
                                      return;
                                    }
                                    updateWorkOrderStatusMutation.mutate({ id: workOrder.id, status });
                                  }}
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
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() =>
                                navigateWithContext(navigate, {
                                  href: `/maintenance/work-orders/${workOrder.id}`,
                                  fromPath: location,
                                  fromLabel: "Maintenance",
                                })
                              }
                              data-testid={`button-view-work-order-${workOrder.id}`}
                            >
                              View details
                            </Button>
                            {canFieldAct &&
                              workOrder.status !== "completed" &&
                              workOrder.status !== "rejected" && (
                                <Button
                                  size="sm"
                                  className="h-8"
                                  onClick={() => setCompleteWorkOrderId(workOrder.id)}
                                  data-testid={`button-mark-complete-${workOrder.id}`}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                  Mark Job As Complete
                                </Button>
                              )}
                            {canScheduleWorkOrder &&
                              workOrder.status !== "completed" &&
                              workOrder.status !== "rejected" &&
                              workOrder.authorisationStatus !== "quote_required" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  onClick={() => openScheduleDialog(workOrder)}
                                  data-testid={`button-schedule-work-order-${workOrder.id}`}
                                >
                                  <Calendar className="w-3.5 h-3.5 mr-1.5" />
                                  {workOrder.scheduledAt ? "Reschedule" : "Schedule Job"}
                                </Button>
                              )}
                            {canScheduleWorkOrder &&
                              workOrder.status !== "completed" &&
                              workOrder.status !== "rejected" &&
                              workOrder.authorisationStatus !== "quote_required" &&
                              !workOrder.arrivedAt && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  disabled={arriveOnSiteMutation.isPending}
                                  onClick={() => arriveOnSiteMutation.mutate(workOrder.id)}
                                  data-testid={`button-arrive-work-order-${workOrder.id}`}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                  {arriveOnSiteMutation.isPending ? "Recording…" : "Arrived on Site"}
                                </Button>
                              )}
                            {canScheduleWorkOrder &&
                              workOrder.status !== "completed" &&
                              workOrder.status !== "rejected" &&
                              workOrder.authorisationStatus === "quote_required" && (
                                <span className="text-xs text-muted-foreground self-center">
                                  Accept quotation before scheduling
                                </span>
                              )}
                            <WorkOrderFinanceLinks workOrderId={workOrder.id} />
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

      <Dialog
        open={!!discussionRequest}
        onOpenChange={(open) => {
          if (!open) setDiscussionRequest(null);
        }}
      >
        <DialogContent className={cn(dialogContentBase, "max-w-lg")} data-testid="dialog-mr-discussion">
          <DialogHeader>
            <DialogTitle>Discussion</DialogTitle>
            <DialogDescription>
              {user?.role === "tenant"
                ? "Messages with your maintenance team about this request."
                : "Tips and updates with the tenant on this request."}
            </DialogDescription>
          </DialogHeader>
          {discussionRequest ? (
            <MaintenanceRequestDiscussion
              requestId={discussionRequest.id}
              apiBase={
                user?.role === "tenant"
                  ? `/api/tenant/maintenance-requests/${discussionRequest.id}/messages`
                  : `/api/maintenance/${discussionRequest.id}/messages`
              }
              requestTitle={discussionRequest.title}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <WorkOrderCompleteDialog
        workOrderId={completeWorkOrderId}
        open={!!completeWorkOrderId}
        onOpenChange={(open) => {
          if (!open) setCompleteWorkOrderId(null);
        }}
        existingSignature={
          workOrders.find((w: any) => w.id === completeWorkOrderId)?.customerSignatureJson
        }
      />

      <Dialog
        open={!!scheduleWorkOrder}
        onOpenChange={(open) => {
          if (!open) setScheduleWorkOrder(null);
        }}
      >
        <DialogContent className={cn(dialogContentBase, "max-w-md")} data-testid="dialog-schedule-work-order">
          <DialogHeader>
            <DialogTitle>
              {scheduleWorkOrder?.scheduledAt ? "Reschedule Job" : "Schedule Job"}
            </DialogTitle>
            <DialogDescription>
              {scheduleWorkOrder?.maintenanceRequest?.title || "Set a visit time. Active tenants will be notified."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-at">Visit date and time</Label>
              <Input
                id="schedule-at"
                type="datetime-local"
                value={scheduleAtLocal}
                onChange={(e) => setScheduleAtLocal(e.target.value)}
                data-testid="input-schedule-at"
              />
              <p className="text-xs text-muted-foreground">
                Active tenants at the property will receive email and in-app notice.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setScheduleWorkOrder(null)}
                disabled={scheduleWorkOrderMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                data-testid="button-confirm-schedule"
                disabled={scheduleWorkOrderMutation.isPending || !scheduleAtLocal}
                onClick={() => {
                  if (!scheduleWorkOrder || !scheduleAtLocal) return;
                  const when = new Date(scheduleAtLocal);
                  if (Number.isNaN(when.getTime())) {
                    toast({ title: "Invalid date/time", variant: "destructive" });
                    return;
                  }
                  scheduleWorkOrderMutation.mutate({
                    id: scheduleWorkOrder.id,
                    scheduledAt: when.toISOString(),
                  });
                }}
              >
                {scheduleWorkOrderMutation.isPending ? "Saving…" : "Confirm schedule"}
              </Button>
            </div>
          </div>
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
              completionChecklists={activeCompletionChecklists}
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
  completionChecklists = [],
  onSubmit,
  isSubmitting,
}: {
  maintenanceRequest: MaintenanceRequestWithDetails;
  teams: any[];
  completionChecklists?: any[];
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
  const [completionChecklistId, setCompletionChecklistId] = useState<string>("__none__");

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
      completionChecklistId:
        completionChecklistId === "__none__" ? null : completionChecklistId,
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

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="wo-completion-checklist">
          Completion checklist (optional)
        </label>
        <Select value={completionChecklistId} onValueChange={setCompletionChecklistId}>
          <SelectTrigger id="wo-completion-checklist" data-testid="select-wo-create-checklist">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {completionChecklists.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Required steps and a customer signature are needed before marking the work order
          completed.
        </p>
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
