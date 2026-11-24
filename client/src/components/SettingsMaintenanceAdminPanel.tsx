import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, Plus, Trash2, UserCog } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getTeamRoleDisplayLabel } from "@shared/roleLabels";
import type { User } from "@shared/schema";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dialogContentBase } from "@/lib/responsive";
import { cn } from "@/lib/utils";

const TEAM_QUERY_KEY = ["/api/team"] as const;

export default function SettingsMaintenanceAdminPanel() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [removing, setRemoving] = useState<User | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const { data: team = [], isLoading } = useQuery<User[]>({
    queryKey: TEAM_QUERY_KEY,
  });

  const admins = useMemo(
    () => team.filter((u) => u.role === "maintenance_admin"),
    [team],
  );

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setUsername("");
    setPassword("");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/team", {
        email: email.trim(),
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        username: username.trim(),
        password,
        role: "maintenance_admin",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
      toast({
        title: "Maintenance admin added",
        description: "They will be notified when maintenance requests are logged.",
      });
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Could not add maintenance admin",
        description: error.message || "Failed to create user",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/team/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
      toast({ title: "Maintenance admin removed" });
      setRemoving(null);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Could not remove user",
        description: error.message || "Failed to remove user",
      });
    },
  });

  const handleCreate = () => {
    if (!email.trim() || !username.trim() || password.length < 6) {
      toast({
        variant: "destructive",
        title: "Missing fields",
        description: "Email, username, and a password of at least 6 characters are required.",
      });
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Maintenance Admin
            </CardTitle>
            <CardDescription>
              Invite admins scoped to maintenance only. They receive email when a
              maintenance request is logged, and can manage requests, work orders,
              quotes, invoices, and the price book — not billing or other modules.
            </CardDescription>
          </div>
          <Button
            onClick={() => setIsCreateOpen(true)}
            data-testid="button-add-maintenance-admin"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add admin
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground mb-4">
            <Bell className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              Every active maintenance admin with an email address is notified when
              a new maintenance request is created.
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No maintenance admins yet. Add someone to start receiving notifications.
                      </TableCell>
                    </TableRow>
                  ) : (
                    admins.map((admin) => (
                      <TableRow key={admin.id}>
                        <TableCell className="font-medium">
                          {[admin.firstName, admin.lastName].filter(Boolean).join(" ") || "—"}
                        </TableCell>
                        <TableCell>{admin.email || "—"}</TableCell>
                        <TableCell>{admin.username || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={admin.isActive === false ? "secondary" : "outline"}>
                            {admin.isActive === false ? "Inactive" : "Active"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setRemoving(admin)}
                            data-testid={`button-remove-maintenance-admin-${admin.id}`}
                            title="Remove"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className={cn(dialogContentBase, "max-w-md")}>
          <DialogHeader>
            <DialogTitle>Add maintenance admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ma-first">First name</Label>
                <Input
                  id="ma-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  data-testid="input-ma-first-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ma-last">Last name</Label>
                <Input
                  id="ma-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  data-testid="input-ma-last-name"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ma-email" required>
                Email
              </Label>
              <Input
                id="ma-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-ma-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ma-username" required>
                Username
              </Label>
              <Input
                id="ma-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                data-testid="input-ma-username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ma-password" required>
                Password
              </Label>
              <Input
                id="ma-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="input-ma-password"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Role: {getTeamRoleDisplayLabel("maintenance_admin")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              data-testid="button-submit-maintenance-admin"
            >
              {createMutation.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Remove maintenance admin?"
        description={
          removing
            ? `Remove ${removing.email || removing.username || "this user"} from the organization?`
            : undefined
        }
        onConfirm={() => {
          if (removing) deleteMutation.mutate(removing.id);
        }}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
