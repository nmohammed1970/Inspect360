import { createHash } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  billingAddons,
  billingAuditLog,
  billingPlanPrices,
  billingPlans,
  billingPlatformConfig,
  billingPriceVersionItems,
  billingPriceVersions,
  billingTopupPacks,
} from "@shared/billingCatalogSchema";
import {
  SEED_ADDONS,
  SEED_PLAN_MONTHLY_MINOR,
  SEED_PLANS,
  SEED_TOPUPS,
  stripeLookupForPlan,
} from "./catalogSeed";
import { validateCatalog } from "./catalogValidation";

export async function getConfigValue(key: string, fallback = ""): Promise<string> {
  const [row] = await db
    .select()
    .from(billingPlatformConfig)
    .where(eq(billingPlatformConfig.key, key))
    .limit(1);
  return row?.value ?? fallback;
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  await db
    .insert(billingPlatformConfig)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: billingPlatformConfig.key,
      set: { value, updatedAt: new Date() },
    });
}

/** Self-serve Stripe billing is the only customer path (admin credit-request flow removed). */
export async function isSelfServeEnabled(): Promise<boolean> {
  return true;
}

export async function writeBillingAudit(input: {
  actorType: string;
  actorId?: string | null;
  organizationId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}) {
  await db.insert(billingAuditLog).values({
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    organizationId: input.organizationId ?? null,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    beforeJson: (input.before as any) ?? null,
    afterJson: (input.after as any) ?? null,
  });
}

export async function ensureSeedCatalog(actorId?: string | null) {
  const existingPlans = await db.select().from(billingPlans).limit(1);
  if (existingPlans.length === 0) {
    for (const p of SEED_PLANS) {
      await db.insert(billingPlans).values({
        code: p.code,
        tab: p.tab,
        name: p.name,
        description: p.description,
        sortOrder: p.sortOrder,
        popular: p.popular,
        enquireOnly: p.enquireOnly,
        maxProperties: p.maxProperties,
        maxUsers: p.maxUsers,
        monthlyInspections: p.monthlyInspections,
        yearlyInspections: p.yearlyInspections,
        smsPerYear: p.smsPerYear ?? 0,
        allowsPropertyPacks: p.allowsPropertyPacks,
        allowsExtraUsers: p.allowsExtraUsers,
        modulesJson: p.modulesJson as any,
        enabled: true,
      });
    }
  }

  const existingAddons = await db.select().from(billingAddons).limit(1);
  if (existingAddons.length === 0) {
    for (const a of SEED_ADDONS) {
      await db.insert(billingAddons).values({
        code: a.code,
        name: a.name,
        description: a.description,
        kind: a.kind,
        monthlyAmountMinor: a.monthlyAmountMinor,
        yearlyAmountMinor: a.yearlyAmountMinor,
        stripeLookupKeyMonth: a.stripeLookupKeyMonth,
        stripeLookupKeyYear: a.stripeLookupKeyYear,
        maxQuantity: a.maxQuantity ?? null,
        propertiesPerPack: (a as any).propertiesPerPack ?? null,
        inspectionsPerMonth: (a as any).inspectionsPerMonth ?? null,
        inspectionsPerYear: (a as any).inspectionsPerYear ?? null,
        availableOnPlansJson: a.availableOnPlansJson as any,
        includedFreeOnPlansJson: a.includedFreeOnPlansJson as any,
        enabled: true,
      });
    }
  }

  const existingTopups = await db.select().from(billingTopupPacks).limit(1);
  if (existingTopups.length === 0) {
    for (const t of SEED_TOPUPS) {
      await db.insert(billingTopupPacks).values({
        code: t.code,
        kind: t.kind,
        name: t.name,
        quantity: t.quantity,
        amountMinor: t.amountMinor,
        stripeLookupKey: t.stripeLookupKey,
        expiryMonths: 12,
        enabled: true,
        sortOrder: t.sortOrder,
      });
    }
  }

  const published = await db
    .select()
    .from(billingPriceVersions)
    .where(eq(billingPriceVersions.status, "published"))
    .limit(1);

  if (published.length === 0) {
    const [version] = await db
      .insert(billingPriceVersions)
      .values({
        label: "Nov 2026 launch",
        status: "draft",
        createdBy: actorId ?? "system",
        notes: "Seeded from Billing Build Guide v1.1",
      })
      .returning();

    for (const p of SEED_PLANS) {
      if (p.enquireOnly) {
        for (const cycle of ["monthly", "yearly"] as const) {
          await db.insert(billingPlanPrices).values({
            versionId: version!.id,
            planCode: p.code,
            cycle,
            amountMinor: 0,
            currency: "GBP",
            stripeLookupKey: null,
          });
        }
        continue;
      }
      const monthly = SEED_PLAN_MONTHLY_MINOR[p.code] ?? 0;
      const yearly = p.code === "ai_payg" ? monthly : monthly * 10;
      await db.insert(billingPlanPrices).values({
        versionId: version!.id,
        planCode: p.code,
        cycle: "monthly",
        amountMinor: monthly,
        currency: "GBP",
        stripeLookupKey: stripeLookupForPlan(p.code, "monthly"),
        paygUnitMinor: p.code === "ai_payg" ? 450 : null,
      });
      if (p.code !== "ai_payg") {
        await db.insert(billingPlanPrices).values({
          versionId: version!.id,
          planCode: p.code,
          cycle: "yearly",
          amountMinor: yearly,
          currency: "GBP",
          stripeLookupKey: stripeLookupForPlan(p.code, "yearly"),
        });
      }
    }

    await publishPriceVersion(version!.id, actorId ?? "system");
  }

  return { ok: true };
}

