import type { ReactNode } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoneyMinor } from "@/components/maintenance-quotes/quoteMoney";
import { MAINTENANCE_PRICE_BOOK_VAT_LABELS } from "@shared/maintenancePriceBookConstants";
import { cn } from "@/lib/utils";

export interface PublicOrgBrandView {
  displayName: string;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export interface PublicWorkView {
  issueTitle: string;
  locationLabel: string;
  propertyAddress?: string | null;
}

export interface PublicLineView {
  name: string;
  description?: string | null;
  quantity: number;
  unitPriceMinor: number;
  vatRate?: string | null;
  lineNetMinor: number;
}

interface MetaItem {
  label: string;
  value: string;
}

interface PublicFinanceDocumentProps {
  organization: PublicOrgBrandView;
  documentKind: "quote" | "invoice";
  title: string;
  reference: string;
  versionLabel?: string | null;
  heroLabel: string;
  currency: string;
  totalMinor: number;
  subtotalMinor: number;
  taxMinor: number;
  outstandingMinor?: number | null;
  paymentStatusLabel?: string | null;
  paidMinor?: number | null;
  work?: PublicWorkView | null;
  billToName?: string | null;
  billToEmail?: string | null;
  billToPhone?: string | null;
  billToAddress?: string | null;
  metaExtra?: MetaItem[];
  scopeOrNotes?: string | null;
  scopeTitle?: string;
  lines: PublicLineView[];
  pdfDownloading?: boolean;
  pdfError?: string | null;
  onDownloadPdf: () => void;
  footerActions?: ReactNode;
}

function vatLabel(vatRate?: string | null): string {
  if (!vatRate) return "—";
  return (
    (MAINTENANCE_PRICE_BOOK_VAT_LABELS as Record<string, string>)[vatRate] ||
    vatRate.replace(/_/g, " ")
  );
}

export const PublicFinanceDocument = ({
  organization,
  documentKind,
  title,
  reference,
  versionLabel,
  heroLabel,
  currency,
  totalMinor,
  subtotalMinor,
  taxMinor,
  outstandingMinor,
  paymentStatusLabel,
  paidMinor,
  work,
  billToName,
  billToEmail,
  billToPhone,
  billToAddress,
  metaExtra = [],
  scopeOrNotes,
  scopeTitle = "Notes",
  lines,
  pdfDownloading,
  pdfError,
  onDownloadPdf,
  footerActions,
}: PublicFinanceDocumentProps) => {
  const contactBits = [organization.email, organization.phone].filter(Boolean).join(" · ");
  const meta: MetaItem[] = [
    ...(work?.issueTitle ? [{ label: "Work", value: work.issueTitle }] : []),
    ...(work?.locationLabel
      ? [
          {
            label: "Location",
            value: [work.locationLabel, work.propertyAddress].filter(Boolean).join(" — "),
          },
        ]
      : []),
    ...(billToName ? [{ label: "Bill to", value: billToName }] : []),
    ...(billToEmail ? [{ label: "Email", value: billToEmail }] : []),
    ...(billToPhone ? [{ label: "Phone", value: billToPhone }] : []),
    ...(billToAddress ? [{ label: "Address", value: billToAddress }] : []),
    ...metaExtra,
  ];

  return (
    <div className="min-h-screen bg-slate-100/80 py-6 px-4 md:py-10 md:px-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b-4 border-primary bg-gradient-to-br from-primary/10 via-white to-white px-6 py-6 md:px-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                {organization.logoUrl ? (
                  <img
                    src={organization.logoUrl}
                    alt={organization.displayName}
                    className="h-14 w-auto max-w-[160px] object-contain"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-teal-700 text-lg font-bold text-white">
                    {organization.displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary tracking-wide">
                    {organization.displayName}
                  </p>
                  {contactBits ? (
                    <p className="text-xs text-muted-foreground mt-0.5">{contactBits}</p>
                  ) : null}
                  {organization.address ? (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {organization.address}
                    </p>
                  ) : null}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={pdfDownloading}
                onClick={onDownloadPdf}
                className="shrink-0"
              >
                {pdfDownloading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Download PDF
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  {documentKind === "quote" ? "Quotation" : "Invoice"}
                </p>
                <h1 className="text-2xl md:text-3xl font-heading font-bold text-slate-900 mt-1">
                  {title}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {reference}
                  {versionLabel ? ` · ${versionLabel}` : ""}
                </p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-primary to-teal-700 px-5 py-4 text-white min-w-[11rem] text-right shadow-sm">
                <p className="text-[11px] uppercase tracking-wider opacity-90">{heroLabel}</p>
                <p className="text-2xl font-bold tabular-nums mt-1">
                  {formatMoneyMinor(totalMinor, currency)}
                </p>
                {paymentStatusLabel ? (
                  <p className="text-xs mt-1 opacity-90">
                    {paymentStatusLabel}
                    {typeof paidMinor === "number"
                      ? ` · Paid ${formatMoneyMinor(paidMinor, currency)}`
                      : ""}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {pdfError ? (
            <p className="px-6 pt-3 text-sm text-destructive md:px-8">{pdfError}</p>
          ) : null}

          {meta.length > 0 ? (
            <div className="grid gap-4 border-b border-slate-100 px-6 py-5 sm:grid-cols-2 md:px-8">
              {meta.map((item) => (
                <div key={`${item.label}-${item.value}`}>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                    {item.label}
                  </p>
                  <p className="text-sm font-medium text-slate-800 mt-0.5 whitespace-pre-wrap">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {scopeOrNotes ? (
            <div className="border-b border-slate-100 px-6 py-5 md:px-8">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
                {scopeTitle}
              </p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{scopeOrNotes}</p>
            </div>
          ) : null}

          <div className="px-6 py-5 md:px-8">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-3">
              Itemised breakdown
            </p>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-semibold">Item</th>
                    <th className="px-3 py-2.5 font-semibold text-center">Qty</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Unit</th>
                    <th className="px-3 py-2.5 font-semibold text-right">VAT</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                        No line items
                      </td>
                    </tr>
                  ) : (
                    lines.map((line, i) => (
                      <tr
                        key={i}
                        className={cn(
                          "border-t border-slate-100",
                          i % 2 === 1 && "bg-slate-50/40",
                        )}
                      >
                        <td className="px-3 py-3 align-top">
                          <p className="font-medium text-slate-900">{line.name || "Item"}</p>
                          {line.description ? (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {line.description}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums align-top">
                          {line.quantity}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums align-top whitespace-nowrap">
                          {formatMoneyMinor(line.unitPriceMinor, currency)}
                        </td>
                        <td className="px-3 py-3 text-right text-xs text-muted-foreground align-top whitespace-nowrap">
                          {vatLabel(line.vatRate)}
                        </td>
                        <td className="px-3 py-3 text-right font-medium tabular-nums align-top whitespace-nowrap">
                          {formatMoneyMinor(line.lineNetMinor, currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 ml-auto max-w-xs space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
              <div className="flex justify-between gap-6 text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatMoneyMinor(subtotalMinor, currency)}</span>
              </div>
              <div className="flex justify-between gap-6 text-muted-foreground">
                <span>VAT</span>
                <span className="tabular-nums">{formatMoneyMinor(taxMinor, currency)}</span>
              </div>
              <div className="flex justify-between gap-6 border-t border-primary/20 pt-2 font-semibold text-base">
                <span>Total</span>
                <span className="tabular-nums text-primary">
                  {formatMoneyMinor(totalMinor, currency)}
                </span>
              </div>
              {typeof outstandingMinor === "number" ? (
                <div className="flex justify-between gap-6 pt-1 font-medium">
                  <span>Amount outstanding</span>
                  <span className="tabular-nums">
                    {formatMoneyMinor(outstandingMinor, currency)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {footerActions ? <div className="space-y-3">{footerActions}</div> : null}

        <p className="text-center text-xs text-muted-foreground pb-4">
          Sent by {organization.displayName} via Inspect360
        </p>
      </div>
    </div>
  );
};
