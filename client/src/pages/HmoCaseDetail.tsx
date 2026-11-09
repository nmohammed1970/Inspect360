import { useRoute, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModernFilePickerInline } from "@/components/ModernFilePickerInline";
import { PageHeader } from "@/components/PageHeader";
import { pagePad } from "@/lib/responsive";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { X } from "lucide-react";
import {
  formatHmoDate,
  hmoCaseStatusMeta,
  hmoCheckLabel,
  hmoChecksForTask,
  hmoFindingStatusLabel,
  hmoRoleLabel,
  hmoSeverityMeta,
  hmoTaskShortLabel,
  hmoTaskStatusMeta,
} from "@/components/hmo/hmoLabels";

type EvidenceReview = {
  id: string;
  taskId: string;
  evidenceObjectUrl?: string | null;
  decision?: string | null;
  rejectionReason?: string | null;
  createdAt?: string | null;
  aiResult?: { fileName?: string | null; mime?: string | null; size?: number | null } | null;
};

type CaseDetail = {
  case: {
    id: string;
    caseReference: string;
    propertyId: string;
    severity: string;
    status: string;
    ownerUserId?: string | null;
    dueAt?: string | null;
    closureReason?: string | null;
  };
  tasks: Array<{
    id: string;
    taskCode?: string | null;
    title: string;
    status: string;
    priority?: string | null;
    dueAt?: string | null;
    assignedRole?: string | null;
  }>;
  findings: Array<{
    id: string;
    checkId: string;
    status: string;
    severity: string;
    explanation?: string | null;
  }>;
  evidenceReviews?: EvidenceReview[];
  property: { id: string; name: string; address: string } | null;
};

