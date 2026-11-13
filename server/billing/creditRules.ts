import { storage } from "../storage";
import { SubscriptionService } from "../subscriptionService";
import { billingNowUtc } from "@shared/billingClock";
import * as catalog from "./catalogService";

const subscriptionService = new SubscriptionService();

export type CreditKind = "inspection" | "sms";

function batchKind(batch: { metadataJson?: any; creditKind?: string | null }): CreditKind {
  if (batch.creditKind === "sms" || batch.creditKind === "inspection") return batch.creditKind;
  const k = batch.metadataJson?.creditKind || batch.metadataJson?.kind;
  return k === "sms" ? "sms" : "inspection";
}

export async function photosPerCredit(): Promise<number> {
  const fromConfig = Number(await catalog.getConfigValue("photos_per_credit", "500"));
  return Number.isFinite(fromConfig) && fromConfig > 0 ? fromConfig : 500;
}

export function creditsForPhotos(photoCount: number, perCredit: number): number {
  const n = Math.max(0, Math.floor(photoCount || 0));
  if (n <= 0) return 1;
  return Math.max(1, Math.ceil(n / perCredit));
}

/** SMS segments: first 160 chars = 1; longer messages use 153-char segments. */
export function smsCreditsForMessage(body: string): number {
  const len = Array.from(body || "").length;
  if (len <= 0) return 1;
  if (len <= 160) return 1;
  return Math.ceil(len / 153);
}

/** Plan-included inspection + SMS for a billing period (idempotent via grantKey). */
export async function grantPlanIncludedCredits(input: {
  organizationId: string;
  planCode: string;
  cycle: "monthly" | "yearly";
  expiresAt?: Date | null;
  grantKey: string;
}): Promise<{ inspection: number; sms: number; skipped: boolean }> {
  const batches = await storage.getCreditBatchesByOrganization(input.organizationId);
  const already = batches.some((b: any) => {
    const meta = (b.metadataJson || b.metadata || b.meta || {}) as Record<string, unknown>;
    return meta.grantKey === input.grantKey;
  });
  if (already) return { inspection: 0, sms: 0, skipped: true };

  const { db } = await import("../db");
  const { billingPlans } = await import("@shared/billingCatalogSchema");
  const { eq } = await import("drizzle-orm");
  const [plan] = await db
    .select()
    .from(billingPlans)
    .where(eq(billingPlans.code, input.planCode))
    .limit(1);
  if (!plan) return { inspection: 0, sms: 0, skipped: true };

  const inspQty =
    input.cycle === "yearly"
      ? plan.yearlyInspections || 0
      : plan.monthlyInspections || 0;
  const smsQty =
    input.cycle === "yearly"
      ? plan.smsPerYear || 0
      : (plan.smsPerYear || 0) > 0
        ? Math.max(1, Math.floor((plan.smsPerYear || 0) / 12))
        : 0;

  if (inspQty > 0) {
    await grantPdfCredits({
      organizationId: input.organizationId,
      kind: "inspection",
      quantity: inspQty,
      source: "plan_inclusion",
      expiresAt: input.expiresAt,
      metadata: {
        grantKey: input.grantKey,
        planCode: input.planCode,
        cycle: input.cycle,
        planInclusion: true,
      },
    });
  }
  if (smsQty > 0) {
    await grantPdfCredits({
      organizationId: input.organizationId,
      kind: "sms",
      quantity: smsQty,
      source: "plan_inclusion",
      expiresAt: input.expiresAt,
      metadata: {
        grantKey: input.grantKey,
        planCode: input.planCode,
        cycle: input.cycle,
        planInclusion: true,
        creditKind: "sms",
      },
    });
  }
  return { inspection: inspQty, sms: smsQty, skipped: false };
}

export async function grantPdfCredits(input: {
  organizationId: string;
  kind: CreditKind;
  quantity: number;
  source: "plan_inclusion" | "topup" | "admin_grant" | "addon_pack";
  expiresAt?: Date | null;
  expiryMonths?: number;
  metadata?: Record<string, unknown>;
}) {
  let expiresAt = input.expiresAt ?? null;
  if (!expiresAt && input.expiryMonths) {
    expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + input.expiryMonths);
  }
  const batch = await subscriptionService.grantCredits(
    input.organizationId,
    input.quantity,
    input.source,
    expiresAt ?? undefined,
    {
      ...(input.metadata as any),
      creditKind: input.kind,
      kind: input.kind,
    },
  );
  // Best-effort set credit_kind column if migration applied
  try {
    const { db } = await import("../db");
    await db.execute(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (await import("drizzle-orm")).sql`UPDATE credit_batches SET credit_kind = ${input.kind} WHERE id = ${batch.id}`,
    );
  } catch {
    /* column may not exist yet */
  }
  return batch;
}

