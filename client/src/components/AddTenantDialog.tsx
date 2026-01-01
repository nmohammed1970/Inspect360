import { useState, useEffect } from "react";
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
import { Loader2, UserPlus, Users, Eye, EyeOff } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocale } from "@/contexts/LocaleContext";
import { useModules } from "@/hooks/use-modules";

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
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const locale = useLocale();

  // Module Restriction Check
  const { isModuleEnabled, isLoading: isLoadingModules } = useModules();
  const isTenantPortalEnabled = isModuleEnabled("tenant_portal");

  // If module is disabled, we will show a locked state in the render or intercept
  // Note: We can't return early here easily because hooks must run.
  // We will handle the "locked" UI inside the DialogContent.

  const { data: tenantUsers = [], isLoading: loadingTenants } = useQuery<User[]>({
    queryKey: ["/api/users/role/tenant"],
    queryFn: async () => {
      const res = await fetch("/api/users/role/tenant", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tenant users");
      return res.json();
    },
    enabled: open && isTenantPortalEnabled, // Only fetch if open AND enabled
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

  // Watch lease start dates in both forms
  const selectStartDate = selectForm.watch("leaseStartDate");
  const createStartDate = createForm.watch("leaseStartDate");

  // Auto-populate end date when start date changes (for select form)
  useEffect(() => {
    if (selectStartDate && selectStartDate.trim() !== "") {
      const startDate = new Date(selectStartDate);
      if (!isNaN(startDate.getTime())) {
        // Add 12 months to the start date
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 12);

        // Format as YYYY-MM-DD for date input
        const formattedEndDate = endDate.toISOString().split('T')[0];

        // Only set if the end date is currently empty or hasn't been manually changed
        const currentEndDate = selectForm.getValues("leaseEndDate");
        if (!currentEndDate || currentEndDate.trim() === "") {
          selectForm.setValue("leaseEndDate", formattedEndDate);
        }
      }
    }
  }, [selectStartDate, selectForm]);

  // Auto-populate end date when start date changes (for create form)
  useEffect(() => {
    if (createStartDate && createStartDate.trim() !== "") {
      const startDate = new Date(createStartDate);
      if (!isNaN(startDate.getTime())) {
        // Add 12 months to the start date
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 12);

        // Format as YYYY-MM-DD for date input
        const formattedEndDate = endDate.toISOString().split('T')[0];

        // Only set if the end date is currently empty or hasn't been manually changed
        const currentEndDate = createForm.getValues("leaseEndDate");
        if (!currentEndDate || currentEndDate.trim() === "") {
          createForm.setValue("leaseEndDate", formattedEndDate);
        }
      }
    }
  }, [createStartDate, createForm]);

  const createUserMutation = useMutation<User, Error, CreateTenantFormData>({
    mutationFn: async (data: CreateTenantFormData) => {
      // Create the user first via team member API
      // Format data according to createTeamMemberSchema requirements
      // Build payload, only including defined fields
      const userPayload: any = {
        email: data.email.trim(),
        username: data.username.trim(),
        password: data.password.trim(),
        role: "tenant" as const,
      };

      // Only include optional fields if they have values (not undefined or empty)
      if (data.firstName?.trim()) {
        userPayload.firstName = data.firstName.trim();
      }
      if (data.lastName?.trim()) {
        userPayload.lastName = data.lastName.trim();
      }

      // Don't include undefined fields - Zod will handle optional fields

      console.log('[AddTenantDialog] Creating tenant user with payload:', { ...userPayload, password: '***' });
      const res = await apiRequest("POST", "/api/team", userPayload);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Failed to create tenant user" }));

        // Handle specific error cases
        if (res.status === 401) {
          throw new Error("Your session has expired. Please refresh the page and log in again.");
        } else if (res.status === 403) {
          throw new Error("Only organization owners can create tenant users. Please contact your administrator.");
        } else if (res.status === 400) {
          // Extract validation errors
          const errorMessage = errorData.message || errorData.errors?.[0]?.message || "Invalid request data";
          throw new Error(errorMessage);
        } else if (errorData.message === "Email or username already exists") {
          throw new Error("A user with this email or username already exists in your organization.");
        } else {
          throw new Error(errorData.message || "Failed to create tenant user");
        }
      }

      return await res.json() as User;
    },
  });

  const assignTenantMutation = useMutation({
    mutationFn: async (data: { tenantId: string; leaseData: any; originalPassword?: string; assignmentId?: string }) => {
      // Build payload - convert dates to ISO strings and numbers for schema validation
      const payload: any = {
        propertyId,
        tenantId: data.tenantId,
        isActive: data.leaseData.isActive ?? true,
        hasPortalAccess: true, // Required field with default value
      };

      // Convert dates - handle DD/MM/YYYY format and other formats
      // Send as ISO strings (will be converted to Date objects on server)
      if (data.leaseData.leaseStartDate && data.leaseData.leaseStartDate.trim() !== '') {
        let startDate: Date;
        const dateStr = data.leaseData.leaseStartDate.trim();

        // Handle DD/MM/YYYY format (common in UK)
        if (dateStr.includes('/')) {
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            // DD/MM/YYYY format
            startDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          } else {
            startDate = new Date(dateStr);
          }
        } else {
          startDate = typeof data.leaseData.leaseStartDate === 'string'
            ? new Date(data.leaseData.leaseStartDate)
            : data.leaseData.leaseStartDate;
        }

        if (!isNaN(startDate.getTime())) {
          // Send as ISO string (server will convert to Date object)
          payload.leaseStartDate = startDate.toISOString();
        }
      }

      if (data.leaseData.leaseEndDate && data.leaseData.leaseEndDate.trim() !== '') {
        let endDate: Date;
        const dateStr = data.leaseData.leaseEndDate.trim();

        // Handle DD/MM/YYYY format (common in UK)
        if (dateStr.includes('/')) {
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            // DD/MM/YYYY format
            endDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          } else {
            endDate = new Date(dateStr);
          }
        } else {
          endDate = typeof data.leaseData.leaseEndDate === 'string'
            ? new Date(data.leaseData.leaseEndDate)
            : data.leaseData.leaseEndDate;
        }

        if (!isNaN(endDate.getTime())) {
          // Send as ISO string (server will convert to Date object)
          payload.leaseEndDate = endDate.toISOString();
        }
      }

      // Convert monthlyRent to string (Drizzle numeric fields expect strings)
      if (data.leaseData.monthlyRent !== undefined && data.leaseData.monthlyRent !== null && data.leaseData.monthlyRent !== '') {
        const rentStr = String(data.leaseData.monthlyRent).trim();
        if (rentStr !== '' && rentStr !== '0.00') {
          const rent = parseFloat(rentStr);
          if (!isNaN(rent) && rent >= 0) {
            // Drizzle numeric fields expect strings
            payload.monthlyRent = rent.toString();
          }
        }
      }

      // Convert depositAmount to string (Drizzle numeric fields expect strings)
      if (data.leaseData.depositAmount !== undefined && data.leaseData.depositAmount !== null && data.leaseData.depositAmount !== '') {
        const depositStr = String(data.leaseData.depositAmount).trim();
        if (depositStr !== '' && depositStr !== '0.00') {
          const deposit = parseFloat(depositStr);
          if (!isNaN(deposit) && deposit >= 0) {
            // Drizzle numeric fields expect strings
            payload.depositAmount = deposit.toString();
          }
        }
      }

      console.log('[AddTenantDialog] Assigning tenant with payload:', payload);

      // Include original password in the request so it can be stored for later retrieval
      const assignmentPayload = {
        ...payload,
        originalPassword: data.originalPassword,
      };

      const res = await apiRequest("POST", "/api/tenant-assignments", assignmentPayload);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        // Extract the most helpful error message
        const errorMessage = errorData.message
          || errorData.details?.[0]?.message
          || errorData.details?.[0]?.path?.join('.') + ': ' + errorData.details?.[0]?.message
          || errorData.error
          || "Failed to assign tenant";
        console.error('[AddTenantDialog] Assignment error details:', errorData);
        throw new Error(errorMessage);
      }

      const assignment = await res.json();

      // If this is a new tenant creation and we have the original password, send it via email
      if (data.originalPassword && assignment?.id) {
        try {
          const sendPasswordRes = await apiRequest("POST", `/api/tenant-assignments/${assignment.id}/send-password`, {
            password: data.originalPassword
          });

          if (!sendPasswordRes.ok) {
            console.warn('[AddTenantDialog] Failed to send password email, but tenant was created successfully');
          }
        } catch (emailError) {
          console.warn('[AddTenantDialog] Error sending password email:', emailError);
          // Don't fail the entire operation if email fails
        }
      }

      return assignment;
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
        description: "The tenant has been successfully assigned to this property. Login credentials have been sent to their email.",
      });
      selectForm.reset();
      createForm.reset();
      setOpen(false);
      setMode("select");
      onSuccess?.();
    },
    onError: (error: any) => {
      // Extract error message from the thrown error
      const errorMessage = error?.message || "An error occurred while assigning the tenant";

      console.error("[AddTenantDialog] Tenant assignment error:", error);
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

      // Then assign them to the property, passing the original password so it can be sent via email
      assignTenantMutation.mutate({
        tenantId: newUser.id,
        leaseData,
        originalPassword: data.password, // Pass the original password to send via email
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
        {!isTenantPortalEnabled && !isLoadingModules ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <DialogTitle>Tenant Portal Required</DialogTitle>
              <DialogDescription>
                Managing tenants requires the <strong>Tenant Portal</strong> module.
                <br />
                Please enable this feature from the marketplace to continue.
              </DialogDescription>
            </div>
            <Button variant="default" onClick={() => window.location.href = "/marketplace"}>
              Go to Marketplace
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add Tenant Assignment</DialogTitle>
              <DialogDescription>
                {mode === "select"
                  ? "Assign an existing tenant to this property with lease details"
                  : "Create a new tenant user and assign them to this property"
                }
              </DialogDescription>
            </DialogHeader>
            {isTenantPortalEnabled && (
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
                              <FormDescription>In {locale.currency}</FormDescription>
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
                              <FormDescription>In {locale.currency}</FormDescription>
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
                                  onChange={(e) => {
                                    const newEmail = e.target.value;
                                    field.onChange(e);
                                    // Auto-populate username from email if username is empty or matches previous email
                                    const currentUsername = createForm.getValues("username");
                                    if (!currentUsername || currentUsername === field.value?.split('@')[0] || currentUsername === field.value) {
                                      // Extract username from email (part before @)
                                      const emailUsername = newEmail.split('@')[0];
                                      if (emailUsername) {
                                        createForm.setValue("username", emailUsername);
                                      }
                                    }
                                  }}
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
                                  <div className="relative">
                                    <Input
                                      type={showPassword ? "text" : "password"}
                                      placeholder="••••••••"
                                      {...field}
                                      data-testid="input-password"
                                      className="pr-10"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setShowPassword(!showPassword)}
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                      data-testid="button-toggle-password"
                                    >
                                      {showPassword ? (
                                        <EyeOff className="h-4 w-4" />
                                      ) : (
                                        <Eye className="h-4 w-4" />
                                      )}
                                    </button>
                                  </div>
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
                                <FormDescription>In {locale.currency}</FormDescription>
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
                                <FormDescription>In {locale.currency}</FormDescription>
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
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
