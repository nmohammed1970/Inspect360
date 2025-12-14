import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { offlineQueue, useOnlineStatus } from "@/lib/offlineQueue";
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
    const uploadPromises: Promise<string>[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Validate file
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not an image file`,
          variant: "destructive",
        });
        continue;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 10MB limit`,
          variant: "destructive",
        });
        continue;
      }

      const uploadPromise = (async () => {
        try {
          const formData = new FormData();
          formData.append('file', file);

          const response = await fetch('/api/objects/upload-file', {
            method: 'POST',
            credentials: 'include',
            body: formData,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Upload failed: ${response.status} ${errorText.substring(0, 100)}`);
          }

          const data = await response.json();
          const photoUrl = data.url || data.path;
          
          if (!photoUrl) {
            throw new Error('Upload response missing URL');
          }

          return photoUrl;
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
      const uploadedUrls = await Promise.all(uploadPromises);
      setPhotoUrls(prev => [...prev, ...uploadedUrls]);
      toast({
        title: "Upload Successful",
        description: `${uploadedUrls.length} photo(s) uploaded successfully`,
      });
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
    setPhotoUrls(prev => prev.filter((_, i) => i !== index));
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
                Max 10MB per file, up to 5 photos
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
