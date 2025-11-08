import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit2, Trash2, Users, Mail, X } from "lucide-react";
import { z } from "zod";
import type { InspectionCategory } from "@shared/schema";

// Team schema
const teamFormSchema = z.object({
  name: z.string().min(1, "Team name is required"),
  description: z.string().optional(),
  email: z.string().email("Valid email is required"),
  isActive: z.boolean().default(true),
  userIds: z.array(z.string()).default([]),
  contactIds: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
});

type TeamFormValues = z.infer<typeof teamFormSchema>;

interface Team {
  id: string;
  name: string;
  description: string | null;
  email: string;
  isActive: boolean;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface TeamMember {
  id: string;
  teamId: string;
  userId: string | null;
  contactId: string | null;
  role: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  } | null;
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    type: string;
  } | null;
}

interface TeamCategory {
  id: string;
  teamId: string;
  category: string;
}

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  type: string;
}

export default function SettingsTeamsPanel() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);

  // Fetch teams
  const { data: teams = [], isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ['/api/teams'],
  });

  // Fetch users (organization members)
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  // Fetch contacts (contractors)
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ['/api/contacts'],
  });

  // Fetch inspection categories
  const { data: inspectionCategories = [] } = useQuery<InspectionCategory[]>({
    queryKey: ['/api/inspection-categories'],
  });

  // Create team mutation - uses single atomic endpoint
  const createMutation = useMutation({
    mutationFn: async (data: TeamFormValues) => {
      // Single server-side transactional create
      return await apiRequest("POST", "/api/teams/full", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      toast({
        title: "Success",
        description: "Team created successfully",
      });
      setIsCreateDialogOpen(false);
      createForm.reset();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create team",
      });
    },
  });

  // Update team mutation - uses single atomic endpoint
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TeamFormValues }) => {
      // Single server-side transactional update
      return await apiRequest("PATCH", `/api/teams/${id}/full`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      toast({
        title: "Success",
        description: "Team updated successfully",
      });
      setEditingTeam(null);
      editForm.reset();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update team",
      });
    },
  });

  // Delete team mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/teams/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      toast({
        title: "Success",
        description: "Team deleted successfully",
      });
      setDeletingTeam(null);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete team",
      });
    },
  });

  const createForm = useForm<TeamFormValues>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: {
      name: "",
      description: "",
      email: "",
      isActive: true,
      userIds: [],
      contactIds: [],
      categories: [],
    },
  });

  const editForm = useForm<TeamFormValues>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: {
      name: "",
      description: "",
      email: "",
      isActive: true,
      userIds: [],
      contactIds: [],
      categories: [],
    },
  });

  // Load team data when editing
  const loadTeamForEdit = async (team: Team) => {
    const members: any = await apiRequest("GET", `/api/teams/${team.id}/members`);
    const categories: any = await apiRequest("GET", `/api/teams/${team.id}/categories`);
    
    editForm.reset({
      name: team.name,
      description: team.description || "",
      email: team.email,
      isActive: team.isActive,
      userIds: members.filter((m: any) => m.userId).map((m: any) => m.userId!),
      contactIds: members.filter((m: any) => m.contactId).map((m: any) => m.contactId!),
      categories: categories.map((c: any) => c.category),
    });
    
    setEditingTeam(team);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Teams</h2>
          <p className="text-muted-foreground">
            Manage work order teams and email distribution lists
          </p>
        </div>
        <Button 
          onClick={() => setIsCreateDialogOpen(true)} 
          data-testid="button-create-team"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Team
        </Button>
      </div>

      {teamsLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-1/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : teams.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No teams yet</p>
            <p className="text-muted-foreground mb-4">
              Create your first team to manage work order assignments
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-team">
              <Plus className="h-4 w-4 mr-2" />
              Create Team
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {teams.map((team) => (
            <Card key={team.id} data-testid={`card-team-${team.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <CardTitle className="text-lg" data-testid={`text-team-name-${team.id}`}>
                        {team.name}
                      </CardTitle>
                      {!team.isActive && (
                        <Badge variant="secondary" data-testid={`badge-team-inactive-${team.id}`}>
                          Inactive
                        </Badge>
                      )}
                    </div>
                    {team.description && (
                      <CardDescription data-testid={`text-team-description-${team.id}`}>
                        {team.description}
                      </CardDescription>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        <span data-testid={`text-team-email-${team.id}`}>{team.email}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span data-testid={`text-team-member-count-${team.id}`}>
                          {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => loadTeamForEdit(team)}
                      data-testid={`button-edit-team-${team.id}`}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletingTeam(team)}
                      data-testid={`button-delete-team-${team.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Create Team Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-create-team">
          <DialogHeader>
            <DialogTitle>Create Team</DialogTitle>
            <DialogDescription>
              Create a team for work order management with email distribution list
            </DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Maintenance Team" data-testid="input-team-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Team description" data-testid="input-team-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Distribution Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="team@example.com" data-testid="input-team-email" />
                    </FormControl>
                    <FormDescription>
                      Work order notifications will be sent to this email
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="userIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team Members (Staff)</FormLabel>
                    <div className="space-y-2">
                      {users.map((user) => (
                        <div key={user.id} className="flex items-center space-x-2">
                          <Checkbox
                            checked={field.value?.includes(user.id)}
                            onCheckedChange={(checked) => {
                              const updatedValue = checked
                                ? [...(field.value || []), user.id]
                                : (field.value || []).filter((id) => id !== user.id);
                              field.onChange(updatedValue);
                            }}
                            data-testid={`checkbox-user-${user.id}`}
                          />
                          <Label className="font-normal cursor-pointer">
                            {user.firstName} {user.lastName} ({user.email})
                          </Label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="contactIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team Members (Contractors)</FormLabel>
                    <div className="space-y-2">
                      {contacts.filter(c => c.type === 'contractor').map((contact) => (
                        <div key={contact.id} className="flex items-center space-x-2">
                          <Checkbox
                            checked={field.value?.includes(contact.id)}
                            onCheckedChange={(checked) => {
                              const updatedValue = checked
                                ? [...(field.value || []), contact.id]
                                : (field.value || []).filter((id) => id !== contact.id);
                              field.onChange(updatedValue);
                            }}
                            data-testid={`checkbox-contact-${contact.id}`}
                          />
                          <Label className="font-normal cursor-pointer">
                            {contact.firstName} {contact.lastName} ({contact.email})
                          </Label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="categories"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Maintenance Categories</FormLabel>
                    <FormDescription>
                      Assign categories to auto-route work orders to this team
                    </FormDescription>
                    <div className="space-y-2">
                      {inspectionCategories.map((category) => (
                        <div key={category.id} className="flex items-center space-x-2">
                          <Checkbox
                            checked={field.value?.includes(category.name)}
                            onCheckedChange={(checked) => {
                              const updatedValue = checked
                                ? [...(field.value || []), category.name]
                                : (field.value || []).filter((name) => name !== category.name);
                              field.onChange(updatedValue);
                            }}
                            data-testid={`checkbox-category-${category.id}`}
                          />
                          <Label className="font-normal cursor-pointer">
                            {category.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-team-active"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Active</FormLabel>
                      <FormDescription>
                        Only active teams can be assigned work orders
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                  data-testid="button-cancel-create-team"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending}
                  data-testid="button-submit-create-team"
                >
                  {createMutation.isPending ? "Creating..." : "Create Team"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Team Dialog */}
      <Dialog open={!!editingTeam} onOpenChange={(open) => !open && setEditingTeam(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-edit-team">
          <DialogHeader>
            <DialogTitle>Edit Team</DialogTitle>
            <DialogDescription>
              Update team details and assignments
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form 
              onSubmit={editForm.handleSubmit((data) => editingTeam && updateMutation.mutate({ id: editingTeam.id, data }))} 
              className="space-y-4"
            >
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Maintenance Team" data-testid="input-edit-team-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Team description" data-testid="input-edit-team-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Distribution Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="team@example.com" data-testid="input-edit-team-email" />
                    </FormControl>
                    <FormDescription>
                      Work order notifications will be sent to this email
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="userIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team Members (Staff)</FormLabel>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {users.map((user) => (
                        <div key={user.id} className="flex items-center space-x-2">
                          <Checkbox
                            checked={field.value?.includes(user.id)}
                            onCheckedChange={(checked) => {
                              const updatedValue = checked
                                ? [...(field.value || []), user.id]
                                : (field.value || []).filter((id) => id !== user.id);
                              field.onChange(updatedValue);
                            }}
                            data-testid={`checkbox-edit-user-${user.id}`}
                          />
                          <Label className="font-normal cursor-pointer">
                            {user.firstName} {user.lastName} ({user.email})
                          </Label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="contactIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team Members (Contractors)</FormLabel>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {contacts.filter(c => c.type === 'contractor').map((contact) => (
                        <div key={contact.id} className="flex items-center space-x-2">
                          <Checkbox
                            checked={field.value?.includes(contact.id)}
                            onCheckedChange={(checked) => {
                              const updatedValue = checked
                                ? [...(field.value || []), contact.id]
                                : (field.value || []).filter((id) => id !== contact.id);
                              field.onChange(updatedValue);
                            }}
                            data-testid={`checkbox-edit-contact-${contact.id}`}
                          />
                          <Label className="font-normal cursor-pointer">
                            {contact.firstName} {contact.lastName} ({contact.email})
                          </Label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="categories"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Maintenance Categories</FormLabel>
                    <FormDescription>
                      Assign categories to auto-route work orders to this team
                    </FormDescription>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {inspectionCategories.map((category) => (
                        <div key={category.id} className="flex items-center space-x-2">
                          <Checkbox
                            checked={field.value?.includes(category.name)}
                            onCheckedChange={(checked) => {
                              const updatedValue = checked
                                ? [...(field.value || []), category.name]
                                : (field.value || []).filter((name) => name !== category.name);
                              field.onChange(updatedValue);
                            }}
                            data-testid={`checkbox-edit-category-${category.id}`}
                          />
                          <Label className="font-normal cursor-pointer">
                            {category.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-edit-team-active"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Active</FormLabel>
                      <FormDescription>
                        Only active teams can be assigned work orders
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingTeam(null)}
                  data-testid="button-cancel-edit-team"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateMutation.isPending}
                  data-testid="button-submit-edit-team"
                >
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingTeam} onOpenChange={(open) => !open && setDeletingTeam(null)}>
        <DialogContent data-testid="dialog-delete-team">
          <DialogHeader>
            <DialogTitle>Delete Team</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingTeam?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingTeam(null)}
              data-testid="button-cancel-delete-team"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingTeam && deleteMutation.mutate(deletingTeam.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-team"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
