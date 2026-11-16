import { eq } from "drizzle-orm";
import { db } from "../db";
import { billingSubscriptions, billingWebhookEvents } from "@shared/billingCatalogSchema";
import * as catalog from "./catalogService";

/**
 * Lightweight reconciliation helpers for self-serve billing.
 * Extends existing reconciliationService usage without replacing it.
 */
export async function summarizeBillingV2Health() {
  const subs = await db.select().from(billingSubscriptions);
  const byStatus: Record<string, number> = {};
  for (const s of subs) {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  }

  const events = await db.select().from(billingWebhookEvents);
  const unprocessed = events.filter((e) => !e.processedAt).length;
  const errored = events.filter((e) => !!e.error).length;

  return {
    selfServeEnabled: await catalog.isSelfServeEnabled(),
    subscriptionCount: subs.length,
    byStatus,
    webhookEvents: events.length,
    webhookUnprocessed: unprocessed,
    webhookErrored: errored,
  };
}

export async function listOrgsMissingStripeLink() {
  const subs = await db.select().from(billingSubscriptions);
  return subs.filter((s) => !s.stripeSubscriptionId && s.status !== "incomplete" && s.status !== "canceled");
}

export async function getSubscriptionAuditRow(organizationId: string) {
  const [sub] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.organizationId, organizationId))
    .limit(1);
  return sub ?? null;
}
