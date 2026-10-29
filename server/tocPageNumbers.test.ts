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
    text: `${TOC_MARKER_PREFIX}floorPlan${TOC_MARKER_SUFFIX} FLOOR PLAN & DIMENSIONS Kitchen Living Room`,
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
  { num: 4, text: "I 3 6 0 T O C . glossary . X Glossary" },
]);
assert(spaced.glossary === 4, "spaced marker still matches");

const byLabel = extractTocPagesByLabels(pages, [
  { key: "floorPlan", label: "Floor Plan" },
  { key: "glossary", label: "Glossary of Terms" },
  { key: "insp-kit", label: "Kitchen" },
  { key: "insp-liv", label: "Living Room" },
]);
assert(byLabel.floorPlan === 2, "label floorPlan skips contents");
assert(byLabel.glossary === 3, "label glossary");
// Floor Plan page lists many rooms — must not assign room TOC keys there
assert(byLabel["insp-kit"] === 5, "kitchen skips floor-plan room table");
assert(byLabel["insp-liv"] == null, "living room not false-matched on floor plan");

const maintPages = [
  { num: 1, text: "CONTENTS\n1. Maintenance Log\n2. Glossary of Terms" },
  { num: 2, text: "OUTSTANDING MAINTENANCE REQUESTS leaky tap" },
  { num: 3, text: "GLOSSARY OF TERMS" },
];
const byAlias = extractTocPagesByLabels(maintPages, [
  { key: "maintenanceLog", label: "Maintenance Log" },
  { key: "glossary", label: "Glossary of Terms" },
]);
assert(byAlias.maintenanceLog === 2, "maintenance alias matches heading");
assert(byAlias.glossary === 3, "glossary after maintenance");

console.log(`tocPageNumbers.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
