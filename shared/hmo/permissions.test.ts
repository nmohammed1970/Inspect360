import assert from "node:assert/strict";
import { hasHmoPermission, hmoPermissionsForRole } from "./permissions";

assert.deepEqual(hmoPermissionsForRole(null), []);
assert.deepEqual(hmoPermissionsForRole(undefined), []);
assert.deepEqual(hmoPermissionsForRole("tenant"), []);
assert.deepEqual(hmoPermissionsForRole("contractor"), []);

assert.equal(hasHmoPermission("owner", "hmo.critical.close"), true);
assert.equal(hasHmoPermission("owner", "hmo.rule.approve"), true);
assert.equal(hasHmoPermission("owner", "hmo.licence.confirm"), true);

assert.equal(hasHmoPermission("compliance", "hmo.critical.close"), true);
assert.equal(hasHmoPermission("compliance", "hmo.rule.approve"), false);
assert.equal(hasHmoPermission("compliance", "hmo.assessment.run"), true);

assert.equal(hasHmoPermission("clerk", "hmo.licence.upload"), true);
assert.equal(hasHmoPermission("clerk", "hmo.licence.confirm"), false);
assert.equal(hasHmoPermission("clerk", "hmo.critical.close"), false);
assert.equal(hasHmoPermission("clerk", "hmo.case.read"), true);
assert.equal(hasHmoPermission("clerk", "hmo.assessment.run"), true);

assert.ok(hmoPermissionsForRole("owner").length >= hmoPermissionsForRole("compliance").length);
assert.ok(hmoPermissionsForRole("compliance").length > hmoPermissionsForRole("clerk").length);

console.log("shared/hmo/permissions.test.ts: all assertions passed");
