import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

// Detect if running in Replit or serverless environment
const isReplit = process.env.REPL_ID || process.env.REPLIT;
const isServerless = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL || process.env.NETLIFY;
const useChromium = isReplit || isServerless;
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

// Get condition score (5 = best, 1 = worst)
function getConditionScore(condition: string | null | undefined): number | null {
  if (!condition) return null;
  const lower = condition.toLowerCase();
  if (lower === 'new' || lower === 'excellent') return 5;
  if (lower === 'good') return 4;
  if (lower === 'fair') return 3;
  if (lower === 'poor') return 2;
  if (lower === 'very poor') return 1;
  return null;
}

// Get cleanliness score (5 = best, 1 = worst)
function getCleanlinessScore(cleanliness: string | null | undefined): number | null {
  if (!cleanliness) return null;
  const lower = cleanliness.toLowerCase();
  if (lower === 'excellent') return 5;
  if (lower === 'good') return 4;
  if (lower === 'fair') return 3;
  if (lower === 'poor') return 2;
  if (lower === 'very poor') return 1;
  return null;
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

interface TrademarkInfo {
  imageUrl: string;
  altText?: string | null;
}

interface BrandingInfo {
  logoUrl?: string | null;
  trademarkUrl?: string | null;
  trademarks?: TrademarkInfo[];
  brandingName?: string | null;
  brandingEmail?: string | null;
  brandingPhone?: string | null;
  brandingAddress?: string | null;
  brandingWebsite?: string | null;
}

interface MaintenanceRequest {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  category?: string;
  createdAt: Date;
}

interface ReportConfig {
  showCover?: boolean;
  showContentsPage?: boolean;
  showTradeMarks?: boolean;
  showGlossary?: boolean;
  showMaintenanceLog?: boolean;
  showInspection?: boolean;
  showInventory?: boolean;
  showTermsConditions?: boolean;
  showClosingSection?: boolean;
}

export async function generateInspectionPDF(
  inspection: Inspection,
  entries: InspectionEntry[],
  baseUrl: string,
  branding?: BrandingInfo,
  maintenanceRequests?: MaintenanceRequest[],
  reportConfig?: ReportConfig
): Promise<Buffer> {
  const html = generateInspectionHTML(inspection, entries, baseUrl, branding, maintenanceRequests, reportConfig);

  let browser;
  try {
    // Use @sparticuz/chromium for Replit and serverless environments
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: {
        top: "15mm",
        right: "12mm",
        bottom: "15mm",
        left: "12mm",
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
  baseUrl: string,
  branding?: BrandingInfo,
  maintenanceRequests?: MaintenanceRequest[],
  reportConfig?: ReportConfig
): string {
  // Default all report sections to true if not specified
  const config: Required<ReportConfig> = {
    showCover: reportConfig?.showCover ?? true,
    showContentsPage: reportConfig?.showContentsPage ?? true,
    showTradeMarks: reportConfig?.showTradeMarks ?? true,
    showGlossary: reportConfig?.showGlossary ?? true,
    showMaintenanceLog: reportConfig?.showMaintenanceLog ?? true,
    showInspection: reportConfig?.showInspection ?? true,
    showInventory: reportConfig?.showInventory ?? true,
    showTermsConditions: reportConfig?.showTermsConditions ?? true,
    showClosingSection: reportConfig?.showClosingSection ?? true,
  };
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
  
  const companyName = branding?.brandingName || "Inspect360";
  const hasLogo = !!branding?.logoUrl;
  const logoHtml = hasLogo
    ? `<img src="${sanitizeUrl(branding.logoUrl)}" alt="${escapeHtml(companyName)}" class="cover-logo-img" />`
    : `<div class="cover-logo-text">${escapeHtml(companyName)}</div>`;
  
  const companyNameHtml = hasLogo 
    ? `<div class="cover-company-name">${escapeHtml(companyName)}</div>` 
    : '';
  
  const contactParts: string[] = [];
  if (branding?.brandingEmail) contactParts.push(escapeHtml(branding.brandingEmail));
  if (branding?.brandingPhone) contactParts.push(escapeHtml(branding.brandingPhone));
  if (branding?.brandingWebsite) contactParts.push(escapeHtml(branding.brandingWebsite));
  
  const contactInfoHtml = contactParts.length > 0
    ? `<div class="cover-contact">${contactParts.join(' &nbsp;|&nbsp; ')}</div>`
    : '';

  // Trademark HTML for cover page - supports multiple trademarks in a row
  const trademarksList = branding?.trademarks || [];
  const hasLegacyTrademark = !!branding?.trademarkUrl;
  const hasNewTrademarks = trademarksList.length > 0;
  
  let trademarkHtml = '';
  if (hasNewTrademarks) {
    // Display multiple trademarks in a horizontal row
    const trademarkImages = trademarksList.map(tm => 
      `<img src="${sanitizeUrl(tm.imageUrl)}" alt="${escapeHtml(tm.altText || 'Certification')}" class="cover-trademark-img" />`
    ).join('');
    trademarkHtml = `<div class="cover-trademarks-row">${trademarkImages}</div>`;
  } else if (hasLegacyTrademark) {
    // Fallback to legacy single trademark
    trademarkHtml = `<div class="cover-trademark"><img src="${sanitizeUrl(branding.trademarkUrl!)}" alt="Certification" class="cover-trademark-img" /></div>`;
  }

  // Build entries map
  const entriesMap = new Map<string, InspectionEntry>();
  entries.forEach((entry) => {
    const key = `${entry.sectionRef}-${entry.fieldKey}`;
    entriesMap.set(key, entry);
  });

  // Helper function to get rating color based on score
  const getRatingColor = (score: number | null): string => {
    if (score === null) return '#999';
    if (score >= 5) return '#16a34a'; // Excellent - green
    if (score >= 4) return '#22c55e'; // Good - green
    if (score >= 3) return '#f59e0b'; // Fair - amber
    if (score >= 2) return '#ef4444'; // Poor - red
    return '#dc2626'; // Very Poor - dark red
  };

  // Helper to format rating with dot indicator
  const formatRating = (value: string | null | undefined, score: number | null): string => {
    if (!value || score === null) return '<span style="color: #999;">-</span>';
    const color = getRatingColor(score);
    return `<span style="display: inline-flex; align-items: center; gap: 6px;">
      <span style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span>
      <span style="color: ${color};">${escapeHtml(value)} (${score})</span>
    </span>`;
  };

  // Generate sections HTML - Table format matching UI
  let sectionsHTML = "";
  sections.forEach((section, sectionIndex) => {
    // First pass: determine if section has condition/cleanliness columns
    let sectionHasCondition = false;
    let sectionHasCleanliness = false;
    
    section.fields.forEach((field) => {
      if (field.includeCondition) sectionHasCondition = true;
      if (field.includeCleanliness) sectionHasCleanliness = true;
    });

    // Build table rows for ALL fields (even empty ones)
    let tableRowsHTML = '';
    let photosGalleryHTML = '';
    let fieldCounter = 0;

    section.fields.forEach((field) => {
      fieldCounter++;
      // Use field.id first (matching frontend logic), then fall back to field.key
      const fieldKey = field.id || field.key || field.label;
      const key = `${section.id}-${fieldKey}`;
      const entry = entriesMap.get(key);

      // Extract data from entry - condition/cleanliness are stored inside valueJson
      const valueJson = entry?.valueJson;
      const note = entry?.note;
      const photos = entry?.photos || [];
      const fieldRef = `${sectionIndex + 1}.${fieldCounter}`;

      // Parse valueJson to extract condition, cleanliness, and value
      let condition: string | null = null;
      let cleanliness: string | null = null;
      let description: string | null = null;

      if (valueJson !== undefined && valueJson !== null) {
        if (typeof valueJson === 'object' && !Array.isArray(valueJson)) {
          // Extract from structured object (for fields with condition/cleanliness)
          condition = valueJson.condition || null;
          cleanliness = valueJson.cleanliness || null;
          description = valueJson.value || null;
        } else if (typeof valueJson === 'string') {
          description = valueJson;
        } else if (typeof valueJson === 'boolean') {
          description = valueJson ? 'Yes' : 'No';
        } else {
          description = String(valueJson);
        }
      }

      // Get scores for ratings
      const conditionScore = getConditionScore(condition);
      const cleanlinessScore = getCleanlinessScore(cleanliness);
      const photoCount = photos.length;

      // Determine description value
      let descriptionValue = '-';
      if (description !== null && description !== '') {
        if (typeof description === 'string') {
          descriptionValue = description.length > 50 ? description.substring(0, 50) + '...' : description;
        } else {
          descriptionValue = String(description);
        }
      }

      tableRowsHTML += `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #00D5CC; font-weight: 500;">
            ${escapeHtml(field.label)}
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #666;">
            ${escapeHtml(descriptionValue)}
          </td>
          ${sectionHasCondition ? `
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: center;">
              ${field.includeCondition && condition ? formatRating(condition, conditionScore) : '<span style="color: #999;">-</span>'}
            </td>
          ` : ''}
          ${sectionHasCleanliness ? `
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: center;">
              ${field.includeCleanliness && cleanliness ? formatRating(cleanliness, cleanlinessScore) : '<span style="color: #999;">-</span>'}
            </td>
          ` : ''}
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: center;">
            ${photoCount > 0 ? `<span style="color: #00D5CC; font-weight: 500;">${photoCount} photo${photoCount > 1 ? 's' : ''}</span>` : '<span style="color: #999;">-</span>'}
          </td>
        </tr>
      `;

      // Add note row if exists
      if (note) {
        const colspan = 2 + (sectionHasCondition ? 1 : 0) + (sectionHasCleanliness ? 1 : 0) + 1;
        tableRowsHTML += `
          <tr>
            <td colspan="${colspan}" style="padding: 8px 16px; border-bottom: 1px solid #e5e7eb; background: #fef3c7;">
              <div style="display: flex; align-items: flex-start; gap: 8px;">
                <span style="font-weight: 500; color: #92400e; font-size: 13px;">Note:</span>
                <span style="color: #78350f; font-size: 13px;">${formatText(note)}</span>
              </div>
            </td>
          </tr>
        `;
      }

      // Build photo gallery for this field (matching UI layout)
      if (photoCount > 0) {
        photosGalleryHTML += `
          <div style="margin-top: 20px; page-break-inside: avoid;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; padding-left: 4px;">
              <span style="font-size: 16px;">&#128247;</span>
              <span style="font-weight: 600; color: #333; font-size: 15px;">${escapeHtml(field.label)} Photos</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 20px;">
              ${photos.map((photo, photoIndex) => `
                <div style="width: 300px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: white;">
                  <div style="height: 200px; background: #f9fafb; position: relative;">
                    <img src="${sanitizeUrl(photo, baseUrl)}" alt="Photo" style="width: 100%; height: 100%; object-fit: cover;" />
                  </div>
                  <table style="width: 100%; border-collapse: collapse; font-size: 12px; border-top: 1px solid #e5e7eb;">
                    <tr>
                      <td style="padding: 8px 12px; color: #666; width: 60%;">Provided by</td>
                      <td style="padding: 8px 12px; color: #333; font-weight: 500; text-align: right;">Inspector</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 12px; color: #666;">Captured (Certified by inspector)</td>
                      <td style="padding: 8px 12px; color: #333; font-weight: 500; text-align: right;">${escapeHtml(formattedDate)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 12px; color: #666;">Added</td>
                      <td style="padding: 8px 12px; color: #333; font-weight: 500; text-align: right;">${escapeHtml(formattedDate)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 12px; color: #666;">Reference</td>
                      <td style="padding: 8px 12px; color: #333; font-weight: 500; text-align: right;">${fieldRef}.${photoIndex + 1}</td>
                    </tr>
                  </table>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    });

    // Build section HTML with table format - always include all sections
    sectionsHTML += `
      <div style="margin-bottom: 32px; page-break-inside: avoid;">
        <h2 style="font-size: 18px; font-weight: 700; color: #1a1a1a; margin-bottom: 16px;">
          ${escapeHtml(section.title)}
        </h2>
        ${section.description ? `<p style="color: #666; margin-bottom: 12px; font-size: 14px;">${escapeHtml(section.description)}</p>` : ""}
        
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 12px 16px; text-align: left; font-weight: 500; color: #666; font-size: 13px; border-bottom: 1px solid #e5e7eb;">Room/Space</th>
              <th style="padding: 12px 16px; text-align: left; font-weight: 500; color: #666; font-size: 13px; border-bottom: 1px solid #e5e7eb;">Description</th>
              ${sectionHasCondition ? '<th style="padding: 12px 16px; text-align: center; font-weight: 500; color: #666; font-size: 13px; border-bottom: 1px solid #e5e7eb;">Condition</th>' : ''}
              ${sectionHasCleanliness ? '<th style="padding: 12px 16px; text-align: center; font-weight: 500; color: #666; font-size: 13px; border-bottom: 1px solid #e5e7eb;">Cleanliness</th>' : ''}
              <th style="padding: 12px 16px; text-align: center; font-weight: 500; color: #666; font-size: 13px; border-bottom: 1px solid #e5e7eb;">Photos</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHTML}
          </tbody>
        </table>

        ${photosGalleryHTML}
      </div>
    `;
  });

  // Build cover page HTML conditionally
  const coverPageHTML = config.showCover ? `
    <!-- Cover Page -->
    <div class="cover-page">
      ${config.showTradeMarks ? trademarkHtml : ''}
      <div class="cover-content">
        <div class="cover-logo-container">
          ${logoHtml}
          ${companyNameHtml}
        </div>
        <div class="cover-divider"></div>
        <div class="cover-title">Inspection Report</div>
        <div class="cover-property">${escapeHtml(propertyName)}</div>
        <div class="cover-details">
          <div class="cover-detail-item">
            <span>${escapeHtml(formattedDate)}</span>
          </div>
          <div class="cover-detail-item">
            <span>${escapeHtml(inspection.type.charAt(0).toUpperCase() + inspection.type.slice(1).replace(/_/g, " "))}</span>
          </div>
        </div>
      </div>
      ${contactInfoHtml}
    </div>
  ` : '';

  // Build glossary HTML conditionally
  const glossaryHTML = config.showGlossary ? `
    <!-- Glossary of Terms - Landscape optimized 2-column layout -->
    <div style="margin-bottom: 32px; page-break-inside: avoid;">
      <h2 style="font-size: 18px; font-weight: 700; color: #1a1a1a; margin-bottom: 16px; border-bottom: 2px solid #00D5CC; padding-bottom: 8px;">
        Glossary of Terms
      </h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
        <!-- Condition Ratings -->
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb;">
          <h3 style="font-size: 14px; font-weight: 600; color: #3B7A8C; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
            Condition Ratings
          </h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tbody>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; width: 40%;">
                  <span style="display: inline-flex; align-items: center; gap: 8px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #16a34a;"></span>
                    <strong style="color: #16a34a;">Excellent (5)</strong>
                  </span>
                </td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #666; font-size: 13px;">
                  New or like-new condition, no visible wear or damage
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                  <span style="display: inline-flex; align-items: center; gap: 8px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #22c55e;"></span>
                    <strong style="color: #22c55e;">Good (4)</strong>
                  </span>
                </td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #666; font-size: 13px;">
                  Minor wear consistent with normal use, fully functional
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                  <span style="display: inline-flex; align-items: center; gap: 8px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #f59e0b;"></span>
                    <strong style="color: #f59e0b;">Fair (3)</strong>
                  </span>
                </td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #666; font-size: 13px;">
                  Moderate wear or minor damage, may need attention soon
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                  <span style="display: inline-flex; align-items: center; gap: 8px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #ef4444;"></span>
                    <strong style="color: #ef4444;">Poor (2)</strong>
                  </span>
                </td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #666; font-size: 13px;">
                  Significant wear or damage, requires repair or replacement
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0;">
                  <span style="display: inline-flex; align-items: center; gap: 8px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #dc2626;"></span>
                    <strong style="color: #dc2626;">Very Poor (1)</strong>
                  </span>
                </td>
                <td style="padding: 8px 0; color: #666; font-size: 13px;">
                  Severe damage or unusable, immediate action required
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- Cleanliness Ratings -->
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb;">
          <h3 style="font-size: 14px; font-weight: 600; color: #3B7A8C; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
            Cleanliness Ratings
          </h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tbody>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; width: 40%;">
                  <span style="display: inline-flex; align-items: center; gap: 8px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #16a34a;"></span>
                    <strong style="color: #16a34a;">Excellent (5)</strong>
                  </span>
                </td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #666; font-size: 13px;">
                  Professionally cleaned, spotless condition
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                  <span style="display: inline-flex; align-items: center; gap: 8px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #22c55e;"></span>
                    <strong style="color: #22c55e;">Good (4)</strong>
                  </span>
                </td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #666; font-size: 13px;">
                  Clean with minor dust or marks, easily tidied
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                  <span style="display: inline-flex; align-items: center; gap: 8px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #f59e0b;"></span>
                    <strong style="color: #f59e0b;">Fair (3)</strong>
                  </span>
                </td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #666; font-size: 13px;">
                  Needs cleaning, visible dirt or stains present
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                  <span style="display: inline-flex; align-items: center; gap: 8px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #ef4444;"></span>
                    <strong style="color: #ef4444;">Poor (2)</strong>
                  </span>
                </td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #666; font-size: 13px;">
                  Significant cleaning required, heavy soiling
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0;">
                  <span style="display: inline-flex; align-items: center; gap: 8px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #dc2626;"></span>
                    <strong style="color: #dc2626;">Very Poor (1)</strong>
                  </span>
                </td>
                <td style="padding: 8px 0; color: #666; font-size: 13px;">
                  Unsanitary conditions, professional cleaning needed
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ` : '';

  // Build maintenance log HTML conditionally
  const maintenanceLogHTML = config.showMaintenanceLog && maintenanceRequests && maintenanceRequests.length > 0 ? `
    <!-- Outstanding Maintenance Requests -->
    <div style="margin-bottom: 32px; page-break-inside: avoid;">
      <h2 style="font-size: 18px; font-weight: 700; color: #1a1a1a; margin-bottom: 16px;">
        Outstanding Maintenance Requests
      </h2>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 12px 16px; text-align: left; font-weight: 500; color: #666; font-size: 13px; border-bottom: 1px solid #e5e7eb;">Title</th>
            <th style="padding: 12px 16px; text-align: left; font-weight: 500; color: #666; font-size: 13px; border-bottom: 1px solid #e5e7eb;">Category</th>
            <th style="padding: 12px 16px; text-align: center; font-weight: 500; color: #666; font-size: 13px; border-bottom: 1px solid #e5e7eb;">Priority</th>
            <th style="padding: 12px 16px; text-align: center; font-weight: 500; color: #666; font-size: 13px; border-bottom: 1px solid #e5e7eb;">Status</th>
            <th style="padding: 12px 16px; text-align: right; font-weight: 500; color: #666; font-size: 13px; border-bottom: 1px solid #e5e7eb;">Created</th>
          </tr>
        </thead>
        <tbody>
          ${maintenanceRequests.map(req => {
            const priorityColor = req.priority === 'urgent' || req.priority === 'high' ? '#ef4444' : 
                                  req.priority === 'medium' ? '#f59e0b' : '#22c55e';
            const statusColor = req.status === 'open' || req.status === 'pending' ? '#f59e0b' :
                               req.status === 'in_progress' ? '#3b82f6' :
                               req.status === 'completed' ? '#22c55e' : '#666';
            return `
              <tr>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #333; font-weight: 500;">
                  ${escapeHtml(req.title)}
                </td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #666;">
                  ${escapeHtml(req.category || '-')}
                </td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: center;">
                  <span style="display: inline-flex; align-items: center; gap: 6px;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: ${priorityColor};"></span>
                    <span style="color: ${priorityColor}; text-transform: capitalize;">${escapeHtml(req.priority || 'Normal')}</span>
                  </span>
                </td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: center;">
                  <span style="color: ${statusColor}; text-transform: capitalize;">${escapeHtml(req.status.replace(/_/g, ' '))}</span>
                </td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #666;">
                  ${format(new Date(req.createdAt), "MMM d, yyyy")}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

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

    /* Cover Page - Landscape optimized */
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
      margin-bottom: 40px;
    }

    .cover-logo-img {
      max-height: 120px;
      max-width: 320px;
      width: auto;
      height: auto;
      object-fit: contain;
      filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
    }

    .cover-logo-text {
      font-size: 64px;
      font-weight: 800;
      letter-spacing: -2px;
      text-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .cover-company-name {
      font-size: 28px;
      font-weight: 600;
      margin-top: 16px;
      opacity: 0.95;
      letter-spacing: 1px;
    }

    .cover-divider {
      width: 120px;
      height: 3px;
      background: rgba(255, 255, 255, 0.5);
      margin: 32px 0;
      border-radius: 2px;
    }

    .cover-title {
      font-size: 42px;
      font-weight: 700;
      margin-bottom: 12px;
      letter-spacing: 0.5px;
    }

    .cover-property {
      font-size: 28px;
      font-weight: 400;
      margin-bottom: 32px;
      opacity: 0.95;
      max-width: 80%;
    }

    .cover-details {
      display: flex;
      gap: 32px;
      font-size: 16px;
      opacity: 0.9;
    }

    .cover-detail-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cover-contact {
      position: absolute;
      bottom: 40px;
      font-size: 14px;
      opacity: 0.8;
      z-index: 1;
    }

    .cover-trademark {
      position: absolute;
      top: 40px;
      right: 40px;
      z-index: 1;
    }

    .cover-trademarks-row {
      position: absolute;
      top: 40px;
      right: 40px;
      z-index: 1;
      display: flex;
      flex-direction: row;
      gap: 16px;
      align-items: center;
    }

    .cover-trademark-img {
      max-height: 80px;
      max-width: 120px;
      width: auto;
      height: auto;
      object-fit: contain;
      filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.2));
    }

    /* Header for content pages */
    .header {
      background: white;
      padding: 24px 0;
      border-bottom: 3px solid #00D5CC;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-title {
      font-size: 28px;
      font-weight: 800;
      color: #00D5CC;
    }

    .header-subtitle {
      font-size: 20px;
      color: #3B7A8C;
      font-weight: 600;
    }

    /* Info grid - Landscape optimized for 3 columns */
    .info-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
      page-break-inside: avoid;
    }

    .info-item {
      background: #f9fafb;
      padding: 14px 16px;
      border-radius: 8px;
      border-left: 4px solid #00D5CC;
    }

    .info-item.full-width {
      grid-column: 1 / -1;
    }

    .info-label {
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
      font-weight: 600;
    }

    .info-value {
      font-size: 15px;
      color: #1a1a1a;
      font-weight: 500;
    }

    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 13px;
      font-weight: 600;
      background: #dcfce7;
      color: #166534;
    }

    /* Section styles - Landscape optimized */
    .section {
      margin-bottom: 28px;
      page-break-inside: avoid;
    }

    .section-title {
      font-size: 18px;
      font-weight: 700;
      color: #00D5CC;
      margin-bottom: 14px;
      padding-bottom: 8px;
      border-bottom: 2px solid #00D5CC;
    }

    /* Photo grid - Landscape optimized for more columns */
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
    }

    .photo-item {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }

    .photo-item img {
      width: 100%;
      height: 140px;
      object-fit: cover;
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
    ${coverPageHTML}

    <!-- Main Content -->
    <div style="padding: 0;">
      <div class="header">
        <div>
          <div class="header-title">Inspection Report</div>
          <div class="header-subtitle">${escapeHtml(propertyName)}</div>
        </div>
        <div style="text-align: right; color: #666; font-size: 13px;">
          <div>${escapeHtml(formattedDate)}</div>
        </div>
      </div>

      <!-- Property Information - 3 column grid for landscape -->
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
          <div class="info-label">Status</div>
          <div class="info-value">
            <span class="status-badge">${escapeHtml(inspection.status.toUpperCase())}</span>
          </div>
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
          <div class="info-label">Report Generated</div>
          <div class="info-value">${format(new Date(), "PPP")}</div>
        </div>
        ${inspection.notes ? `
          <div class="info-item full-width">
            <div class="info-label">General Notes</div>
            <div class="info-value">${escapeHtml(inspection.notes)}</div>
          </div>
        ` : ""}
      </div>

      ${glossaryHTML}

      ${maintenanceLogHTML}

      <!-- Inspection Sections -->
      ${config.showInspection ? sectionsHTML : ''}
    </div>
  </div>
</body>
</html>
  `;
}
