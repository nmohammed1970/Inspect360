/**
 * Shared landscape report chrome (Portfolio + Property History).
 * Keep CSS/table helpers identical so both reports look like one system.
 */

import fs from "fs/promises";
import { ObjectStorageService } from "./objectStorage";
import { formatCurrency } from "@shared/countryUtils";
import { resolveReportLogoUrl, REPORT_LOGO_ON_DARK, REPORT_LOGO_ON_LIGHT } from "./reportLogo";

export type LandscapeReportBranding = {
  logoUrl?: string | null;
  brandingName?: string | null;
  brandingEmail?: string | null;
  brandingPhone?: string | null;
  brandingWebsite?: string | null;
};

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

export async function logoToDataUrl(logoUrl?: string | null, baseUrl?: string): Promise<string | null> {
  const url = resolveReportLogoUrl(logoUrl, "on-dark");
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
        return logoToDataUrl(null, baseUrl);
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
        return await logoToDataUrl(null, baseUrl);
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

export function sharedCss(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      color: #333;
      background: white;
    }
    .cover-page {
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      background: linear-gradient(135deg, #00D5CC 0%, #3B7A8C 100%);
      color: white;
      page-break-after: always;
      position: relative;
      overflow: hidden;
    }
    .cover-page::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -20%;
      width: 60%;
      height: 200%;
      background: rgba(255, 255, 255, 0.03);
      transform: rotate(15deg);
    }
    .cover-page::after {
      content: '';
      position: absolute;
      bottom: -30%;
      left: -10%;
      width: 40%;
      height: 150%;
      background: rgba(255, 255, 255, 0.02);
      transform: rotate(-10deg);
    }
    .cover-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      /* Keep meta above absolutely positioned .cover-contact footer */
      padding: 16px 24px 72px;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }
    .cover-logo-container {
      margin-bottom: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .cover-logo-img {
      max-height: 72px;
      max-width: 240px;
      width: auto;
      height: auto;
      object-fit: contain;
      margin-top: 12px;
      background: transparent;
    }
    .cover-logo-text {
      font-size: 56px;
      font-weight: 800;
      letter-spacing: -2px;
      text-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    .cover-company-name {
      font-size: 28px;
      font-weight: 600;
      opacity: 0.95;
      letter-spacing: 1px;
    }
    .cover-title {
      font-size: 36px;
      font-weight: 700;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
    .cover-subtitle {
      font-size: 18px;
      font-weight: 400;
      margin-bottom: 12px;
      opacity: 0.9;
      max-width: 90%;
    }
    .cover-meta {
      font-size: 15px;
      opacity: 0.9;
      margin-top: 6px;
    }
    .cover-contact {
      position: absolute;
      bottom: 28px;
      left: 24px;
      right: 24px;
      font-size: 13px;
      opacity: 0.8;
      z-index: 2;
      text-align: center;
      pointer-events: none;
    }
    ${coverSubjectImageCss()}
    .page {
      padding: 40px;
      page-break-after: always;
    }
    .page:last-child {
      page-break-after: auto;
    }
    .section-title {
      font-size: 26px;
      font-weight: 800;
      margin-bottom: 28px;
      color: #00D5CC;
      border-bottom: 4px solid #00D5CC;
      padding-bottom: 12px;
      padding-left: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      position: relative;
    }
    .section-title::before {
      content: '';
      position: absolute;
      left: 0;
      bottom: -4px;
      width: 60px;
      height: 4px;
      background: #3B7A8C;
      border-radius: 2px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 18px;
      margin-bottom: 28px;
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
    }
    .stat-value {
      font-size: 32px;
      font-weight: 700;
      color: #00D5CC;
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
      border: 2px solid #00D5CC;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      background: white;
    }
    th {
      background: #00D5CC;
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
}): Promise<{
  displayName: string;
  companyNameHtml: string;
  logoHtml: string;
  contactInfoHtml: string;
}> {
  const displayName = resolveCompanyDisplayName(params.organizationName, params.branding?.brandingName);
  const logoDataUrl = await logoToDataUrl(params.branding?.logoUrl, params.baseUrl);
  const companyNameHtml = `<div class="cover-company-name">${escapeHtml(displayName)}</div>`;
  const logoHtml = logoDataUrl
    ? `<img src="${sanitizeReportUrl(logoDataUrl)}" alt="${escapeHtml(displayName)}" class="cover-logo-img" />`
    : "";
  const contactParts: string[] = [];
  if (params.branding?.brandingEmail) contactParts.push(escapeHtml(params.branding.brandingEmail));
  if (params.branding?.brandingPhone) contactParts.push(escapeHtml(params.branding.brandingPhone));
  if (params.branding?.brandingWebsite) contactParts.push(escapeHtml(params.branding.brandingWebsite));
  const contactInfoHtml =
    contactParts.length > 0
      ? `<div class="cover-contact">${contactParts.join(" &nbsp;|&nbsp; ")}</div>`
      : "";
  return { displayName, companyNameHtml, logoHtml, contactInfoHtml };
}
