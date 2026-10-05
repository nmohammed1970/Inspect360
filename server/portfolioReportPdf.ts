/**
 * Landscape portfolio PDF — mirrors the comprehensive Excel workbook sheets.
 * Theme matches dashboard report (teal #00D5CC → slate #3B7A8C).
 */

import { getCurrencyForCountry } from "@shared/countryUtils";
import {
  type LandscapeReportBranding,
  escapeHtml,
  formatDate,
  formatMoney,
  sharedCss,
  stackedCell,
  renderTable,
  statusBadge,
  buildCoverChrome,
} from "./reportPdfShared";

export type PortfolioReportBranding = LandscapeReportBranding;

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

  const { displayName, companyNameHtml, logoHtml, contactInfoHtml } = await buildCoverChrome({
    organizationName,
    branding,
    baseUrl,
  });

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
