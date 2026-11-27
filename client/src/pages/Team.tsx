import { PreviewableImage } from "@/components/ImagePreview";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Mail, Phone, MapPin, Plus, Upload, X, GraduationCap, Briefcase, Tag, FileText, Search, Filter, Eye, EyeOff, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { User, UserDocument } from "@shared/schema";
import { isExpiryDateInPast, parseCertificateExpiryDate } from "@shared/workOrderCertificates";
import { getTeamRoleDisplayLabel } from "@shared/roleLabels";
import { COMPLIANCE_DOCUMENT_ACCEPT, ObjectUploader } from "@/components/ObjectUploader";
import { AddressInput } from "@/components/AddressInput";
import { PhoneInput } from "@/components/PhoneInput";
import { useLocale } from "@/contexts/LocaleContext";
import { ClearFiltersButton } from "@/components/ClearFiltersButton";
import { FiltersSection } from "@/components/FiltersSection";
import { cn } from "@/lib/utils";
import { pagePad } from "@/lib/responsive";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";

/** Username input removed from UI; API still requires username — derive a safe value from email. */
type CertificateDraft = {
  key: string;
  id?: string;
  fileUrl: string;
  description: string;
  expiryDate: string;
  originalDescription?: string;
  originalExpiryDate?: string;
};

function expiryInputValue(value: string | Date | null | undefined): string {
  return parseCertificateExpiryDate(value) || "";
}

function certificateFileLabel(fileUrl: string): string {
  const name = fileUrl.split("/").pop() || "Certificate";
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function validateCertificates(certs: CertificateDraft[]): string | null {
  for (const cert of certs) {
    if (!cert.description.trim()) return "Each certificate needs a description.";
    if (!cert.expiryDate) return "Each certificate needs an expiry date.";
    const changedExpiry = !cert.id || cert.expiryDate !== cert.originalExpiryDate;
    if (changedExpiry && isExpiryDateInPast(cert.expiryDate)) {
      return "Expiry date cannot be in the past.";
    }
  }
  return null;
}

class CertificateSaveError extends Error {
  drafts: CertificateDraft[];
  removedIds: string[];
  constructor(message: string, drafts: CertificateDraft[], removedIds: string[]) {
    super(message);
    this.drafts = drafts;
    this.removedIds = removedIds;
  }
}

async function persistCertificates(
  userId: string,
  drafts: CertificateDraft[],
  removedIds: string[],
): Promise<CertificateDraft[]> {
  const remainingRemoved = [...removedIds];
  const next = drafts.map((draft) => ({ ...draft }));
  try {
    while (remainingRemoved.length > 0) {
      const id = remainingRemoved[0];
      await apiRequest("DELETE", `/api/user-documents/${id}`);
      remainingRemoved.shift();
    }
    for (const draft of next) {
      const description = draft.description.trim();
      if (!draft.id) {
        const res = await apiRequest("POST", `/api/users/${userId}/documents`, {
          documentName: description,
          documentType: "certification",
          fileUrl: draft.fileUrl,
          expiryDate: draft.expiryDate,
        });
        const saved = (await res.json()) as UserDocument;
        draft.id = saved.id;
        draft.key = saved.id;
        draft.description = description;
        draft.originalDescription = description;
        draft.originalExpiryDate = draft.expiryDate;
        continue;
      }
      const changed =
        description !== (draft.originalDescription || "") ||
        draft.expiryDate !== (draft.originalExpiryDate || "");
      if (!changed) continue;
      await apiRequest("PATCH", `/api/user-documents/${draft.id}`, {
        documentName: description,
        expiryDate: draft.expiryDate,
      });
      draft.description = description;
      draft.originalDescription = description;
      draft.originalExpiryDate = draft.expiryDate;
    }
    return next;
  } catch (error: any) {
    throw new CertificateSaveError(
      error?.message || "Failed to save certificates",
      next,
      remainingRemoved,
    );
  }
}

async function saveCertificates(
  userId: string,
  drafts: CertificateDraft[],
  removedIds: string[],
  apply: (drafts: CertificateDraft[], removedIds: string[]) => void,
): Promise<void> {
  try {
    const saved = await persistCertificates(userId, drafts, removedIds);
    apply(saved, []);
  } catch (error) {
    if (error instanceof CertificateSaveError) {
      apply(error.drafts, error.removedIds);
    }
    throw error;
  }
}

function defaultUsernameFromEmail(email: string): string {
  const localPart = email.trim().split("@")[0] || "user";
  let u = localPart.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 100);
  if (u.length < 3) {
    u = `${u}usr`.slice(0, 100);
  }
  return u;
}

