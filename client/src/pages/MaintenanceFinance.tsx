import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  Receipt,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import SettingsMaintenancePriceBookPanel from "@/components/SettingsMaintenancePriceBookPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoneyMinor } from "@/components/maintenance-quotes/quoteMoney";
import {
  MetricSummaryCard,
  OpenRowLink,
  PortfolioDataTable,
  PortfolioTableBody,
  PortfolioTableCell,
  PortfolioTableHead,
  PortfolioTableHeader,
  PortfolioTableRow,
} from "@/components/workspace";
import { cn } from "@/lib/utils";
import { pagePad, tabsListScroll } from "@/lib/responsive";
import {
  MAINTENANCE_INVOICE_STATUS_LABELS,
  MAINTENANCE_PAYMENT_STATUS_LABELS,
  MAINTENANCE_QUOTE_STATUS_LABELS,
} from "@shared/maintenanceQuoteConstants";
import {
  paymentStatusTone,
  quoteLifecycleTone,
} from "@shared/statusPriorityStyles";

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

function quoteStatusLabel(status: string): string {
  return MAINTENANCE_QUOTE_STATUS_LABELS[status] || status.replace(/_/g, " ");
}

function invoiceStatusLabel(status: string): string {
  return MAINTENANCE_INVOICE_STATUS_LABELS[status] || status.replace(/_/g, " ");
}

function paymentLabel(status: string): string {
  return MAINTENANCE_PAYMENT_STATUS_LABELS[status] || status.replace(/_/g, " ");
}

