import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { User as UserIcon, Loader2, Upload, Lock, Eye, EyeOff } from "lucide-react";
import { updateSelfProfileSchema, type User } from "@shared/schema";
import { changePasswordFormSchema, type ChangePasswordFormValues, MIN_PASSWORD_LENGTH } from "@shared/passwordPolicy";
import { z } from "zod";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useAuth } from "@/hooks/useAuth";

type ProfileFormValues = z.infer<typeof updateSelfProfileSchema>;

export default function TenantProfile() {
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Fetch current user profile
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/profile"],
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(updateSelfProfileSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      phone: user?.phone || "",
      profileImageUrl: user?.profileImageUrl || "",
      skills: [],
      qualifications: [],
    },
    values: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      phone: user?.phone || "",
      profileImageUrl: user?.profileImageUrl || "",
      skills: [],
      qualifications: [],
    },
  });

  const passwordForm = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Update profile mutation
  const updateMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      return await apiRequest("PATCH", "/api/auth/profile", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update profile",
      });
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      return await apiRequest("PATCH", "/api/auth/change-password", data);
    },
    onSuccess: () => {
      passwordForm.reset();
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Unable to change password",
        description: error.message || "Failed to change password",
      });
    },
  });

  const onSubmit = (data: ProfileFormValues) => {
    updateMutation.mutate(data);
  };

  const onPasswordSubmit = (data: ChangePasswordFormValues) => {
    if (changePasswordMutation.isPending) return;
    changePasswordMutation.mutate({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    });
  };

  const getUploadParameters = async () => {
    try {
      const response = await fetch("/api/upload/generate-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to get upload URL: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.uploadUrl) {
        throw new Error("Invalid upload URL response");
      }

      // Ensure URL is absolute
      let uploadURL = data.uploadUrl;
      if (uploadURL.startsWith('/')) {
        uploadURL = `${window.location.origin}${uploadURL}`;
      }

      // Validate URL
      try {
        new URL(uploadURL);
      } catch (e) {
        throw new Error(`Invalid upload URL format: ${uploadURL}`);
      }

      return {
        method: "PUT" as const,
        url: uploadURL,
      };
    } catch (error: any) {
      console.error("[TenantProfile] Upload URL error:", error);
      throw new Error(`Failed to get upload URL: ${error.message}`);
    }
  };

  const handleProfilePhotoUpload = (result: any) => {
    if (result.successful && result.successful.length > 0) {
      const uploadedFile = result.successful[0];
      const fileUrl = uploadedFile.uploadURL || uploadedFile.meta?.extractedFileUrl;
      if (fileUrl) {
        form.setValue("profileImageUrl", fileUrl);
        toast({
          title: "Photo uploaded",
          description: "Click 'Save Changes' to update your profile",
        });
      }
    }
  };

  const getUserInitials = () => {
    const first = user?.firstName?.[0] || "";
    const last = user?.lastName?.[0] || "";
    return (first + last).toUpperCase() || user?.username?.[0]?.toUpperCase() || "U";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <UserIcon className="w-8 h-8" />
          Profile
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage your personal information and settings
        </p>
      </div>

      <Card data-testid="card-profile-form">
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>
            Update your profile details below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="flex items-start gap-6">
                <div className="flex flex-col items-center gap-3">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={form.watch("profileImageUrl") || user?.profileImageUrl || ""} alt="Profile" />
                    <AvatarFallback className="text-2xl">{getUserInitials()}</AvatarFallback>
                  </Avatar>
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={5242880}
                    onGetUploadParameters={getUploadParameters}
                    onComplete={handleProfilePhotoUpload}
                    buttonVariant="outline"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Photo
                  </ObjectUploader>
                </div>

                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter your first name"
                              data-testid="input-firstName"
                              {...field}
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
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter your last name"
                              data-testid="input-lastName"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter your phone number"
                            data-testid="input-phone"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  data-testid="button-save-profile"
                >
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="mt-6" data-testid="card-account-info">
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>
            Your email cannot be changed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Email</Label>
            <p className="text-base" data-testid="text-email">{user?.email}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6" data-testid="card-change-password">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Change Password
          </CardTitle>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type={showCurrentPassword ? "text" : "password"}
                          placeholder="Enter your current password"
                          autoComplete="current-password"
                          className="pr-10"
                          data-testid="input-current-password"
                          {...field}
                        />
                      </FormControl>
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowCurrentPassword((v) => !v)}
                        aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                        data-testid="button-toggle-current-password"
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type={showNewPassword ? "text" : "password"}
                          placeholder="Enter your new password"
                          autoComplete="new-password"
                          className="pr-10"
                          data-testid="input-new-password"
                          {...field}
                        />
                      </FormControl>
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowNewPassword((v) => !v)}
                        aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                        data-testid="button-toggle-new-password"
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <FormDescription>
                      Must be at least {MIN_PASSWORD_LENGTH} characters
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={passwordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="Confirm your new password"
                          autoComplete="new-password"
                          className="pr-10"
                          data-testid="input-confirm-password"
                          {...field}
                        />
                      </FormControl>
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        data-testid="button-toggle-confirm-password"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={changePasswordMutation.isPending}
                  data-testid="button-change-password"
                >
                  {changePasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Change Password
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

