export interface TierConfig {
  id: string;
  label: string;
  min: number;
  max: number | null;
  rate: number | null; // GBP per inspection credit; null = quote only
  quoteOnly: boolean;
}

/** Signed-off rates — Billing Spec v2.0. No Enterprise published rate. */
export const TIERS: readonly TierConfig[] = [
  { id: "starter", label: "Starter", min: 10, max: 29, rate: 4.90, quoteOnly: false },
  { id: "growth", label: "Growth", min: 30, max: 74, rate: 4.30, quoteOnly: false },
  { id: "professional", label: "Professional", min: 75, max: 199, rate: 3.70, quoteOnly: false },
  { id: "enterprise", label: "Enterprise", min: 200, max: null, rate: null, quoteOnly: true },
] as const;

export const TOPUP_MULTIPLIER = 1.10;
export const ANNUAL_MULTIPLIER = 0.80;

/**
 * Enterprise boundary — LOCKED
 *
 *   199 = Professional (last self-serve priced volume)
 *   200 = Enterprise (quote-only; no published rate)
 *
 * Slider behaviour:
 *   SLIDER_MIN = 10
 *   SLIDER_MAX = QUOTE_GATE (200)  — slider MAY land on 200
 *   At n >= QUOTE_GATE the CTA is "Request a quote" (not Subscribe/Upgrade)
 *
 * Do NOT set SLIDER_MAX to 199. Users must be able to reach the quote gate
 * by sliding to 200; that is intentional, not a bug.
 */
export const QUOTE_GATE = 200;
/** Last volume that still has a self-serve published rate (Professional). */
export const SELF_SERVE_MAX = 199;
/** First Enterprise volume (same as QUOTE_GATE). */
export const ENTERPRISE_MIN = QUOTE_GATE;

/** True when volume is Enterprise / quote-only (n >= 200). */
export function isEnterpriseQuoteVolume(inspections: number): boolean {
  return inspections >= QUOTE_GATE;
}

export {
  PHOTOS_PER_CREDIT,
  PHOTOS_PER_UNIT,
  PHOTO_WARN_THRESHOLD,
  creditsConsumed,
  unitsConsumed,
} from "../../../shared/billingUnits";

/** Pack discount multipliers applied to (tierRate × TOPUP_MULTIPLIER × size) */
export const PACK_DISCOUNTS: Record<number, number> = {
  20: 1.00,
  50: 0.95,
  100: 0.91,
};

export const TIER_ORDER = ["starter", "growth", "professional", "enterprise"] as const;
export type TierId = (typeof TIER_ORDER)[number];

export function getTierByInspections(count: number): TierConfig {
  for (const tier of TIERS) {
    if (tier.max === null) {
      if (count >= tier.min) return tier;
      continue;
    }
    if (count >= tier.min && count <= tier.max) return tier;
  }
  return TIERS[TIERS.length - 1];
}

/** Spec: monthly = n × rate; annual = n × rate × 12 × ANNUAL_MULTIPLIER */
export function computePlanPrice(inspections: number, period: "monthly" | "annual"): {
  monthly: number;
  annual: number;
  unitRate: number | null;
  tier: TierConfig;
} | null {
  const tier = getTierByInspections(inspections);
  if (tier.rate === null || tier.quoteOnly) return null;
  const monthly = inspections * tier.rate;
  const annual = monthly * 12 * ANNUAL_MULTIPLIER;
  return { monthly, annual, unitRate: tier.rate, tier };
}

/**
 * v2 pack pricing:
 *   topUpRate = tierRate × 1.10
 *   packTotal = round(topUpRate × packDiscount[size] × size)  // nearest £1
 *   displayRate = round(packTotal / size, 2)
 */
export function computePackPricing(tierId: string, packSize: number): {
  total: number;
  displayRate: number;
} | null {
  const tier = getTierById(tierId);
  if (!tier?.rate) return null;
  const discount = PACK_DISCOUNTS[packSize];
  if (discount === undefined) return null;
  const topUpRate = tier.rate * TOPUP_MULTIPLIER;
  const total = Math.round(topUpRate * discount * packSize);
  const displayRate = Math.round((total / packSize) * 100) / 100;
  return { total, displayRate };
}

/** @deprecated use computePackPricing — kept for transitional callers */
export function computePackUnitRate(tierId: string, packSize: number): number | null {
  return computePackPricing(tierId, packSize)?.displayRate ?? null;
}

/** @deprecated use computePackPricing */
export function computePackTotal(tierId: string, packSize: number): number | null {
  return computePackPricing(tierId, packSize)?.total ?? null;
}

export const FREE_TRIAL_INSPECTIONS = 3;
export const SIGNUP_CREDIT_GRANT = 5;

export function getNextTier(currentTierId: string): TierConfig | null {
  const idx = TIER_ORDER.indexOf(currentTierId as TierId);
  if (idx === -1 || idx >= TIER_ORDER.length - 1) return null;
  const next = TIERS[idx + 1];
  // Don't suggest Enterprise as a self-serve upgrade with a published rate
  if (next.quoteOnly) return null;
  return next;
}

export function getTierById(id: string): TierConfig | undefined {
  return TIERS.find((t) => t.id === id);
}

export function compareTiers(a: string, b: string): number {
  return TIER_ORDER.indexOf(a as TierId) - TIER_ORDER.indexOf(b as TierId);
}

export const SLIDER_MIN = 10;
/** Slider max = quote gate (200). Landing on 200 switches CTA to Request a quote. */
export const SLIDER_MAX = QUOTE_GATE;
export const SNAP_POINTS = TIERS.map((t) => t.min);
export const SNAP_THRESHOLD = 3;
