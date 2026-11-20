import assert from "node:assert/strict";
import { resolveInspectionTenantNames } from "./inspectionTenantNames";

const tenants = [
  { id: "t1", firstName: "Sarah", lastName: "Wilson" },
  { id: "t2", firstName: "John", lastName: "Harrison" },
];

assert.equal(
  resolveInspectionTenantNames(tenants, "t1"),
  "Sarah Wilson",
  "selected tenant only",
);
assert.equal(
  resolveInspectionTenantNames(tenants, "t2"),
  "John Harrison",
  "other selected tenant",
);
assert.equal(
  resolveInspectionTenantNames(tenants, null),
  "Sarah Wilson, John Harrison",
  "no selection → all tenants (legacy)",
);
assert.equal(
  resolveInspectionTenantNames(tenants, "missing"),
  "",
  "unknown selection → empty (do not fall back to everyone)",
);
assert.equal(resolveInspectionTenantNames([], "t1"), "");
assert.equal(resolveInspectionTenantNames(null, "t1"), "");

console.log("inspectionTenantNames.test.ts: ok");
