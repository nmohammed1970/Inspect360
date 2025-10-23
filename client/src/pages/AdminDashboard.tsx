import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Shield, Search, Building2, LogOut, Users, CreditCard, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [editDialog, setEditDialog] = useState(false);
  const [editFormData, setEditFormData] = useState({
    subscriptionLevel: "",
    creditsRemaining: 0,
    isActive: true,
  });

  // Fetch admin user
  const { data: adminUser } = useQuery({
    queryKey: ["/api/admin/me"],
    retry: false,
  });

  // Fetch instances
  const { data: instances = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/instances"],
    retry: false,
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      navigate("/admin/login");
    },
  });

  // Update instance mutation
  const updateInstanceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await fetch(`/api/admin/instances/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to update instance");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/instances"] });
      setEditDialog(false);
      toast({
        title: "Instance Updated",
        description: "Instance settings have been updated successfully",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Failed to update instance settings",
      });
    },
  });

  // Toggle status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/instances/${id}/toggle-status`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to toggle status");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/instances"] });
      toast({
        title: "Status Updated",
        description: "Instance status has been toggled successfully",
      });
    },
  });

  // Filter instances based on search
  const filteredInstances = instances.filter(
    (instance) =>
      instance.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      instance.owner?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      instance.owner?.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      instance.owner?.lastName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEditClick = (instance: any) => {
    setSelectedInstance(instance);
    setEditFormData({
      subscriptionLevel: instance.subscriptionLevel || "free",
      creditsRemaining: instance.creditsRemaining || 0,
      isActive: instance.isActive !== false,
    });
    setEditDialog(true);
  };

  const handleEditSubmit = () => {
    if (selectedInstance) {
      updateInstanceMutation.mutate({
        id: selectedInstance.id,
        data: editFormData,
      });
    }
  };

  if (!adminUser) {
    navigate("/admin/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold" data-testid="heading-admin-dashboard">Admin Dashboard</h1>
              <p className="text-sm text-muted-foreground">Inspect360 Platform Administration</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {adminUser.firstName} {adminUser.lastName}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/admin/team")}
              data-testid="button-admin-team"
            >
              <Users className="w-4 h-4 mr-2" />
              Admin Team
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => logoutMutation.mutate()}
              data-testid="button-admin-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Search Bar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Registered Instances
            </CardTitle>
            <CardDescription>
              Monitor and manage all registered organizations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by organization name, owner name, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-instances"
              />
            </div>
          </CardContent>
        </Card>

        {/* Instances Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading instances...
                    </TableCell>
                  </TableRow>
                ) : filteredInstances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No instances found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInstances.map((instance) => (
                    <TableRow key={instance.id} data-testid={`row-instance-${instance.id}`}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{instance.name}</div>
                          <div className="text-xs text-muted-foreground">{instance.id}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {instance.owner?.firstName} {instance.owner?.lastName}
                          </div>
                          <div className="text-xs text-muted-foreground">{instance.owner?.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {instance.subscriptionLevel || "free"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-muted-foreground" />
                          {instance.creditsRemaining || 0}
                        </div>
                      </TableCell>
                      <TableCell>
                        {instance.isActive !== false ? (
                          <Badge variant="default" className="flex items-center gap-1 w-fit">
                            <CheckCircle className="w-3 h-3" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                            <XCircle className="w-3 h-3" />
                            Disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(instance.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditClick(instance)}
                          data-testid={`button-edit-${instance.id}`}
                        >
                          Edit
                        </Button>
                        <Button
                          variant={instance.isActive !== false ? "destructive" : "default"}
                          size="sm"
                          onClick={() => toggleStatusMutation.mutate(instance.id)}
                          disabled={toggleStatusMutation.isPending}
                          data-testid={`button-toggle-${instance.id}`}
                        >
                          {instance.isActive !== false ? "Disable" : "Enable"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent data-testid="dialog-edit-instance">
          <DialogHeader>
            <DialogTitle>Edit Instance Settings</DialogTitle>
            <DialogDescription>
              Update subscription level, credits, and status for {selectedInstance?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Subscription Level</Label>
              <Select
                value={editFormData.subscriptionLevel}
                onValueChange={(value) =>
                  setEditFormData({ ...editFormData, subscriptionLevel: value })
                }
              >
                <SelectTrigger data-testid="select-subscription-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Credits Remaining</Label>
              <Input
                type="number"
                value={editFormData.creditsRemaining}
                onChange={(e) =>
                  setEditFormData({
                    ...editFormData,
                    creditsRemaining: parseInt(e.target.value) || 0,
                  })
                }
                data-testid="input-credits"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isActive"
                checked={editFormData.isActive}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, isActive: e.target.checked })
                }
                className="w-4 h-4"
                data-testid="checkbox-is-active"
              />
              <Label htmlFor="isActive">Instance Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={updateInstanceMutation.isPending}
              data-testid="button-save-instance"
            >
              {updateInstanceMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
