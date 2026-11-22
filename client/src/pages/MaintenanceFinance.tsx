import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Receipt,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { formatMoneyMinor } from "@/components/maintenance-quotes/quoteMoney";
import {
  MAINTENANCE_INVOICE_STATUS_LABELS,
  MAINTENANCE_PAYMENT_STATUS_LABELS,
  MAINTENANCE_QUOTE_STATUS_LABELS,
} from "@shared/maintenanceQuoteConstants";
import { cn } from "@/lib/utils";

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
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export default function MaintenanceFinance() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
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

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-[1400px] mx-auto">
      <PageHeader
        icon={ClipboardList}
        title="Quotes & invoicing"
        description="Track quotations through approval and customer response, then invoices through payment"
      />

      {trackingQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {isOwner ? (
            <SummaryTile
              label="Pending owner"
              value={String(counts?.pendingOwnerApproval ?? 0)}
              detail="Awaiting your approval"
              icon={<Clock className="h-4 w-4 text-amber-600" />}
              emphasize={(counts?.pendingOwnerApproval ?? 0) > 0}
            />
          ) : null}
          <SummaryTile
            label="Awaiting customer"
            value={String(counts?.awaitingCustomer ?? 0)}
            detail="Sent / changes requested"
            icon={<FileText className="h-4 w-4 text-primary" />}
          />
          <SummaryTile
            label="Customer accepted"
            value={String(counts?.customerAccepted ?? 0)}
            detail="Ready to convert"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            emphasize={(counts?.customerAccepted ?? 0) > 0}
          />
          <SummaryTile
            label="Outstanding"
            value={String(counts?.outstandingInvoices ?? 0)}
            detail="Unpaid invoices"
            icon={<Wallet className="h-4 w-4 text-orange-600" />}
            emphasize={(counts?.outstandingInvoices ?? 0) > 0}
          />
          <SummaryTile
            label="Draft invoices"
            value={String(counts?.draftInvoices ?? 0)}
            detail="Not sent yet"
            icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
          />
          <SummaryTile
            label="History"
            value={String(
              (counts?.quoteHistory ?? 0) + (counts?.invoiceHistory ?? 0),
            )}
            detail="Recent closed items"
            icon={<ClipboardList className="h-4 w-4 text-muted-foreground" />}
          />
        </div>
      )}

      <Tabs defaultValue="quotations">
        <TabsList>
          <TabsTrigger value="quotations">Quotations</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
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
              {isOwner ? (
                <Section
                  title="Pending owner approval"
                  subtitle="Quotations waiting for you to approve, reject, or request changes"
                  count={data?.quotes.pendingOwnerApproval.length ?? 0}
                >
                  {(data?.quotes.pendingOwnerApproval || []).map((q) => (
                    <QuoteCard
                      key={q.id}
                      quote={q}
                      dateHint={whenLabel(q.submittedAt || q.updatedAt)}
                      onOpen={() =>
                        setLocation(`/work-orders/${q.workOrderId}/quotes/${q.id}`)
                      }
                    />
                  ))}
                </Section>
              ) : null}

              <Section
                title="Awaiting customer response"
                subtitle="Sent to the customer, or the customer has requested changes"
                count={data?.quotes.awaitingCustomer.length ?? 0}
              >
                {(data?.quotes.awaitingCustomer || []).map((q) => (
                  <QuoteCard
                    key={q.id}
                    quote={q}
                    dateHint={whenLabel(q.sentAt || q.updatedAt)}
                    onOpen={() =>
                      setLocation(`/work-orders/${q.workOrderId}/quotes/${q.id}`)
                    }
                  />
                ))}
              </Section>

              <Section
                title="Customer accepted"
                subtitle="Ready to convert to an invoice"
                count={data?.quotes.customerAccepted.length ?? 0}
                highlight
              >
                {(data?.quotes.customerAccepted || []).map((q) => (
                  <QuoteCard
                    key={q.id}
                    quote={q}
                    dateHint={whenLabel(q.customerDecidedAt || q.updatedAt)}
                    ctaLabel="Open to convert"
                    onOpen={() =>
                      setLocation(`/work-orders/${q.workOrderId}/quotes/${q.id}`)
                    }
                  />
                ))}
              </Section>

              <Section
                title="Quotation history"
                subtitle="Declined, converted, rejected, cancelled, superseded, or expired"
                count={data?.quotes.history.length ?? 0}
              >
                {(data?.quotes.history || []).map((q) => (
                  <QuoteCard
                    key={q.id}
                    quote={q}
                    dateHint={whenLabel(q.updatedAt)}
                    onOpen={() =>
                      setLocation(`/work-orders/${q.workOrderId}/quotes/${q.id}`)
                    }
                  />
                ))}
              </Section>
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
              <Section
                title="Outstanding"
                subtitle="Unpaid or partially paid invoices"
                count={data?.invoices.outstanding.length ?? 0}
                highlight
              >
                {(data?.invoices.outstanding || []).map((inv) => (
                  <InvoiceCard
                    key={inv.id}
                    invoice={inv}
                    dateHint={whenLabel(inv.dueAt || inv.updatedAt)}
                    onOpen={() =>
                      setLocation(
                        `/work-orders/${inv.workOrderId}/invoices/${inv.id}`,
                      )
                    }
                  />
                ))}
              </Section>

              <Section
                title="Drafts"
                subtitle="Invoices not yet sent to the customer"
                count={data?.invoices.drafts.length ?? 0}
              >
                {(data?.invoices.drafts || []).map((inv) => (
                  <InvoiceCard
                    key={inv.id}
                    invoice={inv}
                    dateHint={whenLabel(inv.updatedAt || inv.createdAt)}
                    onOpen={() =>
                      setLocation(
                        `/work-orders/${inv.workOrderId}/invoices/${inv.id}`,
                      )
                    }
                  />
                ))}
              </Section>

              <Section
                title="Invoice history"
                subtitle="Paid or void invoices"
                count={data?.invoices.history.length ?? 0}
              >
                {(data?.invoices.history || []).map((inv) => (
                  <InvoiceCard
                    key={inv.id}
                    invoice={inv}
                    dateHint={whenLabel(inv.updatedAt)}
                    onOpen={() =>
                      setLocation(
                        `/work-orders/${inv.workOrderId}/invoices/${inv.id}`,
                      )
                    }
                  />
                ))}
              </Section>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

