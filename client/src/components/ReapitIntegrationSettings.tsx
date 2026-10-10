import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Link as LinkIcon, RefreshCw } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ReapitConnectionStatus = {
  status: string;
  reapitCustomerId: string | null;
  lastError: string | null;
  connectedAt: string | null;
  lastSync: {
    id: string;
    type: string;
    status: string;
    countersJson?: Record<string, number>;
    errorMessage?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
    createdAt?: string | null;
  } | null;
  counts: Record<string, number>;
  configured: boolean;
};

type ReapitSyncRun = {
  id: string;
  type: string;
  status: string;
  countersJson?: Record<string, number> | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string | null;
};

export default function ReapitIntegrationSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";

  const { data, isLoading } = useQuery<ReapitConnectionStatus>({
    queryKey: ["/api/reapit/connection"],
  });

  const { data: runs = [] } = useQuery<ReapitSyncRun[]>({
    queryKey: ["/api/reapit/sync-runs"],
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/reapit/connect");
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (payload) => {
      if (payload.url) window.location.href = payload.url;
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Cannot connect Reapit", description: error.message });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/reapit/sync"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reapit/connection"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reapit/sync-runs"] });
      toast({ title: "Sync queued", description: "Reapit sync has been started." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Sync failed", description: error.message });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/reapit/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reapit/connection"] });
      toast({ title: "Reapit disconnected", description: "Inspect360 records were kept." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Disconnect failed", description: error.message });
    },
  });

  const connected = data?.status === "connected";
  const counts = data?.counts || {};

  return (
    <Card data-testid="card-reapit-integration">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5" />
              Reapit
            </CardTitle>
            <CardDescription>
              One-way sync of lettings properties, landlords, contacts, and tenancies from Reapit Foundations.
            </CardDescription>
          </div>
          <Badge variant={connected ? "default" : "outline"} data-testid="badge-reapit-status">
            {data?.status || "disconnected"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading Reapit connection…</p>
        ) : (
          <>
            {!data?.configured && (
              <p className="text-sm text-muted-foreground">
                Reapit app credentials are not configured on this server.
              </p>
            )}
            {data?.reapitCustomerId && (
              <p className="text-sm text-muted-foreground" data-testid="text-reapit-customer">
                Customer: {data.reapitCustomerId}
              </p>
            )}
            {data?.lastSync && (
              <p className="text-sm text-muted-foreground" data-testid="text-reapit-last-sync">
                Last sync: {data.lastSync.status}
                {data.lastSync.finishedAt ? ` · ${new Date(data.lastSync.finishedAt).toLocaleString()}` : ""}
              </p>
            )}
            {data?.lastError && (
              <p className="text-sm text-destructive">{data.lastError}</p>
            )}
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">Properties {counts.property || 0}</Badge>
              <Badge variant="secondary">Contacts {counts.contact || 0}</Badge>
              <Badge variant="secondary">Landlords {counts.landlord || 0}</Badge>
              <Badge variant="secondary">Tenancies {counts.tenancy || 0}</Badge>
            </div>
            {isOwner && (
              <div className="flex flex-wrap gap-2">
                {!connected && (
                  <Button
                    onClick={() => connectMutation.mutate()}
                    disabled={connectMutation.isPending || !data?.configured}
                    data-testid="button-reapit-connect"
                  >
                    Connect Reapit
                  </Button>
                )}
                {connected && (
                  <Button
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                    data-testid="button-reapit-sync"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync now
                  </Button>
                )}
                {connected && (
                  <Button
                    variant="outline"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    data-testid="button-reapit-disconnect"
                  >
                    Disconnect
                  </Button>
                )}
              </div>
            )}
            {runs.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.slice(0, 8).map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>{run.type}</TableCell>
                      <TableCell>{run.status}</TableCell>
                      <TableCell>
                        {run.finishedAt || run.startedAt || run.createdAt
                          ? new Date(run.finishedAt || run.startedAt || run.createdAt || "").toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {run.errorMessage || JSON.stringify(run.countersJson || {})}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
