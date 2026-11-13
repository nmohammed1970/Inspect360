import { eq } from "drizzle-orm";
import { db } from "../db";
import { getUncachableStripeClient } from "../stripeClient";
import {
  billingOrgSettings,
  billingPlanPrices,
  billingPlans,
  billingSubscriptions,
  billingTopupPacks,
} from "@shared/billingCatalogSchema";
import { storage as appStorage } from "../storage";
import * as catalog from "./catalogService";
import { grantPdfCredits } from "./creditRules";

function requireUrl(url: string, label: string) {
  if (!url || !/^https?:\/\//i.test(url)) {
    const err: any = new Error(`${label} must be an absolute URL`);
    err.status = 400;
    throw err;
  }
}

function isStripeTaxConfigError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || "").toLowerCase();
  return (
    msg.includes("head office address") ||
    msg.includes("automatic tax") ||
    msg.includes("tax calculation") ||
    ((err as any)?.code === "tax_settings_invalid" ||
      (err as any)?.raw?.code === "tax_settings_invalid")
  );
}

/**
 * Create a Checkout Session with Stripe Tax when available.
 * - STRIPE_AUTOMATIC_TAX=false → never enable tax
 * - STRIPE_AUTOMATIC_TAX=true → require tax (fail if Stripe Tax is not configured)
 * - unset → try tax, then fall back without tax if Stripe Tax head-office/settings are missing
 */
async function createCheckoutSessionWithOptionalTax(
  stripe: Awaited<ReturnType<typeof getUncachableStripeClient>>,
  params: Record<string, unknown>,
) {
  const flag = (process.env.STRIPE_AUTOMATIC_TAX || "").trim().toLowerCase();
  const forceOff = flag === "false" || flag === "0" || flag === "off";
  const forceOn = flag === "true" || flag === "1" || flag === "on";

  const withoutTax = { ...params };
  const withTax = {
    ...params,
    automatic_tax: { enabled: true },
    customer_update: { address: "auto", name: "auto" },
    tax_id_collection: { enabled: true },
  };

  if (forceOff) {
    return stripe.checkout.sessions.create(withoutTax as any);
  }

  try {
    return await stripe.checkout.sessions.create(withTax as any);
  } catch (err) {
    if (forceOn || !isStripeTaxConfigError(err)) throw err;
    console.warn(
      "[billing] Stripe Tax not configured (head office / tax settings). Creating checkout without automatic_tax. Set STRIPE_AUTOMATIC_TAX=false to silence, or configure https://dashboard.stripe.com/test/settings/tax",
    );
    return stripe.checkout.sessions.create(withoutTax as any);
  }
}

async function ensureStripeCustomer(orgId: string, email: string): Promise<string> {
  const [sub] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.organizationId, orgId))
    .limit(1);
  if (sub?.stripeCustomerId) return sub.stripeCustomerId;

  const org = await appStorage.getOrganization(orgId);
  const stripe = await getUncachableStripeClient();
  const customer = await stripe.customers.create({
    email,
    name: org?.name || undefined,
    metadata: { organizationId: orgId },
  });

  await db
    .insert(billingSubscriptions)
    .values({
      organizationId: orgId,
      // Placeholder until checkout.session.completed sets the real plan
      planCode: "pending",
      cycle: "yearly",
      status: "incomplete",
      stripeCustomerId: customer.id,
    })
    .onConflictDoUpdate({
      target: billingSubscriptions.organizationId,
      set: { stripeCustomerId: customer.id, updatedAt: new Date() },
    });

  return customer.id;
}

