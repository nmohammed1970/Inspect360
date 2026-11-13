import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  billingSubscriptions,
  billingWebhookEvents,
} from "@shared/billingCatalogSchema";
import * as catalog from "./catalogService";
import { applyCheckoutCompletedFromStripe } from "./subscriptionLifecycle";
import {
  expireTrialCredits,
  grantPlanIncludedCredits,
  planPeriodGrantKey,
} from "./creditRules";

/**
 * Idempotent Stripe webhook processing for self-serve billing (billingV2).
 * Returns { handled: true } when a billingV2 path was processed.
 */
export async function processBillingV2WebhookEvent(event: {
  id: string;
  type: string;
  data: { object: any };
}): Promise<{ handled: boolean; duplicate?: boolean }> {
  if (!event?.id) return { handled: false };

  // Idempotency: skip if already processed successfully
  const [existing] = await db
    .select()
    .from(billingWebhookEvents)
    .where(eq(billingWebhookEvents.stripeEventId, event.id))
    .limit(1);
  if (existing?.processedAt) {
    return { handled: true, duplicate: true };
  }

  if (!existing) {
    try {
      await db.insert(billingWebhookEvents).values({
        stripeEventId: event.id,
        eventType: event.type,
        payloadJson: event as any,
      });
    } catch {
      // Unique race — another worker inserted; re-check
      const [race] = await db
        .select()
        .from(billingWebhookEvents)
        .where(eq(billingWebhookEvents.stripeEventId, event.id))
        .limit(1);
      if (race?.processedAt) return { handled: true, duplicate: true };
    }
  }

  try {
    let handled = false;

    switch (event.type) {
      case "checkout.session.completed": {
        const result = await applyCheckoutCompletedFromStripe(event.data.object);
        handled = Boolean(result.handled);
        break;
      }
      case "invoice.paid": {
        handled = await handleInvoicePaid(event.data.object);
        break;
      }
      case "invoice.payment_failed": {
        handled = await handlePaymentFailed(event.data.object);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        handled = await handleSubscriptionChange(event.data.object, event.type);
        break;
      }
      default:
        handled = false;
    }

    // Only mark processed when we actually handled billingV2 — leave legacy events free for redelivery/legacy path
    if (handled) {
      await db
        .update(billingWebhookEvents)
        .set({ processedAt: new Date(), error: null })
        .where(eq(billingWebhookEvents.stripeEventId, event.id));
    }

    return { handled };
  } catch (err: any) {
    await db
      .update(billingWebhookEvents)
      .set({ error: err?.message || String(err) })
      .where(eq(billingWebhookEvents.stripeEventId, event.id));
    throw err;
  }
}

async function findSubByStripe(obj: any) {
  const subId =
    typeof obj.subscription === "string"
      ? obj.subscription
      : obj.subscription?.id || (obj.object === "subscription" ? obj.id : null);
  const customerId =
    typeof obj.customer === "string" ? obj.customer : obj.customer?.id || null;
  const orgId = obj.metadata?.organizationId as string | undefined;

  if (orgId) {
    const [row] = await db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.organizationId, orgId))
      .limit(1);
    if (row) return row;
  }
  if (subId) {
    const [row] = await db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.stripeSubscriptionId, subId))
      .limit(1);
    if (row) return row;
  }
  if (customerId) {
    const [row] = await db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.stripeCustomerId, customerId))
      .limit(1);
    if (row) return row;
  }
  return null;
}

