import assert from "node:assert/strict";
import { buildOwnerUsername, withUsernameCollisionSuffix } from "./username";

assert.equal(
  buildOwnerUsername("Foxtons@Deffinity.com", "  Foxtons  "),
  "foxtons@deffinity.com|Foxtons",
);

const longCompany = "A".repeat(300);
assert.ok(buildOwnerUsername("a@b.com", longCompany).length <= 200);

assert.equal(withUsernameCollisionSuffix("base", 1), "base");
assert.equal(withUsernameCollisionSuffix("base", 2), "base-2");
assert.equal(withUsernameCollisionSuffix("x".repeat(200), 2).length, 200);

console.log("username.test.ts: ok");
