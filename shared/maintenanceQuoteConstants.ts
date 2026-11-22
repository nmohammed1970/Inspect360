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
  "approved",
  "sent",
  "customer_accepted",
  "customer_declined",
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

export const MAINTENANCE_QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_owner_approval: "Pending owner approval",
  owner_changes_requested: "Owner changes requested",
  approved: "Approved",
  sent: "Sent",
  customer_accepted: "Customer accepted",
  customer_declined: "Customer declined",
  expired: "Expired",
  converted: "Converted",
  cancelled: "Cancelled",
  superseded: "Superseded",
};

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

export function formatQuoteReference(year: number, quoteNumber: number): string {
  return `Q-${year}-${String(quoteNumber).padStart(5, "0")}`;
}
