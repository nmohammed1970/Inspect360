import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { updateTenantAssignmentSchema } from "@shared/schema";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Send, Upload, X, FileText, Download } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/contexts/LocaleContext";
import { PhoneInput } from "@/components/PhoneInput";

const formSchema = z.object({
  firstName: z.string().optional().refine((val) => !val || val.trim().length > 0, {
    message: "First name cannot be empty",
  }),
  lastName: z.string().optional().refine((val) => !val || val.trim().length > 0, {
    message: "Last name cannot be empty",
  }),
  email: z.string().optional().refine((val) => !val || z.string().email().safeParse(val).success, {
    message: "Invalid email address",
  }),
  leaseStartDate: z.string().optional(),
  leaseEndDate: z.string().optional(),
  monthlyRent: z.string().optional(),
  depositAmount: z.string().optional(),
  isActive: z.boolean(),
  hasPortalAccess: z.boolean(),
  nextOfKinName: z.string().optional(),
  nextOfKinPhone: z.string().optional(),
  nextOfKinEmail: z.string().optional(),
  nextOfKinRelationship: z.string().optional(),
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
    hasPortalAccess?: boolean;
    nextOfKinName?: string;
    nextOfKinPhone?: string;
    nextOfKinEmail?: string;
    nextOfKinRelationship?: string;
  };
}

interface Tag {
  id: string;
  name: string;
  color?: string;
}

interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType?: string;
  fileSize?: number;
  description?: string;
  createdAt: string;
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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const locale = useLocale();

  // Fetch organization tags
  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    enabled: open,
  });

  // Fetch tenant assignment tags
  const { data: assignmentTags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tenant-assignments", tenant.assignment.id, "tags"],
    enabled: open,
  });

  // Fetch attachments
  const { data: attachments = [] } = useQuery<Attachment[]>({
    queryKey: ["/api/tenant-assignments", tenant.assignment.id, "attachments"],
    enabled: open,
  });

  // Update selected tags when assignment tags load
  useEffect(() => {
    if (assignmentTags.length > 0) {
      setSelectedTags(assignmentTags.map((t) => t.id));
    }
  }, [assignmentTags]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      leaseStartDate: "",
      leaseEndDate: "",
      monthlyRent: "",
      depositAmount: "",
      isActive: true,
      hasPortalAccess: true,
      nextOfKinName: "",
      nextOfKinPhone: "",
      nextOfKinEmail: "",
      nextOfKinRelationship: "",
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
        firstName: tenant.firstName || "",
        lastName: tenant.lastName || "",
        email: tenant.email || "",
        leaseStartDate,
        leaseEndDate,
        monthlyRent: tenant.assignment.monthlyRent || "",
        depositAmount: tenant.assignment.depositAmount || "",
        isActive: tenant.assignment.isActive,
        hasPortalAccess: tenant.assignment.hasPortalAccess ?? true,
        nextOfKinName: tenant.assignment.nextOfKinName || "",
        nextOfKinPhone: tenant.assignment.nextOfKinPhone || "",
        nextOfKinEmail: tenant.assignment.nextOfKinEmail || "",
        nextOfKinRelationship: tenant.assignment.nextOfKinRelationship || "",
      });
    }
  }, [open, tenant.id, tenant.assignment.id]); // Only reset when dialog opens or tenant/assignment ID changes

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // First, update the user (firstName, lastName, email)
      const userUpdatePayload: any = {};
      
      // Always update firstName (send trimmed value or null if empty)
      userUpdatePayload.firstName = data.firstName?.trim() || null;
      
      // Always update lastName (send trimmed value or null if empty)
      userUpdatePayload.lastName = data.lastName?.trim() || null;
      
      // Always update email if provided (to handle case changes, etc.)
      if (data.email && data.email.trim() !== '') {
        userUpdatePayload.email = data.email.trim().toLowerCase();
      } else if (data.email === '') {
        // Allow clearing email by sending null
        userUpdatePayload.email = null;
      }

      // Update user if there are changes
      if (Object.keys(userUpdatePayload).length > 0) {
        try {
          await apiRequest("PUT", `/api/users/${tenant.id}`, userUpdatePayload);
        } catch (error: any) {
          // If email update fails due to uniqueness, show specific error
          if (error.message?.includes('email') || error.message?.includes('Email')) {
            throw new Error("Email is already in use by another user");
          }
          throw error;
        }
      }

      // Build assignment payload - send dates as ISO strings, let server handle transformation
      const payload: any = {
        isActive: data.isActive,
        hasPortalAccess: data.hasPortalAccess,
      };

      // Convert dates to ISO strings (will be converted to Date objects on server)
      if (data.leaseStartDate && data.leaseStartDate.trim() !== '') {
        const startDate = new Date(data.leaseStartDate);
        if (!isNaN(startDate.getTime())) {
          payload.leaseStartDate = startDate.toISOString();
        }
      }

      if (data.leaseEndDate && data.leaseEndDate.trim() !== '') {
        const endDate = new Date(data.leaseEndDate);
        if (!isNaN(endDate.getTime())) {
          payload.leaseEndDate = endDate.toISOString();
        }
      }

      // Send numeric fields as strings (Drizzle numeric fields expect strings)
      if (data.monthlyRent && data.monthlyRent.trim() !== '') {
        const rent = parseFloat(data.monthlyRent);
        if (!isNaN(rent) && rent >= 0) {
          payload.monthlyRent = rent.toString();
        }
      }

      if (data.depositAmount && data.depositAmount.trim() !== '') {
        const deposit = parseFloat(data.depositAmount);
        if (!isNaN(deposit) && deposit >= 0) {
          payload.depositAmount = deposit.toString();
        }
      }

      // Add optional next of kin fields (allow clearing by sending null/empty)
      payload.nextOfKinName = data.nextOfKinName?.trim() || null;
      payload.nextOfKinPhone = data.nextOfKinPhone?.trim() || null;
      payload.nextOfKinEmail = data.nextOfKinEmail?.trim() || null;
      payload.nextOfKinRelationship = data.nextOfKinRelationship?.trim() || null;

      console.log('[EditTenantDialog] Updating assignment with payload:', payload);
      return apiRequest("PUT", `/api/tenant-assignments/${tenant.assignment.id}`, payload);
    },
    onSuccess: async (_, variables) => {
      // Invalidate all relevant queries to ensure UI updates
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/tenant-assignments", tenant.assignment.id] }),
        queryClient.invalidateQueries({ queryKey: ["/api/users", tenant.id] }),
        queryClient.invalidateQueries({ queryKey: ["/api/users"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId] }),
      ]);
      
      // Refetch the updated user and assignment data to get the latest values
      try {
        const [updatedUserResponse, updatedAssignmentResponse] = await Promise.all([
          apiRequest("GET", `/api/users/${tenant.id}`, {}),
          apiRequest("GET", `/api/tenant-assignments/${tenant.assignment.id}`, {}),
        ]);
        
        const updatedUser = await updatedUserResponse.json();
        const updatedAssignment = await updatedAssignmentResponse.json();
        
        // Update the form with the newly fetched data to reflect the actual saved values
        const leaseStartDate = updatedAssignment.leaseStartDate
          ? new Date(updatedAssignment.leaseStartDate).toISOString().split("T")[0]
          : "";
        const leaseEndDate = updatedAssignment.leaseEndDate
          ? new Date(updatedAssignment.leaseEndDate).toISOString().split("T")[0]
          : "";
        
        form.reset({
          firstName: updatedUser.firstName || "",
          lastName: updatedUser.lastName || "",
          email: updatedUser.email || "",
          leaseStartDate,
          leaseEndDate,
          monthlyRent: updatedAssignment.monthlyRent || "",
          depositAmount: updatedAssignment.depositAmount || "",
          isActive: updatedAssignment.isActive,
          hasPortalAccess: updatedAssignment.hasPortalAccess ?? true,
          nextOfKinName: updatedAssignment.nextOfKinName || "",
          nextOfKinPhone: updatedAssignment.nextOfKinPhone || "",
          nextOfKinEmail: updatedAssignment.nextOfKinEmail || "",
          nextOfKinRelationship: updatedAssignment.nextOfKinRelationship || "",
        });
      } catch (error) {
        console.error("[EditTenantDialog] Error refetching updated data:", error);
        // If refetch fails, at least update the form with the values we just submitted
        // This ensures the form shows what was sent, even if refetch fails
        const leaseStartDate = variables.leaseStartDate || "";
        const leaseEndDate = variables.leaseEndDate || "";
        form.reset({
          firstName: variables.firstName || "",
          lastName: variables.lastName || "",
          email: variables.email || "",
          leaseStartDate,
          leaseEndDate,
          monthlyRent: variables.monthlyRent || "",
          depositAmount: variables.depositAmount || "",
          isActive: variables.isActive,
          hasPortalAccess: variables.hasPortalAccess,
          nextOfKinName: variables.nextOfKinName || "",
          nextOfKinPhone: variables.nextOfKinPhone || "",
          nextOfKinEmail: variables.nextOfKinEmail || "",
          nextOfKinRelationship: variables.nextOfKinRelationship || "",
        });
      }
      
      toast({
        title: "Assignment updated",
        description: "The tenant assignment has been successfully updated",
      });
      onSuccess?.();
    },
    onError: (error: any) => {
      console.error("[EditTenantDialog] Update error:", error);
      let errorMessage = "An error occurred while updating the tenant assignment";
      
      // Extract error message from the error object
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      toast({
        title: "Failed to update assignment",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const sendPasswordMutation = useMutation({
    mutationFn: async () => {
      // Don't send password in request body - let server retrieve the stored original password
      // The server will look for the stored original password in assignment notes
      const response = await apiRequest("POST", `/api/tenant-assignments/${tenant.assignment.id}/send-password`, {});
      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      if (data?.emailSent === false) {
        toast({
          title: "Password updated but email failed",
          description: data.error || "Password was updated but email could not be sent. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Password sent",
          description: `Portal credentials have been sent to ${tenant.email}`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send password",
        description: error?.message || "An error occurred while sending the password",
        variant: "destructive",
      });
    },
  });

  const updateTagsMutation = useMutation({
    mutationFn: async (tagIds: string[]) => {
      return apiRequest("PUT", `/api/tenant-assignments/${tenant.assignment.id}/tags`, { tagIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-assignments", tenant.assignment.id, "tags"] });
      toast({
        title: "Tags updated",
        description: "Tenant tags have been successfully updated",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update tags",
        description: "An error occurred while updating tags",
        variant: "destructive",
      });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      const response = await apiRequest("DELETE", `/api/tenancy-attachments/${attachmentId}`, {});
      // 204 No Content doesn't have a body, so we just return the response
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-assignments", tenant.assignment.id, "attachments"] });
      toast({
        title: "Attachment deleted",
        description: "The attachment has been removed",
      });
    },
    onError: (error: any) => {
      console.error("Delete attachment error:", error);
      toast({
        title: "Failed to delete attachment",
        description: error?.message || "An error occurred while deleting the attachment",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    updateMutation.mutate(data);
  };

  const handleToggleTag = (tagId: string) => {
    const newTags = selectedTags.includes(tagId)
      ? selectedTags.filter((id) => id !== tagId)
      : [...selectedTags, tagId];
    setSelectedTags(newTags);
    updateTagsMutation.mutate(newTags);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("tenantAssignmentId", tenant.assignment.id);

    try {
      const response = await fetch("/api/tenancy-attachments", {
        method: "POST",
        body: formData,
        credentials: "include", // Include cookies for authentication
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || errorData.message || "Upload failed");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/tenant-assignments", tenant.assignment.id, "attachments"] });
      toast({
        title: "File uploaded",
        description: `${file.name} has been uploaded successfully`,
      });
    } catch (error: any) {
      console.error("[EditTenantDialog] File upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "An error occurred while uploading the file",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      e.target.value = ""; // Reset input
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unknown size";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    const kb = bytes / 1024;
    return `${kb.toFixed(2)} KB`;
  };

  const fullName = [tenant.firstName, tenant.lastName].filter(Boolean).join(" ") || tenant.email;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Tenant Assignment</DialogTitle>
          <DialogDescription>Update lease details for {fullName}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Tenant Information Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Tenant Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="First name"
                          data-testid="input-tenant-first-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Last name"
                          data-testid="input-tenant-last-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        {...field}
                        placeholder="email@example.com"
                        data-testid="input-tenant-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Lease Details Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Lease Details</h3>
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
                      <FormDescription>In {locale.currency}</FormDescription>
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
                      <FormDescription>In {locale.currency}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Next of Kin Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Next of Kin Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nextOfKinName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="John Doe"
                          {...field}
                          data-testid="input-next-of-kin-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nextOfKinRelationship"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-next-of-kin-relationship">
                            <SelectValue placeholder="Select relationship" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Parent">Parent</SelectItem>
                          <SelectItem value="Sibling">Sibling</SelectItem>
                          <SelectItem value="Spouse">Spouse</SelectItem>
                          <SelectItem value="Partner">Partner</SelectItem>
                          <SelectItem value="Child">Child</SelectItem>
                          <SelectItem value="Friend">Friend</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nextOfKinPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <PhoneInput
                          field={field}
                          placeholder="Enter phone number"
                          data-testid="input-next-of-kin-phone"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nextOfKinEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="email@example.com"
                          {...field}
                          data-testid="input-next-of-kin-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Portal Access & Status Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Access & Status</h3>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="hasPortalAccess"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Tenant Portal Access</FormLabel>
                        <FormDescription>
                          Allow tenant to access the portal
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-portal-access"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {form.watch("hasPortalAccess") && (
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">Send Portal Credentials</p>
                        <p className="text-sm text-muted-foreground">
                          Email login credentials to {tenant.email}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => sendPasswordMutation.mutate()}
                        disabled={sendPasswordMutation.isPending}
                        data-testid="button-send-password"
                      >
                        {sendPasswordMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Send Password
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

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
              </div>
            </div>

            <Separator />

            {/* Tags Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {tags.length > 0 ? (
                  tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={selectedTags.includes(tag.id) ? "default" : "outline"}
                      className="cursor-pointer hover-elevate"
                      onClick={() => handleToggleTag(tag.id)}
                      style={
                        selectedTags.includes(tag.id) && tag.color
                          ? { backgroundColor: tag.color, borderColor: tag.color }
                          : {}
                      }
                      data-testid={`badge-tag-${tag.id}`}
                    >
                      {tag.name}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No tags available</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Attachments Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Tenancy Attachments</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById("file-upload")?.click()}
                  disabled={uploading}
                  data-testid="button-upload-attachment"
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Upload File
                </Button>
                <input
                  id="file-upload"
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                />
              </div>

              <div className="space-y-2">
                {attachments.length > 0 ? (
                  attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{attachment.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(attachment.fileSize)} · {new Date(attachment.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          asChild
                          data-testid={`button-download-${attachment.id}`}
                        >
                          <a href={attachment.fileUrl} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteAttachmentMutation.mutate(attachment.id)}
                          disabled={deleteAttachmentMutation.isPending}
                          data-testid={`button-delete-${attachment.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No attachments uploaded yet
                  </p>
                )}
              </div>
            </div>

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
