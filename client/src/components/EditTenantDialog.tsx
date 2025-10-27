import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
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
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  leaseStartDate: z.string().optional(),
  leaseEndDate: z.string().optional(),
  monthlyRent: z.string().optional(),
  depositAmount: z.string().optional(),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

interface TenantAssignment {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  assignment: {
    id: string;
    leaseStartDate?: Date | string;
    leaseEndDate?: Date | string;
    monthlyRent?: string;
    depositAmount?: string;
    isActive: boolean;
  };
}

interface EditTenantDialogProps {
  propertyId: string;
  tenant: TenantAssignment;
  children: React.ReactNode;
  onSuccess?: () => void;
}

export default function EditTenantDialog({
  propertyId,
  tenant,
  children,
  onSuccess,
}: EditTenantDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      leaseStartDate: "",
      leaseEndDate: "",
      monthlyRent: "",
      depositAmount: "",
      isActive: true,
    },
  });

  useEffect(() => {
    if (open && tenant) {
      const leaseStartDate = tenant.assignment.leaseStartDate
        ? new Date(tenant.assignment.leaseStartDate).toISOString().split("T")[0]
        : "";
      const leaseEndDate = tenant.assignment.leaseEndDate
        ? new Date(tenant.assignment.leaseEndDate).toISOString().split("T")[0]
        : "";

      form.reset({
        leaseStartDate,
        leaseEndDate,
        monthlyRent: tenant.assignment.monthlyRent || "",
        depositAmount: tenant.assignment.depositAmount || "",
        isActive: tenant.assignment.isActive,
      });
    }
  }, [open, tenant, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return apiRequest(`/api/tenant-assignments/${tenant.assignment.id}`, "PUT", {
        leaseStartDate: data.leaseStartDate || null,
        leaseEndDate: data.leaseEndDate || null,
        monthlyRent: data.monthlyRent || null,
        depositAmount: data.depositAmount || null,
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "tenants"] });
      toast({
        title: "Assignment updated",
        description: "The tenant assignment has been successfully updated",
      });
      setOpen(false);
      onSuccess?.();
    },
    onError: () => {
      toast({
        title: "Failed to update assignment",
        description: "An error occurred while updating the tenant assignment",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    updateMutation.mutate(data);
  };

  const fullName = [tenant.firstName, tenant.lastName].filter(Boolean).join(" ") || tenant.email;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Tenant Assignment</DialogTitle>
          <DialogDescription>Update lease details for {fullName}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="leaseStartDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lease Start Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-lease-start"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="leaseEndDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lease End Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-lease-end"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="monthlyRent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monthly Rent</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        data-testid="input-monthly-rent"
                      />
                    </FormControl>
                    <FormDescription>In dollars</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="depositAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deposit Amount</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        data-testid="input-deposit"
                      />
                    </FormControl>
                    <FormDescription>In dollars</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active Status</FormLabel>
                    <FormDescription>
                      Mark this tenant assignment as active or inactive
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-is-active"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-submit"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Assignment"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
