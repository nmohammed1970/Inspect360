import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FileText, Upload, AlertTriangle, ExternalLink, Calendar, ShieldAlert, Tag as TagIcon, X, Plus, Building2, Home, Check, CalendarIcon, Pencil, Filter, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format as formatDate, differenceInDays, isPast } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertComplianceDocumentSchema, type ComplianceDocument, type Tag, type Block, type Property } from "@shared/schema";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useAuth } from "@/hooks/useAuth";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Default document types (fallback if no custom types exist)
const DEFAULT_DOCUMENT_TYPES = [
  "Fire Safety Certificate",
  "Building Insurance",
  "Electrical Safety Certificate",
  "Gas Safety Certificate",
  "EPC Certificate",
  "HMO License",
  "Planning Permission",
  "Other",
];

const uploadFormSchema = insertComplianceDocumentSchema.omit({
  organizationId: true,
  uploadedBy: true,
}).extend({
  documentUrl: z.string().min(1, "Please upload a document"),
  expiryDate: z.string().optional(),
});

type UploadFormValues = z.infer<typeof uploadFormSchema>;

const editFormSchema = z.object({
  documentType: z.string().min(1, "Please select a document type"),
  expiryDate: z.string().optional(),
  propertyId: z.string().optional(),
  blockId: z.string().optional(),
});

type EditFormValues = z.infer<typeof editFormSchema>;