const SummaryTile = ({
  label,
  value,
  detail,
  icon,
  emphasize,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
  emphasize?: boolean;
}) => (
  <Card className={cn("overflow-hidden", emphasize && "border-primary/40")}>
    <CardContent className="p-4 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          emphasize && "text-primary",
        )}
      >
        {value}
      </p>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
    </CardContent>
  </Card>
);

const Section = ({
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
}) => {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            <Badge variant={highlight && count > 0 ? "default" : "secondary"}>
              {count}
            </Badge>
          </div>
          {subtitle ? (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              None right now
            </CardContent>
          </Card>
        ) : (
          items
        )}
      </div>
    </section>
  );
};

const QuoteCard = ({
  quote,
  onOpen,
  dateHint,
  ctaLabel = "Open",
}: {
  quote: QuoteRow;
  onOpen: () => void;
  dateHint?: string;
  ctaLabel?: string;
}) => (
  <Card>
    <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="font-medium truncate">
          {quote.quoteReference}
          <span className="text-muted-foreground font-normal">
            {" "}
            · v{quote.versionNumber}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {MAINTENANCE_QUOTE_STATUS_LABELS[quote.status] ||
              quote.status.replace(/_/g, " ")}
          </Badge>
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatMoneyMinor(quote.totalMinor, quote.currency)}
          </span>
          {quote.recipientName ? (
            <span className="text-xs text-muted-foreground truncate">
              · {quote.recipientName}
            </span>
          ) : null}
          {dateHint ? (
            <span className="text-xs text-muted-foreground">· {dateHint}</span>
          ) : null}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onOpen}>
        {ctaLabel}
      </Button>
    </CardContent>
  </Card>
);

const InvoiceCard = ({
  invoice,
  onOpen,
  dateHint,
}: {
  invoice: InvoiceRow;
  onOpen: () => void;
  dateHint?: string;
}) => (
  <Card>
    <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="font-medium flex items-center gap-2 truncate">
          <Receipt className="h-4 w-4 text-primary shrink-0" />
          {invoice.invoiceReference}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {MAINTENANCE_INVOICE_STATUS_LABELS[invoice.status] ||
              invoice.status.replace(/_/g, " ")}
          </Badge>
          <Badge variant="secondary">
            {MAINTENANCE_PAYMENT_STATUS_LABELS[invoice.paymentStatus] ||
              invoice.paymentStatus.replace(/_/g, " ")}
          </Badge>
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatMoneyMinor(invoice.paidMinor, invoice.currency)} /{" "}
            {formatMoneyMinor(invoice.totalMinor, invoice.currency)}
          </span>
          {invoice.recipientName ? (
            <span className="text-xs text-muted-foreground truncate">
              · {invoice.recipientName}
            </span>
          ) : null}
          {dateHint ? (
            <span className="text-xs text-muted-foreground">· {dateHint}</span>
          ) : null}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onOpen}>
        Open
      </Button>
    </CardContent>
  </Card>
);
