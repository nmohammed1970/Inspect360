/**
 * Run: npx tsx server/inspectionPdfCache.test.ts
 */
import {
  buildInspectionPdfCacheKey,
  clearInspectionPdfCache,
  getInspectionPdfCache,
  setInspectionPdfCache,
} from "./inspectionPdfCache";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

clearInspectionPdfCache();

const base = {
  inspectionId: "insp-1",
  audience: "full" as const,
  inspectionUpdatedAt: "2026-01-01T00:00:00.000Z",
  entries: [
    {
      id: "e1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      note: "hello",
      photos: ["/objects/a.jpg"],
      valueJson: { v: 1 },
    },
  ],
};

const key1 = buildInspectionPdfCacheKey(base);
const key2 = buildInspectionPdfCacheKey({
  ...base,
  entries: [{ ...base.entries[0], note: "changed" }],
});
const key3 = buildInspectionPdfCacheKey({
  ...base,
  audience: "landlord",
});
const keySame = buildInspectionPdfCacheKey({
  ...base,
  entries: [
    {
      id: "e1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      note: "hello",
      photos: ["/objects/a.jpg"],
      valueJson: { v: 1 },
    },
  ],
});

assert(key1 !== key2, "note change invalidates key");
assert(key1 !== key3, "audience change invalidates key");
assert(key1 === keySame, "Date vs ISO string produces same key");

const buf = Buffer.from("%PDF-1.4 test");
setInspectionPdfCache(key1, buf);
const hit = getInspectionPdfCache(key1);
assert(!!hit && hit.equals(buf), "cache returns stored buffer");
assert(getInspectionPdfCache(key2) === null, "miss for different key");

clearInspectionPdfCache();
assert(getInspectionPdfCache(key1) === null, "clear empties cache");

console.log(`inspectionPdfCache.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