export async function createCheckoutSession(input: {
  organizationId: string;
  userId: string;
  email: string;
  planCode: string;
  cycle: "monthly" | "yearly";
  successUrl: string;
  cancelUrl: string;
}) {
  requireUrl(input.successUrl, "successUrl");
  requireUrl(input.cancelUrl, "cancelUrl");

  // Existing paid/trial subscribers must change plan in-place — a second Checkout
  // session creates a duplicate Stripe subscription and often fails payment.
  const [existingSub] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.organizationId, input.organizationId))
    .limit(1);
  if (
    existingSub?.stripeSubscriptionId &&
    (existingSub.status === "active" || existingSub.status === "trialing") &&
    existingSub.planCode &&
    existingSub.planCode !== "pending"
  ) {
    const err: any = new Error(
      "You already have an active subscription. Use change-plan to upgrade or downgrade.",
    );
    err.status = 409;
    err.code = "USE_CHANGE_PLAN";
    throw err;
  }

  const [plan] = await db
    .select()
    .from(billingPlans)
    .where(eq(billingPlans.code, input.planCode))
    .limit(1);
  if (!plan || !plan.enabled) {
    const err: any = new Error("Plan not found");
    err.status = 404;
    throw err;
  }
  if (plan.enquireOnly) {
    const err: any = new Error("This plan requires an enquiry");
    err.status = 400;
    throw err;
  }
  if (plan.code === "ai_payg") {
    const err: any = new Error("Use top-up checkout for Pay as you go packs");
    err.status = 400;
    throw err;
  }

  const published = await catalog.getPublishedVersion();
  if (!published) {
    const err: any = new Error("No published price version");
    err.status = 400;
    throw err;
  }

  const priceRows = await db
    .select()
    .from(billingPlanPrices)
    .where(eq(billingPlanPrices.versionId, published.id));
  const price = priceRows.find(
    (r) => r.planCode === input.planCode && r.cycle === input.cycle,
  );

  if (!price || !price.stripeLookupKey) {
    const err: any = new Error("Price or Stripe lookup key missing for plan");
    err.status = 400;
    throw err;
  }

  const stripe = await getUncachableStripeClient();
  const prices = await stripe.prices.list({ lookup_keys: [price.stripeLookupKey], limit: 1 });
  let stripePriceId = prices.data[0]?.id;
  if (!stripePriceId) {
    // Dev fallback: create product+price from catalog so checkout works without manual Stripe setup
    const product = await stripe.products.create({
      name: `${plan.name} (${input.cycle})`,
      metadata: { planCode: plan.code, cycle: input.cycle },
    });
    const created = await stripe.prices.create({
      product: product.id,
      currency: "gbp",
      unit_amount: price.amountMinor,
      recurring: { interval: input.cycle === "yearly" ? "year" : "month" },
      lookup_key: price.stripeLookupKey,
      tax_behavior: "exclusive",
      metadata: { planCode: plan.code, cycle: input.cycle, priceVersionId: published.id },
    });
    stripePriceId = created.id;
  }

  const customerId = await ensureStripeCustomer(input.organizationId, input.email);
  const trialDays = Number(await catalog.getConfigValue("trial_days", "14"));

  const session = await createCheckoutSessionWithOptionalTax(stripe, {
    mode: "subscription",
    customer: customerId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    line_items: [{ price: stripePriceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: trialDays > 0 ? trialDays : undefined,
      metadata: {
        organizationId: input.organizationId,
        planCode: input.planCode,
        cycle: input.cycle,
        priceVersionId: published.id,
        amountMinor: String(price.amountMinor),
        billingV2: "true",
      },
    },
    metadata: {
      organizationId: input.organizationId,
      planCode: input.planCode,
      cycle: input.cycle,
      priceVersionId: published.id,
      billingV2: "true",
      purpose: "plan_subscribe",
    },
  });

  await catalog.writeBillingAudit({
    actorType: "user",
    actorId: input.userId,
    organizationId: input.organizationId,
    action: "checkout.created",
    entityType: "checkout_session",
    entityId: session.id,
    after: { planCode: input.planCode, cycle: input.cycle },
  });

  return { url: session.url, sessionId: session.id };
}

export async function createTopupCheckout(input: {
  organizationId: string;
  userId: string;
  email: string;
  packCode: string;
  successUrl: string;
  cancelUrl: string;
  auto?: boolean;
}) {
  requireUrl(input.successUrl, "successUrl");
  requireUrl(input.cancelUrl, "cancelUrl");

  const [pack] = await db
    .select()
    .from(billingTopupPacks)
    .where(eq(billingTopupPacks.code, input.packCode))
    .limit(1);
  if (!pack || !pack.enabled) {
    const err: any = new Error("Top-up pack not found");
    err.status = 404;
    throw err;
  }

  if (input.auto) {
    const max = Number(await catalog.getConfigValue("auto_topup_max_per_month", "3"));
    const monthKey = new Date().toISOString().slice(0, 7);
    const [settings] = await db
      .select()
      .from(billingOrgSettings)
      .where(eq(billingOrgSettings.organizationId, input.organizationId))
      .limit(1);
    const count =
      settings?.autoTopupMonthKey === monthKey ? settings.autoTopupCountThisMonth || 0 : 0;
    if (count >= max) {
      const err: any = new Error(`Auto top-up limited to ${max} purchases per month`);
      err.status = 400;
      throw err;
    }
  }

  const stripe = await getUncachableStripeClient();
  let stripePriceId: string | undefined;
  if (pack.stripeLookupKey) {
    const prices = await stripe.prices.list({ lookup_keys: [pack.stripeLookupKey], limit: 1 });
    stripePriceId = prices.data[0]?.id;
  }
  if (!stripePriceId) {
    const product = await stripe.products.create({
      name: pack.name,
      metadata: { packCode: pack.code, kind: pack.kind },
    });
    const created = await stripe.prices.create({
      product: product.id,
      currency: "gbp",
      unit_amount: pack.amountMinor,
      lookup_key: pack.stripeLookupKey || undefined,
      tax_behavior: "exclusive",
    });
    stripePriceId = created.id;
  }

  const customerId = await ensureStripeCustomer(input.organizationId, input.email);
  const session = await createCheckoutSessionWithOptionalTax(stripe, {
    mode: "payment",
    customer: customerId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    line_items: [{ price: stripePriceId, quantity: 1 }],
    metadata: {
      organizationId: input.organizationId,
      packCode: pack.code,
      creditKind: pack.kind,
      quantity: String(pack.quantity),
      amountMinor: String(pack.amountMinor),
      auto: input.auto ? "true" : "false",
      billingV2: "true",
      purpose: "topup",
    },
  });

  return { url: session.url, sessionId: session.id };
}