async function handleInvoicePaid(invoice: any): Promise<boolean> {
  if (invoice?.metadata?.billingV2 !== "true" && !invoice?.subscription) {
    // Still try to match known billing_subscriptions
  }
  const sub = await findSubByStripe(invoice);
  if (!sub) return false;

  const periodStart = invoice.lines?.data?.[0]?.period?.start
    ? new Date(invoice.lines.data[0].period.start * 1000)
    : new Date();
  const periodEnd = invoice.lines?.data?.[0]?.period?.end
    ? new Date(invoice.lines.data[0].period.end * 1000)
    : null;

  await db
    .update(billingSubscriptions)
    .set({
      status: "active",
      firstPaymentFailureAt: null,
      periodStart,
      periodEnd: periodEnd || sub.periodEnd,
      updatedAt: new Date(),
    })
    .where(eq(billingSubscriptions.organizationId, sub.organizationId));

  try {
    const { enforceAiPlanCompanyModuleLocks } = await import("./companyModulePlanLocks");
    await enforceAiPlanCompanyModuleLocks(sub.organizationId);
  } catch (lockErr) {
    console.error("[Stripe Webhook] AI plan company-module lock failed:", lockErr);
  }

  const amountPaid = Number(invoice.amount_paid || 0);
  const reason = String(invoice.billing_reason || "");

  // Confirm pending upgrade only after the proration / update invoice is paid.
  if (sub.pendingPlanCode && (reason === "subscription_update" || amountPaid > 0)) {
    try {
      const { finalizePendingUpgrade } = await import("./planLimits");
      await finalizePendingUpgrade(sub.organizationId);
      // Re-load after finalize so credit grant uses the new plan
      const refreshed = await findSubByStripe(invoice);
      if (refreshed) Object.assign(sub, refreshed);
    } catch (e) {
      console.error("[billing] finalizePendingUpgrade failed:", e);
    }
  }

  // Paid invoices only (skip $0 trial invoices). Grant plan credits and expire trial bonus.
  const shouldGrantPlanCredits =
    sub.planCode !== "pending" &&
    amountPaid > 0 &&
    (reason === "subscription_cycle" ||
      reason === "subscription_create" ||
      reason === "subscription_update" ||
      !reason);

  if (shouldGrantPlanCredits) {
    const stripeSubId =
      typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id || sub.stripeSubscriptionId || sub.organizationId;
    const planCycle = (sub.cycle === "monthly" ? "monthly" : "yearly") as "monthly" | "yearly";
    const expiresAt =
      planCycle === "yearly"
        ? periodEnd
        : (() => {
            const d = new Date();
            d.setMonth(d.getMonth() + 3);
            return d;
          })();
    await expireTrialCredits(sub.organizationId);
    await grantPlanIncludedCredits({
      organizationId: sub.organizationId,
      planCode: sub.planCode,
      cycle: planCycle,
      expiresAt: expiresAt || null,
      grantKey: planPeriodGrantKey(stripeSubId, periodStart),
    });
  }

  try {
    const { applyPlanModulesToOrg } = await import("./planLimits");
    await applyPlanModulesToOrg(sub.organizationId);
  } catch (e) {
    console.warn("[billing] applyPlanModules on invoice.paid failed:", e);
  }

  await catalog.writeBillingAudit({
    actorType: "system",
    organizationId: sub.organizationId,
    action: "invoice.paid",
    entityType: "invoice",
    entityId: invoice.id,
  });
  return true;
}

async function handlePaymentFailed(invoice: any): Promise<boolean> {
  const sub = await findSubByStripe(invoice);
  if (!sub) return false;

  const reason = String(invoice.billing_reason || "");
  const wasPendingUpgrade = Boolean(sub.pendingPlanCode);
  // Upgrade proration failed → roll Stripe + clear pending; keep the old local plan.
  // Do not treat this as subscription past_due / read_only — the base plan is still paid.
  const onlyUpgradeProrationFailed =
    wasPendingUpgrade && (reason === "subscription_update" || reason === "");

  if (wasPendingUpgrade) {
    try {
      const { revertPendingUpgrade } = await import("./planLimits");
      await revertPendingUpgrade(sub.organizationId);
    } catch (e) {
      console.error("[billing] revertPendingUpgrade failed:", e);
    }
  }

  if (onlyUpgradeProrationFailed) {
    const keepStatus =
      sub.status === "trialing" || sub.status === "active" ? sub.status : "active";
    await db
      .update(billingSubscriptions)
      .set({
        status: keepStatus,
        updatedAt: new Date(),
      })
      .where(eq(billingSubscriptions.organizationId, sub.organizationId));
    await catalog.writeBillingAudit({
      actorType: "system",
      organizationId: sub.organizationId,
      action: "invoice.payment_failed_upgrade_reverted",
      entityType: "invoice",
      entityId: invoice.id,
    });
    return true;
  }

  const firstFail = sub.firstPaymentFailureAt || new Date();
  await db
    .update(billingSubscriptions)
    .set({
      status: "past_due",
      firstPaymentFailureAt: firstFail,
      updatedAt: new Date(),
    })
    .where(eq(billingSubscriptions.organizationId, sub.organizationId));
  return true;
}

