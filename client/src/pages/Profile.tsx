import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { User as UserIcon, Loader2, Plus, X, Upload, FileText, Trash2, Lock, Eye, EyeOff } from "lucide-react";
import { updateSelfProfileSchema, type User, type UserDocument } from "@shared/schema";
import { changePasswordFormSchema, type ChangePasswordFormValues, MIN_PASSWORD_LENGTH } from "@shared/passwordPolicy";
import { z } from "zod";
import { PhoneInput } from "@/components/PhoneInput";
import { ObjectUploader } from "@/components/ObjectUploader";
import { LocaleDateInput } from "@/components/LocaleDateInput";
import { format } from "date-fns";
import { getTeamRoleDisplayLabel } from "@shared/roleLabels";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useImagePreview } from "@/components/ImagePreview";

type ProfileFormValues = z.infer<typeof updateSelfProfileSchema>;

export default function Profile() {
  const { toast } = useToast();
  const { openPreview } = useImagePreview();
  const [skills, setSkills] = useState<string[]>([]);
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [newQualification, setNewQualification] = useState("");
  const [newDocName, setNewDocName] = useState("");
  const [newDocType, setNewDocType] = useState("other");
  const [newDocExpiry, setNewDocExpiry] = useState<string | null>(null);
  const [showDocForm, setShowDocForm] = useState(false);
  const [pendingDocFileUrl, setPendingDocFileUrl] = useState<string | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<UserDocument | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Fetch current user profile
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/profile"],
  });

  // Fetch user documents
  const { data: documents = [], isLoading: documentsLoading } = useQuery<UserDocument[]>({
    queryKey: ["/api/user-documents"],
  });

  // Initialize skills and qualifications from user data
  useEffect(() => {
    if (user) {
      setSkills(user.skills || []);
      setQualifications(user.qualifications || []);
    }
  }, [user]);

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

  // Create document mutation
  const createDocumentMutation = useMutation({
    mutationFn: async (data: { documentName: string; documentType: string; fileUrl: string; expiryDate?: string }) => {
      return await apiRequest("POST", "/api/user-documents", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-documents"] });
      setNewDocName("");
      setNewDocType("other");
      setNewDocExpiry(null);
      setShowDocForm(false);
      setPendingDocFileUrl(null);
      toast({
        title: "Success",
        description: "Document uploaded successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to upload document",
      });
    },
  });

  // Delete document mutation
  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/user-documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-documents"] });
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
      setDocumentToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete document",
      });
    },
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(updateSelfProfileSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      phone: user?.phone || "",
      profileImageUrl: user?.profileImageUrl || "",
      skills: user?.skills || [],
      qualifications: user?.qualifications || [],
    },
    values: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      phone: user?.phone || "",
      profileImageUrl: user?.profileImageUrl || "",
      skills: user?.skills || [],
      qualifications: user?.qualifications || [],
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

  const handleAddSkill = () => {
    if (newSkill.trim() && !skills.includes(newSkill.trim())) {
      const updated = [...skills, newSkill.trim()];
      setSkills(updated);
      form.setValue("skills", updated);
      setNewSkill("");
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    const updated = skills.filter(s => s !== skillToRemove);
    setSkills(updated);
    form.setValue("skills", updated);
  };

  const handleAddQualification = () => {
    if (newQualification.trim() && !qualifications.includes(newQualification.trim())) {
      const updated = [...qualifications, newQualification.trim()];
      setQualifications(updated);
      form.setValue("qualifications", updated);
      setNewQualification("");
    }
  };

  const handleRemoveQualification = (qualToRemove: string) => {
    const updated = qualifications.filter(q => q !== qualToRemove);
    setQualifications(updated);
    form.setValue("qualifications", updated);
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
        // Convert relative URL to absolute
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
      console.error("[Profile] Upload URL error:", error);
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

  const handleDocumentUpload = (result: any) => {
    if (result.successful && result.successful.length > 0) {
      const uploadedFile = result.successful[0];
      const fileUrl = uploadedFile.uploadURL || uploadedFile.meta?.extractedFileUrl;
      if (fileUrl) {
        setPendingDocFileUrl(fileUrl);
        setShowDocForm(true);
      }
    }
  };

  const handleSaveDocument = () => {
    if (!pendingDocFileUrl || !newDocName.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please provide a document name",
      });
      return;
    }

    createDocumentMutation.mutate({
      documentName: newDocName.trim(),
      documentType: newDocType,
      fileUrl: pendingDocFileUrl,
      expiryDate: newDocExpiry ? new Date(`${newDocExpiry}T12:00:00.000Z`).toISOString() : undefined,
    });
  };

  const getDocumentTypeLabel = (type: string | null) => {
    const types: Record<string, string> = {
      certification: "Certification",
      license: "License",
      id: "ID",
      training: "Training",
      other: "Other",
    };
    return types[type || "other"] || "Other";
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
                  <Avatar
                    className={`w-24 h-24 ${(form.watch("profileImageUrl") || user?.profileImageUrl) ? "cursor-pointer" : ""}`}
                    role={(form.watch("profileImageUrl") || user?.profileImageUrl) ? "button" : undefined}
                    tabIndex={(form.watch("profileImageUrl") || user?.profileImageUrl) ? 0 : undefined}
                    aria-label="View profile photo"
                    onClick={() => {
                      const src = form.watch("profileImageUrl") || user?.profileImageUrl;
                      if (src) openPreview({ src, alt: "Profile photo", title: "Profile photo" });
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      const src = form.watch("profileImageUrl") || user?.profileImageUrl;
                      if (!src) return;
                      event.preventDefault();
                      openPreview({ src, alt: "Profile photo", title: "Profile photo" });
                    }}
                  >
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
                          <PhoneInput
                            field={field}
                            placeholder="Enter your phone number"
                            data-testid="input-phone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Skills</Label>
                  <p className="text-xs text-muted-foreground mb-2">Add your professional skills</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {skills.map((skill, index) => (
                      <Badge key={index} variant="secondary" className="gap-1">
                        {skill}
                        <button
                          type="button"
                          onClick={() => handleRemoveSkill(skill)}
                          className="ml-1 hover:text-destructive"
                          data-testid={`button-remove-skill-${index}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a skill..."
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddSkill();
                        }
                      }}
                      data-testid="input-new-skill"
                    />
                    <Button type="button" variant="outline" onClick={handleAddSkill} data-testid="button-add-skill">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Qualifications</Label>
                  <p className="text-xs text-muted-foreground mb-2">Add your qualifications and certifications</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {qualifications.map((qual, index) => (
                      <Badge key={index} variant="secondary" className="gap-1">
                        {qual}
                        <button
                          type="button"
                          onClick={() => handleRemoveQualification(qual)}
                          className="ml-1 hover:text-destructive"
                          data-testid={`button-remove-qualification-${index}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a qualification..."
                      value={newQualification}
                      onChange={(e) => setNewQualification(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddQualification();
                        }
                      }}
                      data-testid="input-new-qualification"
                    />
                    <Button type="button" variant="outline" onClick={handleAddQualification} data-testid="button-add-qualification">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  data-testid="button-save-profile"
                >
                  {updateMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="mt-6" data-testid="card-documents">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Documents</CardTitle>
            <CardDescription>
              Upload and manage your professional documents
            </CardDescription>
          </div>
          <ObjectUploader
            maxNumberOfFiles={1}
            maxFileSize={10485760}
            onGetUploadParameters={getUploadParameters}
            onComplete={handleDocumentUpload}
            buttonVariant="outline"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Document
          </ObjectUploader>
        </CardHeader>
        <CardContent>
          {showDocForm && pendingDocFileUrl && (
            <div className="mb-6 p-4 border rounded-md bg-muted/50">
              <h4 className="font-medium mb-4">Document Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <Label>Document Name</Label>
                  <Input
                    placeholder="Enter document name"
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                    data-testid="input-doc-name"
                  />
                </div>
                <div>
                  <Label>Document Type</Label>
                  <Select value={newDocType} onValueChange={setNewDocType}>
                    <SelectTrigger data-testid="select-doc-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="certification">Certification</SelectItem>
                      <SelectItem value="license">License</SelectItem>
                      <SelectItem value="id">ID</SelectItem>
                      <SelectItem value="training">Training</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mb-4">
                <Label>Expiry Date (Optional)</Label>
                <LocaleDateInput
                  value={newDocExpiry}
                  onChange={setNewDocExpiry}
                  disablePast
                  data-testid="button-doc-expiry"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveDocument} disabled={createDocumentMutation.isPending} data-testid="button-save-document">
                  {createDocumentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Document
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDocForm(false);
                    setPendingDocFileUrl(null);
                    setNewDocName("");
                    setNewDocType("other");
                    setNewDocExpiry(null);
                  }}
                  data-testid="button-cancel-document"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {documentsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No documents uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                  data-testid={`document-row-${doc.id}`}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{doc.documentName}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="outline" className="text-xs">
                          {getDocumentTypeLabel(doc.documentType)}
                        </Badge>
                        {doc.expiryDate && (
                          <span>Expires: {format(new Date(doc.expiryDate), "PP")}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        // Construct full URL for document
                        let documentUrl = doc.fileUrl;
                        if (!documentUrl.startsWith('http://') && !documentUrl.startsWith('https://')) {
                          // If it's a relative path, make it absolute
                          const cleanUrl = documentUrl.startsWith('/') ? documentUrl : `/${documentUrl}`;
                          documentUrl = `${window.location.origin}${cleanUrl}`;
                        }
                        window.open(documentUrl, "_blank");
                      }}
                      data-testid={`button-view-doc-${doc.id}`}
                    >
                      <FileText className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDocumentToDelete(doc)}
                      disabled={deleteDocumentMutation.isPending}
                      data-testid={`button-delete-doc-${doc.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
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

      <Card className="mt-6" data-testid="card-account-info">
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>
            These details cannot be changed from this page
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Email</Label>
            <p className="text-base" data-testid="text-email">{user?.email}</p>
          </div>
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Username</Label>
            <p className="text-base" data-testid="text-username">{user?.username}</p>
          </div>
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Role</Label>
            <p className="text-base" data-testid="text-role">
              {user?.role ? getTeamRoleDisplayLabel(user.role) : ""}
            </p>
          </div>
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={!!documentToDelete}
        onOpenChange={(open) => {
          if (!open) setDocumentToDelete(null);
        }}
        title="Delete document?"
        description="This cannot be undone. You are about to delete"
        itemName={documentToDelete?.documentName}
        isPending={deleteDocumentMutation.isPending}
        onConfirm={() => {
          if (documentToDelete) deleteDocumentMutation.mutate(documentToDelete.id);
        }}
      />
    </div>
  );
}
