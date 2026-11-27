import { useEffect, useRef, useState, type ReactNode } from "react";
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
  FileText,
  Loader2,
  Building2,
  Globe,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { createSignatureValue, parseSignatureValue } from "@shared/signature";
import { PageHeader } from "@/components/PageHeader";
import { LinkedCasesPanel } from "@/components/communications/LinkedCasesPanel";
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
import { dialogContentBase, pagePad } from "@/lib/responsive";
import { getTeamRoleDisplayLabel } from "@shared/roleLabels";
import { isExpiryDateInPast, parseCertificateExpiryDate } from "@shared/workOrderCertificates";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface WorkOrderDetail {
  id: string;
  status: string;
  slaDue?: string | null;
  scheduledAt?: string | null;
  arrivedAt?: string | null;
  authorisationStatus?: string | null;
  completionChecklistId?: string | null;
  customerSignatureJson?: unknown;
  teamId?: string | null;
  assignedToId?: string | null;
  contractorId?: string | null;
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
  contractor?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    companyName?: string | null;
  } | null;
  assignedToUser?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;
  team?: { id?: string; name?: string; email?: string } | null;
}

type MemberAddress = {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  formatted?: string;
};

type AssignedMember = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  profileImageUrl?: string | null;
  address?: MemberAddress | string | null;
  skills?: string[] | null;
  qualifications?: string[] | null;
  education?: string | null;
  certificateUrls?: string[] | null;
  companyName?: string | null;
  jobTitle?: string | null;
  website?: string | null;
  notes?: string | null;
  source?: "user" | "contact";
};

type ContactProfile = {
  id: string;
  type?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  countryCode?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  website?: string | null;
  notes?: string | null;
  profileImageUrl?: string | null;
  linkedUserId?: string | null;
};

const contactTypeLabels: Record<string, string> = {
  internal: "Internal",
  contractor: "Maintenance Contractor",
  lead: "Lead",
  company: "Company",
  partner: "Partner",
  vendor: "Vendor",
  tenant: "Tenant",
  landlord: "Landlord",
  other: "Other",
};

type MemberDocument = {
  id: string;
  documentName: string;
  fileUrl: string;
  expiryDate?: string | null;
};

function memberDisplayName(member: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim();
  return name || member.email || "Team member";
}

function memberInitials(member: AssignedMember): string {
  const parts = [member.firstName, member.lastName].filter(Boolean) as string[];
  if (parts.length === 0) return (member.email || "?").slice(0, 1).toUpperCase();
  return parts.map((part) => part.slice(0, 1).toUpperCase()).join("").slice(0, 2);
}

