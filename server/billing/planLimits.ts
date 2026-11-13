import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  billingAddons,
  billingPlanPrices,
  billingPlans,
  billingSubscriptions,
} from "@shared/billingCatalogSchema";
import { storage } from "../storage";
import * as catalog from "./catalogService";
import { getUncachableStripeClient } from "../stripeClient";
import { grantPdfCredits } from "./creditRules";

export type LimitCheckResult =
  | { ok: true }
  | {
      ok: false;
      code: "property_limit" | "user_limit" | "read_only" | "no_plan";
      message: string;
      max?: number;
      current?: number;
      action?: "upgrade" | "add_pack" | "enquire" | "portal";
    };

export async function getOrgBillingSubscription(organizationId: string) {
  const [sub] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.organizationId, organizationId))
    .limit(1);
  return sub ?? null;
}

export async function getPlanForOrg(organizationId: string) {
  const sub = await getOrgBillingSubscription(organizationId);
  if (!sub) return { sub: null, plan: null };
  // Incomplete / placeholder rows are not an active plan — checkout must finish first
  if (
    !sub.planCode ||
    sub.planCode === "pending" ||
    sub.status === "incomplete" ||
    sub.status === "incomplete_expired"
  ) {
    return { sub, plan: null };
  }
  const [plan] = await db
    .select()
    .from(billingPlans)
    .where(eq(billingPlans.code, sub.planCode))
    .limit(1);
  return { sub, plan: plan ?? null };
}

export async function effectivePropertyLimit(organizationId: string): Promise<number | null> {
  const { sub, plan } = await getPlanForOrg(organizationId);
  if (!plan) return null;
  if (plan.maxProperties == null) return null;
  const packs = sub?.propertyPacks || 0;
  const perPack = 10;
  const ceiling = Number(await catalog.getConfigValue("max_properties_with_packs", "250"));
  const withPacks = plan.maxProperties + packs * perPack;
  return Math.min(withPacks, ceiling);
}

export async function effectiveUserLimit(organizationId: string): Promise<number | null> {
  const { sub, plan } = await getPlanForOrg(organizationId);
  if (!plan) return null;
  if (plan.maxUsers == null) return null;
  return plan.maxUsers + (sub?.extraUsers || 0);
}

export async function assertCanAddProperty(organizationId: string): Promise<LimitCheckResult> {
  const sub = await getOrgBillingSubscription(organizationId);
  if (sub?.status === "read_only" || sub?.status === "canceled") {
    return {
      ok: false,
      code: "read_only",
      message: "Billing is read-only. Update payment or reactivate to add properties.",
      action: "portal",
    };
  }
  const max = await effectivePropertyLimit(organizationId);
  if (max == null) return { ok: true };
  const props = await storage.getPropertiesByOrganization?.(organizationId);
  const current = Array.isArray(props) ? props.length : 0;
  if (current >= max) {
    const { plan } = await getPlanForOrg(organizationId);
    const action =
      plan?.allowsPropertyPacks ? "add_pack" : plan?.enquireOnly ? "enquire" : "upgrade";
    return {
      ok: false,
      code: "property_limit",
      message: `Property limit reached (${current}/${max}).`,
      max,
      current,
      action,
    };
  }
  return { ok: true };
}

export async function assertCanAddUser(organizationId: string): Promise<LimitCheckResult> {
  const sub = await getOrgBillingSubscription(organizationId);
  if (sub?.status === "read_only" || sub?.status === "canceled") {
    return {
      ok: false,
      code: "read_only",
      message: "Billing is read-only. Update payment to add users.",
      action: "portal",
    };
  }
  const max = await effectiveUserLimit(organizationId);
  if (max == null) return { ok: true };
  // Count non-tenant members
  const members = await storage.getUsersByOrganization(organizationId);
  const current = members.filter(
    (m) => m.role !== "tenant" && m.role !== "landlord",
  ).length;
  if (current >= max) {
    const { plan } = await getPlanForOrg(organizationId);
    return {
      ok: false,
      code: "user_limit",
      message: `User limit reached (${current}/${max}).`,
      max,
      current,
      action: plan?.allowsExtraUsers ? "add_pack" : "upgrade",
    };
  }
  return { ok: true };
}

