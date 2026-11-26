import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Copy,
  Download,
  FileText,
  Link2,
  Loader2,
  MapPin,
  User as UserIcon,
  Wrench,
} from "lucide-react";
import { downloadPdfFromUrl } from "@/components/maintenance-quotes/downloadPdf";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PdfActionButton } from "@/components/PdfActionButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  MAINTENANCE_INVOICE_STATUS_LABELS,
  MAINTENANCE_PAYMENT_METHODS,
  MAINTENANCE_PAYMENT_METHOD_LABELS,
  MAINTENANCE_PAYMENT_STATUS_LABELS,
} from "@shared/maintenanceQuoteConstants";
import { formatMoneyMinor } from "@/components/maintenance-quotes/quoteMoney";
import {
  QuoteLinesEditor,
  blankQuoteLine,
  type EditableQuoteLine,
} from "@/components/maintenance-quotes/QuoteLinesEditor";
import { DocumentAttachmentsPanel } from "@/components/maintenance-quotes/DocumentAttachmentsPanel";
import type {
  MaintenancePriceBookCategory,
  MaintenancePriceBookUnit,
  MaintenancePriceBookVatRate,
} from "@shared/maintenancePriceBookConstants";
import { cn } from "@/lib/utils";

type InvoiceDetail = {
  id: string;
  workOrderId: string;
  quoteId: string | null;
  status: string;
  invoiceReference: string;
  currency: string;
  recipientUserId?: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientAddress: string | null;
  notes: string | null;
  dueAt: string | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  paymentStatus: string;
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
  }>;
  payments?: Array<{
    id: string;
    amountMinor: number;
    paidAt: string;
    method: string;
    reference: string | null;
    notes: string | null;
  }>;
  context?: {
    workOrderId: string;
    workOrderStatus: string | null;
    issueTitle: string;
    locationLabel: string;
    propertyName: string | null;
    propertyAddress: string | null;
    blockName: string | null;
    assigneeName: string | null;
  } | null;
};

