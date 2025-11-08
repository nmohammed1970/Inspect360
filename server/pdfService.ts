import puppeteer from "puppeteer";
import chromium from "@sparticuz/chromium";
import { format } from "date-fns";

// HTML escape utility to prevent XSS
function escapeHtml(unsafe: string): string {
  if (typeof unsafe !== 'string') return String(unsafe || '');
  
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Sanitize URL for use in HTML attributes (whitelist-based approach)
function sanitizeUrl(url: string, baseUrl?: string): string {
  if (typeof url !== 'string' || !url.trim()) return '';
  
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  
  // Handle relative URLs (convert to absolute using baseUrl)
  if (trimmed.startsWith('/') && baseUrl) {
    const absoluteUrl = `${baseUrl}${trimmed}`;
    return escapeHtml(absoluteUrl);
  }
  
  // Allow only safe protocols via whitelist
  const safeProtocols = ['https://', 'http://'];
  const isSafeProtocol = safeProtocols.some(protocol => lower.startsWith(protocol));
  
  if (!isSafeProtocol) {
    // For data URLs, only allow safe image types (NO SVG - can contain XSS)
    const safeDataImages = [
      'data:image/png',
      'data:image/jpeg',
      'data:image/jpg',
      'data:image/gif',
      'data:image/webp',
    ];
    
    const isSafeDataUrl = safeDataImages.some(prefix => lower.startsWith(prefix));
    
    if (!isSafeDataUrl) {
      // Reject all other protocols/schemes (javascript:, data:image/svg+xml, vbscript:, etc.)
      console.warn(`Blocked potentially unsafe URL: ${url.substring(0, 50)}...`);
      return '';
    }
  }
  
  // Return escaped URL (escape special chars for HTML attribute safety)
  return escapeHtml(trimmed);
}

// Format text while preserving line breaks but escaping dangerous HTML
function formatText(text: string): string {
  if (!text) return '';
  
  // First escape HTML to prevent XSS
  const escaped = escapeHtml(text);
  
  // Convert line breaks to <br> tags for proper display
  const withBreaks = escaped.replace(/\n/g, '<br>');
  
  return withBreaks;
}

interface TemplateField {
  id: string;
  key?: string;
  label: string;
  type: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  validation?: Record<string, any>;
  dependsOn?: Record<string, any>;
  includeCondition?: boolean;
  includeCleanliness?: boolean;
}

interface TemplateSection {
  id: string;
  title: string;
  description?: string;
  repeatable?: boolean;
  fields: TemplateField[];
}

interface Inspection {
  id: string;
  organizationId: string;
  templateId?: string;
  templateSnapshotJson?: { sections: TemplateSection[] };
  propertyId?: string;
  blockId?: string;
  inspectorId: string;
  type: string;
  status: string;
  scheduledDate?: string;
  startedAt?: string;
  completedDate?: string;
  submittedAt?: string;
  notes?: string;
  property?: {
    id: string;
    name: string;
    address: string;
    propertyType?: string;
  };
  block?: {
    id: string;
    name: string;
    address: string;
  };
  inspector?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

interface InspectionEntry {
  id: string;
  inspectionId: string;
  sectionRef: string;
  fieldKey: string;
  value?: any;
  note?: string;
  photos?: string[];
  condition?: string;
  cleanliness?: string;
  markedForReview?: boolean;
}

export async function generateInspectionPDF(
  inspection: Inspection,
  entries: InspectionEntry[],
  baseUrl: string
): Promise<Buffer> {
  const html = generateInspectionHTML(inspection, entries, baseUrl);

  let browser;
  try {
    // Use chromium for serverless environments
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm",
      },
    });

    return Buffer.from(pdf);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function renderFieldValue(value: any, field: TemplateField): string {
  if (value === null || value === undefined || value === "") {
    return '<span style="color: #999;">Not provided</span>';
  }

  try {
    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        // Escape each array item
        const escaped = value.map(v => escapeHtml(String(v)));
        return escaped.length > 0 ? escaped.join(", ") : '<span style="color: #999;">Empty</span>';
      }
      // Escape JSON output
      return `<pre style="background: #f5f5f5; padding: 8px; border-radius: 4px; font-size: 12px; overflow-x: auto;">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
    }

    if (field.type === "checkbox" || field.type === "toggle") {
      return value ? "✓ Yes" : "✗ No";
    }

    if (field.type === "date" && typeof value === "string") {
      try {
        const formatted = format(new Date(value), "PPP");
        return escapeHtml(formatted);
      } catch {
        return escapeHtml(String(value));
      }
    }

    // Escape all string values
    return escapeHtml(String(value));
  } catch (error) {
    console.error("Error rendering field value:", error);
    return escapeHtml(String(value || ""));
  }
}

function generateInspectionHTML(
  inspection: Inspection,
  entries: InspectionEntry[],
  baseUrl: string
): string {
  const templateStructure = inspection.templateSnapshotJson as { sections: TemplateSection[] } | null;
  const sections = templateStructure?.sections || [];

  const propertyName = inspection.property?.name || "Unknown Property";
  const propertyAddress = inspection.property?.address || "No address";
  const inspectorName = inspection.inspector
    ? `${inspection.inspector.firstName || ""} ${inspection.inspector.lastName || ""}`.trim() ||
      inspection.inspector.email
    : "Unknown Inspector";
  const inspectionDate = inspection.completedDate || inspection.scheduledDate || inspection.startedAt;
  const formattedDate = inspectionDate ? format(new Date(inspectionDate), "PPP") : "Not specified";

  // Build entries map
  const entriesMap = new Map<string, InspectionEntry>();
  entries.forEach((entry) => {
    const key = `${entry.sectionRef}-${entry.fieldKey}`;
    entriesMap.set(key, entry);
  });

  // Generate sections HTML
  let sectionsHTML = "";
  sections.forEach((section) => {
    let fieldsHTML = "";
    section.fields.forEach((field) => {
      const key = `${section.id}-${field.key || field.id}`;
      const entry = entriesMap.get(key);

      const value = entry?.value;
      const note = entry?.note;
      const photos = entry?.photos || [];
      const condition = entry?.condition;
      const cleanliness = entry?.cleanliness;

      // Helper function to check if a value is truly empty
      const isEmpty = (val: any): boolean => {
        if (val === null || val === undefined) return true;
        if (typeof val === 'string') return val.trim() === '';
        if (Array.isArray(val)) return val.length === 0;
        if (typeof val === 'object') return Object.keys(val).length === 0;
        if (typeof val === 'boolean') return false; // booleans are always valid
        return false;
      };

      // Skip fields with no data, photos, notes, or ratings
      const hasValue = !isEmpty(value);
      const hasPhotos = photos.length > 0;
      const hasNote = !isEmpty(note);
      const hasCondition = !isEmpty(condition);
      const hasCleanliness = !isEmpty(cleanliness);
      
      if (!hasValue && !hasPhotos && !hasNote && !hasCondition && !hasCleanliness) {
        return; // Skip this field
      }

      fieldsHTML += `
        <div style="margin-bottom: 24px; page-break-inside: avoid;">
          <div style="font-weight: 600; color: #1a1a1a; margin-bottom: 8px;">
            ${escapeHtml(field.label)}
            ${field.required ? '<span style="color: #ef4444;">*</span>' : ''}
          </div>
          ${field.description ? `<div style="color: #666; font-size: 14px; margin-bottom: 8px;">${escapeHtml(field.description)}</div>` : ""}
          
          ${value !== undefined && value !== null && value !== "" ? `
            <div style="color: #333; margin-bottom: 8px;">
              ${renderFieldValue(value, field)}
            </div>
          ` : ""}

          ${condition ? `
            <div style="margin-top: 8px;">
              <span style="font-size: 13px; color: #666;">Condition:</span>
              <span style="display: inline-block; background: #f0fdf4; color: #16a34a; padding: 2px 8px; border-radius: 4px; font-size: 13px; margin-left: 8px;">
                ${escapeHtml(condition)}
              </span>
            </div>
          ` : ""}

          ${cleanliness ? `
            <div style="margin-top: 8px;">
              <span style="font-size: 13px; color: #666;">Cleanliness:</span>
              <span style="display: inline-block; background: #eff6ff; color: #2563eb; padding: 2px 8px; border-radius: 4px; font-size: 13px; margin-left: 8px;">
                ${escapeHtml(cleanliness)}
              </span>
            </div>
          ` : ""}

          ${photos.length > 0 ? `
            <div style="margin-top: 12px;">
              <div style="font-size: 13px; color: #666; margin-bottom: 8px;">Photos (${photos.length}):</div>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px;">
                ${photos.map((photo) => `
                  <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                    <img src="${sanitizeUrl(photo, baseUrl)}" alt="Inspection photo" style="width: 100%; height: 150px; object-fit: cover;" />
                  </div>
                `).join("")}
              </div>
            </div>
          ` : ""}

          ${note ? `
            <div style="margin-top: 12px; background: #fef3c7; border-left: 3px solid #f59e0b; padding: 12px; border-radius: 4px;">
              <div style="font-weight: 500; color: #92400e; margin-bottom: 4px; font-size: 13px;">Note:</div>
              <div style="color: #78350f; font-size: 14px; white-space: pre-wrap;">${formatText(note)}</div>
            </div>
          ` : ""}
        </div>
      `;
    });

    // Only include section if it has fields with data
    if (fieldsHTML.trim()) {
      sectionsHTML += `
        <div style="margin-bottom: 32px; page-break-inside: avoid;">
          <h2 style="font-size: 20px; font-weight: 700; color: #00D5CC; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #00D5CC;">
            ${escapeHtml(section.title)}
          </h2>
          ${section.description ? `<p style="color: #666; margin-bottom: 16px;">${escapeHtml(section.description)}</p>` : ""}
          ${fieldsHTML}
        </div>
      `;
    }
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background: white;
    }

    .container {
      max-width: 100%;
      padding: 0;
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
    }

    .cover-logo {
      font-size: 72px;
      font-weight: 800;
      margin-bottom: 24px;
      letter-spacing: -2px;
    }

    .cover-title {
      font-size: 48px;
      font-weight: 700;
      margin-bottom: 16px;
    }

    .cover-property {
      font-size: 32px;
      font-weight: 400;
      margin-bottom: 48px;
      opacity: 0.95;
    }

    .cover-details {
      font-size: 18px;
      opacity: 0.9;
      margin-top: 24px;
    }

    .header {
      background: white;
      padding: 32px 0;
      border-bottom: 3px solid #00D5CC;
      margin-bottom: 32px;
    }

    .header-title {
      font-size: 32px;
      font-weight: 800;
      color: #00D5CC;
      margin-bottom: 8px;
    }

    .header-subtitle {
      font-size: 24px;
      color: #3B7A8C;
      font-weight: 600;
    }

    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 32px;
      page-break-inside: avoid;
    }

    .info-item {
      background: #f9fafb;
      padding: 16px;
      border-radius: 8px;
      border-left: 4px solid #00D5CC;
    }

    .info-label {
      font-size: 13px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
      font-weight: 600;
    }

    .info-value {
      font-size: 16px;
      color: #1a1a1a;
      font-weight: 500;
    }

    .status-badge {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      background: #dcfce7;
      color: #166534;
    }

    @media print {
      .page-break {
        page-break-before: always;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Cover Page -->
    <div class="cover-page">
      <div class="cover-logo">INSPECT360</div>
      <div class="cover-title">Inspection Report</div>
      <div class="cover-property">${escapeHtml(propertyName)}</div>
      <div class="cover-details">
        <div>${escapeHtml(formattedDate)}</div>
        <div style="margin-top: 8px;">${escapeHtml(inspection.type.charAt(0).toUpperCase() + inspection.type.slice(1).replace(/_/g, " "))}</div>
      </div>
    </div>

    <!-- Main Content -->
    <div style="padding: 0;">
      <div class="header">
        <div class="header-title">Inspection Report</div>
        <div class="header-subtitle">${escapeHtml(propertyName)}</div>
      </div>

      <!-- Property Information -->
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Property Address</div>
          <div class="info-value">${escapeHtml(propertyAddress)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Inspection Type</div>
          <div class="info-value">${escapeHtml(inspection.type.charAt(0).toUpperCase() + inspection.type.slice(1).replace(/_/g, " "))}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Inspector</div>
          <div class="info-value">${escapeHtml(inspectorName)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Inspection Date</div>
          <div class="info-value">${escapeHtml(formattedDate)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Status</div>
          <div class="info-value">
            <span class="status-badge">${escapeHtml(inspection.status.toUpperCase())}</span>
          </div>
        </div>
        ${inspection.notes ? `
          <div class="info-item" style="grid-column: 1 / -1;">
            <div class="info-label">General Notes</div>
            <div class="info-value">${escapeHtml(inspection.notes)}</div>
          </div>
        ` : ""}
      </div>

      <!-- Inspection Sections -->
      ${sectionsHTML}
    </div>
  </div>
</body>
</html>
  `;
}
