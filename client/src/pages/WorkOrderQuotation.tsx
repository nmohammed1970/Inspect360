import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Loader2,
  MapPin,
  User as UserIcon,
  Wrench,
} from "lucide-react";
import { downloadPdfFromUrl } from "@/components/maintenance-quotes/downloadPdf";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  MAINTENANCE_QUOTE_STATUS_LABELS,
  isQuoteEditable,
  isQuoteRevisable,
} from "@shared/maintenanceQuoteConstants";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  MaintenancePriceBookCategory,
  MaintenancePriceBookUnit,
  MaintenancePriceBookVatRate,
} from "@shared/maintenancePriceBookConstants";
import {
  QuoteLinesEditor,
  blankQuoteLine,
  ensureMinBlankLine,
  type EditableQuoteLine,
} from "@/components/maintenance-quotes/QuoteLinesEditor";
import { formatMoneyMinor } from "@/components/maintenance-quotes/quoteMoney";
import { cn } from "@/lib/utils";

type QuoteDetail = {
  id: string;
  workOrderId: string;
  status: string;
  quoteNumber: number;
  quoteReference: string;
  versionNumber: number;
  currency: string;
  recipientUserId?: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientAddress: string | null;
  scopeDescription: string | null;
  engineerNotes: string | null;
  validUntil: string | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  preparedByName: string | null;
  submittedAt: string | null;
  lines?: Array<{
    id: string;
    name: string;
    description: string | null;
    sku: string | null;
    category: string;
    unit: string;
    quantity: number;
    unitPriceMinor: number;
    vatRate: string;
    priceBookItemId: string | null;
  }>;
  context: {
    workOrderId: string;
    workOrderStatus: string;
    issueTitle: string;
    locationLabel: string;
    propertyId: string | null;
    propertyName: string | null;
    propertyAddress: string | null;
    blockId: string | null;
    blockName: string | null;
    assigneeName: string | null;
  } | null;
};

function statusBadgeClass(status: string): string {
  if (status === "draft") return "bg-slate-100 text-slate-800 border-slate-200";
  if (status === "pending_owner_approval" || status === "sent") {
    return "bg-amber-100 text-amber-900 border-amber-200";
  }
  if (status === "owner_approved" || status === "accepted" || status === "converted") {
    return "bg-emerald-100 text-emerald-900 border-emerald-200";
  }
  if (status === "owner_rejected" || status === "declined") {
    return "bg-red-100 text-red-900 border-red-200";
  }
  return "bg-muted text-foreground";
}

function statusLabel(status: string): string {
  return MAINTENANCE_QUOTE_STATUS_LABELS[status] || status;
}

function approvalStepIndex(status: string): number {
  if (status === "draft" || status === "owner_changes_requested") return 0;
  if (status === "pending_owner_approval") return 1;
  if (status === "owner_approved") return 2;
  if (
    status === "sent" ||
    status === "accepted" ||
    status === "converted" ||
    status === "declined" ||
    status === "customer_changes_requested"
  ) {
    return 3;
  }
  return 1;
}

function linesFromServer(quote: QuoteDetail): EditableQuoteLine[] {
  const rows = quote.lines || [];
  if (rows.length === 0) return ensureMinBlankLine([]);
  return rows.map((line) => ({
    localId: line.id,
    name: line.name || "",
    description: line.description || "",
    sku: line.sku || "",
    category: line.category as MaintenancePriceBookCategory,
    unit: line.unit as MaintenancePriceBookUnit,
    quantity: Number(line.quantity) || 0,
    unitPriceMinor: line.unitPriceMinor || 0,
    vatRate: line.vatRate as MaintenancePriceBookVatRate,
    priceBookItemId: line.priceBookItemId,
    linkedCatalogName: line.priceBookItemId ? line.name : null,
  }));
}

