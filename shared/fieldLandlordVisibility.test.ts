/**
 * Run: npx tsx shared/fieldLandlordVisibility.test.ts
 */
import assert from "node:assert/strict";
import { isFieldVisibleToLandlord } from "./fieldLandlordVisibility";

assert.equal(isFieldVisibleToLandlord(undefined), false);
assert.equal(isFieldVisibleToLandlord(null), false);
assert.equal(isFieldVisibleToLandlord({}), false);
assert.equal(isFieldVisibleToLandlord({ visibleToLandlord: false }), false);
assert.equal(isFieldVisibleToLandlord({ visibleToLandlord: true }), true);

console.log("fieldLandlordVisibility.test.ts: ok");
