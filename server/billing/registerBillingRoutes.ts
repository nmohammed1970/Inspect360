import type { Express, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { isAuthenticated, isAdminAuthenticated } from "../auth";
import { db } from "../db";
import {
  billingAnalyticsEvents,
  billingOrgSettings,
  billingPlans,
  billingSubscriptions,
  billingTopupPacks,
} from "@shared/billingCatalogSchema";
import * as catalog from "./catalogService";
import * as subscriptionLifecycle from "./subscriptionLifecycle";
import * as creditRules from "./creditRules";
import * as planLimits from "./planLimits";
import type { CompanyModuleAccess, CompanyModuleKey } from "@shared/companyModules";
import { applyPaymentFailureReadOnly } from "./stripeWebhookService";
import { blockIfBillingReadOnly } from "./readOnlyGuard";

function adminId(req: any): string {
  return req.session?.adminUser?.id || req.user?.id || "admin";
}

export function registerBillingCatalogRoutes(app: Express) {
  // -------- Public / customer catalog --------
  app.get("/api/billing/catalog", async (req, res) => {
    try {
      const tab = typeof req.query.tab === "string" ? req.query.tab : undefined;
      const cycle = typeof req.query.cycle === "string" ? req.query.cycle : undefined;
      const data = await catalog.getPublishedCatalog(tab, cycle);
      if (!data) return res.status(404).json({ message: "No published catalog" });
      res.json(data);
    } catch (error) {
      console.error("[billing] catalog get failed:", error);
      res.status(500).json({ message: "Failed to load catalog" });
    }
  });

  app.get("/api/billing/self-serve-status", async (_req, res) => {
    try {
      res.json({
        enabled: await catalog.isSelfServeEnabled(),
        photosPerCredit: Number(await catalog.getConfigValue("photos_per_credit", "500")),
        enquireCalendlyUrl: await catalog.getConfigValue(
          "enquire_calendly_url",
          "https://calendly.com/-nadeemmohammed-/inspect360-demo",
        ),
        moneyBackEnabled: (await catalog.getConfigValue("money_back_enabled", "true")) === "true",
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to load status" });
    }
  });

  app.post("/api/billing/analytics", async (req: any, res) => {
    try {
      const eventName = typeof req.body?.eventName === "string" ? req.body.eventName : "";
      if (!eventName) return res.status(400).json({ message: "eventName required" });
      await db.insert(billingAnalyticsEvents).values({
        organizationId: req.user?.organizationId ?? null,
        userId: req.user?.id ?? null,
        eventName,
        metadataJson: req.body?.metadata ?? null,
      });
      res.status(201).json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to record event" });
    }
  });

  app.get("/api/billing/v2/subscription", isAuthenticated, async (req: any, res) => {
    try {
      const orgId = req.user.organizationId as string;
      let companyModuleAccess: Record<CompanyModuleKey, CompanyModuleAccess> | null = null;
      try {
        const {
          enforceAiPlanCompanyModuleLocks,
          enforceDisallowedCompanyModules,
          getCompanyModulePlanContext,
        } = await import("./companyModulePlanLocks");
        await enforceAiPlanCompanyModuleLocks(orgId);
        await enforceDisallowedCompanyModules(orgId);
        companyModuleAccess = (await getCompanyModulePlanContext(orgId)).companyModuleAccess;
      } catch (lockErr) {
        console.error("[billing/v2/subscription] plan module lock failed:", lockErr);
      }
      let [sub] = await db
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.organizationId, orgId))
        .limit(1);

      // Self-heal stuck pending upgrades (e.g. trial £0 invoice / missed webhook).
      if (sub?.pendingPlanCode) {
        try {
          const healed = await planLimits.reconcilePendingUpgrade(orgId);
          if (healed) {
            const [refreshed] = await db
              .select()
              .from(billingSubscriptions)
              .where(eq(billingSubscriptions.organizationId, orgId))
              .limit(1);
            sub = refreshed;
          }
        } catch (e) {
          console.warn("[billing] pending upgrade reconcile skipped:", e);
        }
      }

      // Trial = bonus only. Never grant plan SMS while trialing/incomplete.
      // Self-heal orgs that already received the old mistaken backfill during trial.
      if (sub?.status === "trialing" && sub.stripeSubscriptionId) {
        try {
          await creditRules.expireMistakenTrialPlanSmsBackfill(
            orgId,
            sub.stripeSubscriptionId,
          );
        } catch (e) {
          console.warn("[billing] trial SMS backfill cleanup skipped:", e);
        }
      }

      // Paid-only repair: if checkout/webhook never granted plan SMS after activation,
      // grant once (idempotent). Does not re-fill when the customer simply spent SMS.
      if (
        sub &&
        sub.status === "active" &&
        sub.planCode &&
        sub.planCode !== "pending" &&
        sub.stripeSubscriptionId
      ) {
        try {
          const alreadyHasPlanSms = await creditRules.hasPlanSmsGrantForSubscription(
            orgId,
            sub.stripeSubscriptionId,
          );
          if (!alreadyHasPlanSms) {
            const current = await creditRules.getBalances(orgId);
            if (current.sms === 0) {
              const [plan] = await db
                .select()
                .from(billingPlans)
                .where(eq(billingPlans.code, sub.planCode))
                .limit(1);
              const smsQty =
                sub.cycle === "yearly"
                  ? plan?.smsPerYear || 0
                  : (plan?.smsPerYear || 0) > 0
                    ? Math.max(1, Math.floor((plan?.smsPerYear || 0) / 12))
                    : 0;
              if (smsQty > 0) {
                await creditRules.grantPdfCredits({
                  organizationId: orgId,
                  kind: "sms",
                  quantity: smsQty,
                  source: "plan_inclusion",
                  expiresAt: sub.periodEnd || null,
                  metadata: {
                    grantKey: creditRules.planSmsBackfillGrantKey(sub.stripeSubscriptionId),
                    planCode: sub.planCode,
                    cycle: sub.cycle,
                    planInclusion: true,
                    backfill: true,
                  },
                });
              }
            }
          }
        } catch (e) {
          console.warn("[billing] SMS backfill skipped:", e);
        }
      }

      const [settings] = await db
        .select()
        .from(billingOrgSettings)
        .where(eq(billingOrgSettings.organizationId, orgId))
        .limit(1);
      const balances = await creditRules.getBalances(orgId);
      res.json({
        subscription: sub ?? null,
        settings: settings ?? null,
        balances,
        selfServeEnabled: await catalog.isSelfServeEnabled(),
        companyModuleAccess,
      });
    } catch (error) {
      console.error("[billing] v2 subscription failed:", error);
      res.status(500).json({ message: "Failed to load subscription" });
    }
  });

  app.post("/api/billing/v2/checkout", isAuthenticated, async (req: any, res) => {
    try {
      const result = await subscriptionLifecycle.createCheckoutSession({
        organizationId: req.user.organizationId,
        userId: req.user.id,
        email: req.user.email,
        planCode: String(req.body?.planCode || ""),
        cycle: req.body?.cycle === "monthly" ? "monthly" : "yearly",
        successUrl: String(req.body?.successUrl || ""),
        cancelUrl: String(req.body?.cancelUrl || ""),
      });
      res.json(result);
    } catch (error: any) {
      console.error("[billing] checkout failed:", error);
      res.status(error.status || 500).json({ message: error.message || "Checkout failed" });
    }
  });

  /** Finalize checkout after Stripe redirect (does not rely on webhooks). */
  app.post("/api/billing/v2/checkout/confirm", isAuthenticated, async (req: any, res) => {
    try {
      const sessionId = String(req.body?.sessionId || "").trim();
      if (!sessionId) return res.status(400).json({ message: "sessionId required" });
      const result = await subscriptionLifecycle.confirmCheckoutSessionFromClient({
        organizationId: req.user.organizationId,
        sessionId,
      });
      const balances = await creditRules.getBalances(req.user.organizationId);
      const [sub] = await db
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.organizationId, req.user.organizationId))
        .limit(1);
      res.json({ ...result, subscription: sub ?? null, balances });
    } catch (error: any) {
      console.error("[billing] checkout confirm failed:", error);
      res.status(error.status || 500).json({ message: error.message || "Confirm failed" });
    }
  });

  app.post("/api/billing/v2/topup-checkout", isAuthenticated, blockIfBillingReadOnly, async (req: any, res) => {
    try {
      const result = await subscriptionLifecycle.createTopupCheckout({
        organizationId: req.user.organizationId,
        userId: req.user.id,
        email: req.user.email,
        packCode: String(req.body?.packCode || ""),
        successUrl: String(req.body?.successUrl || ""),
        cancelUrl: String(req.body?.cancelUrl || ""),
        auto: Boolean(req.body?.auto),
      });
      res.json(result);
    } catch (error: any) {
      console.error("[billing] topup checkout failed:", error);
      res.status(error.status || 500).json({ message: error.message || "Top-up checkout failed" });
    }
  });

  app.post("/api/billing/v2/portal", isAuthenticated, async (req: any, res) => {
    try {
      const result = await subscriptionLifecycle.createPortalSession({
        organizationId: req.user.organizationId,
        returnUrl: String(req.body?.returnUrl || ""),
      });
      res.json(result);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Portal failed" });
    }
  });

  app.get("/api/billing/v2/credits", isAuthenticated, async (req: any, res) => {
    try {
      const orgId = req.user.organizationId as string;
      const detail = await creditRules.getCreditDetail(orgId);
      res.json(detail);
    } catch (error) {
      res.status(500).json({ message: "Failed to load credits" });
    }
  });

  app.get("/api/billing/v2/invoices", isAuthenticated, async (req: any, res) => {
    try {
      const orgId = req.user.organizationId as string;
      const [sub] = await db
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.organizationId, orgId))
        .limit(1);
      if (!sub?.stripeCustomerId) return res.json({ invoices: [] });
      const { getUncachableStripeClient } = await import("../stripeClient");
      const stripe = await getUncachableStripeClient();
      const list = await stripe.invoices.list({
        customer: sub.stripeCustomerId,
        limit: 24,
      });
      res.json({
        invoices: list.data.map((inv) => ({
          id: inv.id,
          number: inv.number,
          status: inv.status,
          amountDue: inv.amount_due,
          amountPaid: inv.amount_paid,
          currency: inv.currency,
          created: inv.created,
          hostedInvoiceUrl: inv.hosted_invoice_url,
          invoicePdf: inv.invoice_pdf,
        })),
      });
    } catch (error: any) {
      console.error("[billing] invoices failed:", error);
      res.status(500).json({ message: error.message || "Failed to load invoices" });
    }
  });

  app.get("/api/billing/v2/topup-packs", async (_req, res) => {
    try {
      const packs = await db.select().from(billingTopupPacks);
      res.json({
        packs: packs.filter((p) => p.enabled).sort((a, b) => a.sortOrder - b.sortOrder),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to load top-up packs" });
    }
  });

  app.post("/api/billing/v2/auto-topup/run", isAuthenticated, async (req: any, res) => {
    try {
      const result = await creditRules.maybeAutoTopup(req.user.organizationId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Auto top-up failed" });
    }
  });

  app.put("/api/billing/v2/auto-topup", isAuthenticated, async (req: any, res) => {
    try {
      const orgId = req.user.organizationId as string;
      const enabled = Boolean(req.body?.enabled);
      const packCode =
        typeof req.body?.packCode === "string" && req.body.packCode ? req.body.packCode : null;
      if (enabled && packCode) {
        const [pack] = await db
          .select()
          .from(billingTopupPacks)
          .where(eq(billingTopupPacks.code, packCode))
          .limit(1);
        if (!pack || pack.kind !== "inspection") {
          return res.status(400).json({ message: "Invalid auto top-up pack" });
        }
      }
      await db
        .insert(billingOrgSettings)
        .values({
          organizationId: orgId,
          autoTopupEnabled: enabled,
          autoTopupPackCode: packCode,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: billingOrgSettings.organizationId,
          set: {
            autoTopupEnabled: enabled,
            autoTopupPackCode: packCode,
            updatedAt: new Date(),
          },
        });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to update auto top-up" });
    }
  });

  // -------- Admin catalog --------
  app.post("/api/admin/billing/ensure-seed", isAdminAuthenticated, async (req: any, res) => {
    try {
      await catalog.ensureSeedCatalog(adminId(req));
      res.json({ ok: true });
    } catch (error) {
      console.error("[billing] seed failed:", error);
      res.status(500).json({ message: "Seed failed" });
    }
  });

  app.get("/api/admin/billing/catalog", isAdminAuthenticated, async (req, res) => {
    try {
      await catalog.ensureSeedCatalog();
      const versions = await catalog.listPriceVersions();
      const published = await catalog.getPublishedVersion();
      const plans = await catalog.listPlansAdmin();
      const versionId =
        typeof req.query.versionId === "string" && req.query.versionId
          ? req.query.versionId
          : published?.id;
      const catalogData = versionId ? await catalog.getCatalogForVersion(versionId) : null;
      const configKeys = [
        "self_serve_enabled",
        "trial_days",
        "trial_inspection_credits",
        "trial_sms_credits",
        "photos_per_credit",
        "inspection_price_floor_minor",
        "property_pack_ceiling",
        "max_properties_with_packs",
        "payment_failure_readonly_days",
        "money_back_days",
        "money_back_enabled",
        "auto_topup_max_per_month",
        "enquire_calendly_url",
      ];
      const config: Record<string, string> = {};
      for (const k of configKeys) config[k] = await catalog.getConfigValue(k, "");
      res.json({ versions, published, plans, catalog: catalogData, config, selectedVersionId: versionId });
    } catch (error) {
      console.error("[billing] admin catalog failed:", error);
      res.status(500).json({ message: "Failed to load admin catalog" });
    }
  });

  app.get("/api/admin/billing/versions/:id/validate", isAdminAuthenticated, async (req, res) => {
    try {
      const result = await catalog.validateVersion(req.params.id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Validation failed" });
    }
  });

  app.post("/api/admin/billing/versions/:id/publish", isAdminAuthenticated, async (req: any, res) => {
    try {
      const result = await catalog.publishPriceVersion(req.params.id, adminId(req));
      res.json(result);
    } catch (error: any) {
      res.status(error.status || 500).json({
        message: error.message || "Publish failed",
        issues: error.issues,
      });
    }
  });

  app.post("/api/admin/billing/versions/draft", isAdminAuthenticated, async (req: any, res) => {
    try {
      const label = String(req.body?.label || `Draft ${new Date().toISOString().slice(0, 10)}`);
      const draft = await catalog.createDraftFromPublished(label, adminId(req));
      res.status(201).json(draft);
    } catch (error) {
      res.status(500).json({ message: "Failed to create draft" });
    }
  });

  app.patch("/api/admin/billing/versions/:id/prices", isAdminAuthenticated, async (req: any, res) => {
    try {
      const updated = await catalog.updatePlanPrice({
        versionId: req.params.id,
        planCode: String(req.body?.planCode || ""),
        cycle: req.body?.cycle === "yearly" ? "yearly" : "monthly",
        amountMinor: Number(req.body?.amountMinor),
        actorId: adminId(req),
      });
      res.json(updated);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Update failed" });
    }
  });

  app.patch("/api/admin/billing/plans/:code", isAdminAuthenticated, async (req: any, res) => {
    try {
      const updated = await catalog.updatePlanAdmin(req.params.code, req.body || {}, adminId(req));
      if (!updated) return res.status(404).json({ message: "Plan not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update plan" });
    }
  });

  app.put("/api/admin/billing/config", isAdminAuthenticated, async (req: any, res) => {
    try {
      const entries = req.body?.config && typeof req.body.config === "object" ? req.body.config : {};
      for (const [k, v] of Object.entries(entries)) {
        await catalog.setConfigValue(String(k), String(v));
      }
      await catalog.writeBillingAudit({
        actorType: "admin",
        actorId: adminId(req),
        action: "config.updated",
        after: entries,
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to update config" });
    }
  });

  app.get("/api/admin/billing/subscriptions", isAdminAuthenticated, async (_req, res) => {
    try {
      const rows = await db.select().from(billingSubscriptions);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: "Failed to list subscriptions" });
    }
  });

  app.post("/api/admin/billing/apply-readonly", isAdminAuthenticated, async (_req, res) => {
    try {
      const n = await applyPaymentFailureReadOnly();
      res.json({ updated: n });
    } catch (error) {
      res.status(500).json({ message: "Failed to apply read-only" });
    }
  });

  app.get("/api/admin/billing/health", isAdminAuthenticated, async (_req, res) => {
    try {
      const { summarizeBillingV2Health } = await import("./reconciliationHooks");
      res.json(await summarizeBillingV2Health());
    } catch (error) {
      res.status(500).json({ message: "Failed to load billing health" });
    }
  });

  // -------- Plan changes / add-ons / cancel --------
  app.post("/api/billing/v2/change-plan", isAuthenticated, blockIfBillingReadOnly, async (req: any, res) => {
    try {
      const result = await planLimits.changePlan({
        organizationId: req.user.organizationId,
        userId: req.user.id,
        planCode: String(req.body?.planCode || ""),
        cycle: req.body?.cycle === "monthly" ? "monthly" : "yearly",
      });
      res.json(result);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Change plan failed" });
    }
  });

  app.post("/api/billing/v2/cancel", isAuthenticated, async (req: any, res) => {
    try {
      const updated = await planLimits.cancelAtPeriodEnd(
        req.user.organizationId,
        req.user.id,
      );
      res.json(updated);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Cancel failed" });
    }
  });

  app.post("/api/billing/v2/addons/property-packs", isAuthenticated, blockIfBillingReadOnly, async (req: any, res) => {
    try {
      const result = await planLimits.addPropertyPacks({
        organizationId: req.user.organizationId,
        userId: req.user.id,
        quantity: Number(req.body?.quantity || 1),
      });
      res.json(result);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed" });
    }
  });

  app.post("/api/billing/v2/addons/extra-users", isAuthenticated, blockIfBillingReadOnly, async (req: any, res) => {
    try {
      const updated = await planLimits.setExtraUsers({
        organizationId: req.user.organizationId,
        userId: req.user.id,
        extraUsers: Number(req.body?.extraUsers ?? 0),
      });
      res.json(updated);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed" });
    }
  });

  app.post("/api/billing/v2/addons/hmo", isAuthenticated, blockIfBillingReadOnly, async (req: any, res) => {
    try {
      const updated = await planLimits.setHmoAddon({
        organizationId: req.user.organizationId,
        userId: req.user.id,
        enabled: Boolean(req.body?.enabled),
      });
      res.json(updated);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed" });
    }
  });

  app.get("/api/billing/v2/limits", isAuthenticated, async (req: any, res) => {
    try {
      const orgId = req.user.organizationId as string;
      const propertyMax = await planLimits.effectivePropertyLimit(orgId);
      const userMax = await planLimits.effectiveUserLimit(orgId);
      const { sub, plan } = await planLimits.getPlanForOrg(orgId);
      res.json({
        propertyMax,
        userMax,
        subscription: sub,
        plan,
        readOnly: await planLimits.isOrgReadOnly(orgId),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to load limits" });
    }
  });

  app.get("/api/billing/v2/module-availability/:moduleKey", isAuthenticated, async (req: any, res) => {
    try {
      const result = await planLimits.isModuleAvailableOnPlan(
        req.user.organizationId,
        req.params.moduleKey,
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed" });
    }
  });
}
