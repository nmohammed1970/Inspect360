import { useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { downloadPdfFromUrl } from "@/components/maintenance-quotes/downloadPdf";
import {
  PublicFinanceDocument,
  type PublicOrgBrandView,
  type PublicWorkView,
} from "@/components/maintenance-quotes/PublicFinanceDocument";
import { MAINTENANCE_QUOTE_STATUS_LABELS } from "@shared/maintenanceQuoteConstants";

type PublicQuotePayload = {
  quoteReference: string;
  versionNumber: number;
  status: string;
  currency: string;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientAddress: string | null;
  scopeDescription: string | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  expiresAt: string | null;
  canRespond: boolean;
  organization: PublicOrgBrandView;
  work: PublicWorkView | null;
  lines: Array<{
    name: string;
    description: string | null;
    quantity: number;
    unitPriceMinor: number;
    vatRate: string;
    lineNetMinor: number;
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
      <div className="min-h-screen flex items-center justify-center text-muted-foreground gap-2 bg-slate-100/80">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading quotation…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100/80">
        <p className="text-destructive">
          {error instanceof Error ? error.message : "Quotation unavailable"}
        </p>
      </div>
    );
  }

  if (done) {
    const label =
      MAINTENANCE_QUOTE_STATUS_LABELS[done] || done.replace(/_/g, " ");
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100/80">
        <Card className="max-w-md w-full shadow-sm">
          <CardHeader>
            <CardTitle>Thank you</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your response has been recorded ({label}). The organisation has been notified.
            </p>
          </CardContent>
        </Card>
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

  const expiresLabel = data.expiresAt
    ? new Date(data.expiresAt).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <PublicFinanceDocument
      organization={org}
      documentKind="quote"
      title="Quotation for your review"
      reference={data.quoteReference}
      versionLabel={`v${data.versionNumber}`}
      heroLabel="Proposed total"
      currency={data.currency}
      totalMinor={data.totalMinor}
      subtotalMinor={data.subtotalMinor}
      taxMinor={data.taxMinor}
      work={data.work}
      billToName={data.recipientName}
      billToEmail={data.recipientEmail}
      billToPhone={data.recipientPhone}
      billToAddress={data.recipientAddress}
      metaExtra={
        expiresLabel ? [{ label: "Link expires", value: expiresLabel }] : []
      }
      scopeOrNotes={data.scopeDescription}
      scopeTitle="Scope of work"
      lines={data.lines}
      pdfDownloading={pdfDownloading}
      pdfError={pdfError}
      onDownloadPdf={async () => {
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
      footerActions={
        data.canRespond ? (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your response</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Please review the quotation above. You can accept it, request changes, or decline.
                A note is required if you decline or request changes.
              </p>
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
                  {decideMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Accept quotation
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
          <Card className="shadow-sm">
            <CardContent className="py-4 text-sm text-muted-foreground">
              This quotation is no longer awaiting a response (
              {MAINTENANCE_QUOTE_STATUS_LABELS[data.status] ||
                data.status.replace(/_/g, " ")}
              ).
            </CardContent>
          </Card>
        )
      }
    />
  );
}