export async function listPriceVersions() {
  return db.select().from(billingPriceVersions).orderBy(desc(billingPriceVersions.createdAt));
}

export async function getPublishedVersion() {
  const [row] = await db
    .select()
    .from(billingPriceVersions)
    .where(eq(billingPriceVersions.status, "published"))
    .orderBy(desc(billingPriceVersions.publishedAt))
    .limit(1);
  return row ?? null;
}

export async function getCatalogForVersion(versionId: string) {
  const plans = await db
    .select()
    .from(billingPlans)
    .where(eq(billingPlans.enabled, true))
    .orderBy(billingPlans.sortOrder);
  const prices = await db
    .select()
    .from(billingPlanPrices)
    .where(eq(billingPlanPrices.versionId, versionId));
  const addons = await db.select().from(billingAddons).where(eq(billingAddons.enabled, true));
  const topups = await db
    .select()
    .from(billingTopupPacks)
    .where(eq(billingTopupPacks.enabled, true))
    .orderBy(billingTopupPacks.sortOrder);
  return { plans, prices, addons, topups };
}

export async function getPublishedCatalog(tab?: string, cycle?: string) {
  await ensureSeedCatalog();
  const version = await getPublishedVersion();
  if (!version) return null;
  const catalog = await getCatalogForVersion(version.id);
  const plans = tab ? catalog.plans.filter((p) => p.tab === tab) : catalog.plans;
  const prices = cycle
    ? catalog.prices.filter((p) => p.cycle === cycle || (p.planCode === "ai_payg" && cycle === "monthly"))
    : catalog.prices;
  const enquireUrl = await getConfigValue(
    "enquire_calendly_url",
    "https://calendly.com/-nadeemmohammed-/inspect360-demo",
  );
  const floorMinor = Number(await getConfigValue("inspection_price_floor_minor", "295"));
  return {
    version: { id: version.id, label: version.label, publishedAt: version.publishedAt },
    plans,
    prices,
    addons: catalog.addons,
    topups: catalog.topups,
    enquireUrl,
    floorMinor,
    currency: "GBP",
    pricesExcludeVat: true,
    vatRatePercent: 20,
  };
}

export async function validateVersion(versionId: string) {
  const catalog = await getCatalogForVersion(versionId);
  const floorMinor = Number(await getConfigValue("inspection_price_floor_minor", "295"));
  return validateCatalog({
    plans: catalog.plans.map((p) => ({
      code: p.code,
      tab: p.tab,
      enquireOnly: p.enquireOnly,
      monthlyInspections: p.monthlyInspections,
      yearlyInspections: p.yearlyInspections,
      enabled: p.enabled,
    })),
    prices: catalog.prices.map((p) => ({
      planCode: p.planCode,
      cycle: p.cycle as "monthly" | "yearly",
      amountMinor: p.amountMinor,
    })),
    topups: catalog.topups.map((t) => ({
      code: t.code,
      kind: t.kind,
      quantity: t.quantity,
      amountMinor: t.amountMinor,
      enabled: t.enabled,
    })),
    floorMinor,
  });
}

