import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import {
  CheckSquare,
  Link2,
  MessageSquare,
  NotebookPen,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { pagePad, tabsListScroll } from "@/lib/responsive";
import {
  communicationCaseStatusTone,
  priorityTone,
} from "@shared/statusPriorityStyles";

type CaseDetail = {
  case: {
    id: string;
    reference: string;
    subject: string;
    status: string;
    priority: string;
    version: number;
    summary?: string | null;
    ownerUserId?: string | null;
    propertyId?: string | null;
    tenantId?: string | null;
    aiSuggestionJson?: any;
    firstResponseDueAt?: string | null;
    resolutionDueAt?: string | null;
    resolutionSummary?: string | null;
  };
  category?: { id: string; key: string; label: string; approvalPolicy: string } | null;
  messages: Array<{
    id: string;
    body: string;
    visibility: string;
    channel: string;
    direction: string;
    authorNameSnapshot?: string | null;
    createdAt?: string | null;
  }>;
  actions: Array<{
    id: string;
    title: string;
    status: string;
    required: boolean;
  }>;
  approvals: Array<{
    id: string;
    decision?: string | null;
    type: string;
    reason?: string | null;
    createdAt?: string | null;
  }>;
  links: Array<{
    id: string;
    entityType: string;
    entityId: string;
    relationship: string;
  }>;
};

function stamp(iso?: string | null) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "dd MMM yyyy HH:mm");
  } catch {
    return "";
  }
}