async function handleSubscriptionChange(stripeSub: any, eventType: string): Promise<boolean> {
  const sub = await findSubByStripe(stripeSub);
  if (!sub) return false;

  if (eventType === "customer.subscription.deleted") {
    await db
      .update(billingSubscriptions)
      .set({
        status: "canceled",
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      })
      .where(eq(billingSubscriptions.organizationId, sub.organizationId));
    try {
      const { stripPlanCompanyModules } = await import("./planLimits");
      await stripPlanCompanyModules(sub.organizationId);
    } catch (e) {
      console.warn("[billing] strip modules on cancel failed:", e);
    }
    return true;
  }

  const statusMap: Record<string, string> = {
    trialing: "trialing",
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "past_due",
    incomplete: "incomplete",
    incomplete_expired: "canceled",
  };
  let mapped = statusMap[stripeSub.status] || sub.status;
  // While an upgrade proration is outstanding, do not let Stripe's transient
  // incomplete/past_due status flip the org into payment-failure / read_only.
  // invoice.payment_failed (revert) or invoice.paid (finalize) owns that path.
  if (
    sub.pendingPlanCode &&
    (mapped === "past_due" || mapped === "incomplete" || mapped === "unpaid")
  ) {
    mapped =
      sub.status === "trialing" || sub.status === "active" ? sub.status : "active";
  }
  const periodStart = stripeSub.current_period_start
    ? new Date(stripeSub.current_period_start * 1000)
    : sub.periodStart;
  const periodEnd = stripeSub.current_period_end
    ? new Date(stripeSub.current_period_end * 1000)
    : sub.periodEnd;
  await db
    .update(billingSubscriptions)
    .set({
      status: mapped,
      cancelAtPeriodEnd: Boolean(stripeSub.cancel_at_period_end),
      periodStart,
      periodEnd,
      trialEnd: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : sub.trialEnd,
      updatedAt: new Date(),
    })
    .where(eq(billingSubscriptions.organizationId, sub.organizationId));

  if (
    mapped === "canceled" ||
    mapped === "read_only" ||
    mapped === "incomplete_expired" ||
    mapped === "unpaid"
  ) {
    try {
      const { stripPlanCompanyModules } = await import("./planLimits");
      await stripPlanCompanyModules(sub.organizationId);
    } catch (e) {
      console.warn("[billing] strip modules on status change failed:", e);
    }
  }

  // Only when leaving trial / incomplete → active (renewals are handled by invoice.paid).
  // Idempotent with invoice.paid via the same planPeriodGrantKey.
  if (
    mapped === "active" &&
    sub.status !== "active" &&
    sub.planCode &&
    sub.planCode !== "pending" &&
    stripeSub.id
  ) {
    await expireTrialCredits(sub.organizationId);
    const start = periodStart || new Date();
    const expiresAt =
      sub.cycle === "yearly"
        ? periodEnd
        : (() => {
            const d = new Date();
            d.setMonth(d.getMonth() + 3);
            return d;
          })();
    await grantPlanIncludedCredits({
      organizationId: sub.organizationId,
      planCode: sub.planCode,
      cycle: (sub.cycle === "monthly" ? "monthly" : "yearly") as "monthly" | "yearly",
      expiresAt: expiresAt || null,
      grantKey: planPeriodGrantKey(String(stripeSub.id), start),
    });
  }
  return true;
}

/** Apply 7-day failure → read_only for past_due subscriptions. */
export async function applyPaymentFailureReadOnly(): Promise<number> {
  const days = Number(await catalog.getConfigValue("payment_failure_readonly_days", "7"));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const rows = await db.select().from(billingSubscriptions);
  let n = 0;
  for (const row of rows) {
    if (row.status !== "past_due") continue;
    if (!row.firstPaymentFailureAt) continue;
    if (new Date(row.firstPaymentFailureAt).getTime() > cutoff.getTime()) continue;
    await db
      .update(billingSubscriptions)
      .set({ status: "read_only", updatedAt: new Date() })
      .where(eq(billingSubscriptions.organizationId, row.organizationId));
    try {
      const { stripPlanCompanyModules } = await import("./planLimits");
      await stripPlanCompanyModules(row.organizationId);
    } catch (e) {
      console.warn("[billing] strip modules on read_only failed:", e);
    }
    n++;
  }
  return n;
}
