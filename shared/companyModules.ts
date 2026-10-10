/**
 * Org-scoped company feature modules (not marketplace billable packs).
 *
 * Dependency strategy (no cascade-disable of Properties/Blocks/Inspections):
 * - Tenancies OFF → Rentals is also treated as OFF (rent is tied to tenant assignments).
 * - Rentals OFF → hide finance tabs/actions/settings/jobs; tenancy assignments still work.
 * - Compliance OFF → hide compliance nav/tabs/reports/alerts; skip certificate→compliance
 *   auto-link; inspections continue. Maintenance is a separate toggle.
 * - Maintenance OFF → hide requests, work orders, inspection Log Maintenance, tenant
 *   maintenance; inspections/compliance continue.
 * Disabling never deletes rows; re-enable restores access to existing data.
 */

export const COMPANY_MODULE_KEYS = ["rentals", "tenancies", "compliance", "maintenance"] as const;

export type CompanyModuleKey = (typeof COMPANY_MODULE_KEYS)[number];

export type CompanyModuleFlags = {
  rentalsEnabled?: boolean | null;
  tenanciesEnabled?: boolean | null;
  complianceEnabled?: boolean | null;
  maintenanceEnabled?: boolean | null;
};

const FLAG_BY_KEY: Record<CompanyModuleKey, keyof CompanyModuleFlags> = {
  rentals: "rentalsEnabled",
  tenancies: "tenanciesEnabled",
  compliance: "complianceEnabled",
  maintenance: "maintenanceEnabled",
};

function flagOn(value: boolean | null | undefined): boolean {
  return value !== false;
}

/**
 * Whether a company module is enabled for an organization.
 * Missing/null flags default to enabled (backward compatible).
 * Rentals requires Tenancies — if Tenancies is OFF, Rentals is OFF.
 */
export function isCompanyModuleEnabled(
  org: CompanyModuleFlags | null | undefined,
  key: CompanyModuleKey,
): boolean {
  if (!org) return false;
  if (key === "rentals") {
    return flagOn(org.rentalsEnabled) && flagOn(org.tenanciesEnabled);
  }
  return flagOn(org[FLAG_BY_KEY[key]]);
}

/**
 * Coerce flags for persistence: Tenancies OFF forces Rentals OFF.
 */
export function normalizeCompanyModuleFlags(input: {
  rentalsEnabled?: boolean;
  tenanciesEnabled?: boolean;
  complianceEnabled?: boolean;
  maintenanceEnabled?: boolean;
}): {
  rentalsEnabled?: boolean;
  tenanciesEnabled?: boolean;
  complianceEnabled?: boolean;
  maintenanceEnabled?: boolean;
} {
  const out: {
    rentalsEnabled?: boolean;
    tenanciesEnabled?: boolean;
    complianceEnabled?: boolean;
    maintenanceEnabled?: boolean;
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
      "Manage tenancy assignments, tenant records, and tenant-related workflows. Turning this off also disables Rentals.",
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
};
