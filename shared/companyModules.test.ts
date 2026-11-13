import assert from "node:assert/strict";
import {
  companyModulesLockedByAiPlan,
  isAiInspectionsPlanCode,
  isCommunityEnabled,
  isCompanyModuleEnabled,
  isPropertyManagementPlanCode,
  normalizeCompanyModuleFlags,
  PROPERTY_BUNDLE_UPGRADE_MESSAGE,
} from "./companyModules";

assert.equal(isCompanyModuleEnabled(null, "rentals"), false, "null org fail-closed");
assert.equal(isCompanyModuleEnabled(undefined, "compliance"), false, "undefined org fail-closed");

assert.equal(
  isCompanyModuleEnabled({}, "rentals"),
  true,
  "missing flag defaults ON",
);
assert.equal(
  isCompanyModuleEnabled({ rentalsEnabled: null }, "rentals"),
  true,
  "null flag defaults ON",
);
assert.equal(
  isCompanyModuleEnabled({ rentalsEnabled: true }, "rentals"),
  true,
  "true is ON",
);
assert.equal(
  isCompanyModuleEnabled({ rentalsEnabled: false }, "rentals"),
  false,
  "false is OFF",
);
assert.equal(
  isCompanyModuleEnabled({ tenanciesEnabled: false }, "tenancies"),
  false,
);
assert.equal(
  isCompanyModuleEnabled({ complianceEnabled: false }, "compliance"),
  false,
);
assert.equal(
  isCompanyModuleEnabled({ complianceEnabled: false }, "rentals"),
  true,
  "unrelated flag ignored",
);
assert.equal(
  isCompanyModuleEnabled({ tenanciesEnabled: false, rentalsEnabled: true }, "rentals"),
  false,
  "Tenancies OFF forces Rentals OFF",
);
assert.equal(
  isCompanyModuleEnabled({ tenanciesEnabled: true, rentalsEnabled: true }, "rentals"),
  true,
  "both ON allows Rentals",
);
assert.equal(
  isCompanyModuleEnabled({}, "maintenance"),
  true,
  "maintenance missing flag defaults ON",
);
assert.equal(
  isCompanyModuleEnabled({ maintenanceEnabled: false }, "maintenance"),
  false,
);
assert.equal(
  isCompanyModuleEnabled({ maintenanceEnabled: false }, "compliance"),
  true,
  "maintenance OFF does not disable compliance",
);
assert.equal(
  isCompanyModuleEnabled({ tenanciesEnabled: false, maintenanceEnabled: true }, "maintenance"),
  true,
  "maintenance is independent of tenancies",
);

assert.equal(
  isCompanyModuleEnabled({}, "hmo_compliance"),
  false,
  "hmo_compliance missing flag defaults OFF (opt-in)",
);
assert.equal(
  isCompanyModuleEnabled({ hmoComplianceEnabled: null }, "hmo_compliance"),
  false,
  "hmo_compliance null defaults OFF",
);
assert.equal(
  isCompanyModuleEnabled({ hmoComplianceEnabled: false }, "hmo_compliance"),
  false,
);
assert.equal(
  isCompanyModuleEnabled({ hmoComplianceEnabled: true }, "hmo_compliance"),
  true,
  "hmo_compliance true is ON",
);
assert.equal(
  isCompanyModuleEnabled({ hmoComplianceEnabled: true, complianceEnabled: false }, "hmo_compliance"),
  true,
  "hmo_compliance is independent of generic compliance module",
);

assert.deepEqual(
  normalizeCompanyModuleFlags({ tenanciesEnabled: false, rentalsEnabled: true }),
  { tenanciesEnabled: false, rentalsEnabled: false },
  "normalize coerces Rentals OFF when Tenancies OFF",
);
assert.deepEqual(
  normalizeCompanyModuleFlags({ tenanciesEnabled: true, rentalsEnabled: true }),
  { tenanciesEnabled: true, rentalsEnabled: true },
);
assert.deepEqual(
  normalizeCompanyModuleFlags({ maintenanceEnabled: false }),
  { maintenanceEnabled: false },
);
assert.deepEqual(
  normalizeCompanyModuleFlags({ hmoComplianceEnabled: true }),
  { hmoComplianceEnabled: true },
);

assert.equal(isAiInspectionsPlanCode("ai_inspector"), true);
assert.equal(isAiInspectionsPlanCode("ai_payg"), true);
assert.equal(isAiInspectionsPlanCode("pm_essentials"), false);
assert.equal(isAiInspectionsPlanCode("pending"), false);
assert.equal(isPropertyManagementPlanCode("pm_professional"), true);
assert.equal(isPropertyManagementPlanCode("ai_team"), false);

assert.equal(
  companyModulesLockedByAiPlan("ai_inspector", "trialing"),
  true,
  "AI trial locks modules",
);
assert.equal(
  companyModulesLockedByAiPlan("ai_inspector", "active"),
  true,
  "AI active locks modules",
);
assert.equal(
  companyModulesLockedByAiPlan("ai_inspector", "incomplete"),
  false,
  "incomplete AI checkout does not lock",
);
assert.equal(
  companyModulesLockedByAiPlan("pm_essentials", "active"),
  false,
  "PM plan does not lock",
);
assert.equal(
  isCompanyModuleEnabled(
    {
      tenanciesEnabled: true,
      rentalsEnabled: true,
      complianceEnabled: true,
      maintenanceEnabled: true,
      hmoComplianceEnabled: true,
    },
    "tenancies",
    { planCode: "ai_inspector", planStatus: "trialing" },
  ),
  false,
  "AI plan forces tenancies OFF even when flags are true",
);
assert.equal(
  isCompanyModuleEnabled(
    { tenanciesEnabled: true, complianceEnabled: true },
    "compliance",
    { planCode: "pm_essentials", planStatus: "active" },
  ),
  true,
  "PM plan allows compliance when flag is ON",
);
assert.ok(
  PROPERTY_BUNDLE_UPGRADE_MESSAGE.toLowerCase().includes("upgrade") &&
    PROPERTY_BUNDLE_UPGRADE_MESSAGE.toLowerCase().includes("property management"),
  "upgrade message mentions Property Management",
);

assert.equal(
  isCommunityEnabled({ tenanciesEnabled: true }),
  true,
  "Community follows Tenancies ON",
);
assert.equal(
  isCommunityEnabled({ tenanciesEnabled: false }),
  false,
  "Community follows Tenancies OFF",
);
assert.equal(
  isCommunityEnabled(
    { tenanciesEnabled: true },
    { planCode: "ai_inspector", planStatus: "trialing" },
  ),
  false,
  "AI plan locks Community via Tenancies",
);

console.log("companyModules.test.ts: ok");