export default function WorkOrderQuotation() {
  const params = useParams<{ workOrderId: string; quoteId: string }>();
  const workOrderId = params.workOrderId;
  const quoteId = params.quoteId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isOwner =
    user?.role === "owner" || user?.role === "maintenance_admin";
  const canEditRecipient = isOwner;
  const canConvertQuote = isOwner || user?.role === "contractor";
  const [decisionOpen, setDecisionOpen] = useState<"reject" | "request_changes" | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [lastPublicLink, setLastPublicLink] = useState<string | null>(null);
  const [lastEmailSent, setLastEmailSent] = useState<boolean | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  const invalidateQuote = () => {
    queryClient.invalidateQueries({
      queryKey: ["/api/work-orders", workOrderId, "quotes", quoteId],
    });
  };

  const { data: quote, isLoading, error } = useQuery<QuoteDetail>({
    queryKey: ["/api/work-orders", workOrderId, "quotes", quoteId],
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/${workOrderId}/quotes/${quoteId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to load quotation");
      }
      return res.json();
    },
    enabled: Boolean(workOrderId && quoteId),
  });

  const editable = quote ? isQuoteEditable(quote.status) : false;

  const [scopeDescription, setScopeDescription] = useState("");
  const [engineerNotes, setEngineerNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [recipientUserId, setRecipientUserId] = useState<string>("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [lines, setLines] = useState<EditableQuoteLine[]>([blankQuoteLine()]);
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  type CustomerCandidate = {
    id: string;
    displayName: string;
    email: string | null;
    phone: string | null;
    role: string;
  };

  const candidatesQuery = useQuery<{
    candidates: CustomerCandidate[];
    defaultRecipient: { recipientUserId: string | null } | null;
  }>({
    queryKey: ["/api/work-orders", workOrderId, "customer-candidates"],
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/${workOrderId}/customer-candidates`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load customers");
      return res.json();
    },
    enabled: Boolean(workOrderId),
  });

  useEffect(() => {
    if (!quote || hydratedId === quote.id) return;
    setScopeDescription(quote.scopeDescription || "");
    setEngineerNotes(quote.engineerNotes || "");
    setValidUntil(
      quote.validUntil ? new Date(quote.validUntil).toISOString().slice(0, 10) : "",
    );
    setRecipientUserId(quote.recipientUserId || "");
    setRecipientName(quote.recipientName || "");
    setRecipientEmail(quote.recipientEmail || "");
    setLines(linesFromServer(quote));
    setHydratedId(quote.id);
  }, [quote, hydratedId]);

  const applyCustomer = (userId: string) => {
    setRecipientUserId(userId);
    const candidate = candidatesQuery.data?.candidates.find((c) => c.id === userId);
    if (candidate) {
      setRecipientName(candidate.displayName);
      setRecipientEmail(candidate.email || "");
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/work-orders/${workOrderId}/quotes/${quoteId}`, {
        scopeDescription: scopeDescription || null,
        engineerNotes: engineerNotes || null,
        validUntil: validUntil || null,
        ...(canEditRecipient
          ? {
              recipientUserId: recipientUserId || null,
              recipientName: recipientName || null,
              recipientEmail: recipientEmail || null,
            }
          : {}),
      });
      const res = await apiRequest(
        "PUT",
        `/api/work-orders/${workOrderId}/quotes/${quoteId}/lines`,
        {
          lines: lines.map((line) => ({
            name: line.name,
            description: line.description || null,
            sku: line.sku || null,
            category: line.category,
            unit: line.unit,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            vatRate: line.vatRate,
            priceBookItemId: line.priceBookItemId,
          })),
        },
      );
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        ["/api/work-orders", workOrderId, "quotes", quoteId],
        (prev: QuoteDetail | undefined) =>
          prev
            ? {
                ...prev,
                ...data,
                preparedByName: prev.preparedByName,
                context: prev.context,
              }
            : data,
      );
      setHydratedId(null);
      toast({ title: "Draft Saved" });
    },
    onError: (e: Error) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/work-orders/${workOrderId}/quotes/${quoteId}`, {
        scopeDescription: scopeDescription || null,
        engineerNotes: engineerNotes || null,
        validUntil: validUntil || null,
        ...(canEditRecipient
          ? {
              recipientUserId: recipientUserId || null,
              recipientName: recipientName || null,
              recipientEmail: recipientEmail || null,
            }
          : {}),
      });
      await apiRequest(
        "PUT",
        `/api/work-orders/${workOrderId}/quotes/${quoteId}/lines`,
        {
          lines: lines.map((line) => ({
            name: line.name,
            description: line.description || null,
            sku: line.sku || null,
            category: line.category,
            unit: line.unit,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            vatRate: line.vatRate,
            priceBookItemId: line.priceBookItemId,
          })),
        },
      );
      const res = await apiRequest(
        "POST",
        `/api/work-orders/${workOrderId}/quotes/${quoteId}/submit`,
      );
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        ["/api/work-orders", workOrderId, "quotes", quoteId],
        (prev: QuoteDetail | undefined) =>
          prev
            ? {
                ...prev,
                ...data,
                preparedByName: prev.preparedByName,
                context: prev.context,
              }
            : data,
      );
      setHydratedId(null);
      toast({ title: "Submitted for approval" });
    },
    onError: (e: Error) => {
      toast({ title: "Submit failed", description: e.message, variant: "destructive" });
    },
  });

  const ownerDecisionMutation = useMutation({
    mutationFn: async (payload: {
      decision: "approve" | "reject" | "request_changes";
      reason?: string;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/work-orders/${workOrderId}/quotes/${quoteId}/owner-decision`,
        payload,
      );
      return res.json();
    },
    onSuccess: () => {
      setDecisionOpen(null);
      setDecisionReason("");
      setHydratedId(null);
      invalidateQuote();
      toast({ title: "Decision recorded" });
    },
    onError: (e: Error) =>
      toast({ title: "Decision failed", description: e.message, variant: "destructive" }),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/work-orders/${workOrderId}/quotes/${quoteId}`, {
        recipientUserId: recipientUserId || null,
        recipientName: recipientName || null,
        recipientEmail: recipientEmail || null,
      });
      const res = await apiRequest(
        "POST",
        `/api/work-orders/${workOrderId}/quotes/${quoteId}/send`,
      );
      return res.json();
    },
    onSuccess: (data) => {
      setHydratedId(null);
      invalidateQuote();
      setLastPublicLink(data.publicLink || null);
      setLastEmailSent(data.emailSent !== false);
      if (data.emailSent === false) {
        toast({
          title: "Link created — email failed",
          description: data.emailError || "Copy the public link below and share it manually.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sent to customer",
          description: "Email includes the PDF and a secure response link.",
        });
      }
    },
    onError: (e: Error) =>
      toast({ title: "Send failed", description: e.message, variant: "destructive" }),
  });

  const downloadPdf = async () => {
    try {
      setPdfDownloading(true);
      await downloadPdfFromUrl(
        `/api/work-orders/${workOrderId}/quotes/${quoteId}/pdf`,
        `${quote?.quoteReference || "quote"}.pdf`,
      );
    } catch (e) {
      toast({
        title: "PDF download failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setPdfDownloading(false);
    }
  };

  const reviseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/work-orders/${workOrderId}/quotes/${quoteId}/revise`,
      );
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Revision draft created" });
      setLocation(`/work-orders/${workOrderId}/quotes/${data.id}`);
    },
    onError: (e: Error) =>
      toast({ title: "Revise failed", description: e.message, variant: "destructive" }),
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/work-orders/${workOrderId}/quotes/${quoteId}/convert-to-invoice`,
      );
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/work-orders", workOrderId, "quotes"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/work-orders", workOrderId, "invoices"],
      });
      toast({ title: "Invoice draft created" });
      setLocation(`/work-orders/${workOrderId}/invoices/${data.id}`);
    },
    onError: (e: Error) =>
      toast({ title: "Convert failed", description: e.message, variant: "destructive" }),
  });

  const breadcrumbProperty = quote?.context?.propertyName || quote?.context?.blockName || "Property";
  const subtitle = useMemo(() => {
    if (!quote) return null;
    const bits = [
      quote.context?.issueTitle,
      quote.context?.propertyAddress || quote.context?.locationLabel,
    ].filter(Boolean);
    return bits.join(" · ");
  }, [quote]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-destructive">
          {error instanceof Error ? error.message : "Quotation not found"}
        </p>
        <Button variant="outline" onClick={() => setLocation("/maintenance?tab=work-orders")}>
          Back to maintenance
        </Button>
      </div>
    );
  }

  const step = approvalStepIndex(quote.status);
  const steps = ["Draft", "Submitted", "Review", "Approved"] as const;

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-[1400px] mx-auto">
      <PageHeader
        icon={FileText}
        leading={
          <nav className="text-sm text-muted-foreground flex flex-wrap items-center gap-1.5">
            <Link href="/properties" className="hover:text-foreground">
              All properties
            </Link>
            <span>/</span>
            <span className="text-foreground/80">{breadcrumbProperty}</span>
            <span>/</span>
            <Link href="/maintenance" className="hover:text-foreground">
              Maintenance
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Quotation</span>
          </nav>
        }
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            Repair Quotation
            <Badge
              variant="outline"
              className={cn("text-sm font-medium", statusBadgeClass(quote.status))}
              data-testid="badge-quote-status"
            >
              {statusLabel(quote.status)}
            </Badge>
          </span>
        }
        description={subtitle}
        actions={
          <>
            <Button
              variant="outline"
              disabled={pdfDownloading}
              onClick={() => void downloadPdf()}
              data-testid="button-download-quote-pdf"
            >
              {pdfDownloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download PDF
            </Button>
            {editable ? (
              <>
                <Button
                  variant="outline"
                  disabled={saveMutation.isPending || submitMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                  data-testid="button-save-quote-draft"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Save Draft
                </Button>
                <Button
                  disabled={submitMutation.isPending || saveMutation.isPending}
                  onClick={() => submitMutation.mutate()}
                  data-testid="button-submit-quote"
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Submit for Approval
                </Button>
              </>
            ) : null}
            {isOwner && quote.status === "pending_owner_approval" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setDecisionOpen("request_changes")}
                  data-testid="button-quote-request-changes"
                >
                  Request Changes
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setDecisionOpen("reject")}
                  data-testid="button-quote-reject"
                >
                  Reject
                </Button>
                <Button
                  disabled={ownerDecisionMutation.isPending}
                  onClick={() => ownerDecisionMutation.mutate({ decision: "approve" })}
                  data-testid="button-quote-approve"
                >
                  Approve Quotation
                </Button>
              </>
            ) : null}
            {isOwner && (quote.status === "owner_approved" || quote.status === "sent") ? (
              <Button
                disabled={sendMutation.isPending}
                onClick={() => sendMutation.mutate()}
                data-testid="button-quote-send"
              >
                {quote.status === "sent" ? "Resend to Customer" : "Send to Customer"}
              </Button>
            ) : null}
            {isQuoteRevisable(quote.status) ? (
              <Button
                variant="outline"
                disabled={reviseMutation.isPending}
                onClick={() => reviseMutation.mutate()}
                data-testid="button-quote-revise"
              >
                Create revision
              </Button>
            ) : null}
            {canConvertQuote && quote.status === "accepted" ? (
              <Button
                disabled={convertMutation.isPending}
                onClick={() => convertMutation.mutate()}
                data-testid="button-quote-convert"
              >
                Convert to invoice
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="Quotation"
          title={statusLabel(quote.status)}
          detail={`${quote.quoteReference}`}
          icon={<FileText className="h-4 w-4 text-primary" />}
        />
        <SummaryTile
          label="Property / Block"
          title={quote.context?.locationLabel || "—"}
          detail={quote.context?.propertyAddress || quote.context?.blockName || ""}
          icon={<MapPin className="h-4 w-4 text-primary" />}
        />
        <SummaryTile
          label="Assigned Engineer"
          title={quote.context?.assigneeName || "Unassigned"}
          detail="Work Order Assignee"
          icon={<UserIcon className="h-4 w-4 text-primary" />}
        />
        <SummaryTile
          label="Estimated total"
          title={formatMoneyMinor(quote.totalMinor, quote.currency)}
          detail="Includes VAT"
          icon={<span className="text-primary font-semibold text-sm">Σ</span>}
          emphasize
        />
      </div>

      {(quote.status === "draft" || quote.status === "pending_owner_approval") && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
          <div className="flex gap-2 items-start">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold">
                {quote.status === "draft"
                  ? "Quotation needs approval before work starts"
                  : "Awaiting owner approval"}
              </p>
              <p className="text-sm text-amber-900/80">
                {quote.status === "draft"
                  ? "Save your lines, then submit for approval so an owner can review."
                  : "Owner can approve or request changes. Editing is locked while pending."}
              </p>
            </div>
          </div>
        </div>
      )}

      {lastPublicLink ? (
        <div
          className={cn(
            "rounded-xl border px-4 py-3",
            lastEmailSent === false
              ? "border-destructive/40 bg-destructive/5"
              : "border-primary/20 bg-primary/5",
          )}
        >
          <p className="font-semibold text-sm mb-1">
            {lastEmailSent === false
              ? "Customer Link Ready (email was not delivered)"
              : "Customer Link"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input readOnly value={lastPublicLink} className="font-mono text-xs flex-1 min-w-[200px]" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(lastPublicLink);
                toast({ title: "Link copied" });
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy link
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 min-w-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quotation Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Quote Number</Label>
                <Input value={quote.quoteReference} readOnly className="bg-muted/40" />
              </div>
              <div className="space-y-1.5">
                <Label>Prepared By</Label>
                <Input
                  value={quote.preparedByName || "—"}
                  readOnly
                  className="bg-muted/40"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="valid-until">Valid Until</Label>
                <Input
                  id="valid-until"
                  type="date"
                  disabled={!editable}
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <Label>Customer</Label>
                {canEditRecipient &&
                (editable ||
                  quote.status === "owner_approved" ||
                  quote.status === "sent") ? (
                  <Select
                    value={recipientUserId || undefined}
                    onValueChange={applyCustomer}
                    disabled={candidatesQuery.isLoading}
                  >
                    <SelectTrigger data-testid="select-quote-customer">
                      <SelectValue
                        placeholder={
                          candidatesQuery.isLoading
                            ? "Loading…"
                            : "Select customer"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(candidatesQuery.data?.candidates || []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.displayName}
                          {c.email ? ` (${c.email})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={recipientName} disabled className="bg-muted/40" />
                )}
                {canEditRecipient && !recipientUserId && recipientName ? (
                  <p className="text-xs text-muted-foreground">
                    Current: {recipientName}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="recipient-email">Customer Email</Label>
                <Input
                  id="recipient-email"
                  type="email"
                  disabled={
                    !(
                      canEditRecipient &&
                      (editable ||
                        quote.status === "owner_approved" ||
                        quote.status === "sent")
                    )
                  }
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="Required before send"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Scope of Work</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                disabled={!editable}
                rows={4}
                value={scopeDescription}
                onChange={(e) => setScopeDescription(e.target.value)}
                placeholder="Describe the proposed works and exclusions…"
                data-testid="textarea-quote-scope"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Itemised Quotation</CardTitle>
            </CardHeader>
            <CardContent>
              <QuoteLinesEditor
                lines={lines}
                currency={quote.currency}
                disabled={!editable}
                onChange={setLines}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Engineer Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                disabled={!editable}
                rows={3}
                value={engineerNotes}
                onChange={(e) => setEngineerNotes(e.target.value)}
                placeholder="Internal notes for the team…"
                data-testid="textarea-quote-notes"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Approval Route</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  Manager Approval Required
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ol className="flex items-center gap-1">
                {steps.map((label, i) => {
                  const done = i <= step;
                  const current = i === step;
                  return (
                    <li key={label} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
                          done
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted text-muted-foreground",
                          current && "ring-2 ring-primary/30",
                        )}
                      >
                        {done && i < step ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          i + 1
                        )}
                      </div>
                      <span className="text-[10px] text-center text-muted-foreground">
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Requested by</dt>
                  <dd>{quote.preparedByName || "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Submitted</dt>
                  <dd>
                    {quote.submittedAt
                      ? new Date(quote.submittedAt).toLocaleString()
                      : "Not yet"}
                  </dd>
                </div>
              </dl>
              <p className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2 text-xs text-muted-foreground">
                Owner approval and customer acceptance are separate. Sending creates a secure
                customer link; convert is available only after the customer accepts.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" />
                Linked Work Order
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{quote.context?.issueTitle || "Work order"}</p>
              <p className="text-muted-foreground">
                {quote.context?.locationLabel}
                {quote.context?.propertyAddress
                  ? ` · ${quote.context.propertyAddress}`
                  : ""}
              </p>
              <p className="text-muted-foreground capitalize">
                Status: {quote.context?.workOrderStatus?.replace(/_/g, " ") || "—"}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2"
                onClick={() => setLocation("/maintenance?tab=work-orders")}
              >
                View work order
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={!!decisionOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDecisionOpen(null);
            setDecisionReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionOpen === "reject" ? "Reject Quotation" : "Request Changes"}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={decisionReason}
            onChange={(e) => setDecisionReason(e.target.value)}
            placeholder="Reason (required)"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionOpen(null)}>
              Cancel
            </Button>
            <Button
              disabled={!decisionReason.trim() || ownerDecisionMutation.isPending}
              onClick={() => {
                if (!decisionOpen) return;
                ownerDecisionMutation.mutate({
                  decision: decisionOpen,
                  reason: decisionReason.trim(),
                });
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const SummaryTile = ({
  label,
  title,
  detail,
  icon,
  emphasize,
}: {
  label: string;
  title: string;
  detail?: string;
  icon: ReactNode;
  emphasize?: boolean;
}) => (
  <Card className="overflow-hidden">
    <CardContent className="p-4 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className={cn("font-semibold leading-snug", emphasize && "text-lg text-primary")}>
        {title}
      </p>
      {detail ? <p className="text-xs text-muted-foreground line-clamp-2">{detail}</p> : null}
    </CardContent>
  </Card>
);
