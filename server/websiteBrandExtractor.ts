/**
 * Extract brand color candidates from a public website (HTML/CSS/logo evidence).
 * OpenAI may classify candidates into roles; it never invents colors from a URL alone.
 */

import { safeFetch, normalizeWebsiteUrl, SsrfError } from "./ssrfGuard";
import {
  normalizeColorToken,
  normalizeHexColor,
  paletteFromCandidates,
  normalizeAiBrandPaletteResult,
  relativeLuminance,
  type ReportBrandPalette,
  type ReportBrandPaletteMeta,
} from "@shared/reportBrandTheme";

export type BrandExtractionResult = {
  palette: ReportBrandPalette;
  candidates: Array<{ hex: string; score: number; sources: string[] }>;
  meta: ReportBrandPaletteMeta;
  usedAi: boolean;
  message?: string;
};

const COLOR_IN_CSS_RE =
  /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)/gi;

const CSS_VAR_RE = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;}+{]+)/g;

function scoreColorContext(hex: string, context: string): number {
  const c = context.toLowerCase();
  let score = 1;
  if (/--(brand|primary|secondary|accent|theme|main|logo)/.test(c)) score += 8;
  if (/\b(primary|brand|accent|secondary|button|cta|header|nav|hero)\b/.test(c)) score += 5;
  if (/\b(background|bg|surface|card)\b/.test(c)) score += 2;
  if (/\b(text|foreground|muted|border)\b/.test(c)) score += 2;
  // Prefer saturated mid colors as brand; de-prioritize near-white/near-black somewhat for "primary"
  const lum = relativeLuminance(hex);
  if (lum > 0.92 || lum < 0.05) score -= 2;
  else score += 1;
  return score;
}

function collectFromCss(css: string, source: string, bag: Map<string, { score: number; sources: Set<string> }>) {
  // CSS variables first
  let m: RegExpExecArray | null;
  const varRe = new RegExp(CSS_VAR_RE);
  while ((m = varRe.exec(css))) {
    const name = m[1] || "";
    const rawVal = (m[2] || "").trim();
    const hex = normalizeColorToken(rawVal);
    if (!hex) continue;
    const entry = bag.get(hex) || { score: 0, sources: new Set<string>() };
    entry.score += scoreColorContext(hex, name + " " + source);
    entry.sources.add(source);
    bag.set(hex, entry);
  }

  const colorRe = new RegExp(COLOR_IN_CSS_RE);
  let cm: RegExpExecArray | null;
  while ((cm = colorRe.exec(css))) {
    const hex = normalizeColorToken(cm[0]);
    if (!hex) continue;
    const start = Math.max(0, (cm.index || 0) - 40);
    const snippet = css.slice(start, (cm.index || 0) + cm[0].length + 20);
    const entry = bag.get(hex) || { score: 0, sources: new Set<string>() };
    entry.score += scoreColorContext(hex, snippet + " " + source);
    entry.sources.add(source);
    bag.set(hex, entry);
  }
}

function extractStyleBlocks(html: string): string[] {
  const blocks: string[] = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRe.exec(html))) {
    if (m[1]) blocks.push(m[1]);
  }
  return blocks;
}

function extractInlineStyles(html: string): string {
  const parts: string[] = [];
  const re = /style\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) parts.push(m[1]);
  }
  return parts.join("\n");
}

function extractStylesheetHrefs(html: string, baseUrl: string): string[] {
  const hrefs: string[] = [];
  const re = /<link[^>]+rel=["'][^"']*stylesheet[^"']*["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const hrefM = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefM?.[1]) continue;
    try {
      hrefs.push(new URL(hrefM[1], baseUrl).toString());
    } catch {
      /* skip */
    }
  }
  return hrefs.slice(0, 5);
}

function extractLogoUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const imgRe = /<img[^>]+>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) {
    const tag = m[0];
    const lower = tag.toLowerCase();
    if (!/(logo|brand|header)/.test(lower)) continue;
    const srcM = tag.match(/src=["']([^"']+)["']/i);
    if (!srcM?.[1]) continue;
    try {
      urls.push(new URL(srcM[1], baseUrl).toString());
    } catch {
      /* skip */
    }
  }
  // apple-touch / icon links
  const linkRe = /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi;
  while ((m = linkRe.exec(html))) {
    const hrefM = m[0].match(/href=["']([^"']+)["']/i);
    if (!hrefM?.[1]) continue;
    try {
      urls.push(new URL(hrefM[1], baseUrl).toString());
    } catch {
      /* skip */
    }
  }
  return urls.slice(0, 3);
}

/** Sample dominant-ish colors from a small PNG/JPEG via naive pixel histogram (no sharp dependency). */
async function sampleImageColors(imageUrl: string): Promise<string[]> {
  try {
    const { body, contentType } = await safeFetch(imageUrl, {
      maxBytes: 500_000,
      timeoutMs: 8_000,
      acceptContentTypes: ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"],
    });
    if (contentType.includes("svg")) return [];
    // Without a decoder library, pull any embedded hex-like sequences is useless for binary images.
    // Prefer meta theme-color from HTML instead; skip binary sampling unless we can decode.
    void body;
    return [];
  } catch {
    return [];
  }
}

