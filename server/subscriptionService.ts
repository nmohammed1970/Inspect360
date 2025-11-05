import { storage } from "./storage";
import type { Organization, CreditBatch, InsertCreditBatch, InsertCreditLedger } from "@shared/schema";

export class SubscriptionService {
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
    
    let remainingToConsume = quantity;
    const consumedBatches: Array<{ batchId: string; consumed: number; unitCost?: number }> = [];

    // Consume from batches using FIFO
    for (const batch of batches) {
      if (remainingToConsume <= 0) break;

      const toConsume = Math.min(batch.remainingQuantity, remainingToConsume);
      
      // Update batch remaining quantity
      await storage.updateCreditBatch(batch.id, {
        remainingQuantity: batch.remainingQuantity - toConsume,
      });

      consumedBatches.push({
        batchId: batch.id,
        consumed: toConsume,
        unitCost: batch.unitCostMinorUnits ?? undefined,
      });

      remainingToConsume -= toConsume;
    }

    // Check if we have insufficient credits
    if (remainingToConsume > 0) {
      throw new Error(`Insufficient credits. Needed ${quantity}, only ${quantity - remainingToConsume} available.`);
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
   * Grant credits to an organization (from plan inclusion, top-up, or admin grant)
   * @param organizationId - Organization receiving credits
   * @param quantity - Number of credits to grant
   * @param source - Source of credits ("plan_inclusion", "topup", "admin_grant")
   * @param expiresAt - Optional expiration date
   * @param metadata - Optional metadata (subscriptionId, topupOrderId, adminNotes)
   * @param unitCostMinorUnits - Optional unit cost for valuation
   * @returns Created credit batch
   */
  async grantCredits(
    organizationId: string,
    quantity: number,
    source: "plan_inclusion" | "topup" | "admin_grant",
    expiresAt?: Date,
    metadata?: { subscriptionId?: string; topupOrderId?: string; adminNotes?: string },
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

    // Record in credit ledger
    await storage.createCreditLedgerEntry({
      organizationId,
      source: source as any,
      quantity,
      batchId: batch.id,
      unitCostMinorUnits: unitCostMinorUnits ?? null,
      notes: `Granted ${quantity} credits from ${source}`,
      linkedEntityType: source === "topup" ? "topup_order" : "subscription",
      linkedEntityId: metadata?.topupOrderId ?? metadata?.subscriptionId ?? null,
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
   * @param organizationId - Organization to process
   * @param currentPeriodEnd - End of the current billing period
   */
  async processRollover(organizationId: string, currentPeriodEnd: Date): Promise<void> {
    const now = new Date();
    
    // Get all batches for the organization
    const allBatches = await storage.getCreditBatchesByOrganization(organizationId);

    // Expire old rolled batches (from previous cycle)
    const oldRolledBatches = allBatches.filter(
      b => b.rolled && b.expiresAt && b.expiresAt < now && b.remainingQuantity > 0
    );

    for (const batch of oldRolledBatches) {
      await storage.expireCreditBatch(batch.id);
      
      // Record expiry in ledger
      await storage.createCreditLedgerEntry({
        organizationId,
        source: "expiry" as any,
        quantity: -batch.remainingQuantity,
        batchId: batch.id,
        notes: `Expired ${batch.remainingQuantity} rolled credits from previous cycle`,
      });
    }

    // Find last cycle's main batch (non-rolled, with remaining credits)
    const lastCycleBatch = allBatches.find(
      b => !b.rolled && b.remainingQuantity > 0 && b.expiresAt && b.expiresAt <= now
    );

    if (lastCycleBatch && lastCycleBatch.remainingQuantity > 0) {
      // Roll over remaining credits to new batch
      const rolledBatch = await storage.createCreditBatch({
        organizationId,
        grantedQuantity: lastCycleBatch.remainingQuantity,
        remainingQuantity: lastCycleBatch.remainingQuantity,
        grantSource: "plan_inclusion" as any,
        grantedAt: new Date(),
        expiresAt: currentPeriodEnd,
        rolled: true,
        metadataJson: {
          originalBatchId: lastCycleBatch.id,
        } as any,
      });

      // Record rollover in ledger
      await storage.createCreditLedgerEntry({
        organizationId,
        source: "plan_inclusion" as any,
        quantity: lastCycleBatch.remainingQuantity,
        batchId: rolledBatch.id,
        notes: `Rolled over ${lastCycleBatch.remainingQuantity} credits from previous cycle`,
      });

      // Mark original batch as consumed (set to 0)
      await storage.updateCreditBatch(lastCycleBatch.id, {
        remainingQuantity: 0,
      });
    }
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
