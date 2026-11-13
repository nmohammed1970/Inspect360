import { storage } from "../storage";
import {
  aiPlanForcedCompanyModuleFlags,
  companyModulesLockedByAiPlan,
} from "@shared/companyModules";
import { getOrgBillingSubscription } from "./planLimits";

/** Load billing subscription context used for company-module plan locks. */
export async function getCompanyModulePlanContext(organizationId: string) {
  const sub = await getOrgBillingSubscription(organizationId);
  return {
    planCode: sub?.planCode ?? null,
    planStatus: sub?.status ?? null,
    locked: companyModulesLockedByAiPlan(sub?.planCode, sub?.status),
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
