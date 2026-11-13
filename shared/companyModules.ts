/**
 * Org-scoped company feature modules (not marketplace billable packs).
 *
 * Dependency strategy (no cascade-disable of Properties/Blocks/Inspections):
 * - Tenancies OFF → Rentals is also treated as OFF (rent is tied to tenant assignments).
 * - Tenancies OFF → Community (operator moderation + tenant portal community) is also OFF.
 *   Community has no separate Internal Module toggle; it follows Tenancies.
 * - Rentals OFF → hide finance tabs/actions/settings/jobs; tenancy assignments still work.
 * - Compliance OFF → hide compliance nav/tabs/reports/alerts; skip certificate→compliance
 *   auto-link; inspections continue. Maintenance is a separate toggle.
 * - Maintenance OFF → hide requests, work orders, inspection Log Maintenance, tenant
 *   maintenance; inspections/compliance continue.
 * - HMO Compliance OFF → hide HMO Intelligence nav/tabs/APIs; generic compliance docs continue.
 * Disabling never deletes rows; re-enable restores access to existing data.
 */

export const COMPANY_MODULE_KEYS = [
  "rentals",
  "tenancies",
  "compliance",
  "maintenance",
  "hmo_compliance",
] as const;

export type CompanyModuleKey = (typeof COMPANY_MODULE_KEYS)[number];

/** Modules that require a Property Management plan (locked on AI Inspections plans). */
export const PROPERTY_PLAN_REQUIRED_MODULES: readonly CompanyModuleKey[] = COMPANY_MODULE_KEYS;

export const PROPERTY_BUNDLE_UPGRADE_MESSAGE =
  "Please upgrade your plan to Property Management to unlock these.";

const AI_PLAN_ACTIVE_STATUSES = new Set([
  "trialing",
  "active",
  "past_due",
  "read_only",
  "unpaid",
]);

/** AI Inspections catalog plan codes (ai_payg, ai_inspector, …). */
export function isAiInspectionsPlanCode(planCode: string | null | undefined): boolean {
  if (!planCode || planCode === "pending") return false;
  return planCode.startsWith("ai_");
}

/** Property Management catalog plan codes (pm_essentials, …). */
export function isPropertyManagementPlanCode(planCode: string | null | undefined): boolean {
  if (!planCode || planCode === "pending") return false;
  return planCode.startsWith("pm_");
}

/**
 * True when the org is on an active AI Inspections subscription —
 * Internal Modules (tenancies/rentals/compliance/maintenance/HMO) stay locked OFF.
 */
export function companyModulesLockedByAiPlan(
  planCode: string | null | undefined,
  planStatus?: string | null,
): boolean {
  if (!isAiInspectionsPlanCode(planCode)) return false;
  if (planStatus == null || planStatus === "") return true;
  return AI_PLAN_ACTIVE_STATUSES.has(planStatus);
}

export type CompanyModulePlanContext = {
  planCode?: string | null;
  planStatus?: string | null;
};

/** Flags forced OFF while an AI Inspections plan is active. */
export function aiPlanForcedCompanyModuleFlags(): {
  rentalsEnabled: false;
  tenanciesEnabled: false;
  complianceEnabled: false;
  maintenanceEnabled: false;
  hmoComplianceEnabled: false;
} {
  return {
    rentalsEnabled: false,
    tenanciesEnabled: false,
    complianceEnabled: false,
    maintenanceEnabled: false,
    hmoComplianceEnabled: false,
  };
}

export type CompanyModuleFlags = {
  rentalsEnabled?: boolean | null;
  tenanciesEnabled?: boolean | null;
  complianceEnabled?: boolean | null;
  maintenanceEnabled?: boolean | null;
  /** Opt-in HMO Compliance Intelligence (default OFF). */
  hmoComplianceEnabled?: boolean | null;
};

const FLAG_BY_KEY: Record<CompanyModuleKey, keyof CompanyModuleFlags> = {
  rentals: "rentalsEnabled",
  tenancies: "tenanciesEnabled",
  compliance: "complianceEnabled",
  maintenance: "maintenanceEnabled",
  hmo_compliance: "hmoComplianceEnabled",
};

function flagOn(value: boolean | null | undefined): boolean {
  return value !== false;
}

/**
 * Whether a company module is enabled for an organization.
 * Missing/null flags default to enabled (backward compatible) except
 * `hmo_compliance`, which is opt-in (must be explicitly true).
 * Rentals requires Tenancies — if Tenancies is OFF, Rentals is OFF.
 * When `plan` is an active AI Inspections subscription, all company modules are OFF.
 */
