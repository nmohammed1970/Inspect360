/**
 * Property/block cover image helpers for PDF reports.
 * Run: npx tsx server/reportPdfShared.coverImage.test.ts
 */
import {
  coverSubjectImageCss,
  renderCoverSubjectImageHtml,
  resolveReportImageToDataUrl,
  sanitizeReportUrl,
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

assert(renderCoverSubjectImageHtml(null) === "", "null returns empty");
assert(renderCoverSubjectImageHtml(undefined) === "", "undefined returns empty");
assert(renderCoverSubjectImageHtml("") === "", "empty string returns empty");
assert(renderCoverSubjectImageHtml("   ") === "", "whitespace returns empty");
assert(
  renderCoverSubjectImageHtml("https://evil.example/x.jpg") === "",
  "http URL rejected in render (data URL only)",
);
assert(
  renderCoverSubjectImageHtml("javascript:alert(1)") === "",
  "javascript URL rejected in render",
);

const pngData = "data:image/png;base64,abc123";
const html = renderCoverSubjectImageHtml(pngData, 'Home "A"');
assert(html.includes("cover-subject-image-wrap"), "wrap class present");
assert(html.includes('class="cover-subject-image"'), "img class present");
assert(html.includes(pngData), "data URL preserved as src");
assert(html.includes('alt="Home &quot;A&quot;"'), "alt text escaped");
assert(!html.includes("<script>"), "no script injection via alt");

const jpegHtml = renderCoverSubjectImageHtml("data:image/jpeg;base64,xyz");
assert(jpegHtml.includes("cover-subject-image"), "jpeg data URL accepted");

assert(coverSubjectImageCss().includes(".cover-subject-image"), "css includes image class");
assert(coverSubjectImageCss().includes("object-fit: cover"), "css preserves aspect via cover");
assert(coverSubjectImageCss().includes("max-height: 80mm"), "css caps height in mm");

assert(sanitizeReportUrl("javascript:alert(1)") === "", "sanitize rejects javascript");
assert(sanitizeReportUrl("") === "", "sanitize empty");

(async () => {
  assert((await resolveReportImageToDataUrl(null)) === null, "resolve null");
  assert((await resolveReportImageToDataUrl("")) === null, "resolve empty");
  assert((await resolveReportImageToDataUrl("javascript:alert(1)")) === null, "resolve rejects javascript");
  assert((await resolveReportImageToDataUrl("ftp://example.com/a.jpg")) === null, "resolve rejects ftp");
  assert(
    (await resolveReportImageToDataUrl("data:image/png;base64,hello")) === "data:image/png;base64,hello",
    "resolve passes through safe data URL",
  );
  assert(
    (await resolveReportImageToDataUrl("/relative/without-base.jpg")) === null,
    "relative URL without baseUrl returns null",
  );

  console.log(`reportPdfShared.coverImage tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
