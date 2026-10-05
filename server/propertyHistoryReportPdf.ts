/**
 * Landscape Property History PDF — same chrome as Portfolio, scoped to one property.
 */

import { getCurrencyForCountry } from "@shared/countryUtils";
import {
  type LandscapeReportBranding,
  escapeHtml,
  formatDate,
  formatMoney,
  formatMoneyCents,
  sharedCss,
  stackedCell,
  renderTable,
  statusBadge,
  buildCoverChrome,
  sanitizeReportUrl,
} from "./reportPdfShared";

export type PropertyHistoryReportBranding = LandscapeReportBranding;

function prettyLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function personName(user: any): string {
  if (!user) return "—";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || "—";
}

function isActiveAssignment(ta: any): boolean {
  const nested = ta?.assignment;
  const raw =
    nested?.isActive !== undefined && nested?.isActive !== null
      ? nested.isActive
      : ta?.isActive !== undefined && ta?.isActive !== null
        ? ta.isActive
        : ta?.is_active;
  if (raw === false || raw === 0 || raw === "false" || raw === "f") return false;
  if (raw === true || raw === 1 || raw === "true" || raw === "t") return true;
  if (raw === null || raw === undefined) return true;
  return ta.status === "active" || ta.status === "current";
}

function assignmentLease(ta: any): { start: any; end: any; rent: any; deposit: any } {
  const a = ta?.assignment || ta;
  return {
    start: a?.leaseStartDate,
    end: a?.leaseEndDate,
    rent: a?.monthlyRent ?? ta?.monthlyRent,
    deposit: a?.depositAmount ?? ta?.depositAmount,
  };
}

