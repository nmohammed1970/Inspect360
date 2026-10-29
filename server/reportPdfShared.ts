/**
 * Shared landscape report chrome (Portfolio + Property History).
 * Keep CSS/table helpers identical so both reports look like one system.
 */

import fs from "fs/promises";
import { PDFDocument } from "pdf-lib";
import { ObjectStorageService } from "./objectStorage";
import { formatCurrency } from "@shared/countryUtils";
import { resolveReportLogoUrl, REPORT_LOGO_ON_DARK, REPORT_LOGO_ON_LIGHT } from "./reportLogo";
import {
  resolveReportTheme,
  type ReportTheme,
  type OrgBrandThemeSource,
  DEFAULT_REPORT_PALETTE,
} from "@shared/reportBrandTheme";

export type LandscapeReportBranding = {
  logoUrl?: string | null;
  brandingName?: string | null;
  brandingEmail?: string | null;
  brandingPhone?: string | null;
  brandingWebsite?: string | null;
  brandingPrimaryColor?: string | null;
  brandingReportPalette?: OrgBrandThemeSource["brandingReportPalette"];
};

export { resolveReportTheme };
export type { ReportTheme };

/** Replace Inspect360 default teal hexes in HTML/CSS with the org report theme. */
export function applyBrandThemeToHtml(html: string, theme?: ReportTheme | null): string {
  const t = theme || resolveReportTheme(null);
  return html
    .replace(/#00D5CC/gi, t.primary)
    .replace(/#3B7A8C/gi, t.secondary)
    .replace(/#04C6BD/gi, t.primary)
    .replace(/#f0fdfa/gi, t.surface || DEFAULT_REPORT_PALETTE.surface);
}

export function themeFromOrgBranding(
  branding?: LandscapeReportBranding | OrgBrandThemeSource | null,
): ReportTheme {
  return resolveReportTheme(branding || null);
}

export function escapeHtml(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sanitizeReportUrl(url: string, baseUrl?: string): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  const safeData = ["data:image/png", "data:image/jpeg", "data:image/jpg", "data:image/gif", "data:image/webp"];
  if (safeData.some((p) => lower.startsWith(p))) return trimmed;
  if (trimmed.startsWith("/") && baseUrl) {
    return escapeHtml(`${baseUrl}${trimmed}`);
  }
  const safeProtocols = ["https://", "http://"];
  if (!safeProtocols.some((p) => lower.startsWith(p))) {
    return "";
  }
  return escapeHtml(trimmed);
}

const SAFE_DATA_IMAGE_PREFIXES = [
  "data:image/png",
  "data:image/jpeg",
  "data:image/jpg",
  "data:image/gif",
  "data:image/webp",
];

function mimeFromUrlExt(url: string): string {
  const ext = url.split(".").pop()?.toLowerCase()?.split("?")[0] || "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/png";
}

/**
 * Convert a report image URL to a data URL for Puppeteer embedding.
 * Unlike logoToDataUrl, does NOT fall back to the Inspect360 logo when missing.
 */
export async function resolveReportImageToDataUrl(
  imageUrl?: string | null,
  baseUrl?: string,
): Promise<string | null> {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (SAFE_DATA_IMAGE_PREFIXES.some((p) => lower.startsWith(p))) {
    return trimmed;
  }

  // Reject unsafe schemes (javascript:, etc.)
  if (
    !trimmed.startsWith("/") &&
    !lower.startsWith("https://") &&
    !lower.startsWith("http://")
  ) {
    return null;
  }

  try {
    if (trimmed.startsWith("/objects/")) {
      const objectStorageService = new ObjectStorageService();
      const file = await objectStorageService.getObjectEntityFile(trimmed);
      const buf = await fs.readFile(file.name);
      return `data:${mimeFromUrlExt(trimmed)};base64,${buf.toString("base64")}`;
    }

    let absoluteUrl = trimmed;
    if (trimmed.startsWith("/") && baseUrl) {
      absoluteUrl = `${baseUrl}${trimmed}`;
    } else if (trimmed.startsWith("/") && !baseUrl) {
      return null;
    }

    const response = await fetch(absoluteUrl, { headers: { Accept: "image/*" } });
    if (!response.ok) {
      console.warn(`[Report PDF] Image fetch failed (${response.status}): ${absoluteUrl.substring(0, 120)}`);
      return null;
    }
    const contentType = response.headers.get("content-type") || mimeFromUrlExt(trimmed);
    if (!contentType.toLowerCase().startsWith("image/")) {
      console.warn(`[Report PDF] Non-image content-type for cover image: ${contentType}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return `data:${contentType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
  } catch (error) {
    console.warn("[Report PDF] Cover image conversion failed:", error);
    return null;
  }
}

/** Prefer property cover image; fall back to block cover for block-scoped reports. */
export async function resolvePropertyOrBlockCoverDataUrl(
  opts: {
    property?: { imageUrl?: string | null } | null;
    block?: { imageUrl?: string | null } | null;
  },
  baseUrl?: string,
): Promise<string | null> {
  const propertyUrl = opts.property?.imageUrl?.trim();
  if (propertyUrl) {
    const data = await resolveReportImageToDataUrl(propertyUrl, baseUrl);
    if (data) return data;
  }
  const blockUrl = opts.block?.imageUrl?.trim();
  if (blockUrl) {
    return resolveReportImageToDataUrl(blockUrl, baseUrl);
  }
  return null;
}

/** Empty string when no image — never renders a broken/empty frame. */
export function renderCoverSubjectImageHtml(
  dataUrl: string | null | undefined,
  alt = "Property",
): string {
  if (!dataUrl || typeof dataUrl !== "string") return "";
  const trimmed = dataUrl.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (!SAFE_DATA_IMAGE_PREFIXES.some((p) => lower.startsWith(p))) {
    return "";
  }
  return `<div class="cover-subject-image-wrap"><img class="cover-subject-image" src="${trimmed}" alt="${escapeHtml(alt)}" /></div>`;
}

/** CSS snippet for property/block cover photos (append where sharedCss is not used). */
export function coverSubjectImageCss(): string {
  return `
    .cover-subject-image-wrap {
      margin: 14px auto 16px;
      width: 145mm;
      max-width: 85%;
      position: relative;
      z-index: 1;
      flex-shrink: 0;
    }
    .cover-subject-image {
      width: 100%;
      height: 80mm;
      max-height: 80mm;
      object-fit: cover;
      border-radius: 10px;
      border: 2px solid rgba(255, 255, 255, 0.35);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      display: block;
    }
  `;
}

/** White-cover photo styling (no white border; matches print mock). */
export function whiteCoverSubjectImageCss(): string {
  return `
    .cover-subject-image-wrap {
      margin: 18px auto 16px;
      width: 150mm;
      max-width: 82%;
      position: relative;
      z-index: 1;
      flex-shrink: 0;
    }
    .cover-subject-image {
      width: 100%;
      height: 78mm;
      max-height: 78mm;
      object-fit: cover;
      border-radius: 2px;
      border: 1px solid #e5e7eb;
      box-shadow: none;
      display: block;
    }
  `;
}

export type CoverMetaRow = { label: string; value: string };

/** White cover page CSS — accents from org branding theme. */
export function whiteCoverCss(themeInput?: ReportTheme | OrgBrandThemeSource | null): string {
  const theme =
    themeInput && "primary" in themeInput && "primaryDark" in themeInput
      ? (themeInput as ReportTheme)
      : resolveReportTheme((themeInput as OrgBrandThemeSource) || null);
  const primary = theme.primary;
  const text = theme.text || "#111827";
  const muted = theme.mutedText || "#6b7280";
  return `
    @page {
      /* Margins come from page.pdf options (cover = 0, body = chrome room) */
      margin: 0;
      background: #ffffff;
    }
    @page :first {
      margin: 0;
      background: #ffffff;
    }
    html, body {
      background: #ffffff !important;
    }
    .cover-page {
      min-height: 100vh;
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: center;
      text-align: center;
      background: #ffffff !important;
      color: ${text};
      page-break-after: always;
      position: relative;
      overflow: hidden;
      box-sizing: border-box;
      padding: 28mm 18mm 22mm;
    }
    .cover-page::before,
    .cover-page::after { display: none; }
    .cover-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      flex: 1;
    }
    .cover-logo-container {
      margin-bottom: 28px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .cover-logo-img {
      max-height: 96px;
      max-width: 220px;
      width: auto;
      height: auto;
      object-fit: contain;
      margin-top: 0;
      background: transparent;
      filter: none;
    }
    .cover-logo-text,
    .cover-company-name {
      font-size: 22px;
      font-weight: 700;
      color: ${primary};
      letter-spacing: 0.5px;
    }
    .cover-title {
      font-size: 28px;
      font-weight: 700;
      margin: 0 0 8px;
      letter-spacing: 0.2px;
      color: ${primary};
    }
    .cover-subtitle {
      font-size: 15px;
      font-weight: 400;
      margin-bottom: 8px;
      color: ${muted};
      max-width: 90%;
    }
    .cover-address {
      font-size: 18px;
      font-weight: 700;
      color: ${primary};
      margin: 8px 0 20px;
      max-width: 90%;
      line-height: 1.35;
    }
    .cover-meta-table {
      width: 72%;
      max-width: 420px;
      margin: 8px auto 0;
      border-collapse: collapse;
      text-align: left;
    }
    .cover-meta-table tr {
      border-top: 1px solid ${primary};
    }
    .cover-meta-table tr:last-child {
      border-bottom: 1px solid ${primary};
    }
    .cover-meta-table td {
      padding: 10px 4px;
      font-size: 13px;
      vertical-align: middle;
      border: none;
    }
    .cover-meta-table td.meta-label {
      font-weight: 700;
      color: ${primary};
      width: 48%;
    }
    .cover-meta-table td.meta-value {
      font-weight: 400;
      color: ${text};
      text-align: right;
    }
    .cover-bottom-bar {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 14mm;
      background: ${primary};
      z-index: 2;
    }
    .cover-contact { display: none; }
    ${whiteCoverSubjectImageCss()}
  `;
}

export function buildWhiteCoverHtml(params: {
  logoHtml: string;
  title: string;
  subjectImageHtml?: string;
  address?: string | null;
  metaRows?: CoverMetaRow[];
  subtitle?: string | null;
}): string {
  const metaRows = (params.metaRows || []).filter((r) => (r.label || "").trim() && (r.value || "").trim());
  const metaTable =
    metaRows.length > 0
      ? `<table class="cover-meta-table"><tbody>${metaRows
          .map(
            (r) =>
              `<tr><td class="meta-label">${escapeHtml(r.label)}</td><td class="meta-value">${escapeHtml(r.value)}</td></tr>`,
          )
          .join("")}</tbody></table>`
      : "";
  const addressHtml = params.address?.trim()
    ? `<div class="cover-address">${escapeHtml(params.address.trim())}</div>`
    : "";
  const subtitleHtml = params.subtitle?.trim()
    ? `<div class="cover-subtitle">${escapeHtml(params.subtitle.trim())}</div>`
    : "";
  return `
  <div class="cover-page">
    <div class="cover-content">
      <div class="cover-logo-container">${params.logoHtml || ""}</div>
      <div class="cover-title">${escapeHtml(params.title)}</div>
      ${subtitleHtml}
      ${params.subjectImageHtml || ""}
      ${addressHtml}
      ${metaTable}
    </div>
    <div class="cover-bottom-bar"></div>
  </div>`;
}

/** Reserved vertical bands for repeating chrome (must match pdfPageOptionsWithChrome margins). */
export const PDF_CHROME_MARGIN = {
  top: "26mm",
  right: "12mm",
  bottom: "22mm",
  left: "12mm",
} as const;

export function buildPdfHeaderTemplate(params: {
  logoDataUrl?: string | null;
  theme?: ReportTheme | null;
}): string {
  const theme = params.theme || resolveReportTheme(null);
  const primary = theme.primary;
  const logo = params.logoDataUrl?.trim();
  const logoHtml = logo
    ? `<img src="${logo.replace(/"/g, "&quot;")}" style="height:20px;width:auto;max-width:70px;object-fit:contain;display:block;" />`
    : "";
  // Compact right-aligned chrome. Lives only in the top margin band — never in content.
  return `
<div style="width:100%;font-size:9px;padding:6px 12mm 8px;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
  <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;min-height:22px;width:100%;">
    <div style="flex:1;border-top:1.5px solid ${primary};"></div>
    <div style="flex:0 0 auto;display:flex;align-items:center;">${logoHtml}</div>
  </div>
</div>`;
}

export function buildPdfFooterTemplate(params: {
  address?: string | null;
  propertyName?: string | null;
  theme?: ReportTheme | null;
}): string {
  const theme = params.theme || resolveReportTheme(null);
  const primary = theme.primary;
  const left = escapeHtml((params.address || "").trim());
  const right = escapeHtml((params.propertyName || "").trim());
  return `
<div style="width:100%;font-size:8px;padding:8px 12mm 6px;box-sizing:border-box;color:${primary};font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
  <div style="border-top:1px solid ${primary};padding-top:6px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
    <span style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${left}</span>
    <span style="flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${right}</span>
  </div>
</div>`;
}

export type PdfChromeOptions = {
  landscape?: boolean;
  format?: "A4" | "Letter";
  theme?: ReportTheme | null;
  address?: string | null;
  propertyName?: string | null;
  logoDataUrl?: string | null;
  /** When false, skip repeating header/footer (rare). Default true. */
  displayHeaderFooter?: boolean;
};

/** Shared Puppeteer page.pdf options with branded header/footer chrome. */
export function pdfPageOptionsWithChrome(opts: PdfChromeOptions = {}) {
  const theme = opts.theme || resolveReportTheme(null);
  const showChrome = opts.displayHeaderFooter !== false;
  return {
    format: opts.format || ("A4" as const),
    landscape: !!opts.landscape,
    printBackground: true,
    // When chrome is on, ignore @page { margin: 0 } from cover CSS — otherwise content
    // paints under the header/footer and overlaps logo/address. Cover pass keeps CSS page size.
    preferCSSPageSize: !showChrome,
    displayHeaderFooter: showChrome,
    headerTemplate: showChrome
      ? buildPdfHeaderTemplate({ logoDataUrl: opts.logoDataUrl, theme })
      : "<div></div>",
    footerTemplate: showChrome
      ? buildPdfFooterTemplate({
          address: opts.address,
          propertyName: opts.propertyName,
          theme,
        })
      : "<div></div>",
    margin: showChrome
      ? { ...PDF_CHROME_MARGIN }
      : { top: "0", right: "0", bottom: "0", left: "0" },
  };
}

export async function mergePdfBuffers(parts: Array<Buffer | Uint8Array>): Promise<Buffer> {
  const out = await PDFDocument.create();
  for (const part of parts) {
    if (!part || part.length === 0) continue;
    const doc = await PDFDocument.load(part);
    const pages = await out.copyPages(doc, doc.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return Buffer.from(await out.save());
}

/** Hide everything after the white cover (siblings of .cover-page). */
const PDF_COVER_ONLY_STYLE = `<style id="pdf-cover-only-pass">
  .cover-page ~ *,
  .container > .cover-page ~ * { display: none !important; }
</style>`;

/**
 * Hide the white cover so body pages start at page 1 of this pass.
 * Also force @page margins that clear repeating header/footer (cover CSS sets margin: 0).
 */
const PDF_BODY_ONLY_STYLE = `<style id="pdf-body-only-pass">
  .cover-page { display: none !important; }
  @page {
    margin: ${PDF_CHROME_MARGIN.top} ${PDF_CHROME_MARGIN.right} ${PDF_CHROME_MARGIN.bottom} ${PDF_CHROME_MARGIN.left} !important;
    background: #ffffff;
  }
  @page :first {
    margin: ${PDF_CHROME_MARGIN.top} ${PDF_CHROME_MARGIN.right} ${PDF_CHROME_MARGIN.bottom} ${PDF_CHROME_MARGIN.left} !important;
    background: #ffffff;
  }
</style>`;

function injectPdfPassStyle(html: string, styleTag: string): string {
  if (html.includes("</head>")) {
    return html.replace("</head>", `${styleTag}</head>`);
  }
  return `${styleTag}${html}`;
}

type PuppeteerPageLike = {
  setContent: (
    html: string,
    options?: { waitUntil?: "domcontentloaded" | "load" | "networkidle0"; timeout?: number },
  ) => Promise<void>;
  pdf: (options: Record<string, unknown>) => Promise<Uint8Array>;
  evaluate?: (fn: (...args: any[]) => Promise<void> | void, ...args: any[]) => Promise<unknown>;
};

/** Stable TOC key → first page where that section starts (1-based in the PDF being scanned). */
export const TOC_MARKER_PREFIX = "<<I360TOC:";
export const TOC_MARKER_SUFFIX = ">>";
/** Allow Chromium/pdf.js to insert spaces between characters when extracting. */
const TOC_MARKER_RE = /<\s*<\s*I\s*3\s*6\s*0\s*T\s*O\s*C\s*:\s*([A-Za-z0-9_-]+)\s*>\s*>/gi;

export function sanitizeTocKey(key: string): string {
  return String(key || "")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80) || "section";
}

/**
 * Marker placed inside section titles (white on primary banner = invisible).
 * Normal font size so Chromium keeps it in the PDF text layer.
 */
export function tocAnchorHtml(key: string): string {
  const safe = sanitizeTocKey(key);
  return `<span class="toc-anchor" data-toc-anchor="${safe}" aria-hidden="true" style="font-size:8px;line-height:1;color:#ffffff;font-weight:400;letter-spacing:0;margin-right:4px;">${TOC_MARKER_PREFIX}${safe}${TOC_MARKER_SUFFIX}</span>`;
}

/** Right-side Contents page slot filled after draft PDF measurement. */
export function tocPageSlotHtml(key: string): string {
  const safe = sanitizeTocKey(key);
  return `<span class="toc-page" data-toc-page="${safe}" style="flex:0 0 auto;font-variant-numeric:tabular-nums;font-weight:600;min-width:1.5em;text-align:right;">—</span>`;
}

export type TocContentsEntry = { key: string; label: string };

/** Map first occurrence of each TOC marker to its page number (1-based). */
export function extractTocMarkerPagesFromPageTexts(
  pages: Array<{ num: number; text: string }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const page of pages) {
    const text = page.text || "";
    TOC_MARKER_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TOC_MARKER_RE.exec(text)) !== null) {
      const key = match[1];
      if (out[key] == null) out[key] = page.num;
    }
  }
  return out;
}

/**
 * Fallback when markers are stripped: find each Contents label after the Contents page
 * (so the TOC list itself is not matched as the section start).
 */
export function extractTocPagesByLabels(
  pages: Array<{ num: number; text: string }>,
  entries: TocContentsEntry[],
): Record<string, number> {
  if (!entries.length) return {};
  const normalized = pages.map((p) => ({
    num: p.num,
    text: (p.text || "").replace(/\s+/g, " "),
  }));

  let contentsPage = 0;
  for (const page of normalized) {
    const lower = page.text.toLowerCase();
    if (!/\bcontents\b/i.test(page.text)) continue;
    const hits = entries.filter((e) => e.label && lower.includes(e.label.toLowerCase())).length;
    if (hits >= Math.min(2, entries.length)) {
      contentsPage = page.num;
      break;
    }
  }

  const out: Record<string, number> = {};
  for (const { key, label } of entries) {
    const needle = (label || "").trim().toLowerCase();
    if (!needle || !key) continue;
    for (const page of normalized) {
      if (page.num <= contentsPage) continue;
      if (page.text.toLowerCase().includes(needle)) {
        out[key] = page.num;
        break;
      }
    }
  }
  return out;
}

/** Cap TOC text extraction so photo-heavy PDFs cannot hang report generation. */
const TOC_PARSE_TIMEOUT_MS = 12_000;
const TOC_MAX_PDF_BYTES = 12 * 1024 * 1024; // skip parse above ~12MB

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function getPdfPageTexts(
  pdfBuffer: Buffer,
): Promise<Array<{ num: number; text: string }>> {
  let parser: {
    getText: () => Promise<{ pages?: Array<{ num: number; text: string }>; text?: string; total?: number }>;
    destroy: () => Promise<void>;
  } | null = null;
  try {
    const { PDFParse } = await import("pdf-parse");
    parser = new PDFParse({ data: pdfBuffer });
    const result = await withTimeout(parser.getText(), TOC_PARSE_TIMEOUT_MS, "TOC pdf-parse");
    if (result.pages && result.pages.length > 0) return result.pages;
    // Some builds only populate the concatenated text — split on form feeds if present
    const full = result.text || "";
    if (!full) return [];
    const chunks = full.includes("\f") ? full.split("\f") : [full];
    return chunks.map((text, i) => ({ num: i + 1, text }));
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
}

export async function findTocMarkerPagesInPdf(pdfBuffer: Buffer): Promise<Record<string, number>> {
  try {
    const pages = await getPdfPageTexts(pdfBuffer);
    return extractTocMarkerPagesFromPageTexts(pages);
  } catch (err) {
    console.warn("[PDF] TOC marker scan failed; Contents page numbers left blank:", err);
    return {};
  }
}

export async function resolveTocPagesFromPdf(
  pdfBuffer: Buffer,
  entries: TocContentsEntry[],
): Promise<Record<string, number>> {
  try {
    if (pdfBuffer.length > TOC_MAX_PDF_BYTES) {
      console.warn(
        `[PDF] Skipping TOC page parse — draft PDF is ${(pdfBuffer.length / (1024 * 1024)).toFixed(1)}MB (limit ${TOC_MAX_PDF_BYTES / (1024 * 1024)}MB)`,
      );
      return {};
    }
    const pages = await getPdfPageTexts(pdfBuffer);
    const byMarker = extractTocMarkerPagesFromPageTexts(pages);
    const missing = entries.filter((e) => byMarker[e.key] == null);
    if (missing.length === 0) return byMarker;
    const byLabel = extractTocPagesByLabels(pages, missing.length === entries.length ? entries : missing);
    return { ...byLabel, ...byMarker };
  } catch (err) {
    console.warn("[PDF] TOC page resolve failed:", err);
    return {};
  }
}

export type BrandedPdfRenderOptions = {
  /**
   * Measure section markers from a draft body PDF, fill Contents page numbers in the
   * live DOM, then print the body once more (cover is not regenerated).
   */
  fillTocPageNumbers?: boolean;
};

/**
 * Render report HTML to PDF. When a white cover is present, page 1 is generated
 * without header/footer; remaining pages get branded chrome.
 */
export async function renderHtmlToBrandedPdf(
  page: PuppeteerPageLike,
  html: string,
  chromeOpts: PdfChromeOptions = {},
  renderOpts: BrandedPdfRenderOptions = {},
): Promise<Buffer> {
  const hasCover = /class=["']cover-page["']/.test(html);
  const fillToc = !!renderOpts.fillTocPageNumbers && /data-toc-page=/.test(html);

  const settleImages = async () => {
    if (!page.evaluate) return;
    try {
      await Promise.race([
        page.evaluate(async () => {
          const images = Array.from(document.images);
          await Promise.all(
            images.map(
              (img) =>
                img.complete
                  ? Promise.resolve()
                  : new Promise<void>((resolve) => {
                      img.addEventListener("load", () => resolve(), { once: true });
                      img.addEventListener("error", () => resolve(), { once: true });
                    }),
            ),
          );
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 45_000)),
      ]);
    } catch (err) {
      console.warn("[PDF] Image settle wait failed; continuing:", err);
    }
  };

  const loadHtml = async (documentHtml: string) => {
    await page.setContent(documentHtml, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await settleImages();
  };

  const fillTocSlotsFromBodyPdf = async (bodyPdf: Buffer, coverPageOffset: number) => {
    if (!fillToc || !page.evaluate) return false;
    try {
      const entries = (await page.evaluate(() => {
        return Array.from(document.querySelectorAll("[data-toc-page]")).map((el) => {
          const key = el.getAttribute("data-toc-page") || "";
          const li = el.closest("li");
          // Avoid :scope (not always available); take direct child spans only.
          const spans = li
            ? Array.from(li.children).filter((node) => node.tagName === "SPAN")
            : [];
          // [index, label, leader, pageSlot]
          const label = ((spans[1] as HTMLElement | undefined)?.textContent || "").trim();
          return { key, label };
        });
      })) as TocContentsEntry[];

      const bodyPages = await resolveTocPagesFromPdf(bodyPdf, entries);
      const keys = Object.keys(bodyPages);
      if (keys.length === 0) {
        console.warn(
          "[PDF] No TOC page numbers resolved from draft body PDF; leaving Contents pages as —",
          { entryCount: entries.length, draftBytes: bodyPdf.length },
        );
        return false;
      }
      const finalMap: Record<string, number> = {};
      for (const key of keys) {
        finalMap[key] = bodyPages[key] + coverPageOffset;
      }
      await page.evaluate((pageMap: Record<string, number>) => {
        for (const [key, num] of Object.entries(pageMap)) {
          const nodes = document.querySelectorAll(`[data-toc-page="${key}"]`);
          nodes.forEach((el) => {
            el.textContent = String(num);
          });
        }
      }, finalMap);
      console.log(
        `[PDF] Filled ${keys.length}/${entries.length} Contents page number(s) (cover offset ${coverPageOffset})`,
      );
      return true;
    } catch (err) {
      // Never fail the whole PDF over Contents page numbers.
      console.warn("[PDF] TOC fill skipped due to error; returning draft body PDF:", err);
      return false;
    }
  };

  if (!hasCover) {
    await loadHtml(html);
    const pdfOpts = pdfPageOptionsWithChrome({
      ...chromeOpts,
      displayHeaderFooter: chromeOpts.displayHeaderFooter !== false,
    });
    let pdf = Buffer.from(await page.pdf(pdfOpts));
    if (await fillTocSlotsFromBodyPdf(pdf, 0)) {
      pdf = Buffer.from(await page.pdf(pdfOpts));
    }
    return pdf;
  }

  // Pass 1: cover only, no repeating chrome
  await loadHtml(injectPdfPassStyle(html, PDF_COVER_ONLY_STYLE));
  const coverPdf = Buffer.from(
    await page.pdf(
      pdfPageOptionsWithChrome({
        ...chromeOpts,
        displayHeaderFooter: false,
      }),
    ),
  );
  const coverPageCount = (await PDFDocument.load(coverPdf)).getPageCount();

  // Pass 2: body pages with header/footer
  await loadHtml(injectPdfPassStyle(html, PDF_BODY_ONLY_STYLE));
  const bodyPdfOpts = pdfPageOptionsWithChrome({
    ...chromeOpts,
    displayHeaderFooter: true,
  });
  let bodyPdf = Buffer.from(await page.pdf(bodyPdfOpts));

  // Efficient TOC fill: patch live DOM, reprint body only (cover reused)
  if (await fillTocSlotsFromBodyPdf(bodyPdf, coverPageCount)) {
    bodyPdf = Buffer.from(await page.pdf(bodyPdfOpts));
  }

  return mergePdfBuffers([coverPdf, bodyPdf]);
}

export async function logoToDataUrl(
  logoUrl?: string | null,
  baseUrl?: string,
  variant: "on-dark" | "on-light" = "on-dark",
): Promise<string | null> {
  const url = resolveReportLogoUrl(logoUrl, variant);
  if (url.startsWith("data:")) return url;

  try {
    if (url === REPORT_LOGO_ON_DARK || url === REPORT_LOGO_ON_LIGHT || url === "/logoUrl.png") {
      const fileName = url.replace(/^\//, "");
      const filePath = `${process.cwd()}/client/public/${fileName}`;
      const buf = await fs.readFile(filePath);
      return `data:image/png;base64,${buf.toString("base64")}`;
    }

    if (url.startsWith("/objects/")) {
      const objectStorageService = new ObjectStorageService();
      const logoFile = await objectStorageService.getObjectEntityFile(url);
      const buf = await fs.readFile(logoFile.name);
      return `data:${mimeFromUrlExt(url)};base64,${buf.toString("base64")}`;
    }

    let absoluteUrl = url;
    if (url.startsWith("/") && baseUrl) {
      absoluteUrl = `${baseUrl}${url}`;
    }
    const response = await fetch(absoluteUrl, { headers: { Accept: "image/*" } });
    if (!response.ok) {
      if (logoUrl) {
        return logoToDataUrl(null, baseUrl, variant);
      }
      return null;
    }
    const contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    return `data:${contentType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
  } catch (error) {
    console.warn("[Report PDF] Logo conversion failed:", error);
    if (logoUrl) {
      try {
        return await logoToDataUrl(null, baseUrl, variant);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function formatDate(value: any): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

export function formatMoney(value: unknown, currency: "GBP" | "USD" | "AED"): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(num)) return "—";
  return formatCurrency(num, currency, false);
}

/** Work-order costs are stored in cents. */
export function formatMoneyCents(value: unknown, currency: "GBP" | "USD" | "AED"): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "number" ? value : parseInt(String(value), 10);
  if (Number.isNaN(num)) return "—";
  return formatCurrency(num, currency, true);
}

/**
 * Section heading banner used across all PDF reports.
 * Left-aligned and shrink-to-text (not full page width) so it never collides with the chrome logo.
 * Background = branding primary; white all-caps type (medium weight, no shadow).
 */
export function sectionHeadingBannerCss(primary: string): string {
  const bg = primary || DEFAULT_REPORT_PALETTE.primary;
  return `
    .section-title,
    .report-section-title,
    h2.section-title,
    h2.report-section-title {
      display: inline-block;
      width: auto;
      max-width: calc(100% - 90px);
      box-sizing: border-box;
      margin: 0 0 18px 0;
      padding: 8px 16px;
      background: ${bg} !important;
      color: #ffffff !important;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.08em;
      line-height: 1.2;
      text-transform: uppercase;
      text-align: left;
      border: none !important;
      border-bottom: none !important;
      border-radius: 4px;
      text-shadow: none;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      position: relative;
      float: none;
      clear: both;
      break-after: avoid;
      page-break-after: avoid;
    }
    .section-title::before,
    .section-title::after,
    .report-section-title::before,
    .report-section-title::after {
      content: none !important;
      display: none !important;
    }
  `;
}

export function sharedCss(themeInput?: ReportTheme | OrgBrandThemeSource | null): string {
  const theme = themeInput && "primary" in themeInput && "primaryDark" in themeInput
    ? (themeInput as ReportTheme)
    : resolveReportTheme((themeInput as OrgBrandThemeSource) || null);
  const primary = theme.primary;
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      color: ${theme.text || "#333"};
      /* Print canvas stays white — brand accents apply to text/rules/tables only */
      background: #ffffff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    ${whiteCoverCss(theme)}
    .page {
      padding: 8px 0 16px;
      background: transparent;
      page-break-after: auto;
      break-after: auto;
    }
    /* Each major report section starts on its own page (cover already breaks after itself) */
    .page + .page {
      page-break-before: always;
      break-before: page;
      margin-top: 0;
      padding-top: 8px;
      border-top: none;
    }
    ${sectionHeadingBannerCss(primary)}
    /* Safety: if a section title appears mid-flow without a .page wrapper, still break */
    .page .section-title {
      break-before: avoid;
      page-break-before: avoid;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 18px;
      margin-bottom: 28px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .stats-grid.cols-6 {
      grid-template-columns: repeat(6, 1fr);
    }
    .stat-card {
      background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    thead { display: table-header-group; }
    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .stat-value {
      font-size: 32px;
      font-weight: 700;
      color: ${primary};
      margin-bottom: 8px;
    }
    .stat-label {
      font-size: 14px;
      color: #666;
    }
    .info-row {
      margin-bottom: 8px;
      font-size: 14px;
    }
    .info-row strong { color: #1a1a1a; }
    table {
      width: 100%;
      max-width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      margin-bottom: 24px;
      border: 2px solid ${primary};
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      background: white;
    }
    th {
      background: ${primary};
      color: white;
      padding: 10px 8px;
      text-align: center;
      font-weight: 700;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      border-right: 1px solid rgba(255, 255, 255, 0.2);
      word-break: break-word;
      vertical-align: middle;
    }
    th:last-child { border-right: none; }
    td {
      padding: 10px 8px;
      border-bottom: 1px solid #e5e7eb;
      border-right: 1px solid #e5e7eb;
      font-size: 11px;
      vertical-align: middle;
      word-break: break-word;
      overflow-wrap: anywhere;
      text-align: left;
    }
    td:last-child { border-right: none; }
    td.align-center, th.align-center { text-align: center; }
    td.align-right, th.align-right { text-align: right; }
    td.align-left, th.align-left { text-align: left; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    tbody tr:hover { background: #f0fdfa; }
    .cell-title { font-weight: 600; color: #1a1a1a; }
    .cell-sub { font-size: 10px; color: #666; margin-top: 2px; line-height: 1.35; }
    .page.compact { padding: 28px 24px; }
    .empty { color: #666; font-style: italic; padding: 12px 0; font-size: 14px; text-align: center; }
    .badge {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 16px;
      font-size: 10px;
      font-weight: 700;
      border: 1px solid transparent;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .badge-danger {
      background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
      color: #991b1b;
      border-color: #fca5a5;
    }
    .badge-warning {
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      color: #92400e;
      border-color: #fcd34d;
    }
    .badge-success {
      background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
      color: #166534;
      border-color: #86efac;
    }
    .badge-info {
      background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
      color: #075985;
      border-color: #7dd3fc;
    }
  `;
}

export function stackedCell(title: string, subtitle?: string): string {
  const main = `<div class="cell-title">${escapeHtml(title || "—")}</div>`;
  if (!subtitle?.trim()) return main;
  return `${main}<div class="cell-sub">${escapeHtml(subtitle)}</div>`;
}

export function renderTable(
  headers: string[],
  rows: string[][],
  emptyMessage: string,
  aligns?: Array<"left" | "center" | "right">
): string {
  if (rows.length === 0) {
    return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
  }
  const alignClass = (i: number) => {
    const a = aligns?.[i] || "left";
    return `align-${a}`;
  };
  return `
    <table>
      <thead>
        <tr>${headers.map((h, i) => `<th class="${alignClass(i)}">${escapeHtml(h)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (cells) =>
              `<tr>${cells.map((c, i) => `<td class="${alignClass(i)}">${c}</td>`).join("")}</tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

export function statusBadge(status: string, kind?: "success" | "warning" | "danger" | "info"): string {
  const cls = kind || "info";
  return `<span class="badge badge-${cls}">${escapeHtml(status || "")}</span>`;
}

function looksLikeEmail(value?: string | null): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

export function resolveCompanyDisplayName(
  organizationName?: string | null,
  brandingName?: string | null
): string {
  const branding = brandingName?.trim();
  const org = organizationName?.trim();
  if (branding && !looksLikeEmail(branding)) return branding;
  if (org && !looksLikeEmail(org)) return org;
  if (branding) return branding;
  return "Inspect360";
}

export async function buildCoverChrome(params: {
  organizationName: string;
  branding?: LandscapeReportBranding;
  baseUrl?: string;
  /** White covers use on-light logo; legacy gradient covers used on-dark. */
  logoVariant?: "on-dark" | "on-light";
}): Promise<{
  displayName: string;
  companyNameHtml: string;
  logoHtml: string;
  contactInfoHtml: string;
  logoDataUrl: string | null;
}> {
  const displayName = resolveCompanyDisplayName(params.organizationName, params.branding?.brandingName);
  const logoDataUrl = await logoToDataUrl(
    params.branding?.logoUrl,
    params.baseUrl,
    params.logoVariant || "on-light",
  );
  const companyNameHtml = `<div class="cover-company-name">${escapeHtml(displayName)}</div>`;
  const logoHtml = logoDataUrl
    ? `<img src="${sanitizeReportUrl(logoDataUrl)}" alt="${escapeHtml(displayName)}" class="cover-logo-img" />`
    : companyNameHtml;
  const contactParts: string[] = [];
  if (params.branding?.brandingEmail) contactParts.push(escapeHtml(params.branding.brandingEmail));
  if (params.branding?.brandingPhone) contactParts.push(escapeHtml(params.branding.brandingPhone));
  if (params.branding?.brandingWebsite) contactParts.push(escapeHtml(params.branding.brandingWebsite));
  const contactInfoHtml =
    contactParts.length > 0
      ? `<div class="cover-contact">${contactParts.join(" &nbsp;|&nbsp; ")}</div>`
      : "";
  return { displayName, companyNameHtml, logoHtml, contactInfoHtml, logoDataUrl };
}
