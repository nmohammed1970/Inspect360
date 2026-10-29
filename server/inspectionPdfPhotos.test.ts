/**
 * Run: npx tsx server/inspectionPdfPhotos.test.ts
 */
import {
  collectUniquePhotoUrls,
  mapWithConcurrency,
} from "./inspectionPdfPhotos";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

const urls = collectUniquePhotoUrls([
  { photos: ["/objects/a.jpg", "/objects/b.jpg"] },
  { photos: ["/objects/a.jpg", "  /objects/c.jpg  "] },
  { photos: null },
  { photos: ["", "  "] },
]);
assert(urls.length === 3, "unique photo urls de-dupe and trim");
assert(urls[0] === "/objects/a.jpg", "first unique preserved");
assert(urls.includes("/objects/c.jpg"), "trimmed url kept");

const order: number[] = [];
const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
  order.push(n);
  await new Promise((r) => setTimeout(r, 10));
  return n * 10;
});
assert(results.join(",") === "10,20,30,40,50", "mapWithConcurrency preserves order");
assert(order.length === 5, "all items processed");

const empty = await mapWithConcurrency([], 4, async (n) => n);
assert(empty.length === 0, "empty input");

console.log(`inspectionPdfPhotos.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
