/**
 * Organization report brand theme: defaults, hex validation, AI normalize,
 * and resolveReportTheme used by PDF generators.
 */

export type ReportBrandPalette = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  border: string;
  /** Optional; default Inspect360 semantic colors kept unless set */
  success?: string;
  warning?: string;
  danger?: string;
};

export type ReportBrandPaletteMeta = {
  sourceUrl?: string | null;
  extractedAt?: string | null;
  extractionStatus?: "ok" | "partial" | "failed" | "manual" | "default" | null;
  appliedAt?: string | null;
};

export type ReportTheme = ReportBrandPalette & {
  /** Darker end of cover gradient, derived from primary/secondary */
  primaryDark: string;
};

/** Inspect360 default PDF teal theme */
export const DEFAULT_REPORT_PALETTE: ReportBrandPalette = {
  primary: "#00D5CC",
  secondary: "#3B7A8C",
  accent: "#00D5CC",
  background: "#ffffff",
  surface: "#f0fdfa",
  text: "#111827",
  mutedText: "#6b7280",
  border: "#e5e7eb",
  success: "#059669",
  warning: "#d97706",
  danger: "#dc2626",
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let s = value.trim();
  if (!s) return null;
  if (!s.startsWith("#")) s = `#${s}`;
  if (!HEX_RE.test(s)) return null;
  if (s.length === 4) {
    const r = s[1]!;
    const g = s[2]!;
    const b = s[3]!;
    s = `#${r}${r}${g}${g}${b}${b}`;
  }
  return s.toUpperCase();
}

export function parseRgbToHex(value: string): string | null {
  const m = value
    .trim()
    .match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i);
  if (!m) return null;
  const r = Math.min(255, Number(m[1]));
  const g = Math.min(255, Number(m[2]));
  const b = Math.min(255, Number(m[3]));
  if (![r, g, b].every((n) => Number.isFinite(n))) return null;
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  return normalizeHexColor(hex);
}

export function normalizeColorToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t || t === "transparent" || t === "inherit" || t === "currentcolor") return null;
  return normalizeHexColor(t) || parseRgbToHex(t);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHexColor(hex);
  if (!n) return null;
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

/** Relative luminance 0–1 (WCAG). */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const lin = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pick black or white text for readable contrast on a background. */
export function contrastingTextOn(bgHex: string): string {
  const white = contrastRatio(bgHex, "#FFFFFF");
  const black = contrastRatio(bgHex, "#111827");
  return white >= black ? "#FFFFFF" : "#111827";
}

/** Darken a hex color toward black by amount 0–1. */
export function darkenHex(hex: string, amount = 0.25): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return DEFAULT_REPORT_PALETTE.secondary;
  const f = 1 - Math.min(1, Math.max(0, amount));
  const to = (c: number) =>
    Math.round(c * f)
      .toString(16)
      .padStart(2, "0");
  return `#${to(rgb.r)}${to(rgb.g)}${to(rgb.b)}`.toUpperCase();
}

export function normalizeReportPalette(
  input: Partial<Record<keyof ReportBrandPalette, unknown>> | null | undefined,
  fallback: ReportBrandPalette = DEFAULT_REPORT_PALETTE,
): ReportBrandPalette {
  const pick = (key: keyof ReportBrandPalette, def: string): string => {
    const n = normalizeHexColor(input?.[key]);
    return n || def;
  };
  return {
    primary: pick("primary", fallback.primary),
    secondary: pick("secondary", fallback.secondary),
    accent: pick("accent", fallback.accent || fallback.primary),
    background: pick("background", fallback.background),
    surface: pick("surface", fallback.surface),
    text: pick("text", fallback.text),
    mutedText: pick("mutedText", fallback.mutedText),
    border: pick("border", fallback.border),
    success: pick("success", fallback.success || DEFAULT_REPORT_PALETTE.success!),
    warning: pick("warning", fallback.warning || DEFAULT_REPORT_PALETTE.warning!),
    danger: pick("danger", fallback.danger || DEFAULT_REPORT_PALETTE.danger!),
  };
}

/**
 * Normalize AI classification of candidate colors into a partial palette.
 * Never invents colors for roles without a valid hex in the response or candidates.
 */
