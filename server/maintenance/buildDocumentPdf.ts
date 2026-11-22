import { storage } from "../storage";
import type { MaintenanceInvoice, MaintenanceInvoiceLine, MaintenanceQuote, MaintenanceQuoteLine } from "@shared/schema";
import {
  buildMaintenanceDocumentHtml,
  invoicePdfFilename,
  quotePdfFilename,
  renderMaintenancePdf,
  type PdfOrgBrand,
} from "./maintenanceDocumentPdf";

async function loadOrgBrand(organizationId: string): Promise<PdfOrgBrand> {
  const org = await storage.getOrganization(organizationId);
  return {
    name: org?.name || "Inspect360",
    brandingName: org?.brandingName,
    brandingEmail: org?.brandingEmail,
    brandingPhone: org?.brandingPhone,
    brandingAddress: org?.brandingAddress,
  };
}

function mapLines(
  lines: Array<
    Pick<
      MaintenanceQuoteLine | MaintenanceInvoiceLine,
      | "name"
      | "description"
      | "category"
      | "unit"
      | "quantity"
      | "unitPriceMinor"
      | "vatRate"
      | "lineNetMinor"
      | "lineTaxMinor"
      | "lineTotalMinor"
    >
  >,
) {
  return lines.map((line) => ({
    name: line.name,
    description: line.description,
    category: line.category,
    unit: line.unit,
    quantity: Number(line.quantity) || 0,
    unitPriceMinor: line.unitPriceMinor,
    vatRate: line.vatRate,
    lineNetMinor: line.lineNetMinor,
    lineTaxMinor: line.lineTaxMinor,
    lineTotalMinor: line.lineTotalMinor,
  }));
}

export async function buildQuotePdfBuffer(input: {
  quote: MaintenanceQuote;
  lines: MaintenanceQuoteLine[];
  issueTitle?: string | null;
  locationLabel?: string | null;
}): Promise<{ buffer: Buffer; filename: string }> {
  const org = await loadOrgBrand(input.quote.organizationId);
  const html = buildMaintenanceDocumentHtml(org, {
    documentKind: "quote",
    reference: input.quote.quoteReference,
    versionLabel: `v${input.quote.versionNumber}`,
    currency: input.quote.currency,
    recipientName: input.quote.recipientName,
    recipientEmail: input.quote.recipientEmail,
    recipientAddress: input.quote.recipientAddress,
    scopeOrNotes: input.quote.scopeDescription,
    issueTitle: input.issueTitle,
    locationLabel: input.locationLabel,
    subtotalMinor: input.quote.subtotalMinor,
    taxMinor: input.quote.taxMinor,
    totalMinor: input.quote.totalMinor,
    status: input.quote.status,
    lines: mapLines(input.lines),
  });
  const buffer = await renderMaintenancePdf(html);
  return { buffer, filename: quotePdfFilename(input.quote.quoteReference) };
}

export async function buildInvoicePdfBuffer(input: {
  invoice: MaintenanceInvoice;
  lines: MaintenanceInvoiceLine[];
  issueTitle?: string | null;
  locationLabel?: string | null;
}): Promise<{ buffer: Buffer; filename: string }> {
  const org = await loadOrgBrand(input.invoice.organizationId);
  const html = buildMaintenanceDocumentHtml(org, {
    documentKind: "invoice",
    reference: input.invoice.invoiceReference,
    currency: input.invoice.currency,
    recipientName: input.invoice.recipientName,
    recipientEmail: input.invoice.recipientEmail,
    recipientAddress: input.invoice.recipientAddress,
    scopeOrNotes: input.invoice.notes,
    issueTitle: input.issueTitle,
    locationLabel: input.locationLabel,
    subtotalMinor: input.invoice.subtotalMinor,
    taxMinor: input.invoice.taxMinor,
    totalMinor: input.invoice.totalMinor,
    status: input.invoice.status,
    lines: mapLines(input.lines),
  });
  const buffer = await renderMaintenancePdf(html);
  return { buffer, filename: invoicePdfFilename(input.invoice.invoiceReference) };
}
