import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Users, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { pagePad } from "@/lib/responsive";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";

type Member = {
  id: string;
  email: string;
  membershipStatus: string;
  canManageTeam: boolean;
  createdAt: string | null;
  activatedAt: string | null;
  removedAt: string | null;
};

export default function AdminFeedbackTeam() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [canManageTeam, setCanManageTeam] = useState(false);

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ["/api/admin/feedback/team"],
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/feedback/team", {
        email: email.trim().toLowerCase(),
        canManageTeam,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback/team"] });
      setOpen(false);
      setEmail("");
      setCanManageTeam(false);
      toast({ title: "Member added" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not add member", description: e.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/feedback/team/${memberId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback/team"] });
      toast({ title: "Member removed" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not remove", description: e.message, variant: "destructive" }),
  });

  const active = members.filter((m) => m.membershipStatus === "active" && !m.removedAt);

  return (
    <div className={pagePad}>
      <PageHeader
        icon={Users}
        title="Feature Admin Team"
        description="Membership grants Feedback inbox access only — not full Eco-Admin powers."
        className="mb-6"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/feedback">Back to Inbox</Link>
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add member
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {active.length} active · cannot remove the last team manager
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-muted-foreground">Loading…</p>
          ) : members.length === 0 ? (
            <p className="p-6 text-muted-foreground">No members yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Can manage team</TableHead>
                    <TableHead>Activated</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id} className={m.removedAt ? "opacity-50" : undefined}>
                      <TableCell className="font-medium">{m.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{m.membershipStatus}</Badge>
                      </TableCell>
                      <TableCell>{m.canManageTeam ? "Yes" : "No"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.activatedAt ? format(new Date(m.activatedAt), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        {m.membershipStatus === "active" && !m.removedAt && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeMutation.mutate(m.id)}
                            disabled={removeMutation.isPending}
                            aria-label={`Remove ${m.email}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Feature Admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="fa-email">Email</Label>
              <Input
                id="fa-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={canManageTeam}
                onCheckedChange={(v) => setCanManageTeam(Boolean(v))}
              />
              Can manage Feature Admin Team
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!email.includes("@") || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              {addMutation.isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