export function normalizeAiBrandPaletteResult(
  raw: unknown,
  candidates: string[],
): { palette: Partial<ReportBrandPalette>; status: "ok" | "partial" } {
  const allowed = new Set(
    candidates.map((c) => normalizeHexColor(c)).filter(Boolean) as string[],
  );
  const out: Partial<ReportBrandPalette> = {};
  if (!raw || typeof raw !== "object") {
    return { palette: out, status: "partial" };
  }
  const obj = raw as Record<string, unknown>;
  const roles: Array<keyof ReportBrandPalette> = [
    "primary",
    "secondary",
    "accent",
    "background",
    "surface",
    "text",
    "mutedText",
    "border",
  ];
  let assigned = 0;
  for (const role of roles) {
    const n = normalizeHexColor(obj[role]);
    if (!n) continue;
    // Prefer colors from evidence; allow near-matches if AI slightly adjusts
    if (allowed.size === 0 || allowed.has(n) || softMatchCandidate(n, allowed)) {
      out[role] = n;
      assigned += 1;
    }
  }
  return { palette: out, status: assigned >= 2 ? "ok" : "partial" };
}

function softMatchCandidate(hex: string, allowed: Set<string>): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  for (const a of allowed) {
    const b = hexToRgb(a);
    if (!b) continue;
    const dist = Math.abs(rgb.r - b.r) + Math.abs(rgb.g - b.g) + Math.abs(rgb.b - b.b);
    if (dist <= 30) return true;
  }
  return false;
}

/** Build a complete palette from CSS-ranked candidates when AI is skipped or partial. */
export function paletteFromCandidates(
  rankedHexes: string[],
  partial?: Partial<ReportBrandPalette>,
): { palette: ReportBrandPalette; status: "ok" | "partial" } {
  const cleaned = rankedHexes
    .map((h) => normalizeHexColor(h))
    .filter(Boolean) as string[];
  const unique: string[] = [];
  for (const h of cleaned) {
    if (!unique.includes(h)) unique.push(h);
  }

  const base = { ...DEFAULT_REPORT_PALETTE, ...normalizeReportPalette(partial || {}) };
  if (unique.length === 0) {
    return { palette: DEFAULT_REPORT_PALETTE, status: "partial" };
  }

  const primary = partial?.primary ? normalizeHexColor(partial.primary) : unique[0]!;
  const secondary =
    (partial?.secondary && normalizeHexColor(partial.secondary)) ||
    unique.find((h) => h !== primary) ||
    darkenHex(primary!, 0.35);
  const accent =
    (partial?.accent && normalizeHexColor(partial.accent)) ||
    unique.find((h) => h !== primary && h !== secondary) ||
    primary!;

  // Prefer light backgrounds from candidates; else defaults
  const light = unique.find((h) => relativeLuminance(h) > 0.85);
  const dark = unique.find((h) => relativeLuminance(h) < 0.2);

  const palette = normalizeReportPalette({
    ...partial,
    primary: primary!,
    secondary,
    accent: accent!,
    background: (partial?.background && normalizeHexColor(partial.background)) || light || base.background,
    surface: (partial?.surface && normalizeHexColor(partial.surface)) || light || base.surface,
    text: (partial?.text && normalizeHexColor(partial.text)) || dark || base.text,
    mutedText: base.mutedText,
    border: base.border,
  });

  // Ensure body text readable on background
  if (contrastRatio(palette.text, palette.background) < 4.5) {
    palette.text = contrastingTextOn(palette.background);
  }

  return {
    palette,
    status: unique.length >= 2 ? "ok" : "partial",
  };
}

export type OrgBrandThemeSource = {
  brandingPrimaryColor?: string | null;
  brandingReportPalette?: ReportBrandPalette | null;
  brandingPaletteMeta?: ReportBrandPaletteMeta | null;
};

export function resolveReportTheme(org?: OrgBrandThemeSource | null): ReportTheme {
  const stored = org?.brandingReportPalette;
  let palette: ReportBrandPalette;
  if (stored && typeof stored === "object") {
    palette = normalizeReportPalette(stored as Partial<ReportBrandPalette>);
  } else if (org?.brandingPrimaryColor) {
    const primary = normalizeHexColor(org.brandingPrimaryColor) || DEFAULT_REPORT_PALETTE.primary;
    palette = normalizeReportPalette({
      primary,
      secondary: darkenHex(primary, 0.35),
      accent: primary,
    });
  } else {
    palette = { ...DEFAULT_REPORT_PALETTE };
  }
  return {
    ...palette,
    primaryDark: darkenHex(palette.secondary || palette.primary, 0.15),
  };
}

export function isValidReportPalette(value: unknown): value is ReportBrandPalette {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return !!(
    normalizeHexColor(p.primary) &&
    normalizeHexColor(p.secondary) &&
    normalizeHexColor(p.accent) &&
    normalizeHexColor(p.background) &&
    normalizeHexColor(p.surface) &&
    normalizeHexColor(p.text) &&
    normalizeHexColor(p.mutedText) &&
    normalizeHexColor(p.border)
  );
}
