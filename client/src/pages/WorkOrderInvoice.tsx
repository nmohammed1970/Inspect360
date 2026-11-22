import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2 } from "lucide-react";
import { downloadPdfFromUrl } from "@/components/maintenance-quotes/downloadPdf";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MAINTENANCE_PAYMENT_METHODS } from "@shared/maintenanceQuoteConstants";
import { formatMoneyMinor } from "@/components/maintenance-quotes/quoteMoney";
import {
  QuoteLinesEditor,
  blankQuoteLine,
  type EditableQuoteLine,
} from "@/components/maintenance-quotes/QuoteLinesEditor";
import type {
  MaintenancePriceBookCategory,
  MaintenancePriceBookUnit,
  MaintenancePriceBookVatRate,
} from "@shared/maintenancePriceBookConstants";

type InvoiceDetail = {
  id: string;
  workOrderId: string;
  quoteId: string | null;
  status: string;
  invoiceReference: string;
  currency: string;
  recipientName: string | null;
  recipientEmail: string | null;
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
};

export default function WorkOrderInvoice() {
  const params = useParams<{ workOrderId: string; invoiceId: string }>();
  const workOrderId = params.workOrderId;
  const invoiceId = params.invoiceId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditableQuoteLine[]>([blankQuoteLine()]);
  const [hydrated, setHydrated] = useState<string | null>(null);

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
    setRecipientName(invoice.recipientName || "");
    setRecipientEmail(invoice.recipientEmail || "");
    setNotes(invoice.notes || "");
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

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/work-orders/${workOrderId}/invoices/${invoiceId}`, {
        recipientName: recipientName || null,
        recipientEmail: recipientEmail || null,
        notes: notes || null,
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

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
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

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-[1100px] mx-auto">
      <PageHeader
        icon={FileText}
        leading={
          <nav className="text-sm text-muted-foreground flex flex-wrap gap-1.5">
            <Link href="/maintenance" className="hover:text-foreground">
              Maintenance
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Invoice</span>
          </nav>
        }
        title={
          <span className="inline-flex items-center gap-2 flex-wrap">
            {invoice.invoiceReference}
            <Badge variant="outline" className="capitalize">
              {invoice.status}
            </Badge>
            <Badge variant="secondary" className="capitalize">
              {invoice.paymentStatus.replace(/_/g, " ")}
            </Badge>
          </span>
        }
        description={`Total ${formatMoneyMinor(invoice.totalMinor, invoice.currency)} · Paid ${formatMoneyMinor(invoice.paidMinor, invoice.currency)}`}
        actions={
          <>
            <Button
              variant="outline"
              disabled={pdfDownloading}
              onClick={() => void downloadPdf()}
              data-testid="button-download-invoice-pdf"
            >
              {pdfDownloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download PDF
            </Button>
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

      {lastPublicLink ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <p className="font-medium mb-1">Customer invoice link</p>
          <Input readOnly value={lastPublicLink} className="font-mono text-xs" />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Bill to customer</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  disabled={!editable}
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  disabled={!editable}
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
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
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
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
                        {m.replace(/_/g, " ")}
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
                  <div key={p.id} className="flex justify-between border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium">
                        {formatMoneyMinor(p.amountMinor, invoice.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {p.method.replace(/_/g, " ")} ·{" "}
                        {new Date(p.paidAt).toLocaleDateString()}
                      </p>
                    </div>
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