export async function isModuleAvailableOnPlan(
  organizationId: string,
  moduleKey: string,
): Promise<{ available: boolean; viaAddon?: boolean; planName?: string }> {
  const { plan, sub } = await getPlanForOrg(organizationId);
  if (!plan) return { available: true }; // legacy admin-managed
  const modules = (plan.modulesJson || {}) as Record<string, boolean | "addon">;
  const flag = modules[moduleKey];
  if (flag === true) return { available: true, planName: plan.name };
  if (flag === "addon") {
    if (moduleKey === "hmo_compliance" && sub?.hmoAddon) {
      return { available: true, viaAddon: true, planName: plan.name };
    }
    return { available: false, viaAddon: true, planName: plan.name };
  }
  return { available: false, planName: plan.name };
}

async function resolveStripePriceId(input: {
  lookupKey: string;
  planName: string;
  planCode: string;
  cycle: "monthly" | "yearly";
  amountMinor: number;
}): Promise<string> {
  const stripe = await getUncachableStripeClient();
  const lookup = await stripe.prices.list({ lookup_keys: [input.lookupKey], limit: 1 });
  if (lookup.data[0]?.id) return lookup.data[0].id;
  const product = await stripe.products.create({
    name: `${input.planName} (${input.cycle})`,
    metadata: { planCode: input.planCode },
  });
  const created = await stripe.prices.create({
    product: product.id,
    currency: "gbp",
    unit_amount: input.amountMinor,
    recurring: { interval: input.cycle === "yearly" ? "year" : "month" },
    lookup_key: input.lookupKey,
    tax_behavior: "exclusive",
  });
  return created.id;
}

/** Apply a paid upgrade that was held in pending_* until the proration invoice succeeded. */
export async function finalizePendingUpgrade(organizationId: string): Promise<boolean> {
  const [sub] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.organizationId, organizationId))
    .limit(1);
  if (!sub?.pendingPlanCode) return false;

  const [updated] = await db
    .update(billingSubscriptions)
    .set({
      planCode: sub.pendingPlanCode,
      cycle: (sub.pendingCycle as "monthly" | "yearly") || sub.cycle,
      amountMinorFrozen: sub.pendingAmountMinor ?? sub.amountMinorFrozen,
      priceVersionId: sub.pendingPriceVersionId || sub.priceVersionId,
      pendingPlanCode: null,
      pendingCycle: null,
      pendingAmountMinor: null,
      pendingPriceVersionId: null,
      updatedAt: new Date(),
    })
    .where(eq(billingSubscriptions.organizationId, organizationId))
    .returning();

  await catalog.writeBillingAudit({
    actorType: "system",
    organizationId,
    action: "plan.upgrade_confirmed",
    before: { planCode: sub.planCode, cycle: sub.cycle },
    after: {
      planCode: updated?.planCode,
      cycle: updated?.cycle,
      amountMinorFrozen: updated?.amountMinorFrozen,
    },
  });

  try {
    await applyPlanModulesToOrg(organizationId);
  } catch (e) {
    console.warn("[billing] applyPlanModules after upgrade confirm failed:", e);
  }
  return true;
}

/**
 * Proration invoice failed — keep local old plan and roll Stripe subscription
 * back to the previous price so the customer is not left on the higher tier unpaid.
 */
export async function revertPendingUpgrade(organizationId: string): Promise<boolean> {
  const [sub] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.organizationId, organizationId))
    .limit(1);
  if (!sub?.pendingPlanCode || !sub.stripeSubscriptionId) return false;

  const previousCycle = (sub.cycle === "monthly" ? "monthly" : "yearly") as "monthly" | "yearly";
  const [previousPlan] = await db
    .select()
    .from(billingPlans)
    .where(eq(billingPlans.code, sub.planCode))
    .limit(1);

  try {
    const { stripeLookupForPlan } = await import("./catalogSeed");
    const lookupKey = stripeLookupForPlan(sub.planCode, previousCycle);
    const stripePriceId = await resolveStripePriceId({
      lookupKey,
      planName: previousPlan?.name || sub.planCode,
      planCode: sub.planCode,
      cycle: previousCycle,
      amountMinor: sub.amountMinorFrozen || 0,
    });
    const stripe = await getUncachableStripeClient();
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    const itemId = stripeSub.items.data[0]?.id;
    if (itemId) {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        items: [{ id: itemId, price: stripePriceId }],
        proration_behavior: "none",
        metadata: {
          organizationId,
          planCode: sub.planCode,
          cycle: previousCycle,
          billingV2: "true",
          upgradePending: "false",
        },
      });
    }
  } catch (err) {
    console.error("[billing] Failed to revert Stripe price after upgrade payment failure:", err);
  }

  await db
    .update(billingSubscriptions)
    .set({
      pendingPlanCode: null,
      pendingCycle: null,
      pendingAmountMinor: null,
      pendingPriceVersionId: null,
      updatedAt: new Date(),
    })
    .where(eq(billingSubscriptions.organizationId, organizationId));

  await catalog.writeBillingAudit({
    actorType: "system",
    organizationId,
    action: "plan.upgrade_reverted",
    before: {
      pendingPlanCode: sub.pendingPlanCode,
      pendingCycle: sub.pendingCycle,
    },
    after: { planCode: sub.planCode, cycle: sub.cycle },
  });
  return true;
}

