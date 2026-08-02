import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { offlineQueue, useOnlineStatus } from "@/lib/offlineQueue";
import { fileUploadSync } from "@/lib/fileUploadSync";
import { prepareImageForUpload } from "@/lib/compressImage";
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
// Removed Uppy - using simple file input instead

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
  const [photoUrlMap, setPhotoUrlMap] = useState<Map<string, string>>(new Map()); // Map of display URLs to original URLs
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use ref to track previous initialPhotos to avoid unnecessary updates
  const prevInitialPhotosRef = useRef<string[]>(initialPhotos);
  
  useEffect(() => {
    // Only update if initialPhotos actually changed (deep comparison)
    if (JSON.stringify(prevInitialPhotosRef.current) !== JSON.stringify(initialPhotos)) {
      setPhotoUrls(initialPhotos);
      prevInitialPhotosRef.current = initialPhotos;
    }
  }, [initialPhotos, open]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const uploadPromises: Promise<{ url: string; isOffline: boolean }>[] = [];

    for (let i = 0; i < files.length; i++) {
      let file = files[i];
      
      // Validate file
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not an image file`,
          variant: "destructive",
        });
        continue;
      }

      try {
        file = await prepareImageForUpload(file);
      } catch {
        toast({
          title: "Compression failed",
          description: `Could not compress ${file.name}. Try another photo.`,
          variant: "destructive",
        });
        continue;
      }

      const uploadPromise = (async () => {
        try {
          const result = await fileUploadSync.uploadFile(file, '/api/objects/upload-file', isOnline);
          
          if (!result.success) {
            throw new Error(result.error || 'Upload failed');
          }

          const originalUrl = result.url || '';
          
          // If offline, we get a temporary offline URL
          // For display purposes, we'll use a blob URL
          let displayUrl = originalUrl;
          if (originalUrl.startsWith('offline://')) {
            // Get blob URL for offline files
            displayUrl = await fileUploadSync.getFileUrl(originalUrl) || originalUrl;
          }

          return { 
            originalUrl, 
            displayUrl, 
            isOffline: originalUrl.startsWith('offline://') 
          };
        } catch (error: any) {
          console.error('[QuickAddMaintenanceSheet] Upload error:', error);
          toast({
            title: "Upload Failed",
            description: `Failed to upload ${file.name}: ${error.message}`,
            variant: "destructive",
          });
          throw error;
        }
      })();

      uploadPromises.push(uploadPromise);
    }

    try {
      const results = await Promise.all(uploadPromises);
      const displayUrls = results.map(r => r.displayUrl);
      const hasOffline = results.some(r => r.isOffline);
      
      // Store mapping of display URLs to original URLs
      const newMap = new Map(photoUrlMap);
      results.forEach(r => {
        newMap.set(r.displayUrl, r.originalUrl);
      });
      setPhotoUrlMap(newMap);
      
      setPhotoUrls(prev => [...prev, ...displayUrls]);
      
      if (hasOffline) {
        toast({
          title: "Saved Offline",
          description: `${displayUrls.length} photo(s) will upload when connection is restored`,
        });
      } else {
        toast({
          title: "Upload Successful",
          description: `${displayUrls.length} photo(s) uploaded successfully`,
        });
      }
    } catch (error) {
      // Individual errors already handled above
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removePhoto = (index: number) => {
    const urlToRemove = photoUrls[index];
    // Clean up blob URL if it's a blob URL
    if (urlToRemove && urlToRemove.startsWith('blob:')) {
      fileUploadSync.revokeFileUrl(urlToRemove);
    }
    setPhotoUrls(prev => prev.filter((_, i) => i !== index));
    // Remove from map
    const newMap = new Map(photoUrlMap);
    newMap.delete(urlToRemove);
    setPhotoUrlMap(newMap);
  };

  const form = useForm<QuickAddMaintenance>({
    resolver: zodResolver(quickAddMaintenanceSchema),
    defaultValues: {
      title: "",
      description: "",
      propertyId: propertyId || undefined,
      blockId: blockId || undefined,
      priority: "medium",
      photoUrls: [],
      inspectionId: inspectionId || undefined,
      inspectionEntryId: inspectionEntryId || undefined,
      source: "inspection",
    },
  });

  // Track if sheet was previously open
  const wasOpenRef = useRef(false);

  // Reset form every time the sheet opens
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      // Sheet just opened - reset form with current context
      form.reset({
        title: "",
        description: "",
        propertyId: propertyId || undefined,
        blockId: blockId || undefined,
        priority: "medium",
        photoUrls: [],
        inspectionId: inspectionId || undefined,
        inspectionEntryId: inspectionEntryId || undefined,
        source: inspectionId ? "inspection" : "manual",
      });
      setPhotoUrls(initialPhotos);
    }
    wasOpenRef.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, propertyId, blockId]);

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

    // Convert display URLs back to original URLs for submission
    const originalPhotoUrls = photoUrls.map(url => {
      const originalUrl = photoUrlMap.get(url);
      return originalUrl || url;
    });

    const submissionData = {
      ...data,
      photoUrls: originalPhotoUrls,
    };

    try {
      if (isOnline) {
        await createMaintenanceMutation.mutateAsync(submissionData);
        setPhotoUrls([]);
        setPhotoUrlMap(new Map());
      } else {
        offlineQueue.enqueueMaintenance(submissionData);
        toast({
          title: "Maintenance Queued",
          description: "Request will be logged when you're back online",
        });
        form.reset();
        setPhotoUrls([]);
        setPhotoUrlMap(new Map());
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto max-w-3xl mx-auto">
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

            <div className="space-y-3">
              <FormLabel>Photos (Optional)</FormLabel>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
                id="photo-upload-input"
              />
              
              {photoUrls.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {photoUrls.map((url, index) => (
                      <div key={index} className="relative aspect-square">
                        <img
                          src={url}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-full object-cover rounded-md border"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(index)}
                          className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 shadow-sm"
                          data-testid={`button-remove-photo-${index}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || photoUrls.length >= 5}
                    data-testid="button-add-more-photos"
                  >
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4 mr-2" />
                    )}
                    {isUploading ? "Uploading..." : "Add More"}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full h-20 border-dashed"
                  data-testid="button-add-photo"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Camera className="w-5 h-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Add Photos</span>
                    </div>
                  )}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Max 50MB per file (auto-compressed if over 10MB), up to 5 photos
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
