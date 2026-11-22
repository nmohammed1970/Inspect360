import { z } from "zod";
import {
  MAINTENANCE_PRICE_BOOK_CATEGORIES,
  MAINTENANCE_PRICE_BOOK_UNITS,
  MAINTENANCE_PRICE_BOOK_VAT_RATES,
} from "./maintenancePriceBookConstants";

export const MAINTENANCE_QUOTE_STATUSES = [
  "draft",
  "pending_owner_approval",
  "owner_changes_requested",
  "owner_approved",
  "owner_rejected",
  "sent",
  "accepted",
  "declined",
  "customer_changes_requested",
  "expired",
  "converted",
  "cancelled",
  "superseded",
] as const;

export type MaintenanceQuoteStatus = (typeof MAINTENANCE_QUOTE_STATUSES)[number];

export const MAINTENANCE_QUOTE_EDITABLE_STATUSES = [
  "draft",
  "owner_changes_requested",
] as const;

export function isQuoteEditable(status: string): boolean {
  return (MAINTENANCE_QUOTE_EDITABLE_STATUSES as readonly string[]).includes(status);
}

export const MAINTENANCE_QUOTE_REVISABLE_STATUSES = [
  "owner_rejected",
  "owner_changes_requested",
  "declined",
  "customer_changes_requested",
] as const;

export function isQuoteRevisable(status: string): boolean {
  return (MAINTENANCE_QUOTE_REVISABLE_STATUSES as readonly string[]).includes(status);
}

export const MAINTENANCE_QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_owner_approval: "Pending owner approval",
  owner_changes_requested: "Owner changes requested",
  owner_approved: "Owner approved",
  owner_rejected: "Owner rejected",
  sent: "Sent to customer",
  accepted: "Customer accepted",
  declined: "Customer declined",
  customer_changes_requested: "Customer changes requested",
  expired: "Expired",
  converted: "Converted",
  cancelled: "Cancelled",
  superseded: "Superseded",
};

/** Allowed status transitions keyed by from → set of to. Actor checked separately. */
export const QUOTE_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["pending_owner_approval", "cancelled"],
  pending_owner_approval: [
    "owner_approved",
    "owner_rejected",
    "owner_changes_requested",
  ],
  owner_changes_requested: ["pending_owner_approval", "cancelled", "superseded"],
  owner_approved: ["sent", "cancelled"],
  owner_rejected: ["superseded", "cancelled"],
  sent: ["accepted", "declined", "customer_changes_requested", "expired"],
  accepted: ["converted", "superseded"],
  declined: ["superseded", "cancelled"],
  customer_changes_requested: ["superseded", "cancelled"],
  expired: ["superseded", "cancelled"],
  converted: [],
  cancelled: [],
  superseded: [],
};

export type QuoteTransitionActor =
  | "staff"
  | "owner"
  | "customer"
  | "system";

export function canTransitionQuote(
  from: string,
  to: string,
  actor: QuoteTransitionActor,
): boolean {
  const allowed = QUOTE_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) return false;

  // Forbidden shortcuts
  if (from === "draft" && to === "sent") return false;
  if (from === "pending_owner_approval" && to === "sent") return false;
  if (from === "owner_approved" && to === "accepted") return false;

  if (to === "owner_approved" || to === "owner_rejected" || to === "owner_changes_requested") {
    return actor === "owner";
  }
  if (to === "sent") return actor === "owner";
  if (
    to === "accepted" ||
    to === "declined" ||
    to === "customer_changes_requested"
  ) {
    return actor === "customer";
  }
  if (to === "expired") return actor === "system";
  if (to === "converted") return actor === "owner";
  if (to === "pending_owner_approval") return actor === "staff" || actor === "owner";
  if (to === "superseded") return actor === "staff" || actor === "owner";
  if (to === "cancelled") return actor === "staff" || actor === "owner";
  return true;
}

export function assertQuoteTransition(
  from: string,
  to: string,
  actor: QuoteTransitionActor,
): void {
  if (!canTransitionQuote(from, to, actor)) {
    throw new Error(`Invalid quote transition: ${from} → ${to} (actor=${actor})`);
  }
}

export const ownerDecisionSchema = z.object({
  decision: z.enum(["approve", "reject", "request_changes"]),
  reason: z.string().max(5000).optional().nullable(),
});

export const customerDecisionSchema = z.object({
  reason: z.string().max(5000).optional().nullable(),
});

export const quoteHeaderPatchSchema = z.object({
  recipientContactId: z.string().nullable().optional(),
  recipientName: z.string().max(200).nullable().optional(),
  recipientEmail: z.string().max(320).nullable().optional(),
  recipientPhone: z.string().max(64).nullable().optional(),
  recipientAddress: z.string().max(2000).nullable().optional(),
  scopeDescription: z.string().max(10000).nullable().optional(),
  engineerNotes: z.string().max(10000).nullable().optional(),
  validUntil: z.union([z.string(), z.null()]).optional(),
});

export const quoteLineWriteSchema = z.object({
  name: z.string().max(200).default(""),
  description: z.string().max(5000).nullable().optional(),
  sku: z
    .union([z.string().max(120), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null) return null;
      const trimmed = String(v).trim();
      return trimmed.length > 0 ? trimmed : null;
    }),
  category: z.enum(MAINTENANCE_PRICE_BOOK_CATEGORIES).default("labour"),
  unit: z.enum(MAINTENANCE_PRICE_BOOK_UNITS).default("hour"),
  quantity: z.coerce.number().min(0).max(999999),
  unitPriceMinor: z.coerce.number().int().min(0).max(999_999_999),
  vatRate: z.enum(MAINTENANCE_PRICE_BOOK_VAT_RATES).default("standard_20"),
  priceBookItemId: z.string().nullable().optional(),
});

export const quoteLinesReplaceSchema = z.object({
  lines: z.array(quoteLineWriteSchema).max(200),
});

export const MAINTENANCE_INVOICE_STATUSES = [
  "draft",
  "sent",
  "void",
] as const;

export type MaintenanceInvoiceStatus = (typeof MAINTENANCE_INVOICE_STATUSES)[number];

export const MAINTENANCE_PAYMENT_METHODS = [
  "bank_transfer",
  "cash",
  "card",
  "cheque",
  "other",
] as const;

export const invoicePaymentCreateSchema = z.object({
  amountMinor: z.coerce.number().int().positive().max(999_999_999),
  paidAt: z.string().min(1),
  method: z.enum(MAINTENANCE_PAYMENT_METHODS),
  reference: z.string().max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const invoiceHeaderPatchSchema = z.object({
  recipientName: z.string().max(200).nullable().optional(),
  recipientEmail: z.string().max(320).nullable().optional(),
  recipientPhone: z.string().max(64).nullable().optional(),
  recipientAddress: z.string().max(2000).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  dueAt: z.union([z.string(), z.null()]).optional(),
});

export const invoiceLinesReplaceSchema = z.object({
  lines: z.array(quoteLineWriteSchema.omit({ priceBookItemId: true })).max(200),
});

export function formatQuoteReference(year: number, quoteNumber: number): string {
  return `Q-${year}-${String(quoteNumber).padStart(5, "0")}`;
}

export function formatInvoiceReference(year: number, invoiceNumber: number): string {
  return `INV-${year}-${String(invoiceNumber).padStart(5, "0")}`;
}

export const QUOTE_SHARE_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const INVOICE_SHARE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