export async function changePlan(input: {
  organizationId: string;
  userId: string;
  planCode: string;
  cycle: "monthly" | "yearly";
}): Promise<{
  mode: "upgrade_pending_payment" | "downgrade_scheduled";
  subscription: any;
}> {
  const { sub, plan: currentPlan } = await getPlanForOrg(input.organizationId);
  if (!sub?.stripeSubscriptionId) {
    const err: any = new Error("No active Stripe subscription");
    err.status = 400;
    throw err;
  }
  if (sub.pendingPlanCode) {
    const err: any = new Error(
      "An upgrade payment is already pending. Wait for it to complete or fail before changing plan again.",
    );
    err.status = 409;
    throw err;
  }
  if (sub.planCode === input.planCode && sub.cycle === input.cycle) {
    const err: any = new Error("You are already on this plan");
    err.status = 400;
    throw err;
  }
  const [nextPlan] = await db
    .select()
    .from(billingPlans)
    .where(eq(billingPlans.code, input.planCode))
    .limit(1);
  if (!nextPlan || nextPlan.enquireOnly) {
    const err: any = new Error("Invalid plan");
    err.status = 400;
    throw err;
  }

  const published = await catalog.getPublishedVersion();
  if (!published) {
    const err: any = new Error("No published catalog");
    err.status = 400;
    throw err;
  }

  const [price] = await db
    .select()
    .from(billingPlanPrices)
    .where(
      and(
        eq(billingPlanPrices.versionId, published.id),
        eq(billingPlanPrices.planCode, input.planCode),
        eq(billingPlanPrices.cycle, input.cycle),
      ),
    )
    .limit(1);
  if (!price?.stripeLookupKey) {
    const err: any = new Error("Price missing");
    err.status = 400;
    throw err;
  }

  const currentAmount = sub.amountMinorFrozen || 0;
  const isUpgrade =
    price.amountMinor > currentAmount ||
    (input.cycle === "yearly" && sub.cycle === "monthly");

  if (!isUpgrade) {
    // Downgrade / yearly→monthly: schedule at period end
    const [updated] = await db
      .update(billingSubscriptions)
      .set({
        scheduledPlanCode: input.planCode,
        scheduledCycle: input.cycle,
        updatedAt: new Date(),
      })
      .where(eq(billingSubscriptions.organizationId, input.organizationId))
      .returning();
    await catalog.writeBillingAudit({
      actorType: "user",
      actorId: input.userId,
      organizationId: input.organizationId,
      action: "plan.downgrade_scheduled",
      after: { planCode: input.planCode, cycle: input.cycle },
    });
    return { mode: "downgrade_scheduled", subscription: updated };
  }

  // Mark pending upgrade locally BEFORE Stripe change; planCode stays on the old plan
  // until the proration invoice is paid (or we revert on failure).
  const [pendingRow] = await db
    .update(billingSubscriptions)
    .set({
      pendingPlanCode: input.planCode,
      pendingCycle: input.cycle,
      pendingAmountMinor: price.amountMinor,
      pendingPriceVersionId: published.id,
      updatedAt: new Date(),
    })
    .where(eq(billingSubscriptions.organizationId, input.organizationId))
    .returning();

  try {
    const stripePriceId = await resolveStripePriceId({
      lookupKey: price.stripeLookupKey,
      planName: nextPlan.name,
      planCode: nextPlan.code,
      cycle: input.cycle,
      amountMinor: price.amountMinor,
    });
    const stripe = await getUncachableStripeClient();
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    const itemId = stripeSub.items.data[0]?.id;
    if (!itemId) {
      const err: any = new Error("Stripe subscription has no items");
      err.status = 500;
      throw err;
    }
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: itemId, price: stripePriceId }],
      proration_behavior: "always_invoice",
      payment_behavior: "error_if_incomplete",
      metadata: {
        organizationId: input.organizationId,
        planCode: input.planCode,
        cycle: input.cycle,
        billingV2: "true",
        upgradePending: "true",
        previousPlanCode: sub.planCode,
        previousCycle: sub.cycle,
      },
    });
  } catch (err) {
    // Clear pending and roll Stripe back to the previous price if the update stuck.
    try {
      await revertPendingUpgrade(input.organizationId);
    } catch (revertErr) {
      console.error("[billing] revert after failed upgrade threw:", revertErr);
      await db
        .update(billingSubscriptions)
        .set({
          pendingPlanCode: null,
          pendingCycle: null,
          pendingAmountMinor: null,
          pendingPriceVersionId: null,
          updatedAt: new Date(),
        })
        .where(eq(billingSubscriptions.organizationId, input.organizationId));
    }
    throw err;
  }

  await catalog.writeBillingAudit({
    actorType: "user",
    actorId: input.userId,
    organizationId: input.organizationId,
    action: "plan.upgrade_pending_payment",
    before: { planCode: currentPlan?.code, cycle: sub.cycle },
    after: { planCode: input.planCode, cycle: input.cycle, pending: true },
  });

  return { mode: "upgrade_pending_payment", subscription: pendingRow };
}

