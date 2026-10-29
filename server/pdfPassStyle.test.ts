/**
 * Run: npx tsx server/pdfPassStyle.test.ts
 */
import { PDF_BODY_ONLY_CSS, PDF_COVER_ONLY_CSS, applyPdfPassStyleOnPage } from "./reportPdfShared";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

assert(PDF_COVER_ONLY_CSS.includes(".cover-page ~ *"), "cover css hides siblings");
assert(PDF_BODY_ONLY_CSS.includes(".cover-page { display: none"), "body css hides cover");
assert(PDF_BODY_ONLY_CSS.includes("@page"), "body css sets page margins");

const styles: Array<{ id: string; css: string }> = [];
const fakePage = {
  evaluate: async (fn: Function, id: string, css: string) => {
    // Minimal document shim for the injected function body
    const doc = {
      head: { appendChild: (el: any) => styles.push({ id: el.id, css: el.textContent }) },
      getElementById: (want: string) => {
        const idx = styles.findIndex((s) => s.id === want);
        if (idx < 0) return null;
        return {
          remove: () => {
            styles.splice(idx, 1);
          },
        };
      },
      createElement: (tag: string) => {
        const el: any = { tagName: tag, id: "", textContent: "" };
        return el;
      },
    };
    // Execute with a fake global document
    const wrapped = new Function(
      "document",
      "styleId",
      "styleCss",
      `(${fn.toString()})(styleId, styleCss);`,
    );
    wrapped(doc, id, css);
  },
};

await applyPdfPassStyleOnPage(fakePage as any, "cover");
assert(styles.length === 1 && styles[0].id === "pdf-cover-only-pass", "cover style applied");
await applyPdfPassStyleOnPage(fakePage as any, "body");
assert(styles.length === 1 && styles[0].id === "pdf-body-only-pass", "body replaces cover style");

console.log(`pdfPassStyle.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
