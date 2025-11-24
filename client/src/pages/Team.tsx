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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Mail, Phone, MapPin, Plus, Upload, X, GraduationCap, Briefcase, Tag, FileText, Search, Filter } from "lucide-react";
import type { User } from "@shared/schema";
import { ObjectUploader } from "@/components/ObjectUploader";
import { AddressInput } from "@/components/AddressInput";

export default function Team() {
  const { toast } = useToast();
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
  const [certificateUrls, setCertificateUrls] = useState<string[]>([]);
  const [address, setAddress] = useState({
    street: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    formatted: ""
  });

  const { data: teamMembers, isLoading } = useQuery<User[]>({
    queryKey: ["/api/team"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/team", data);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || errorData.errors?.[0]?.message || `Server error: ${res.status}`);
      }
      return await res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({ title: "Team member created successfully" });
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
    mutationFn: async ({ userId, data }: { userId: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/team/${userId}`, data);
      return await res.json();
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
    setCertificateUrls(user.certificateUrls || []);
    setAddress({
      street: user.address?.street || "",
      city: user.address?.city || "",
      state: user.address?.state || "",
      postalCode: user.address?.postalCode || "",
      country: user.address?.country || "",
      formatted: user.address?.formatted || ""
    });
    setIsDialogOpen(true);
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
    setCertificateUrls([]);
    setAddress({
      street: "",
      city: "",
      state: "",
      postalCode: "",
      country: "",
      formatted: ""
    });
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
    
    if (!username || !username.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Username is required",
      });
      return;
    }
    
    if (username.trim().length < 3) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Username must be at least 3 characters",
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
    
    // Validate role
    const validRoles = ["owner", "clerk", "compliance", "tenant", "contractor"];
    if (!validRoles.includes(role)) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a valid role",
      });
      return;
    }

    // Check if any address field has data
    const hasAddress = address.street || address.city || address.state || address.postalCode || address.country;
    
    // Generate formatted address if we have address data
    const formattedAddress = hasAddress ? {
      ...address,
      formatted: [address.street, address.city, address.state, address.postalCode, address.country]
        .filter(Boolean)
        .join(", ")
    } : undefined;

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
      updateMutation.mutate({ userId: editingUser.id, data: updateData });
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
        username: username.trim(),
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
      createMutation.mutate(createData);
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

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "owner":
        return "Owner/Operator";
      case "clerk":
        return "Inventory Clerk";
      case "compliance":
        return "Compliance Officer";
      case "tenant":
        return "Tenant";
      default:
        return role.charAt(0).toUpperCase() + role.slice(1);
    }
  };

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
      <div className="container mx-auto p-6 md:p-8 lg:p-12">
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Team Management</h1>
            <p className="text-lg text-muted-foreground mt-1">Loading team members...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 md:p-8 lg:p-12 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Team Management</h1>
          <p className="text-lg text-muted-foreground mt-1">Manage your team members and their profiles</p>
        </div>
        <Button onClick={handleOpenCreate} size="lg" data-testid="button-create-team-member">
          <Plus className="mr-2 h-5 w-5" />
          Add Team Member
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Filter Team Members</h2>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="ml-auto"
              data-testid="button-clear-filters"
            >
              Clear Filters
            </Button>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="space-y-2">
            <Label htmlFor="search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Name, email, username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-team"
              />
            </div>
          </div>

          {/* Role Filter */}
          <div className="space-y-2">
            <Label htmlFor="role-filter">Role</Label>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger id="role-filter" data-testid="select-role-filter">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="owner">Owner/Operator</SelectItem>
                <SelectItem value="clerk">Inventory Clerk</SelectItem>
                <SelectItem value="compliance">Compliance Officer</SelectItem>
                <SelectItem value="tenant">Tenant</SelectItem>
                <SelectItem value="contractor">Contractor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Skills Filter */}
          <div className="space-y-2">
            <Label htmlFor="skills-filter">Skills</Label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="skills-filter"
                placeholder="e.g., Property Inspector"
                value={skillsFilter}
                onChange={(e) => setSkillsFilter(e.target.value)}
                className="pl-9"
                data-testid="input-skills-filter"
              />
            </div>
          </div>

          {/* Education Filter */}
          <div className="space-y-2">
            <Label htmlFor="education-filter">Education</Label>
            <div className="relative">
              <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="education-filter"
                placeholder="e.g., MBA, Bachelor"
                value={educationFilter}
                onChange={(e) => setEducationFilter(e.target.value)}
                className="pl-9"
                data-testid="input-education-filter"
              />
            </div>
          </div>
        </div>

        {/* Results count */}
        <div className="mt-4 text-sm text-muted-foreground">
          Showing {filteredTeamMembers.length} of {teamMembers?.length || 0} team members
          {hasActiveFilters && " (filtered)"}
        </div>
      </Card>

      {/* Team Members List */}
      <div className="grid gap-6">
        {filteredTeamMembers.length > 0 ? (
          filteredTeamMembers.map((member) => (
            <Card key={member.id} className="hover-elevate" data-testid={`card-team-member-${member.id}`}>
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
                      disabled={toggleStatusMutation.isPending}
                      data-testid={`button-toggle-status-${member.id}`}
                    >
                      {member.isActive ? "Disable Account" : "Enable Account"}
                    </Button>
                    <Select
                      value={member.role}
                      onValueChange={(role) => updateRoleMutation.mutate({ userId: member.id, role })}
                      disabled={updateRoleMutation.isPending}
                    >
                      <SelectTrigger className="w-40" data-testid={`select-role-${member.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner/Operator</SelectItem>
                        <SelectItem value="clerk">Inventory Clerk</SelectItem>
                        <SelectItem value="compliance">Compliance Officer</SelectItem>
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
                  <Button onClick={clearFilters} variant="outline">
                    <X className="mr-2 h-4 w-4" />
                    Clear Filters
                  </Button>
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="professional">Professional</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>

            {/* Basic Info Tab */}
            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
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
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john.doe@example.com"
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="johndoe"
                  data-testid="input-username"
                />
              </div>

              {!editingUser && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    data-testid="input-password"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  data-testid="input-phone"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role / Permission Level *</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger data-testid="select-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner/Operator</SelectItem>
                    <SelectItem value="clerk">Inventory Clerk</SelectItem>
                    <SelectItem value="compliance">Compliance Officer</SelectItem>
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
                    value={address.street}
                    onChange={(value) => setAddress({ ...address, street: value, formatted: "" })}
                    placeholder="123 Main Street"
                    data-testid="input-street"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={address.city}
                      onChange={(e) => setAddress({ ...address, city: e.target.value, formatted: "" })}
                      placeholder="London"
                      data-testid="input-city"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State/County</Label>
                    <Input
                      id="state"
                      value={address.state}
                      onChange={(e) => setAddress({ ...address, state: e.target.value, formatted: "" })}
                      placeholder="Greater London"
                      data-testid="input-state"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">Postal Code</Label>
                    <Input
                      id="postalCode"
                      value={address.postalCode}
                      onChange={(e) => setAddress({ ...address, postalCode: e.target.value, formatted: "" })}
                      placeholder="W1A 1AA"
                      data-testid="input-postal-code"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={address.country}
                      onChange={(e) => setAddress({ ...address, country: e.target.value, formatted: "" })}
                      placeholder="United Kingdom"
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
                        
                        // Ensure it's a valid file path (should start with /objects/)
                        if (!fileUrl || !fileUrl.startsWith('/objects/')) {
                          // If it's an absolute URL, extract the path
                          if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
                            try {
                              const urlObj = new URL(fileUrl);
                              fileUrl = urlObj.pathname;
                            } catch (e) {
                              console.error('[Team] Invalid file URL:', fileUrl);
                              throw new Error('Invalid file URL format');
                            }
                          } else {
                            console.error('[Team] Invalid file URL format:', fileUrl);
                            throw new Error('Invalid file URL format');
                          }
                        }
                        
                        // Convert to absolute URL for ACL call
                        const absoluteUrl = fileUrl.startsWith('/') 
                          ? `${window.location.origin}${fileUrl}`
                          : fileUrl;
                        
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
                    <img 
                      src={profileImageUrl} 
                      alt="Profile preview" 
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
                  Upload professional certificates, licenses, or other relevant documents (PDF, images, etc.)
                </p>
              </div>

              {/* Upload Certificates */}
              <div className="space-y-2">
                <Label>Upload Certificates</Label>
                <ObjectUploader
                  maxNumberOfFiles={10}
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
                        const newPaths: string[] = [];
                        for (const file of result.successful) {
                          let fileUrl = file.uploadURL;
                          
                          // Ensure it's a valid file path (should start with /objects/)
                          if (!fileUrl || !fileUrl.startsWith('/objects/')) {
                            // If it's an absolute URL, extract the path
                            if (fileUrl && (fileUrl.startsWith('http://') || fileUrl.startsWith('https://'))) {
                              try {
                                const urlObj = new URL(fileUrl);
                                fileUrl = urlObj.pathname;
                              } catch (e) {
                                console.error('[Team] Invalid certificate URL:', fileUrl);
                                continue; // Skip this file
                              }
                            } else {
                              console.error('[Team] Invalid certificate URL format:', fileUrl);
                              continue; // Skip this file
                            }
                          }
                          
                          // Convert to absolute URL for ACL call
                          const absoluteUrl = fileUrl.startsWith('/') 
                            ? `${window.location.origin}${fileUrl}`
                            : fileUrl;
                          
                          const response = await fetch('/api/objects/set-acl', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ photoUrl: absoluteUrl }),
                          });
                          
                          if (!response.ok) {
                            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                            console.error('[Team] Failed to set ACL for certificate:', errorData);
                            continue; // Skip this file but continue with others
                          }
                          
                          const { objectPath } = await response.json();
                          newPaths.push(objectPath || fileUrl);
                        }
                        
                        if (newPaths.length > 0) {
                          setCertificateUrls([...certificateUrls, ...newPaths]);
                          toast({
                            title: "Success",
                            description: `${newPaths.length} certificate(s) uploaded successfully`,
                          });
                        } else {
                          throw new Error('No certificates were uploaded successfully');
                        }
                      }
                    } catch (error: any) {
                      console.error('[Team] Certificate upload error:', error);
                      toast({
                        title: "Upload Error",
                        description: error.message || "Failed to upload one or more certificates. Please try again.",
                        variant: "destructive",
                      });
                    }
                  }}
                  buttonClassName="w-full"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Certificates
                </ObjectUploader>
                {certificateUrls.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <p className="text-sm text-muted-foreground">{certificateUrls.length} certificate(s) uploaded</p>
                    {certificateUrls.map((url, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 border rounded">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm flex-1 truncate">{url.split('/').pop()}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setCertificateUrls(certificateUrls.filter((_, i) => i !== idx))}
                          data-testid={`button-remove-certificate-${idx}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
    </div>
  );
}
