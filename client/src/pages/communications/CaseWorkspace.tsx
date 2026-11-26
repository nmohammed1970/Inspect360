import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import {
  AlertTriangle,
  Building2,
  CheckSquare,
  Clock,
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

function prettyLabel(value: string) {
  return value.replace(/_/g, " ");
}

function isPast(iso?: string | null) {
  if (!iso) return false;
  try {
    return new Date(iso).getTime() < Date.now();
  } catch {
    return false;
  }
}

function channelLabel(channel: string) {
  switch (channel) {
    case "tenant_portal":
      return "Portal";
    case "whatsapp":
      return "WhatsApp";
    case "phone":
      return "Phone";
    case "email":
      return "Email";
    case "app":
      return "App";
    default:
      return prettyLabel(channel);
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

  const firstResponseOverdue = isPast(c.firstResponseDueAt) && !["resolved", "closed", "cancelled", "duplicate"].includes(c.status);
  const resolutionOverdue = isPast(c.resolutionDueAt) && !["resolved", "closed", "cancelled", "duplicate"].includes(c.status);

  return (
    <div className={cn("container mx-auto min-w-0 space-y-5 md:space-y-6", pagePad)}>
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

      <div className="rounded-xl border border-border/70 bg-card shadow-sm px-4 py-3.5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={communicationCaseStatusTone(c.status)}>
            {prettyLabel(c.status)}
          </StatusBadge>
          <StatusBadge tone={priorityTone(c.priority)}>
            {c.priority} priority
          </StatusBadge>
          {firstResponseOverdue || resolutionOverdue ? (
            <StatusBadge tone="critical">
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                SLA overdue
              </span>
            </StatusBadge>
          ) : null}
          {detail.category?.label ? (
            <StatusBadge tone="muted">{detail.category.label}</StatusBadge>
          ) : null}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {c.firstResponseDueAt ? (
            <div
              className={cn(
                "rounded-lg border px-3 py-2",
                firstResponseOverdue
                  ? "border-red-200 bg-red-50"
                  : "border-border/60 bg-muted/30",
              )}
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                First response
              </p>
              <p
                className={cn(
                  "text-sm font-medium mt-0.5",
                  firstResponseOverdue ? "text-red-700" : "text-foreground",
                )}
              >
                {stamp(c.firstResponseDueAt)}
                {firstResponseOverdue ? " · overdue" : ""}
              </p>
            </div>
          ) : null}
          {c.resolutionDueAt ? (
            <div
              className={cn(
                "rounded-lg border px-3 py-2",
                resolutionOverdue
                  ? "border-red-200 bg-red-50"
                  : "border-border/60 bg-muted/30",
              )}
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Resolution due
              </p>
              <p
                className={cn(
                  "text-sm font-medium mt-0.5",
                  resolutionOverdue ? "text-red-700" : "text-foreground",
                )}
              >
                {stamp(c.resolutionDueAt)}
                {resolutionOverdue ? " · overdue" : ""}
              </p>
            </div>
          ) : null}
          {c.summary ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 sm:col-span-2 lg:col-span-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                Summary
              </p>
              <p className="text-sm mt-0.5 line-clamp-2">{c.summary}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)] gap-4">
        <div className="space-y-4 min-w-0">
          <Tabs defaultValue="conversation">
            <TabsList className={cn(tabsListScroll, "w-full justify-start rounded-lg")}>
              <TabsTrigger value="conversation">Conversation</TabsTrigger>
              <TabsTrigger value="notes">Internal notes</TabsTrigger>
              <TabsTrigger value="audit">Audit</TabsTrigger>
            </TabsList>
            <TabsContent value="conversation" className="space-y-3 mt-3">
              <div className="rounded-xl border border-border/70 bg-card shadow-sm p-3.5 space-y-3 max-h-[28rem] overflow-y-auto">
                {tenantMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No tenant-visible messages yet.
                  </p>
                ) : (
                  tenantMessages.map((m) => {
                    const inbound = m.direction === "inbound";
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "rounded-lg border px-3.5 py-2.5 text-sm",
                          inbound
                            ? "border-slate-200 bg-slate-50"
                            : "border-teal-200 bg-teal-50/70",
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-foreground">
                              {m.authorNameSnapshot || (inbound ? "Tenant" : "Staff")}
                            </span>
                            <StatusBadge tone={inbound ? "muted" : "primary"}>
                              {inbound ? "Tenant" : "Staff"}
                            </StatusBadge>
                            <StatusBadge tone="info">{channelLabel(m.channel)}</StatusBadge>
                          </div>
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {stamp(m.createdAt)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed text-foreground/90">
                          {m.body}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="rounded-xl border border-border/70 bg-card shadow-sm p-3.5 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Reply to tenant
                </p>
                <Textarea
                  placeholder="Visible to the tenant on this case…"
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
              </div>
            </TabsContent>
            <TabsContent value="notes" className="space-y-3 mt-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 shadow-sm p-3.5 space-y-3 max-h-[28rem] overflow-y-auto">
                <p className="text-xs text-amber-900 flex items-center gap-1.5 font-medium">
                  <NotebookPen className="w-3.5 h-3.5" />
                  Internal only — never shown to tenants
                </p>
                {internalNotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No internal notes.</p>
                ) : (
                  internalNotes.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-lg border border-amber-200/80 bg-card px-3.5 py-2.5 text-sm"
                    >
                      <div className="flex justify-between gap-2 text-[11px] text-muted-foreground mb-1.5">
                        <span className="font-medium text-foreground/80">
                          {m.authorNameSnapshot || "Staff"}
                        </span>
                        <span className="tabular-nums">{stamp(m.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="rounded-xl border border-border/70 bg-card shadow-sm p-3.5 space-y-3">
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
              </div>
            </TabsContent>
            <TabsContent value="audit" className="mt-3">
              <div className="rounded-xl border border-border/70 bg-card shadow-sm p-3.5 space-y-2 max-h-[28rem] overflow-y-auto text-sm">
                {(auditQuery.data || []).map((e) => (
                  <div
                    key={e.id}
                    className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
                  >
                    <div className="font-medium capitalize">{prettyLabel(e.eventType)}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {stamp(e.createdAt)}
                      {e.reason ? ` · ${e.reason}` : ""}
                    </div>
                  </div>
                ))}
                {!auditQuery.data?.length ? (
                  <p className="text-muted-foreground py-6 text-center">No audit events yet.</p>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-3.5 min-w-0">
          {suggestion ? (
            <div className="rounded-xl border border-teal-200 bg-teal-50/40 shadow-sm p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="w-4 h-4 text-teal-700" />
                AI suggested triage
              </div>
              <p className="text-xs text-muted-foreground">
                Never auto-applied. Confidence{" "}
                {Math.round((suggestion.confidence || 0) * 100)}% · {suggestion.model}
              </p>
              <p className="text-sm">{suggestion.summary}</p>
              {suggestion.draftReply ? (
                <p className="text-xs whitespace-pre-wrap rounded-lg border border-teal-100 bg-white/80 p-2.5">
                  {suggestion.draftReply}
                </p>
              ) : null}
              {suggestion.riskFlags?.length ? (
                <p className="text-xs text-red-700 font-medium">
                  Flags: {suggestion.riskFlags.join(", ")}
                </p>
              ) : null}
              {suggestion.multiIntentSuggestSecondCase ? (
                <p className="text-xs text-muted-foreground">
                  Multi-intent detected — consider opening a second linked case.
                </p>
              ) : null}
              <Button
                size="sm"
                variant="brand"
                onClick={() => aiAcceptMutation.mutate(false)}
                disabled={aiAcceptMutation.isPending}
              >
                Accept suggestion
              </Button>
            </div>
          ) : null}

          <div className="rounded-xl border border-border/70 bg-card shadow-sm p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CheckSquare className="w-4 h-4 text-teal-700" /> Actions
            </div>
            {(detail.actions || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No actions yet.</p>
            ) : (
              (detail.actions || []).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2 text-sm"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <StatusBadge tone={a.status === "completed" ? "success" : "warning"}>
                      {a.status === "completed" ? "Done" : "Open"}
                    </StatusBadge>
                    <span
                      className={cn(
                        "truncate",
                        a.status === "completed" && "line-through text-muted-foreground",
                      )}
                    >
                      {a.title}
                    </span>
                  </div>
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
              ))
            )}
            <div className="flex gap-2 pt-0.5">
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

          <div className="rounded-xl border border-border/70 bg-card shadow-sm p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="w-4 h-4 text-amber-700" /> Approvals
            </div>
            {(detail.approvals || []).map((a) => (
              <div
                key={a.id}
                className="rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2 text-sm space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="capitalize">{prettyLabel(a.type)}</span>
                  <StatusBadge
                    tone={
                      a.decision === "approved"
                        ? "success"
                        : a.decision === "rejected"
                          ? "critical"
                          : "warning"
                    }
                  >
                    {a.decision || "pending"}
                  </StatusBadge>
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

          <div className="rounded-xl border border-border/70 bg-card shadow-sm p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Link2 className="w-4 h-4 text-sky-700" /> Linked records
            </div>
            {(detail.links || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No links yet.</p>
            ) : (
              detail.links.map((l) => (
                <div
                  key={l.id}
                  className="rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2 text-sm"
                >
                  {l.entityType === "maintenance_request" ? (
                    <Link
                      href={`/maintenance/${l.entityId}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Maintenance request
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
                      {prettyLabel(l.entityType)} · {prettyLabel(l.relationship)}
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
            <div className="flex flex-wrap gap-2 pt-1 border-t border-border/50">
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

          <div className="rounded-xl border border-border/70 bg-card shadow-sm p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Phone className="w-4 h-4 text-sky-700" /> Log phone / email / WhatsApp
            </div>
            <p className="text-[11px] text-muted-foreground">
              Manual log only — does not send a message.
            </p>
            <div className="flex gap-2">
              {(["phone", "email", "whatsapp"] as const).map((ch) => (
                <Button
                  key={ch}
                  size="sm"
                  variant={channel === ch ? "brand" : "outline"}
                  className="capitalize"
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
            <div className="rounded-xl border border-border/70 bg-card shadow-sm p-3.5 space-y-2.5">
              <label className="text-sm font-semibold">Resolution summary</label>
              <p className="text-[11px] text-muted-foreground">
                Required before Resolve. Shown on the closed case record.
              </p>
              <Textarea
                value={resolveSummary}
                onChange={(e) => setResolveSummary(e.target.value)}
                placeholder="What was done / outcome…"
                rows={2}
              />
            </div>
          ) : c.resolutionSummary ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-sm p-3.5 space-y-1.5">
              <p className="text-sm font-semibold text-emerald-900">Resolution</p>
              <p className="text-sm text-emerald-950/90 whitespace-pre-wrap">
                {c.resolutionSummary}
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
