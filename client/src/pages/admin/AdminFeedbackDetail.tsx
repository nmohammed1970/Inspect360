import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, ChevronDown, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { FeedbackStatusBadge, FeedbackTypeBadge } from "@/components/feedback/FeedbackBadges";
import {
  FeedbackImageDropzone,
  type FeedbackImageFile,
} from "@/components/feedback/FeedbackImageDropzone";
import { pagePad } from "@/lib/responsive";
import { cn } from "@/lib/utils";
import { FEEDBACK_STATUSES, FEEDBACK_TYPES } from "@shared/feedbackSchema";
import { feedbackStatusLabel, feedbackTypeLabel } from "@shared/feedbackLabels";

type Detail = {
  feedback: any;
  messages: any[];
  attachments: any[];
  audit: any[];
  assignees: Array<{ userId: string | null; email: string; canManageTeam?: boolean }>;
};

export default function AdminFeedbackDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [assignee, setAssignee] = useState("unassigned");
  const [publicBody, setPublicBody] = useState("");
  const [internalBody, setInternalBody] = useState("");
  const [publicImages, setPublicImages] = useState<FeedbackImageFile[]>([]);
  const [internalImages, setInternalImages] = useState<FeedbackImageFile[]>([]);

  const { data, isLoading } = useQuery<Detail>({
    queryKey: ["/api/admin/feedback", id],
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!data?.feedback) return;
    setType(data.feedback.type);
    setStatus(data.feedback.status);
    setAssignee(data.feedback.assignedToUserId || "unassigned");
  }, [data?.feedback]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/admin/feedback/${id}`, {
        type,
        status,
        assignedToUserId: assignee === "unassigned" ? null : assignee,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback"] });
      toast({ title: "Case updated" });
    },
    onError: (e: Error) =>
      toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const sendMessage = useMutation({
    mutationFn: async (input: {
      body: string;
      visibility: "public" | "internal";
      images: FeedbackImageFile[];
    }) => {
      const form = new FormData();
      form.append("body", input.body.trim());
      form.append("visibility", input.visibility);
      for (const img of input.images) form.append("images", img.file, img.file.name);
      const res = await fetch(`/api/admin/feedback/${id}/messages`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to send");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      if (vars.visibility === "public") {
        setPublicBody("");
        for (const img of publicImages) URL.revokeObjectURL(img.previewUrl);
        setPublicImages([]);
      } else {
        setInternalBody("");
        for (const img of internalImages) URL.revokeObjectURL(img.previewUrl);
        setInternalImages([]);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback", id] });
      toast({ title: vars.visibility === "public" ? "Public reply sent" : "Internal note saved" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not send", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className={cn("container mx-auto min-w-0", pagePad)}>
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data?.feedback) {
    return (
      <div className={cn("container mx-auto min-w-0", pagePad)}>
        <p className="text-destructive">Feedback case not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/admin/feedback">Back to Inbox</Link>
        </Button>
      </div>
    );
  }

  const { feedback, messages, attachments, audit, assignees } = data;
  const caseAttachments = attachments.filter((a: any) => !a.messageId);
  const client = (feedback.clientContext || {}) as Record<string, unknown>;

  return (
    <div className={cn("container mx-auto min-w-0 space-y-6 md:space-y-8", pagePad)}>
      <Button asChild variant="ghost" className="mb-4 -ml-2">
        <Link href="/admin/feedback">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Inbox
        </Link>
      </Button>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="font-mono font-semibold">{feedback.reference}</span>
        <FeedbackTypeBadge type={feedback.type} />
        <FeedbackStatusBadge status={feedback.status} />
      </div>
      <h1 className="text-2xl font-bold mb-6">{feedback.subject}</h1>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{feedback.description}</p>
              {caseAttachments.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {caseAttachments.map((a: any) => (
                    <a
                      key={a.id}
                      href={`/api/admin/feedback/attachments/${a.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block w-28 h-28 rounded-lg border overflow-hidden"
                    >
                      <img
                        src={`/api/admin/feedback/attachments/${a.id}`}
                        alt={a.originalFilename || "Screenshot"}
                        className="w-full h-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conversation</CardTitle>
              <CardDescription>Public replies and internal notes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground">No messages yet.</p>
              )}
              {messages.map((m: any) => {
                const internal = m.visibility === "internal";
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-xl border p-3",
                      internal
                        ? "border-l-4 border-l-amber-500 bg-amber-50/50"
                        : "border-l-4 border-l-sky-500 bg-sky-50/40",
                    )}
                  >
                    <div className="flex justify-between gap-2 text-xs mb-1">
                      <span className="font-medium">
                        {internal ? "Internal" : m.authorNameSnapshot || "Inspect360 team"}
                      </span>
                      <span className="text-muted-foreground">
                        {m.createdAt ? format(new Date(m.createdAt), "dd MMM yyyy HH:mm") : ""}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {attachments
                        .filter((a: any) => a.messageId === m.id)
                        .map((a: any) => (
                          <a
                            key={a.id}
                            href={`/api/admin/feedback/attachments/${a.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="block w-20 h-20 rounded border overflow-hidden"
                          >
                            <img
                              src={`/api/admin/feedback/attachments/${a.id}`}
                              alt={a.originalFilename || "Attachment"}
                              className="w-full h-full object-cover"
                            />
                          </a>
                        ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Public reply</CardTitle>
                <CardDescription>Visible to the reporter and emailed to them</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={publicBody}
                  onChange={(e) => setPublicBody(e.target.value)}
                  rows={4}
                  placeholder="Reply the customer will see…"
                />
                <FeedbackImageDropzone files={publicImages} onChange={setPublicImages} />
                <Button
                  disabled={!publicBody.trim() || sendMessage.isPending}
                  onClick={() =>
                    sendMessage.mutate({ body: publicBody, visibility: "public", images: publicImages })
                  }
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send public reply
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Internal note</CardTitle>
                <CardDescription>Never shown to the reporter or in their email</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={internalBody}
                  onChange={(e) => setInternalBody(e.target.value)}
                  rows={4}
                  placeholder="Private note for the Feature Admin team…"
                />
                <FeedbackImageDropzone files={internalImages} onChange={setInternalImages} />
                <Button
                  variant="secondary"
                  disabled={!internalBody.trim() || sendMessage.isPending}
                  onClick={() =>
                    sendMessage.mutate({
                      body: internalBody,
                      visibility: "internal",
                      images: internalImages,
                    })
                  }
                >
                  Save internal note
                </Button>
              </CardContent>
            </Card>
          </div>

          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="px-0">
                <ChevronDown className="h-4 w-4 mr-2" />
                Audit timeline
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card>
                <CardContent className="p-4 space-y-2 text-sm">
                  {(audit || []).length === 0 && (
                    <p className="text-muted-foreground">No audit events yet.</p>
                  )}
                  {(audit || []).map((ev: any) => (
                    <div key={ev.id} className="flex justify-between gap-3 border-b last:border-0 py-2">
                      <div>
                        <p className="font-medium">{ev.eventType}</p>
                        <p className="text-muted-foreground text-xs">
                          {ev.beforeValue || "—"} → {ev.afterValue || "—"}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {ev.createdAt ? format(new Date(ev.createdAt), "dd MMM HH:mm") : ""}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Triage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEEDBACK_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {feedbackTypeLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEEDBACK_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {feedbackStatusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assignee</Label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {assignees
                      .filter((a) => a.userId)
                      .map((a) => (
                        <SelectItem key={a.userId!} value={a.userId!}>
                          {a.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <MetaRow label="Organisation" value={feedback.organizationNameSnapshot} />
              <MetaRow
                label="Reporter"
                value={`${feedback.reporterNameSnapshot || ""} (${feedback.reporterEmailSnapshot || ""})`}
              />
              <MetaRow label="Source page" value={feedback.sourcePage} />
              <MetaRow label="Browser" value={String(client.userAgent || "—")} />
              <MetaRow label="Platform" value={String(client.platform || "—")} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words">{value || "—"}</p>
    </div>
  );
}
