import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { offlineQueue, useOnlineStatus } from "@/lib/offlineQueue";
import type { QuickAddAsset } from "@shared/schema";
import { quickAddAssetSchema } from "@shared/schema";
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
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Camera, X } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";

interface QuickAddAssetSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
  blockId?: string;
  inspectionId?: string;
  inspectionEntryId?: string;
}

const ASSET_CATEGORIES = [
  "HVAC",
  "Appliances",
  "Furniture",
  "Plumbing",
  "Electrical",
  "Flooring",
  "Windows & Doors",
  "Kitchen",
  "Bathroom",
  "Security",
  "Lighting",
  "Other",
];

export function QuickAddAssetSheet({
  open,
  onOpenChange,
  propertyId,
  blockId,
  inspectionId,
  inspectionEntryId,
}: QuickAddAssetSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);

  const form = useForm<QuickAddAsset>({
    resolver: zodResolver(quickAddAssetSchema),
    defaultValues: {
      name: "",
      category: "",
      condition: "good",
      cleanliness: undefined,
      location: "",
      description: "",
      propertyId: propertyId || undefined,
      blockId: blockId || undefined,
      photos: [],
      inspectionId: inspectionId || undefined,
      inspectionEntryId: inspectionEntryId || undefined,
    },
  });

  const createAssetMutation = useMutation({
    mutationFn: async (data: QuickAddAsset) => {
      return await apiRequest("POST", "/api/asset-inventory/quick", data);
    },
    onSuccess: () => {
      // Invalidate global asset inventory query
      queryClient.invalidateQueries({ queryKey: ["/api/asset-inventory"] });
      // Invalidate property-specific inventory query if propertyId exists
      if (propertyId) {
        queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "inventory"] });
      }
      // Invalidate block-specific inventory query if blockId exists
      if (blockId) {
        queryClient.invalidateQueries({ queryKey: ["/api/blocks", blockId, "inventory"] });
      }
      toast({
        title: "Asset Added",
        description: "Asset has been added to the inventory successfully",
      });
      form.reset();
      setPhotos([]);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Add Asset",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: QuickAddAsset) => {
    setIsSubmitting(true);

    try {
      const dataWithPhotos = { ...data, photos };
      
      if (isOnline) {
        // Online: submit directly
        await createAssetMutation.mutateAsync(dataWithPhotos);
      } else {
        // Offline: queue for later sync
        offlineQueue.enqueueAsset(dataWithPhotos);
        toast({
          title: "Asset Queued",
          description: "Asset will be added when you're back online",
        });
        form.reset();
        setPhotos([]);
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePhotoUploaded = (photoUrl: string) => {
    setPhotos((prev) => [...prev, photoUrl]);
    toast({
      title: "Photo Added",
      description: "Photo has been uploaded successfully",
    });
  };

  const handleRemovePhoto = (photoUrl: string) => {
    setPhotos((prev) => prev.filter((p) => p !== photoUrl));
  };

  const getUploadParameters = async () => {
    const response = await apiRequest("POST", "/api/upload/get-upload-url", {
      contentType: "image/jpeg",
    });
    return response.json();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Quick Add Asset</SheetTitle>
          <SheetDescription>
            Add an asset to the inventory during inspection
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Asset Name *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g., Refrigerator, HVAC Unit, Washing Machine"
                      data-testid="input-asset-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ASSET_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
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
              name="condition"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condition *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-condition">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="excellent">Excellent</SelectItem>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="fair">Fair</SelectItem>
                      <SelectItem value="poor">Poor</SelectItem>
                      <SelectItem value="needs_replacement">
                        Needs Replacement
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g., Kitchen, Bedroom 1, Common Area"
                      data-testid="input-location"
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
                      placeholder="Additional notes about the asset..."
                      rows={3}
                      data-testid="textarea-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3">
              <FormLabel>Photos</FormLabel>
              
              {photos.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {photos.map((photoUrl, index) => (
                    <Card key={index} className="overflow-hidden">
                      <CardContent className="p-0">
                        <div className="relative group">
                          <img
                            src={photoUrl}
                            alt={`Asset photo ${index + 1}`}
                            className="w-full h-32 object-cover"
                            data-testid={`img-asset-photo-${index}`}
                          />
                          <Button
                            size="icon"
                            variant="destructive"
                            className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleRemovePhoto(photoUrl)}
                            type="button"
                            data-testid={`button-remove-photo-${index}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {isOnline ? (
                <ObjectUploader
                  maxNumberOfFiles={5}
                  maxFileSize={10485760}
                  onGetUploadParameters={getUploadParameters}
                  onComplete={(result) => {
                    if (result.successful && result.successful.length > 0) {
                      result.successful.forEach((file: any) => {
                        const photoUrl = file.uploadURL || file.meta?.extractedFileUrl;
                        if (photoUrl) {
                          handlePhotoUploaded(photoUrl);
                        }
                      });
                    }
                  }}
                  buttonClassName="w-full"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full gap-2 border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-foreground"
                    data-testid="button-add-photo"
                  >
                    <Camera className="h-4 w-4" />
                    {photos.length === 0 ? "Add Photo" : "Add More Photos"}
                  </Button>
                </ObjectUploader>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full gap-2 border border-dashed border-muted-foreground/40 text-muted-foreground"
                  disabled
                  data-testid="button-add-photo-disabled"
                >
                  <Camera className="h-4 w-4" />
                  Photos unavailable offline
                </Button>
              )}
              
              <p className="text-xs text-muted-foreground">
                Take or upload photos of the asset (max 5 photos)
              </p>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="ghost"
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
                data-testid="button-add-asset"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>Add Asset{!isOnline && " (Offline)"}</>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
