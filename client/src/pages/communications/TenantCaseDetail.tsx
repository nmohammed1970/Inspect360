import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { pagePad } from "@/lib/responsive";
import { priorityTone, publicCaseStatusTone } from "@shared/statusPriorityStyles";

type PublicCase = {
  id: string;
  reference: string;
  subject: string;
  publicStatus: string;
  priority: string;
  summary?: string | null;
  messages: Array<{
    id: string;
    body: string;
    direction: string;
    channel: string;
    createdAt?: string | null;
    authorNameSnapshot?: string | null;
  }>;
};

export default function TenantCaseDetail() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [reply, setReply] = useState("");

  const query = useQuery<PublicCase>({
    queryKey: ["/api/communications/tenant/cases", params.id],
    enabled: !!params.id,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/communications/tenant/cases/${params.id}`);
      return res.json();
    },
  });

  const replyMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest(
        "POST",
        `/api/communications/tenant/cases/${params.id}/messages`,
        { body },
      );
      return res.json();
    },
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({
        queryKey: ["/api/communications/tenant/cases", params.id],
      });
      toast({ title: "Reply sent" });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const issuePersists = () => {
    const text =
      "The issue is still ongoing / has not been resolved from my perspective.";
    replyMutation.mutate(reply.trim() ? `${reply.trim()}\n\n${text}` : text);
  };

  const c = query.data;

  if (query.isLoading) {
    return (
      <div className={cn("container mx-auto", pagePad)}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!c) {
    return (
      <div className={cn("container mx-auto", pagePad)}>
        <p className="text-sm text-muted-foreground">Request not found</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/tenant/requests">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("container mx-auto max-w-2xl space-y-4", pagePad)}>
      <PageHeader
        icon={MessageSquare}
        title={c.subject}
        description={c.reference}
        actions={
          <Button variant="outline" asChild>
            <Link href="/tenant/requests">All requests</Link>
          </Button>
        }
      />
      <div className="flex gap-2">
        <StatusBadge tone={publicCaseStatusTone(c.publicStatus)}>{c.publicStatus}</StatusBadge>
        <StatusBadge tone={priorityTone(c.priority)}>{c.priority}</StatusBadge>
      </div>
      <div className="rounded-lg border border-border/80 bg-card p-3 space-y-3 max-h-[24rem] overflow-y-auto">
        {(c.messages || []).map((m) => (
          <div
            key={m.id}
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              m.direction === "inbound" ? "bg-muted/40" : "bg-primary/5",
            )}
          >
            <div className="text-xs text-muted-foreground mb-1">
              {m.authorNameSnapshot || m.direction}
              {m.createdAt
                ? ` · ${format(new Date(m.createdAt), "dd MMM yyyy HH:mm")}`
                : ""}
            </div>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
        {!c.messages?.length ? (
          <p className="text-sm text-muted-foreground">{c.summary || "No messages yet."}</p>
        ) : null}
      </div>
      <Textarea
        placeholder="Add a reply or upload evidence notes…"
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        rows={3}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="brand"
          disabled={!reply.trim() || replyMutation.isPending}
          onClick={() => replyMutation.mutate(reply)}
        >
          Send reply
        </Button>
        <Button
          variant="outline"
          disabled={replyMutation.isPending}
          onClick={issuePersists}
          data-testid="button-issue-persists"
        >
          Issue still persists
        </Button>
      </div>
    </div>
  );
}
