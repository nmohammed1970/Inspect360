import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

interface User {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  role: string;
}

const formSchema = z.object({
  tenantId: z.string().min(1, "Please select a tenant"),
  leaseStartDate: z.string().optional(),
  leaseEndDate: z.string().optional(),
  monthlyRent: z.string().optional(),
  depositAmount: z.string().optional(),
  isActive: z.boolean().default(true),
});

type FormData = z.infer<typeof formSchema>;

interface AddTenantDialogProps {
  propertyId: string;
  children: React.ReactNode;
  onSuccess?: () => void;
}

export default function AddTenantDialog({ propertyId, children, onSuccess }: AddTenantDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data: tenantUsers = [], isLoading: loadingTenants } = useQuery<User[]>({
    queryKey: ["/api/users/role/tenant"],
    queryFn: async () => {
      const res = await fetch("/api/users/role/tenant", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tenant users");
      return res.json();
    },
    enabled: open,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tenantId: "",
      leaseStartDate: "",
      leaseEndDate: "",
      monthlyRent: "",
      depositAmount: "",
      isActive: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return apiRequest("/api/tenant-assignments", "POST", {
        propertyId,
        tenantId: data.tenantId,
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
        title: "Tenant assigned",
        description: "The tenant has been successfully assigned to this property",
      });
      form.reset();
      setOpen(false);
      onSuccess?.();
    },
    onError: () => {
      toast({
        title: "Failed to assign tenant",
        description: "An error occurred while assigning the tenant",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    createMutation.mutate(data);
  };

  const getTenantDisplayName = (user: User) => {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    return fullName || user.email;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Tenant Assignment</DialogTitle>
          <DialogDescription>
            Assign a tenant to this property with lease details
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="tenantId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tenant *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={loadingTenants}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-tenant">
                        <SelectValue placeholder="Select a tenant" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {loadingTenants ? (
                        <div className="flex items-center justify-center p-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      ) : tenantUsers.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          No tenant users found
                        </div>
                      ) : (
                        tenantUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {getTenantDisplayName(user)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                disabled={createMutation.isPending}
                data-testid="button-submit"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  "Assign Tenant"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
