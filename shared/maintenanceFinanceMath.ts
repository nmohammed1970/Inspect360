/**
 * Pure money helpers for maintenance quotations / invoices.
 * All money in integer minor units. Tax % from price-book VAT enum.
 */
import {
  MAINTENANCE_PRICE_BOOK_VAT_PERCENT,
  type MaintenancePriceBookVatRate,
  vatRateToPercent,
} from "./maintenancePriceBookConstants";

export type QuoteLineInput = {
  quantity: number;
  unitPriceMinor: number;
  vatRate: MaintenancePriceBookVatRate | string;
};

export type QuoteLineComputed = {
  lineNetMinor: number;
  lineTaxMinor: number;
  lineTotalMinor: number;
};

export type QuoteTotals = {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
};

/** Half-up round for money (non-negative). */
export function roundHalfUp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function normalizeQuantity(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function normalizeUnitPriceMinor(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return 0;
  return n;
}

export function resolveVatPercent(vatRate: string): number {
  if (vatRate in MAINTENANCE_PRICE_BOOK_VAT_PERCENT) {
    return vatRateToPercent(vatRate as MaintenancePriceBookVatRate);
  }
  return 0;
}

/**
 * net = round(qty * unitPriceMinor)
 * tax = round(net * vatPercent / 100)
 * total = net + tax
 */
export function computeQuoteLine(input: QuoteLineInput): QuoteLineComputed {
  const quantity = normalizeQuantity(input.quantity);
  const unitPriceMinor = normalizeUnitPriceMinor(input.unitPriceMinor);
  const lineNetMinor = roundHalfUp(quantity * unitPriceMinor);
  const vatPercent = resolveVatPercent(String(input.vatRate || "standard_20"));
  const lineTaxMinor = roundHalfUp((lineNetMinor * vatPercent) / 100);
  return {
    lineNetMinor,
    lineTaxMinor,
    lineTotalMinor: lineNetMinor + lineTaxMinor,
  };
}

export function computeQuoteTotals(lines: QuoteLineComputed[]): QuoteTotals {
  let subtotalMinor = 0;
  let taxMinor = 0;
  for (const line of lines) {
    subtotalMinor += line.lineNetMinor;
    taxMinor += line.lineTaxMinor;
  }
  return {
    subtotalMinor,
    taxMinor,
    totalMinor: subtotalMinor + taxMinor,
  };
}

export type PaymentStatus = "unpaid" | "partially_paid" | "paid";

export function computePaymentSummary(
  invoiceTotalMinor: number,
  paymentsMinor: number[],
): { paidMinor: number; outstandingMinor: number; status: PaymentStatus } {
  const total = normalizeUnitPriceMinor(invoiceTotalMinor);
  const paidMinor = paymentsMinor.reduce((sum, p) => sum + normalizeUnitPriceMinor(p), 0);
  const outstandingMinor = Math.max(0, total - paidMinor);
  let status: PaymentStatus = "unpaid";
  if (total > 0 && paidMinor >= total) status = "paid";
  else if (paidMinor > 0) status = "partially_paid";
  return { paidMinor, outstandingMinor, status };
}
