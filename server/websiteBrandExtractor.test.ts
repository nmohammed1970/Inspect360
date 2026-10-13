/**
 * Run: npx tsx server/websiteBrandExtractor.test.ts
 * Unit-tests CSS collection via paletteFromCandidates path (no live network).
 */
import assert from "node:assert/strict";
import { paletteFromCandidates, normalizeColorToken } from "@shared/reportBrandTheme";

const fixtureCss = `
:root {
  --brand-primary: #0A2540;
  --brand-accent: #C9A227;
  --bg: #FFFFFF;
  --text: #111111;
}
.button { background: #0A2540; color: #fff; }
`;

const found: string[] = [];
const re = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
let m: RegExpExecArray | null;
while ((m = re.exec(fixtureCss))) {
  const hex = normalizeColorToken(m[0]);
  if (hex) found.push(hex);
}
assert.ok(found.includes("#0A2540"));
assert.ok(found.includes("#C9A227"));

const { palette, status } = paletteFromCandidates(found, {
  primary: "#0A2540",
  accent: "#C9A227",
});
assert.equal(palette.primary, "#0A2540");
assert.equal(status, "ok");

console.log("websiteBrandExtractor.test.ts: all assertions passed");