export async function getBalances(organizationId: string) {
  const batches = await storage.getCreditBatchesByOrganization(organizationId);
  const now = billingNowUtc().getTime();
  let inspection = 0;
  let sms = 0;
  for (const b of batches) {
    if ((b.remainingQuantity || 0) <= 0) continue;
    if (b.expiresAt && new Date(b.expiresAt).getTime() <= now) continue;
    const kind = batchKind(b as any);
    if (kind === "sms") sms += b.remainingQuantity;
    else inspection += b.remainingQuantity;
  }
  return { inspection, sms, total: inspection + sms };
}

export async function getCreditDetail(organizationId: string) {
  const batches = await storage.getCreditBatchesByOrganization(organizationId);
  const now = billingNowUtc().getTime();
  const open = batches
    .filter((b) => (b.remainingQuantity || 0) > 0)
    .filter((b) => !b.expiresAt || new Date(b.expiresAt).getTime() > now)
    .map((b) => ({
      id: b.id,
      kind: batchKind(b as any),
      remaining: b.remainingQuantity,
      granted: b.grantedQuantity,
      source: b.grantSource,
      expiresAt: b.expiresAt,
      grantedAt: b.grantedAt,
    }))
    .sort((a, b) => {
      const ae = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
      const be = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ae - be;
    });
  const balances = await getBalances(organizationId);
  return { balances, grants: open };
}

/**
 * Consume credits FIFO by earliest expiry among the requested kind.
 * Falls back to existing subscriptionService for inspection-only legacy path when kind=inspection
 * and no kind filtering needed — but we filter batches first for SMS safety.
 */
export async function consumeKindCredits(input: {
  organizationId: string;
  kind: CreditKind;
  quantity: number;
  linkedEntityType: string;
  linkedEntityId: string;
  notes?: string;
}): Promise<void> {
  if (input.quantity <= 0) throw new Error("Quantity must be positive");
  const balances = await getBalances(input.organizationId);
  const available = input.kind === "sms" ? balances.sms : balances.inspection;
  if (available < input.quantity) {
    throw new Error(
      `Insufficient ${input.kind} credits: need ${input.quantity}, have ${available}`,
    );
  }

  // For inspection, reuse battle-tested consume path (includes signup bonuses etc.)
  // SMS-tagged batches are stored with metadata; consumeCredits walks all batches —
  // so for SMS we manually decrement SMS batches only.
  if (input.kind === "inspection") {
    // Prefer batches that are inspection-kind; legacy batches without kind count as inspection.
    await subscriptionService.consumeCredits(
      input.organizationId,
      input.quantity,
      input.linkedEntityType,
      input.linkedEntityId,
      input.notes || `Consumed ${input.quantity} inspection credits`,
    );
    return;
  }

  const batches = await storage.getCreditBatchesByOrganization(input.organizationId);
  const now = billingNowUtc().getTime();
  const smsBatches = batches
    .filter((b) => batchKind(b as any) === "sms")
    .filter((b) => (b.remainingQuantity || 0) > 0)
    .filter((b) => !b.expiresAt || new Date(b.expiresAt).getTime() > now)
    .sort((a, b) => {
      const ae = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
      const be = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ae - be;
    });

  let remaining = input.quantity;
  for (const batch of smsBatches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.remainingQuantity);
    await storage.updateCreditBatch(batch.id, {
      remainingQuantity: batch.remainingQuantity - take,
    });
    await storage.createCreditLedgerEntry({
      organizationId: input.organizationId,
      source: "consumption",
      quantity: -take,
      batchId: batch.id,
      notes: input.notes || `SMS credits consumed`,
      linkedEntityType: input.linkedEntityType,
      linkedEntityId: input.linkedEntityId,
    });
    remaining -= take;
  }
  if (remaining > 0) {
    throw new Error(`Insufficient SMS credits after lock: short ${remaining}`);
  }
}

export async function refundCredits(input: {
  organizationId: string;
  kind: CreditKind;
  quantity: number;
  linkedEntityType: string;
  linkedEntityId: string;
  notes?: string;
}) {
  return grantPdfCredits({
    organizationId: input.organizationId,
    kind: input.kind,
    quantity: input.quantity,
    source: "admin_grant",
    metadata: {
      creditKind: input.kind,
      refundFor: input.linkedEntityId,
      linkedEntityType: input.linkedEntityType,
      adminNotes: input.notes || "Automatic refund",
    },
  });
}