export async function publishPriceVersion(versionId: string, actorId: string) {
  const validation = await validateVersion(versionId);
  if (!validation.ok) {
    const err: any = new Error("Catalog validation failed");
    err.status = 400;
    err.issues = validation.issues;
    throw err;
  }

  const catalog = await getCatalogForVersion(versionId);
  const checksum = createHash("sha256")
    .update(JSON.stringify({ prices: catalog.prices, addons: catalog.addons, topups: catalog.topups }))
    .digest("hex");

  await db.delete(billingPriceVersionItems).where(eq(billingPriceVersionItems.versionId, versionId));
  for (const p of catalog.prices) {
    await db.insert(billingPriceVersionItems).values({
      versionId,
      itemType: "plan_price",
      itemCode: `${p.planCode}:${p.cycle}`,
      payloadJson: p as any,
    });
  }
  for (const a of catalog.addons) {
    await db.insert(billingPriceVersionItems).values({
      versionId,
      itemType: "addon",
      itemCode: a.code,
      payloadJson: a as any,
    });
  }
  for (const t of catalog.topups) {
    await db.insert(billingPriceVersionItems).values({
      versionId,
      itemType: "topup",
      itemCode: t.code,
      payloadJson: t as any,
    });
  }

  // Archive previous published
  await db
    .update(billingPriceVersions)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(billingPriceVersions.status, "published"));

  const [updated] = await db
    .update(billingPriceVersions)
    .set({
      status: "published",
      publishedAt: new Date(),
      publishedBy: actorId,
      checksum,
      updatedAt: new Date(),
    })
    .where(eq(billingPriceVersions.id, versionId))
    .returning();

  await writeBillingAudit({
    actorType: "admin",
    actorId,
    action: "price_version.published",
    entityType: "billing_price_version",
    entityId: versionId,
    after: { checksum, label: updated?.label },
  });

  return { version: updated, validation };
}

export async function createDraftFromPublished(label: string, actorId: string) {
  const published = await getPublishedVersion();
  if (!published) {
    await ensureSeedCatalog(actorId);
    return getPublishedVersion();
  }
  const [draft] = await db
    .insert(billingPriceVersions)
    .values({
      label,
      status: "draft",
      createdBy: actorId,
      notes: `Cloned from ${published.label}`,
    })
    .returning();

  const prices = await db
    .select()
    .from(billingPlanPrices)
    .where(eq(billingPlanPrices.versionId, published.id));
  for (const p of prices) {
    await db.insert(billingPlanPrices).values({
      versionId: draft!.id,
      planCode: p.planCode,
      cycle: p.cycle,
      amountMinor: p.amountMinor,
      currency: p.currency,
      stripeLookupKey: p.stripeLookupKey,
      paygUnitMinor: p.paygUnitMinor,
    });
  }
  return draft;
}

export async function updatePlanPrice(input: {
  versionId: string;
  planCode: string;
  cycle: "monthly" | "yearly";
  amountMinor: number;
  actorId: string;
}) {
  const [version] = await db
    .select()
    .from(billingPriceVersions)
    .where(eq(billingPriceVersions.id, input.versionId))
    .limit(1);
  if (!version || version.status !== "draft") {
    const err: any = new Error("Only draft versions can be edited");
    err.status = 400;
    throw err;
  }

  const [existing] = await db
    .select()
    .from(billingPlanPrices)
    .where(
      and(
        eq(billingPlanPrices.versionId, input.versionId),
        eq(billingPlanPrices.planCode, input.planCode),
        eq(billingPlanPrices.cycle, input.cycle),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(billingPlanPrices)
      .set({ amountMinor: input.amountMinor })
      .where(eq(billingPlanPrices.id, existing.id))
      .returning();
    await writeBillingAudit({
      actorType: "admin",
      actorId: input.actorId,
      action: "plan_price.updated",
      entityType: "billing_plan_price",
      entityId: existing.id,
      before: existing,
      after: updated,
    });
    return updated;
  }

  const [created] = await db
    .insert(billingPlanPrices)
    .values({
      versionId: input.versionId,
      planCode: input.planCode,
      cycle: input.cycle,
      amountMinor: input.amountMinor,
      currency: "GBP",
      stripeLookupKey: stripeLookupForPlan(input.planCode, input.cycle),
    })
    .returning();
  return created;
}

export async function listPlansAdmin() {
  return db.select().from(billingPlans).orderBy(billingPlans.tab, billingPlans.sortOrder);
}

export async function updatePlanAdmin(
  code: string,
  patch: Partial<{
    name: string;
    description: string | null;
    enabled: boolean;
    popular: boolean;
    maxProperties: number | null;
    maxUsers: number | null;
    monthlyInspections: number | null;
    yearlyInspections: number | null;
    smsPerYear: number | null;
    allowsPropertyPacks: boolean;
    allowsExtraUsers: boolean;
    modulesJson: Record<string, boolean | "addon">;
  }>,
  actorId: string,
) {
  const [before] = await db.select().from(billingPlans).where(eq(billingPlans.code, code)).limit(1);
  if (!before) return null;
  const [after] = await db
    .update(billingPlans)
    .set({ ...patch, updatedAt: new Date() } as any)
    .where(eq(billingPlans.code, code))
    .returning();
  await writeBillingAudit({
    actorType: "admin",
    actorId,
    action: "plan.updated",
    entityType: "billing_plan",
    entityId: before.id,
    before,
    after,
  });
  return after;
}
