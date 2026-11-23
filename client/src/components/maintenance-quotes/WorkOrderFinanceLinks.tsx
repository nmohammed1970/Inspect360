import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FileText, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoneyMinor } from "@/components/maintenance-quotes/quoteMoney";
import { MAINTENANCE_QUOTE_STATUS_LABELS } from "@shared/maintenanceQuoteConstants";

interface QuoteListItem {
  id: string;
  quoteReference: string;
  status: string;
  currency: string;
  totalMinor: number;
}

interface InvoiceListItem {
  id: string;
  invoiceReference: string;
  status: string;
  paymentStatus?: string | null;
  currency: string;
  totalMinor: number;
}

interface WorkOrderFinanceLinksProps {
  workOrderId: string;
}

function quoteStatusLabel(status: string): string {
  return MAINTENANCE_QUOTE_STATUS_LABELS[status] || status.replace(/_/g, " ");
}

export const WorkOrderFinanceLinks = ({ workOrderId }: WorkOrderFinanceLinksProps) => {
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

  if (quotesQuery.isLoading || invoicesQuery.isLoading) {
    return (
      <div className="flex flex-wrap gap-2 pt-1">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-7 w-24" />
      </div>
    );
  }

  if (quotesQuery.error || invoicesQuery.error) {
    return (
      <p className="text-xs text-destructive pt-1">
        Could not load quotes or invoices
      </p>
    );
  }

  const quotes = quotesQuery.data || [];
  const invoices = invoicesQuery.data || [];

  if (quotes.length === 0 && invoices.length === 0) {
    return (
      <p className="text-xs text-muted-foreground pt-1">No quotes or invoices yet</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {quotes.map((q) => (
        <button
          key={q.id}
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-left text-xs hover:bg-muted/50 transition-colors max-w-full"
          onClick={() => setLocation(`/work-orders/${workOrderId}/quotes/${q.id}`)}
          data-testid={`link-quote-${q.id}`}
        >
          <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="font-medium truncate">{q.quoteReference}</span>
          <span className="text-muted-foreground tabular-nums shrink-0">
            {formatMoneyMinor(q.totalMinor, q.currency)}
          </span>
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0 capitalize">
            {quoteStatusLabel(q.status)}
          </Badge>
        </button>
      ))}
      {invoices.map((inv) => (
        <button
          key={inv.id}
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-left text-xs hover:bg-muted/50 transition-colors max-w-full"
          onClick={() => setLocation(`/work-orders/${workOrderId}/invoices/${inv.id}`)}
          data-testid={`link-invoice-${inv.id}`}
        >
          <Receipt className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="font-medium truncate">{inv.invoiceReference}</span>
          <span className="text-muted-foreground tabular-nums shrink-0">
            {formatMoneyMinor(inv.totalMinor, inv.currency)}
          </span>
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0 capitalize">
            {inv.status.replace(/_/g, " ")}
          </Badge>
        </button>
      ))}
    </div>
  );
};
