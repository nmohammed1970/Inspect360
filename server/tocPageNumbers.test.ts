/**
 * Run: npx tsx server/tocPageNumbers.test.ts
 */
import {
  extractTocMarkerPagesFromPageTexts,
  extractTocPagesByLabels,
  sanitizeTocKey,
  TOC_MARKER_PREFIX,
  TOC_MARKER_SUFFIX,
} from "./reportPdfShared";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

assert(sanitizeTocKey("insp-Kitchen Overview!") === "insp-Kitchen_Overview", "sanitize toc key");

const pages = [
  { num: 1, text: "CONTENTS\n1. Floor Plan\n2. Glossary of Terms\n3. Kitchen" },
  {
    num: 2,
    text: `${TOC_MARKER_PREFIX}floorPlan${TOC_MARKER_SUFFIX} FLOOR PLAN & DIMENSIONS`,
  },
  {
    num: 3,
    text: `GLOSSARY OF TERMS`,
  },
  {
    num: 5,
    text: `Room ${TOC_MARKER_PREFIX}insp-abc${TOC_MARKER_SUFFIX} Kitchen Overview`,
  },
];

const map = extractTocMarkerPagesFromPageTexts(pages);
assert(map.floorPlan === 2, "floorPlan page");
assert(map["insp-abc"] === 5, "first inspection page wins");

const spaced = extractTocMarkerPagesFromPageTexts([
  { num: 4, text: "< < I 3 6 0 T O C : glossary > > Glossary" },
]);
assert(spaced.glossary === 4, "spaced marker still matches");

const byLabel = extractTocPagesByLabels(pages, [
  { key: "floorPlan", label: "Floor Plan" },
  { key: "glossary", label: "Glossary of Terms" },
  { key: "kitchen", label: "Kitchen" },
]);
assert(byLabel.floorPlan === 2, "label floorPlan skips contents");
assert(byLabel.glossary === 3, "label glossary");
assert(byLabel.kitchen === 5, "label kitchen uses section page not contents");

console.log(`tocPageNumbers.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
