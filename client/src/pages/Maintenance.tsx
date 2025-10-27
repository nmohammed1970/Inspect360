import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Wrench, Upload, Sparkles, Loader2, X, Check, ChevronsUpDown, Pencil } from "lucide-react";
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

const createMaintenanceSchema = insertMaintenanceRequestSchema
  .omit({ organizationId: true }) // Backend adds this from session
  .extend({
    title: z.string().min(1, "Title is required"),
    propertyId: z.string().min(1, "Property is required"),
    priority: z.enum(["low", "medium", "high"]),
  });

export default function Maintenance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<MaintenanceRequestWithDetails | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentStep, setCurrentStep] = useState<"form" | "images" | "suggestions" | "review">("form");
  const uppyRef = useRef<Uppy | null>(null);

  // Handle dialog state change
  const handleDialogChange = (open: boolean) => {
    setIsCreateOpen(open);
    if (open && !editingRequest) {
      // Reset form when opening dialog for a new request
      form.reset();
      setCurrentStep("form");
      setUploadedImages([]);
      setAiSuggestions("");
    }
    if (!open) {
      // Clear editing state when closing
      setEditingRequest(null);
      setUploadedImages([]);
      setAiSuggestions("");
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

  // Fetch organization clerks (for assignment)
  const { data: clerks = [] } = useQuery<User[]>({
    queryKey: ["/api/users/clerks"],
    enabled: user?.role === "owner",
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
          const response = await fetch("/api/uploads/sign-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type,
            }),
            credentials: "include",
          });

          if (!response.ok) {
            throw new Error("Failed to get upload URL");
          }

          const { url, publicUrl } = await response.json();
          
          // Store publicUrl in file metadata for later retrieval
          uppy.setFileMeta(file.id, { publicUrl });
          
          return {
            method: "PUT" as const,
            url,
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
            fields: {},
          };
        },
      });

      uppy.on("upload-success", (file) => {
        if (file && file.meta && file.meta.publicUrl) {
          const publicUrl = file.meta.publicUrl as string;
          setUploadedImages((prev) => [...prev, publicUrl]);
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
    onSuccess: async () => {
      try {
        console.log("[Maintenance] Request updated successfully, refetching queries...");
        await queryClient.refetchQueries({ queryKey: ["/api/maintenance"] });
        
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
        
        console.log("[Maintenance] Update cleanup complete");
      } catch (error) {
        console.error("[Maintenance] Error in onSuccess:", error);
        toast({
          title: "Warning",
          description: "Request updated but there was an issue refreshing the list",
          variant: "destructive",
        });
      }
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
      priority: "medium",
      reportedBy: user?.id || "",
    },
  });

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
      propertyId: request.propertyId,
      priority: request.priority as "low" | "medium" | "high",
      reportedBy: request.reportedBy || "",
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
        <Dialog open={isCreateOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-request">
              <Plus className="w-4 h-4 mr-2" />
              New Request
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
                  <FormField
                    control={form.control}
                    name="propertyId"
                    render={({ field }) => {
                      const [propertyComboboxOpen, setPropertyComboboxOpen] = useState(false);
                      return (
                        <FormItem className="flex flex-col">
                          <FormLabel>Property</FormLabel>
                          <Popover open={propertyComboboxOpen} onOpenChange={setPropertyComboboxOpen}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className={cn(
                                    "justify-between",
                                    !field.value && "text-muted-foreground"
                                  )}
                                  data-testid="select-property"
                                >
                                  {field.value
                                    ? properties.find((property) => property.id === field.value)?.name +
                                      (properties.find((property) => property.id === field.value)?.address 
                                        ? ` - ${properties.find((property) => property.id === field.value)?.address}`
                                        : "")
                                    : "Select a property"}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0">
                              <Command>
                                <CommandInput placeholder="Search properties..." />
                                <CommandList>
                                  <CommandEmpty>No property found.</CommandEmpty>
                                  <CommandGroup>
                                    {properties.map((property) => (
                                      <CommandItem
                                        key={property.id}
                                        value={`${property.name} ${property.address || ""}`}
                                        onSelect={() => {
                                          field.onChange(property.id);
                                          setPropertyComboboxOpen(false);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            property.id === field.value
                                              ? "opacity-100"
                                              : "opacity-0"
                                          )}
                                        />
                                        <div className="flex flex-col">
                                          <span>{property.name}</span>
                                          {property.address && (
                                            <span className="text-sm text-muted-foreground">{property.address}</span>
                                          )}
                                        </div>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
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
                              const uploadURL = file.uploadURL;
                              const response = await fetch('/api/objects/set-acl', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({ photoUrl: uploadURL }),
                              });
                              
                              if (!response.ok) {
                                throw new Error('Failed to set photo permissions');
                              }
                              
                              const { objectPath } = await response.json();
                              newPaths.push(objectPath);
                            }
                            setUploadedImages(prev => [...prev, ...newPaths]);
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
                      <span data-testid={`text-property-${request.id}`}>
                        {request.property?.name || "Unknown"}
                      </span>
                      {request.property?.address && (
                        <span>• {request.property.address}</span>
                      )}
                      <span>• Created {format(new Date(request.createdAt?.toString() || Date.now()), 'PPP')}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      {(user?.role === "owner" || user?.role === "clerk") && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleEdit(request)}
                          data-testid={`button-edit-${request.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      <div className="flex flex-col gap-2">
                        {getPriorityBadge(request.priority)}
                        {getStatusBadge(request.status)}
                      </div>
                    </div>
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
