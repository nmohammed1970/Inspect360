/**
 * Inspect360 supported billing currencies — LOCKED.
 *
 * Base / catalogue prices are authored in GBP. Display and Stripe charges
 * convert into the org's registration / preferred currency.
 *
 * Supported (self-serve Billing page + Stripe):
 *   GBP, USD, EUR, AED
 *
 * Not supported:
 *   ZAR (and any other ISO code not listed below)
 *
 * Currency lock:
 *   Once an active subscription exists, preferred/registration currency
 *   cannot be changed until the sub ends or is cancelled.
 */

export const BILLING_BASE_CURRENCY = "GBP" as const;

export const SUPPORTED_BILLING_CURRENCIES = ["GBP", "USD", "EUR", "AED"] as const;

export type SupportedBillingCurrency = (typeof SUPPORTED_BILLING_CURRENCIES)[number];

/** Explicitly out of scope for self-serve billing (do not add to the selector). */
export const UNSUPPORTED_BILLING_CURRENCIES = ["ZAR"] as const;

export const BILLING_CURRENCY_SYMBOLS: Record<SupportedBillingCurrency, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
  AED: "د.إ",
};

/**
 * Fallback FX vs GBP when live rates are unavailable.
 * Live conversion uses currencyService (exchangerate-api, base GBP).
 */
export const BILLING_FALLBACK_RATES_FROM_GBP: Record<SupportedBillingCurrency, number> = {
  GBP: 1.0,
  USD: 1.27,
  EUR: 1.17,
  AED: 4.67,
};

export const BILLING_CURRENCY_POLICY = {
  base: BILLING_BASE_CURRENCY,
  supported: SUPPORTED_BILLING_CURRENCIES,
  unsupported: UNSUPPORTED_BILLING_CURRENCIES,
  lockWhileSubscribed:
    "Cannot change preferred/registration currency while an active subscription exists.",
  pricingSource:
    "Catalogue / signed-off rates are GBP; convert to target currency for display and Stripe.",
} as const;

export function isSupportedBillingCurrency(
  code: string | null | undefined,
): code is SupportedBillingCurrency {
  if (!code) return false;
  return (SUPPORTED_BILLING_CURRENCIES as readonly string[]).includes(code.toUpperCase());
}

export function normalizeBillingCurrency(
  code: string | null | undefined,
  fallback: SupportedBillingCurrency = BILLING_BASE_CURRENCY,
): SupportedBillingCurrency {
  const upper = (code || "").toUpperCase();
  return isSupportedBillingCurrency(upper) ? upper : fallback;
}

export function billingCurrencySymbol(code: string): string {
  const c = normalizeBillingCurrency(code);
  return BILLING_CURRENCY_SYMBOLS[c];
}

/** FX multiplier from GBP major units → target major units (fallback table). */
export function fallbackRateFromGbp(code: string): number {
  const c = normalizeBillingCurrency(code);
  return BILLING_FALLBACK_RATES_FROM_GBP[c];
}