export async function addPropertyPacks(input: {
  organizationId: string;
  userId: string;
  quantity: number;
}): Promise<{ packs: number; creditsGranted: number }> {
  const qty = Math.floor(input.quantity);
  if (qty < 1) {
    const err: any = new Error("quantity must be >= 1");
    err.status = 400;
    throw err;
  }
  const ceiling = Number(await catalog.getConfigValue("property_pack_ceiling", "15"));
  const { sub, plan } = await getPlanForOrg(input.organizationId);
  if (!sub || !plan?.allowsPropertyPacks) {
    const err: any = new Error("Property packs not available on this plan");
    err.status = 400;
    throw err;
  }
  const newTotal = (sub.propertyPacks || 0) + qty;
  if (newTotal > ceiling) {
    const err: any = new Error(`Property packs capped at ${ceiling}`);
    err.status = 400;
    throw err;
  }

  const [addon] = await db
    .select()
    .from(billingAddons)
    .where(eq(billingAddons.code, "addon_props10"))
    .limit(1);
  if (!addon) {
    const err: any = new Error("Property pack addon not configured");
    err.status = 500;
    throw err;
  }

  const cycle = (sub.cycle === "monthly" ? "monthly" : "yearly") as "monthly" | "yearly";
  const amountMinor =
    cycle === "yearly" ? addon.yearlyAmountMinor || 25000 : addon.monthlyAmountMinor || 2500;
  const lookupKey =
    (cycle === "yearly" ? addon.stripeLookupKeyYear : addon.stripeLookupKeyMonth) ||
    `addon_props10_${cycle === "yearly" ? "year" : "month"}`;

  if (sub.stripeSubscriptionId) {
    const { setSubscriptionAddonQuantity } = await import("./stripeAddonItems");
    await setSubscriptionAddonQuantity({
      stripeSubscriptionId: sub.stripeSubscriptionId,
      lookupKey,
      name: addon.name,
      amountMinor,
      cycle,
      quantity: newTotal,
      metadata: { addonCode: "addon_props10", organizationId: input.organizationId },
    });
  }

  // Mid-cycle proration for credits (shared pure helper)
  const { proratedPackInspectionCredits } = await import("@shared/billingFinancialMath");
  const periodEnd = sub.periodEnd ? new Date(sub.periodEnd).getTime() : Date.now();
  const periodStart = sub.periodStart ? new Date(sub.periodStart).getTime() : Date.now();
  const inspPer =
    cycle === "yearly"
      ? (addon.inspectionsPerYear || 30) * qty
      : (addon.inspectionsPerMonth || 2) * qty;
  const creditsGranted = proratedPackInspectionCredits({
    inspectionsForFullPeriod: inspPer,
    periodStartMs: periodStart,
    periodEndMs: periodEnd || periodStart + 1,
    nowMs: Date.now(),
  });
  if (creditsGranted > 0) {
    await grantPdfCredits({
      organizationId: input.organizationId,
      kind: "inspection",
      quantity: creditsGranted,
      source: "addon_pack",
      expiryMonths: cycle === "yearly" ? undefined : 3,
      expiresAt: cycle === "yearly" ? sub.periodEnd : undefined,
      metadata: { propertyPacks: qty, prorated: true },
    });
  }

  const [updated] = await db
    .update(billingSubscriptions)
    .set({
      propertyPacks: newTotal,
      updatedAt: new Date(),
    })
    .where(eq(billingSubscriptions.organizationId, input.organizationId))
    .returning();

  await catalog.writeBillingAudit({
    actorType: "user",
    actorId: input.userId,
    organizationId: input.organizationId,
    action: "addon.property_packs",
    after: { packs: updated.propertyPacks, creditsGranted },
  });

  return { packs: updated.propertyPacks, creditsGranted };
}

