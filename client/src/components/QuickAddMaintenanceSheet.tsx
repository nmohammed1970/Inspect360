import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Loader2 } from "lucide-react";

interface QuickAddMaintenanceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
  blockId?: string;
  inspectionId?: string;
  inspectionEntryId?: string;
}

export function QuickAddMaintenanceSheet({
  open,
  onOpenChange,
  propertyId,
  blockId,
  inspectionId,
  inspectionEntryId,
}: QuickAddMaintenanceSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If we have a blockId but no propertyId, fetch properties for the block
  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
    enabled: !!blockId && !propertyId,
  });

  // Filter properties to only those in the current block
  const blockProperties = blockId && !propertyId 
    ? properties.filter(p => p.blockId === blockId)
    : [];

  const form = useForm<QuickAddMaintenance>({
    resolver: zodResolver(quickAddMaintenanceSchema),
    defaultValues: {
      title: "",
      description: "",
      propertyId: propertyId || (blockProperties.length === 1 ? blockProperties[0].id : ""),
      priority: "medium",
      photoUrls: [],
      inspectionId: inspectionId || undefined,
      inspectionEntryId: inspectionEntryId || undefined,
      source: "inspection",
    },
  });

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

    try {
      if (isOnline) {
        // Online: submit directly
        await createMaintenanceMutation.mutateAsync(data);
      } else {
        // Offline: queue for later sync
        offlineQueue.enqueueMaintenance(data);
        toast({
          title: "Maintenance Queued",
          description: "Request will be logged when you're back online",
        });
        form.reset();
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[75vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Quick Log Maintenance</SheetTitle>
          <SheetDescription>
            Log a maintenance issue found during inspection
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