export default function WorkOrderInvoice() {
  const params = useParams<{ workOrderId: string; invoiceId: string }>();
  const workOrderId = params.workOrderId;
  const invoiceId = params.invoiceId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const canEditRecipient =
    user?.role === "owner" || user?.role === "maintenance_admin";

  const { data: invoice, isLoading, error } = useQuery<InvoiceDetail>({
    queryKey: ["/api/work-orders", workOrderId, "invoices", invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/${workOrderId}/invoices/${invoiceId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to load invoice");
      }
      return res.json();
    },
    enabled: Boolean(workOrderId && invoiceId),
  });

  const editable = invoice?.status === "draft";
  const [recipientUserId, setRecipientUserId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [lines, setLines] = useState<EditableQuoteLine[]>([blankQuoteLine()]);
  const [hydrated, setHydrated] = useState<string | null>(null);

  type CustomerCandidate = {
    id: string;
    displayName: string;
    email: string | null;
    phone: string | null;
  };

  const candidatesQuery = useQuery<{
    candidates: CustomerCandidate[];
  }>({
    queryKey: ["/api/work-orders", workOrderId, "customer-candidates"],
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/${workOrderId}/customer-candidates`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load recipients");
      return res.json();
    },
    enabled: Boolean(workOrderId),
  });

  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState<(typeof MAINTENANCE_PAYMENT_METHODS)[number]>(
    "bank_transfer",
  );
  const [payRef, setPayRef] = useState("");
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [lastPublicLink, setLastPublicLink] = useState<string | null>(null);

  useEffect(() => {
    if (!invoice || hydrated === invoice.id) return;
    setRecipientUserId(invoice.recipientUserId || "");
    setRecipientName(invoice.recipientName || "");
    setRecipientEmail(invoice.recipientEmail || "");
    setRecipientPhone(invoice.recipientPhone || "");
    setRecipientAddress(invoice.recipientAddress || "");
    setNotes(invoice.notes || "");
    setDueAt(invoice.dueAt ? invoice.dueAt.slice(0, 10) : "");
    setLines(
      (invoice.lines || []).length
        ? (invoice.lines || []).map((line) => ({
            localId: line.id,
            name: line.name,
            description: line.description || "",
            sku: line.sku || "",
            category: line.category as MaintenancePriceBookCategory,
            unit: line.unit as MaintenancePriceBookUnit,
            quantity: Number(line.quantity) || 0,
            unitPriceMinor: line.unitPriceMinor,
            vatRate: line.vatRate as MaintenancePriceBookVatRate,
            priceBookItemId: null,
            linkedCatalogName: null,
          }))
        : [blankQuoteLine()],
    );
    setHydrated(invoice.id);
  }, [invoice, hydrated]);

  const applyCustomer = (userId: string) => {
    setRecipientUserId(userId);
    const candidate = candidatesQuery.data?.candidates.find((c) => c.id === userId);
    if (candidate) {
      setRecipientName(candidate.displayName);
      setRecipientEmail(candidate.email || "");
      setRecipientPhone(candidate.phone || "");
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/work-orders/${workOrderId}/invoices/${invoiceId}`, {
        recipientUserId: recipientUserId || null,
        recipientName: recipientName || null,
        recipientEmail: recipientEmail || null,
        recipientPhone: recipientPhone || null,
        recipientAddress: recipientAddress || null,
        notes: notes || null,
        dueAt: dueAt || null,
      });
      const res = await apiRequest(
        "PUT",
        `/api/work-orders/${workOrderId}/invoices/${invoiceId}/lines`,
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
          })),
        },
      );
      return res.json();
    },
    onSuccess: () => {
      setHydrated(null);
      queryClient.invalidateQueries({
        queryKey: ["/api/work-orders", workOrderId, "invoices", invoiceId],
      });
      toast({ title: "Invoice saved" });
    },
    onError: (e: Error) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (editable) await saveMutation.mutateAsync();
      const res = await apiRequest(
        "POST",
        `/api/work-orders/${workOrderId}/invoices/${invoiceId}/send`,
      );
      return res.json();
    },
    onSuccess: (data) => {
      setHydrated(null);
      setLastPublicLink(data.publicLink || null);
      queryClient.invalidateQueries({
        queryKey: ["/api/work-orders", workOrderId, "invoices", invoiceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/maintenance-finance/pending-count"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/maintenance-finance/tracking"],
      });
      if (data.emailSent === false) {
        toast({
          title: "Link created — email failed",
          description: data.emailError || "Share the public link manually.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Invoice sent", description: "Email includes PDF and view link." });
      }
    },
    onError: (e: Error) =>
      toast({ title: "Send failed", description: e.message, variant: "destructive" }),
  });

  const downloadPdf = async () => {
    try {
      setPdfDownloading(true);
      await downloadPdfFromUrl(
        `/api/work-orders/${workOrderId}/invoices/${invoiceId}/pdf`,
        `${invoice?.invoiceReference || "invoice"}.pdf`,
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

  const paymentMutation = useMutation({
    mutationFn: async () => {
      const amountMinor = Math.round(Number(payAmount) * 100);
      const res = await apiRequest(
        "POST",
        `/api/work-orders/${workOrderId}/invoices/${invoiceId}/payments`,
        {
          amountMinor,
          paidAt: payDate,
          method: payMethod,
          reference: payRef || null,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      setPayAmount("");
      setPayRef("");
      setHydrated(null);
      queryClient.invalidateQueries({
        queryKey: ["/api/work-orders", workOrderId, "invoices", invoiceId],
      });
      toast({ title: "Payment recorded" });
    },
    onError: (e: Error) =>
      toast({ title: "Payment failed", description: e.message, variant: "destructive" }),
  });

  const copyLink = async () => {
    if (!lastPublicLink) return;
    try {
      await navigator.clipboard.writeText(lastPublicLink);
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-destructive">
          {error instanceof Error ? error.message : "Invoice not found"}
        </p>
        <Button variant="outline" onClick={() => setLocation("/maintenance")}>
          Back
        </Button>
      </div>
    );
  }

  const outstanding = Math.max(0, invoice.totalMinor - invoice.paidMinor);
  const statusLabel =
    MAINTENANCE_INVOICE_STATUS_LABELS[invoice.status] || invoice.status.replace(/_/g, " ");
  const paymentLabel =
    MAINTENANCE_PAYMENT_STATUS_LABELS[invoice.paymentStatus] ||
    invoice.paymentStatus.replace(/_/g, " ");
  const breadcrumbProperty =
    invoice.context?.propertyName || invoice.context?.blockName || "Property";

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-[1400px] mx-auto">
      <PageHeader
        icon={FileText}
        leading={
          <nav className="text-sm text-muted-foreground flex flex-wrap gap-1.5">
            <Link href="/maintenance" className="hover:text-foreground">
              Maintenance
            </Link>
            <span>/</span>
            <span className="truncate max-w-[12rem]">{breadcrumbProperty}</span>
            <span>/</span>
            <Link
              href={`/maintenance?tab=work-orders`}
              className="hover:text-foreground"
            >
              Work orders
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Invoice</span>
          </nav>
        }
        title={
          <span className="inline-flex items-center gap-2 flex-wrap">
            {invoice.invoiceReference}
            <Badge variant="outline">{statusLabel}</Badge>
            <Badge variant="secondary">{paymentLabel}</Badge>
          </span>
        }
        description={
          invoice.context
            ? [invoice.context.issueTitle, invoice.context.locationLabel]
                .filter(Boolean)
                .join(" · ")
            : `Total ${formatMoneyMinor(invoice.totalMinor, invoice.currency)}`
        }
        actions={
          <>
            <PdfActionButton
              variant="outline"
              pending={pdfDownloading}
              onClick={() => void downloadPdf()}
              data-testid="button-download-invoice-pdf"
            >
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </PdfActionButton>
            {editable ? (
              <Button
                variant="outline"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                Save draft
              </Button>
            ) : null}
            {(invoice.status === "draft" || invoice.status === "sent") && (
              <Button disabled={sendMutation.isPending} onClick={() => sendMutation.mutate()}>
                {invoice.status === "sent" ? "Resend invoice" : "Send invoice"}
              </Button>
            )}
            {invoice.quoteId ? (
              <Button
                variant="outline"
                onClick={() =>
                  setLocation(`/work-orders/${workOrderId}/quotes/${invoice.quoteId}`)
                }
              >
                View quote
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          label="Invoice"
          title={statusLabel}
          detail={invoice.invoiceReference}
          icon={<FileText className="h-4 w-4 text-primary" />}
        />
        <SummaryTile
          label="Property / Block"
          title={invoice.context?.locationLabel || "—"}
          detail={invoice.context?.propertyAddress || invoice.context?.blockName || ""}
          icon={<MapPin className="h-4 w-4 text-primary" />}
        />
        <SummaryTile
          label="Assigned Engineer"
          title={invoice.context?.assigneeName || "Unassigned"}
          detail="Work Order Assignee"
          icon={<UserIcon className="h-4 w-4 text-primary" />}
        />
        <SummaryTile
          label="Amount due"
          title={formatMoneyMinor(outstanding, invoice.currency)}
          detail={`Total ${formatMoneyMinor(invoice.totalMinor, invoice.currency)} · Paid ${formatMoneyMinor(invoice.paidMinor, invoice.currency)}`}
          icon={<span className="text-primary font-semibold text-sm">Σ</span>}
          emphasize
        />
      </div>

      {lastPublicLink ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <Link2 className="h-4 w-4 text-primary" />
            Recipient invoice link
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input readOnly value={lastPublicLink} className="font-mono text-xs" />
            <Button type="button" variant="outline" onClick={() => void copyLink()}>
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Bill to recipient</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Recipient</Label>
                {editable && canEditRecipient ? (
                  <Select
                    value={recipientUserId || undefined}
                    onValueChange={applyCustomer}
                    disabled={candidatesQuery.isLoading}
                  >
                    <SelectTrigger data-testid="select-invoice-customer">
                      <SelectValue
                        placeholder={
                          candidatesQuery.isLoading ? "Loading…" : "Select recipient"
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
                  <Input value={recipientName} disabled />
                )}
                {canEditRecipient && !recipientUserId && recipientName ? (
                  <p className="text-xs text-muted-foreground">Current: {recipientName}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  disabled={!(editable && canEditRecipient)}
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  disabled={!(editable && canEditRecipient)}
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Due date</Label>
                <Input
                  type="date"
                  disabled={!editable}
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Address</Label>
                <Textarea
                  disabled={!(editable && canEditRecipient)}
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  disabled={!editable}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Lines</CardTitle>
            </CardHeader>
            <CardContent>
              <QuoteLinesEditor
                lines={lines}
                currency={invoice.currency}
                disabled={!editable}
                onChange={setLines}
                totalLabel="Total"
              />
            </CardContent>
          </Card>

          {workOrderId && invoiceId ? (
            <DocumentAttachmentsPanel
              workOrderId={workOrderId}
              documentType="invoice"
              documentId={invoiceId}
              canEdit={editable}
            />
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Totals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm tabular-nums">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatMoneyMinor(invoice.subtotalMinor, invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>VAT</span>
                <span>{formatMoneyMinor(invoice.taxMinor, invoice.currency)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-2">
                <span>Total</span>
                <span>{formatMoneyMinor(invoice.totalMinor, invoice.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Paid</span>
                <span>{formatMoneyMinor(invoice.paidMinor, invoice.currency)}</span>
              </div>
              <div className="flex justify-between font-semibold text-primary">
                <span>Outstanding</span>
                <span>{formatMoneyMinor(outstanding, invoice.currency)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Linked work order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">
                    {invoice.context?.issueTitle || "Maintenance work"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {invoice.context?.locationLabel || "—"}
                    {invoice.context?.workOrderStatus
                      ? ` · ${invoice.context.workOrderStatus.replace(/_/g, " ")}`
                      : ""}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setLocation("/maintenance?tab=work-orders")}
              >
                Back to work orders
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Record payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  disabled={invoice.status === "void"}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select
                  value={payMethod}
                  onValueChange={(v) =>
                    setPayMethod(v as (typeof MAINTENANCE_PAYMENT_METHODS)[number])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {MAINTENANCE_PAYMENT_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} />
              </div>
              <Button
                className="w-full"
                disabled={
                  !payAmount || paymentMutation.isPending || invoice.status === "void"
                }
                onClick={() => paymentMutation.mutate()}
              >
                {paymentMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Record payment
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Payment history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(invoice.payments || []).length === 0 ? (
                <p className="text-muted-foreground">No payments yet</p>
              ) : (
                (invoice.payments || []).map((p) => (
                  <div key={p.id} className="border-b pb-2 last:border-0 space-y-0.5">
                    <div className="flex justify-between gap-2">
                      <p className="font-medium">
                        {formatMoneyMinor(p.amountMinor, invoice.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.paidAt).toLocaleDateString("en-GB")}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {MAINTENANCE_PAYMENT_METHOD_LABELS[
                        p.method as (typeof MAINTENANCE_PAYMENT_METHODS)[number]
                      ] || p.method.replace(/_/g, " ")}
                      {p.reference ? ` · Ref ${p.reference}` : ""}
                    </p>
                    {p.notes ? (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                        {p.notes}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
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
