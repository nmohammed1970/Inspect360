import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { useBackHref } from "@/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import {
  priorityTone,
  toneClass,
  workOrderStatusTone,
} from "@shared/statusPriorityStyles";
import { formatWorkOrderStatus } from "@shared/inspectionLabels";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { createSignatureValue, parseSignatureValue } from "@shared/signature";
import { PageHeader } from "@/components/PageHeader";
import { WorkOrderCertificatePanel } from "@/components/WorkOrderCertificatePanel";
import {
  WorkOrderCompletionChecklistPanel,
  useWorkOrderCompletionChecklist,
} from "@/components/WorkOrderCompletionChecklistPanel";
import { WorkOrderQuotesInvoicesPanel } from "@/components/maintenance-quotes/WorkOrderQuotesInvoicesPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { dialogContentBase } from "@/lib/responsive";

interface WorkOrderDetail {
  id: string;
  status: string;
  slaDue?: string | null;
  scheduledAt?: string | null;
  arrivedAt?: string | null;
  authorisationStatus?: string | null;
  completionChecklistId?: string | null;
  customerSignatureJson?: unknown;
  assignedToId?: string | null;
  maintenanceRequest: {
    id: string;
    title: string;
    description?: string;
    priority: string;
    propertyId?: string | null;
    blockId?: string | null;
  };
  property?: { id?: string; name?: string } | null;
  block?: { id?: string; name?: string } | null;
}


