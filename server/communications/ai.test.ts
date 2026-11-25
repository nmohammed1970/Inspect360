import assert from "node:assert/strict";
import {
  detectSafetyKeywords,
  ruleBasedTriage,
  shouldForceHumanTriage,
} from "./ai";

assert.ok(detectSafetyKeywords("There is a gas leak in the kitchen").includes("gas leak"));
assert.equal(detectSafetyKeywords("Hello").length, 0);

const safety = ruleBasedTriage({
  subject: "Smell of gas",
  body: "Strong smell of gas near the boiler",
});
assert.equal(safety.categoryKey, "health_safety");
assert.equal(safety.priority, "urgent");
assert.equal(shouldForceHumanTriage(safety), true);

const rent = ruleBasedTriage({
  subject: "Rent query",
  body: "Can I change my direct debit date?",
});
assert.equal(rent.categoryKey, "rent_payments");
assert.equal(shouldForceHumanTriage(rent), true);

console.log("communications ai.test.ts: ok");
