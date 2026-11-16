import { and, eq, inArray } from "drizzle-orm";
import { billingPlans, billingSubscriptions } from "@shared/billingCatalogSchema";
import {
  aiPlanForcedCompanyModuleFlags,
  companyModuleAccessFromPlan,
  companyModulesLockedByAiPlan,
  type CompanyModuleAccess,
  type CompanyModuleKey,
} from "@shared/companyModules";
import { organizations } from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";
import { getConfigValue, setConfigValue } from "./catalogService";
import { getPlanForOrg } from "./planLimits";

const ESSENTIALS_ACTIVE_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "read_only",
  "unpaid",
] as const;

const ESSENTIALS_TENANT_PORTAL_KEY = "essentials_tenant_portal_v1";

let essentialsTenantPortalSynced = false;

/**
 * Essentials includes the tenant portal. Older catalog rows stored tenant_portal=false,
 * which turned Tenancies and Rentals off. Flip that once, and turn those modules on
 * for orgs already on Essentials.
 */
export async function ensureEssentialsIncludesTenantPortal(): Promise<void> {
  if (essentialsTenantPortalSynced) return;
  try {
    const already = await getConfigValue(ESSENTIALS_TENANT_PORTAL_KEY, "");
    if (already === "done") {
      essentialsTenantPortalSynced = true;
      return;
    }

    const [plan] = await db
      .select()
      .from(billingPlans)
      .where(eq(billingPlans.code, "pm_essentials"))
      .limit(1);
    if (!plan) {
      essentialsTenantPortalSynced = true;
      return;
    }
    const modules = (plan.modulesJson || {}) as Record<string, boolean | "addon">;
    if (modules.tenant_portal === true) {
      await setConfigValue(ESSENTIALS_TENANT_PORTAL_KEY, "done");
      essentialsTenantPortalSynced = true;
      return;
    }

    const subs = await db
      .select({ organizationId: billingSubscriptions.organizationId })
      .from(billingSubscriptions)
      .where(
        and(
          eq(billingSubscriptions.planCode, "pm_essentials"),
          inArray(billingSubscriptions.status, [...ESSENTIALS_ACTIVE_STATUSES]),
        ),
      );
    const orgIds = subs.map((row) => row.organizationId);

    await db.transaction(async (tx) => {
      await tx
        .update(billingPlans)
        .set({
          modulesJson: { ...modules, tenant_portal: true },
          updatedAt: new Date(),
        })
        .where(eq(billingPlans.code, "pm_essentials"));
      if (orgIds.length > 0) {
        await tx
          .update(organizations)
          .set({
            tenanciesEnabled: true,
            rentalsEnabled: true,
            updatedAt: new Date(),
          })
          .where(inArray(organizations.id, orgIds));
      }
    });
    await setConfigValue(ESSENTIALS_TENANT_PORTAL_KEY, "done");
    essentialsTenantPortalSynced = true;
  } catch (error) {
    console.error("[billing] essentials tenant portal sync failed:", error);
  }
}

export type CompanyModulePlanContext = {
  planCode: string | null;
  planStatus: string | null;
  locked: boolean;
  companyModuleAccess: Record<CompanyModuleKey, CompanyModuleAccess> | null;
};

/** Load billing subscription context used for company-module plan locks. */
export async function getCompanyModulePlanContext(
  organizationId: string,
): Promise<CompanyModulePlanContext> {
  await ensureEssentialsIncludesTenantPortal();
  const { plan, sub } = await getPlanForOrg(organizationId);
  const planCode = sub?.planCode ?? null;
  const planStatus = sub?.status ?? null;
  return {
    planCode,
    planStatus,
    locked: companyModulesLockedByAiPlan(planCode, planStatus),
    companyModuleAccess: companyModuleAccessFromPlan(
      (plan?.modulesJson ?? null) as Record<string, boolean | "addon"> | null,
      { hmoAddon: !!sub?.hmoAddon },
    ),
  };
}

/**
 * While an AI Inspections plan is active, force Internal Modules OFF in the DB
 * so every server check (not only requireCompanyModule) stays locked.
 */
export async function enforceAiPlanCompanyModuleLocks(
  organizationId: string,
): Promise<boolean> {
  const ctx = await getCompanyModulePlanContext(organizationId);
  if (!ctx.locked) return false;
  await storage.updateOrganization(organizationId, aiPlanForcedCompanyModuleFlags());
  return true;
}

/**
 * Turn off Internal Modules the current plan does not include.
 * Included modules stay as the org left them, so they can still hide a module.
 */
export async function enforceDisallowedCompanyModules(
  organizationId: string,
): Promise<boolean> {
  const ctx = await getCompanyModulePlanContext(organizationId);
  if (ctx.locked || !ctx.companyModuleAccess) return false;
  const org = await storage.getOrganization(organizationId);
  if (!org) return false;

  const access = ctx.companyModuleAccess;
  const patch: Record<string, boolean> = {};
  if (!access.tenancies.allowed && org.tenanciesEnabled) patch.tenanciesEnabled = false;
  if (
    (!access.rentals.allowed || patch.tenanciesEnabled === false) &&
    org.rentalsEnabled
  ) {
    patch.rentalsEnabled = false;
  }
  if (!access.compliance.allowed && org.complianceEnabled) patch.complianceEnabled = false;
  if (!access.maintenance.allowed && org.maintenanceEnabled) patch.maintenanceEnabled = false;
  if (!access.hmo_compliance.allowed && org.hmoComplianceEnabled) {
    patch.hmoComplianceEnabled = false;
  }
  if (Object.keys(patch).length === 0) return false;
  await storage.updateOrganization(organizationId, patch as any);
  return true;
}
