import { storage } from "./storage";
import type { Organization, CreditBatch, InsertCreditBatch, InsertCreditLedger, InstanceSubscription, InstanceAddonPurchase } from "@shared/schema";
import { creditsConsumed } from "../shared/billingUnits";

/** Lower number = consumed first: bonus → pack/top-up → plan. */
function creditSourceConsumePriority(source: string | null | undefined): number {
  switch (source) {
    case "admin_grant": // signup / welcome bonus
    case "refund":
    case "adjustment":
      return 0;
    case "addon_pack":
    case "topup":
      return 1;
    case "plan_inclusion":
      return 2;
    default:
      return 1;
  }
}

function sortBatchesForConsumption(batches: CreditBatch[]): CreditBatch[] {
  return batches.slice().sort((a, b) => {
    const pa = creditSourceConsumePriority(a.grantSource);
    const pb = creditSourceConsumePriority(b.grantSource);
    if (pa !== pb) return pa - pb;

    // Within the same source group: earliest expiry first (non-expiring last), then oldest grant
    const aExp = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bExp = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (aExp !== bExp) return aExp - bExp;

    return new Date(a.grantedAt).getTime() - new Date(b.grantedAt).getTime();
  });
}

export class SubscriptionService {
  /**
   * Calculate credits needed for an inspection based on photo count (BILL-08).
   * One credit includes up to 300 photos.
   * creditsConsumed = MAX(1, CEIL(photoCount / 300))
   */
  calculateInspectionCredits(imageCount: number): number {
    return creditsConsumed(imageCount);
  }

  /**
   * Consume inspection credits: bonus first, then packs/top-ups, then plan inclusion.
   * @param organizationId - Organization consuming credits
   * @param creditsNeeded - Number of credits to consume
   * @param inspectionId - ID of the inspection
   * @returns true if successful, throws error if insufficient credits
   */
  async consumeInspectionCredits(
    organizationId: string,
    creditsNeeded: number,
    inspectionId: string
  ): Promise<void> {
    if (creditsNeeded <= 0) {
      throw new Error("Credits needed must be positive");
    }

    // Check if organization has sufficient credits (from batches, signup rewards, etc.)
    // This works even without a subscription - users can have signup reward credits
    const creditBalance = await storage.getCreditBalance(organizationId);
    if (creditBalance.total < creditsNeeded) {
      throw new Error(`Insufficient credits: need ${creditsNeeded}, have ${creditBalance.total}`);
    }

    // Use the existing credit batch system to consume credits
    // This works for all credit sources: signup rewards, plan inclusion, topups, addon packs
    await this.consumeCredits(
      organizationId,
      creditsNeeded,
      "inspection",
      inspectionId,
      `Inspection credits consumed (${creditsNeeded} credits)`
    );
  }
  /**
   * Consume credits from available batches.
   * Order: bonus (admin_grant) → pack-on/top-up (addon_pack, topup) → plan (plan_inclusion).
   * Within each group: earliest expiry first, then oldest grant.
   */
  async consumeCredits(
    organizationId: string,
    quantity: number,
    linkedEntityType: string,
    linkedEntityId: string,
    notes?: string
  ): Promise<void> {
    if (quantity <= 0) {
      throw new Error("Quantity must be positive");
    }

    const batches = sortBatchesForConsumption(
      await storage.getAvailableCreditBatches(organizationId),
    );
    
    // First, calculate total available credits and plan deductions WITHOUT modifying database
    let totalAvailable = 0;
    const plannedDeductions: Array<{ 
      batch: CreditBatch; 
      toConsume: number; 
      newRemaining: number;
      unitCost?: number;
    }> = [];
    
    let remainingToConsume = quantity;
    
    for (const batch of batches) {
      totalAvailable += batch.remainingQuantity;
      
      if (remainingToConsume > 0) {
        const toConsume = Math.min(batch.remainingQuantity, remainingToConsume);
        plannedDeductions.push({
          batch,
          toConsume,
          newRemaining: batch.remainingQuantity - toConsume,
          unitCost: batch.unitCostMinorUnits ?? undefined,
        });
        remainingToConsume -= toConsume;
      }
    }

    // Check if we have insufficient credits BEFORE making any changes
    if (remainingToConsume > 0) {
      throw new Error(`Insufficient credits. Needed ${quantity}, available ${totalAvailable}.`);
    }

    // Only NOW apply the planned deductions to the database
    const consumedBatches: Array<{ batchId: string; consumed: number; unitCost?: number }> = [];
    
    for (const deduction of plannedDeductions) {
      await storage.updateCreditBatch(deduction.batch.id, {
        remainingQuantity: deduction.newRemaining,
      });

      consumedBatches.push({
        batchId: deduction.batch.id,
        consumed: deduction.toConsume,
        unitCost: deduction.unitCost,
      });
    }

    // Record consumption in credit ledger
    for (const consumed of consumedBatches) {
      await storage.createCreditLedgerEntry({
        organizationId,
        source: "consumption" as any,
        quantity: -consumed.consumed,
        batchId: consumed.batchId,
        unitCostMinorUnits: consumed.unitCost,
        notes: notes || `Consumed ${consumed.consumed} credits for ${linkedEntityType}`,
        linkedEntityType,
        linkedEntityId,
      });
    }

    // Legacy creditsRemaining field removed - credits are now managed entirely through credit_batches
  }

