import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type CreditRequestRow = {
  id: string;
  organizationName: string;
  requesterName: string;
  requesterEmail: string;
  creditsRequested: number;
  message: string;
  status: "REQUESTED" | "GRANTED";
  emailStatus: "pending" | "sent" | "failed";
  emailError: string | null;
  createdAt: string;
  grantedAt: string | null;
};

type ListResponse = {
  requests: CreditRequestRow[];
  page: number;
  pageSize: number;
  total: number;
};

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "GRANTED") return <Badge variant="success">GRANTED</Badge>;
  return <Badge variant="warning">REQUESTED</Badge>;
}

export default function AdminCreditRequests() {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmGrant, setConfirmGrant] = useState(false);

  const listQuery = useQuery<ListResponse>({
    queryKey: ["/api/admin/credit-requests", q, status, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      const res = await apiRequest("GET", `/api/admin/credit-requests?${params}`);
      return res.json();
    },
    retry: false,
  });

  const detailQuery = useQuery<CreditRequestRow>({
    queryKey: ["/api/admin/credit-requests", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/credit-requests/${selectedId}`);
      return res.json();
    },
  });

  const grant = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/credit-requests/${id}/grant`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Request marked as granted" });
      setConfirmGrant(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credit-requests"] });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Could not update request", description: error.message });
    },
  });

  const rows = listQuery.data?.requests ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageSize = listQuery.data?.pageSize ?? 25;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const selected = detailQuery.data;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Credit Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">Review requests to buy credits. Marking a request granted does not add credits.</p>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label htmlFor="credit-request-search" className="text-sm font-medium">Search</label>
            <Input
              id="credit-request-search"
              value={q}
              placeholder="Organization, name, or email"
              onChange={(event) => { setQ(event.target.value); setPage(1); }}
            />
          </div>
          <div className="flex gap-2" role="group" aria-label="Filter by status">
            {[
              ["", "All"],
              ["REQUESTED", "Requested"],
              ["GRANTED", "Granted"],
            ].map(([value, label]) => (
              <Button
                key={label}
                type="button"
                size="sm"
                variant={status === value ? "default" : "outline"}
                onClick={() => { setStatus(value); setPage(1); }}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {listQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading credit requests</div>
      ) : listQuery.isError ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <p>Unable to load credit requests.</p>
            <Button type="button" variant="outline" onClick={() => listQuery.refetch()}>Try again</Button>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">No credit requests have been submitted yet.</CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelectedId(row.id)}>
                  <TableCell>{row.organizationName}</TableCell>
                  <TableCell>{row.requesterName}</TableCell>
                  <TableCell>{row.creditsRequested}</TableCell>
                  <TableCell>{formatWhen(row.createdAt)}</TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button type="button" size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); setSelectedId(row.id); }}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {total > pageSize ? (
        <div className="flex items-center justify-between text-sm">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button>
            <Button type="button" size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Next</Button>
          </div>
        </div>
      ) : null}

      <Dialog open={!!selectedId} onOpenChange={(open) => { if (!open) { setSelectedId(null); setConfirmGrant(false); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Credit Request</DialogTitle>
            <DialogDescription>Submitted details. Granting this request does not add credits to the organization.</DialogDescription>
          </DialogHeader>
          {detailQuery.isLoading || !selected ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading</div>
          ) : (
            <div className="space-y-3 text-sm">
              <p><span className="text-muted-foreground">Organization</span><br />{selected.organizationName}</p>
              <p><span className="text-muted-foreground">Requested By</span><br />{selected.requesterName}</p>
              <p><span className="text-muted-foreground">Email</span><br />{selected.requesterEmail}</p>
              <p><span className="text-muted-foreground">Credits Requested</span><br />{selected.creditsRequested}</p>
              <p><span className="text-muted-foreground">Request Date</span><br />{formatWhen(selected.createdAt)}</p>
              <p><span className="text-muted-foreground">Status</span><br /><StatusBadge status={selected.status} /></p>
              <p><span className="text-muted-foreground">Notification</span><br />{selected.emailStatus === "sent" ? "Sent" : selected.emailStatus === "failed" ? "Failed" : "Pending"}{selected.emailStatus === "failed" && selected.emailError ? ` — ${selected.emailError}` : ""}</p>
              <p className="whitespace-pre-wrap"><span className="text-muted-foreground">Message</span><br />{selected.message}</p>
            </div>
          )}
          <DialogFooter>
            {selected?.status === "REQUESTED" ? (
              <Button type="button" onClick={() => setConfirmGrant(true)}>Mark as Granted</Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmGrant} onOpenChange={setConfirmGrant}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as granted?</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to mark this credit request as granted?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={grant.isPending}>Cancel</AlertDialogCancel>
            <Button type="button" disabled={grant.isPending || !selectedId} onClick={() => selectedId && grant.mutate(selectedId)}>
              {grant.isPending ? "Submitting..." : "Mark as Granted"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