const WorkOrderDetailPage = () => {
  const params = useParams<{ workOrderId: string }>();
  const workOrderId = params.workOrderId;
  const backHref = useBackHref("/maintenance?tab=work-orders");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAtLocal, setScheduleAtLocal] = useState("");
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [savedImage, setSavedImage] = useState<string | null>(null);
  const [editingPad, setEditingPad] = useState(true);
  const [padKey, setPadKey] = useState(0);
  const padRef = useRef<SignatureCanvas>(null);

  const canFieldAct =
    user?.role === "clerk" ||
    user?.role === "contractor" ||
    user?.role === "maintenance_admin";
  const canScheduleWorkOrder =
    user?.role === "owner" ||
    user?.role === "clerk" ||
    user?.role === "contractor" ||
    user?.role === "maintenance_admin";
  const canVisitAct = (status?: string | null) => status !== "quote_required";

  const {
    data: workOrder,
    isLoading,
    error,
  } = useQuery<WorkOrderDetail>({
    queryKey: ["/api/work-orders", workOrderId],
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/${workOrderId}`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load work order");
      }
      return res.json();
    },
    enabled: !!workOrderId,
  });

  const { data: completionChecklists = [] } = useQuery<any[]>({
    queryKey: ["/api/completion-checklists"],
    queryFn: async () => {
      const res = await fetch("/api/completion-checklists", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch checklists");
      return res.json();
    },
  });
  const activeCompletionChecklists = completionChecklists.filter((c: any) => c.isActive !== false);

  const { data: checklist } = useWorkOrderCompletionChecklist(workOrderId);
  const requiredIncomplete = checklist?.progress?.requiredIncomplete ?? 0;
  const hasChecklist = !!checklist?.snapshot?.items?.length;

  const parsedExisting = parseSignatureValue(workOrder?.customerSignatureJson);
  const displayImage = savedImage || parsedExisting?.image || null;

  useEffect(() => {
    if (parsedExisting?.image) {
      setSavedImage(parsedExisting.image);
      setEditingPad(false);
      if (parsedExisting.signedByName) setSignerName(parsedExisting.signedByName);
    }
  }, [workOrder?.id, !!parsedExisting?.image]);

  const invalidateWo = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/work-orders", workOrderId] });
    await queryClient.invalidateQueries({ queryKey: ["/api/analytics/work-orders"] });
  };

  const assignChecklistMutation = useMutation({
    mutationFn: async (completionChecklistId: string | null) => {
      return apiRequest("PATCH", `/api/work-orders/${workOrderId}`, { completionChecklistId });
    },
    onSuccess: async () => {
      await invalidateWo();
      toast({ title: "Checklist updated" });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to update checklist", description: e.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      await apiRequest("PATCH", `/api/work-orders/${workOrderId}/status`, { status });
      return status;
    },
    onSuccess: async () => {
      await invalidateWo();
      toast({ title: "Work order status updated successfully" });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to update status", description: e.message, variant: "destructive" });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async (scheduledAt: string) => {
      const res = await apiRequest("POST", `/api/work-orders/${workOrderId}/schedule`, {
        scheduledAt,
      });
      return res.json();
    },
    onSuccess: async (data: any) => {
      setScheduleOpen(false);
      await invalidateWo();
      toast({
        title: "Job scheduled",
        description:
          data?.warning ||
          (data?.emailed || data?.notified ? "Tenant notified" : "No tenant email on file"),
      });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to schedule job", description: e.message, variant: "destructive" });
    },
  });

  const arriveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/work-orders/${workOrderId}/arrive`);
      return res.json();
    },
    onSuccess: async () => {
      await invalidateWo();
      toast({ title: "Arrived on site", description: "Arrival recorded" });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to mark arrival", description: e.message, variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      setCompleteError(null);
      if (hasChecklist && requiredIncomplete > 0) {
        const msg =
          "Required steps must be finished before this work order can be marked completed.";
        setCompleteError(msg);
        throw new Error(msg);
      }
      let image = savedImage || parsedExisting?.image || null;
      if (!image && padRef.current && !padRef.current.isEmpty()) {
        image = padRef.current.toDataURL();
      }
      if (!image) {
        const msg = "Customer signature is required before completing this work order.";
        setCompleteError(msg);
        throw new Error(msg);
      }
      const payload = createSignatureValue(image, signerName.trim() || undefined);
      await apiRequest("PUT", `/api/work-orders/${workOrderId}/customer-signature`, payload);
      await apiRequest("PATCH", `/api/work-orders/${workOrderId}/status`, {
        status: "completed",
      });
    },
    onSuccess: async () => {
      await invalidateWo();
      toast({ title: "Work order completed" });
      setCompleteError(null);
    },
    onError: (err: Error) => {
      setCompleteError(err.message);
      toast({
        variant: "destructive",
        title: "Cannot complete",
        description: err.message,
      });
    },
  });

  const openScheduleDialog = () => {
    if (!workOrder) return;
    const existing = workOrder.scheduledAt ? new Date(workOrder.scheduledAt) : null;
    const base =
      existing && !Number.isNaN(existing.getTime()) && existing.getTime() >= Date.now() - 60_000
        ? existing
        : new Date();
    if (!existing) {
      base.setMinutes(0, 0, 0);
      if (base.getTime() < Date.now()) {
        base.setHours(base.getHours() + 1);
      }
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    setScheduleAtLocal(
      `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`,
    );
    setScheduleOpen(true);
  };

  const isClosed =
    workOrder?.status === "completed" || workOrder?.status === "rejected";

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !workOrder) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Button variant="ghost" asChild>
          <Link href={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to work orders
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {(error as Error)?.message || "Work order not found"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-3xl mx-auto" data-testid="page-work-order-detail">
      <PageHeader
        leading={
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link href={backHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        }
        title={workOrder.maintenanceRequest.title}
        description={
          [workOrder.property?.name, workOrder.block?.name].filter(Boolean).join(" · ") ||
          "Work order details"
        }
        actions={
          !isClosed ? (
            <Button
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              data-testid="button-mark-job-complete"
            >
              {completeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Completing…
                </>
              ) : (
                "Mark Job As Complete"
              )}
            </Button>
          ) : null
        }
      />

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            tone={priorityTone(workOrder.maintenanceRequest.priority)}
            appearance="soft"
            className="capitalize"
          >
            {workOrder.maintenanceRequest.priority}
          </StatusBadge>
          <StatusBadge
            tone={workOrderStatusTone(workOrder.status)}
            appearance="soft"
          >
            {formatWorkOrderStatus(workOrder.status)}
          </StatusBadge>
        </div>

        {workOrder.status === "pending_acceptance" && (
          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            Awaiting team acceptance — the first eligible team member to accept will be assigned.
          </div>
        )}

        {completeError && (
          <div
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            data-testid="text-complete-error"
          >
            {completeError}
          </div>
        )}

        {canFieldAct && !isClosed && workOrder.status !== "pending_acceptance" && (
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-sm font-medium">Update Status</Label>
            <Select
              value={workOrder.status}
              onValueChange={(status) => {
                if (status === "completed") {
                  completeMutation.mutate();
                  return;
                }
                updateStatusMutation.mutate(status);
              }}
            >
              <SelectTrigger
                className={cn(
                  "w-full sm:w-auto sm:min-w-[12rem] h-9 rounded-full text-xs font-medium",
                  toneClass(workOrderStatusTone(workOrder.status)),
                )}
                data-testid="select-work-order-status-detail"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="waiting_parts">Waiting Parts</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {workOrder.maintenanceRequest.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {workOrder.maintenanceRequest.description}
          </p>
        )}

        {workOrder.scheduledAt && (
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">Scheduled visit</p>
            <p className="text-muted-foreground">
              {new Date(workOrder.scheduledAt).toLocaleString(undefined, {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </p>
          </div>
        )}

        {workOrder.arrivedAt && (
          <div className="rounded-md border border-primary/25 bg-primary/[0.04] p-3 text-sm">
            <p className="font-medium">Arrived on site</p>
            <p className="text-muted-foreground">
              {new Date(workOrder.arrivedAt).toLocaleString(undefined, {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {canScheduleWorkOrder && !isClosed && canVisitAct(workOrder.authorisationStatus) && (
              <Button
                variant="outline"
                size="sm"
                onClick={openScheduleDialog}
                data-testid="button-schedule-work-order-detail"
              >
                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                {workOrder.scheduledAt ? "Reschedule" : "Schedule Job"}
              </Button>
            )}
          {canScheduleWorkOrder &&
            !isClosed &&
            canVisitAct(workOrder.authorisationStatus) &&
            !workOrder.arrivedAt && (
              <Button
                variant="outline"
                size="sm"
                disabled={arriveMutation.isPending}
                onClick={() => arriveMutation.mutate()}
                data-testid="button-arrive-work-order-detail"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                {arriveMutation.isPending ? "Recording…" : "Arrived on Site"}
              </Button>
            )}
        </div>

        {canScheduleWorkOrder &&
          !isClosed &&
          workOrder.authorisationStatus === "quote_required" && (
            <p className="text-xs text-muted-foreground">Accept quotation before scheduling</p>
          )}

        {!isClosed && (
          <div className="space-y-2">
            <Label>Completion checklist</Label>
            <Select
              value={workOrder.completionChecklistId || "__none__"}
              onValueChange={(v) => {
                assignChecklistMutation.mutate(v === "__none__" ? null : v);
              }}
            >
              <SelectTrigger data-testid="select-wo-detail-checklist">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {activeCompletionChecklists.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <WorkOrderCompletionChecklistPanel
          workOrderId={workOrder.id}
          readOnly={isClosed}
        />

        {!isClosed && (
          <div className="space-y-3 rounded-md border p-4">
            <div>
              <p className="text-sm font-medium">Complete job</p>
              <p className="text-xs text-muted-foreground">
                Finish required checklist steps and capture the customer signature, then mark the
                job complete.
              </p>
            </div>
            {hasChecklist && requiredIncomplete > 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                Required steps must be finished before this work order can be marked completed.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="customer-signer-name">Customer name (optional)</Label>
              <Input
                id="customer-signer-name"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Name of person signing"
                data-testid="input-customer-signer-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Customer signature</Label>
              {!editingPad && displayImage ? (
                <div className="space-y-2">
                  <img
                    src={displayImage}
                    alt="Customer signature"
                    className="w-full max-h-40 object-contain border rounded-md bg-white"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingPad(true);
                      setSavedImage(null);
                      setPadKey((k) => k + 1);
                    }}
                  >
                    Re-sign
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="border rounded-md bg-white overflow-hidden">
                    <SignatureCanvas
                      key={padKey}
                      ref={padRef}
                      canvasProps={{
                        className: "w-full h-36",
                        style: { width: "100%", height: 144 },
                      }}
                      backgroundColor="#ffffff"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        padRef.current?.clear();
                        setPadKey((k) => k + 1);
                      }}
                    >
                      Clear
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (!padRef.current || padRef.current.isEmpty()) {
                          toast({
                            variant: "destructive",
                            title: "Draw a signature first",
                          });
                          return;
                        }
                        setSavedImage(padRef.current.toDataURL());
                        setEditingPad(false);
                      }}
                    >
                      Use signature
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <Button
              className="w-full sm:w-auto"
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              data-testid="button-mark-job-complete-footer"
            >
              {completeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Completing…
                </>
              ) : (
                "Mark Job As Complete"
              )}
            </Button>
          </div>
        )}

        {isClosed &&
          (() => {
            const sig = parseSignatureValue(workOrder.customerSignatureJson);
            if (!sig?.image) return null;
            return (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Customer signature</p>
                {sig.signedByName && (
                  <p className="text-xs text-muted-foreground">{sig.signedByName}</p>
                )}
                <img
                  src={sig.image}
                  alt="Customer signature"
                  className="w-full max-h-32 object-contain bg-white rounded border"
                />
              </div>
            );
          })()}

        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Quotes & invoices</p>
          <WorkOrderQuotesInvoicesPanel workOrderId={workOrder.id} />
        </div>

        <WorkOrderCertificatePanel
          workOrderId={workOrder.id}
          propertyId={workOrder.maintenanceRequest.propertyId}
          blockId={workOrder.maintenanceRequest.blockId}
        />
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className={cn(dialogContentBase, "max-w-md")}>
          <DialogHeader>
            <DialogTitle>{workOrder.scheduledAt ? "Reschedule Job" : "Schedule Job"}</DialogTitle>
            <DialogDescription>
              Set a visit time. Active tenants will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-at-page">Visit date and time</Label>
              <Input
                id="schedule-at-page"
                type="datetime-local"
                value={scheduleAtLocal}
                onChange={(e) => setScheduleAtLocal(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setScheduleOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={scheduleMutation.isPending || !scheduleAtLocal}
                onClick={() => {
                  const when = new Date(scheduleAtLocal);
                  if (Number.isNaN(when.getTime())) {
                    toast({ title: "Invalid date/time", variant: "destructive" });
                    return;
                  }
                  scheduleMutation.mutate(when.toISOString());
                }}
              >
                {scheduleMutation.isPending ? "Saving…" : "Confirm schedule"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkOrderDetailPage;
