import { useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Download, Loader2 } from "lucide-react";
import { formatMoneyMinor } from "@/components/maintenance-quotes/quoteMoney";
import { downloadPdfFromUrl } from "@/components/maintenance-quotes/downloadPdf";

type PublicQuotePayload = {
  quoteReference: string;
  versionNumber: number;
  status: string;
  currency: string;
  recipientName: string | null;
  scopeDescription: string | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  canRespond: boolean;
  lines: Array<{
    name: string;
    description: string | null;
    quantity: number;
    unitPriceMinor: number;
    lineNetMinor: number;
    vatRate: string;
  }>;
};

export default function PublicQuote() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<PublicQuotePayload>({
    queryKey: ["/api/public/maintenance-quotes", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/maintenance-quotes/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Link invalid");
      }
      return res.json();
    },
    enabled: Boolean(token),
  });

  const decideMutation = useMutation({
    mutationFn: async (action: "accept" | "decline" | "request-changes") => {
      const res = await fetch(`/api/public/maintenance-quotes/${token}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed");
      }
      return res.json();
    },
    onSuccess: (body) => setDone(body.status || "recorded"),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading quotation…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-destructive">
          {error instanceof Error ? error.message : "Quotation unavailable"}
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Thank you</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your response has been recorded ({done.replace(/_/g, " ")}).
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background p-4 md:p-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Quotation</p>
            <h1 className="text-2xl font-heading font-bold">
              {data.quoteReference}
              <span className="text-base font-normal text-muted-foreground ml-2">
                v{data.versionNumber}
              </span>
            </h1>
            {data.recipientName ? (
              <p className="text-sm text-muted-foreground mt-1">For {data.recipientName}</p>
            ) : null}
          </div>
          <Button
            variant="outline"
            disabled={pdfDownloading}
            onClick={async () => {
              try {
                setPdfError(null);
                setPdfDownloading(true);
                await downloadPdfFromUrl(
                  `/api/public/maintenance-quotes/${token}/pdf`,
                  `${data.quoteReference}.pdf`,
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

        {data.scopeDescription ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Scope</CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">
              {data.scopeDescription}
            </CardContent>
          </Card>
        ) : null}

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
                  <p className="text-xs text-muted-foreground">
                    {line.quantity} × {formatMoneyMinor(line.unitPriceMinor, data.currency)}
                  </p>
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

        {data.canRespond ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your response</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional note (required if declining or requesting changes)"
                rows={3}
              />
              {decideMutation.error ? (
                <p className="text-sm text-destructive">
                  {decideMutation.error instanceof Error
                    ? decideMutation.error.message
                    : "Failed"}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={decideMutation.isPending}
                  onClick={() => decideMutation.mutate("accept")}
                >
                  Accept
                </Button>
                <Button
                  variant="outline"
                  disabled={decideMutation.isPending}
                  onClick={() => decideMutation.mutate("request-changes")}
                >
                  Request changes
                </Button>
                <Button
                  variant="destructive"
                  disabled={decideMutation.isPending}
                  onClick={() => decideMutation.mutate("decline")}
                >
                  Decline
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">
            This quotation is no longer awaiting a response (status: {data.status}).
          </p>
        )}
      </div>
    </div>
  );
}