export async function maybeAutoTopup(organizationId: string): Promise<{
  triggered: boolean;
  charged?: boolean;
  reason?: string;
  sessionId?: string;
}> {
  const balances = await getBalances(organizationId);
  const absolute = Number(await catalog.getConfigValue("low_balance_absolute", "5"));
  if (balances.inspection > absolute) return { triggered: false, reason: "balance_ok" };

  const { db } = await import("../db");
  const { billingOrgSettings, billingSubscriptions, billingTopupPacks } = await import(
    "@shared/billingCatalogSchema"
  );
  const { eq } = await import("drizzle-orm");
  const [settings] = await db
    .select()
    .from(billingOrgSettings)
    .where(eq(billingOrgSettings.organizationId, organizationId))
    .limit(1);
  if (!settings?.autoTopupEnabled || !settings.autoTopupPackCode) {
    return { triggered: false, reason: "disabled" };
  }

  const max = Number(await catalog.getConfigValue("auto_topup_max_per_month", "3"));
  const monthKey = new Date().toISOString().slice(0, 7);
  const count =
    settings.autoTopupMonthKey === monthKey ? settings.autoTopupCountThisMonth || 0 : 0;
  if (count >= max) return { triggered: true, charged: false, reason: "monthly_cap" };

  const [pack] = await db
    .select()
    .from(billingTopupPacks)
    .where(eq(billingTopupPacks.code, settings.autoTopupPackCode))
    .limit(1);
  if (!pack || pack.kind !== "inspection") {
    return { triggered: true, charged: false, reason: "invalid_pack" };
  }

  const [sub] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.organizationId, organizationId))
    .limit(1);
  if (!sub?.stripeCustomerId) {
    return { triggered: true, charged: false, reason: "no_customer" };
  }

  try {
    const { getUncachableStripeClient } = await import("../stripeClient");
    const stripe = await getUncachableStripeClient();
    let priceId: string | undefined;
    if (pack.stripeLookupKey) {
      const prices = await stripe.prices.list({ lookup_keys: [pack.stripeLookupKey], limit: 1 });
      priceId = prices.data[0]?.id;
    }
    if (!priceId) {
      const product = await stripe.products.create({
        name: pack.name,
        metadata: { packCode: pack.code, auto: "true" },
      });
      const created = await stripe.prices.create({
        product: product.id,
        currency: "gbp",
        unit_amount: pack.amountMinor,
        lookup_key: pack.stripeLookupKey || undefined,
        tax_behavior: "exclusive",
      });
      priceId = created.id;
    }

    // Off-session invoice charge against default payment method
    const invoice = await stripe.invoices.create({
      customer: sub.stripeCustomerId,
      auto_advance: true,
      collection_method: "charge_automatically",
      metadata: {
        organizationId,
        packCode: pack.code,
        creditKind: pack.kind,
        quantity: String(pack.quantity),
        billingV2: "true",
        purpose: "topup",
        auto: "true",
      },
    });
    await stripe.invoiceItems.create({
      customer: sub.stripeCustomerId,
      invoice: invoice.id,
      price: priceId,
      quantity: 1,
    });
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    if (finalized.status === "open") {
      await stripe.invoices.pay(finalized.id);
    }

    await grantPdfCredits({
      organizationId,
      kind: pack.kind as CreditKind,
      quantity: pack.quantity,
      source: "topup",
      expiryMonths: pack.expiryMonths || 12,
      metadata: { packCode: pack.code, auto: true, invoiceId: finalized.id },
    });

    await db
      .insert(billingOrgSettings)
      .values({
        organizationId,
        autoTopupCountThisMonth: count + 1,
        autoTopupMonthKey: monthKey,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: billingOrgSettings.organizationId,
        set: {
          autoTopupCountThisMonth: count + 1,
          autoTopupMonthKey: monthKey,
          updatedAt: new Date(),
        },
      });

    return { triggered: true, charged: true, sessionId: finalized.id };
  } catch (e: any) {
    console.error("[billing] auto top-up charge failed:", e?.message || e);
    return { triggered: true, charged: false, reason: e?.message || "charge_failed" };
  }
}

/** Notify org owners when inspection credits are at/below absolute threshold (default 5). */
export async function notifyLowBalanceIfNeeded(organizationId: string): Promise<boolean> {
  const balances = await getBalances(organizationId);
  const absolute = Number(await catalog.getConfigValue("low_balance_absolute", "5"));
  if (balances.inspection > absolute) return false;

  console.log(
    `[billing] low balance org=${organizationId} inspection=${balances.inspection} (threshold ${absolute})`,
  );
  try {
    await maybeAutoTopup(organizationId);
  } catch (e: any) {
    console.warn("[billing] auto top-up after low balance failed:", e?.message || e);
  }
  return true;
}
