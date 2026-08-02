import { billingNowUtc, utcDaysRemaining } from "@shared/billingClock";

/**
 * Pro-Rata Billing Service
 * Calculates prorated prices for module purchases mid-billing-cycle.
 * Remaining-day math uses UTC instants (shared/billingClock.ts).
 * Plan/tier money proration is owned by Stripe (always_invoice) — this helper
 * is for module/bundle Checkout estimates only.
 */

export interface ProRataResult {
  proratedPrice: number; // in minor units (pence/cents)
  fullPrice: number; // in minor units
  remainingDays: number;
  totalDaysInCycle: number;
  isProrated: boolean;
}

/**
 * Calculate remaining days in the current billing cycle (UTC).
 */
export function calculateRemainingDays(
  subscriptionStartDate: Date | string,
  subscriptionRenewalDate: Date | string | null | undefined,
  billingCycle: "monthly" | "annual",
  currentDate: Date = billingNowUtc()
): number {
  const start = typeof subscriptionStartDate === 'string' 
    ? new Date(subscriptionStartDate) 
    : subscriptionStartDate;
  
  const now = currentDate;
  
  // If renewal date is provided, use it (UTC instant comparison)
  if (subscriptionRenewalDate) {
    return utcDaysRemaining(subscriptionRenewalDate, now);
  }
  
  // Otherwise, calculate based on billing cycle from start (UTC month/year add)
  if (billingCycle === "annual") {
    const nextRenewal = new Date(start.getTime());
    nextRenewal.setUTCFullYear(nextRenewal.getUTCFullYear() + 1);
    return utcDaysRemaining(nextRenewal, now);
  } else {
    const nextRenewal = new Date(start.getTime());
    nextRenewal.setUTCMonth(nextRenewal.getUTCMonth() + 1);
    return utcDaysRemaining(nextRenewal, now);
  }
}

/**
 * Calculate total days in a billing cycle
 */
export function getTotalDaysInCycle(billingCycle: "monthly" | "annual"): number {
  return billingCycle === "annual" ? 365 : 30;
}

/**
 * Calculate pro-rated price for a module purchase
 * Formula: (Full Price × Remaining Days) / Total Days in Cycle
 */
export function calculateProratedPrice(
  fullPrice: number, // in minor units (pence/cents)
  remainingDays: number,
  billingCycle: "monthly" | "annual"
): number {
  if (remainingDays <= 0) {
    return fullPrice; // No proration needed if cycle has ended
  }
  
  const totalDaysInCycle = getTotalDaysInCycle(billingCycle);
  
  // Pro-rated amount = (full price × remaining days) / total days
  const proratedAmount = Math.round((fullPrice * remainingDays) / totalDaysInCycle);
  
  // Ensure we don't charge more than full price (safety check)
  return Math.min(proratedAmount, fullPrice);
}

/**
 * Main function to calculate pro-rata pricing for a module purchase
 */
export function calculateProRata(
  fullPrice: number,
  subscriptionStartDate: Date | string,
  subscriptionRenewalDate: Date | string | null | undefined,
  billingCycle: "monthly" | "annual",
  currentDate: Date = billingNowUtc()
): ProRataResult {
  const remainingDays = calculateRemainingDays(
    subscriptionStartDate,
    subscriptionRenewalDate,
    billingCycle,
    currentDate
  );
  
  const totalDaysInCycle = getTotalDaysInCycle(billingCycle);
  
  // Only prorate if there are remaining days and it's not a new subscription
  const isProrated = remainingDays > 0 && remainingDays < totalDaysInCycle;
  
  const proratedPrice = isProrated
    ? calculateProratedPrice(fullPrice, remainingDays, billingCycle)
    : fullPrice;
  
  return {
    proratedPrice,
    fullPrice,
    remainingDays,
    totalDaysInCycle,
    isProrated
  };
}

/**
 * Calculate pro-rata pricing with consistent date priority
 * Always prioritizes instanceSubscriptions dates over legacy subscription dates
 * 
 * @param fullPrice - Full price in minor units (pence/cents)
 * @param organizationId - Organization ID
 * @param billingCycle - Billing cycle (monthly/annual)
 * @param storage - Storage service instance
 * @returns ProRataResult with prorated pricing, or null if no subscription found
 */
export async function calculateProRataWithPriority(
  fullPrice: number,
  organizationId: string,
  billingCycle: "monthly" | "annual",
  storage: any
): Promise<{ result: ProRataResult; source: "instanceSubscriptions" | "legacySubscription" } | null> {
  // Priority 1: Use instanceSubscriptions (source of truth - updated on tier changes)
  const instanceSub = await storage.getInstanceSubscription(organizationId);
  
  if (instanceSub?.subscriptionStartDate && instanceSub?.subscriptionRenewalDate && 
      instanceSub.billingCycle === billingCycle && instanceSub.subscriptionStatus === "active") {
    const result = calculateProRata(
      fullPrice,
      instanceSub.subscriptionStartDate,
      instanceSub.subscriptionRenewalDate,
      billingCycle
    );
    
    return { result, source: "instanceSubscriptions" };
  }
  
  // Priority 2: Fall back to legacy subscription (only if instanceSubscriptions doesn't have data)
  const existingSub = await storage.getSubscriptionByOrganization(organizationId);
  
  if (existingSub?.stripeSubscriptionId && existingSub.billingInterval === billingCycle) {
    const startDate = existingSub.currentPeriodStart || existingSub.billingCycleAnchor || existingSub.createdAt;
    const renewalDate = existingSub.currentPeriodEnd;
    
    if (startDate && renewalDate) {
      const result = calculateProRata(
        fullPrice,
        startDate,
        renewalDate,
        billingCycle
      );
      
      return { result, source: "legacySubscription" };
    }
  }
  
  // No subscription found - return null (no proration)
  return null;
}

