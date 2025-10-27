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
import { Users, Mail, Phone, MapPin, Plus, Upload, X, GraduationCap, Briefcase, Tag, FileText } from "lucide-react";
import type { User } from "@shared/schema";
import { ObjectUploader } from "@/components/ObjectUploader";

export default function Team() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
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
      return await res.json();
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/team"] });
      toast({ title: "Team member created successfully" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
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
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/team"] });
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
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/team"] });
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
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/team"] });
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
    if (!email || !username) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Email and username are required",
      });
      return;
    }

    if (!editingUser && !password) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Password is required for new users",
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

    const data = {
      firstName,
      lastName,
      email,
      username,
      ...(password && { password }), // Only include password if provided
      phone,
      role,
      skills,
      education,
      profileImageUrl: profileImageUrl || "",
      certificateUrls: certificateUrls.filter(url => url.trim() !== ""),
      address: formattedAddress,
    };

    if (editingUser) {
      updateMutation.mutate({ userId: editingUser.id, data });
    } else {
      createMutation.mutate(data);
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

      {/* Team Members List */}
      <div className="grid gap-6">
        {teamMembers && teamMembers.length > 0 ? (
          teamMembers.map((member) => (
            <Card key={member.id} className="hover-elevate" data-testid={`card-team-member-${member.id}`}>
              <CardContent className="p-6">
                <div className="flex items-start gap-6">
                  {/* Avatar */}
                  <Avatar className="h-16 w-16">
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
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Team Members</h3>
              <p className="text-muted-foreground mb-4">
                Add your first team member to get started
              </p>
              <Button onClick={handleOpenCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Add Team Member
              </Button>
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
                  <Input
                    id="street"
                    value={address.street}
                    onChange={(e) => setAddress({ ...address, street: e.target.value, formatted: "" })}
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
                        const uploadURL = result.successful[0].uploadURL;
                        const response = await fetch('/api/objects/set-acl', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ photoUrl: uploadURL }),
                        });
                        
                        if (!response.ok) {
                          throw new Error('Failed to set photo permissions');
                        }
                        
                        const { objectPath } = await response.json();
                        setProfileImageUrl(objectPath);
                      }
                    } catch (error) {
                      console.error('[Team] Profile image upload error:', error);
                      toast({
                        title: "Upload Error",
                        description: "Failed to upload profile image. Please try again.",
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
                          const uploadURL = file.uploadURL;
                          const response = await fetch('/api/objects/set-acl', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ photoUrl: uploadURL }),
                          });
                          
                          if (!response.ok) {
                            throw new Error('Failed to set file permissions');
                          }
                          
                          const { objectPath } = await response.json();
                          newPaths.push(objectPath);
                        }
                        setCertificateUrls([...certificateUrls, ...newPaths]);
                      }
                    } catch (error) {
                      console.error('[Team] Certificate upload error:', error);
                      toast({
                        title: "Upload Error",
                        description: "Failed to upload one or more certificates. Please try again.",
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
