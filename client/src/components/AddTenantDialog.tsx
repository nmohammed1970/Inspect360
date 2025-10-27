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
import { Loader2, UserPlus, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface User {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  role: string;
}

const selectTenantFormSchema = z.object({
  tenantId: z.string().min(1, "Please select a tenant"),
  leaseStartDate: z.string().optional(),
  leaseEndDate: z.string().optional(),
  monthlyRent: z.string().optional(),
  depositAmount: z.string().optional(),
  isActive: z.boolean().default(true),
});

const createTenantFormSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required").max(255),
  lastName: z.string().min(1, "Last name is required").max(255),
  username: z.string().min(3, "Username must be at least 3 characters").max(100),
  password: z.string().min(6, "Password must be at least 6 characters"),
  leaseStartDate: z.string().optional(),
  leaseEndDate: z.string().optional(),
  monthlyRent: z.string().optional(),
  depositAmount: z.string().optional(),
  isActive: z.boolean().default(true),
});

type SelectTenantFormData = z.infer<typeof selectTenantFormSchema>;
type CreateTenantFormData = z.infer<typeof createTenantFormSchema>;

interface AddTenantDialogProps {
  propertyId: string;
  children: React.ReactNode;
  onSuccess?: () => void;
}

export default function AddTenantDialog({ propertyId, children, onSuccess }: AddTenantDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"select" | "create">("select");
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

  const selectForm = useForm<SelectTenantFormData>({
    resolver: zodResolver(selectTenantFormSchema),
    defaultValues: {
      tenantId: "",
      leaseStartDate: "",
      leaseEndDate: "",
      monthlyRent: "",
      depositAmount: "",
      isActive: true,
    },
  });

  const createForm = useForm<CreateTenantFormData>({
    resolver: zodResolver(createTenantFormSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      username: "",
      password: "",
      leaseStartDate: "",
      leaseEndDate: "",
      monthlyRent: "",
      depositAmount: "",
      isActive: true,
    },
  });

  const createUserMutation = useMutation<User, Error, CreateTenantFormData>({
    mutationFn: async (data: CreateTenantFormData) => {
      // Create the user first via team member API
      const userPayload = {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        username: data.username,
        password: data.password,
        role: "tenant" as const,
      };
      const res = await apiRequest("POST", "/api/team", userPayload);
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to create tenant user" }));
        throw new Error(error.message || "Failed to create tenant user");
      }
      
      return await res.json() as User;
    },
  });

  const assignTenantMutation = useMutation({
    mutationFn: async (data: { tenantId: string; leaseData: any }) => {
      // Build payload - convert string numbers to actual numbers for schema validation
      const payload = {
        propertyId,
        tenantId: data.tenantId,
        leaseStartDate: data.leaseData.leaseStartDate || undefined,
        leaseEndDate: data.leaseData.leaseEndDate || undefined,
        monthlyRent: data.leaseData.monthlyRent ? parseFloat(data.leaseData.monthlyRent) : undefined,
        depositAmount: data.leaseData.depositAmount ? parseFloat(data.leaseData.depositAmount) : undefined,
        isActive: data.leaseData.isActive,
      };
      return apiRequest("POST", "/api/tenant-assignments", payload);
    },
    onSuccess: async () => {
      // Force active refetch to update the UI immediately
      await queryClient.invalidateQueries({ 
        queryKey: ["/api/properties", propertyId, "tenants"],
        refetchType: "active"
      });
      await queryClient.invalidateQueries({ 
        queryKey: ["/api/users/role/tenant"],
        refetchType: "active"
      });
      toast({
        title: "Tenant assigned",
        description: "The tenant has been successfully assigned to this property",
      });
      selectForm.reset();
      createForm.reset();
      setOpen(false);
      setMode("select");
      onSuccess?.();
    },
    onError: async (error: any) => {
      // Try to get detailed error message from response
      let errorMessage = "An error occurred while assigning the tenant";
      try {
        if (error.response) {
          const errorData = await error.response.json().catch(() => null);
          if (errorData?.details) {
            errorMessage = JSON.stringify(errorData.details);
          } else if (errorData?.error) {
            errorMessage = errorData.error;
          }
        }
      } catch (e) {
        // Use default error message
      }
      
      console.error("Tenant assignment error:", error, errorMessage);
      toast({
        title: "Failed to assign tenant",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const onSelectSubmit = async (data: SelectTenantFormData) => {
    assignTenantMutation.mutate({
      tenantId: data.tenantId,
      leaseData: data,
    });
  };

  const onCreateSubmit = async (data: CreateTenantFormData) => {
    try {
      // First create the user
      const newUser = await createUserMutation.mutateAsync(data);
      
      if (!newUser || !newUser.id) {
        throw new Error("User creation failed - no user ID returned");
      }
      
      console.log("User created successfully:", newUser.id);
      
      // Extract only lease-related fields for the assignment
      const leaseData = {
        leaseStartDate: data.leaseStartDate,
        leaseEndDate: data.leaseEndDate,
        monthlyRent: data.monthlyRent,
        depositAmount: data.depositAmount,
        isActive: data.isActive,
      };
      
      console.log("Assigning tenant to property:", { tenantId: newUser.id, leaseData });
      
      // Then assign them to the property
      assignTenantMutation.mutate({
        tenantId: newUser.id,
        leaseData,
      });
    } catch (error: any) {
      console.error("Failed to create tenant user:", error);
      toast({
        title: "Failed to create tenant",
        description: error.message || "An error occurred while creating the tenant user",
        variant: "destructive",
      });
      // Return early to prevent assignment attempt
      return;
    }
  };

  const getTenantDisplayName = (user: User) => {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    return fullName || user.email;
  };

  const isSubmitting = createUserMutation.isPending || assignTenantMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Tenant Assignment</DialogTitle>
          <DialogDescription>
            {mode === "select" 
              ? "Assign an existing tenant to this property with lease details"
              : "Create a new tenant user and assign them to this property"
            }
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "select" | "create")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="select" data-testid="tab-select-tenant">
              <Users className="h-4 w-4 mr-2" />
              Select Existing
            </TabsTrigger>
            <TabsTrigger value="create" data-testid="tab-create-tenant">
              <UserPlus className="h-4 w-4 mr-2" />
              Create New
            </TabsTrigger>
          </TabsList>

          <TabsContent value="select" className="space-y-4 mt-4">
            <Form {...selectForm}>
              <form onSubmit={selectForm.handleSubmit(onSelectSubmit)} className="space-y-4">
                <FormField
                  control={selectForm.control}
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
                              No tenant users found. Create a new tenant using the "Create New" tab.
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
                    control={selectForm.control}
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
                    control={selectForm.control}
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
                    control={selectForm.control}
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
                    control={selectForm.control}
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
                  control={selectForm.control}
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
                    disabled={isSubmitting}
                    data-testid="button-submit"
                  >
                    {isSubmitting ? (
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
          </TabsContent>

          <TabsContent value="create" className="space-y-4 mt-4">
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                  <h4 className="text-sm font-medium">Tenant User Details</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={createForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="John"
                              {...field}
                              data-testid="input-first-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Doe"
                              {...field}
                              data-testid="input-last-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={createForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email *</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="john.doe@example.com"
                            {...field}
                            data-testid="input-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={createForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="johndoe"
                              {...field}
                              data-testid="input-username"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password *</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="••••••••"
                              {...field}
                              data-testid="input-password"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Lease Details</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={createForm.control}
                      name="leaseStartDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lease Start Date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              data-testid="input-create-lease-start"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="leaseEndDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lease End Date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              data-testid="input-create-lease-end"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={createForm.control}
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
                              data-testid="input-create-monthly-rent"
                            />
                          </FormControl>
                          <FormDescription>In dollars</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
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
                              data-testid="input-create-deposit"
                            />
                          </FormControl>
                          <FormDescription>In dollars</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={createForm.control}
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
                            data-testid="switch-create-is-active"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                    data-testid="button-create-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    data-testid="button-create-submit"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create & Assign Tenant"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
