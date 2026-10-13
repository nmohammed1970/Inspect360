/**
 * Run: npx tsx shared/reportBrandTheme.test.ts
 */
import assert from "node:assert/strict";
import {
  normalizeHexColor,
  normalizeAiBrandPaletteResult,
  paletteFromCandidates,
  resolveReportTheme,
  DEFAULT_REPORT_PALETTE,
  contrastRatio,
  isValidReportPalette,
  darkenHex,
} from "./reportBrandTheme";

assert.equal(normalizeHexColor("#0d5"), "#00DD55");
assert.equal(normalizeHexColor("00D5CC"), "#00D5CC");
assert.equal(normalizeHexColor("not-a-color"), null);

const ai = normalizeAiBrandPaletteResult(
  { primary: "#112233", secondary: "#AABBCC", invented: "#FFFFFF" },
  ["#112233", "#AABBCC"],
);
assert.equal(ai.palette.primary, "#112233");
assert.equal(ai.status, "ok");

const badAi = normalizeAiBrandPaletteResult({ primary: "nope" }, ["#112233"]);
assert.equal(badAi.status, "partial");

const fromCand = paletteFromCandidates(["#00D5CC", "#3B7A8C"]);
assert.ok(isValidReportPalette(fromCand.palette));
assert.equal(fromCand.status, "ok");

const theme = resolveReportTheme({
  brandingReportPalette: fromCand.palette,
});
assert.equal(theme.primary, fromCand.palette.primary);
assert.ok(theme.primaryDark);

const defaultTheme = resolveReportTheme(null);
assert.equal(defaultTheme.primary, DEFAULT_REPORT_PALETTE.primary);

assert.ok(contrastRatio("#000000", "#FFFFFF") > 20);
assert.ok(darkenHex("#00D5CC", 0.3).startsWith("#"));

console.log("reportBrandTheme.test.ts: all assertions passed");