export default function CaseWorkspace() {
  const params = useParams<{ id: string }>();
  const caseId = params.id;
  const { user } = useAuth();
  const { toast } = useToast();
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [actionTitle, setActionTitle] = useState("");
  const [channelSummary, setChannelSummary] = useState("");
  const [channel, setChannel] = useState<"phone" | "email" | "whatsapp">("phone");
  const [resolveSummary, setResolveSummary] = useState("");

  const detailQuery = useQuery<CaseDetail>({
    queryKey: ["/api/communications/cases", caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/communications/cases/${caseId}`);
      return res.json();
    },
  });

  const auditQuery = useQuery<any[]>({
    queryKey: ["/api/communications/cases", caseId, "audit"],
    enabled: !!caseId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/communications/cases/${caseId}/audit`);
      return res.json();
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/communications/cases", caseId] });
    queryClient.invalidateQueries({ queryKey: ["/api/communications/cases"] });
    queryClient.invalidateQueries({ queryKey: ["/api/communications/metrics"] });
    queryClient.invalidateQueries({ queryKey: ["/api/communications/cases", caseId, "audit"] });
  };

  const replyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/communications/cases/${caseId}/messages`, {
        body: reply,
      });
      return res.json();
    },
    onSuccess: () => {
      setReply("");
      toast({ title: "Reply sent" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const noteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/communications/cases/${caseId}/notes`, {
        body: note,
      });
      return res.json();
    },
    onSuccess: () => {
      setNote("");
      toast({ title: "Internal note saved" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/communications/cases/${caseId}/assign`, {
        version: detailQuery.data?.case.version,
        ownerUserId: user?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Assigned to you" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const actionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/communications/cases/${caseId}/actions`, {
        title: actionTitle,
      });
      return res.json();
    },
    onSuccess: () => {
      setActionTitle("");
      toast({ title: "Action added" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const completeActionMutation = useMutation({
    mutationFn: async (actionId: string) => {
      const res = await apiRequest(
        "PATCH",
        `/api/communications/cases/${caseId}/actions/${actionId}`,
        { status: "completed" },
      );
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  const approvalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/communications/cases/${caseId}/approvals`, {
        version: detailQuery.data?.case.version,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Approval requested" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const decideMutation = useMutation({
    mutationFn: async (payload: { id: string; decision: "approved" | "rejected" }) => {
      const res = await apiRequest(
        "POST",
        `/api/communications/approvals/${payload.id}/decision`,
        {
          decision: payload.decision,
          caseVersion: detailQuery.data?.case.version,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Decision recorded" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!resolveSummary.trim()) {
        throw new Error("Resolution summary is required");
      }
      const res = await apiRequest("POST", `/api/communications/cases/${caseId}/resolve`, {
        version: detailQuery.data?.case.version,
        resolutionSummary: resolveSummary.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Case resolved" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const awaitTenantMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/communications/cases/${caseId}`, {
        version: detailQuery.data?.case.version,
        status: "awaiting_tenant",
        reason: "awaiting_tenant",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Marked awaiting tenant" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const reason = window.prompt("Cancellation reason (required)") || "";
      if (!reason.trim()) throw new Error("Reason required");
      const res = await apiRequest("POST", `/api/communications/cases/${caseId}/cancel`, {
        version: detailQuery.data?.case.version,
        reason: reason.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Case cancelled" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      const canonicalCaseId = window.prompt("Canonical case ID (required)") || "";
      const reason = window.prompt("Duplicate reason (required)") || "";
      if (!canonicalCaseId.trim() || !reason.trim()) {
        throw new Error("Canonical case ID and reason required");
      }
      const res = await apiRequest("POST", `/api/communications/cases/${caseId}/duplicate`, {
        version: detailQuery.data?.case.version,
        canonicalCaseId: canonicalCaseId.trim(),
        reason: reason.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Marked as duplicate" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const reopenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/communications/cases/${caseId}/reopen`, {
        version: detailQuery.data?.case.version,
        reason: "Reopened from workspace",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Case reopened" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const channelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/communications/cases/${caseId}/log-channel`,
        { channel, summary: channelSummary },
      );
      return res.json();
    },
    onSuccess: () => {
      setChannelSummary("");
      toast({ title: "Channel log saved" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const aiAcceptMutation = useMutation({
    mutationFn: async (edited: boolean) => {
      const suggestion = detailQuery.data?.case.aiSuggestionJson;
      const res = await apiRequest("POST", `/api/communications/cases/${caseId}/ai/accept`, {
        version: detailQuery.data?.case.version,
        suggestion,
        edited,
        applyPriority: suggestion?.priority,
        applySummary: suggestion?.summary,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "AI suggestion applied (human confirmed)" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const detail = detailQuery.data;
  const tenantMessages = useMemo(
    () => (detail?.messages || []).filter((m) => m.visibility === "tenant"),
    [detail],
  );
  const internalNotes = useMemo(
    () => (detail?.messages || []).filter((m) => m.visibility === "internal"),
    [detail],
  );

  if (detailQuery.isLoading) {
    return (
      <div className={cn("container mx-auto", pagePad)}>
        <p className="text-muted-foreground text-sm">Loading case…</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className={cn("container mx-auto", pagePad)}>
        <p className="text-muted-foreground text-sm">Case not found</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/communications">Back to inbox</Link>
        </Button>
      </div>
    );
  }

  const c = detail.case;
  const suggestion = c.aiSuggestionJson;

  return (
    <div className={cn("container mx-auto min-w-0 space-y-4 md:space-y-6", pagePad)}>
      <PageHeader
        icon={MessageSquare}
        title={c.subject}
        description={`${c.reference} · ${detail.category?.label || "Case"}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/communications">Inbox</Link>
            </Button>
            {!c.ownerUserId ? (
              <Button variant="brand" onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending}>
                Assign to me
              </Button>
            ) : null}
            {["resolved", "closed"].includes(c.status) ? (
              <Button variant="outline" onClick={() => reopenMutation.mutate()} disabled={reopenMutation.isPending}>
                Reopen
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => awaitTenantMutation.mutate()}
                  disabled={awaitTenantMutation.isPending}
                >
                  Await tenant
                </Button>
                <Button
                  variant="brand"
                  onClick={() => resolveMutation.mutate()}
                  disabled={resolveMutation.isPending || !resolveSummary.trim()}
                >
                  Resolve
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={communicationCaseStatusTone(c.status)}>
          {c.status.replace(/_/g, " ")}
        </StatusBadge>
        <StatusBadge tone={priorityTone(c.priority)}>{c.priority}</StatusBadge>
        {c.firstResponseDueAt ? (
          <span className="text-xs text-muted-foreground self-center">
            First response due {stamp(c.firstResponseDueAt)}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)] gap-4">
        <div className="space-y-4 min-w-0">
          <Tabs defaultValue="conversation">
            <TabsList className={cn(tabsListScroll, "w-full justify-start")}>
              <TabsTrigger value="conversation">Conversation</TabsTrigger>
              <TabsTrigger value="notes">Internal notes</TabsTrigger>
              <TabsTrigger value="audit">Audit</TabsTrigger>
            </TabsList>
            <TabsContent value="conversation" className="space-y-3">
              <div className="rounded-lg border border-border/80 bg-card p-3 space-y-3 max-h-[28rem] overflow-y-auto">
                {tenantMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tenant-visible messages yet.</p>
                ) : (
                  tenantMessages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm",
                        m.direction === "inbound" ? "bg-muted/40" : "bg-primary/5",
                      )}
                    >
                      <div className="flex justify-between gap-2 text-xs text-muted-foreground mb-1">
                        <span>
                          {m.authorNameSnapshot || m.direction} · {m.channel}
                        </span>
                        <span>{stamp(m.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))
                )}
              </div>
              <Textarea
                placeholder="Reply to tenant (visible to them)"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
              />
              <Button
                variant="brand"
                disabled={!reply.trim() || replyMutation.isPending}
                onClick={() => replyMutation.mutate()}
              >
                Send reply
              </Button>
            </TabsContent>
            <TabsContent value="notes" className="space-y-3">
              <div className="rounded-lg border border-amber-200/60 bg-amber-50/40 p-3 space-y-3 max-h-[28rem] overflow-y-auto">
                <p className="text-xs text-amber-900/80 flex items-center gap-1">
                  <NotebookPen className="w-3.5 h-3.5" />
                  Internal only — never shown to tenants
                </p>
                {internalNotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No internal notes.</p>
                ) : (
                  internalNotes.map((m) => (
                    <div key={m.id} className="rounded-md border bg-card px-3 py-2 text-sm">
                      <div className="text-xs text-muted-foreground mb-1">
                        {m.authorNameSnapshot} · {stamp(m.createdAt)}
                      </div>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))
                )}
              </div>
              <Textarea
                placeholder="Add internal note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
              <Button
                variant="outline"
                disabled={!note.trim() || noteMutation.isPending}
                onClick={() => noteMutation.mutate()}
              >
                Save note
              </Button>
            </TabsContent>
            <TabsContent value="audit">
              <div className="rounded-lg border border-border/80 bg-card p-3 space-y-2 max-h-[28rem] overflow-y-auto text-sm">
                {(auditQuery.data || []).map((e) => (
                  <div key={e.id} className="border-b border-border/40 pb-2">
                    <div className="font-medium">{e.eventType}</div>
                    <div className="text-xs text-muted-foreground">
                      {stamp(e.createdAt)}
                      {e.reason ? ` · ${e.reason}` : ""}
                    </div>
                  </div>
                ))}
                {!auditQuery.data?.length ? (
                  <p className="text-muted-foreground">No audit events yet.</p>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-4 min-w-0">
          {suggestion ? (
            <div className="rounded-lg border border-border/80 bg-card p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="w-4 h-4 text-primary" />
                AI suggested triage
              </div>
              <p className="text-xs text-muted-foreground">
                Never auto-applied. Confidence{" "}
                {Math.round((suggestion.confidence || 0) * 100)}% · {suggestion.model}
              </p>
              <p className="text-sm">{suggestion.summary}</p>
              {suggestion.draftReply ? (
                <p className="text-xs whitespace-pre-wrap rounded bg-muted/50 p-2">
                  {suggestion.draftReply}
                </p>
              ) : null}
              {suggestion.riskFlags?.length ? (
                <p className="text-xs text-[color:var(--brand-critical)]">
                  Flags: {suggestion.riskFlags.join(", ")}
                </p>
              ) : null}
              {suggestion.multiIntentSuggestSecondCase ? (
                <p className="text-xs text-muted-foreground">
                  Multi-intent detected — consider opening a second linked case.
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="brand"
                  onClick={() => aiAcceptMutation.mutate(false)}
                  disabled={aiAcceptMutation.isPending}
                >
                  Accept suggestion
                </Button>
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-border/80 bg-card p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckSquare className="w-4 h-4" /> Actions
            </div>
            {(detail.actions || []).map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span className={a.status === "completed" ? "line-through text-muted-foreground" : ""}>
                  {a.title}
                </span>
                {a.status !== "completed" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => completeActionMutation.mutate(a.id)}
                  >
                    Done
                  </Button>
                ) : null}
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                placeholder="New action"
                value={actionTitle}
                onChange={(e) => setActionTitle(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!actionTitle.trim() || actionMutation.isPending}
                onClick={() => actionMutation.mutate()}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border/80 bg-card p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="w-4 h-4" /> Approvals
            </div>
            {(detail.approvals || []).map((a) => (
              <div key={a.id} className="text-sm space-y-1 border-b border-border/40 pb-2">
                <div>
                  {a.type} · {a.decision || "pending"}
                </div>
                {!a.decision ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="brand"
                      onClick={() => decideMutation.mutate({ id: a.id, decision: "approved" })}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decideMutation.mutate({ id: a.id, decision: "rejected" })}
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => approvalMutation.mutate()}
              disabled={approvalMutation.isPending}
            >
              Request approval
            </Button>
          </div>

          <div className="rounded-lg border border-border/80 bg-card p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="w-4 h-4" /> Linked records
            </div>
            {(detail.links || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No links yet.</p>
            ) : (
              detail.links.map((l) => (
                <div key={l.id} className="text-sm">
                  {l.entityType === "maintenance_request" ? (
                    <Link
                      href={`/maintenance/${l.entityId}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Maintenance request (discussion)
                    </Link>
                  ) : l.entityType === "work_order" ? (
                    <Link
                      href={`/maintenance/work-orders/${l.entityId}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Work order
                    </Link>
                  ) : l.entityType === "inspection" ? (
                    <Link
                      href={`/inspections/${l.entityId}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Inspection
                    </Link>
                  ) : (
                    <span>
                      {l.entityType} · {l.relationship}
                    </span>
                  )}
                </div>
              ))
            )}
            {detail.category?.key === "maintenance" &&
            !(detail.links || []).some((l) => l.entityType === "maintenance_request") ? (
              <Button size="sm" variant="outline" asChild>
                <Link
                  href={`/maintenance?create=true${c.propertyId ? `&propertyId=${c.propertyId}` : ""}`}
                >
                  Create maintenance request
                </Link>
              </Button>
            ) : null}
            {(detail.links || []).some((l) => l.entityType === "maintenance_request") &&
            !(detail.links || []).some((l) => l.relationship === "created_from_case") ? (
              <p className="text-xs text-muted-foreground">
                Create a work order from the linked maintenance request (one WO per case).
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                Cancel case
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => duplicateMutation.mutate()}
                disabled={duplicateMutation.isPending}
              >
                Mark duplicate
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border/80 bg-card p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Phone className="w-4 h-4" /> Log phone / email / WhatsApp
            </div>
            <div className="flex gap-2">
              {(["phone", "email", "whatsapp"] as const).map((ch) => (
                <Button
                  key={ch}
                  size="sm"
                  variant={channel === ch ? "brand" : "outline"}
                  onClick={() => setChannel(ch)}
                >
                  {ch}
                </Button>
              ))}
            </div>
            <Textarea
              placeholder="Summary of the conversation"
              value={channelSummary}
              onChange={(e) => setChannelSummary(e.target.value)}
              rows={2}
            />
            <Button
              size="sm"
              disabled={!channelSummary.trim() || channelMutation.isPending}
              onClick={() => channelMutation.mutate()}
            >
              Save log
            </Button>
          </div>

          {!["resolved", "closed"].includes(c.status) ? (
            <div className="rounded-lg border border-border/80 bg-card p-3 space-y-2">
              <label className="text-sm font-medium">Resolution summary</label>
              <Textarea
                value={resolveSummary}
                onChange={(e) => setResolveSummary(e.target.value)}
                rows={2}
              />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