function formatMemberAddress(address: AssignedMember["address"]): string | null {
  if (!address) return null;
  if (typeof address === "string") return address.trim() || null;
  if (address.formatted?.trim()) return address.formatted.trim();
  const line = [address.street, address.city, address.state, address.postalCode, address.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
  return line || null;
}

function formatExpiryLabel(value: string | null | undefined): string | null {
  const ymd = parseCertificateExpiryDate(value);
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function assigneeTarget(workOrder: WorkOrderDetail): { contactId: string | null; userId: string | null } | null {
  const label = detailAssigneeLabel(workOrder);
  if (!label || label === "Awaiting team acceptance") return null;
  const contactId = workOrder.contractor?.id || workOrder.contractorId || null;
  if (contactId) return { contactId, userId: null };
  const userId = workOrder.assignedToUser?.id || workOrder.assignedToId || null;
  if (!userId) return null;
  return { contactId: null, userId };
}

function contactToMember(contact: ContactProfile): AssignedMember {
  const phone = [contact.countryCode, contact.phone].filter(Boolean).join(" ").trim();
  return {
    id: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: phone || null,
    role: contact.jobTitle || contactTypeLabels[contact.type || ""] || "Contractor",
    profileImageUrl: contact.profileImageUrl,
    address: {
      street: contact.address || undefined,
      city: contact.city || undefined,
      state: contact.state || undefined,
      postalCode: contact.postalCode || undefined,
      country: contact.country || undefined,
    },
    companyName: contact.companyName,
    jobTitle: contact.jobTitle,
    website: contact.website,
    notes: contact.notes,
    source: "contact",
  };
}

const detailAssigneeLabel = (workOrder: WorkOrderDetail): string | null => {
  const contractorName = [workOrder.contractor?.firstName, workOrder.contractor?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (workOrder.contractor?.id || workOrder.contractorId) {
    if (contractorName) return contractorName;
    if (workOrder.contractor?.companyName) return workOrder.contractor.companyName;
  }
  const userName = [workOrder.assignedToUser?.firstName, workOrder.assignedToUser?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (userName) return userName;
  if (workOrder.status === "pending_acceptance") return "Awaiting team acceptance";
  return null;
};


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
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const padRef = useRef<SignatureCanvas>(null);

  const canUpdateStatus =
    user?.role === "owner" || user?.role === "maintenance_admin";
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

  const target = workOrder && assigneeOpen ? assigneeTarget(workOrder) : null;
  const { data: contactProfile, isLoading: contactLoading } = useQuery<ContactProfile>({
    queryKey: ["/api/contacts", target?.contactId],
    queryFn: async () => {
      const res = await fetch(`/api/contacts/${target?.contactId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load contact");
      return res.json();
    },
    enabled: !!target?.contactId,
    retry: false,
  });
  const linkedUserId = contactProfile?.linkedUserId || null;
  const profileUserId = target?.userId || linkedUserId;
  const { data: userProfile, isLoading: userLoading, isError: userError } = useQuery<AssignedMember>({
    queryKey: ["/api/users", profileUserId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${profileUserId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load team member");
      return res.json();
    },
    enabled: !!profileUserId && (!target?.contactId || !!contactProfile),
    retry: false,
  });
  const fallbackContactId =
    !target?.contactId && userError && target?.userId ? target.userId : null;
  const { data: fallbackContact, isLoading: fallbackLoading } = useQuery<ContactProfile>({
    queryKey: ["/api/contacts", fallbackContactId, "fallback"],
    queryFn: async () => {
      const res = await fetch(`/api/contacts/${fallbackContactId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load contact");
      return res.json();
    },
    enabled: !!fallbackContactId,
    retry: false,
  });
  const activeContact = contactProfile || fallbackContact || null;
  const contactMember = activeContact ? contactToMember(activeContact) : null;
  const assignedMember: AssignedMember | null = contactMember
    ? {
        ...contactMember,
        skills: userProfile?.skills,
        qualifications: userProfile?.qualifications,
        education: userProfile?.education,
        certificateUrls: userProfile?.certificateUrls,
        phone: contactMember.phone || userProfile?.phone,
        profileImageUrl: contactMember.profileImageUrl || userProfile?.profileImageUrl,
      }
    : userProfile
      ? { ...userProfile, source: "user" }
      : null;
  const documentUserId = activeContact ? linkedUserId : profileUserId;
  const { data: memberDocuments = [], isLoading: documentsLoading } = useQuery<MemberDocument[]>({
    queryKey: ["/api/users", documentUserId, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${documentUserId}/documents`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!documentUserId,
  });
  const memberLoading =
    (!!target?.contactId && contactLoading) ||
    (!!profileUserId && userLoading && !userError) ||
    (!!fallbackContactId && fallbackLoading);

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
  const quoteRequired = workOrder?.authorisationStatus === "quote_required";
  const canMarkComplete =
    !isClosed &&
    !quoteRequired &&
    workOrder?.status !== "pending_acceptance";

  if (isLoading) {
    return (
      <div className={cn("container mx-auto min-w-0 space-y-4", pagePad)}>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !workOrder) {
    return (
      <div className={cn("container mx-auto min-w-0 space-y-4", pagePad)}>
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
    <div className={cn("container mx-auto min-w-0 space-y-6", pagePad)} data-testid="page-work-order-detail">
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
          canMarkComplete ? (
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

      {workOrderId ? (
        <LinkedCasesPanel entityType="work_order" entityId={workOrderId} />
      ) : null}
      {workOrder.maintenanceRequest?.id ? (
        <LinkedCasesPanel
          entityType="maintenance_request"
          entityId={workOrder.maintenanceRequest.id}
        />
      ) : null}

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

        <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1.5">
          {workOrder.team?.name && (
            <p>
              <span className="text-muted-foreground">Team:</span>{" "}
              <span className="font-semibold text-foreground">{workOrder.team.name}</span>
            </p>
          )}
          <p data-testid="text-wo-detail-assignee">
            <span className="text-muted-foreground">Assigned to:</span>{" "}
            {assigneeTarget(workOrder) ? (
              <button
                type="button"
                className="font-semibold text-foreground underline decoration-primary/50 underline-offset-4 hover:decoration-primary"
                onClick={() => setAssigneeOpen(true)}
                data-testid="button-open-assignee"
              >
                {detailAssigneeLabel(workOrder)}
              </button>
            ) : (
              <span className="font-semibold text-foreground">
                {detailAssigneeLabel(workOrder) || "Unassigned"}
              </span>
            )}
          </p>
        </div>

        {workOrder.status === "pending_acceptance" && (
          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            Awaiting team acceptance — the first eligible team member to accept will be assigned.
          </div>
        )}

        {quoteRequired && !isClosed && (
          <div
            className="rounded-md border border-dashed p-3 text-sm text-muted-foreground"
            data-testid="text-quote-required-blocker"
          >
            Quotation must be accepted before scheduling or completing.
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

        {canUpdateStatus && !isClosed && workOrder.status !== "pending_acceptance" && (
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
                {!quoteRequired && (
                  <SelectItem value="completed">Completed</SelectItem>
                )}
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

      <Sheet open={assigneeOpen} onOpenChange={setAssigneeOpen}>
        <SheetContent className="w-[min(92vw,36rem)] sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {assignedMember?.source === "contact" ? "Contractor" : "Team member"}
            </SheetTitle>
            <SheetDescription>
              {assignedMember
                ? memberDisplayName(assignedMember)
                : detailAssigneeLabel(workOrder) || "Assigned person"}
            </SheetDescription>
          </SheetHeader>
          {memberLoading || (documentsLoading && !!documentUserId) ? (
            <Loader2 className="mt-8 h-6 w-6 animate-spin text-muted-foreground" />
          ) : assignedMember ? (
            <AssigneeProfile
              member={assignedMember}
              documents={memberDocuments}
              teamName={workOrder.team?.name}
            />
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">
              This person’s profile could not be loaded.
            </p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

function AssigneeProfile({
  member,
  documents,
  teamName,
}: {
  member: AssignedMember;
  documents: MemberDocument[];
  teamName?: string | null;
}) {
  const address = formatMemberAddress(member.address);
  const skills = (member.skills || []).filter(Boolean);
  const qualifications = (member.qualifications || []).filter(Boolean);
  const knownFiles = new Set(documents.map((doc) => doc.fileUrl));
  const extraFiles = (member.certificateUrls || []).filter(
    (url) => url && !knownFiles.has(url),
  );

  return (
    <div className="mt-5 space-y-5 text-sm">
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          {member.profileImageUrl ? (
            <AvatarImage src={member.profileImageUrl} alt="" />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
            {memberInitials(member)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">
            {memberDisplayName(member)}
          </p>
          <p className="truncate text-muted-foreground">
            {[
              member.source === "contact"
                ? member.role
                : member.role
                  ? getTeamRoleDisplayLabel(member.role)
                  : null,
              member.companyName,
              teamName,
            ]
              .filter(Boolean)
              .join(" · ") || "Team member"}
          </p>
        </div>
      </div>

      <ProfileSection title="Contact">
        {member.email ? (
          <ProfileRow icon={<Mail className="h-4 w-4" />} label="Email" value={member.email} />
        ) : null}
        {member.phone ? (
          <ProfileRow icon={<Phone className="h-4 w-4" />} label="Phone" value={member.phone} />
        ) : null}
        {member.companyName ? (
          <ProfileRow icon={<Building2 className="h-4 w-4" />} label="Company" value={member.companyName} />
        ) : null}
        {member.website ? (
          <ProfileRow icon={<Globe className="h-4 w-4" />} label="Website" value={member.website} />
        ) : null}
        {!member.email && !member.phone && !member.companyName ? (
          <p className="text-muted-foreground">No contact details on file.</p>
        ) : null}
      </ProfileSection>

      {address ? (
        <ProfileSection title="Address">
          <ProfileRow icon={<MapPin className="h-4 w-4" />} label="Address" value={address} />
        </ProfileSection>
      ) : null}

      {skills.length > 0 ? (
        <ProfileSection title="Skills">
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <Badge key={skill} variant="secondary" className="font-normal">
                {skill}
              </Badge>
            ))}
          </div>
        </ProfileSection>
      ) : null}

      {member.notes?.trim() ? (
        <ProfileSection title="Notes">
          <p className="whitespace-pre-wrap text-foreground">{member.notes.trim()}</p>
        </ProfileSection>
      ) : null}

      {member.education?.trim() ? (
        <ProfileSection title="Experience">
          <p className="whitespace-pre-wrap text-foreground">{member.education.trim()}</p>
        </ProfileSection>
      ) : null}

      {qualifications.length > 0 ? (
        <ProfileSection title="Qualifications">
          <ul className="list-disc space-y-1 pl-4 text-foreground">
            {qualifications.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </ProfileSection>
      ) : null}

      <ProfileSection title="Certificates">
        {documents.length === 0 && extraFiles.length === 0 ? (
          <p className="text-muted-foreground">No certificates on file.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => {
              const expiry = formatExpiryLabel(doc.expiryDate);
              const expired = !!doc.expiryDate && isExpiryDateInPast(doc.expiryDate);
              return (
                <div key={doc.id} className="rounded-md border px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-foreground">{doc.documentName}</p>
                    {expired ? <Badge variant="destructive">Expired</Badge> : null}
                  </div>
                  {expiry ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">Expires {expiry}</p>
                  ) : null}
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    View document
                  </a>
                </div>
              );
            })}
            {extraFiles.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-md border px-3 py-2 font-medium text-foreground hover:bg-muted/50"
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                View certificate
              </a>
            ))}
          </div>
        )}
      </ProfileSection>
    </div>
  );
}

function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">{children}</div>
    </section>
  );
}

function ProfileRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

export default WorkOrderDetailPage;
