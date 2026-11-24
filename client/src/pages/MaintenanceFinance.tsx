import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import SettingsMaintenancePriceBookPanel from "@/components/SettingsMaintenancePriceBookPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  versionNumber: number;
  recipientName?: string | null;
  sentAt?: string | null;
  customerDecidedAt?: string | null;
  submittedAt?: string | null;
  updatedAt?: string | null;
};

type InvoiceRow = {
  id: string;
  workOrderId: string;
  invoiceReference: string;
  currency: string;
  totalMinor: number;
  paidMinor: number;
  paymentStatus: string;
  status: string;
  recipientName?: string | null;
  dueAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

type FinanceTracking = {
  quotes: {
    pendingOwnerApproval: QuoteRow[];
    awaitingCustomer: QuoteRow[];
    customerAccepted: QuoteRow[];
    history: QuoteRow[];
  };
  invoices: {
    outstanding: InvoiceRow[];
    drafts: InvoiceRow[];
    history: InvoiceRow[];
  };
  counts: {
    pendingOwnerApproval: number;
    awaitingCustomer: number;
    customerAccepted: number;
    quoteHistory: number;
    outstandingInvoices: number;
    draftInvoices: number;
    invoiceHistory: number;
  };
};

function whenLabel(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

export default function MaintenanceFinance() {
  const [, setLocation] = useLocation();

  const trackingQuery = useQuery<FinanceTracking>({
    queryKey: ["/api/maintenance-finance/tracking"],
    queryFn: async () => {
      const res = await fetch("/api/maintenance-finance/tracking", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load tracking");
      return res.json();
    },
  });

  const data = trackingQuery.data;
  const counts = data?.counts;

  const countChips = [
    { label: "Awaiting", value: counts?.awaitingCustomer ?? 0 },
    { label: "Accepted", value: counts?.customerAccepted ?? 0 },
    { label: "Outstanding", value: counts?.outstandingInvoices ?? 0 },
    { label: "Drafts", value: counts?.draftInvoices ?? 0 },
    {
      label: "History",
      value: (counts?.quoteHistory ?? 0) + (counts?.invoiceHistory ?? 0),
    },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-[1400px] mx-auto">
      <PageHeader
        icon={ClipboardList}
        title="Quotes & invoicing"
        description="Quotations, invoices, and price book — tracked in one place"
      />

      {trackingQuery.isLoading ? (
        <Skeleton className="h-9 w-full max-w-3xl" />
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {countChips.map((chip, i) => (
            <span key={chip.label} className="inline-flex items-center gap-1.5">
              {i > 0 ? <span className="text-muted-foreground mx-0.5">·</span> : null}
              <span className="text-muted-foreground">{chip.label}</span>
              <Badge variant={chip.value > 0 ? "default" : "secondary"} className="tabular-nums">
                {chip.value}
              </Badge>
            </span>
          ))}
        </div>
      )}

      <Tabs defaultValue="quotations">
        <TabsList>
          <TabsTrigger value="quotations">Quotations</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="price-book" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Price book
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quotations" className="mt-4 space-y-8">
          {trackingQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : trackingQuery.error ? (
            <p className="text-sm text-destructive">
              {(trackingQuery.error as Error).message}
            </p>
          ) : (
            <>
              <QuoteTableSection
                title="Awaiting customer response"
                subtitle="Sent to the customer, or changes requested"
                rows={data?.quotes.awaitingCustomer || []}
                dateFor={(q) => q.sentAt || q.updatedAt}
                onOpen={(q) =>
                  setLocation(`/work-orders/${q.workOrderId}/quotes/${q.id}`)
                }
              />

              <QuoteTableSection
                title="Customer accepted"
                subtitle="Ready to convert to an invoice"
                rows={data?.quotes.customerAccepted || []}
                dateFor={(q) => q.customerDecidedAt || q.updatedAt}
                actionLabel="Open to convert"
                highlight
                onOpen={(q) =>
                  setLocation(`/work-orders/${q.workOrderId}/quotes/${q.id}`)
                }
              />

              <QuoteTableSection
                title="Quotation history"
                subtitle="Declined, converted, rejected, cancelled, superseded, or expired"
                rows={data?.quotes.history || []}
                dateFor={(q) => q.updatedAt}
                onOpen={(q) =>
                  setLocation(`/work-orders/${q.workOrderId}/quotes/${q.id}`)
                }
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="invoices" className="mt-4 space-y-8">
          {trackingQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : trackingQuery.error ? (
            <p className="text-sm text-destructive">
              {(trackingQuery.error as Error).message}
            </p>
          ) : (
            <>
              <InvoiceTableSection
                title="Outstanding"
                subtitle="Unpaid or partially paid invoices"
                rows={data?.invoices.outstanding || []}
                dateFor={(inv) => inv.dueAt || inv.updatedAt}
                highlight
                onOpen={(inv) =>
                  setLocation(`/work-orders/${inv.workOrderId}/invoices/${inv.id}`)
                }
              />

              <InvoiceTableSection
                title="Drafts"
                subtitle="Invoices not yet sent to the customer"
                rows={data?.invoices.drafts || []}
                dateFor={(inv) => inv.updatedAt || inv.createdAt}
                onOpen={(inv) =>
                  setLocation(`/work-orders/${inv.workOrderId}/invoices/${inv.id}`)
                }
              />

              <InvoiceTableSection
                title="Invoice history"
                subtitle="Paid or void invoices"
                rows={data?.invoices.history || []}
                dateFor={(inv) => inv.updatedAt}
                onOpen={(inv) =>
                  setLocation(`/work-orders/${inv.workOrderId}/invoices/${inv.id}`)
                }
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="price-book" className="mt-4">
          <SettingsMaintenancePriceBookPanel embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const SectionHeader = ({
  title,
  subtitle,
  count,
  highlight,
}: {
  title: string;
  subtitle?: string;
  count: number;
  highlight?: boolean;
}) => (
  <div className="mb-2">
    <div className="flex items-center gap-2">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <Badge variant={highlight && count > 0 ? "default" : "secondary"} className="tabular-nums">
        {count}
      </Badge>
    </div>
    {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
  </div>
);

const QuoteTableSection = ({
  title,
  subtitle,
  rows,
  dateFor,
  onOpen,
  actionLabel = "Open",
  highlight,
}: {
  title: string;
  subtitle?: string;
  rows: QuoteRow[];
  dateFor: (q: QuoteRow) => string | null | undefined;
  onOpen: (q: QuoteRow) => void;
  actionLabel?: string;
  highlight?: boolean;
}) => (
  <section>
    <SectionHeader
      title={title}
      subtitle={subtitle}
      count={rows.length}
      highlight={highlight}
    />
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[140px]">Reference</TableHead>
            <TableHead className="min-w-[140px]">Recipient</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right w-[120px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-16 text-center text-muted-foreground text-sm">
                None right now
              </TableCell>
            </TableRow>
          ) : (
            rows.map((q) => (
              <TableRow key={q.id} className="hover:bg-muted/40">
                <TableCell className="font-medium whitespace-nowrap">
                  {q.quoteReference}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
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
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {whenLabel(dateFor(q))}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => onOpen(q)}>
                    {actionLabel}
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  </section>
);

const InvoiceTableSection = ({
  title,
  subtitle,
  rows,
  dateFor,
  onOpen,
  highlight,
}: {
  title: string;
  subtitle?: string;
  rows: InvoiceRow[];
  dateFor: (inv: InvoiceRow) => string | null | undefined;
  onOpen: (inv: InvoiceRow) => void;
  highlight?: boolean;
}) => (
  <section>
    <SectionHeader
      title={title}
      subtitle={subtitle}
      count={rows.length}
      highlight={highlight}
    />
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[140px]">Reference</TableHead>
            <TableHead className="min-w-[140px]">Recipient</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-16 text-center text-muted-foreground text-sm">
                None right now
              </TableCell>
            </TableRow>
          ) : (
            rows.map((inv) => (
              <TableRow key={inv.id} className="hover:bg-muted/40">
                <TableCell className="font-medium whitespace-nowrap">
                  {inv.invoiceReference}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                  {inv.recipientName || "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {MAINTENANCE_INVOICE_STATUS_LABELS[inv.status] ||
                      inv.status.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {MAINTENANCE_PAYMENT_STATUS_LABELS[inv.paymentStatus] ||
                      inv.paymentStatus.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap text-sm">
                  {formatMoneyMinor(inv.paidMinor, inv.currency)} /{" "}
                  {formatMoneyMinor(inv.totalMinor, inv.currency)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {whenLabel(dateFor(inv))}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => onOpen(inv)}>
                    Open
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  </section>
);