  /**
   * Grant credits to an organization (from plan inclusion, top-up, admin grant, or addon pack)
   * @param organizationId - Organization receiving credits
   * @param quantity - Number of credits to grant
   * @param source - Source of credits ("plan_inclusion", "topup", "admin_grant", "addon_pack")
   * @param expiresAt - Optional expiration date
   * @param metadata - Optional metadata (subscriptionId, topupOrderId, addonPurchaseId, adminNotes)
   * @param unitCostMinorUnits - Optional unit cost for valuation
   * @returns Created credit batch
   */
  async grantCredits(
    organizationId: string,
    quantity: number,
    source: "plan_inclusion" | "topup" | "admin_grant" | "addon_pack",
    expiresAt?: Date,
    metadata?: { subscriptionId?: string; topupOrderId?: string; addonPurchaseId?: string; adminNotes?: string; createdBy?: string },
    unitCostMinorUnits?: number
  ): Promise<CreditBatch> {
    if (quantity <= 0) {
      throw new Error("Quantity must be positive");
    }

    // Create credit batch
    const batch = await storage.createCreditBatch({
      organizationId,
      grantedQuantity: quantity,
      remainingQuantity: quantity,
      grantSource: source as any,
      grantedAt: new Date(),
      expiresAt: expiresAt ?? null,
      unitCostMinorUnits: unitCostMinorUnits ?? null,
      rolled: false,
      metadataJson: metadata ?? null,
    });

    // Determine linked entity type and ID based on source
    let linkedEntityType = "subscription";
    let linkedEntityId: string | null = null;
    
    if (source === "topup") {
      linkedEntityType = "topup_order";
      linkedEntityId = metadata?.topupOrderId ?? null;
    } else if (source === "addon_pack") {
      linkedEntityType = "addon_pack_purchase";
      linkedEntityId = metadata?.addonPurchaseId ?? null;
    } else {
      linkedEntityId = metadata?.subscriptionId ?? null;
    }

    // Record in credit ledger
    await storage.createCreditLedgerEntry({
      organizationId,
      createdBy: metadata?.createdBy ?? null,
      source: source as any,
      quantity,
      batchId: batch.id,
      unitCostMinorUnits: unitCostMinorUnits ?? null,
      notes: `Granted ${quantity} credits from ${source}`,
      linkedEntityType,
      linkedEntityId,
    });

    // Legacy creditsRemaining field removed - credits are now managed entirely through credit_batches

    return batch;
  }

  /**
   * On plan upgrade/downgrade: reclassify leftover plan credits as bonus (admin_grant)
   * so they are not wiped. Keeps remainingQuantity and expiresAt — they still expire
   * on their original expiry date via processCreditExpiry / batch expiry checks.
   * @returns Total credits converted
   */
  async convertRemainingPlanCreditsToBonus(
    organizationId: string,
    reason: string,
  ): Promise<number> {
    const existingBatches = await storage.getCreditBatchesByOrganization(organizationId);
    const planBatches = existingBatches.filter(
      (b) =>
        b.grantSource === "plan_inclusion" &&
        b.remainingQuantity > 0 &&
        !b.rolled,
    );

    let converted = 0;
    for (const batch of planBatches) {
      const prevMeta =
        batch.metadataJson && typeof batch.metadataJson === "object"
          ? (batch.metadataJson as Record<string, unknown>)
          : {};

      await storage.updateCreditBatch(batch.id, {
        grantSource: "admin_grant" as any,
        metadataJson: {
          ...prevMeta,
          adminNotes: reason,
          convertedFrom: "plan_inclusion",
          convertedAt: new Date().toISOString(),
          originalExpiresAt: batch.expiresAt
            ? new Date(batch.expiresAt).toISOString()
            : null,
        },
      });

      await storage.createCreditLedgerEntry({
        organizationId,
        source: "adjustment" as any,
        quantity: 0,
        batchId: batch.id,
        notes: `Converted ${batch.remainingQuantity} leftover plan credits to bonus (${reason}). Expires: ${
          batch.expiresAt ? new Date(batch.expiresAt).toISOString() : "never"
        }`,
      });

      converted += batch.remainingQuantity;
      console.log(
        `[Credits] Converted plan batch ${batch.id} (${batch.remainingQuantity} credits) to bonus for org ${organizationId}`,
      );
    }

    return converted;
  }