function getAddressPlaceholders(countryCode: string) {
  if (countryCode === "US") {
    return {
      street: "123 Main St",
      city: "New York",
      state: "New York",
      postalCode: "10001",
      country: "United States",
    };
  }

  return {
    street: "123 Main Street",
    city: "London",
    state: "Greater London",
    postalCode: "W1A 1AA",
    country: "United Kingdom",
  };
}

export default function Team() {
  const { toast } = useToast();
  const { countryCode } = useLocale();
  const addressPlaceholders = getAddressPlaceholders(countryCode);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [skillsFilter, setSkillsFilter] = useState("");
  const [educationFilter, setEducationFilter] = useState("");
  
  // Form states
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>("clerk");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [education, setEducation] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [certificates, setCertificates] = useState<CertificateDraft[]>([]);
  const [removedDocumentIds, setRemovedDocumentIds] = useState<string[]>([]);
  const [certDescription, setCertDescription] = useState("");
  const [certExpiry, setCertExpiry] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [memberPendingDelete, setMemberPendingDelete] = useState<User | null>(null);
  const { user: currentUser } = useAuth();

  const { data: teamMembers, isLoading } = useQuery<User[]>({
    queryKey: ["/api/team"],
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { data: any; certificates: CertificateDraft[] }) => {
      const res = await apiRequest("POST", "/api/team", payload.data);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || errorData.errors?.[0]?.message || `Server error: ${res.status}`);
      }
      const created = await res.json();
      await saveCertificates(created.id, payload.certificates, [], (drafts, removed) => {
        setCertificates(drafts);
        setRemovedDocumentIds(removed);
      });
      return created;
    },
    onSuccess: async (created: { welcomeEmailSent?: boolean; welcomeEmailError?: string }) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      if (created?.welcomeEmailSent) {
        toast({
          title: "Team member created",
          description: "Login details have been emailed to them. Ask them to change their password after first login.",
        });
      } else if (created?.welcomeEmailError) {
        toast({
          title: "Team member created",
          description: "Account was created, but the welcome email could not be sent. Share the login details manually.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Team member created successfully" });
      }
      handleCloseDialog();
    },
    onError: (error: Error) => {
      console.error('[Team] Create error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create team member",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      userId,
      data,
      certificates: drafts,
      removedDocumentIds: removedIds,
    }: {
      userId: string;
      data: any;
      certificates: CertificateDraft[];
      removedDocumentIds: string[];
    }) => {
      const res = await apiRequest("PATCH", `/api/team/${userId}`, data);
      const updated = await res.json();
      await saveCertificates(userId, drafts, removedIds, (nextDrafts, removed) => {
        setCertificates(nextDrafts);
        setRemovedDocumentIds(removed);
      });
      return updated;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({ title: "Team member updated successfully" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update team member",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return await apiRequest("PATCH", `/api/team/${userId}/role`, { role });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({ title: "Role updated successfully" });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update role",
      });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      return await apiRequest("PATCH", `/api/team/${userId}/status`, { isActive });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({ 
        title: "Status updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update status",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/team/${userId}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || `Server error: ${res.status}`);
      }
      return await res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      setMemberPendingDelete(null);
      toast({
        title: "Team member deleted",
        description: "Their account was removed. Assignments were cleared and the email can be used again.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Could not delete team member",
        description: error.message || "Failed to delete team member",
      });
    },
  });

  const handleOpenCreate = () => {
    setEditingUser(null);
    resetForm();
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setFirstName(user.firstName || "");
    setLastName(user.lastName || "");
    setEmail(user.email);
    setUsername(user.username);
    setPassword(""); // Don't show existing password
    setPhone(user.phone || "");
    setRole(user.role);
    setSkills(user.skills || []);
    setEducation(user.education || "");
    setProfileImageUrl(user.profileImageUrl || "");
    setCertificates([]);
    setRemovedDocumentIds([]);
    setCertDescription("");
    setCertExpiry("");
    // Address fields are now uncontrolled and will use defaultValue from editingUser
    setIsDialogOpen(true);
    void loadMemberCertificates(user);
  };

  const loadMemberCertificates = async (user: User) => {
    const legacy = (user.certificateUrls || [])
      .filter((url) => url && url.trim())
      .map((fileUrl, index) => ({
        key: `legacy-${index}-${fileUrl}`,
        fileUrl,
        description: "",
        expiryDate: "",
      }));
    try {
      const res = await fetch(`/api/users/${user.id}/documents`, { credentials: "include" });
      if (!res.ok) {
        setCertificates(legacy);
        return;
      }
      const docs = (await res.json()) as UserDocument[];
      const mapped: CertificateDraft[] = docs.map((doc) => {
        const expiryDate = expiryInputValue(doc.expiryDate);
        return {
          key: doc.id,
          id: doc.id,
          fileUrl: doc.fileUrl,
          description: doc.documentName || "",
          expiryDate,
          originalDescription: doc.documentName || "",
          originalExpiryDate: expiryDate,
        };
      });
      const known = new Set(mapped.map((doc) => doc.fileUrl));
      setCertificates([...mapped, ...legacy.filter((item) => !known.has(item.fileUrl))]);
    } catch {
      setCertificates(legacy);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingUser(null);
    resetForm();
  };

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setUsername("");
    setPassword("");
    setPhone("");
    setRole("clerk");
    setSkills([]);
    setSkillInput("");
    setEducation("");
    setProfileImageUrl("");
    setCertificates([]);
    setRemovedDocumentIds([]);
    setCertDescription("");
    setCertExpiry("");
    // Address fields are now uncontrolled - they will reset when dialog closes/reopens
  };

  const handleSubmit = () => {
    // Validate required fields
    if (!email || !email.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Email is required",
      });
      return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a valid email address",
      });
      return;
    }
    
    if (!editingUser && (!password || password.length < 6)) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Password is required and must be at least 6 characters",
      });
      return;
    }
    
    // Validate role (tenant is not allowed - tenants are managed in Contacts)
    const validRoles = ["owner", "clerk", "compliance", "contractor", "maintenance_admin"];
    if (!validRoles.includes(role)) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a valid role",
      });
      return;
    }

    // Read address data from form elements (uncontrolled inputs, like Contacts page)
    const streetElement = document.getElementById('street') as HTMLInputElement;
    const cityElement = document.getElementById('city') as HTMLInputElement;
    const stateElement = document.getElementById('state') as HTMLInputElement;
    const postalCodeElement = document.getElementById('postalCode') as HTMLInputElement;
    const countryElement = document.getElementById('country') as HTMLInputElement;
    
    const street = streetElement?.value?.trim() || "";
    const city = cityElement?.value?.trim() || "";
    const state = stateElement?.value?.trim() || "";
    const postalCode = postalCodeElement?.value?.trim() || "";
    const country = countryElement?.value?.trim() || "";
    
    // Check if any address field has data
    const hasAddress = street || city || state || postalCode || country;
    
    // Generate formatted address if we have address data
    const formattedAddress = hasAddress ? {
      street,
      city,
      state,
      postalCode,
      country,
      formatted: [street, city, state, postalCode, country]
        .filter(Boolean)
        .join(", ")
    } : undefined;

    const pendingDescription = certDescription.trim();
    const pendingExpiry = certExpiry.trim();
    if (pendingDescription || pendingExpiry) {
      toast({
        variant: "destructive",
        title: "Certificate not uploaded",
        description: "Upload the certificate file, or clear the description and expiry date.",
      });
      return;
    }

    const certificateError = validateCertificates(certificates);
    if (certificateError) {
      toast({
        variant: "destructive",
        title: "Certificate details required",
        description: certificateError,
      });
      return;
    }

    const certificateUrls = certificates
      .map((cert) => cert.fileUrl.trim())
      .filter((url) => url.startsWith("/objects/") || url.startsWith("http://") || url.startsWith("https://"));

    if (editingUser) {
      // For updates: exclude email, username, password (not allowed in updateTeamMemberSchema)
      const updateData = {
        firstName,
        lastName,
        phone,
        role,
        skills,
        education,
        profileImageUrl: profileImageUrl || "",
        certificateUrls: certificateUrls.filter(url => {
          const trimmed = url.trim();
          // Filter out empty strings and ensure valid format
          return trimmed !== "" && (trimmed.startsWith("/objects/") || trimmed.startsWith("http://") || trimmed.startsWith("https://"));
        }),
        address: formattedAddress,
      };
      updateMutation.mutate({
        userId: editingUser.id,
        data: updateData,
        certificates,
        removedDocumentIds,
      });
    } else {
      // For creates: include all fields
      // Validate profileImageUrl format
      let validProfileImageUrl: string | undefined = undefined;
      if (profileImageUrl && profileImageUrl.trim() !== "") {
        const trimmed = profileImageUrl.trim();
        if (trimmed.startsWith("/objects/") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
          validProfileImageUrl = trimmed;
        } else {
          toast({
            variant: "destructive",
            title: "Validation Error",
            description: "Profile image URL must be a valid URL or start with /objects/",
          });
          return;
        }
      }
      
      // Filter and validate certificateUrls
      const validCertificateUrls = certificateUrls
        .map(url => url.trim())
        .filter(url => {
          if (url === "") return false;
          // Must be a valid URL or start with /objects/
          return url.startsWith("/objects/") || url.startsWith("http://") || url.startsWith("https://");
        });
      
      const createData = {
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        email: email.trim(),
        username: defaultUsernameFromEmail(email),
        password: password.trim(),
        phone: phone.trim() || undefined,
        role,
        skills: skills.length > 0 ? skills : undefined,
        education: education.trim() || undefined,
        profileImageUrl: validProfileImageUrl || undefined,
        certificateUrls: validCertificateUrls.length > 0 ? validCertificateUrls : undefined,
        address: formattedAddress,
      };
      
      console.log('[Team] Creating team member with data:', { ...createData, password: '***' });
      createMutation.mutate({ data: createData, certificates });
    }
  };

  const addSkill = () => {
    if (skillInput.trim() && !skills.includes(skillInput.trim())) {
      setSkills([...skills, skillInput.trim()]);
      setSkillInput("");
    }
  };

  const removeSkill = (skill: string) => {
    setSkills(skills.filter(s => s !== skill));
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default";
      case "clerk":
        return "secondary";
      case "compliance":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getRoleLabel = (role: string) => getTeamRoleDisplayLabel(role);

  const formatAddress = (addr: any) => {
    if (!addr) return "";
    return addr.formatted || [addr.street, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean).join(", ");
  };

  // Filter team members based on search and filter criteria
  const filteredTeamMembers = teamMembers?.filter((member) => {
    // Search query filter (name, email, username)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesName = `${member.firstName} ${member.lastName}`.toLowerCase().includes(query);
      const matchesEmail = member.email?.toLowerCase().includes(query);
      const matchesUsername = member.username?.toLowerCase().includes(query);
      
      if (!matchesName && !matchesEmail && !matchesUsername) {
        return false;
      }
    }

    // Role filter
    if (roleFilter !== "all" && member.role !== roleFilter) {
      return false;
    }

    // Skills filter
    if (skillsFilter) {
      const skillQuery = skillsFilter.toLowerCase();
      const hasMatchingSkill = member.skills?.some(skill => 
        skill.toLowerCase().includes(skillQuery)
      );
      if (!hasMatchingSkill) {
        return false;
      }
    }

    // Education filter
    if (educationFilter) {
      const eduQuery = educationFilter.toLowerCase();
      if (!member.education?.toLowerCase().includes(eduQuery)) {
        return false;
      }
    }

    return true;
  }) || [];

  const clearFilters = () => {
    setSearchQuery("");
    setRoleFilter("all");
    setSkillsFilter("");
    setEducationFilter("");
  };

  const hasActiveFilters = searchQuery || roleFilter !== "all" || skillsFilter || educationFilter;

  if (isLoading) {
    return (
      <div className={cn("container mx-auto min-w-0", pagePad)}>
        <PageHeader icon={Users} title="Team Management" description="Loading team members..." />
      </div>
    );
  }

  return (
    <div className={cn("container mx-auto min-w-0 space-y-4 md:space-y-6", pagePad)}>
      <PageHeader
        icon={Users}
        title="Team Management"
        description="Manage your team members and their profiles"
        actions={
          <Button onClick={handleOpenCreate} data-testid="button-create-team-member">
            <Plus className="mr-2 h-5 w-5" />
            Add Team Member
          </Button>
        }
      />

      <FiltersSection
        headingId="team-filters-heading"
        headingEnd={
          hasActiveFilters ? (
            <ClearFiltersButton
              onClick={clearFilters}
              className="hidden md:inline-flex"
              data-testid="button-clear-filters"
            />
          ) : (
            <span className="text-xs text-muted-foreground tabular-nums hidden md:inline">
              {filteredTeamMembers.length} of {teamMembers?.length || 0}
            </span>
          )
        }
      >
        <div className="hidden md:block space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="search" className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Name, email, username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-8"
                  data-testid="input-search-team"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role-filter" className="text-xs">Role</Label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger id="role-filter" className="h-8" data-testid="select-role-filter">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="owner">{getTeamRoleDisplayLabel("owner")}</SelectItem>
                  <SelectItem value="clerk">{getTeamRoleDisplayLabel("clerk")}</SelectItem>
                  <SelectItem value="compliance">{getTeamRoleDisplayLabel("compliance")}</SelectItem>
                  <SelectItem value="contractor">{getTeamRoleDisplayLabel("contractor")}</SelectItem>
                  <SelectItem value="maintenance_admin">{getTeamRoleDisplayLabel("maintenance_admin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="skills-filter" className="text-xs">Skills</Label>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="skills-filter"
                  placeholder="e.g., Property Inspector"
                  value={skillsFilter}
                  onChange={(e) => setSkillsFilter(e.target.value)}
                  className="pl-9 h-8"
                  data-testid="input-skills-filter"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="education-filter" className="text-xs">Education</Label>
              <div className="relative">
                <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="education-filter"
                  placeholder="e.g., MBA, Bachelor"
                  value={educationFilter}
                  onChange={(e) => setEducationFilter(e.target.value)}
                  className="pl-9 h-8"
                  data-testid="input-education-filter"
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Showing {filteredTeamMembers.length} of {teamMembers?.length || 0} team members
            {hasActiveFilters && " (filtered)"}
          </p>
        </div>

        <div className="flex md:hidden gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search team members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8"
              data-testid="input-search-team-mobile"
            />
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0 relative h-8">
                <Filter className="w-4 h-4 mr-2" />
                Filters
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
                )}
              </Button>
            </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>
                Filter team members by role, skills, or education
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 mt-6">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="owner">{getTeamRoleDisplayLabel("owner")}</SelectItem>
                    <SelectItem value="clerk">{getTeamRoleDisplayLabel("clerk")}</SelectItem>
                    <SelectItem value="compliance">{getTeamRoleDisplayLabel("compliance")}</SelectItem>
                    <SelectItem value="contractor">{getTeamRoleDisplayLabel("contractor")}</SelectItem>
                    <SelectItem value="maintenance_admin">{getTeamRoleDisplayLabel("maintenance_admin")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Skills</Label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="e.g., Property Inspector"
                    value={skillsFilter}
                    onChange={(e) => setSkillsFilter(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Education</Label>
                <div className="relative">
                  <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="e.g., MBA, Bachelor"
                    value={educationFilter}
                    onChange={(e) => setEducationFilter(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {hasActiveFilters && (
                <ClearFiltersButton
                  className="w-full"
                  onClick={clearFilters}
                />
              )}
            </div>
          </SheetContent>
        </Sheet>
        </div>
      </FiltersSection>

      {/* Team Members List */}
      <div className="grid gap-6">
        {filteredTeamMembers.length > 0 ? (
          filteredTeamMembers.map((member) => (
            <Card key={member.id} className="rounded-lg border-border/80 shadow-sm" data-testid={`card-team-member-${member.id}`}>
              <CardContent className="p-6">
                <div className="flex items-start gap-6">
                  {/* Avatar */}
                  <Avatar className="h-16 w-16" key={`avatar-${member.id}-${member.profileImageUrl || 'no-image'}`}>
                    <AvatarImage src={member.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-lg">
                      {member.firstName?.[0]}{member.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>

                  {/* Main Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-xl font-semibold" data-testid={`text-name-${member.id}`}>
                        {member.firstName && member.lastName
                          ? `${member.firstName} ${member.lastName}`
                          : member.username}
                      </h3>
                      <Badge variant={getRoleBadgeVariant(member.role)} data-testid={`badge-role-${member.id}`}>
                        {getRoleLabel(member.role)}
                      </Badge>
                      <Badge 
                        variant={member.isActive ? "default" : "secondary"} 
                        data-testid={`badge-status-${member.id}`}
                      >
                        {member.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-muted-foreground">
                      {member.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          <span>{member.email}</span>
                        </div>
                      )}
                      {member.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          <span>{member.phone}</span>
                        </div>
                      )}
                      {member.address && (
                        <div className="flex items-center gap-2 md:col-span-2">
                          <MapPin className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{formatAddress(member.address)}</span>
                        </div>
                      )}
                    </div>

                    {/* Skills */}
                    {member.skills && member.skills.length > 0 && (
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <Briefcase className="w-4 h-4 text-muted-foreground" />
                        {member.skills.map((skill, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEdit(member)}
                      data-testid={`button-edit-${member.id}`}
                    >
                      Edit Profile
                    </Button>
                    <Button
                      variant={member.isActive ? "destructive" : "default"}
                      size="sm"
                      onClick={() => toggleStatusMutation.mutate({ userId: member.id, isActive: !member.isActive })}
                      disabled={toggleStatusMutation.isPending || currentUser?.id === member.id}
                      data-testid={`button-toggle-status-${member.id}`}
                    >
                      {member.isActive ? "Disable Account" : "Enable Account"}
                    </Button>
                    {currentUser?.id !== member.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                        onClick={() => setMemberPendingDelete(member)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${member.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        Delete
                      </Button>
                    )}
                    <Select
                      value={member.role}
                      onValueChange={(role) => updateRoleMutation.mutate({ userId: member.id, role })}
                      disabled={updateRoleMutation.isPending || currentUser?.id === member.id}
                    >
                      <SelectTrigger className="w-40" data-testid={`select-role-${member.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">{getTeamRoleDisplayLabel("owner")}</SelectItem>
                        <SelectItem value="clerk">{getTeamRoleDisplayLabel("clerk")}</SelectItem>
                        <SelectItem value="compliance">{getTeamRoleDisplayLabel("compliance")}</SelectItem>
                        <SelectItem value="contractor">{getTeamRoleDisplayLabel("contractor")}</SelectItem>
                        <SelectItem value="maintenance_admin">{getTeamRoleDisplayLabel("maintenance_admin")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              {hasActiveFilters ? (
                <>
                  <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Matching Team Members</h3>
                  <p className="text-muted-foreground mb-4">
                    No team members match your current filters. Try adjusting your search criteria.
                  </p>
                  <ClearFiltersButton onClick={clearFilters} />
                </>
              ) : (
                <>
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Team Members</h3>
                  <p className="text-muted-foreground mb-4">
                    Add your first team member to get started
                  </p>
                  <Button onClick={handleOpenCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Team Member
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[min(85vh,calc(100dvh-2rem))] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Edit Team Member" : "Add Team Member"}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? "Update team member profile information"
                : "Create a new team member with complete profile"}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="w-full min-w-0">
            <TabsList className="w-full">
              <TabsTrigger value="basic" className="flex-1">Basic Info</TabsTrigger>
              <TabsTrigger value="professional" className="flex-1">Professional</TabsTrigger>
              <TabsTrigger value="documents" className="flex-1">Documents</TabsTrigger>
            </TabsList>

            {/* Basic Info Tab */}
            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" required>First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" required>Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" required>Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  autoComplete="off"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john.doe@example.com"
                  data-testid="input-email"
                />
              </div>

              {!editingUser && (
                <div className="space-y-2">
                  <Label htmlFor="password" required>Password</Label>
                  <div className="relative">
                    {/* Hidden dummy password field to prevent browser autofill */}
                    <input
                      type="password"
                      autoComplete="new-password"
                      style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
                      tabIndex={-1}
                      readOnly
                    />
                    <Input
                      key={`password-${isDialogOpen}-${editingUser?.id || 'new'}`}
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      autoComplete="new-password"
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
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
                </div>
              )}

              <div className="space-y-2">
                <PhoneInput
                  id="phone"
                  value={phone}
                  onChange={(value) => setPhone(value)}
                  placeholder="Enter phone number"
                  data-testid="input-phone"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role" required>Role / Permission Level</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger data-testid="select-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">{getTeamRoleDisplayLabel("owner")}</SelectItem>
                    <SelectItem value="clerk">{getTeamRoleDisplayLabel("clerk")}</SelectItem>
                    <SelectItem value="compliance">{getTeamRoleDisplayLabel("compliance")}</SelectItem>
                    <SelectItem value="contractor">{getTeamRoleDisplayLabel("contractor")}</SelectItem>
                    <SelectItem value="maintenance_admin">{getTeamRoleDisplayLabel("maintenance_admin")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Address Fields */}
              <div className="space-y-4 border-t pt-4">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Address
                </Label>
                 <div className="space-y-2">
                   <Label htmlFor="street">Street Address</Label>
                   <AddressInput
                     id="street"
                     name="street"
                     defaultValue={editingUser?.address?.street || ""}
                     placeholder={addressPlaceholders.street}
                     data-testid="input-street"
                   />
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="space-y-2">
                     <Label htmlFor="city">City</Label>
                     <Input
                       id="city"
                       name="city"
                       defaultValue={editingUser?.address?.city || ""}
                       placeholder={addressPlaceholders.city}
                       data-testid="input-city"
                     />
                   </div>
                   <div className="space-y-2">
                     <Label htmlFor="state">State/County</Label>
                     <Input
                       id="state"
                       name="state"
                       defaultValue={editingUser?.address?.state || ""}
                       placeholder={addressPlaceholders.state}
                       data-testid="input-state"
                     />
                   </div>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="space-y-2">
                     <Label htmlFor="postalCode">Postal Code / ZIP Code</Label>
                     <Input
                       id="postalCode"
                       name="postalCode"
                       defaultValue={editingUser?.address?.postalCode || ""}
                       placeholder={addressPlaceholders.postalCode}
                       data-testid="input-postal-code"
                     />
                   </div>
                   <div className="space-y-2">
                     <Label htmlFor="country">Country</Label>
                     <Input
                       id="country"
                       name="country"
                       defaultValue={editingUser?.address?.country || ""}
                       placeholder={addressPlaceholders.country}
                       data-testid="input-country"
                     />
                   </div>
                 </div>
              </div>
            </TabsContent>

            {/* Professional Tab */}
            <TabsContent value="professional" className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  Skills
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
                    placeholder="Add a skill and press Enter"
                    data-testid="input-skill"
                  />
                  <Button type="button" onClick={addSkill} variant="outline">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {skills.map((skill, idx) => (
                    <Badge key={idx} variant="secondary" className="gap-2">
                      {skill}
                      <X
                        className="w-3 h-3 cursor-pointer"
                        onClick={() => removeSkill(skill)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="education" className="text-base font-semibold flex items-center gap-2">
                  <GraduationCap className="w-4 h-4" />
                  Education
                </Label>
                <Textarea
                  id="education"
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                  placeholder="Enter educational background, certifications, degrees..."
                  rows={4}
                  data-testid="textarea-education"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profileImage">Profile Image</Label>
                <ObjectUploader
                  maxNumberOfFiles={1}
                  onGetUploadParameters={async () => {
                    const response = await fetch('/api/objects/upload', {
                      method: 'POST',
                      credentials: 'include',
                    });
                    const { uploadURL } = await response.json();
                    return {
                      method: 'PUT',
                      url: uploadURL,
                    };
                  }}
                  onComplete={async (result) => {
                    try {
                      if (result.successful && result.successful.length > 0) {
                        let fileUrl = result.successful[0].uploadURL;
                        
                        // Normalize URL: if absolute, extract pathname; if relative, use as is
                        if (fileUrl && (fileUrl.startsWith('http://') || fileUrl.startsWith('https://'))) {
                          try {
                            const urlObj = new URL(fileUrl);
                            fileUrl = urlObj.pathname;
                          } catch (e) {
                            console.error('[Team] Invalid file URL:', fileUrl);
                            throw new Error('Invalid file URL format');
                          }
                        }
                        
                        // Ensure it's a valid file path (should start with /objects/)
                        if (!fileUrl || !fileUrl.startsWith('/objects/')) {
                          console.error('[Team] Invalid file URL format:', fileUrl);
                          throw new Error('Invalid file URL format. Expected path starting with /objects/');
                        }
                        
                        // Convert to absolute URL for ACL call
                        const absoluteUrl = `${window.location.origin}${fileUrl}`;
                        
                        const response = await fetch('/api/objects/set-acl', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ photoUrl: absoluteUrl }),
                        });
                        
                        if (!response.ok) {
                          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                          throw new Error(errorData.error || 'Failed to set photo permissions');
                        }
                        
                        const { objectPath } = await response.json();
                        setProfileImageUrl(objectPath || fileUrl);
                      }
                    } catch (error: any) {
                      console.error('[Team] Profile image upload error:', error);
                      toast({
                        title: "Upload Error",
                        description: error.message || "Failed to upload profile image. Please try again.",
                        variant: "destructive",
                      });
                    }
                  }}
                  buttonClassName="w-full"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Profile Image
                </ObjectUploader>
                {profileImageUrl && (
                  <div className="relative inline-block">
                    <PreviewableImage
                      src={profileImageUrl}
                      alt="Profile preview"
                      title="Profile photo"
                      showHint={false}
                      className="h-24 w-24 object-cover rounded-full border-2"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                      onClick={() => setProfileImageUrl("")}
                      data-testid="button-remove-profile-image"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents" className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Certificates & Documents
                </Label>
                <p className="text-sm text-muted-foreground">
                  Each certificate needs a description and an expiry date. When it expires, the member is emailed and an alert appears in New Requests.
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-border/80 p-3">
                <div className="space-y-2">
                  <Label htmlFor="certificate-description">
                    Description <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="certificate-description"
                    value={certDescription}
                    onChange={(event) => setCertDescription(event.target.value)}
                    placeholder="Gas Safe certificate"
                    data-testid="input-certificate-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="certificate-expiry">
                    Expiry date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="certificate-expiry"
                    type="date"
                    value={certExpiry}
                    onChange={(event) => setCertExpiry(event.target.value)}
                    data-testid="input-certificate-expiry"
                  />
                </div>
                {certDescription.trim() && certExpiry && !isExpiryDateInPast(certExpiry) ? (
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    accept={COMPLIANCE_DOCUMENT_ACCEPT}
                    onGetUploadParameters={async () => {
                      const response = await fetch('/api/objects/upload', {
                        method: 'POST',
                        credentials: 'include',
                      });
                      const { uploadURL } = await response.json();
                      return { method: 'PUT', url: uploadURL };
                    }}
                    onComplete={async (result) => {
                      try {
                        const file = result.successful?.[0];
                        if (!file?.uploadURL) {
                          throw new Error("No certificate was uploaded");
                        }
                        let fileUrl = file.uploadURL;
                        if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
                          fileUrl = new URL(fileUrl).pathname;
                        }
                        if (!fileUrl.startsWith("/objects/")) {
                          throw new Error("Invalid certificate file");
                        }
                        const absoluteUrl = `${window.location.origin}${fileUrl}`;
                        const response = await fetch("/api/objects/set-acl", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({ photoUrl: absoluteUrl }),
                        });
                        if (!response.ok) {
                          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
                          throw new Error(errorData.error || "Failed to save the certificate file");
                        }
                        const { objectPath } = await response.json();
                        const description = certDescription.trim();
                        const expiryDate = certExpiry;
                        setCertificates((current) => [
                          ...current,
                          {
                            key: `new-${Date.now()}`,
                            fileUrl: objectPath || fileUrl,
                            description,
                            expiryDate,
                          },
                        ]);
                        setCertDescription("");
                        setCertExpiry("");
                        toast({
                          title: "Certificate added",
                          description: "Save the profile to keep this certificate.",
                        });
                      } catch (error: any) {
                        toast({
                          title: "Upload error",
                          description: error.message || "Failed to upload the certificate.",
                          variant: "destructive",
                        });
                      }
                    }}
                    buttonClassName="w-full"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload certificate
                  </ObjectUploader>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      if (!certDescription.trim() || !certExpiry) {
                        toast({
                          variant: "destructive",
                          title: "Certificate details required",
                          description: "Enter a description and expiry date before uploading.",
                        });
                        return;
                      }
                      toast({
                        variant: "destructive",
                        title: "Expiry date invalid",
                        description: "Expiry date cannot be in the past.",
                      });
                    }}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload certificate
                  </Button>
                )}
              </div>

              {certificates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">{certificates.length} certificate(s)</p>
                  {certificates.map((cert, idx) => {
                    const expired = !!cert.expiryDate && isExpiryDateInPast(cert.expiryDate);
                    return (
                      <div key={cert.key} className="space-y-2 rounded-lg border p-3">
                        <div className="flex items-start gap-2">
                          <FileText className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1 space-y-2">
                            <Input
                              value={cert.description}
                              onChange={(event) => {
                                const description = event.target.value;
                                setCertificates((current) =>
                                  current.map((item) =>
                                    item.key === cert.key ? { ...item, description } : item,
                                  ),
                                );
                              }}
                              placeholder="Description"
                              aria-label="Certificate description"
                              data-testid={`input-certificate-description-${idx}`}
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                type="date"
                                value={cert.expiryDate}
                                onChange={(event) => {
                                  const expiryDate = event.target.value;
                                  setCertificates((current) =>
                                    current.map((item) =>
                                      item.key === cert.key ? { ...item, expiryDate } : item,
                                    ),
                                  );
                                }}
                                aria-label="Certificate expiry date"
                                className="w-auto"
                                data-testid={`input-certificate-expiry-${idx}`}
                              />
                              {expired ? (
                                <Badge variant="destructive">Expired</Badge>
                              ) : null}
                              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                {certificateFileLabel(cert.fileUrl)}
                              </span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setCertificates((current) => current.filter((item) => item.key !== cert.key));
                              if (cert.id) {
                                setRemovedDocumentIds((current) =>
                                  current.includes(cert.id!) ? current : [...current, cert.id!],
                                );
                              }
                            }}
                            data-testid={`button-remove-certificate-${idx}`}
                            aria-label="Remove certificate"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingUser
                ? "Update Profile"
                : "Create Team Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!memberPendingDelete}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setMemberPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team member permanently?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This will permanently remove{" "}
                  <span className="font-medium text-foreground">
                    {memberPendingDelete?.firstName && memberPendingDelete?.lastName
                      ? `${memberPendingDelete.firstName} ${memberPendingDelete.lastName}`
                      : memberPendingDelete?.email}
                  </span>{" "}
                  ({memberPendingDelete?.email}) from your organisation.
                </p>
                <p>
                  Their inspections, maintenance jobs, and work orders will be unassigned. Historical
                  records stay, but this account is wiped so the same email can be added again later
                  (including under another organisation).
                </p>
                <p className="font-medium text-destructive">This cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending || !memberPendingDelete}
              onClick={(e) => {
                e.preventDefault();
                if (memberPendingDelete) {
                  deleteMutation.mutate(memberPendingDelete.id);
                }
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
