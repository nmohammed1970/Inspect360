import { storage } from "./storage";
import type { Organization, CreditBatch, InsertCreditBatch, InsertCreditLedger, InstanceSubscription, InstanceAddonPurchase } from "@shared/schema";

export class SubscriptionService {
  /**
   * Calculate credits needed for an inspection based on image count
   * Formula: 1 base credit + 1 credit per 250 images
   * @param imageCount - Total number of images in the inspection
   * @returns Number of credits needed
   */
  calculateInspectionCredits(imageCount: number): number {
    const baseCredits = 1;
    const additionalCredits = Math.floor(imageCount / 250);
    return baseCredits + additionalCredits;
  }

  /**
   * Consume inspection credits using tier quota first, then addon packs (FIFO)
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

    const instanceSub = await storage.getInstanceSubscription(organizationId);
    if (!instanceSub) {
      throw new Error("No subscription found for organization");
    }

    // For now, use the existing credit batch system
    // In the future, we might want to track tier quota usage separately
    // This implementation uses credit batches which should include tier quota grants
    await this.consumeCredits(
      organizationId,
      creditsNeeded,
      "inspection",
      inspectionId,
      `Inspection credits consumed (${creditsNeeded} credits)`
    );
  }
  /**
   * Consume credits using FIFO logic from available batches
   * @param organizationId - Organization consuming credits
   * @param quantity - Number of credits to consume
   * @param linkedEntityType - Type of entity consuming credits (e.g., "inspection")
   * @param linkedEntityId - ID of the entity consuming credits
   * @param notes - Optional notes about the consumption
   * @returns true if successful, throws error if insufficient credits
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

    // Get available batches ordered by FIFO (earliest expiry first)
    const batches = await storage.getAvailableCreditBatches(organizationId);
    
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

    // Also update the legacy creditsRemaining field for backward compatibility
    const org = await storage.getOrganization(organizationId);
    if (org) {
      await storage.updateOrganizationCredits(
        organizationId,
        Math.max(0, (org.creditsRemaining ?? 0) - quantity)
      );
    }
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

    // Also update the legacy creditsRemaining field for backward compatibility
    const org = await storage.getOrganization(organizationId);
    if (org) {
      await storage.updateOrganizationCredits(
        organizationId,
        (org.creditsRemaining ?? 0) + quantity
      );
    }

    return batch;
  }

  /**
   * Handle rollover logic at billing cycle start
   * NOTE: Changed to expire all unused credits instead of rolling them over
   * Unused credits from previous cycle are reset to zero - no rollover
   * @param organizationId - Organization to process
   * @param currentPeriodEnd - End of the current billing period
   */
  async processRollover(organizationId: string, currentPeriodEnd: Date): Promise<void> {
    const now = new Date();
    
    // Get all batches for the organization
    const allBatches = await storage.getCreditBatchesByOrganization(organizationId);

    // Expire ALL expired batches (both rolled and non-rolled) - NO rollover
    // All unused credits from previous cycle will be reset to zero
    const expiredBatches = allBatches.filter(
      b => b.remainingQuantity > 0 && b.expiresAt && b.expiresAt <= now
    );

    for (const batch of expiredBatches) {
      await storage.expireCreditBatch(batch.id);
      
      // Record expiry in ledger
      await storage.createCreditLedgerEntry({
        organizationId,
        source: "expiry" as any,
        quantity: -batch.remainingQuantity,
        batchId: batch.id,
        notes: `Expired ${batch.remainingQuantity} unused credits from previous cycle (no rollover - credits reset to zero)`,
      });
    }

    console.log(`[Rollover] Expired ${expiredBatches.length} batches with unused credits for org ${organizationId} (no rollover - credits reset to zero)`);
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