export async function createPortalSession(input: {
  organizationId: string;
  returnUrl: string;
}) {
  requireUrl(input.returnUrl, "returnUrl");
  const [sub] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.organizationId, input.organizationId))
    .limit(1);
  if (!sub?.stripeCustomerId) {
    const err: any = new Error("No Stripe customer for this organization");
    err.status = 400;
    throw err;
  }
  const stripe = await getUncachableStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: input.returnUrl,
  });
  return { url: session.url };
}

/**
 * Finalize a Checkout Session after the user returns from Stripe.
 * Used when webhooks are delayed/missing (common on localhost).
 * Idempotent with applyCheckoutCompletedFromStripe / grantKeys.
 */
export async function confirmCheckoutSessionFromClient(input: {
  organizationId: string;
  sessionId: string;
}) {
  if (!input.sessionId || !/^cs_[a-zA-Z0-9]+/.test(input.sessionId)) {
    const err: any = new Error("Invalid checkout session id");
    err.status = 400;
    throw err;
  }
  const stripe = await getUncachableStripeClient();
  const session = await stripe.checkout.sessions.retrieve(input.sessionId);
  if (!session) {
    const err: any = new Error("Checkout session not found");
    err.status = 404;
    throw err;
  }
  const metaOrg = session.metadata?.organizationId;
  if (metaOrg && metaOrg !== input.organizationId) {
    const err: any = new Error("Checkout session does not belong to this organization");
    err.status = 403;
    throw err;
  }
  if (session.status !== "complete" && session.payment_status === "unpaid" && session.mode !== "subscription") {
    const err: any = new Error("Checkout is not complete yet");
    err.status = 409;
    throw err;
  }
  // Subscriptions with trial can be complete with payment_status "no_payment_required"
  if (session.status && session.status !== "complete") {
    const err: any = new Error(`Checkout status is ${session.status}`);
    err.status = 409;
    throw err;
  }

  const result = await applyCheckoutCompletedFromStripe(session);
  return {
    ...result,
    sessionStatus: session.status,
    paymentStatus: session.payment_status,
    mode: session.mode,
  };
}

