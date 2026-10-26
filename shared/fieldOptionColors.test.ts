/**
 * Run: npx tsx shared/fieldOptionColors.test.ts
 */
import assert from "node:assert/strict";
import {
  FIELD_OPTION_PALETTE,
  fieldOptionValues,
  normalizeFieldOptions,
  optionPillStyle,
  resolveBooleanOptionColor,
  resolveOptionColor,
  resolvePaletteHex,
  serializeFieldOption,
} from "./fieldOptionColors";

assert.equal(FIELD_OPTION_PALETTE.length, 10);
assert.ok(FIELD_OPTION_PALETTE.some((p) => p.id === "amber"));

assert.deepEqual(normalizeFieldOptions(["Excellent", "Poor"]), [
  { value: "Excellent", label: "Excellent" },
  { value: "Poor", label: "Poor" },
]);

assert.deepEqual(
  normalizeFieldOptions([{ value: "Good", color: "green" }, "Fair"]),
  [
    { value: "Good", label: "Good", color: "green" },
    { value: "Fair", label: "Fair" },
  ],
);

assert.deepEqual(fieldOptionValues([{ value: "A", color: "red" }, "B"]), ["A", "B"]);

assert.equal(resolvePaletteHex("amber"), "#f59e0b");
assert.equal(resolvePaletteHex("#abc"), "#aabbcc");
assert.equal(resolveOptionColor([{ value: "Poor", color: "red" }], "Poor"), "#ef4444");
assert.equal(resolveOptionColor(["Poor"], "Poor"), undefined);
assert.equal(resolveBooleanOptionColor({ booleanColors: { yes: "green", no: "red" } }, true), "#22c55e");
assert.equal(resolveBooleanOptionColor({ booleanColors: { yes: "green", no: "red" } }, false), "#ef4444");
assert.equal(resolveBooleanOptionColor({}, true), undefined);

assert.deepEqual(serializeFieldOption("Good"), "Good");
assert.deepEqual(serializeFieldOption("Good", "amber"), { value: "Good", color: "amber" });

const pill = optionPillStyle("#22c55e");
assert.ok(pill);
assert.match(pill!.backgroundColor, /^rgba\(/);
assert.equal(pill!.color, "#22c55e");

console.log("fieldOptionColors.test.ts: ok");
