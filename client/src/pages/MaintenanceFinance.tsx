import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { ClipboardList, FileText } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { formatMoneyMinor } from "@/components/maintenance-quotes/quoteMoney";
import { MAINTENANCE_QUOTE_STATUS_LABELS } from "@shared/maintenanceQuoteConstants";

type QuoteRow = {
  id: string;
  workOrderId: string;
  quoteReference: string;
  status: string;
  currency: string;
  totalMinor: number;
  versionNumber: number;
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
};

export default function MaintenanceFinance() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [, setLocation] = useLocation();

  const pendingQuery = useQuery<QuoteRow[]>({
    queryKey: ["/api/maintenance-finance/pending-owner-approvals"],
    queryFn: async () => {
      const res = await fetch("/api/maintenance-finance/pending-owner-approvals", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load pending approvals");
      return res.json();
    },
    enabled: isOwner,
  });

  const trackingQuery = useQuery<{
    awaitingCustomer: QuoteRow[];
    readyToConvert: QuoteRow[];
    unpaidInvoices: InvoiceRow[];
  }>({
    queryKey: ["/api/maintenance-finance/tracking"],
    queryFn: async () => {
      const res = await fetch("/api/maintenance-finance/tracking", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load tracking");
      return res.json();
    },
  });

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-[1200px] mx-auto">
      <PageHeader
        icon={ClipboardList}
        title="Quotes & invoicing"
        description="Owner approvals, customer responses, and unpaid invoices"
      />

      <Tabs defaultValue={isOwner ? "pending" : "tracking"}>
        <TabsList>
          {isOwner ? <TabsTrigger value="pending">Pending owner approval</TabsTrigger> : null}
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
        </TabsList>

        {isOwner ? (
          <TabsContent value="pending" className="mt-4 space-y-3">
            {pendingQuery.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (pendingQuery.data || []).length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  No quotations awaiting your approval
                </CardContent>
              </Card>
            ) : (
              (pendingQuery.data || []).map((q) => (
                <QuoteCard
                  key={q.id}
                  quote={q}
                  onOpen={() => setLocation(`/work-orders/${q.workOrderId}/quotes/${q.id}`)}
                />
              ))
            )}
          </TabsContent>
        ) : null}

        <TabsContent value="tracking" className="mt-4 space-y-6">
          {trackingQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <Section title="Awaiting customer">
                {(trackingQuery.data?.awaitingCustomer || []).map((q) => (
                  <QuoteCard
                    key={q.id}
                    quote={q}
                    onOpen={() => setLocation(`/work-orders/${q.workOrderId}/quotes/${q.id}`)}
                  />
                ))}
              </Section>
              <Section title="Ready to convert">
                {(trackingQuery.data?.readyToConvert || []).map((q) => (
                  <QuoteCard
                    key={q.id}
                    quote={q}
                    onOpen={() => setLocation(`/work-orders/${q.workOrderId}/quotes/${q.id}`)}
                  />
                ))}
              </Section>
              <Section title="Unpaid invoices">
                {(trackingQuery.data?.unpaidInvoices || []).map((inv) => (
                  <Card key={inv.id}>
                    <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />
                          {inv.invoiceReference}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatMoneyMinor(inv.paidMinor, inv.currency)} /{" "}
                          {formatMoneyMinor(inv.totalMinor, inv.currency)} ·{" "}
                          {inv.paymentStatus.replace(/_/g, " ")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setLocation(`/work-orders/${inv.workOrderId}/invoices/${inv.id}`)
                        }
                      >
                        Open
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </Section>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="space-y-2">
    <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
    <div className="space-y-2">
      {!children || (Array.isArray(children) && children.length === 0) ? (
        <p className="text-sm text-muted-foreground py-2">None</p>
      ) : (
        children
      )}
    </div>
  </div>
);

const QuoteCard = ({ quote, onOpen }: { quote: QuoteRow; onOpen: () => void }) => (
  <Card>
    <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-medium">
          {quote.quoteReference}
          <span className="text-muted-foreground font-normal"> · v{quote.versionNumber}</span>
        </p>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline">
            {MAINTENANCE_QUOTE_STATUS_LABELS[quote.status] || quote.status}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {formatMoneyMinor(quote.totalMinor, quote.currency)}
          </span>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onOpen}>
        Open
      </Button>
    </CardContent>
  </Card>
);