function tenantDisplayName(ta: any): string {
  const nestedUser = ta?.user;
  const name = [ta.firstName, ta.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  const nested = [nestedUser?.firstName, nestedUser?.lastName].filter(Boolean).join(" ").trim();
  if (nested) return nested;
  const orgShape = [ta.tenantFirstName, ta.tenantLastName].filter(Boolean).join(" ").trim();
  return orgShape || ta.email || ta.tenantEmail || "—";
}

function tenantEmail(ta: any): string {
  return ta.email || ta.tenantEmail || ta.user?.email || "";
}

function datesOverlap(startA?: any, endA?: any, startB?: any, endB?: any): boolean {
  const a0 = startA ? new Date(startA).getTime() : Number.NEGATIVE_INFINITY;
  const a1 = endA ? new Date(endA).getTime() : Number.POSITIVE_INFINITY;
  const b0 = startB ? new Date(startB).getTime() : Number.NEGATIVE_INFINITY;
  const b1 = endB ? new Date(endB).getTime() : Number.POSITIVE_INFINITY;
  if (Number.isNaN(a0) || Number.isNaN(a1) || Number.isNaN(b0) || Number.isNaN(b1)) return false;
  return a0 <= b1 && b0 <= a1;
}

function inferInspectionTenant(inspection: any, tenants: any[]): string {
  const point = inspection.completedDate || inspection.scheduledDate || inspection.createdAt;
  if (!point) return "—";
  const hit = tenants.find((ta) => {
    const lease = assignmentLease(ta);
    return datesOverlap(lease.start, lease.end, point, point);
  });
  return hit ? tenantDisplayName(hit) : "—";
}

function complianceStatus(doc: any): { label: string; kind: "success" | "warning" | "danger" | "info" } {
  if (doc.status === "expired" || (doc.expiryDate && new Date(doc.expiryDate).getTime() < Date.now())) {
    return { label: "Expired", kind: "danger" };
  }
  if (doc.expiryDate) {
    const daysUntil = Math.floor((new Date(doc.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntil >= 0 && daysUntil <= 30) return { label: "Expiring", kind: "warning" };
  }
  if (doc.status) return { label: prettyLabel(doc.status), kind: "success" };
  return { label: "Current", kind: "success" };
}

function disputeKind(status: string): "success" | "warning" | "danger" | "info" {
  if (status === "resolved" || status === "waived") return "success";
  if (status === "disputed") return "danger";
  return "info";
}

function maintenanceKind(status: string): "success" | "warning" | "danger" | "info" {
  const s = (status || "").toLowerCase();
  if (s === "completed" || s === "closed") return "success";
  if (s === "in_progress" || s === "assigned") return "info";
  if (s === "open" || s === "pending") return "warning";
  return "info";
}

function inspectionKind(status: string): "success" | "warning" | "danger" | "info" {
  const s = (status || "").toLowerCase();
  if (s === "completed") return "success";
  if (s === "in_progress") return "info";
  if (s === "cancelled") return "danger";
  return "warning";
}

export function sanitizePropertyHistoryFilename(propertyName: string): string {
  const part = (propertyName || "property")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return part || "property";
}

export async function generatePropertyHistoryReportHTML(params: {
  organizationName: string;
  property: any;
  block?: any | null;
  occupancyStatus: string;
  inspections: any[];
  inspectorById: Map<string, any>;
  assignedUserById: Map<string, any>;
  tenantAssignments: any[];
  comparisonTenantsById: Map<string, any>;
  complianceDocuments: any[];
  maintenanceRequests: any[];
  workOrders: any[];
  disputeItems: Array<{ item: any; report: any }>;
  assetInventory: any[];
  branding?: PropertyHistoryReportBranding;
  baseUrl?: string;
  countryCode?: string | null;
}): Promise<string> {
  const {
    organizationName,
    property,
    block,
    occupancyStatus,
    inspections,
    inspectorById,
    assignedUserById,
    tenantAssignments,
    comparisonTenantsById,
    complianceDocuments,
    maintenanceRequests,
    workOrders,
    disputeItems,
    assetInventory,
    branding,
    baseUrl,
    countryCode,
  } = params;

  const currency = getCurrencyForCountry(countryCode || "GB");
  const reportDate = new Date().toLocaleDateString();
  const { displayName, companyNameHtml, logoHtml, contactInfoHtml } = await buildCoverChrome({
    organizationName,
    branding,
    baseUrl,
  });

  const propertyTitle = property.name || "Property";
  const propertyAddress = property.address || "";
  const woByRequestId = new Map<string, any>();
  workOrders.forEach((wo) => {
    const reqId = wo.maintenanceRequestId || wo.maintenanceRequest?.id;
    if (reqId && !woByRequestId.has(reqId)) woByRequestId.set(reqId, wo);
  });

  const sortedTenants = [...tenantAssignments].sort((a, b) => {
    const aActive = isActiveAssignment(a) ? 0 : 1;
    const bActive = isActiveAssignment(b) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    const aStart = new Date(assignmentLease(a).start || 0).getTime();
    const bStart = new Date(assignmentLease(b).start || 0).getTime();
    return bStart - aStart;
  });

  const overviewRows: string[][] = [
    [
      stackedCell(property.name || "—", property.address || ""),
      escapeHtml(prettyLabel(property.propertyType || property.type)),
      property.sqft != null ? escapeHtml(String(property.sqft)) : "—",
      escapeHtml(block?.name || "—"),
      occupancyStatus === "Occupied"
        ? statusBadge("Occupied", "success")
        : statusBadge("Vacant", "info"),
      escapeHtml(formatDate(property.createdAt) || "—"),
    ],
  ];

  const inspectionRows = inspections.map((inspection) => {
    const inspector = inspectorById.get(inspection.inspectorId) || inspection.clerk;
    return [
      escapeHtml(prettyLabel(inspection.type)),
      stackedCell(formatDate(inspection.scheduledDate) || "—", formatDate(inspection.completedDate) || ""),
      escapeHtml(personName(inspector)),
      statusBadge(prettyLabel(inspection.status), inspectionKind(inspection.status)),
      escapeHtml(inferInspectionTenant(inspection, tenantAssignments)),
      inspection.id
        ? `<a href="${sanitizeReportUrl(`/inspections/${inspection.id}/report`, baseUrl)}" style="color:#00D5CC;font-weight:600;text-decoration:none;">View inspection</a>`
        : "—",
    ];
  });

  const tenantRows = sortedTenants.map((ta) => {
    const lease = assignmentLease(ta);
    const active = isActiveAssignment(ta);
    return [
      stackedCell(tenantDisplayName(ta), tenantEmail(ta)),
      stackedCell(formatDate(lease.start) || "—", formatDate(lease.end) || ""),
      escapeHtml(formatMoney(lease.rent, currency)),
      escapeHtml(formatMoney(lease.deposit, currency)),
      active ? statusBadge("Active", "success") : statusBadge("Previous", "info"),
    ];
  });

  const complianceRows = complianceDocuments.map((doc) => {
    const st = complianceStatus(doc);
    return [
      stackedCell(prettyLabel(doc.documentType), ""),
      escapeHtml(formatDate(doc.createdAt) || "—"),
      escapeHtml(formatDate(doc.expiryDate) || "—"),
      statusBadge(st.label, st.kind),
    ];
  });

  const maintenanceRows = maintenanceRequests.map((req) => {
    const wo = woByRequestId.get(req.id);
    const assignee = assignedUserById.get(req.assignedTo) || null;
    const contractor =
      wo?.contractor?.companyName ||
      [wo?.contractor?.firstName, wo?.contractor?.lastName].filter(Boolean).join(" ") ||
      "";
    const cost =
      wo?.costActual != null && wo.costActual !== ""
        ? formatMoneyCents(wo.costActual, currency)
        : wo?.costEstimate != null && wo.costEstimate !== ""
          ? formatMoneyCents(wo.costEstimate, currency)
          : "—";
    return [
      stackedCell(req.title || "—", prettyLabel(req.source)),
      stackedCell(formatDate(req.createdAt) || "—", formatDate(req.dueDate) || ""),
      statusBadge(prettyLabel(req.status), maintenanceKind(req.status)),
      escapeHtml(personName(assignee)),
      escapeHtml(contractor || "—"),
      escapeHtml(formatDate(wo?.completedAt) || "—"),
      escapeHtml(cost),
    ];
  });

  const disputeRows = disputeItems.map(({ item, report }) => {
    const tenant = report.tenantId ? comparisonTenantsById.get(report.tenantId) : null;
    const desc = [item.sectionRef, item.itemRef, item.fieldKey].filter(Boolean).join(" · ") || "—";
    return [
      stackedCell(desc, item.aiSummary || ""),
      escapeHtml(formatDate(item.disputedAt) || "—"),
      escapeHtml(tenant ? personName(tenant) : "—"),
      statusBadge(prettyLabel(item.status), disputeKind(item.status)),
      escapeHtml(item.disputeReason || "—"),
    ];
  });

  const assetRows = assetInventory.map((asset) => [
    stackedCell(asset.name || "—", asset.category || ""),
    escapeHtml(asset.location || "—"),
    statusBadge(prettyLabel(asset.condition), "info"),
    escapeHtml(formatDate(asset.datePurchased) || "—"),
    escapeHtml(formatDate(asset.warrantyExpiryDate) || "—"),
    escapeHtml(prettyLabel(asset.condition)),
  ]);

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
      <div class="cover-title">Property History Report</div>
      <div class="cover-subtitle">${escapeHtml(propertyTitle)}${propertyAddress ? ` — ${escapeHtml(propertyAddress)}` : ""}</div>
      <div class="cover-meta"><strong>Organization:</strong> ${escapeHtml(displayName)}</div>
      <div class="cover-meta"><strong>Report Date:</strong> ${escapeHtml(reportDate)}</div>
    </div>
    ${contactInfoHtml}
  </div>

  <div class="page">
    <h2 class="section-title">Summary</h2>
    <div class="info-row"><strong>Property:</strong> ${escapeHtml(propertyTitle)}</div>
    <div class="info-row"><strong>Address:</strong> ${escapeHtml(propertyAddress || "—")}</div>
    <div class="info-row" style="margin-bottom: 16px;"><strong>Report Date:</strong> ${escapeHtml(reportDate)}</div>
    <div class="stats-grid cols-6">
      <div class="stat-card"><div class="stat-value">${inspections.length}</div><div class="stat-label">Inspections</div></div>
      <div class="stat-card"><div class="stat-value">${tenantAssignments.length}</div><div class="stat-label">Tenants</div></div>
      <div class="stat-card"><div class="stat-value">${complianceDocuments.length}</div><div class="stat-label">Compliance</div></div>
      <div class="stat-card"><div class="stat-value">${maintenanceRequests.length}</div><div class="stat-label">Maintenance</div></div>
      <div class="stat-card"><div class="stat-value">${disputeItems.length}</div><div class="stat-label">Disputes</div></div>
      <div class="stat-card"><div class="stat-value">${assetInventory.length}</div><div class="stat-label">Assets</div></div>
    </div>
  </div>

  <div class="page compact">
    <h2 class="section-title">Property Overview</h2>
    ${renderTable(
      ["Property", "Type", "Sqft", "Block", "Occupancy", "Created"],
      overviewRows,
      "No property found.",
      ["left", "center", "center", "left", "center", "center"]
    )}
  </div>

  <div class="page compact">
    <h2 class="section-title">Inspection History</h2>
    ${renderTable(
      ["Type", "Dates", "Inspector", "Status", "Tenant", "Report"],
      inspectionRows,
      "No inspections found.",
      ["left", "left", "left", "center", "left", "left"]
    )}
  </div>

  <div class="page compact">
    <h2 class="section-title">Tenant History</h2>
    ${renderTable(
      ["Tenant", "Lease", "Rent", "Deposit", "Status"],
      tenantRows,
      "No tenant assignments found.",
      ["left", "left", "right", "right", "center"]
    )}
  </div>

  <div class="page compact">
    <h2 class="section-title">Compliance History</h2>
    ${renderTable(
      ["Document", "Uploaded", "Expiry", "Status"],
      complianceRows,
      "No compliance documents found.",
      ["left", "center", "center", "center"]
    )}
  </div>

  <div class="page compact">
    <h2 class="section-title">Maintenance History</h2>
    ${renderTable(
      ["Title", "Dates", "Status", "Assigned", "Contractor", "Completed", "Cost"],
      maintenanceRows,
      "No maintenance requests found.",
      ["left", "left", "center", "left", "left", "center", "right"]
    )}
  </div>

  <div class="page compact">
    <h2 class="section-title">Dispute History</h2>
    ${renderTable(
      ["Item", "Disputed", "Tenant", "Status", "Reason"],
      disputeRows,
      "No disputes found.",
      ["left", "center", "left", "center", "left"]
    )}
  </div>

  <div class="page compact">
    <h2 class="section-title">Asset History</h2>
    ${renderTable(
      ["Asset", "Location", "Condition", "Purchased", "Warranty", "Status"],
      assetRows,
      "No assets found.",
      ["left", "left", "center", "center", "center", "center"]
    )}
  </div>
</body>
</html>`;
}
