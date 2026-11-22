import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { downloadPdfFromUrl } from "@/components/maintenance-quotes/downloadPdf";
import {
  PublicFinanceDocument,
  type PublicOrgBrandView,
  type PublicWorkView,
} from "@/components/maintenance-quotes/PublicFinanceDocument";
import {
  MAINTENANCE_INVOICE_STATUS_LABELS,
  MAINTENANCE_PAYMENT_STATUS_LABELS,
} from "@shared/maintenanceQuoteConstants";

type PublicInvoicePayload = {
  invoiceReference: string;
  status: string;
  currency: string;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientAddress: string | null;
  notes: string | null;
  dueAt: string | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paymentStatus: string;
  paidMinor: number;
  organization: PublicOrgBrandView;
  work: PublicWorkView | null;
  lines: Array<{
    name: string;
    description: string | null;
    quantity: number;
    unitPriceMinor: number;
    vatRate?: string;
    lineNetMinor: number;
  }>;
};

export default function PublicInvoice() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<PublicInvoicePayload>({
    queryKey: ["/api/public/maintenance-invoices", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/maintenance-invoices/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Link invalid");
      }
      return res.json();
    },
    enabled: Boolean(token),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-muted-foreground bg-slate-100/80">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading invoice…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-destructive bg-slate-100/80">
        {error instanceof Error ? error.message : "Invoice unavailable"}
      </div>
    );
  }

  const org = data.organization || {
    displayName: "Inspect360",
    logoUrl: null,
    email: null,
    phone: null,
    address: null,
  };

  const outstanding = Math.max(0, (data.totalMinor || 0) - (data.paidMinor || 0));
  const dueLabel = data.dueAt
    ? new Date(data.dueAt).toLocaleDateString("en-GB", { dateStyle: "medium" })
    : null;
  const paymentLabel =
    MAINTENANCE_PAYMENT_STATUS_LABELS[data.paymentStatus] ||
    data.paymentStatus.replace(/_/g, " ");
  const statusLabel =
    MAINTENANCE_INVOICE_STATUS_LABELS[data.status] || data.status.replace(/_/g, " ");

  return (
    <PublicFinanceDocument
      organization={org}
      documentKind="invoice"
      title={`Invoice from ${org.displayName}`}
      reference={data.invoiceReference}
      heroLabel="Amount due"
      currency={data.currency}
      totalMinor={data.totalMinor}
      subtotalMinor={data.subtotalMinor}
      taxMinor={data.taxMinor}
      outstandingMinor={outstanding}
      paymentStatusLabel={paymentLabel}
      paidMinor={data.paidMinor}
      work={data.work}
      billToName={data.recipientName}
      billToEmail={data.recipientEmail}
      billToPhone={data.recipientPhone}
      billToAddress={data.recipientAddress}
      metaExtra={[
        { label: "Status", value: statusLabel },
        ...(dueLabel ? [{ label: "Due by", value: dueLabel }] : []),
      ]}
      scopeOrNotes={data.notes}
      scopeTitle="Notes"
      lines={data.lines}
      pdfDownloading={pdfDownloading}
      pdfError={pdfError}
      onDownloadPdf={async () => {
        try {
          setPdfError(null);
          setPdfDownloading(true);
          await downloadPdfFromUrl(
            `/api/public/maintenance-invoices/${token}/pdf`,
            `${data.invoiceReference}.pdf`,
            { credentials: "omit" },
          );
        } catch (e) {
          setPdfError(e instanceof Error ? e.message : "Download failed");
        } finally {
          setPdfDownloading(false);
        }
      }}
    />
  );
}
