import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  maintenanceInvoiceLines,
  maintenanceInvoices,
  maintenanceQuoteLines,
  maintenanceQuotes,
  type MaintenanceQuote,
} from "@shared/schema";
import {
  formatInvoiceReference,
  assertQuoteTransition,
} from "@shared/maintenanceQuoteConstants";
import { computeQuoteLine } from "@shared/maintenanceFinanceMath";
import { appendWorkOrderEvent, allocateDocumentNumber } from "./quoteLifecycle";

export type DirectInvoiceRecipient = {
  recipientUserId?: string | null;
  recipientContactId?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  recipientAddress?: string | null;
};

export class InvoiceServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function convertQuoteToInvoice(input: {
  quote: MaintenanceQuote;
  actorUserId: string;
  actorRole?: string;
}) {
  const { quote, actorUserId, actorRole } = input;
  if (quote.status !== "accepted") {
    throw new InvoiceServiceError(
      "Only customer-accepted quotes can be converted to an invoice",
      409,
    );
  }
  const transitionActor = actorRole === "contractor" ? "staff" : "owner";
  assertQuoteTransition(quote.status, "converted", transitionActor);

  const lines = await db
    .select()
    .from(maintenanceQuoteLines)
    .where(eq(maintenanceQuoteLines.quoteId, quote.id));

  const year = new Date().getFullYear();
  const { number: invoiceNumber } = await allocateDocumentNumber(
    quote.organizationId,
    "invoice",
  );
  const invoiceReference = formatInvoiceReference(year, invoiceNumber);

  const result = await db.transaction(async (tx) => {
    const [invoice] = await tx
      .insert(maintenanceInvoices)
      .values({
        organizationId: quote.organizationId,
        workOrderId: quote.workOrderId,
        quoteId: quote.id,
        status: "draft",
        invoiceNumber,
        invoiceReference,
        currency: quote.currency,
        recipientContactId: quote.recipientContactId,
        recipientUserId: quote.recipientUserId,
        recipientName: quote.recipientName,
        recipientEmail: quote.recipientEmail,
        recipientPhone: quote.recipientPhone,
        recipientAddress: quote.recipientAddress,
        subtotalMinor: quote.subtotalMinor,
        taxMinor: quote.taxMinor,
        totalMinor: quote.totalMinor,
        paidMinor: 0,
        paymentStatus: "unpaid",
        preparedByUserId: actorUserId,
      })
      .returning();

    if (lines.length > 0) {
      await tx.insert(maintenanceInvoiceLines).values(
        lines.map((line, index) => ({
          invoiceId: invoice.id,
          sortOrder: index,
          name: line.name,
          description: line.description,
          sku: line.sku,
          category: line.category,
          unit: line.unit,
          quantity: String(line.quantity),
          unitPriceMinor: line.unitPriceMinor,
          vatRate: line.vatRate,
          lineNetMinor: line.lineNetMinor,
          lineTaxMinor: line.lineTaxMinor,
          lineTotalMinor: line.lineTotalMinor,
        })),
      );
    }

    await tx
      .update(maintenanceQuotes)
      .set({
        status: "converted",
        convertedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(maintenanceQuotes.id, quote.id));

    return invoice;
  });

  await appendWorkOrderEvent({
    organizationId: quote.organizationId,
    workOrderId: quote.workOrderId,
    eventType: "quote_converted_to_invoice",
    actorUserId,
    payload: { quoteId: quote.id, invoiceId: result.id },
  });

  const invoiceLines = await db
    .select()
    .from(maintenanceInvoiceLines)
    .where(eq(maintenanceInvoiceLines.invoiceId, result.id));

  return {
    ...result,
    lines: invoiceLines.map((l) => ({
      ...l,
      quantity: l.quantity == null ? 0 : Number(l.quantity),
    })),
  };
}

/** Blank draft invoice with no quote (edit lines → send). */
export async function createDirectInvoice(input: {
  organizationId: string;
  workOrderId: string;
  actorUserId: string;
  currency: string;
  recipient?: DirectInvoiceRecipient | null;
}) {
  const { organizationId, workOrderId, actorUserId, currency, recipient } = input;
  const year = new Date().getFullYear();
  const { number: invoiceNumber } = await allocateDocumentNumber(organizationId, "invoice");
  const invoiceReference = formatInvoiceReference(year, invoiceNumber);

  const blank = computeQuoteLine({
    quantity: 1,
    unitPriceMinor: 0,
    vatRate: "standard_20",
  });

  const result = await db.transaction(async (tx) => {
    const [invoice] = await tx
      .insert(maintenanceInvoices)
      .values({
        organizationId,
        workOrderId,
        quoteId: null,
        status: "draft",
        invoiceNumber,
        invoiceReference,
        currency: currency as "GBP" | "USD" | "EUR" | "AED",
        recipientContactId: recipient?.recipientContactId ?? null,
        recipientUserId: recipient?.recipientUserId ?? null,
        recipientName: recipient?.recipientName ?? null,
        recipientEmail: recipient?.recipientEmail ?? null,
        recipientPhone: recipient?.recipientPhone ?? null,
        recipientAddress: recipient?.recipientAddress ?? null,
        subtotalMinor: 0,
        taxMinor: 0,
        totalMinor: 0,
        paidMinor: 0,
        paymentStatus: "unpaid",
        preparedByUserId: actorUserId,
      })
      .returning();

    const [line] = await tx
      .insert(maintenanceInvoiceLines)
      .values({
        invoiceId: invoice.id,
        sortOrder: 0,
        name: "",
        description: null,
        category: "labour",
        unit: "hour",
        quantity: "1",
        unitPriceMinor: 0,
        vatRate: "standard_20",
        lineNetMinor: blank.lineNetMinor,
        lineTaxMinor: blank.lineTaxMinor,
        lineTotalMinor: blank.lineTotalMinor,
      })
      .returning();

    return { invoice, line };
  });

  await appendWorkOrderEvent({
    organizationId,
    workOrderId,
    eventType: "invoice_created_direct",
    actorUserId,
    payload: { invoiceId: result.invoice.id },
  });

  return {
    ...result.invoice,
    lines: [
      {
        ...result.line,
        quantity: result.line.quantity == null ? 0 : Number(result.line.quantity),
      },
    ],
  };
}
