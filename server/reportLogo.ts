/**
 * Report / PDF logo resolution — Corporate Identity.
 * Org white-label logoUrl wins; otherwise Inspect360 defaults:
 * - on-dark (teal/navy covers): LogoWhite.png
 * - on-light (white pages): logo.png
 */

import fs from "fs";
import path from "path";

export type ReportLogoVariant = "on-dark" | "on-light";

export const REPORT_LOGO_ON_DARK = "/LogoWhite.png";
export const REPORT_LOGO_ON_LIGHT = "/logo.png";

export function resolveReportLogoUrl(
  orgLogoUrl?: string | null,
  variant: ReportLogoVariant = "on-dark"
): string {
  const trimmed = typeof orgLogoUrl === "string" ? orgLogoUrl.trim() : "";
  if (trimmed) return trimmed;
  return variant === "on-light" ? REPORT_LOGO_ON_LIGHT : REPORT_LOGO_ON_DARK;
}

function publicAssetAbsolutePath(publicUrlPath: string): string {
  const fileName = publicUrlPath.replace(/^\//, "");
  return path.join(process.cwd(), "client", "public", fileName);
}

function readPublicPngAsDataUrl(publicUrlPath: string): string | null {
  try {
    const buf = fs.readFileSync(publicAssetAbsolutePath(publicUrlPath));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch (error) {
    console.warn(`[ReportLogo] Failed to read ${publicUrlPath}:`, error);
    return null;
  }
}

let cachedOnDark: string | null | undefined;
let cachedOnLight: string | null | undefined;

/** Sync Inspect360 default as data URL (for HTML report builders). */
export function getDefaultCoverLogoDataUrl(
  variant: ReportLogoVariant = "on-dark"
): string | null {
  if (variant === "on-light") {
    if (cachedOnLight === undefined) {
      cachedOnLight = readPublicPngAsDataUrl(REPORT_LOGO_ON_LIGHT);
    }
    return cachedOnLight;
  }
  if (cachedOnDark === undefined) {
    cachedOnDark = readPublicPngAsDataUrl(REPORT_LOGO_ON_DARK);
  }
  return cachedOnDark;
}

/**
 * Cover logo src for teal/navy PDF covers: org logo if set, else LogoWhite data URL.
 * Returns null only if neither org logo nor default file is available.
 */
export function resolveCoverLogoSrc(
  orgLogoUrl?: string | null,
  variant: ReportLogoVariant = "on-dark"
): string | null {
  const trimmed = typeof orgLogoUrl === "string" ? orgLogoUrl.trim() : "";
  if (trimmed) return trimmed;
  return getDefaultCoverLogoDataUrl(variant);
}
