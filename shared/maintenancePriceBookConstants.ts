import { z } from "zod";

export const MAINTENANCE_PRICE_BOOK_UNITS = [
  "hour",
  "shift",
  "day",
  "flat_fee",
  "visit",
  "m2",
] as const;

export type MaintenancePriceBookUnit = (typeof MAINTENANCE_PRICE_BOOK_UNITS)[number];

export const MAINTENANCE_PRICE_BOOK_UNIT_LABELS: Record<MaintenancePriceBookUnit, string> = {
  hour: "Hour",
  shift: "Shift",
  day: "Day",
  flat_fee: "Flat fee",
  visit: "Visit",
  m2: "Per m²",
};

export const MAINTENANCE_PRICE_BOOK_CATEGORIES = [
  "labour",
  "material",
  "consumable",
  "equipment",
  "overhead",
] as const;

export type MaintenancePriceBookCategory = (typeof MAINTENANCE_PRICE_BOOK_CATEGORIES)[number];

export const MAINTENANCE_PRICE_BOOK_CATEGORY_LABELS: Record<MaintenancePriceBookCategory, string> = {
  labour: "Labour",
  material: "Material",
  consumable: "Consumable",
  equipment: "Equipment",
  overhead: "Overhead",
};

export const MAINTENANCE_PRICE_BOOK_VAT_RATES = [
  "standard_20",
  "exempt",
  "zero_rated",
  "reduced",
] as const;

export type MaintenancePriceBookVatRate = (typeof MAINTENANCE_PRICE_BOOK_VAT_RATES)[number];

export const MAINTENANCE_PRICE_BOOK_VAT_LABELS: Record<MaintenancePriceBookVatRate, string> = {
  standard_20: "Standard 20%",
  exempt: "Exempt",
  zero_rated: "Zero-rated",
  reduced: "Reduced",
};

/** Percent used for maths; exempt is 0 with exempt semantics. */
export const MAINTENANCE_PRICE_BOOK_VAT_PERCENT: Record<MaintenancePriceBookVatRate, number> = {
  standard_20: 20,
  exempt: 0,
  zero_rated: 0,
  reduced: 5,
};

export const MAINTENANCE_PRICE_BOOK_CURRENCIES = ["GBP", "USD", "EUR", "AED"] as const;

export type MaintenancePriceBookCurrency = (typeof MAINTENANCE_PRICE_BOOK_CURRENCIES)[number];

export function vatRateToPercent(vatRate: MaintenancePriceBookVatRate): number {
  return MAINTENANCE_PRICE_BOOK_VAT_PERCENT[vatRate];
}

export function isVatExempt(vatRate: MaintenancePriceBookVatRate): boolean {
  return vatRate === "exempt";
}

/** Major units (e.g. 12.50) → integer minor units. */
export function majorToMinor(major: unknown): number | null {
  if (major == null || major === "") return null;
  const n = typeof major === "number" ? major : Number(String(major).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Integer minor units → major units for form display. */
export function minorToMajor(minor: unknown): number {
  const n = typeof minor === "number" ? minor : Number(minor);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return 0;
  return n / 100;
}

export function parseEnvironmentTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((t) => String(t).trim())
      .filter((t) => t.length > 0);
  }
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function formatEnvironmentTags(tags: string[] | null | undefined): string {
  if (!tags?.length) return "";
  return tags.join(", ");
}

const majorMoneySchema = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    const minor = majorToMinor(v);
    if (minor == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Must be a non-negative amount" });
      return z.NEVER;
    }
    return minor;
  });

const optionalMajorMoneySchema = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v, ctx) => {
    if (v == null || v === "") return null;
    const minor = majorToMinor(v);
    if (minor == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Must be a non-negative amount" });
      return z.NEVER;
    }
    return minor;
  });

const optionalProductivitySchema = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v, ctx) => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).trim());
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Must be a non-negative number" });
      return z.NEVER;
    }
    return n;
  });

const skuSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null) return null;
    const trimmed = String(v).trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const environmentTagsSchema = z
  .union([z.array(z.string()), z.string(), z.null(), z.undefined()])
  .transform((v) => parseEnvironmentTags(v));

/** API create body: prices in major units; transforms to minor for DB. */
export const maintenancePriceBookItemCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  sku: skuSchema,
  description: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null) return null;
      const trimmed = String(v).trim();
      return trimmed.length > 0 ? trimmed : null;
    }),
  unit: z.enum(MAINTENANCE_PRICE_BOOK_UNITS),
  defaultUnitPrice: majorMoneySchema,
  currency: z.enum(MAINTENANCE_PRICE_BOOK_CURRENCIES),
  vatRate: z.enum(MAINTENANCE_PRICE_BOOK_VAT_RATES),
  category: z.enum(MAINTENANCE_PRICE_BOOK_CATEGORIES),
  costRate: optionalMajorMoneySchema,
  environmentTags: environmentTagsSchema,
  productivityRate: optionalProductivitySchema,
  active: z.boolean().default(true),
});

export type MaintenancePriceBookItemCreateInput = z.input<typeof maintenancePriceBookItemCreateSchema>;
export type MaintenancePriceBookItemCreateParsed = z.output<typeof maintenancePriceBookItemCreateSchema>;

export const maintenancePriceBookItemUpdateSchema = maintenancePriceBookItemCreateSchema.partial();

export type MaintenancePriceBookItemUpdateInput = z.input<typeof maintenancePriceBookItemUpdateSchema>;
export type MaintenancePriceBookItemUpdateParsed = z.output<typeof maintenancePriceBookItemUpdateSchema>;

/** Client form schema: keeps major units as numbers for RHF. */
export const maintenancePriceBookItemFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  sku: z.string().optional().default(""),
  description: z.string().optional().default(""),
  unit: z.enum(MAINTENANCE_PRICE_BOOK_UNITS),
  defaultUnitPrice: z.coerce.number().min(0, "Price must be non-negative"),
  currency: z.enum(MAINTENANCE_PRICE_BOOK_CURRENCIES),
  vatRate: z.enum(MAINTENANCE_PRICE_BOOK_VAT_RATES),
  category: z.enum(MAINTENANCE_PRICE_BOOK_CATEGORIES),
  costRate: z.union([z.coerce.number().min(0), z.literal(""), z.nan()]).optional(),
  environmentTags: z.string().optional().default(""),
  productivityRate: z.union([z.coerce.number().min(0), z.literal(""), z.nan()]).optional(),
  active: z.boolean().default(true),
});

export type MaintenancePriceBookItemFormValues = z.infer<typeof maintenancePriceBookItemFormSchema>;
