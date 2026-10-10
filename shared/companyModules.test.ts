import assert from "node:assert/strict";
import { isCompanyModuleEnabled, normalizeCompanyModuleFlags } from "./companyModules";

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

console.log("companyModules.test.ts: ok");
