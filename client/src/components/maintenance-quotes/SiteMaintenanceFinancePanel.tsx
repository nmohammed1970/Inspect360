import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { FileText, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoneyMinor } from "@/components/maintenance-quotes/quoteMoney";
import {
  MAINTENANCE_INVOICE_STATUS_LABELS,
  MAINTENANCE_PAYMENT_STATUS_LABELS,
  MAINTENANCE_QUOTE_STATUS_LABELS,
} from "@shared/maintenanceQuoteConstants";

type QuoteRow = {
  id: string;
  workOrderId: string;
  quoteReference: string;
  status: string;
  currency: string;
  totalMinor: number;
  recipientName: string | null;
  updatedAt: string | null;
};

type InvoiceRow = {
  id: string;
  workOrderId: string;
  invoiceReference: string;
  status: string;
  paymentStatus: string;
  currency: string;
  totalMinor: number;
  recipientName: string | null;
  updatedAt: string | null;
};

type SiteFinancePayload = {
  quotes: QuoteRow[];
  invoices: InvoiceRow[];
};

interface SiteMaintenanceFinancePanelProps {
  scope: "property" | "block";
  scopeId: string;
}

export function SiteMaintenanceFinancePanel({
  scope,
  scopeId,
}: SiteMaintenanceFinancePanelProps) {
  const [, setLocation] = useLocation();
  const path =
    scope === "property"
      ? `/api/properties/${scopeId}/maintenance-finance`
      : `/api/blocks/${scopeId}/maintenance-finance`;

  const query = useQuery<SiteFinancePayload>({
    queryKey: [path],
    queryFn: async () => {
      const res = await fetch(path, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to load quotes & invoices");
      }
      return res.json();
    },
    enabled: Boolean(scopeId),
  });

  if (query.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (query.error) {
    return (
      <p className="text-sm text-destructive">
        {(query.error as Error).message}
      </p>
    );
  }

  const quotes = query.data?.quotes || [];
  const invoices = query.data?.invoices || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Quotations
            <Badge variant="secondary" className="tabular-nums">
              {quotes.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Reference</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-14 text-center text-sm text-muted-foreground"
                  >
                    No quotations for this {scope}
                  </TableCell>
                </TableRow>
              ) : (
                quotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {q.quoteReference}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                      {q.recipientName || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {MAINTENANCE_QUOTE_STATUS_LABELS[q.status] ||
                          q.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {formatMoneyMinor(q.totalMinor, q.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setLocation(
                            `/work-orders/${q.workOrderId}/quotes/${q.id}`,
                          )
                        }
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            Invoices
            <Badge variant="secondary" className="tabular-nums">
              {invoices.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Reference</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-14 text-center text-sm text-muted-foreground"
                  >
                    No invoices for this {scope}
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {inv.invoiceReference}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                      {inv.recipientName || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">
                          {MAINTENANCE_INVOICE_STATUS_LABELS[inv.status] ||
                            inv.status}
                        </Badge>
                        <Badge variant="secondary">
                          {MAINTENANCE_PAYMENT_STATUS_LABELS[inv.paymentStatus] ||
                            inv.paymentStatus}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {formatMoneyMinor(inv.totalMinor, inv.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setLocation(
                            `/work-orders/${inv.workOrderId}/invoices/${inv.id}`,
                          )
                        }
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
