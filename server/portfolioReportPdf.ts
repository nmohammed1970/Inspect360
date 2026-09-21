/**
 * Landscape portfolio PDF — mirrors the comprehensive Excel workbook sheets.
 * Theme matches dashboard report (teal #00D5CC → slate #3B7A8C).
 */

import fs from "fs/promises";
import { ObjectStorageService } from "./objectStorage";
import { formatCurrency, getCurrencyForCountry } from "@shared/countryUtils";
import { resolveReportLogoUrl, REPORT_LOGO_ON_DARK, REPORT_LOGO_ON_LIGHT } from "./reportLogo";

export type PortfolioReportBranding = {
  logoUrl?: string | null;
  brandingName?: string | null;
  brandingEmail?: string | null;
  brandingPhone?: string | null;
  brandingWebsite?: string | null;
};

function escapeHtml(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeReportUrl(url: string, baseUrl?: string): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  // Data URLs must not be HTML-escaped (breaks base64)
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

/** Load logo from object storage, public brand assets, or HTTP into a data URL so Puppeteer can embed it without auth. */
async function logoToDataUrl(logoUrl?: string | null, baseUrl?: string): Promise<string | null> {
  // Teal/navy covers → white wordmark when org has no logo
  const url = resolveReportLogoUrl(logoUrl, "on-dark");
  if (url.startsWith("data:")) return url;

  try {
    // Local brand assets (LogoWhite / logo.png) — read from disk (reliable for Puppeteer)
    if (url === REPORT_LOGO_ON_DARK || url === REPORT_LOGO_ON_LIGHT || url === "/logoUrl.png") {
      const fileName = url.replace(/^\//, "");
      const filePath = `${process.cwd()}/client/public/${fileName}`;
      const buf = await fs.readFile(filePath);
      console.log(`[Portfolio PDF] Brand logo loaded from public/${fileName} (${buf.length} bytes)`);
      return `data:image/png;base64,${buf.toString("base64")}`;
    }

    if (url.startsWith("/objects/")) {
      const objectStorageService = new ObjectStorageService();
      const logoFile = await objectStorageService.getObjectEntityFile(url);
      const buf = await fs.readFile(logoFile.name);
      const ext = url.split(".").pop()?.toLowerCase() || "";
      const mime =
        ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "webp"
            ? "image/webp"
            : ext === "gif"
              ? "image/gif"
              : "image/png";
      console.log(`[Portfolio PDF] Logo loaded from object storage (${buf.length} bytes)`);
      return `data:${mime};base64,${buf.toString("base64")}`;
    }

    let absoluteUrl = url;
    if (url.startsWith("/") && baseUrl) {
      absoluteUrl = `${baseUrl}${url}`;
    }
    const response = await fetch(absoluteUrl, { headers: { Accept: "image/*" } });
    if (!response.ok) {
      console.warn(`[Portfolio PDF] Failed to fetch logo: ${response.status}`);
      // Fall back to Inspect360 white logo on dark covers
      if (logoUrl) {
        return logoToDataUrl(null, baseUrl);
      }
      return null;
    }
    const contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    console.log(`[Portfolio PDF] Logo fetched via HTTP (${arrayBuffer.byteLength} bytes)`);
    return `data:${contentType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
  } catch (error) {
    console.warn("[Portfolio PDF] Logo conversion failed:", error);
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

function formatDate(value: any): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function formatMoney(value: unknown, currency: "GBP" | "USD" | "AED"): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(num)) return "—";
  return formatCurrency(num, currency, false);
}

function sharedCss(): string {
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
    }
    .cover-logo-container {
      margin-bottom: 32px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .cover-logo-img {
      max-height: 100px;
      max-width: 280px;
      width: auto;
      height: auto;
      object-fit: contain;
      margin-top: 24px;
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
      font-size: 42px;
      font-weight: 700;
      margin-bottom: 12px;
      letter-spacing: 0.5px;
    }
    .cover-subtitle {
      font-size: 22px;
      font-weight: 400;
      margin-bottom: 20px;
      opacity: 0.9;
    }
    .cover-meta {
      font-size: 16px;
      opacity: 0.9;
      margin-top: 10px;
    }
    .cover-contact {
      position: absolute;
      bottom: 40px;
      font-size: 14px;
      opacity: 0.8;
      z-index: 1;
    }
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

function stackedCell(title: string, subtitle?: string): string {
  const main = `<div class="cell-title">${escapeHtml(title || "—")}</div>`;
  if (!subtitle?.trim()) return main;
  return `${main}<div class="cell-sub">${escapeHtml(subtitle)}</div>`;
}

function renderTable(
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

function statusBadge(status: string, kind?: "success" | "warning" | "danger" | "info"): string {
  const cls = kind || "info";
  return `<span class="badge badge-${cls}">${escapeHtml(status || "")}</span>`;
}

function looksLikeEmail(value?: string | null): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

/** Prefer branding/company name; never use an email as the hero company label. */
function resolveCompanyDisplayName(
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

export async function generatePortfolioReportHTML(params: {
  organizationName: string;
  properties: any[];
  blocks: any[];
  inspections: any[];
  complianceDocuments: any[];
  maintenanceRequests: any[];
  assetInventory: any[];
  tenantAssignments: any[];
  branding?: PortfolioReportBranding;
  baseUrl?: string;
  countryCode?: string | null;
}): Promise<string> {
  const {
    organizationName,
    properties,
    blocks,
    inspections,
    complianceDocuments,
    maintenanceRequests,
    assetInventory,
    tenantAssignments,
    branding,
    baseUrl,
    countryCode,
  } = params;

  const currency = getCurrencyForCountry(countryCode || "GB");
  const now = new Date();
  const reportDate = now.toLocaleDateString();
  const blockMap = new Map(blocks.map((b: any) => [b.id, b]));
  const propertyMap = new Map(properties.map((p: any) => [p.id, p]));

  const openMaintenance = maintenanceRequests.filter(
    (m) => m.status === "open" || m.status === "in_progress"
  ).length;
  const expiringCompliance = complianceDocuments.filter((doc) => {
    if (!doc.expiryDate) return false;
    const expiry = new Date(doc.expiryDate);
    const daysUntil = Math.floor((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysUntil > 0 && daysUntil <= 30;
  }).length;
  const expiredCompliance = complianceDocuments.filter((doc) => {
    if (!doc.expiryDate) return false;
    return new Date(doc.expiryDate).getTime() < Date.now();
  }).length;

  // Cover: company name, then logo (replaces divider line; no white background)
  const displayName = resolveCompanyDisplayName(organizationName, branding?.brandingName);
  const logoDataUrl = await logoToDataUrl(branding?.logoUrl, baseUrl);
  const hasLogo = !!logoDataUrl;
  const companyNameHtml = `<div class="cover-company-name">${escapeHtml(displayName)}</div>`;
  const logoHtml = hasLogo
    ? `<img src="${sanitizeReportUrl(logoDataUrl!)}" alt="${escapeHtml(displayName)}" class="cover-logo-img" />`
    : "";
  const contactParts: string[] = [];
  if (branding?.brandingEmail) contactParts.push(escapeHtml(branding.brandingEmail));
  if (branding?.brandingPhone) contactParts.push(escapeHtml(branding.brandingPhone));
  if (branding?.brandingWebsite) contactParts.push(escapeHtml(branding.brandingWebsite));
  const contactInfoHtml =
    contactParts.length > 0
      ? `<div class="cover-contact">${contactParts.join(" &nbsp;|&nbsp; ")}</div>`
      : "";

  // ---- Blocks & Properties (same columns as Excel) ----
  const blocksRows: string[][] = [];
  const propertiesByBlock = new Map<string, any[]>();
  properties.forEach((prop) => {
    const blockId = prop.blockId || "no-block";
    if (!propertiesByBlock.has(blockId)) propertiesByBlock.set(blockId, []);
    propertiesByBlock.get(blockId)!.push(prop);
  });

  blocks.forEach((block) => {
    const blockProperties = propertiesByBlock.get(block.id) || [];
    if (blockProperties.length === 0) {
      blocksRows.push([
        stackedCell(block.name || "", block.address || ""),
        stackedCell("—", ""),
        "—",
        "—",
        "—",
        "0",
        "0",
        "0",
        "0",
      ]);
    } else {
      blockProperties.forEach((property, propIdx) => {
        const propertyInspections = inspections.filter((i) => i.propertyId === property.id);
        const propertyMaintenance = maintenanceRequests.filter((m) => m.propertyId === property.id);
        const propertyAssets = assetInventory.filter((a) => a.propertyId === property.id);
        const propertyCompliance = complianceDocuments.filter((c) => c.propertyId === property.id);
        const tenantAssignment = tenantAssignments.find(
          (ta) =>
            ta.propertyId === property.id &&
            (ta.status === "active" || ta.status === "current" || ta.isActive === true)
        );
        blocksRows.push([
          propIdx === 0
            ? stackedCell(block.name || "", block.address || "")
            : "",
          stackedCell(property.name || "", property.address || ""),
          escapeHtml((property as any).propertyType || "—"),
          tenantAssignment ? "Occupied" : "Vacant",
          escapeHtml(formatMoney(tenantAssignment?.monthlyRent, currency)),
          String(propertyInspections.length),
          String(propertyMaintenance.length),
          String(propertyAssets.length),
          String(propertyCompliance.length),
        ]);
      });
    }
  });

  // Standalone properties (no block)
  const standalone = propertiesByBlock.get("no-block") || [];
  standalone.forEach((property) => {
    const propertyInspections = inspections.filter((i) => i.propertyId === property.id);
    const propertyMaintenance = maintenanceRequests.filter((m) => m.propertyId === property.id);
    const propertyAssets = assetInventory.filter((a) => a.propertyId === property.id);
    const propertyCompliance = complianceDocuments.filter((c) => c.propertyId === property.id);
    const tenantAssignment = tenantAssignments.find(
      (ta) =>
        ta.propertyId === property.id &&
        (ta.status === "active" || ta.status === "current" || ta.isActive === true)
    );
    blocksRows.push([
      stackedCell("Standalone", ""),
      stackedCell(property.name || "", property.address || ""),
      escapeHtml((property as any).propertyType || "—"),
      tenantAssignment ? "Occupied" : "Vacant",
      escapeHtml(formatMoney(tenantAssignment?.monthlyRent, currency)),
      String(propertyInspections.length),
      String(propertyMaintenance.length),
      String(propertyAssets.length),
      String(propertyCompliance.length),
    ]);
  });

  // ---- Inspections ----
  const inspectionRows = inspections.map((inspection) => {
    const block =
      blocks.find((b) => b.id === (inspection.blockId || inspection.property?.blockId)) ||
      (inspection.propertyId ? blockMap.get(propertyMap.get(inspection.propertyId)?.blockId) : null);
    const property = propertyMap.get(inspection.propertyId) || inspection.property;
    const dateVal = inspection.completedDate
      ? formatDate(inspection.completedDate)
      : inspection.scheduledDate
        ? formatDate(inspection.scheduledDate)
        : "";
    const inspector = inspection.clerk
      ? `${inspection.clerk.firstName || ""} ${inspection.clerk.lastName || ""}`.trim() ||
        inspection.clerk.email ||
        ""
      : "";
    return [
      stackedCell(dateVal, inspector ? `Inspector: ${inspector}` : ""),
      escapeHtml(block?.name || ""),
      escapeHtml(property?.name || ""),
      escapeHtml(inspection.type || ""),
      escapeHtml(inspection.status || ""),
      stackedCell(
        formatDate(inspection.scheduledDate) || "—",
        formatDate(inspection.completedDate)
          ? `Done: ${formatDate(inspection.completedDate)}`
          : ""
      ),
    ];
  });

  // ---- Maintenance ----
  const maintenanceRows = maintenanceRequests.map((maintenance) => {
    const property = propertyMap.get(maintenance.propertyId) || maintenance.property;
    const block =
      blocks.find((b) => b.id === (maintenance.blockId || property?.blockId)) ||
      maintenance.block;
    let statusHtml = escapeHtml(maintenance.status || "");
    if (maintenance.status === "open") statusHtml = statusBadge("open", "warning");
    else if (maintenance.status === "in_progress") statusHtml = statusBadge("in_progress", "info");
    else if (maintenance.status === "completed") statusHtml = statusBadge("completed", "success");
    const reportedBy = maintenance.reportedByUser
      ? `${maintenance.reportedByUser.firstName || ""} ${maintenance.reportedByUser.lastName || ""}`.trim()
      : "";
    const assignedTo = maintenance.assignedToUser
      ? `${maintenance.assignedToUser.firstName || ""} ${maintenance.assignedToUser.lastName || ""}`.trim()
      : "";
    return [
      stackedCell(formatDate(maintenance.createdAt), formatDate(maintenance.dueDate) ? `Due: ${formatDate(maintenance.dueDate)}` : ""),
      escapeHtml(block?.name || ""),
      escapeHtml(property?.name || ""),
      escapeHtml(maintenance.title || ""),
      statusHtml,
      escapeHtml(maintenance.priority || ""),
      stackedCell(reportedBy || "—", assignedTo ? `Assigned: ${assignedTo}` : ""),
    ];
  });

  // ---- Assets ----
  const assetRows = assetInventory.map((asset) => {
    const property = propertyMap.get(asset.propertyId);
    const block = property ? blockMap.get(property.blockId) : null;
    return [
      stackedCell(block?.name || "—", property?.name || ""),
      stackedCell(asset.name || "", asset.category || ""),
      escapeHtml(formatMoney(asset.purchasePrice, currency)),
      escapeHtml(formatMoney(asset.currentValue, currency)),
      escapeHtml(formatDate(asset.datePurchased) || "—"),
      stackedCell(asset.condition || "—", asset.location || ""),
    ];
  });

  // ---- Compliance ----
  const complianceRows = complianceDocuments.map((doc) => {
    const property = propertyMap.get(doc.propertyId);
    const block = property
      ? blockMap.get(property.blockId)
      : blocks.find((b) => b.id === doc.blockId);
    let status = "Current";
    let badge: "success" | "warning" | "danger" = "success";
    if (doc.expiryDate) {
      const expiry = new Date(doc.expiryDate);
      const daysUntil = Math.floor((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntil < 0) {
        status = "Expired";
        badge = "danger";
      } else if (daysUntil <= 30) {
        status = "Expiring Soon";
        badge = "warning";
      }
    }
    return [
      stackedCell(block?.name || "—", property?.name || ""),
      stackedCell(doc.documentType || "", (doc as any).documentName || ""),
      stackedCell(
        formatDate((doc as any).issueDate) || "—",
        formatDate(doc.expiryDate) ? `Expires: ${formatDate(doc.expiryDate)}` : ""
      ),
      statusBadge(status, badge),
      escapeHtml((doc as any).notes || "—"),
    ];
  });

  // ---- Tenants ----
  const tenantRows = tenantAssignments.map((assignment) => {
    const property = propertyMap.get(assignment.propertyId);
    const block = property ? blockMap.get(property.blockId) : null;
    const tenantFullName =
      [assignment.tenantFirstName, assignment.tenantLastName].filter(Boolean).join(" ") || "";
    return [
      stackedCell(block?.name || "—", property?.name || ""),
      stackedCell(tenantFullName, assignment.tenantEmail || ""),
      stackedCell(
        formatDate(assignment.leaseStartDate) || "—",
        formatDate(assignment.leaseEndDate) ? `End: ${formatDate(assignment.leaseEndDate)}` : ""
      ),
      escapeHtml(formatMoney(assignment.monthlyRent, currency)),
      escapeHtml(formatMoney(assignment.depositAmount, currency)),
      escapeHtml(assignment.isActive ? "active" : "inactive"),
    ];
  });

  // ---- At Risk ----
  const atRiskRows: string[][] = [];
  complianceDocuments.forEach((doc) => {
    if (!doc.expiryDate) return;
    const expiry = new Date(doc.expiryDate);
    if (expiry >= now) return;
    const property = propertyMap.get(doc.propertyId);
    const block = property
      ? blockMap.get(property.blockId)
      : blocks.find((b) => b.id === doc.blockId);
    const daysOverdue = Math.floor((now.getTime() - expiry.getTime()) / (1000 * 60 * 60 * 24));
    atRiskRows.push([
      statusBadge("Compliance Document", "danger"),
      stackedCell(block?.name || "—", property?.name || ""),
      stackedCell((doc as any).documentName || doc.documentType || "", (doc as any).notes || ""),
      statusBadge("Expired", "danger"),
      stackedCell(expiry.toLocaleDateString(), `${daysOverdue}d overdue`),
    ]);
  });
  maintenanceRequests.forEach((maintenance) => {
    if (!maintenance.dueDate) return;
    const dueDate = new Date(maintenance.dueDate);
    if (!(dueDate < now && (maintenance.status === "open" || maintenance.status === "in_progress")))
      return;
    const property = propertyMap.get(maintenance.propertyId) || maintenance.property;
    const block =
      (property ? blockMap.get(property.blockId) : null) ||
      blocks.find((b) => b.id === maintenance.blockId) ||
      maintenance.block;
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    atRiskRows.push([
      statusBadge("Maintenance Request", "danger"),
      stackedCell(block?.name || "—", property?.name || ""),
      stackedCell(maintenance.title || "", maintenance.description || ""),
      escapeHtml(maintenance.status || ""),
      stackedCell(dueDate.toLocaleDateString(), `${daysOverdue}d overdue`),
    ]);
  });
  inspections.forEach((inspection) => {
    if (!inspection.scheduledDate || inspection.status === "completed") return;
    const scheduled = new Date(inspection.scheduledDate);
    if (scheduled >= now) return;
    const property = propertyMap.get(inspection.propertyId) || inspection.property;
    const block =
      (property ? blockMap.get(property.blockId) : null) ||
      blocks.find((b) => b.id === inspection.blockId);
    const daysOverdue = Math.floor((now.getTime() - scheduled.getTime()) / (1000 * 60 * 60 * 24));
    atRiskRows.push([
      statusBadge("Inspection", "danger"),
      stackedCell(block?.name || "—", property?.name || ""),
      stackedCell(
        `${inspection.type || "Inspection"} - ${inspection.status || "Pending"}`,
        inspection.notes || ""
      ),
      escapeHtml(inspection.status || ""),
      stackedCell(scheduled.toLocaleDateString(), `${daysOverdue}d overdue`),
    ]);
  });

  // ---- Upcoming ----
  const upcomingRows: string[][] = [];
  complianceDocuments.forEach((doc) => {
    if (!doc.expiryDate) return;
    const expiry = new Date(doc.expiryDate);
    const daysUntil = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (!(daysUntil > 0 && daysUntil <= 30)) return;
    const property = propertyMap.get(doc.propertyId);
    const block = property
      ? blockMap.get(property.blockId)
      : blocks.find((b) => b.id === doc.blockId);
    upcomingRows.push([
      statusBadge("Compliance Document", "warning"),
      stackedCell(block?.name || "—", property?.name || ""),
      escapeHtml(doc.documentType || ""),
      stackedCell(expiry.toLocaleDateString(), `In ${daysUntil} days`),
    ]);
  });
  maintenanceRequests.forEach((maintenance) => {
    if (!maintenance.dueDate) return;
    const dueDate = new Date(maintenance.dueDate);
    const daysUntil = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (
      !(
        daysUntil > 0 &&
        daysUntil <= 30 &&
        (maintenance.status === "open" || maintenance.status === "in_progress")
      )
    )
      return;
    const property = propertyMap.get(maintenance.propertyId) || maintenance.property;
    const block =
      (property ? blockMap.get(property.blockId) : null) ||
      blocks.find((b) => b.id === maintenance.blockId) ||
      maintenance.block;
    upcomingRows.push([
      statusBadge("Maintenance Request", "warning"),
      stackedCell(block?.name || "—", property?.name || ""),
      stackedCell(maintenance.title || "", maintenance.description || ""),
      stackedCell(dueDate.toLocaleDateString(), `In ${daysUntil} days`),
    ]);
  });
  inspections.forEach((inspection) => {
    if (!inspection.scheduledDate || inspection.status === "completed") return;
    const scheduled = new Date(inspection.scheduledDate);
    const daysUntil = Math.floor((scheduled.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (!(daysUntil > 0 && daysUntil <= 30)) return;
    const property = propertyMap.get(inspection.propertyId) || inspection.property;
    const block =
      (property ? blockMap.get(property.blockId) : null) ||
      blocks.find((b) => b.id === inspection.blockId);
    upcomingRows.push([
      statusBadge("Inspection", "warning"),
      stackedCell(block?.name || "—", property?.name || ""),
      stackedCell(
        `${inspection.type || "Inspection"} - ${inspection.status || "Scheduled"}`,
        inspection.notes || ""
      ),
      stackedCell(scheduled.toLocaleDateString(), `In ${daysUntil} days`),
    ]);
  });
  tenantAssignments.forEach((assignment) => {
    if (!assignment.leaseEndDate || !(assignment.status === "active" || assignment.status === "current" || assignment.isActive))
      return;
    const leaseEnd = new Date(assignment.leaseEndDate);
    const daysUntil = Math.floor((leaseEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (!(daysUntil > 0 && daysUntil <= 90)) return;
    const property = propertyMap.get(assignment.propertyId);
    const block = property ? blockMap.get(property.blockId) : null;
    const tenant =
      [assignment.tenantFirstName, assignment.tenantLastName].filter(Boolean).join(" ") ||
      assignment.tenant?.fullName ||
      "Unknown Tenant";
    upcomingRows.push([
      statusBadge("Lease Expiration", "warning"),
      stackedCell(block?.name || "—", property?.name || ""),
      stackedCell(
        tenant,
        `Monthly Rent: ${
          assignment.monthlyRent != null
            ? formatMoney(assignment.monthlyRent, currency)
            : "N/A"
        }`
      ),
      stackedCell(leaseEnd.toLocaleDateString(), `In ${daysUntil} days`),
    ]);
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${sharedCss()}</style>
</head>
<body>
  <div class="cover-page">
    <div class="cover-content">
      <div class="cover-logo-container">
        ${companyNameHtml}
        ${logoHtml}
      </div>
      <div class="cover-title">Comprehensive Report</div>
      <div class="cover-subtitle">Portfolio Data Export</div>
      <div class="cover-meta"><strong>Organization:</strong> ${escapeHtml(displayName)}</div>
      <div class="cover-meta"><strong>Report Date:</strong> ${escapeHtml(reportDate)}</div>
    </div>
    ${contactInfoHtml}
  </div>

  <div class="page">
    <h2 class="section-title">Summary</h2>
    <div class="info-row"><strong>Organization:</strong> ${escapeHtml(displayName)}</div>
    <div class="info-row" style="margin-bottom: 16px;"><strong>Report Date:</strong> ${escapeHtml(reportDate)}</div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${blocks.length}</div><div class="stat-label">Total Blocks</div></div>
      <div class="stat-card"><div class="stat-value">${properties.length}</div><div class="stat-label">Total Properties</div></div>
      <div class="stat-card"><div class="stat-value">${inspections.length}</div><div class="stat-label">Total Inspections</div></div>
      <div class="stat-card"><div class="stat-value">${maintenanceRequests.length}</div><div class="stat-label">Total Maintenance</div></div>
      <div class="stat-card"><div class="stat-value">${openMaintenance}</div><div class="stat-label">Open Maintenance</div></div>
      <div class="stat-card"><div class="stat-value">${assetInventory.length}</div><div class="stat-label">Total Assets</div></div>
      <div class="stat-card"><div class="stat-value">${complianceDocuments.length}</div><div class="stat-label">Compliance Docs</div></div>
      <div class="stat-card"><div class="stat-value">${expiringCompliance}</div><div class="stat-label">Expiring ≤30 days</div></div>
      <div class="stat-card"><div class="stat-value">${expiredCompliance}</div><div class="stat-label">Expired Documents</div></div>
    </div>
  </div>

  <div class="page compact">
    <h2 class="section-title">Blocks &amp; Properties</h2>
    ${renderTable(
      ["Block", "Property", "Type", "Status", "Rent", "Insp", "Maint", "Assets", "Comp"],
      blocksRows,
      "No blocks or properties found.",
      ["left", "left", "center", "center", "right", "center", "center", "center", "center"]
    )}
  </div>

  <div class="page compact">
    <h2 class="section-title">Inspections</h2>
    ${renderTable(
      ["Date", "Block", "Property", "Type", "Status", "Schedule"],
      inspectionRows,
      "No inspections found.",
      ["left", "left", "left", "center", "center", "center"]
    )}
  </div>

  <div class="page compact">
    <h2 class="section-title">Maintenance</h2>
    ${renderTable(
      ["Date", "Block", "Property", "Title", "Status", "Priority", "People"],
      maintenanceRows,
      "No maintenance requests found.",
      ["left", "left", "left", "left", "center", "center", "left"]
    )}
  </div>

  <div class="page compact">
    <h2 class="section-title">Assets</h2>
    ${renderTable(
      ["Location", "Asset", "Purchase", "Value", "Purchased", "Condition"],
      assetRows,
      "No assets found.",
      ["left", "left", "left", "right", "center", "center"]
    )}
  </div>

  <div class="page compact">
    <h2 class="section-title">Compliance</h2>
    ${renderTable(
      ["Location", "Document", "Dates", "Status", "Notes"],
      complianceRows,
      "No compliance documents found.",
      ["left", "left", "center", "center", "left"]
    )}
  </div>

  <div class="page compact">
    <h2 class="section-title">Tenants</h2>
    ${renderTable(
      ["Location", "Tenant", "Lease", "Rent", "Deposit", "Status"],
      tenantRows,
      "No tenant assignments found.",
      ["left", "left", "center", "right", "right", "center"]
    )}
  </div>

  <div class="page compact">
    <h2 class="section-title">At Risk Items</h2>
    ${renderTable(
      ["Type", "Location", "Item", "Status", "Due"],
      atRiskRows,
      "No at-risk items found.",
      ["center", "left", "left", "center", "center"]
    )}
  </div>

  <div class="page compact">
    <h2 class="section-title">Upcoming Items</h2>
    ${renderTable(
      ["Type", "Location", "Item", "Due"],
      upcomingRows,
      "No upcoming items found.",
      ["center", "left", "left", "center"]
    )}
  </div>
</body>
</html>`;
}
