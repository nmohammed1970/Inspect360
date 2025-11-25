import { useState, useEffect, useRef, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { offlineQueue, useOnlineStatus } from "@/lib/offlineQueue";
import { extractFileUrlFromUploadResponse } from "@/lib/utils";
import type { QuickAddMaintenance } from "@shared/schema";
import { quickAddMaintenanceSchema } from "@shared/schema";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Button } from "@/components/ui/button";
import { Loader2, Camera, X, Image as ImageIcon } from "lucide-react";
import Uppy from "@uppy/core";
import { Dashboard } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";
import Webcam from "@uppy/webcam";
import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";
import "@uppy/webcam/css/style.min.css";

interface QuickAddMaintenanceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
  blockId?: string;
  inspectionId?: string;
  inspectionEntryId?: string;
  fieldLabel?: string;
  sectionTitle?: string;
  initialPhotos?: string[];
}

export function QuickAddMaintenanceSheet({
  open,
  onOpenChange,
  propertyId,
  blockId,
  inspectionId,
  inspectionEntryId,
  fieldLabel,
  sectionTitle,
  initialPhotos = [],
}: QuickAddMaintenanceSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>(initialPhotos);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);

  useEffect(() => {
    setPhotoUrls(initialPhotos);
  }, [initialPhotos, open]);

  const [uppy] = useState(() => {
    const uppyInstance = new Uppy({
      restrictions: {
        maxNumberOfFiles: 5,
        maxFileSize: 10485760,
        allowedFileTypes: ['image/*'],
      },
      autoProceed: false,
    })
      .use(Webcam, {
        modes: ['picture'],
        facingMode: 'environment',
      } as any)
      .use(AwsS3, {
        shouldUseMultipart: false,
        async getUploadParameters(file: any) {
          const response = await fetch('/api/objects/upload', {
            method: 'POST',
            credentials: 'include',
          });
          const { uploadURL } = await response.json();
          uppyInstance.setFileMeta(file.id, { originalUploadURL: uploadURL });
          return {
            method: 'PUT',
            url: uploadURL,
          };
        },
      });
    return uppyInstance;
  });

  useEffect(() => {
    const handleUploadSuccess = (file: any, response: any) => {
      const fileUrl = extractFileUrlFromUploadResponse(file, response);
      if (fileUrl) {
        file.meta = file.meta || {};
        file.meta.extractedFileUrl = fileUrl;
      }
    };

    const handleComplete = async (result: any) => {
      if (result.successful && result.successful.length > 0) {
        const newUrls: string[] = [];
        for (const file of result.successful) {
          let uploadURL = file.meta?.extractedFileUrl || file.uploadURL;
          if (uploadURL && (uploadURL.startsWith('http://') || uploadURL.startsWith('https://'))) {
            try {
              const urlObj = new URL(uploadURL);
              uploadURL = urlObj.pathname;
            } catch (e) {
              console.error('[MaintenanceSheet] Invalid upload URL:', uploadURL);
              continue;
            }
          }
          if (uploadURL && uploadURL.startsWith('/objects/')) {
            try {
              const absoluteUrl = `${window.location.origin}${uploadURL}`;
              const aclResponse = await fetch('/api/objects/set-acl', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ photoUrl: absoluteUrl }),
              });
              const { objectPath } = await aclResponse.json();
              newUrls.push(objectPath || uploadURL);
            } catch (error) {
              newUrls.push(uploadURL);
            }
          }
        }
        setPhotoUrls(prev => [...prev, ...newUrls]);
        setShowPhotoUpload(false);
        uppy.cancelAll();
      }
    };

    uppy.on("upload-success", handleUploadSuccess);
    uppy.on("complete", handleComplete);

    return () => {
      uppy.off("upload-success", handleUploadSuccess);
      uppy.off("complete", handleComplete);
    };
  }, [uppy]);

  const removePhoto = (index: number) => {
    setPhotoUrls(prev => prev.filter((_, i) => i !== index));
  };

  // If we have a blockId but no propertyId, fetch properties for the block
  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
    enabled: !!blockId && !propertyId,
  });

  // Filter properties to only those in the current block - memoized to avoid re-renders
  const blockProperties = useMemo(() => {
    if (blockId && !propertyId) {
      return properties.filter(p => p.blockId === blockId);
    }
    return [];
  }, [blockId, propertyId, properties]);

  // Derive the default property ID for form reset
  const defaultPropertyId = useMemo(() => {
    return propertyId || (blockProperties.length === 1 ? blockProperties[0].id : "");
  }, [propertyId, blockProperties]);

  const form = useForm<QuickAddMaintenance>({
    resolver: zodResolver(quickAddMaintenanceSchema),
    defaultValues: {
      title: "",
      description: "",
      propertyId: defaultPropertyId,
      priority: "medium",
      photoUrls: [],
      inspectionId: inspectionId || undefined,
      inspectionEntryId: inspectionEntryId || undefined,
      source: "inspection",
    },
  });

  // Track previous inspectionEntryId to detect actual context changes
  const prevEntryIdRef = useRef<string | undefined>(undefined);

  // Reset form only when the sheet opens OR when the inspection entry actually changes
  useEffect(() => {
    const entryChanged = inspectionEntryId !== prevEntryIdRef.current;
    if (open && entryChanged) {
      form.reset({
        title: "",
        description: "",
        propertyId: defaultPropertyId,
        priority: "medium",
        photoUrls: [],
        inspectionId: inspectionId || undefined,
        inspectionEntryId: inspectionEntryId || undefined,
        source: "inspection",
      });
      prevEntryIdRef.current = inspectionEntryId;
    }
  }, [open, inspectionId, inspectionEntryId, defaultPropertyId, form]);

  // Update propertyId when blockProperties change
  if (blockProperties.length === 1 && !form.getValues("propertyId")) {
    form.setValue("propertyId", blockProperties[0].id);
  }

  const createMaintenanceMutation = useMutation({
    mutationFn: async (data: QuickAddMaintenance) => {
      return await apiRequest("POST", "/api/maintenance/quick", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"], refetchType: "active" });
      toast({
        title: "Maintenance Request Created",
        description: "The maintenance request has been logged successfully",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Log Maintenance",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: QuickAddMaintenance) => {
    setIsSubmitting(true);

    const submissionData = {
      ...data,
      photoUrls: photoUrls,
    };

    try {
      if (isOnline) {
        await createMaintenanceMutation.mutateAsync(submissionData);
        setPhotoUrls([]);
      } else {
        offlineQueue.enqueueMaintenance(submissionData);
        toast({
          title: "Maintenance Queued",
          description: "Request will be logged when you're back online",
        });
        form.reset();
        setPhotoUrls([]);
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Log Maintenance Issue</SheetTitle>
          <SheetDescription>
            {sectionTitle && fieldLabel 
              ? `Log a maintenance issue for ${fieldLabel} in ${sectionTitle}`
              : "Log a maintenance issue found during inspection"}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Issue Title *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g., Leaking faucet, Damaged wall, Broken window"
                      data-testid="input-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Property selector for block-level inspections */}
            {blockId && !propertyId && blockProperties.length > 0 && (
              <FormField
                control={form.control}
                name="propertyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Property *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-property">
                          <SelectValue placeholder="Select property" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {blockProperties.map((property) => (
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

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Describe the issue in detail..."
                      rows={4}
                      data-testid="textarea-description"
                    />
                  </FormControl>
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
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>Photos</FormLabel>
              {photoUrls.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {photoUrls.map((url, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={url}
                        alt={`Maintenance photo ${index + 1}`}
                        className="w-20 h-20 object-cover rounded-md border"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                        data-testid={`button-remove-photo-${index}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {showPhotoUpload ? (
                <div className="border rounded-md p-2">
                  <Dashboard
                    uppy={uppy}
                    plugins={['Webcam']}
                    hideUploadButton={false}
                    height={250}
                    proudlyDisplayPoweredByUppy={false}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPhotoUpload(false)}
                    className="mt-2 w-full"
                    data-testid="button-cancel-photo-upload"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPhotoUpload(true)}
                  className="w-full"
                  data-testid="button-add-photo"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {photoUrls.length > 0 ? "Add More Photos" : "Add Photos"}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Capture or upload photos of the maintenance issue
              </p>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isSubmitting}
                data-testid="button-log-maintenance"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging...
                  </>
                ) : (
                  <>Log Request{!isOnline && " (Offline)"}</>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
