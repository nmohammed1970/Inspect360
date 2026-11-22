import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
  User as UserIcon,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  MAINTENANCE_QUOTE_STATUS_LABELS,
  isQuoteEditable,
} from "@shared/maintenanceQuoteConstants";
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
  if (status === "pending_owner_approval") {
    return "bg-amber-100 text-amber-900 border-amber-200";
  }
  if (status === "approved" || status === "customer_accepted") {
    return "bg-emerald-100 text-emerald-900 border-emerald-200";
  }
  return "bg-muted text-foreground";
}

function statusLabel(status: string): string {
  return MAINTENANCE_QUOTE_STATUS_LABELS[status] || status;
}

function approvalStepIndex(status: string): number {
  if (status === "draft") return 0;
  if (status === "pending_owner_approval" || status === "owner_changes_requested") return 1;
  if (status === "approved" || status === "sent") return 3;
  return 2;
}

function linesFromServer(quote: QuoteDetail): EditableQuoteLine[] {
  const rows = quote.lines || [];
  if (rows.length === 0) return ensureMinBlankLine([]);
  return rows.map((line) => ({
    localId: line.id,
    name: line.name || "",
    description: line.description || "",
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
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [lines, setLines] = useState<EditableQuoteLine[]>([blankQuoteLine()]);
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  useEffect(() => {
    if (!quote || hydratedId === quote.id) return;
    setScopeDescription(quote.scopeDescription || "");
    setEngineerNotes(quote.engineerNotes || "");
    setValidUntil(
      quote.validUntil ? new Date(quote.validUntil).toISOString().slice(0, 10) : "",
    );
    setRecipientName(quote.recipientName || "");
    setRecipientEmail(quote.recipientEmail || "");
    setLines(linesFromServer(quote));
    setHydratedId(quote.id);
  }, [quote, hydratedId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/work-orders/${workOrderId}/quotes/${quoteId}`, {
        scopeDescription: scopeDescription || null,
        engineerNotes: engineerNotes || null,
        validUntil: validUntil || null,
        recipientName: recipientName || null,
        recipientEmail: recipientEmail || null,
      });
      const res = await apiRequest(
        "PUT",
        `/api/work-orders/${workOrderId}/quotes/${quoteId}/lines`,
        {
          lines: lines.map((line) => ({
            name: line.name,
            description: line.description || null,
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
      toast({ title: "Draft saved" });
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
        recipientName: recipientName || null,
        recipientEmail: recipientEmail || null,
      });
      await apiRequest(
        "PUT",
        `/api/work-orders/${workOrderId}/quotes/${quoteId}/lines`,
        {
          lines: lines.map((line) => ({
            name: line.name,
            description: line.description || null,
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

  const breadcrumbProperty = quote?.context?.propertyName || quote?.context?.blockName || "Property";
  const subtitle = useMemo(() => {
    if (!quote) return null;
    const bits = [
      quote.context?.issueTitle,
      quote.context?.propertyAddress || quote.context?.locationLabel,
      `Version ${quote.versionNumber}`,
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
            Repair quotation
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
              disabled={!editable || saveMutation.isPending || submitMutation.isPending}
              onClick={() => saveMutation.mutate()}
              data-testid="button-save-quote-draft"
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save draft
            </Button>
            <Button
              disabled={!editable || submitMutation.isPending || saveMutation.isPending}
              onClick={() => submitMutation.mutate()}
              data-testid="button-submit-quote"
            >
              {submitMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Submit for approval
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="Quotation"
          title={statusLabel(quote.status)}
          detail={`${quote.quoteReference} · v${quote.versionNumber}`}
          icon={<FileText className="h-4 w-4 text-primary" />}
        />
        <SummaryTile
          label="Property / block"
          title={quote.context?.locationLabel || "—"}
          detail={quote.context?.propertyAddress || quote.context?.blockName || ""}
          icon={<MapPin className="h-4 w-4 text-primary" />}
        />
        <SummaryTile
          label="Assigned engineer"
          title={quote.context?.assigneeName || "Unassigned"}
          detail="Work order assignee"
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
                  : "Owner can approve or request changes in a later phase. Editing is locked while pending."}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 min-w-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quotation details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Quote number</Label>
                <Input value={quote.quoteReference} readOnly className="bg-muted/40" />
              </div>
              <div className="space-y-1.5">
                <Label>Prepared by</Label>
                <Input
                  value={quote.preparedByName || "—"}
                  readOnly
                  className="bg-muted/40"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="valid-until">Valid until</Label>
                <Input
                  id="valid-until"
                  type="date"
                  disabled={!editable}
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="recipient-name">Recipient</Label>
                <Input
                  id="recipient-name"
                  disabled={!editable}
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Customer / landlord name"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="recipient-email">Recipient email</Label>
                <Input
                  id="recipient-email"
                  type="email"
                  disabled={!editable}
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="Optional until send"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Scope of work</CardTitle>
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
              <CardTitle className="text-base">Itemised quotation</CardTitle>
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
              <CardTitle className="text-base">Engineer notes</CardTitle>
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
                <CardTitle className="text-base">Approval route</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  Manager approval required
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
                Owner approve / request changes lands in a later phase. Staff use{" "}
                <span className="font-medium text-foreground">Submit for approval</span> here.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" />
                Linked work order
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
