import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FileText, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/hooks/useAuth";
import { formatMoneyMinor } from "@/components/maintenance-quotes/quoteMoney";
import {
  isQuoteEditable,
  MAINTENANCE_QUOTE_STATUS_LABELS,
} from "@shared/maintenanceQuoteConstants";

interface QuoteListItem {
  id: string;
  quoteReference: string;
  status: string;
  currency: string;
  totalMinor: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface InvoiceListItem {
  id: string;
  invoiceReference: string;
  status: string;
  paymentStatus?: string | null;
  currency: string;
  totalMinor: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface WorkOrderFinanceLinksProps {
  workOrderId: string;
}

function quoteStatusLabel(status: string): string {
  return MAINTENANCE_QUOTE_STATUS_LABELS[status] || status.replace(/_/g, " ");
}

function sortTime(iso?: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function newestFirst<T extends { updatedAt?: string | null; createdAt?: string | null }>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      sortTime(b.updatedAt || b.createdAt) - sortTime(a.updatedAt || a.createdAt),
  );
}

/** Prefer editable draft, else newest active (skip superseded/cancelled when others exist). */
function pickOpenQuote(quotes: QuoteListItem[]): QuoteListItem | null {
  if (quotes.length === 0) return null;
  const byRecency = newestFirst(quotes);
  const editable = byRecency.find((q) => isQuoteEditable(q.status));
  if (editable) return editable;
  const active = byRecency.filter(
    (q) => q.status !== "superseded" && q.status !== "cancelled",
  );
  return active[0] || byRecency[0] || null;
}

function pickOpenInvoice(invoices: InvoiceListItem[]): InvoiceListItem | null {
  if (invoices.length === 0) return null;
  return newestFirst(invoices)[0] || null;
}

export const WorkOrderFinanceLinks = ({ workOrderId }: WorkOrderFinanceLinksProps) => {
  const { user } = useAuth();
  const isOwner =
    user?.role === "owner" || user?.role === "maintenance_admin";
  const [, setLocation] = useLocation();

  const quotesQuery = useQuery<QuoteListItem[]>({
    queryKey: ["/api/work-orders", workOrderId, "quotes"],
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/${workOrderId}/quotes`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load quotations");
      return res.json();
    },
  });

  const invoicesQuery = useQuery<InvoiceListItem[]>({
    queryKey: ["/api/work-orders", workOrderId, "invoices"],
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/${workOrderId}/invoices`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load invoices");
      return res.json();
    },
  });

  const quotes = quotesQuery.data || [];
  const invoices = invoicesQuery.data || [];

  const openQuote = useMemo(() => pickOpenQuote(quotes), [quotes]);
  const openInvoice = useMemo(() => pickOpenInvoice(invoices), [invoices]);
  const historyQuotes = useMemo(() => newestFirst(quotes), [quotes]);

  if (quotesQuery.isLoading || invoicesQuery.isLoading) {
    return (
      <div className="flex flex-wrap gap-2 w-full pt-1">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
    );
  }

  if (quotesQuery.error || invoicesQuery.error) {
    return (
      <p className="text-xs text-destructive pt-1 w-full">
        Could not load quotes or invoices
      </p>
    );
  }

  return (
    <div className="w-full space-y-2 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        {quotes.length === 0 ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setLocation(`/work-orders/${workOrderId}/quotes/new`)}
            data-testid={`button-new-quotation-${workOrderId}`}
          >
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            New quotation
          </Button>
        ) : openQuote ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() =>
              setLocation(`/work-orders/${workOrderId}/quotes/${openQuote.id}`)
            }
            data-testid={`button-open-quote-${workOrderId}`}
          >
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Open quote
          </Button>
        ) : null}

        {isOwner &&
          (invoices.length === 0 ? (
            <Button
              size="sm"
              className="h-8"
              onClick={() => setLocation(`/work-orders/${workOrderId}/invoices/new`)}
              data-testid={`button-new-invoice-${workOrderId}`}
            >
              <Receipt className="h-3.5 w-3.5 mr-1.5" />
              New invoice
            </Button>
          ) : openInvoice ? (
            <Button
              size="sm"
              className="h-8"
              onClick={() =>
                setLocation(`/work-orders/${workOrderId}/invoices/${openInvoice.id}`)
              }
              data-testid={`button-open-invoice-${workOrderId}`}
            >
              <Receipt className="h-3.5 w-3.5 mr-1.5" />
              Open invoice
            </Button>
          ) : null)}
      </div>

      {historyQuotes.length > 0 ? (
        <Accordion type="single" collapsible className="w-full border rounded-md px-3">
          <AccordionItem value="quote-history" className="border-b-0">
            <AccordionTrigger className="py-2 text-sm hover:no-underline">
              <span className="flex items-center gap-2">
                Quote history
                <Badge variant="secondary" className="text-xs font-normal">
                  {historyQuotes.length}
                </Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-2">
              <ul className="space-y-1.5">
                {historyQuotes.map((q) => (
                  <li key={q.id}>
                    <button
                      type="button"
                      className="w-full text-left rounded-md border px-2.5 py-2 hover:bg-muted/50 transition-colors"
                      onClick={() =>
                        setLocation(`/work-orders/${workOrderId}/quotes/${q.id}`)
                      }
                      data-testid={`link-quote-history-${q.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{q.quoteReference}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatMoneyMinor(q.totalMinor, q.currency)}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 capitalize text-xs">
                          {quoteStatusLabel(q.status)}
                        </Badge>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  );
};