  /**
   * Process credit expiry at billing cycle end
   * Expires all unused credits from the previous cycle - no rollover
   * Credits are reset to zero at the start of each new billing cycle
   * @param organizationId - Organization to process
   * @param currentPeriodEnd - End of the current billing period
   */
  /**
   * Process credit expiry at billing cycle end.
   * Expires unused credits whose expiresAt has passed — no rollover.
   *
   * Comparison (UTC timestamps only):
   *   expiresAt <= now   where both are absolute UTC instants
   *   (via isAtOrPastBillingInstant / billingNowUtc — never local TZ)
   *
   * @param organizationId - Organization to process
   * @param currentPeriodEnd - End of the current billing period (UTC instant; informational / callers)
   */
  async processCreditExpiry(organizationId: string, currentPeriodEnd: Date): Promise<void> {
    const { billingNowUtc, isAtOrPastBillingInstant, BILLING_TIMEZONE } = await import("@shared/billingClock");
    const now = billingNowUtc();
    
    // Get all batches for the organization
    const allBatches = await storage.getCreditBatchesByOrganization(organizationId);

    // UTC only: expiresAt <= now (absolute instants). Do not interpret as local calendar dates.
    const expiredBatches = allBatches.filter(
      b => b.remainingQuantity > 0 && b.expiresAt && isAtOrPastBillingInstant(b.expiresAt, now)
    );

    for (const batch of expiredBatches) {
      await storage.expireCreditBatch(batch.id);
      
      // Record expiry in ledger
      await storage.createCreditLedgerEntry({
        organizationId,
        source: "expiry" as any,
        quantity: -batch.remainingQuantity,
        batchId: batch.id,
        notes: `Expired ${batch.remainingQuantity} unused credits from previous cycle (no rollover - credits reset to zero; UTC expiresAt <= now)`,
      });
    }

    console.log(`[Credit Expiry] Expired ${expiredBatches.length} batches for org ${organizationId} (clock=${BILLING_TIMEZONE}, rule: expiresAt <= now UTC)`);
  }

  /**
   * Get effective pricing for a plan and country
   * @param planId - Plan ID
   * @param countryCode - ISO 3166-1 alpha-2 country code
   * @returns Pricing information
   */
  async getEffectivePricing(
    planId: string,
    countryCode: string
  ): Promise<{
    monthlyPrice: number;
    currency: string;
    includedCredits: number;
    topupPricePerCredit?: number;
  }> {
    // Get base plan
    const plan = await storage.getPlan(planId);
    if (!plan) {
      throw new Error("Plan not found");
    }

    // Check for country override
    const override = await storage.getCountryPricingOverride(countryCode, planId);

    if (override) {
      return {
        monthlyPrice: override.monthlyPriceMinorUnits,
        currency: override.currency,
        includedCredits: override.includedCreditsOverride ?? plan.includedCredits,
        topupPricePerCredit: override.topupPricePerCreditMinorUnits ?? undefined,
      };
    }

    // Return base plan pricing (GBP)
    return {
      monthlyPrice: plan.monthlyPriceGbp,
      currency: "GBP",
      includedCredits: plan.includedCredits,
      topupPricePerCredit: 75, // Default 75 pence per credit
    };
  }

  /**
   * Calculate inspection credit cost based on complexity
   * @param inspectionType - Type of inspection
   * @param complexity - Complexity level (1, 2, or 3)
   * @returns Number of credits required
   */
  calculateInspectionCreditCost(
    inspectionType: string,
    complexity: number = 1
  ): number {
    // Base cost is the complexity level
    let cost = complexity;

    // Cap at 3 credits maximum (as per specification)
    return Math.min(cost, 3);
  }
}

export const subscriptionService = new SubscriptionService();