export default function HmoCaseDetail() {
  const [, params] = useRoute("/hmo/cases/:id");
  const caseId = params?.id;
  const { toast } = useToast();
  const [closureReason, setClosureReason] = useState("");
  const [approveOpen, setApproveOpen] = useState(false);
  const [evidenceTaskId, setEvidenceTaskId] = useState<string | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [lastShareLink, setLastShareLink] = useState<string | null>(null);
  const [lastShareMeta, setLastShareMeta] = useState<{
    propertyName?: string;
    neededSummary?: string;
  } | null>(null);
  const [directUploadFile, setDirectUploadFile] = useState<File | null>(null);

  const { data, isLoading, error } = useQuery<CaseDetail>({
    queryKey: ["/api/hmo/cases", caseId],
    enabled: !!caseId,
  });

  const signoffMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/hmo/cases/${caseId}/signoff`, { closureReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hmo/cases", caseId] });
      setApproveOpen(false);
      setClosureReason("");
      toast({ title: "Case signed off" });
    },
    onError: (e: any) =>
      toast({ title: "Sign-off failed", description: e.message, variant: "destructive" }),
  });

  const evidenceMutation = useMutation({
    mutationFn: async (taskId: string) => {
      // Server builds property name + missing-item copy for the link/email.
      const res = await apiRequest("POST", `/api/hmo/tasks/${taskId}/evidence-requests`, {
        recipientEmail: recipientEmail || undefined,
      });
      return res.json();
    },
    onSuccess: async (payload) => {
      queryClient.invalidateQueries({ queryKey: ["/api/hmo/cases", caseId] });
      const path = payload.publicPath as string | undefined;
      setLastShareLink(path || null);
      setLastShareMeta({
        propertyName: payload.propertyName as string | undefined,
        neededSummary: payload.neededSummary as string | undefined,
      });
      const emailed = Boolean(payload.emailSent);
      const emailErr = payload.emailError as string | undefined;
      let copied = false;
      if (path) {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}${path}`);
          copied = true;
        } catch {
          copied = false;
        }
      }
      toast({
        title: emailed ? "Evidence link emailed" : "Evidence request created",
        description: emailed
          ? copied
            ? "The recipient was emailed the link. It’s also shown above and copied to your clipboard."
            : "The recipient was emailed the link. It’s also shown above — copy it from there."
          : emailErr
            ? `Link created, but email failed: ${emailErr}. ${copied ? "Copied to clipboard and shown above." : "Shown above — copy it from there."}`
            : path
              ? copied
                ? "Share link copied to your clipboard and shown above."
                : "Share link is shown above — copy it from there."
              : "Request recorded.",
        variant: emailErr ? "destructive" : "default",
      });
      setEvidenceTaskId(null);
      setDirectUploadFile(null);
    },
    onError: (e: any) =>
      toast({ title: "Evidence request failed", description: e.message, variant: "destructive" }),
  });

  const directUploadMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!directUploadFile) throw new Error("Choose a PDF or image first");
      const form = new FormData();
      form.append("file", directUploadFile);
      const res = await fetch(`/api/hmo/tasks/${taskId}/evidence-reviews`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hmo/cases", caseId] });
      setEvidenceTaskId(null);
      setDirectUploadFile(null);
      toast({
        title: "Evidence uploaded",
        description: "It appears under Received evidence for review.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const decideEvidenceMutation = useMutation({
    mutationFn: async (input: {
      reviewId: string;
      decision: "ACCEPTED" | "REJECTED";
      rejectionReason?: string;
    }) => {
      await apiRequest("PATCH", `/api/hmo/evidence-reviews/${input.reviewId}`, {
        decision: input.decision,
        rejectionReason: input.rejectionReason,
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/hmo/cases", caseId] });
      toast({
        title: vars.decision === "ACCEPTED" ? "Evidence accepted" : "Evidence rejected",
      });
    },
    onError: (e: any) =>
      toast({ title: "Review failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <div className={pagePad}>Loading case…</div>;
  }
  if (error || !data) {
    return <div className={pagePad}>Case not found or inaccessible.</div>;
  }

  const { case: c, tasks, findings, property } = data;
  const evidenceReviews = data.evidenceReviews || [];
  const sev = hmoSeverityMeta(c.severity);
  const taskTitleById = Object.fromEntries(tasks.map((t) => [t.id, t.title]));
  const linkedCheckIds = new Set(findings.map((f) => f.checkId));
  const openTasks = tasks.filter(
    (t) => t.status !== "VERIFIED_CLOSED" && t.status !== "CANCELLED",
  );
  const priorityOpen = openTasks.filter((t) =>
    hmoChecksForTask(t.taskCode).some((checkId) => linkedCheckIds.has(checkId)),
  );

  return (
    <div className={pagePad} data-testid="hmo-case-detail">
      <PageHeader
        leading={
          <Link
            href="/hmo"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back to HMO
          </Link>
        }
        title={c.caseReference}
        description={
          property
            ? `${property.name} — ${property.address}`
            : "Property details unavailable"
        }
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant="outline" className={sev.className}>
              {sev.label} priority
            </Badge>
            <Badge variant="outline" className={hmoCaseStatusMeta(c.status).className}>
              {hmoCaseStatusMeta(c.status).label}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link href={`/properties/${c.propertyId}?tab=hmo`}>Property HMO</Link>
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={c.status === "VERIFIED_CLOSED"}
              onClick={() => setApproveOpen(true)}
            >
              {c.status === "VERIFIED_CLOSED" ? "Case closed" : "Approve case"}
            </Button>
          </div>
        }
      />

      <Dialog
        open={approveOpen}
        onOpenChange={(open) => {
          setApproveOpen(open);
          if (!open) setClosureReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve case closure</DialogTitle>
            <DialogDescription>
              Critical closures need an authorised approver. Record residual risk if any remains.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="closure-reason">Closure reason</Label>
            <Textarea
              id="closure-reason"
              value={closureReason}
              onChange={(e) => setClosureReason(e.target.value)}
              placeholder="Why this case can be closed…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => signoffMutation.mutate()}
              disabled={signoffMutation.isPending || c.status === "VERIFIED_CLOSED"}
            >
              {signoffMutation.isPending ? "Closing…" : "Approve closure"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {c.dueAt && (
        <p className="text-sm text-muted-foreground mb-4">Due {formatHmoDate(c.dueAt)}</p>
      )}

      {lastShareLink && (
        <Card className="mb-4 border-sky-200 bg-sky-50/60">
          <CardContent className="pt-4 flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">Share link (also copied to clipboard)</p>
              {(lastShareMeta?.propertyName || lastShareMeta?.neededSummary) && (
                <p className="text-sm mt-1">
                  {lastShareMeta.propertyName && (
                    <span className="font-medium">{lastShareMeta.propertyName}</span>
                  )}
                  {lastShareMeta.propertyName && lastShareMeta.neededSummary ? " · " : ""}
                  {lastShareMeta.neededSummary}
                </p>
              )}
              <p className="text-xs text-muted-foreground break-all mt-1">
                {`${window.location.origin}${lastShareLink}`}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${window.location.origin}${lastShareLink}`,
                  );
                  toast({ title: "Link copied" });
                } catch {
                  toast({ title: "Copy failed", variant: "destructive" });
                }
              }}
            >
              Copy full link
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Received evidence</CardTitle>
          <CardDescription>
            Files uploaded via share links for this case. Open them here, then accept or reject.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {evidenceReviews.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No evidence received yet. Create a share link on a task below.
            </p>
          )}
          {evidenceReviews.map((r) => {
            const fileName = r.aiResult?.fileName || "Uploaded file";
            const decisionMeta =
              r.decision === "ACCEPTED"
                ? {
                    label: "Accepted",
                    className: "border-emerald-300 bg-emerald-50 text-emerald-900",
                  }
                : r.decision === "REJECTED"
                  ? {
                      label: "Rejected",
                      className: "border-rose-300 bg-rose-50 text-rose-900",
                    }
                  : {
                      label: "Pending review",
                      className: "border-amber-300 bg-amber-50 text-amber-950",
                    };
            return (
              <div key={r.id} className="rounded-lg border px-3 py-3 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="font-medium leading-snug truncate">{fileName}</div>
                    <div className="text-xs text-muted-foreground">
                      {taskTitleById[r.taskId] || "Task"}
                      {r.createdAt ? ` · ${formatHmoDate(r.createdAt)}` : ""}
                    </div>
                    <Badge variant="outline" className={decisionMeta.className}>
                      {decisionMeta.label}
                    </Badge>
                    {r.rejectionReason && (
                      <p className="text-xs text-muted-foreground">{r.rejectionReason}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.evidenceObjectUrl && (
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={`/api/hmo/evidence-reviews/${r.id}/file`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open file
                        </a>
                      </Button>
                    )}
                    {!r.decision && (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            decideEvidenceMutation.mutate({
                              reviewId: r.id,
                              decision: "ACCEPTED",
                            })
                          }
                          disabled={decideEvidenceMutation.isPending}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            decideEvidenceMutation.mutate({
                              reviewId: r.id,
                              decision: "REJECTED",
                              rejectionReason: "Needs a clearer or complete document",
                            })
                          }
                          disabled={decideEvidenceMutation.isPending}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="mb-6 border-slate-200 bg-slate-50/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">What matters on this case</CardTitle>
          <CardDescription>
            The case opened from linked licence findings. Work those related tasks first; other
            tasks cover later checks once you have more evidence.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Opened because of</p>
            {findings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No findings linked to this case.</p>
            ) : (
              <div className="space-y-2">
                {findings.map((f) => {
                  const fSev = hmoSeverityMeta(f.severity);
                  return (
                    <div
                      key={f.id}
                      className="rounded-md border bg-white px-3 py-2.5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{hmoCheckLabel(f.checkId)}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{f.checkId}</div>
                        {f.explanation && (
                          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                            {f.explanation}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <Badge variant="outline" className={fSev.className}>
                          {fSev.label}
                        </Badge>
                        <Badge variant="secondary">{hmoFindingStatusLabel(f.status)}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Do these tasks next</p>
            {priorityOpen.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No open tasks left that map directly to the linked findings.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {priorityOpen.map((t) => (
                  <li
                    key={t.id}
                    className="text-sm rounded-md border bg-white px-3 py-2 flex flex-wrap items-center gap-2"
                  >
                    <span className="font-medium">{t.taskCode}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{hmoTaskShortLabel(t.taskCode)}</span>
                    <Badge variant="outline" className={hmoTaskStatusMeta(t.status).className}>
                      {hmoTaskStatusMeta(t.status).label}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Tasks</CardTitle>
          <CardDescription>
            Upload evidence yourself, or send a share link when you need documents from someone
            outside the team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tasks.length === 0 && (
            <p className="text-sm text-muted-foreground">No tasks on this case.</p>
          )}
          {tasks.map((t) => {
            const taskSev = hmoSeverityMeta(t.priority);
            const panelOpen = evidenceTaskId === t.id;
            return (
              <div key={t.id} className="rounded-lg border px-3 py-3 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    {t.taskCode && (
                      <div className="text-xs font-medium text-muted-foreground">{t.taskCode}</div>
                    )}
                    <div className="font-medium leading-snug">{t.title}</div>
                    <div className="flex flex-wrap gap-2 items-center pt-1">
                      <Badge variant="outline" className={hmoTaskStatusMeta(t.status).className}>
                        {hmoTaskStatusMeta(t.status).label}
                      </Badge>
                      {t.priority && (
                        <Badge variant="outline" className={taskSev.className}>
                          {taskSev.label} priority
                        </Badge>
                      )}
                      {t.assignedRole && (
                        <span className="text-xs text-muted-foreground">
                          Suggested role: {hmoRoleLabel(t.assignedRole)}
                        </span>
                      )}
                      {t.dueAt && (
                        <span className="text-xs text-muted-foreground">
                          Due {formatHmoDate(t.dueAt)}
                        </span>
                      )}
                    </div>
                    {hmoChecksForTask(t.taskCode).length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-xs text-muted-foreground">Helps clear:</span>
                        {hmoChecksForTask(t.taskCode).map((checkId) => (
                          <Badge
                            key={checkId}
                            variant="outline"
                            className={
                              linkedCheckIds.has(checkId)
                                ? "border-amber-300 bg-amber-50 text-amber-950 font-normal"
                                : "font-normal"
                            }
                          >
                            {checkId} · {hmoCheckLabel(checkId)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (panelOpen) {
                        setEvidenceTaskId(null);
                        setDirectUploadFile(null);
                        setRecipientEmail("");
                      } else {
                        setEvidenceTaskId(t.id);
                        setDirectUploadFile(null);
                        setRecipientEmail("");
                      }
                    }}
                  >
                    {panelOpen ? "Cancel" : "Add evidence"}
                  </Button>
                </div>
                {panelOpen && (
                  <div className="rounded-md bg-muted/40 p-3 space-y-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Upload yourself</p>
                      <p className="text-xs text-muted-foreground">
                        PDF or image. It will appear under Received evidence for review.
                      </p>
                      <ModernFilePickerInline
                        onFilesSelected={(files) => setDirectUploadFile(files[0] || null)}
                        maxFiles={1}
                        accept="application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.heic,.heif,.webp"
                        height={200}
                      />
                      {directUploadFile && (
                        <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                          <span className="truncate">{directUploadFile.name}</span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            onClick={() => setDirectUploadFile(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      <Button
                        size="sm"
                        onClick={() => directUploadMutation.mutate(t.id)}
                        disabled={!directUploadFile || directUploadMutation.isPending}
                      >
                        {directUploadMutation.isPending ? "Uploading…" : "Submit evidence"}
                      </Button>
                    </div>
                    <div className="border-t pt-3 space-y-2">
                      <p className="text-sm font-medium">Or request from someone else</p>
                      <Label htmlFor={`evidence-email-${t.id}`}>Recipient email (optional)</Label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          id={`evidence-email-${t.id}`}
                          type="email"
                          placeholder="name@example.com"
                          value={recipientEmail}
                          onChange={(e) => setRecipientEmail(e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => evidenceMutation.mutate(t.id)}
                          disabled={evidenceMutation.isPending}
                        >
                          {evidenceMutation.isPending
                            ? recipientEmail.trim()
                              ? "Sending…"
                              : "Creating…"
                            : "Share link"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {recipientEmail.trim()
                          ? "We’ll email them a secure one-off upload link. The same link is copied to your clipboard and shown above."
                          : "Creates a link, copies it to your clipboard, and shows it above so you can paste it anywhere."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

    </div>
  );
}