export async function setExtraUsers(input: {
  organizationId: string;
  userId: string;
  extraUsers: number;
}) {
  const n = Math.max(0, Math.floor(input.extraUsers));
  const { sub, plan } = await getPlanForOrg(input.organizationId);
  if (!sub || !plan?.allowsExtraUsers) {
    const err: any = new Error("Extra users not available on this plan");
    err.status = 400;
    throw err;
  }

  const [addon] = await db
    .select()
    .from(billingAddons)
    .where(eq(billingAddons.code, "addon_user"))
    .limit(1);

  if (addon && sub.stripeSubscriptionId) {
    const cycle = (sub.cycle === "monthly" ? "monthly" : "yearly") as "monthly" | "yearly";
    const amountMinor =
      cycle === "yearly" ? addon.yearlyAmountMinor || 10000 : addon.monthlyAmountMinor || 1000;
    const lookupKey =
      (cycle === "yearly" ? addon.stripeLookupKeyYear : addon.stripeLookupKeyMonth) ||
      `addon_user_${cycle === "yearly" ? "year" : "month"}`;
    const { setSubscriptionAddonQuantity } = await import("./stripeAddonItems");
    await setSubscriptionAddonQuantity({
      stripeSubscriptionId: sub.stripeSubscriptionId,
      lookupKey,
      name: addon.name,
      amountMinor,
      cycle,
      quantity: n,
      metadata: { addonCode: "addon_user", organizationId: input.organizationId },
    });
  }

  const [updated] = await db
    .update(billingSubscriptions)
    .set({ extraUsers: n, updatedAt: new Date() })
    .where(eq(billingSubscriptions.organizationId, input.organizationId))
    .returning();
  await catalog.writeBillingAudit({
    actorType: "user",
    actorId: input.userId,
    organizationId: input.organizationId,
    action: "addon.extra_users",
    after: { extraUsers: n },
  });
  return updated;
}

export async function setHmoAddon(input: {
  organizationId: string;
  userId: string;
  enabled: boolean;
}) {
  const { sub, plan } = await getPlanForOrg(input.organizationId);
  if (!sub) {
    const err: any = new Error("No billing subscription");
    err.status = 400;
    throw err;
  }

  const [addon] = await db
    .select()
    .from(billingAddons)
    .where(eq(billingAddons.code, "addon_hmo"))
    .limit(1);

  const freeOnPlan =
    !!addon &&
    Array.isArray(addon.includedFreeOnPlansJson) &&
    (addon.includedFreeOnPlansJson as string[]).includes(sub.planCode);
  const includedInPlan = (plan?.modulesJson as any)?.hmo === true;

  if (addon && sub.stripeSubscriptionId && !freeOnPlan && !includedInPlan) {
    const cycle = (sub.cycle === "monthly" ? "monthly" : "yearly") as "monthly" | "yearly";
    const amountMinor =
      cycle === "yearly" ? addon.yearlyAmountMinor || 29000 : addon.monthlyAmountMinor || 2900;
    const lookupKey =
      (cycle === "yearly" ? addon.stripeLookupKeyYear : addon.stripeLookupKeyMonth) ||
      `addon_hmo_${cycle === "yearly" ? "year" : "month"}`;
    const { setSubscriptionAddonQuantity } = await import("./stripeAddonItems");
    await setSubscriptionAddonQuantity({
      stripeSubscriptionId: sub.stripeSubscriptionId,
      lookupKey,
      name: addon.name,
      amountMinor,
      cycle,
      quantity: input.enabled ? 1 : 0,
      metadata: { addonCode: "addon_hmo", organizationId: input.organizationId },
    });
  }

  const [updated] = await db
    .update(billingSubscriptions)
    .set({ hmoAddon: input.enabled, updatedAt: new Date() })
    .where(eq(billingSubscriptions.organizationId, input.organizationId))
    .returning();

  await applyPlanModulesToOrg(input.organizationId, {
    forceHmo: input.enabled || freeOnPlan || includedInPlan,
  });

  await catalog.writeBillingAudit({
    actorType: "user",
    actorId: input.userId,
    organizationId: input.organizationId,
    action: input.enabled ? "addon.hmo_enabled" : "addon.hmo_disabled",
  });
  return updated;
}

