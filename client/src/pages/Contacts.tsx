import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Users, Plus, Search, Mail, Phone, Building2, Briefcase, Globe, MapPin, Trash2, Edit, Tag, X } from "lucide-react";
import type { Contact, Tag as TagType } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AddressInput } from "@/components/AddressInput";
import { PhoneInput } from "@/components/PhoneInput";
import { parsePhoneNumber, combinePhoneNumber, getPhoneCodeForCountry } from "@shared/phoneCountryCodes";
import { useLocale } from "@/contexts/LocaleContext";

type ContactWithTags = Omit<Contact, 'tags'> & { tags?: TagType[] };

const contactTypeLabels: Record<string, string> = {
  internal: "Internal",
  contractor: "Contractor",
  lead: "Lead",
  company: "Company",
  partner: "Partner",
  vendor: "Vendor",
  tenant: "Tenant",
  other: "Other",
};

const contactTypeBadgeVariants: Record<string, "default" | "secondary" | "outline"> = {
  internal: "default",
  contractor: "secondary",
  lead: "outline",
  company: "default",
  partner: "default",
  vendor: "secondary",
  tenant: "default",
  other: "outline",
};

export default function Contacts() {
  const { toast } = useToast();
  const { countryCode: userCountryCode } = useLocale();
  const defaultPhoneCode = getPhoneCodeForCountry(userCountryCode);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactWithTags | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [phoneValue, setPhoneValue] = useState<string>("");

  const { data: contacts, isLoading } = useQuery<ContactWithTags[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: allTags } = useQuery<TagType[]>({
    queryKey: ["/api/tags"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/contacts", data);
      return await res.json();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save contact",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/contacts/${id}`, data);
      return await res.json();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update contact",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Success",
        description: "Contact deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete contact",
      });
    },
  });

  const addTagMutation = useMutation({
    mutationFn: async ({ contactId, tagId }: { contactId: string; tagId: string }) => {
      return await apiRequest("POST", `/api/contacts/${contactId}/tags/${tagId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async ({ contactId, tagId }: { contactId: string; tagId: string }) => {
      return await apiRequest("DELETE", `/api/contacts/${contactId}/tags/${tagId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    },
  });

  const createTagMutation = useMutation({
    mutationFn: async (data: { name: string; color?: string }) => {
      const res = await apiRequest("POST", "/api/tags", data);
      return await res.json() as TagType;
    },
    onSuccess: async (newTag: TagType) => {
      await queryClient.refetchQueries({ queryKey: ["/api/tags"] });
      setSelectedTags(prev => [...prev, newTag.id]);
      setNewTagName("");
      toast({
        title: "Success",
        description: "Tag created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create tag",
      });
    },
  });

  const handleCreateTag = () => {
    if (!newTagName.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a tag name",
      });
      return;
    }
    
    // Generate a random color for the new tag
    const colors = ["#00D5CC", "#3B7A8C", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    createTagMutation.mutate({ name: newTagName.trim(), color: randomColor });
  };

  // Handle Enter key to move to next field instead of submitting
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.target instanceof HTMLElement) {
      // Don't prevent default for textarea (allow new lines)
      if (e.target.tagName === "TEXTAREA") {
        return;
      }
      
      e.preventDefault();
      
      // Get all focusable form elements
      const form = e.currentTarget.closest('form');
      if (!form) return;
      
      const focusableElements = form.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])'
      );
      
      const currentIndex = Array.from(focusableElements).indexOf(e.target as HTMLElement);
      
      if (currentIndex !== -1 && currentIndex < focusableElements.length - 1) {
        // Focus next element
        const nextElement = focusableElements[currentIndex + 1];
        // Skip submit buttons
        if (nextElement.tagName === "BUTTON" && (nextElement as HTMLButtonElement).type === "submit") {
          // If next is submit button, focus the one before it or stay on current
          if (currentIndex > 0) {
            focusableElements[currentIndex - 1]?.focus();
          }
        } else {
          nextElement.focus();
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    // Use phoneValue from state (already combined)
    const parsedPhone = parsePhoneNumber(phoneValue);
    
    const data = {
      type: formData.get("type") as string,
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email: formData.get("email") as string || undefined,
      phone: phoneValue || undefined, // Combined phone number
      countryCode: parsedPhone.countryCode || defaultPhoneCode, // Extract country code for schema compatibility
      companyName: formData.get("companyName") as string || undefined,
      jobTitle: formData.get("jobTitle") as string || undefined,
      address: formData.get("address") as string || undefined,
      city: formData.get("city") as string || undefined,
      state: formData.get("state") as string || undefined,
      postalCode: formData.get("postalCode") as string || undefined,
      country: formData.get("country") as string || undefined,
      website: formData.get("website") as string || undefined,
      notes: formData.get("notes") as string || undefined,
    };

    try {
      let contactId: string;
      
      if (editingContact) {
        await updateMutation.mutateAsync({ id: editingContact.id, data });
        contactId = editingContact.id;
        
        // Update tags: remove old tags, add new tags
        const oldTagIds = editingContact.tags?.map(t => t.id) || [];
        const tagsToRemove = oldTagIds.filter(id => !selectedTags.includes(id));
        const tagsToAdd = selectedTags.filter(id => !oldTagIds.includes(id));
        
        for (const tagId of tagsToRemove) {
          await removeTagMutation.mutateAsync({ contactId, tagId });
        }
        for (const tagId of tagsToAdd) {
          await addTagMutation.mutateAsync({ contactId, tagId });
        }
      } else {
        const result = await createMutation.mutateAsync(data);
        contactId = result.id;
        
        // Add tags to new contact
        for (const tagId of selectedTags) {
          await addTagMutation.mutateAsync({ contactId, tagId });
        }
      }
      
      // Invalidate and refetch contacts to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      await queryClient.refetchQueries({ queryKey: ["/api/contacts"] });
      
      setDialogOpen(false);
      setEditingContact(null);
      setSelectedTags([]);
      setPhoneValue("");
      
      toast({
        title: "Success",
        description: editingContact ? "Contact updated successfully" : "Contact created successfully",
      });
    } catch (error) {
      // Error handling is done in mutations
    }
  };

  const filteredContacts = contacts?.filter((contact) => {
    const matchesSearch =
      searchTerm === "" ||
      `${contact.firstName} ${contact.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.companyName?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === "all" || contact.type === filterType;

    const matchesTag = filterTag === "all" || contact.tags?.some(tag => tag.id === filterTag);

    return matchesSearch && matchesType && matchesTag;
  });

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Users className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-semibold">Contacts</h1>
              <p className="text-muted-foreground">Loading contacts...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-semibold">Contacts</h1>
              <p className="text-muted-foreground">
                Manage internal team members and external contacts
              </p>
            </div>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  setEditingContact(null);
                  setPhoneValue("");
                }}
                data-testid="button-add-contact"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Contact
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingContact ? "Edit Contact" : "Add New Contact"}
                </DialogTitle>
                <DialogDescription>
                  {editingContact
                    ? "Update contact information"
                    : "Create a new contact entry"}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="type">Contact Type *</Label>
                    <Select
                      name="type"
                      defaultValue={editingContact?.type || "other"}
                      required
                    >
                      <SelectTrigger data-testid="select-contact-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">Internal</SelectItem>
                        <SelectItem value="contractor">Contractor</SelectItem>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="company">Company</SelectItem>
                        <SelectItem value="partner">Partner</SelectItem>
                        <SelectItem value="vendor">Vendor</SelectItem>
                        <SelectItem value="tenant">Tenant</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      name="companyName"
                      defaultValue={editingContact?.companyName || ""}
                      placeholder="Acme Corporation"
                      data-testid="input-company-name"
                      onKeyDown={handleKeyDown}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      name="firstName"
                      defaultValue={editingContact?.firstName || ""}
                      required
                      placeholder="John"
                      data-testid="input-first-name"
                      onKeyDown={handleKeyDown}
                    />
                  </div>

                  <div>
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      name="lastName"
                      defaultValue={editingContact?.lastName || ""}
                      required
                      placeholder="Doe"
                      data-testid="input-last-name"
                      onKeyDown={handleKeyDown}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      defaultValue={editingContact?.email || ""}
                      placeholder="john@example.com"
                      data-testid="input-email"
                      onKeyDown={handleKeyDown}
                    />
                  </div>

                  <div>
                    <Label htmlFor="jobTitle">Job Title</Label>
                    <Input
                      id="jobTitle"
                      name="jobTitle"
                      defaultValue={editingContact?.jobTitle || ""}
                      placeholder="Property Manager"
                      data-testid="input-job-title"
                      onKeyDown={handleKeyDown}
                    />
                  </div>
                </div>

                <div>
                  <PhoneInput
                    id="phone"
                    name="phone"
                    value={phoneValue}
                    onChange={(value) => setPhoneValue(value)}
                    placeholder="Enter phone number"
                    data-testid="input-phone"
                  />
                </div>

                <div>
                  <Label htmlFor="address">Address</Label>
                  <AddressInput
                    id="address"
                    name="address"
                    defaultValue={editingContact?.address || ""}
                    placeholder="123 Main Street"
                    data-testid="input-address"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      name="city"
                      defaultValue={editingContact?.city || ""}
                      placeholder="New York"
                      data-testid="input-city"
                      onKeyDown={handleKeyDown}
                    />
                  </div>

                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      name="state"
                      defaultValue={editingContact?.state || ""}
                      placeholder="NY"
                      data-testid="input-state"
                      onKeyDown={handleKeyDown}
                    />
                  </div>

                  <div>
                    <Label htmlFor="postalCode">Postal Code</Label>
                    <Input
                      id="postalCode"
                      name="postalCode"
                      defaultValue={editingContact?.postalCode || ""}
                      placeholder="10001"
                      data-testid="input-postal-code"
                      onKeyDown={handleKeyDown}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      name="country"
                      defaultValue={editingContact?.country || ""}
                      placeholder="United States"
                      data-testid="input-country"
                      onKeyDown={handleKeyDown}
                    />
                  </div>

                  <div>
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      name="website"
                      type="url"
                      defaultValue={editingContact?.website || ""}
                      placeholder="https://example.com"
                      data-testid="input-website"
                      onKeyDown={handleKeyDown}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    defaultValue={editingContact?.notes || ""}
                    placeholder="Additional notes or information"
                    data-testid="input-notes"
                    rows={3}
                    onKeyDown={handleKeyDown}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tags</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {selectedTags.map((tagId) => {
                      const tag = allTags?.find(t => t.id === tagId);
                      if (!tag) return null;
                      return (
                        <Badge
                          key={tagId}
                          variant="outline"
                          className="gap-1"
                          style={{ borderColor: tag.color || undefined }}
                          data-testid={`badge-selected-tag-${tagId}`}
                        >
                          {tag.name}
                          <X
                            className="w-3 h-3 cursor-pointer hover:text-destructive"
                            onClick={() => setSelectedTags(prev => prev.filter(id => id !== tagId))}
                          />
                        </Badge>
                      );
                    })}
                  </div>
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (value && !selectedTags.includes(value)) {
                        setSelectedTags(prev => [...prev, value]);
                      }
                    }}
                  >
                    <SelectTrigger data-testid="select-add-tag">
                      <SelectValue placeholder="Add existing tag..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allTags?.filter(tag => !selectedTags.includes(tag.id)).map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>
                          {tag.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <div className="flex gap-2 items-end pt-2">
                    <div className="flex-1">
                      <Label htmlFor="new-tag-name" className="text-sm text-muted-foreground">
                        Or create new tag
                      </Label>
                      <Input
                        id="new-tag-name"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="Enter new tag name..."
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCreateTag();
                          }
                        }}
                        data-testid="input-new-tag-name"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={handleCreateTag}
                      disabled={createTagMutation.isPending || !newTagName.trim()}
                      data-testid="button-create-tag"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Tag
                    </Button>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false);
                      setEditingContact(null);
                    }}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit-contact"
                  >
                    {editingContact ? "Update Contact" : "Create Contact"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts by name, email, or company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-search-contacts"
            />
          </div>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-48" data-testid="select-filter-type">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
              <SelectItem value="contractor">Contractor</SelectItem>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="company">Company</SelectItem>
              <SelectItem value="partner">Partner</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
              <SelectItem value="tenant">Tenant</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterTag} onValueChange={setFilterTag}>
            <SelectTrigger className="w-48" data-testid="select-filter-tag">
              <SelectValue placeholder="Filter by tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {allTags?.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!filteredContacts || filteredContacts.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {searchTerm || filterType !== "all" ? "No Contacts Found" : "No Contacts Yet"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm || filterType !== "all"
                  ? "Try adjusting your search or filters"
                  : "Get started by adding your first contact"}
              </p>
              {!searchTerm && filterType === "all" && (
                <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first-contact">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Contact
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredContacts.map((contact) => (
              <Card key={contact.id} className="hover-elevate" data-testid={`card-contact-${contact.id}`}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar>
                        <AvatarImage src={contact.profileImageUrl || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {getInitials(contact.firstName, contact.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate" data-testid={`text-name-${contact.id}`}>
                          {contact.firstName} {contact.lastName}
                        </h3>
                        <Badge
                          variant={contactTypeBadgeVariants[contact.type]}
                          className="mt-1"
                          data-testid={`badge-type-${contact.id}`}
                        >
                          {contactTypeLabels[contact.type]}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditingContact(contact);
                          setSelectedTags(contact.tags?.map(t => t.id) || []);
                          // Combine country code and phone for PhoneInput
                          const combinedPhone = combinePhoneNumber(
                            contact.countryCode || defaultPhoneCode,
                            contact.phone || ""
                          );
                          setPhoneValue(combinedPhone);
                          setDialogOpen(true);
                        }}
                        data-testid={`button-edit-${contact.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this contact?")) {
                            deleteMutation.mutate(contact.id);
                          }
                        }}
                        data-testid={`button-delete-${contact.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    {contact.companyName && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Building2 className="w-4 h-4 shrink-0" />
                        <span className="truncate">{contact.companyName}</span>
                      </div>
                    )}

                    {contact.jobTitle && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Briefcase className="w-4 h-4 shrink-0" />
                        <span className="truncate">{contact.jobTitle}</span>
                      </div>
                    )}

                    {contact.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-4 h-4 shrink-0" />
                        <span className="truncate" data-testid={`text-email-${contact.id}`}>
                          {contact.email}
                        </span>
                      </div>
                    )}

                    {contact.phone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-4 h-4 shrink-0" />
                        <span className="truncate" data-testid={`text-phone-${contact.id}`}>
                          {contact.phone}
                        </span>
                      </div>
                    )}

                    {contact.city && contact.state && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-4 h-4 shrink-0" />
                        <span className="truncate">
                          {contact.city}, {contact.state}
                        </span>
                      </div>
                    )}

                    {contact.website && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Globe className="w-4 h-4 shrink-0" />
                        <a
                          href={contact.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate hover:text-primary transition-colors"
                        >
                          {contact.website}
                        </a>
                      </div>
                    )}
                  </div>

                  {contact.tags && contact.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2 border-t">
                      {contact.tags.map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="secondary"
                          className="text-xs"
                          style={{
                            borderColor: tag.color || undefined,
                            backgroundColor: tag.color ? `${tag.color}15` : undefined,
                          }}
                          data-testid={`badge-tag-${tag.id}`}
                        >
                          <Tag className="w-3 h-3 mr-1" />
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