export function isCompanyModuleEnabled(
  org: CompanyModuleFlags | null | undefined,
  key: CompanyModuleKey,
  plan?: CompanyModulePlanContext | null,
): boolean {
  if (!org) return false;
  if (companyModulesLockedByAiPlan(plan?.planCode, plan?.planStatus)) {
    return false;
  }
  if (key === "rentals") {
    return flagOn(org.rentalsEnabled) && flagOn(org.tenanciesEnabled);
  }
  if (key === "hmo_compliance") {
    return org.hmoComplianceEnabled === true;
  }
  return flagOn(org[FLAG_BY_KEY[key]]);
}

/**
 * Community has no separate Internal Module — it follows Tenancies
 * (operator Community nav + tenant portal community).
 */
export function isCommunityEnabled(
  org: CompanyModuleFlags | null | undefined,
  plan?: CompanyModulePlanContext | null,
): boolean {
  return isCompanyModuleEnabled(org, "tenancies", plan);
}

/**
 * Coerce flags for persistence: Tenancies OFF forces Rentals OFF.
 */
export function normalizeCompanyModuleFlags(input: {
  rentalsEnabled?: boolean;
  tenanciesEnabled?: boolean;
  complianceEnabled?: boolean;
  maintenanceEnabled?: boolean;
  hmoComplianceEnabled?: boolean;
}): {
  rentalsEnabled?: boolean;
  tenanciesEnabled?: boolean;
  complianceEnabled?: boolean;
  maintenanceEnabled?: boolean;
  hmoComplianceEnabled?: boolean;
} {
  const out: {
    rentalsEnabled?: boolean;
    tenanciesEnabled?: boolean;
    complianceEnabled?: boolean;
    maintenanceEnabled?: boolean;
    hmoComplianceEnabled?: boolean;
  } = {};

  if (typeof input.tenanciesEnabled === "boolean") {
    out.tenanciesEnabled = input.tenanciesEnabled;
  }
  if (typeof input.complianceEnabled === "boolean") {
    out.complianceEnabled = input.complianceEnabled;
  }
  if (typeof input.maintenanceEnabled === "boolean") {
    out.maintenanceEnabled = input.maintenanceEnabled;
  }
  if (typeof input.hmoComplianceEnabled === "boolean") {
    out.hmoComplianceEnabled = input.hmoComplianceEnabled;
  }
  if (typeof input.rentalsEnabled === "boolean" || typeof input.tenanciesEnabled === "boolean") {
    const tenanciesOn =
      typeof input.tenanciesEnabled === "boolean" ? input.tenanciesEnabled : true;
    const rentalsRequested =
      typeof input.rentalsEnabled === "boolean" ? input.rentalsEnabled : true;
    out.rentalsEnabled = tenanciesOn ? rentalsRequested : false;
  }

  return out;
}

export function companyModuleFlagField(key: CompanyModuleKey): keyof CompanyModuleFlags {
  return FLAG_BY_KEY[key];
}

/** Which report surfaces to include for an org (disabled modules stay hidden). */
export type ReportModuleSurfaces = {
  includeTenancies: boolean;
  includeCompliance: boolean;
  includeMaintenance: boolean;
  includeHmoCompliance: boolean;
};

export function reportModuleSurfaces(
  org: CompanyModuleFlags | null | undefined,
): ReportModuleSurfaces {
  return {
    includeTenancies: isCompanyModuleEnabled(org, "tenancies"),
    includeCompliance: isCompanyModuleEnabled(org, "compliance"),
    includeMaintenance: isCompanyModuleEnabled(org, "maintenance"),
    includeHmoCompliance: isCompanyModuleEnabled(org, "hmo_compliance"),
  };
}

export const COMPANY_MODULE_META: Record<
  CompanyModuleKey,
  { label: string; description: string }
> = {
  rentals: {
    label: "Rentals",
    description:
      "Manage deposits, rent collection, expenses, and late-rent reminders on properties. Requires Tenancies.",
  },
  tenancies: {
    label: "Tenancies",
    description:
      "Manage tenancy assignments, tenant records, and tenant-related workflows. Turning this off also disables Rentals and Community.",
  },
  compliance: {
    label: "Compliance",
    description:
      "Manage compliance documents, certificates, and compliance reports",
  },
  maintenance: {
    label: "Maintenance",
    description:
      "Manage maintenance requests, work orders, and logging issues from inspections. Turning this off also hides maintenance in the tenant portal.",
  },
  hmo_compliance: {
    label: "HMO Compliance",
    description:
      "HMO Compliance Intelligence: licence upload, extraction, assessments, findings, remediation cases, and portfolio oversight. Opt-in; turning off hides HMO screens without deleting data.",
  },
};