/** Billing statuses that keep paid product access (past_due = payment-failure grace). */
export const BILLING_PAID_ACCESS_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
]);

/** Canceled / failed / locked — must not keep plan company modules or paid mutations. */
export function isBillingPaidAccessBlocked(
  status: string | null | undefined,
): boolean {
  if (!status) return false;
  return (
    status === "canceled" ||
    status === "read_only" ||
    status === "incomplete_expired" ||
    status === "unpaid"
  );
}

export async function stripPlanCompanyModules(organizationId: string): Promise<void> {
  await storage.updateOrganization(organizationId, {
    complianceEnabled: false,
    maintenanceEnabled: false,
    tenanciesEnabled: false,
    rentalsEnabled: false,
    hmoComplianceEnabled: false,
  } as any);
}

/** Map catalog plan modulesJson → organization company-module flags. */
export async function applyPlanModulesToOrg(
  organizationId: string,
  opts?: { forceHmo?: boolean },
) {
  const { plan, sub } = await getPlanForOrg(organizationId);
  if (!plan) return;

  // Canceled / read_only / unpaid: strip plan modules — do not leave paid features on.
  if (isBillingPaidAccessBlocked(sub?.status)) {
    await stripPlanCompanyModules(organizationId);
    return;
  }

  // Only apply module entitlements while the subscription is in good standing (or grace).
  if (sub?.status && !BILLING_PAID_ACCESS_STATUSES.has(sub.status)) {
    return;
  }

  const modules = (plan.modulesJson || {}) as Record<string, boolean | "addon">;
  const hmoOn =
    opts?.forceHmo === true ||
    modules.hmo === true ||
    (modules.hmo === "addon" && !!sub?.hmoAddon);

  const patch: Record<string, boolean> = {};
  if (typeof modules.compliance === "boolean") patch.complianceEnabled = modules.compliance;
  if (typeof modules.work_orders === "boolean") patch.maintenanceEnabled = modules.work_orders;
  if (typeof modules.tenant_portal === "boolean") {
    patch.tenanciesEnabled = modules.tenant_portal;
    patch.rentalsEnabled = modules.tenant_portal;
  }
  patch.hmoComplianceEnabled = hmoOn;

  if (Object.keys(patch).length === 0) return;
  await storage.updateOrganization(organizationId, patch as any);
}

export async function cancelAtPeriodEnd(organizationId: string, userId: string) {
  const sub = await getOrgBillingSubscription(organizationId);
  if (!sub?.stripeSubscriptionId) {
    const err: any = new Error("No Stripe subscription");
    err.status = 400;
    throw err;
  }
  const stripe = await getUncachableStripeClient();
  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
  const [updated] = await db
    .update(billingSubscriptions)
    .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
    .where(eq(billingSubscriptions.organizationId, organizationId))
    .returning();
  await catalog.writeBillingAudit({
    actorType: "user",
    actorId: userId,
    organizationId,
    action: "subscription.cancel_at_period_end",
  });
  return updated;
}

export async function isOrgReadOnly(organizationId: string): Promise<boolean> {
  const sub = await getOrgBillingSubscription(organizationId);
  return sub?.status === "read_only";
}

export async function getOrgBillingStatus(
  organizationId: string,
): Promise<string | null> {
  const sub = await getOrgBillingSubscription(organizationId);
  return sub?.status ?? null;
}
