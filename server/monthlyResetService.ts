import { billingService } from "./billingService";
import { storage } from "./storage";
import { db } from "./db";
import { instanceSubscriptions } from "@shared/schema";
import { eq, lte, and } from "drizzle-orm";
import {
  billingNowUtc,
  nextRenewalUtc,
  BILLING_TIMEZONE,
} from "@shared/billingClock";

/**
 * Monthly Reset Service
 *
 * Renewal comparisons and advances use UTC (see shared/billingClock.ts).
 * Prefer aligning scheduled jobs to UTC midnight, not the host's local TZ.
 */
export class MonthlyResetService {
  /**
   * Reset usage counters for a single organization
   */
  async resetOrganizationUsage(organizationId: string): Promise<void> {
    try {
      await billingService.resetMonthlyUsage(organizationId);

      const instanceSub = await storage.getInstanceSubscription(organizationId);
      if (instanceSub && instanceSub.subscriptionRenewalDate) {
        const { subscriptionService } = await import("./subscriptionService");

        await subscriptionService.processCreditExpiry(
          organizationId,
          instanceSub.subscriptionRenewalDate
        );

        if (instanceSub.inspectionQuotaIncluded > 0 && instanceSub.subscriptionStatus === "active") {
          console.log(`[Monthly Reset] Resetting inspection quota for org ${organizationId} to ${instanceSub.inspectionQuotaIncluded}`);

          const existingBatches = await storage.getCreditBatchesByOrganization(organizationId);
          const planBatches = existingBatches.filter(b =>
            b.grantSource === 'plan_inclusion' &&
            b.remainingQuantity > 0
          );

          for (const batch of planBatches) {
            await storage.expireCreditBatch(batch.id);
            await storage.createCreditLedgerEntry({
              organizationId,
              source: "expiry" as any,
              quantity: -batch.remainingQuantity,
              batchId: batch.id,
              notes: `Expired ${batch.remainingQuantity} credits due to monthly quota reset (no rollover)`
            });
          }

          const addonPackBatches = existingBatches.filter(b =>
            b.grantSource === 'addon_pack' &&
            b.remainingQuantity > 0
          );

          for (const batch of addonPackBatches) {
            await storage.expireCreditBatch(batch.id);
            await storage.createCreditLedgerEntry({
              organizationId,
              source: "expiry" as any,
              quantity: -batch.remainingQuantity,
              batchId: batch.id,
              notes: `Expired ${batch.remainingQuantity} addon pack credits due to subscription plan reset (no rollover)`
            });
          }

          if (addonPackBatches.length > 0) {
            console.log(`[Monthly Reset] Expired ${addonPackBatches.length} addon pack batches for org ${organizationId}`);
          }

          await subscriptionService.grantCredits(
            organizationId,
            instanceSub.inspectionQuotaIncluded,
            "plan_inclusion",
            instanceSub.subscriptionRenewalDate
          );

          console.log(`[Monthly Reset] Granted ${instanceSub.inspectionQuotaIncluded} credits to org ${organizationId}`);
        }
      }

      console.log(`[Monthly Reset] Reset usage for organization ${organizationId}`);
    } catch (error) {
      console.error(`[Monthly Reset] Error resetting usage for organization ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Process monthly reset for all subscriptions that need it.
   * Due when subscription_renewal_date <= now (UTC instants).
   */
  async processMonthlyResets(): Promise<{ processed: number; errors: number }> {
    const now = billingNowUtc();
    let processed = 0;
    let errors = 0;

    try {
      const subscriptionsToReset = await db.select()
        .from(instanceSubscriptions)
        .where(
          and(
            eq(instanceSubscriptions.subscriptionStatus, "active"),
            lte(instanceSubscriptions.subscriptionRenewalDate, now)
          )
        );

      for (const sub of subscriptionsToReset) {
        try {
          await this.resetOrganizationUsage(sub.organizationId);
          processed++;

          const previous = sub.subscriptionRenewalDate
            ? new Date(sub.subscriptionRenewalDate)
            : now;
          const cycle = sub.billingCycle === "annual" ? "annual" : "monthly";
          const nextRenewalDate = nextRenewalUtc(previous, cycle);

          await storage.updateInstanceSubscription(sub.id, {
            subscriptionRenewalDate: nextRenewalDate
          });
          console.log(
            `[Monthly Reset] Next renewal for org ${sub.organizationId}: ${nextRenewalDate.toISOString()} (${BILLING_TIMEZONE})`,
          );
        } catch (error) {
          console.error(`[Monthly Reset] Error processing subscription ${sub.id}:`, error);
          errors++;
        }
      }

      console.log(`[Monthly Reset] Processed ${processed} subscriptions, ${errors} errors (clock=${BILLING_TIMEZONE})`);
      return { processed, errors };
    } catch (error) {
      console.error("[Monthly Reset] Error processing monthly resets:", error);
      throw error;
    }
  }

  async resetAllActiveSubscriptions(): Promise<number> {
    return await billingService.resetAllMonthlyUsage();
  }
}

export const monthlyResetService = new MonthlyResetService();