export default function MaintenanceFinance() {
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

  return (
    <div className={cn("container mx-auto min-w-0 space-y-6 md:space-y-8", pagePad)}>
      <PageHeader
        icon={FileText}
        title="Quotes & invoicing"
        description="Quotations, invoices, and price book — tracked in one place"
      />

      {trackingQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[5.5rem] w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MetricSummaryCard
            label="Awaiting"
            value={counts?.awaitingCustomer ?? 0}
            subLabel="Recipient response"
            tone="info"
            icon={Clock}
          />
          <MetricSummaryCard
            label="Accepted"
            value={counts?.customerAccepted ?? 0}
            subLabel="Ready to convert"
            tone="success"
            icon={CheckCircle2}
          />
          <MetricSummaryCard
            label="Outstanding"
            value={counts?.outstandingInvoices ?? 0}
            subLabel="Unpaid invoices"
            tone={(counts?.outstandingInvoices ?? 0) > 0 ? "critical" : "muted"}
            icon={Wallet}
          />
          <MetricSummaryCard
            label="Drafts"
            value={counts?.draftInvoices ?? 0}
            subLabel="Unsent invoices"
            tone="warning"
            icon={Receipt}
          />
          <MetricSummaryCard
            label="History"
            value={(counts?.quoteHistory ?? 0) + (counts?.invoiceHistory ?? 0)}
            subLabel="Closed documents"
            tone="muted"
            icon={FileText}
          />
        </div>
      )}

      <Tabs defaultValue="quotations" className="space-y-6 md:space-y-8">
        <TabsList className={tabsListScroll}>
          <TabsTrigger value="quotations" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span className="tab-label">Quotations</span>
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5">
            <Receipt className="h-4 w-4" />
            <span className="tab-label">Invoices</span>
          </TabsTrigger>
          <TabsTrigger value="price-book" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            <span className="tab-label">Price book</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quotations" className="mt-0 space-y-6">
          {trackingQuery.isLoading ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : trackingQuery.error ? (
            <p className="text-sm text-destructive">
              {(trackingQuery.error as Error).message}
            </p>
          ) : (
            <>
              <QuoteTableSection
                title="Awaiting recipient response"
                subtitle="Sent to the recipient, or changes requested"
                rows={data?.quotes.awaitingCustomer || []}
                dateFor={(q) => q.sentAt || q.updatedAt}
              />

              <QuoteTableSection
                title="Recipient accepted"
                subtitle="Ready to convert to an invoice"
                rows={data?.quotes.customerAccepted || []}
                dateFor={(q) => q.customerDecidedAt || q.updatedAt}
                actionLabel="Convert"
                highlight
              />

              <QuoteTableSection
                title="Quotation history"
                subtitle="Declined, converted, rejected, cancelled, superseded, or expired"
                rows={data?.quotes.history || []}
                dateFor={(q) => q.updatedAt}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="invoices" className="mt-0 space-y-6">
          {trackingQuery.isLoading ? (
            <Skeleton className="h-48 w-full rounded-lg" />
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
              />

              <InvoiceTableSection
                title="Drafts"
                subtitle="Invoices not yet sent to the recipient"
                rows={data?.invoices.drafts || []}
                dateFor={(inv) => inv.updatedAt || inv.createdAt}
              />

              <InvoiceTableSection
                title="Invoice history"
                subtitle="Paid or void invoices"
                rows={data?.invoices.history || []}
                dateFor={(inv) => inv.updatedAt}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="price-book" className="mt-0">
          <div className="overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm">
            <div className="border-b border-border/80 px-4 py-3 sm:px-5">
              <h2 className="text-base font-semibold tracking-tight">Price book</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Catalogue lines used when building quotations
              </p>
            </div>
            <div className="p-4 sm:p-5">
              <SettingsMaintenancePriceBookPanel embedded />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SectionShell({
  title,
  subtitle,
  count,
  highlight,
  children,
}: {
  title: string;
  subtitle?: string;
  count: number;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            <StatusBadge
              tone={highlight && count > 0 ? "primary" : "muted"}
              appearance="pill"
              className="tabular-nums"
            >
              {count}
            </StatusBadge>
          </div>
          {subtitle ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyTableRow({ colSpan }: { colSpan: number }) {
  return (
    <PortfolioTableRow>
      <PortfolioTableCell
        colSpan={colSpan}
        className="h-20 text-center text-sm text-muted-foreground"
      >
        None right now
      </PortfolioTableCell>
    </PortfolioTableRow>
  );
}

function QuoteTableSection({
  title,
  subtitle,
  rows,
  dateFor,
  actionLabel = "Open",
  highlight,
}: {
  title: string;
  subtitle?: string;
  rows: QuoteRow[];
  dateFor: (q: QuoteRow) => string | null | undefined;
  actionLabel?: string;
  highlight?: boolean;
}) {
  return (
    <SectionShell
      title={title}
      subtitle={subtitle}
      count={rows.length}
      highlight={highlight}
    >
      <PortfolioDataTable minWidth="720px">
        <PortfolioTableHeader>
          <PortfolioTableRow className="hover:bg-transparent">
            <PortfolioTableHead>Reference</PortfolioTableHead>
            <PortfolioTableHead>Recipient</PortfolioTableHead>
            <PortfolioTableHead>Status</PortfolioTableHead>
            <PortfolioTableHead className="text-right">Amount</PortfolioTableHead>
            <PortfolioTableHead>Updated</PortfolioTableHead>
            <PortfolioTableHead className="w-[7rem] text-right">
              Actions
            </PortfolioTableHead>
          </PortfolioTableRow>
        </PortfolioTableHeader>
        <PortfolioTableBody>
          {rows.length === 0 ? (
            <EmptyTableRow colSpan={6} />
          ) : (
            rows.map((q) => (
              <PortfolioTableRow key={q.id} data-testid={`row-quote-${q.id}`}>
                <PortfolioTableCell className="font-medium whitespace-nowrap">
                  {q.quoteReference}
                </PortfolioTableCell>
                <PortfolioTableCell className="max-w-[12rem] truncate text-sm text-muted-foreground">
                  {q.recipientName || "—"}
                </PortfolioTableCell>
                <PortfolioTableCell>
                  <StatusBadge
                    tone={quoteLifecycleTone(q.status)}
                    appearance="pill"
                  >
                    {quoteStatusLabel(q.status)}
                  </StatusBadge>
                </PortfolioTableCell>
                <PortfolioTableCell className="text-right tabular-nums whitespace-nowrap">
                  {formatMoneyMinor(q.totalMinor, q.currency)}
                </PortfolioTableCell>
                <PortfolioTableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {whenLabel(dateFor(q))}
                </PortfolioTableCell>
                <PortfolioTableCell className="text-right">
                  <OpenRowLink
                    href={`/work-orders/${q.workOrderId}/quotes/${q.id}`}
                    label={actionLabel}
                    fromLabel="Quotes & Invoicing"
                    testId={`button-open-quote-${q.id}`}
                    className="justify-end"
                  />
                </PortfolioTableCell>
              </PortfolioTableRow>
            ))
          )}
        </PortfolioTableBody>
      </PortfolioDataTable>
    </SectionShell>
  );
}

function InvoiceTableSection({
  title,
  subtitle,
  rows,
  dateFor,
  highlight,
}: {
  title: string;
  subtitle?: string;
  rows: InvoiceRow[];
  dateFor: (inv: InvoiceRow) => string | null | undefined;
  highlight?: boolean;
}) {
  return (
    <SectionShell
      title={title}
      subtitle={subtitle}
      count={rows.length}
      highlight={highlight}
    >
      <PortfolioDataTable minWidth="820px">
        <PortfolioTableHeader>
          <PortfolioTableRow className="hover:bg-transparent">
            <PortfolioTableHead>Reference</PortfolioTableHead>
            <PortfolioTableHead>Recipient</PortfolioTableHead>
            <PortfolioTableHead>Status</PortfolioTableHead>
            <PortfolioTableHead>Payment</PortfolioTableHead>
            <PortfolioTableHead className="text-right">Amount</PortfolioTableHead>
            <PortfolioTableHead>Updated</PortfolioTableHead>
            <PortfolioTableHead className="w-[6rem] text-right">
              Actions
            </PortfolioTableHead>
          </PortfolioTableRow>
        </PortfolioTableHeader>
        <PortfolioTableBody>
          {rows.length === 0 ? (
            <EmptyTableRow colSpan={7} />
          ) : (
            rows.map((inv) => (
              <PortfolioTableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                <PortfolioTableCell className="font-medium whitespace-nowrap">
                  {inv.invoiceReference}
                </PortfolioTableCell>
                <PortfolioTableCell className="max-w-[12rem] truncate text-sm text-muted-foreground">
                  {inv.recipientName || "—"}
                </PortfolioTableCell>
                <PortfolioTableCell>
                  <StatusBadge
                    tone={quoteLifecycleTone(inv.status)}
                    appearance="pill"
                  >
                    {invoiceStatusLabel(inv.status)}
                  </StatusBadge>
                </PortfolioTableCell>
                <PortfolioTableCell>
                  <StatusBadge
                    tone={paymentStatusTone(inv.paymentStatus)}
                    appearance="pill"
                  >
                    {paymentLabel(inv.paymentStatus)}
                  </StatusBadge>
                </PortfolioTableCell>
                <PortfolioTableCell className="text-right text-sm tabular-nums whitespace-nowrap">
                  {formatMoneyMinor(inv.paidMinor, inv.currency)} /{" "}
                  {formatMoneyMinor(inv.totalMinor, inv.currency)}
                </PortfolioTableCell>
                <PortfolioTableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {whenLabel(dateFor(inv))}
                </PortfolioTableCell>
                <PortfolioTableCell className="text-right">
                  <OpenRowLink
                    href={`/work-orders/${inv.workOrderId}/invoices/${inv.id}`}
                    label="Open"
                    fromLabel="Quotes & Invoicing"
                    testId={`button-open-invoice-${inv.id}`}
                    className="justify-end"
                  />
                </PortfolioTableCell>
              </PortfolioTableRow>
            ))
          )}
        </PortfolioTableBody>
      </PortfolioDataTable>
    </SectionShell>
  );
}
