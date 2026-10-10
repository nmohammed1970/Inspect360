/**
 * Company module helper + middleware contract tests (no database).
 * Run with: npx tsx server/companyModules.test.ts
 */

import assert from "node:assert/strict";
import {
  COMPANY_MODULE_META,
  isCompanyModuleEnabled,
  normalizeCompanyModuleFlags,
  type CompanyModuleKey,
} from "@shared/companyModules";

assert.equal(isCompanyModuleEnabled(null, "rentals"), false);
assert.equal(isCompanyModuleEnabled({}, "rentals"), true);
assert.equal(isCompanyModuleEnabled({ rentalsEnabled: false }, "rentals"), false);
assert.equal(isCompanyModuleEnabled({ tenanciesEnabled: false }, "tenancies"), false);
assert.equal(isCompanyModuleEnabled({ complianceEnabled: false }, "compliance"), false);
assert.equal(isCompanyModuleEnabled({ maintenanceEnabled: false }, "maintenance"), false);
assert.equal(
  isCompanyModuleEnabled({ maintenanceEnabled: false, tenanciesEnabled: true }, "maintenance"),
  false,
  "maintenance OFF is independent of tenancies",
);

// Dependency strategy:
// - Tenancies OFF forces Rentals OFF
// - Rentals OFF does not force Tenancies OFF
// - Compliance OFF is independent
assert.equal(
  isCompanyModuleEnabled({ rentalsEnabled: false, tenanciesEnabled: true }, "tenancies"),
  true,
  "disabling Rentals must not cascade to Tenancies",
);
assert.equal(
  isCompanyModuleEnabled({ tenanciesEnabled: false, rentalsEnabled: true }, "rentals"),
  false,
  "disabling Tenancies forces Rentals OFF",
);
assert.equal(
  isCompanyModuleEnabled(
    { complianceEnabled: false, rentalsEnabled: true, tenanciesEnabled: true },
    "compliance",
  ),
  false,
);
assert.equal(
  isCompanyModuleEnabled(
    { complianceEnabled: false, rentalsEnabled: true, tenanciesEnabled: true },
    "rentals",
  ),
  true,
);

assert.deepEqual(
  normalizeCompanyModuleFlags({ tenanciesEnabled: false, rentalsEnabled: true }),
  { tenanciesEnabled: false, rentalsEnabled: false },
);

for (const key of Object.keys(COMPANY_MODULE_META) as CompanyModuleKey[]) {
  assert.ok(COMPANY_MODULE_META[key].label, `${key} has label`);
  assert.ok(COMPANY_MODULE_META[key].description, `${key} has description`);
}

/** Mirrors requireCompanyModule 403 payload shape used by APIs. */
function companyModuleDisabledResponse(moduleKey: CompanyModuleKey) {
  return {
    message: `${COMPANY_MODULE_META[moduleKey].label} is disabled for your organization`,
    code: "COMPANY_MODULE_DISABLED",
    module: moduleKey,
  };
}

const sample = companyModuleDisabledResponse("compliance");
assert.equal(sample.code, "COMPANY_MODULE_DISABLED");
assert.equal(sample.module, "compliance");
assert.match(sample.message, /Compliance/);

const maintenanceDisabled = companyModuleDisabledResponse("maintenance");
assert.equal(maintenanceDisabled.module, "maintenance");
assert.match(maintenanceDisabled.message, /Maintenance/);

console.log("server/companyModules.test.ts: ok");
