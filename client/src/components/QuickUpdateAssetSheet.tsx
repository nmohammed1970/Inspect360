import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { offlineQueue, useOnlineStatus } from "@/lib/offlineQueue";
import type { QuickUpdateAsset, AssetInventory } from "@shared/schema";
import { quickUpdateAssetSchema } from "@shared/schema";
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
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Package } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface QuickUpdateAssetSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
  blockId?: string;
  inspectionId?: string;
  inspectionEntryId?: string;
}

export function QuickUpdateAssetSheet({
  open,
  onOpenChange,
  propertyId,
  blockId,
  inspectionId,
  inspectionEntryId,
}: QuickUpdateAssetSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [selectedAsset, setSelectedAsset] = useState<AssetInventory | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Build query params for filtering assets
  const queryParams = new URLSearchParams();
  if (propertyId) queryParams.append("propertyId", propertyId);
  if (blockId) queryParams.append("blockId", blockId);

  // Fetch assets for the current property/block
  const { data: assets = [], isLoading: isLoadingAssets } = useQuery<AssetInventory[]>({
    queryKey: ["/api/asset-inventory", propertyId, blockId],
    enabled: open && (!!propertyId || !!blockId),
  });

  // Update selectedAsset when selectedAssetId changes
  useEffect(() => {
    if (selectedAssetId && assets.length > 0) {
      const asset = assets.find((a) => a.id === selectedAssetId);
      setSelectedAsset(asset || null);
      
      // Pre-fill form with current values
      if (asset) {
        form.reset({
          condition: asset.condition,
          cleanliness: asset.cleanliness || undefined,
          location: asset.location || "",
          notes: asset.description || "",
          inspectionId: inspectionId || undefined,
          inspectionEntryId: inspectionEntryId || undefined,
        });
      }
    }
  }, [selectedAssetId, assets, inspectionId, inspectionEntryId]);

  const form = useForm<QuickUpdateAsset>({
    resolver: zodResolver(quickUpdateAssetSchema),
    defaultValues: {
      condition: undefined,
      cleanliness: undefined,
      location: "",
      notes: "",
      inspectionId: inspectionId || undefined,
      inspectionEntryId: inspectionEntryId || undefined,
    },
  });

  const updateAssetMutation = useMutation({
    mutationFn: async (data: QuickUpdateAsset & { assetId: string }) => {
      const { assetId, ...payload } = data;
      return await apiRequest("PATCH", `/api/asset-inventory/${assetId}/quick`, payload);
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
        title: "Asset Updated",
        description: "Asset has been updated successfully",
      });
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Update Asset",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: QuickUpdateAsset) => {
    if (!selectedAssetId) {
      toast({
        title: "No Asset Selected",
        description: "Please select an asset to update",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (isOnline) {
        // Online: submit directly
        await updateAssetMutation.mutateAsync({ ...data, assetId: selectedAssetId });
      } else {
        // Offline: queue for later sync
        offlineQueue.enqueueAssetUpdate(selectedAssetId, data);
        toast({
          title: "Update Queued",
          description: "Asset update will be synced when you're back online",
        });
        handleClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedAssetId("");
    setSelectedAsset(null);
    form.reset();
    onOpenChange(false);
  };

  const getConditionBadgeVariant = (condition: string) => {
    switch (condition) {
      case "excellent":
        return "default";
      case "good":
        return "secondary";
      case "fair":
        return "secondary";
      case "poor":
        return "destructive";
      case "needs_replacement":
        return "destructive";
      default:
        return "secondary";
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Quick Update Asset</SheetTitle>
          <SheetDescription>
            Update existing inventory during inspection
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Asset Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="asset-select">
              Select Asset *
            </label>
            <Select
              value={selectedAssetId}
              onValueChange={setSelectedAssetId}
              disabled={isLoadingAssets}
            >
              <SelectTrigger id="asset-select" data-testid="select-asset">
                <SelectValue placeholder={isLoadingAssets ? "Loading assets..." : "Search and select asset..."} />
              </SelectTrigger>
              <SelectContent>
                {assets.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No assets found for this location
                  </div>
                ) : (
                  assets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{asset.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {asset.category && `• ${asset.category}`}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {asset.condition}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Current Asset State */}
          {selectedAsset && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Current State</CardTitle>
                <CardDescription>Review before updating</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Asset Name</p>
                    <p className="font-medium">{selectedAsset.name}</p>
                  </div>
                  {selectedAsset.category && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Category</p>
                      <p className="font-medium">{selectedAsset.category}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Condition</p>
                    <Badge variant={getConditionBadgeVariant(selectedAsset.condition)}>
                      {selectedAsset.condition}
                    </Badge>
                  </div>
                  {selectedAsset.cleanliness && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Cleanliness</p>
                      <Badge variant="outline">{selectedAsset.cleanliness}</Badge>
                    </div>
                  )}
                </div>
                {selectedAsset.location && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Location</p>
                    <p className="text-sm">{selectedAsset.location}</p>
                  </div>
                )}
                {selectedAsset.description && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Description</p>
                    <p className="text-sm">{selectedAsset.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Update Form */}
          {selectedAsset && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Update Condition</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || selectedAsset.condition}
                      >
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
                  name="cleanliness"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Update Cleanliness (Optional)</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || selectedAsset.cleanliness || ""}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-cleanliness">
                            <SelectValue placeholder="Select cleanliness" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="clean">Clean</SelectItem>
                          <SelectItem value="needs_a_clean">Needs a Clean</SelectItem>
                          <SelectItem value="poor">Poor</SelectItem>
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
                      <FormLabel>Update Location (Optional)</FormLabel>
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
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Update Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Additional notes about changes..."
                          rows={3}
                          data-testid="textarea-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={handleClose}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={isSubmitting}
                    data-testid="button-update-asset"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>Update Asset{!isOnline && " (Offline)"}</>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {/* No Selection State */}
          {!selectedAsset && !isLoadingAssets && assets.length > 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Search className="h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground text-center">
                  Select an asset above to update its details
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
