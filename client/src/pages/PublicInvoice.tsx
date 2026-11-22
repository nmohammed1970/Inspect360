import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { formatMoneyMinor } from "@/components/maintenance-quotes/quoteMoney";
import { downloadPdfFromUrl } from "@/components/maintenance-quotes/downloadPdf";

type PublicInvoicePayload = {
  invoiceReference: string;
  status: string;
  currency: string;
  recipientName: string | null;
  notes: string | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paymentStatus: string;
  paidMinor: number;
  lines: Array<{
    name: string;
    description: string | null;
    quantity: number;
    unitPriceMinor: number;
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
      <div className="min-h-screen flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading invoice…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-destructive">
        {error instanceof Error ? error.message : "Invoice unavailable"}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background p-4 md:p-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Invoice</p>
            <h1 className="text-2xl font-heading font-bold">{data.invoiceReference}</h1>
            {data.recipientName ? (
              <p className="text-sm text-muted-foreground mt-1">Bill to {data.recipientName}</p>
            ) : null}
            <p className="text-sm mt-1 capitalize">
              Payment: {data.paymentStatus.replace(/_/g, " ")} · Paid{" "}
              {formatMoneyMinor(data.paidMinor, data.currency)} of{" "}
              {formatMoneyMinor(data.totalMinor, data.currency)}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={pdfDownloading}
            onClick={async () => {
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
          >
            {pdfDownloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download PDF
          </Button>
        </div>
        {pdfError ? <p className="text-sm text-destructive">{pdfError}</p> : null}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Line items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.lines.map((line, i) => (
              <div key={i} className="flex justify-between gap-4 text-sm border-b pb-2 last:border-0">
                <div>
                  <p className="font-medium">{line.name || "Item"}</p>
                  {line.description ? (
                    <p className="text-xs text-muted-foreground">{line.description}</p>
                  ) : null}
                </div>
                <p className="tabular-nums font-medium">
                  {formatMoneyMinor(line.lineNetMinor, data.currency)}
                </p>
              </div>
            ))}
            <div className="space-y-1 text-sm pt-2">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatMoneyMinor(data.subtotalMinor, data.currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>VAT</span>
                <span>{formatMoneyMinor(data.taxMinor, data.currency)}</span>
              </div>
              <div className="flex justify-between font-semibold text-base">
                <span>Total</span>
                <span>{formatMoneyMinor(data.totalMinor, data.currency)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {data.notes ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">{data.notes}</CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