export async function applyCheckoutCompletedFromStripe(session: any) {
  if (session?.metadata?.billingV2 !== "true") return { handled: false };
  const orgId = session.metadata.organizationId as string;
  if (!orgId) return { handled: false };

  if (session.metadata.purpose === "topup") {
    const quantity = Number(session.metadata.quantity || 0);
    const kind = (session.metadata.creditKind || "inspection") as "inspection" | "sms";
    const packCode = session.metadata.packCode as string;
    // Idempotent: skip if this session already granted
    const existing = await (await import("../storage")).storage.getCreditBatchesByOrganization(orgId);
    const already = existing.some((b: any) => {
      const meta = (b.metadataJson || {}) as Record<string, unknown>;
      return meta.sessionId === session.id;
    });
    if (!already) {
      await grantPdfCredits({
        organizationId: orgId,
        kind,
        quantity,
        source: "topup",
        expiryMonths: 12,
        metadata: { packCode, sessionId: session.id, grantKey: `topup:${session.id}` },
      });
    }
    if (session.metadata.auto === "true") {
      const monthKey = new Date().toISOString().slice(0, 7);
      const [settings] = await db
        .select()
        .from(billingOrgSettings)
        .where(eq(billingOrgSettings.organizationId, orgId))
        .limit(1);
      const prev =
        settings?.autoTopupMonthKey === monthKey ? settings.autoTopupCountThisMonth || 0 : 0;
      await db
        .insert(billingOrgSettings)
        .values({
          organizationId: orgId,
          autoTopupCountThisMonth: prev + 1,
          autoTopupMonthKey: monthKey,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: billingOrgSettings.organizationId,
          set: {
            autoTopupCountThisMonth: prev + 1,
            autoTopupMonthKey: monthKey,
            updatedAt: new Date(),
          },
        });
    }
    return { handled: true, type: "topup" };
  }

  if (session.metadata.purpose === "plan_subscribe" || session.mode === "subscription") {
    const planCode = session.metadata.planCode as string;
    const cycle = (session.metadata.cycle || "yearly") as "monthly" | "yearly";
    const priceVersionId = session.metadata.priceVersionId as string;
    const amountMinor = Number(session.metadata.amountMinor || 0);
    const trialDays = Number(await catalog.getConfigValue("trial_days", "14"));
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trialDays);

    const stripeSubId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id || null;

    await db
      .insert(billingSubscriptions)
      .values({
        organizationId: orgId,
        planCode,
        cycle,
        priceVersionId,
        status: "trialing",
        trialEnd,
        periodStart: new Date(),
        periodEnd: trialEnd,
        stripeCustomerId:
          typeof session.customer === "string" ? session.customer : session.customer?.id,
        stripeSubscriptionId: stripeSubId,
        amountMinorFrozen: amountMinor,
        currency: "GBP",
      })
      .onConflictDoUpdate({
        target: billingSubscriptions.organizationId,
        set: {
          planCode,
          cycle,
          priceVersionId,
          status: "trialing",
          trialEnd,
          periodStart: new Date(),
          periodEnd: trialEnd,
          stripeSubscriptionId: stripeSubId,
          amountMinorFrozen: amountMinor,
          updatedAt: new Date(),
        },
      });

    // Trial start: ONLY trial-bonus credits (config-driven). Plan inclusion is granted
    // when Stripe bills after trial ends (invoice.paid / subscription → active).
    // AI Inspections plans cannot use Property Internal Modules — force them OFF.
    try {
      const { enforceAiPlanCompanyModuleLocks } = await import("./companyModulePlanLocks");
      await enforceAiPlanCompanyModuleLocks(orgId);
    } catch (lockErr) {
      console.error("[Checkout] AI plan company-module lock failed:", lockErr);
    }

    const inspBonus = Number(await catalog.getConfigValue("trial_inspection_credits", "0"));
    const smsBonus = Number(await catalog.getConfigValue("trial_sms_credits", "0"));
    const existingBatches = await appStorage.getCreditBatchesByOrganization(orgId);
    const hasGrantKey = (key: string) =>
      existingBatches.some((b: any) => {
        const meta = (b.metadataJson || {}) as Record<string, unknown>;
        return meta.grantKey === key;
      });

    if (inspBonus > 0 && !hasGrantKey(`trial:${session.id}:inspection`)) {
      await grantPdfCredits({
        organizationId: orgId,
        kind: "inspection",
        quantity: inspBonus,
        source: "plan_inclusion",
        expiresAt: trialEnd,
        metadata: {
          trial: true,
          sessionId: session.id,
          bonus: true,
          grantKey: `trial:${session.id}:inspection`,
        },
      });
    }
    if (smsBonus > 0 && !hasGrantKey(`trial:${session.id}:sms`)) {
      await grantPdfCredits({
        organizationId: orgId,
        kind: "sms",
        quantity: smsBonus,
        source: "plan_inclusion",
        expiresAt: trialEnd,
        metadata: {
          trial: true,
          sessionId: session.id,
          bonus: true,
          grantKey: `trial:${session.id}:sms`,
        },
      });
    }

    try {
      const { applyPlanModulesToOrg } = await import("./planLimits");
      await applyPlanModulesToOrg(orgId);
    } catch (modErr) {
      console.warn("[billing] applyPlanModulesToOrg failed:", modErr);
    }

    const moneyBackDays = Number(await catalog.getConfigValue("money_back_days", "30"));
    const moneyBackEnabled = (await catalog.getConfigValue("money_back_enabled", "true")) === "true";
    if (moneyBackEnabled) {
      const until = new Date();
      until.setDate(until.getDate() + moneyBackDays);
      await db
        .insert(billingOrgSettings)
        .values({
          organizationId: orgId,
          moneyBackEligibleUntil: until,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: billingOrgSettings.organizationId,
          set: { moneyBackEligibleUntil: until, updatedAt: new Date() },
        });
    }

    return { handled: true, type: "subscribe" };
  }

  return { handled: false };
}