function extractThemeColorMeta(html: string): string[] {
  const out: string[] = [];
  const re = /<meta[^>]+name=["']theme-color["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const content = m[0].match(/content=["']([^"']+)["']/i);
    const hex = content?.[1] ? normalizeColorToken(content[1]) : null;
    if (hex) out.push(hex);
  }
  const ms = html.match(/<meta[^>]+name=["']msapplication-TileColor["'][^>]*content=["']([^"']+)["']/i);
  if (ms?.[1]) {
    const hex = normalizeColorToken(ms[1]);
    if (hex) out.push(hex);
  }
  return out;
}

async function classifyWithOpenAI(
  candidates: Array<{ hex: string; score: number; sources: string[] }>,
  sourceUrl: string,
): Promise<Partial<ReportBrandPalette> | null> {
  if (candidates.length < 2) return null;
  try {
    // getOpenAI is exported from routes — avoid circular import issues by dynamic import of openai client pattern
    const OpenAI = (await import("openai")).default;
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    const client = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });

    const { getChatMiniModel } = await import("./aiModels");
    const model = getChatMiniModel();

    const top = candidates.slice(0, 16);
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You classify website brand colors into report theme roles. " +
            "Only use hex colors from the provided candidates list. " +
            "Return JSON with optional keys: primary, secondary, accent, background, surface, text, mutedText, border. " +
            "Omit roles you cannot assign confidently. Do not invent new hex values.",
        },
        {
          role: "user",
          content: JSON.stringify({
            sourceUrl,
            candidates: top.map((c) => ({
              hex: c.hex,
              score: c.score,
              sources: Array.from(c.sources).slice(0, 4),
            })),
          }),
        },
      ],
    });

    const text = completion.choices[0]?.message?.content || "";
    const parsed = JSON.parse(text);
    const { palette } = normalizeAiBrandPaletteResult(
      parsed,
      top.map((c) => c.hex),
    );
    return palette;
  } catch (e) {
    console.warn("[BrandExtractor] OpenAI classify skipped:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Analyze a public website URL and return a report palette proposal (not persisted).
 */
export async function extractBrandColorsFromWebsite(
  rawUrl: string,
): Promise<BrandExtractionResult> {
  const url = normalizeWebsiteUrl(rawUrl);
  const bag = new Map<string, { score: number; sources: Set<string> }>();

  const htmlRes = await safeFetch(url.toString(), {
    maxBytes: 1_500_000,
    timeoutMs: 12_000,
    acceptContentTypes: ["text/html", "application/xhtml+xml", "text/plain"],
  });
  const html = htmlRes.body.toString("utf8");

  for (const hex of extractThemeColorMeta(html)) {
    const entry = bag.get(hex) || { score: 0, sources: new Set<string>() };
    entry.score += 10;
    entry.sources.add("meta:theme-color");
    bag.set(hex, entry);
  }

  for (const block of extractStyleBlocks(html)) {
    collectFromCss(block, "style", bag);
  }
  collectFromCss(extractInlineStyles(html), "inline", bag);

  const sheets = extractStylesheetHrefs(html, htmlRes.url);
  for (const sheetUrl of sheets) {
    try {
      const cssRes = await safeFetch(sheetUrl, {
        maxBytes: 800_000,
        timeoutMs: 10_000,
        acceptContentTypes: ["text/css", "text/plain"],
      });
      collectFromCss(cssRes.body.toString("utf8"), "stylesheet", bag);
    } catch {
      /* skip inaccessible sheets */
    }
  }

  // Logo URLs reserved for future decoder; meta/theme already covered
  void extractLogoUrls;
  void sampleImageColors;

  const ranked = Array.from(bag.entries())
    .map(([hex, v]) => ({
      hex,
      score: v.score,
      sources: Array.from(v.sources),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 24);

  let usedAi = false;
  let aiPartial: Partial<ReportBrandPalette> | undefined;
  let message: string | undefined;

  if (ranked.length >= 2) {
    // Prefer AI when we have enough evidence but roles are ambiguous
    const needsAi = ranked.length >= 3 || ranked[0]!.score < 8;
    if (needsAi) {
      const classified = await classifyWithOpenAI(ranked, htmlRes.url);
      if (classified && Object.keys(classified).length > 0) {
        aiPartial = classified;
        usedAi = true;
      } else {
        message = "AI classification unavailable; using CSS evidence only.";
      }
    }
  } else {
    message =
      "Few brand colors were found on this website. Please adjust the palette manually.";
  }

  const { palette, status } = paletteFromCandidates(
    ranked.map((r) => r.hex),
    aiPartial,
  );

  return {
    palette,
    candidates: ranked,
    usedAi,
    message,
    meta: {
      sourceUrl: htmlRes.url,
      extractedAt: new Date().toISOString(),
      extractionStatus: ranked.length < 2 ? "partial" : status,
      appliedAt: null,
    },
  };
}

export { SsrfError, normalizeWebsiteUrl };
