import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FileText, Receipt, Loader2, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { formatMoneyMinor } from "@/components/maintenance-quotes/quoteMoney";
import { MAINTENANCE_QUOTE_STATUS_LABELS } from "@shared/maintenanceQuoteConstants";

interface QuoteListItem {
  id: string;
  quoteReference: string;
  status: string;
  versionNumber: number;
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

interface WorkOrderQuotesInvoicesPanelProps {
  workOrderId: string;
  onNavigateAway?: () => void;
}

function statusLabel(status: string): string {
  return MAINTENANCE_QUOTE_STATUS_LABELS[status] || status.replace(/_/g, " ");
}

function whenLabel(iso?: string | null): string {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export const WorkOrderQuotesInvoicesPanel = ({
  workOrderId,
  onNavigateAway,
}: WorkOrderQuotesInvoicesPanelProps) => {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
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

  const go = (path: string) => {
    onNavigateAway?.();
    setLocation(path);
  };

  const loading = quotesQuery.isLoading || invoicesQuery.isLoading;
  const error = quotesQuery.error || invoicesQuery.error;

  if (loading) {
    return (
      <div className="space-y-3 py-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive py-4">
        {(error as Error).message || "Could not load quotes and invoices"}
      </p>
    );
  }

  const quotes = quotesQuery.data || [];
  const invoices = invoicesQuery.data || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => go(`/work-orders/${workOrderId}/quotes/new`)}
          data-testid={`button-new-quotation-${workOrderId}`}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New quotation
        </Button>
        {isOwner && (
          <Button
            type="button"
            size="sm"
            onClick={() => go(`/work-orders/${workOrderId}/invoices/new`)}
            data-testid={`button-new-invoice-${workOrderId}`}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New invoice
          </Button>
        )}
      </div>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Quotations</h3>
          <Badge variant="secondary" className="text-xs">
            {quotes.length}
          </Badge>
        </div>
        {quotes.length === 0 ? (
          <p className="text-sm text-muted-foreground pl-6">No quotations yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {quotes.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  className="w-full text-left rounded-md border px-3 py-2.5 hover:bg-muted/50 transition-colors"
                  onClick={() => go(`/work-orders/${workOrderId}/quotes/${q.id}`)}
                  data-testid={`button-open-quote-${q.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {q.quoteReference}
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          · v{q.versionNumber}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatMoneyMinor(q.totalMinor, q.currency)}
                        {whenLabel(q.updatedAt || q.createdAt)
                          ? ` · ${whenLabel(q.updatedAt || q.createdAt)}`
                          : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 capitalize">
                      {statusLabel(q.status)}
                    </Badge>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Invoices</h3>
          <Badge variant="secondary" className="text-xs">
            {invoices.length}
          </Badge>
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground pl-6">No invoices yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <button
                  type="button"
                  className="w-full text-left rounded-md border px-3 py-2.5 hover:bg-muted/50 transition-colors"
                  onClick={() => go(`/work-orders/${workOrderId}/invoices/${inv.id}`)}
                  data-testid={`button-open-invoice-${inv.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{inv.invoiceReference}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatMoneyMinor(inv.totalMinor, inv.currency)}
                        {inv.paymentStatus ? ` · ${inv.paymentStatus.replace(/_/g, " ")}` : ""}
                        {whenLabel(inv.updatedAt || inv.createdAt)
                          ? ` · ${whenLabel(inv.updatedAt || inv.createdAt)}`
                          : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 capitalize">
                      {inv.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(quotesQuery.isFetching || invoicesQuery.isFetching) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Refreshing…
        </div>
      )}
    </div>
  );
};