export default function Compliance() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<ComplianceDocument | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { user, isLoading: authLoading } = useAuth();
  
  // Filter and sort state
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterProperty, setFilterProperty] = useState<string>("all");
  const [filterBlock, setFilterBlock] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortBy, setSortBy] = useState<"date" | "type" | "status" | "expiry">("expiry");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  
  // Get URL parameters for property or block context
  const searchParams = useSearch();
  const urlParams = new URLSearchParams(searchParams);
  const propertyIdFromUrl = urlParams.get("propertyId");
  const blockIdFromUrl = urlParams.get("blockId");

  const { data: documents = [], isLoading } = useQuery<ComplianceDocument[]>({
    queryKey: ['/api/compliance'],
  });

  const { data: expiringDocs = [] } = useQuery<ComplianceDocument[]>({
    queryKey: ['/api/compliance/expiring'],
    queryFn: () => fetch('/api/compliance/expiring?days=90').then(res => res.json()),
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ['/api/properties'],
    enabled: !!user?.organizationId,
  });

  const { data: blocks = [] } = useQuery<Block[]>({
    queryKey: ['/api/blocks'],
    enabled: !!user?.organizationId,
  });

  const { data: allTags = [] } = useQuery<Tag[]>({
    queryKey: ['/api/tags'],
    enabled: !!user?.organizationId,
  });

  const { data: docTags = [] } = useQuery<Tag[]>({
    queryKey: ['/api/compliance', selectedDoc, 'tags'],
    enabled: !!selectedDoc,
  });

  // Fetch custom document types
  const { data: customDocumentTypes = [] } = useQuery<any[]>({
    queryKey: ['/api/compliance/document-types'],
    enabled: !!user?.organizationId && (user.role === "owner" || user.role === "compliance"),
  });

  // Combine default and custom document types
  const allDocumentTypes = [
    ...DEFAULT_DOCUMENT_TYPES,
    ...customDocumentTypes.map(t => t.name).filter(name => !DEFAULT_DOCUMENT_TYPES.includes(name))
  ].sort();

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
      documentType: "",
      documentUrl: "",
      expiryDate: undefined,
      propertyId: undefined,
      blockId: undefined,
      status: "current",
    },
  });
  
  // Pre-populate property or block when dialog opens based on URL context
  useEffect(() => {
    if (open) {
      const resetValues: Partial<UploadFormValues> = {
        documentType: "",
        documentUrl: "",
        expiryDate: undefined,
        status: "current",
      };
      
      if (propertyIdFromUrl) {
        resetValues.propertyId = propertyIdFromUrl;
        resetValues.blockId = undefined;
      } else if (blockIdFromUrl) {
        resetValues.blockId = blockIdFromUrl;
        resetValues.propertyId = undefined;
      } else {
        resetValues.propertyId = undefined;
        resetValues.blockId = undefined;
      }
      
      form.reset(resetValues as UploadFormValues);
      setIsUploading(false); // Reset upload state when dialog opens
    } else {
      // Clean up when dialog closes to prevent stuck upload states
      setIsUploading(false);
      form.clearErrors();
    }
  }, [open, propertyIdFromUrl, blockIdFromUrl, form]);

  const uploadMutation = useMutation({
    mutationFn: async (data: UploadFormValues) => {
      console.log('[Compliance] Sending upload request with data:', data);
      try {
        const payload = {
          ...data,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        };
        console.log('[Compliance] Upload payload:', payload);
        const result = await apiRequest('POST', '/api/compliance', payload);
        console.log('[Compliance] Upload successful:', result);
        return result;
      } catch (error: any) {
        console.error('[Compliance] Upload error details:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/compliance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/compliance/expiring'] });
      toast({
        title: "Document uploaded",
        description: "Compliance document uploaded successfully",
      });
      setOpen(false);
      form.reset();
      setIsUploading(false);
    },
    onError: (error: any) => {
      console.error('[Compliance] Error uploading compliance document:', error);
      const errorMessage = error?.message || error?.response?.data?.message || 'Failed to upload document. Please try again.';
      const validationErrors = error?.response?.data?.errors;
      
      toast({
        title: "Upload failed",
        description: validationErrors 
          ? `Validation error: ${validationErrors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
          : errorMessage,
        variant: "destructive",
      });
      setIsUploading(false);
    }
  });

  const addTagMutation = useMutation({
    mutationFn: ({ docId, tagId }: { docId: string; tagId: string }) =>
      apiRequest('POST', `/api/compliance/${docId}/tags/${tagId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/compliance'] });
      if (selectedDoc) {
        queryClient.invalidateQueries({ queryKey: ['/api/compliance', selectedDoc, 'tags'] });
      }
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: ({ docId, tagId }: { docId: string; tagId: string }) =>
      apiRequest('DELETE', `/api/compliance/${docId}/tags/${tagId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/compliance'] });
      if (selectedDoc) {
        queryClient.invalidateQueries({ queryKey: ['/api/compliance', selectedDoc, 'tags'] });
      }
    },
  });

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      documentType: "",
      expiryDate: undefined,
      propertyId: undefined,
      blockId: undefined,
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: EditFormValues }) => {
      const payload: any = { ...data };
      if (payload.expiryDate) {
        payload.expiryDate = new Date(payload.expiryDate);
      }
      if (!payload.propertyId) payload.propertyId = null;
      if (!payload.blockId) payload.blockId = null;
      return await apiRequest('PATCH', `/api/compliance/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/compliance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/compliance/expiring'] });
      queryClient.invalidateQueries({ queryKey: ['/api/compliance/expiring?days=90'] });
      toast({
        title: "Document updated",
        description: "Compliance document updated successfully",
      });
      setEditSheetOpen(false);
      setEditingDoc(null);
      editForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error?.message || "Failed to update document",
        variant: "destructive",
      });
    },
  });

  const openEditSheet = (doc: ComplianceDocument) => {
    setEditingDoc(doc);
    editForm.reset({
      documentType: doc.documentType,
      expiryDate: doc.expiryDate ? new Date(doc.expiryDate.toString()).toISOString().split('T')[0] : undefined,
      propertyId: doc.propertyId || undefined,
      blockId: doc.blockId || undefined,
    });
    setEditSheetOpen(true);
  };

  const onEditSubmit = (data: EditFormValues) => {
    if (editingDoc) {
      updateMutation.mutate({ id: editingDoc.id, data });
    }
  };

  const onSubmit = (data: UploadFormValues) => {
    console.log('[Compliance] Form submitted with data:', data);
    
    // Ensure documentType is set
    if (!data.documentType) {
      form.setError('documentType', {
        type: 'manual',
        message: 'Please select a document type'
      });
      toast({
        title: "Validation error",
        description: "Please select a document type",
        variant: "destructive",
      });
      return;
    }
    
    // Ensure documentUrl is set
    if (!data.documentUrl) {
      form.setError('documentUrl', {
        type: 'manual',
        message: 'Please upload a document'
      });
      toast({
        title: "Validation error",
        description: "Please upload a document",
        variant: "destructive",
      });
      return;
    }
    
    uploadMutation.mutate(data);
  };

  const getStatusBadge = (doc: ComplianceDocument) => {
    if (!doc.expiryDate) {
      return <Badge variant="secondary" data-testid={`badge-status-${doc.id}`}>No Expiry</Badge>;
    }
    
    const expiryDate = new Date(doc.expiryDate.toString());
    const daysUntilExpiry = differenceInDays(expiryDate, new Date());
    
    if (isPast(expiryDate)) {
      return (
        <Badge variant="destructive" data-testid={`badge-status-${doc.id}`}>
          Expired
        </Badge>
      );
    } else if (daysUntilExpiry <= 30) {
      return (
        <Badge 
          className="bg-yellow-600 dark:bg-yellow-500 text-white dark:text-black" 
          data-testid={`badge-status-${doc.id}`}
        >
          Expiring Soon
        </Badge>
      );
    } else if (daysUntilExpiry <= 90) {
      return (
        <Badge 
          className="bg-blue-600 dark:bg-blue-500 text-white dark:text-black" 
          data-testid={`badge-status-${doc.id}`}
        >
          {daysUntilExpiry}d left
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline" data-testid={`badge-status-${doc.id}`}>
        Current
      </Badge>
    );
  };

  const getPropertyName = (propertyId: string | null): string | null => {
    if (!propertyId) return null;
    const property = properties.find(p => p.id === propertyId);
    return property?.name || null;
  };

  const getBlockName = (blockId: string | null): string | null => {
    if (!blockId) return null;
    const block = blocks.find(b => b.id === blockId);
    return block?.name || null;
  };

  // Get unique document types for filter
  const documentTypes = Array.from(new Set(documents.map(doc => doc.documentType))).sort();

  // Filter and sort documents
  const filteredAndSortedDocs = documents.filter(doc => {
    // Filter by type
    if (filterType !== "all" && doc.documentType !== filterType) return false;
    
    // Filter by status
    if (filterStatus !== "all") {
      const isExpired = doc.expiryDate && isPast(new Date(doc.expiryDate.toString()));
      if (filterStatus === "expired" && !isExpired) return false;
      if (filterStatus === "current" && isExpired) return false;
      if (filterStatus === "expiring" && (!doc.expiryDate || !expiringDocs.find(ed => ed.id === doc.id))) return false;
    }
    
    // Filter by property
    if (filterProperty !== "all" && doc.propertyId !== filterProperty) return false;
    
    // Filter by block
    if (filterBlock !== "all" && doc.blockId !== filterBlock) return false;
    
    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesType = doc.documentType.toLowerCase().includes(searchLower);
      const matchesProperty = getPropertyName(doc.propertyId)?.toLowerCase().includes(searchLower);
      const matchesBlock = getBlockName(doc.blockId)?.toLowerCase().includes(searchLower);
      if (!matchesType && !matchesProperty && !matchesBlock) return false;
    }
    
    return true;
  }).sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case "date":
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case "type":
        comparison = a.documentType.localeCompare(b.documentType);
        break;
      case "status":
        const aExpired = a.expiryDate && isPast(new Date(a.expiryDate.toString()));
        const bExpired = b.expiryDate && isPast(new Date(b.expiryDate.toString()));
        comparison = aExpired === bExpired ? 0 : (aExpired ? 1 : -1);
        break;
      case "expiry":
        if (!a.expiryDate && !b.expiryDate) comparison = 0;
        else if (!a.expiryDate) comparison = 1;
        else if (!b.expiryDate) comparison = -1;
        else comparison = new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
        break;
    }
    
    return sortOrder === "asc" ? comparison : -comparison;
  });

  const expiredDocs = filteredAndSortedDocs.filter(doc => 
    doc.expiryDate && isPast(new Date(doc.expiryDate.toString()))
  );

  const currentDocs = filteredAndSortedDocs.filter(doc => 
    !doc.expiryDate || !isPast(new Date(doc.expiryDate.toString()))
  );

  if (authLoading) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user || (user.role !== "owner" && user.role !== "compliance")) {
    return (
      <div className="p-4 md:p-8">
        <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <ShieldAlert className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            Access denied. Only organization owners and compliance officers can access this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="heading-compliance">
            Compliance Center
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Manage compliance documents and certifications
          </p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary w-full sm:w-auto" data-testid="button-upload-document">
              <Upload className="w-4 h-4 mr-2" />
              Upload Document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Upload Compliance Document</DialogTitle>
              <DialogDescription>
                Upload a compliance document such as insurance certificates, safety certificates, or licenses. You can optionally associate it with a property or block and set an expiry date for renewal reminders.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  console.log('[Compliance] Form submit event triggered');
                  form.handleSubmit(onSubmit, (errors) => {
                    console.error('[Compliance] Form validation errors:', errors);
                    toast({
                      title: "Validation error",
                      description: "Please fill in all required fields",
                      variant: "destructive",
                    });
                  })(e);
                }} 
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="documentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-document-type">
                            <SelectValue placeholder="Select document type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allDocumentTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="propertyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Property (Optional)</FormLabel>
                        <Select 
                          onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                          value={field.value || "none"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-property">
                              <SelectValue placeholder="Select property" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {properties.map((property) => (
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
                    name="blockId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Block (Optional)</FormLabel>
                        <Select 
                          onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                          value={field.value || "none"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-block">
                              <SelectValue placeholder="Select block" />
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
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="documentUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document File *</FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <ObjectUploader
                            buttonClassName="w-full"
                            onGetUploadParameters={async () => {
                              try {
                                setIsUploading(true);
                                const response = await fetch('/api/objects/upload', {
                                  method: 'POST',
                                  credentials: 'include',
                                });
                                
                                if (!response.ok) {
                                  setIsUploading(false);
                                  toast({
                                    title: "Upload initialization failed",
                                    description: "Failed to prepare upload. Please try again.",
                                    variant: "destructive",
                                  });
                                  throw new Error('Failed to initialize upload');
                                }
                                
                                const { uploadURL } = await response.json();
                                return {
                                  method: 'PUT' as const,
                                  url: uploadURL,
                                };
                              } catch (error: any) {
                                setIsUploading(false);
                                toast({
                                  title: "Upload initialization failed",
                                  description: error.message || 'Failed to prepare upload. Please try again.',
                                  variant: "destructive",
                                });
                                throw error;
                              }
                            }}
                            onComplete={async (result) => {
                              try {
                                // Check for upload failures first
                                if (result.failed && result.failed.length > 0) {
                                  throw new Error('Document upload failed');
                                }
                                
                                if (result.successful && result.successful[0]) {
                                  let uploadURL = result.successful[0].uploadURL;
                                  
                                  // Normalize URL: if absolute, extract pathname; if relative, use as is
                                  if (uploadURL && (uploadURL.startsWith('http://') || uploadURL.startsWith('https://'))) {
                                    try {
                                      const urlObj = new URL(uploadURL);
                                      uploadURL = urlObj.pathname;
                                    } catch (e) {
                                      console.error('[Compliance] Invalid upload URL:', uploadURL);
                                      setIsUploading(false);
                                      toast({
                                        title: "Upload Error",
                                        description: "Invalid file URL format. Please try again.",
                                        variant: "destructive",
                                      });
                                      return;
                                    }
                                  }
                                  
                                  // Ensure it's a relative path starting with /objects/
                                  if (!uploadURL || !uploadURL.startsWith('/objects/')) {
                                    console.error('[Compliance] Invalid file URL format:', uploadURL);
                                    setIsUploading(false);
                                    toast({
                                      title: "Upload Error",
                                      description: "Invalid file URL format. Please try again.",
                                      variant: "destructive",
                                    });
                                    return;
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
                                    const errorData = await response.json().catch(() => ({}));
                                    throw new Error(errorData.error || 'Failed to set document permissions');
                                  }
                                  
                                  const { objectPath } = await response.json();
                                  field.onChange(objectPath);
                                  setIsUploading(false);
                                  toast({
                                    title: "File uploaded",
                                    description: "Document file uploaded successfully",
                                  });
                                } else {
                                  throw new Error('No file was uploaded');
                                }
                              } catch (error: any) {
                                console.error('Error uploading document:', error);
                                setIsUploading(false);
                                toast({
                                  title: "Upload failed",
                                  description: error.message || 'Failed to upload document. Please try again.',
                                  variant: "destructive",
                                });
                                form.setError('documentUrl', {
                                  type: 'manual',
                                  message: 'Upload failed. Please try again.'
                                });
                              }
                            }}
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            {isUploading ? 'Uploading...' : 'Select Document'}
                          </ObjectUploader>
                          {field.value && !isUploading && (
                            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                              <Check className="h-4 w-4" />
                              <span>Document uploaded successfully</span>
                            </div>
                          )}
                          {form.formState.errors.documentUrl && (
                            <p className="text-sm text-destructive">
                              {form.formState.errors.documentUrl.message}. Click "Select Document" to try again.
                            </p>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expiryDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        Expiry Date (Optional)
                      </FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="button-expiry-date"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? formatDate(new Date(field.value), "PPP") : <span>Pick a date</span>}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 z-[70]" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={field.value ? new Date(field.value) : undefined}
                            onSelect={(date) => field.onChange(date ? date.toISOString() : undefined)}
                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        Set an expiry date to receive alerts when this document needs renewal
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      setIsUploading(false);
                      form.reset();
                    }}
                    data-testid="button-cancel"
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-primary w-full sm:w-auto"
                    disabled={uploadMutation.isPending || isUploading || !form.watch('documentUrl') || !form.watch('documentType')}
                    data-testid="button-submit-document"
                  >
                    {uploadMutation.isPending ? "Saving..." : "Upload Document"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter and Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Search Bar */}
        <div className="flex-1 w-full sm:max-w-md">
          <Input
            placeholder="Search by type, property, or block..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>
        
        {/* Add Filter Button */}
        <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" />
              Add Filter
              {(filterType !== "all" || filterStatus !== "all" || filterProperty !== "all" || filterBlock !== "all" || sortBy !== "expiry" || sortOrder !== "asc") && (
                <Badge variant="secondary" className="ml-1">
                  {[
                    filterType !== "all" ? 1 : 0,
                    filterStatus !== "all" ? 1 : 0,
                    filterProperty !== "all" ? 1 : 0,
                    filterBlock !== "all" ? 1 : 0,
                    sortBy !== "expiry" || sortOrder !== "asc" ? 1 : 0
                  ].reduce((a, b) => a + b, 0)}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="font-medium">Filters & Sort</div>
              
              {/* Filter by Type */}
              <div className="space-y-2">
                <Label className="text-sm">Document Type</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {documentTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Filter by Status */}
              <div className="space-y-2">
                <Label className="text-sm">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="current">Current</SelectItem>
                    <SelectItem value="expiring">Expiring Soon</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Filter by Property */}
              <div className="space-y-2">
                <Label className="text-sm">Property</Label>
                <Select value={filterProperty} onValueChange={setFilterProperty}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Properties" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Properties</SelectItem>
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Filter by Block */}
              <div className="space-y-2">
                <Label className="text-sm">Block</Label>
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
              
              {/* Sort */}
              <div className="space-y-2">
                <Label className="text-sm">Sort By</Label>
                <div className="flex gap-2">
                  <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="type">Type</SelectItem>
                      <SelectItem value="status">Status</SelectItem>
                      <SelectItem value="expiry">Expiry Date</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                    title={sortOrder === "asc" ? "Ascending" : "Descending"}
                  >
                    {sortOrder === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              
              {/* Clear Filters */}
              {(filterType !== "all" || filterStatus !== "all" || filterProperty !== "all" || filterBlock !== "all" || sortBy !== "expiry" || sortOrder !== "asc") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterType("all");
                    setFilterStatus("all");
                    setFilterProperty("all");
                    setFilterBlock("all");
                    setSortBy("expiry");
                    setSortOrder("asc");
                  }}
                  className="w-full"
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear All Filters
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      
      {/* Active Filters Display */}
      {(filterType !== "all" || filterStatus !== "all" || filterProperty !== "all" || filterBlock !== "all") && (
        <div className="flex flex-wrap gap-2 items-center">
          {filterType !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Type: {filterType}
              <button
                onClick={() => setFilterType("all")}
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filterStatus !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Status: {filterStatus === "current" ? "Current" : filterStatus === "expiring" ? "Expiring Soon" : "Expired"}
              <button
                onClick={() => setFilterStatus("all")}
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filterProperty !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Property: {getPropertyName(filterProperty) || filterProperty}
              <button
                onClick={() => setFilterProperty("all")}
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filterBlock !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Block: {getBlockName(filterBlock) || filterBlock}
              <button
                onClick={() => setFilterBlock("all")}
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      {expiringDocs.length > 0 && (
        <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            <span className="font-semibold">{expiringDocs.length} document(s)</span> expiring within 90 days. Please renew them soon.
          </AlertDescription>
        </Alert>
      )}

      {expiredDocs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h2 className="text-xl font-semibold text-destructive" data-testid="heading-expired">
              Expired Documents ({expiredDocs.length})
            </h2>
          </div>
          <div className="grid gap-4">
            {expiredDocs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                getStatusBadge={getStatusBadge}
                getPropertyName={getPropertyName}
                getBlockName={getBlockName}
                allTags={allTags}
                docTags={selectedDoc === doc.id ? docTags : []}
                selectedDoc={selectedDoc}
                setSelectedDoc={setSelectedDoc}
                setTagDialogOpen={setTagDialogOpen}
                addTagMutation={addTagMutation}
                removeTagMutation={removeTagMutation}
                onEdit={openEditSheet}
              />
            ))}
          </div>
          <Separator className="my-6" />
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold" data-testid="heading-current">
          {expiredDocs.length > 0 ? 'Current Documents' : 'All Documents'} ({currentDocs.length})
        </h2>
        
        {isLoading ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Loading documents...
            </CardContent>
          </Card>
        ) : currentDocs.length === 0 && expiredDocs.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No compliance documents uploaded yet.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Upload your first document to get started.
              </p>
            </CardContent>
          </Card>
        ) : currentDocs.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">All documents are expired. Please upload new documents.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {currentDocs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                getStatusBadge={getStatusBadge}
                getPropertyName={getPropertyName}
                getBlockName={getBlockName}
                allTags={allTags}
                docTags={selectedDoc === doc.id ? docTags : []}
                selectedDoc={selectedDoc}
                setSelectedDoc={setSelectedDoc}
                setTagDialogOpen={setTagDialogOpen}
                addTagMutation={addTagMutation}
                removeTagMutation={removeTagMutation}
                onEdit={openEditSheet}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Compliance Document Sheet */}
      <Sheet open={editSheetOpen} onOpenChange={setEditSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Compliance Document</SheetTitle>
            <SheetDescription>
              Update the details for this compliance document.
            </SheetDescription>
          </SheetHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-6 mt-6">
              <FormField
                control={editForm.control}
                name="documentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Document Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-document-type">
                          <SelectValue placeholder="Select document type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {allDocumentTypes.map((type) => (
                          <SelectItem key={type} value={type} data-testid={`option-edit-type-${type}`}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="expiryDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Expiry Date (Optional)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-edit-expiry-date"
                          >
                            {field.value ? (
                              formatDate(new Date(field.value), "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={field.value ? new Date(field.value) : undefined}
                          onSelect={(date) => {
                            field.onChange(date ? date.toISOString().split('T')[0] : undefined);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      Leave blank if the document does not expire
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="propertyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Property (Optional)</FormLabel>
                    <Select 
                      onValueChange={(val) => {
                        field.onChange(val === "none" ? undefined : val);
                        if (val !== "none") {
                          editForm.setValue("blockId", undefined);
                        }
                      }} 
                      value={field.value || "none"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-property">
                          <SelectValue placeholder="Select property" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None (Organization-wide)</SelectItem>
                        {properties.map((property) => (
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
                control={editForm.control}
                name="blockId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Block (Optional)</FormLabel>
                    <Select 
                      onValueChange={(val) => {
                        field.onChange(val === "none" ? undefined : val);
                        if (val !== "none") {
                          editForm.setValue("propertyId", undefined);
                        }
                      }} 
                      value={field.value || "none"}
                      disabled={!!editForm.watch("propertyId")}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-block">
                          <SelectValue placeholder="Select block" />
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
                    <FormDescription>
                      Select a block if this document applies to all properties in a block
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditSheetOpen(false)}
                  className="flex-1"
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="flex-1"
                  data-testid="button-save-edit"
                >
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface DocumentCardProps {
  doc: ComplianceDocument;
  getStatusBadge: (doc: ComplianceDocument) => JSX.Element;
  getPropertyName: (id: string | null) => string | null;
  getBlockName: (id: string | null) => string | null;
  allTags: Tag[];
  docTags: Tag[];
  selectedDoc: string | null;
  setSelectedDoc: (id: string | null) => void;
  setTagDialogOpen: (open: boolean) => void;
  addTagMutation: any;
  removeTagMutation: any;
  onEdit: (doc: ComplianceDocument) => void;
}

function DocumentCard({
  doc,
  getStatusBadge,
  getPropertyName,
  getBlockName,
  allTags,
  docTags,
  selectedDoc,
  setSelectedDoc,
  setTagDialogOpen,
  addTagMutation,
  removeTagMutation,
  onEdit,
}: DocumentCardProps) {
  const propertyName = getPropertyName(doc.propertyId);
  const blockName = getBlockName(doc.blockId);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);

  const handleAddTag = (tagId: string) => {
    addTagMutation.mutate({ docId: doc.id, tagId });
    setTagPopoverOpen(false);
  };

  const handleRemoveTag = (tagId: string) => {
    removeTagMutation.mutate({ docId: doc.id, tagId });
  };

  const availableTags = allTags.filter(
    tag => !docTags.some(dt => dt.id === tag.id)
  );

  return (
    <Card className="hover-elevate" data-testid={`card-document-${doc.id}`}>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1 space-y-2">
            <CardTitle className="text-base md:text-lg flex items-center gap-2 flex-wrap">
              <FileText className="w-5 h-5 text-primary flex-shrink-0" />
              <span data-testid={`text-document-type-${doc.id}`} className="break-words">
                {doc.documentType}
              </span>
            </CardTitle>
            
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {doc.expiryDate && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  <span data-testid={`text-expiry-date-${doc.id}`}>
                    {formatDate(new Date(doc.expiryDate.toString()), 'PPP')}
                  </span>
                </div>
              )}
              
              {propertyName && (
                <div className="flex items-center gap-1.5">
                  <Home className="w-4 h-4" />
                  <span>{propertyName}</span>
                </div>
              )}
              
              {blockName && (
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" />
                  <span>{blockName}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedDoc === doc.id && docTags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="outline"
                  style={{ 
                    borderColor: tag.color || undefined, 
                    backgroundColor: tag.color ? `${tag.color}15` : undefined,
                    color: tag.color || undefined
                  } as React.CSSProperties}
                  className="gap-1"
                  data-testid={`badge-tag-${tag.id}`}
                >
                  {tag.name}
                  <button
                    onClick={() => handleRemoveTag(tag.id)}
                    className="hover:bg-background/20 rounded-full p-0.5"
                    data-testid={`button-remove-tag-${tag.id}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              
              {selectedDoc === doc.id && (
                <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-6 px-2 text-xs"
                      data-testid={`button-add-tag-${doc.id}`}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Tag
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search tags..." />
                      <CommandList>
                        <CommandEmpty>No tags found.</CommandEmpty>
                        <CommandGroup>
                          {availableTags.map((tag) => (
                            <CommandItem
                              key={tag.id}
                              onSelect={() => handleAddTag(tag.id)}
                              data-testid={`option-tag-${tag.id}`}
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: tag.color || undefined } as React.CSSProperties}
                                />
                                <span>{tag.name}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
              
              {selectedDoc !== doc.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setSelectedDoc(doc.id)}
                  data-testid={`button-manage-tags-${doc.id}`}
                >
                  <TagIcon className="w-3 h-3 mr-1" />
                  Manage Tags
                </Button>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {getStatusBadge(doc)}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(doc)}
              data-testid={`button-edit-document-${doc.id}`}
            >
              <Pencil className="w-4 h-4 mr-1" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
              data-testid={`button-view-document-${doc.id}`}
            >
              <a href={`/api/compliance/${doc.id}/view`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-1" />
                View
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>
      {doc.createdAt && (
        <CardContent className="pt-0">
          <p className="text-xs md:text-sm text-muted-foreground">
            Uploaded {formatDate(new Date(doc.createdAt.toString()), 'PPP')}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
